"use server";

import { FieldValue } from "firebase-admin/firestore";
import { adminDb } from "@/lib/firebase/admin";
import { obtenerUsuarioSesion } from "@/lib/firebase/sesion";
import { planAnticipoSaldo, planCuotasIguales, type LineaPlan } from "@/lib/reglas/planCobro";
import type { Cuota, Presupuesto } from "@/lib/tipos";
import type { ResultadoAccion, ResultadoPago } from "@/lib/acciones/cuentaCorriente";
import {
  ErrorSaldoAFavor,
  ErrorValidacion,
  fmtMonto,
  mensajeError,
  registrarPagoEnTx,
} from "@/lib/acciones/cuentaCorrienteTx";

export type TipoPlan = "anticipoSaldo" | "cuotasIguales";

export interface DatosGenerarPlan {
  presupuestoId: string;
  tipo: TipoPlan;
  /** Requerido para "anticipoSaldo": porcentaje del anticipo (0 < p < 100). */
  porcentajeAnticipo?: number;
  /** Requerido para "cuotasIguales": cantidad de cuotas (entero ≥ 1). */
  cantidad?: number;
  /** Fecha de la primera cuota (ISO "YYYY-MM-DD"). */
  fechaInicial: string;
  /** Días entre cuotas; default 30. */
  intervaloDias?: number;
}

export interface DatosCrearCuota {
  presupuestoId: string;
  concepto: string;
  monto: number;
  venceEl: string;
  notas?: string;
}

export interface DatosActualizarCuota {
  cuotaId: string;
  concepto: string;
  monto: number;
  venceEl: string;
  notas?: string;
}

export interface DatosPagoCuota {
  cuotaId: string;
  medioPago?: string;
  referencia?: string;
  permitirSaldoAFavor?: boolean;
}

async function requerirUsuario() {
  const usuario = await obtenerUsuarioSesion();
  if (!usuario) throw new ErrorValidacion("No autenticado");
  return usuario;
}

/** Interpreta una fecha "YYYY-MM-DD" a mediodía local (evita corrimientos de zona). */
function parseFecha(fecha: string): Date {
  const valor = new Date(`${fecha}T12:00:00`);
  if (Number.isNaN(valor.getTime())) throw new ErrorValidacion("Fecha de vencimiento inválida");
  return valor;
}

function fechaConOffset(base: Date, dias: number): Date {
  const d = new Date(base);
  d.setDate(d.getDate() + dias);
  return d;
}

/** Lee el presupuesto y valida que sea una obra confirmada donde tenga sentido planificar cobros. */
async function presupuestoConfirmado(presupuestoId: string): Promise<Presupuesto> {
  const snap = await adminDb.collection("presupuestos").doc(presupuestoId).get();
  if (!snap.exists) throw new ErrorValidacion("Presupuesto no encontrado");
  const presupuesto = snap.data() as Presupuesto;
  if (presupuesto.esLegado) {
    throw new ErrorValidacion("Un presupuesto legado no admite plan de cobro");
  }
  if (presupuesto.estado !== "Confirmado") {
    throw new ErrorValidacion("El plan de cobro es para presupuestos confirmados");
  }
  return presupuesto;
}

/**
 * Genera un plan de cobro (anticipo+saldo o N cuotas iguales) para un presupuesto
 * confirmado. Rechaza si ya hay cuotas activas para no duplicar planes. Las cuotas
 * son planificación: no tocan saldo ni movimientos.
 */
export async function generarPlan(datos: DatosGenerarPlan): Promise<ResultadoAccion> {
  try {
    const usuario = await requerirUsuario();
    const base = parseFecha(datos.fechaInicial);
    const intervalo =
      datos.intervaloDias === undefined ? 30 : Math.trunc(datos.intervaloDias);
    if (!(intervalo >= 0)) throw new ErrorValidacion("El intervalo debe ser positivo");

    if (datos.tipo === "anticipoSaldo" && datos.porcentajeAnticipo === undefined) {
      throw new ErrorValidacion("Falta el porcentaje de anticipo");
    }
    if (datos.tipo === "cuotasIguales" && datos.cantidad === undefined) {
      throw new ErrorValidacion("Falta la cantidad de cuotas");
    }

    const presupuesto = await presupuestoConfirmado(datos.presupuestoId);

    // Los generadores validan porcentaje/cantidad y el total en un solo lugar.
    let lineas: LineaPlan[];
    if (datos.tipo === "anticipoSaldo") {
      lineas = planAnticipoSaldo(presupuesto.total, datos.porcentajeAnticipo!);
    } else if (datos.tipo === "cuotasIguales") {
      lineas = planCuotasIguales(presupuesto.total, datos.cantidad!);
    } else {
      throw new ErrorValidacion("Tipo de plan inválido");
    }

    const activasSnap = await adminDb
      .collection("cuotas")
      .where("presupuestoId", "==", datos.presupuestoId)
      .get();
    const hayActivas = activasSnap.docs.some((d) => (d.data() as Cuota).estado !== "Anulada");
    if (hayActivas) {
      throw new ErrorValidacion(
        "Este presupuesto ya tiene un plan de cobro. Anulá las cuotas pendientes antes de generar otro.",
      );
    }

    const ahora = FieldValue.serverTimestamp();
    const batch = adminDb.batch();
    for (const linea of lineas) {
      const venceEl = fechaConOffset(base, (linea.orden - 1) * intervalo);
      const ref = adminDb.collection("cuotas").doc();
      batch.set(ref, {
        obraCodigo: presupuesto.obraCodigo,
        presupuestoId: datos.presupuestoId,
        clienteId: presupuesto.clienteId,
        clienteNombre: presupuesto.clienteNombre,
        concepto: linea.concepto,
        monto: linea.monto,
        venceEl,
        estado: "Pendiente",
        movimientoId: null,
        orden: linea.orden,
        notas: "",
        creadoPor: usuario.uid,
        creadoEn: ahora,
        actualizadoEn: ahora,
      });
    }
    await batch.commit();
    return { ok: true };
  } catch (err) {
    return { ok: false, error: mensajeError(err) };
  }
}

/** Agrega una cuota manual a un presupuesto confirmado (orden al final del plan). */
export async function crearCuota(datos: DatosCrearCuota): Promise<ResultadoAccion> {
  try {
    const usuario = await requerirUsuario();
    const concepto = datos.concepto.trim();
    if (!concepto) throw new ErrorValidacion("Ingresá un concepto");
    if (!(datos.monto > 0)) throw new ErrorValidacion("El monto debe ser mayor a cero");
    const venceEl = parseFecha(datos.venceEl);

    const presupuesto = await presupuestoConfirmado(datos.presupuestoId);

    const existentesSnap = await adminDb
      .collection("cuotas")
      .where("presupuestoId", "==", datos.presupuestoId)
      .get();
    const maxOrden = existentesSnap.docs.reduce(
      (max, d) => Math.max(max, (d.data() as Cuota).orden ?? 0),
      0,
    );

    const ahora = FieldValue.serverTimestamp();
    await adminDb.collection("cuotas").add({
      obraCodigo: presupuesto.obraCodigo,
      presupuestoId: datos.presupuestoId,
      clienteId: presupuesto.clienteId,
      clienteNombre: presupuesto.clienteNombre,
      concepto,
      monto: datos.monto,
      venceEl,
      estado: "Pendiente",
      movimientoId: null,
      orden: maxOrden + 1,
      notas: datos.notas?.trim() ?? "",
      creadoPor: usuario.uid,
      creadoEn: ahora,
      actualizadoEn: ahora,
    });
    return { ok: true };
  } catch (err) {
    return { ok: false, error: mensajeError(err) };
  }
}

/** Edita una cuota pendiente. Una cuota cobrada no se edita (anulá el pago primero). */
export async function actualizarCuota(datos: DatosActualizarCuota): Promise<ResultadoAccion> {
  try {
    await requerirUsuario();
    const concepto = datos.concepto.trim();
    if (!concepto) throw new ErrorValidacion("Ingresá un concepto");
    if (!(datos.monto > 0)) throw new ErrorValidacion("El monto debe ser mayor a cero");
    const venceEl = parseFecha(datos.venceEl);

    const cuotaRef = adminDb.collection("cuotas").doc(datos.cuotaId);
    const snap = await cuotaRef.get();
    if (!snap.exists) throw new ErrorValidacion("Cuota no encontrada");
    if ((snap.data() as Cuota).estado !== "Pendiente") {
      throw new ErrorValidacion("Solo se puede editar una cuota pendiente");
    }

    await cuotaRef.update({
      concepto,
      monto: datos.monto,
      venceEl,
      notas: datos.notas?.trim() ?? "",
      actualizadoEn: FieldValue.serverTimestamp(),
    });
    return { ok: true };
  } catch (err) {
    return { ok: false, error: mensajeError(err) };
  }
}

/** Anula una cuota pendiente (planificación descartada; deja rastro, no borra). */
export async function anularCuota(cuotaId: string): Promise<ResultadoAccion> {
  try {
    await requerirUsuario();
    const cuotaRef = adminDb.collection("cuotas").doc(cuotaId);
    const snap = await cuotaRef.get();
    if (!snap.exists) throw new ErrorValidacion("Cuota no encontrada");
    if ((snap.data() as Cuota).estado !== "Pendiente") {
      throw new ErrorValidacion("Solo se puede anular una cuota pendiente");
    }

    await cuotaRef.update({
      estado: "Anulada",
      actualizadoEn: FieldValue.serverTimestamp(),
    });
    return { ok: true };
  } catch (err) {
    return { ok: false, error: mensajeError(err) };
  }
}

/**
 * Registra el pago de una cuota reutilizando el núcleo contable existente: en la
 * MISMA transacción inserta el movimiento PAGO (descuenta saldo) y marca la cuota
 * Cobrada con el `movimientoId`. Atómico: o pasa todo, o no pasa nada. Anular ese
 * pago (flujo existente de `anularPago`) revierte la cuota a Pendiente.
 */
export async function registrarPagoDeCuota(datos: DatosPagoCuota): Promise<ResultadoPago> {
  try {
    const usuario = await requerirUsuario();

    const resultado = await adminDb.runTransaction(async (tx) => {
      const cuotaRef = adminDb.collection("cuotas").doc(datos.cuotaId);
      const cuotaSnap = await tx.get(cuotaRef);
      if (!cuotaSnap.exists) throw new ErrorValidacion("Cuota no encontrada");
      const cuota = cuotaSnap.data() as Cuota;
      if (cuota.estado !== "Pendiente") {
        throw new ErrorValidacion("Solo se puede pagar una cuota pendiente");
      }

      const { movimientoId } = await registrarPagoEnTx(tx, usuario.uid, {
        clienteId: cuota.clienteId,
        monto: cuota.monto,
        medioPago: datos.medioPago,
        referencia: datos.referencia,
        presupuestoId: cuota.presupuestoId,
        permitirSaldoAFavor: datos.permitirSaldoAFavor,
        concepto: `Pago ${cuota.concepto} - ${cuota.obraCodigo}`,
      });

      tx.update(cuotaRef, {
        estado: "Cobrada",
        movimientoId,
        actualizadoEn: FieldValue.serverTimestamp(),
      });

      return { movimientoId };
    });

    return { ok: true, ...resultado };
  } catch (err) {
    if (err instanceof ErrorSaldoAFavor) {
      return {
        ok: false,
        error: `El pago supera el saldo deudor y va a generar un saldo a favor de ${fmtMonto(
          Math.abs(err.saldoResultante),
        )}. Confirmá si querés registrarlo igual.`,
        codigoError: "SALDO_A_FAVOR",
        saldoResultante: err.saldoResultante,
      };
    }
    return { ok: false, error: mensajeError(err) };
  }
}
