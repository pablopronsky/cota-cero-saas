"use server";

import { FieldValue } from "firebase-admin/firestore";
import { adminDb } from "@/lib/firebase/admin";
import { proximoCodigo } from "@/lib/firebase/numeracion";
import { obtenerUsuarioSesion } from "@/lib/firebase/sesion";
import { puedeAnularse, puedeConfirmarse } from "@/lib/reglas/validaciones";
import type { Cliente, Movimiento, Presupuesto } from "@/lib/tipos";

/** Errores esperados (validación de negocio) cuyo mensaje es seguro mostrar tal cual. */
class ErrorValidacion extends Error {}

/** Pago que supera el saldo deudor sin permitirSaldoAFavor: la UI debe confirmar y reintentar. */
class ErrorSaldoAFavor extends Error {
  constructor(public saldoResultante: number) {
    super("El pago genera saldo a favor");
  }
}

export type ResultadoAccion = { ok: true } | { ok: false; error: string };
export type ResultadoPago =
  | { ok: true; movimientoId: string }
  | { ok: false; error: string; codigoError?: "SALDO_A_FAVOR"; saldoResultante?: number };

export interface DatosPago {
  clienteId: string;
  monto: number;
  medioPago?: string;
  referencia?: string;
  presupuestoId?: string | null;
  /** Si el pago supera el saldo deudor, hay que reintentar con esto en true. */
  permitirSaldoAFavor?: boolean;
}

export interface DatosAjuste {
  clienteId: string;
  debe: number;
  haber: number;
  motivo: string;
}

async function requerirUsuario() {
  const usuario = await obtenerUsuarioSesion();
  if (!usuario) throw new ErrorValidacion("No autenticado");
  return usuario;
}

function mensajeError(err: unknown): string {
  if (err instanceof ErrorValidacion) return err.message;
  console.error(err);
  return "Ocurrió un error inesperado. Intentá de nuevo.";
}

function fmtMonto(n: number): string {
  return n.toLocaleString("es-AR", { style: "currency", currency: "ARS" });
}

function exigirMotivo(motivo: string): string {
  const limpio = motivo.trim();
  if (!limpio) throw new ErrorValidacion("El motivo es obligatorio");
  return limpio;
}

/**
 * R8 - Confirma un presupuesto 'Emitido': registra `debe = total`, pasa el
 * presupuesto a 'Confirmado' y todas las otras versiones 'Emitido' de la
 * misma obra a 'Superado'. Todo en UNA transacción.
 */
export async function confirmarPresupuesto(presupuestoId: string): Promise<ResultadoAccion> {
  try {
    const usuario = await requerirUsuario();

    await adminDb.runTransaction(async (tx) => {
      const presupuestoRef = adminDb.collection("presupuestos").doc(presupuestoId);
      const presupuestoSnap = await tx.get(presupuestoRef);
      if (!presupuestoSnap.exists) throw new ErrorValidacion("Presupuesto no encontrado");
      const presupuesto = presupuestoSnap.data() as Presupuesto;

      if (!puedeConfirmarse(presupuesto.estado)) {
        throw new ErrorValidacion("Solo se puede confirmar un presupuesto en estado Emitido");
      }

      const confirmacionExistente = await tx.get(
        adminDb
          .collection("movimientos")
          .where("presupuestoId", "==", presupuestoId)
          .where("tipo", "==", "CONFIRMACION_PRESUPUESTO")
          .limit(1),
      );
      if (!confirmacionExistente.empty) {
        throw new ErrorValidacion("Este presupuesto ya tiene una confirmación registrada");
      }

      const clienteRef = adminDb.collection("clientes").doc(presupuesto.clienteId);
      const clienteSnap = await tx.get(clienteRef);
      if (!clienteSnap.exists) throw new ErrorValidacion("Cliente no encontrado");
      const cliente = clienteSnap.data() as Cliente;

      const otrasEmitidasSnap = await tx.get(
        adminDb
          .collection("presupuestos")
          .where("obraCodigo", "==", presupuesto.obraCodigo)
          .where("estado", "==", "Emitido"),
      );

      const codigo = await proximoCodigo(tx, "movimientos");
      const ahora = FieldValue.serverTimestamp();

      tx.set(adminDb.collection("movimientos").doc(), {
        codigo,
        fechaHora: ahora,
        clienteId: presupuesto.clienteId,
        clienteNombre: presupuesto.clienteNombre,
        tipo: "CONFIRMACION_PRESUPUESTO",
        presupuestoId,
        codigoObra: presupuesto.obraCodigo,
        versionPresupuesto: presupuesto.version,
        concepto: `Confirmación presupuesto ${presupuesto.obraCodigo} v${presupuesto.version}`,
        debe: presupuesto.total,
        haber: 0,
        medioPago: "",
        referencia: "",
        motivo: "",
        movAnuladoId: null,
        reciboPath: "",
        notas: "",
        creadoPor: usuario.uid,
      });

      tx.update(presupuestoRef, { estado: "Confirmado", actualizadoEn: ahora });

      tx.update(clienteRef, {
        saldo: cliente.saldo + presupuesto.total,
        actualizadoEn: ahora,
      });

      for (const doc of otrasEmitidasSnap.docs) {
        if (doc.id === presupuestoId) continue;
        tx.update(doc.ref, { estado: "Superado", actualizadoEn: ahora });
      }
    });

    return { ok: true };
  } catch (err) {
    return { ok: false, error: mensajeError(err) };
  }
}

/**
 * R8 - Registra un pago (haber). Si supera el saldo deudor del cliente y
 * `permitirSaldoAFavor` es false, devuelve un error con `codigoError:
 * "SALDO_A_FAVOR"` para que la UI pida confirmación explícita y reintente.
 * El recibo PDF se genera después (ver app/api/pdf/recibo/[movId]).
 */
export async function registrarPago(datos: DatosPago): Promise<ResultadoPago> {
  try {
    const usuario = await requerirUsuario();
    if (!(datos.monto > 0)) throw new ErrorValidacion("El monto debe ser mayor a cero");

    const resultado = await adminDb.runTransaction(async (tx) => {
      const clienteRef = adminDb.collection("clientes").doc(datos.clienteId);
      const clienteSnap = await tx.get(clienteRef);
      if (!clienteSnap.exists) throw new ErrorValidacion("Cliente no encontrado");
      const cliente = clienteSnap.data() as Cliente;

      let presupuesto: Presupuesto | null = null;
      if (datos.presupuestoId) {
        const presupuestoSnap = await tx.get(
          adminDb.collection("presupuestos").doc(datos.presupuestoId),
        );
        if (!presupuestoSnap.exists) throw new ErrorValidacion("Presupuesto no encontrado");
        presupuesto = presupuestoSnap.data() as Presupuesto;
        if (presupuesto.clienteId !== datos.clienteId) {
          throw new ErrorValidacion("El presupuesto no pertenece a este cliente");
        }
      }

      const nuevoSaldo = cliente.saldo - datos.monto;
      if (nuevoSaldo < 0 && !datos.permitirSaldoAFavor) {
        throw new ErrorSaldoAFavor(nuevoSaldo);
      }

      const codigo = await proximoCodigo(tx, "movimientos");
      const ahora = FieldValue.serverTimestamp();
      const movimientoRef = adminDb.collection("movimientos").doc();

      tx.set(movimientoRef, {
        codigo,
        fechaHora: ahora,
        clienteId: datos.clienteId,
        clienteNombre: cliente.nombre,
        tipo: "PAGO",
        presupuestoId: datos.presupuestoId ?? null,
        codigoObra: presupuesto?.obraCodigo ?? "",
        versionPresupuesto: presupuesto?.version ?? 0,
        concepto: presupuesto
          ? `Pago - ${presupuesto.obraCodigo} v${presupuesto.version}`
          : "Pago",
        debe: 0,
        haber: datos.monto,
        medioPago: datos.medioPago?.trim() ?? "",
        referencia: datos.referencia?.trim() ?? "",
        motivo: "",
        movAnuladoId: null,
        reciboPath: "",
        notas: "",
        creadoPor: usuario.uid,
      });

      tx.update(clienteRef, { saldo: nuevoSaldo, actualizadoEn: ahora });

      return { movimientoId: movimientoRef.id };
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

/**
 * R8 - Anula la confirmación activa de un presupuesto 'Confirmado': motivo
 * obligatorio, inserta el inverso (haber) vinculado por `movAnuladoId`, el
 * presupuesto pasa a 'Anulado'.
 */
export async function anularConfirmacion(
  presupuestoId: string,
  motivo: string,
): Promise<ResultadoAccion> {
  try {
    const usuario = await requerirUsuario();
    const motivoLimpio = exigirMotivo(motivo);

    await adminDb.runTransaction(async (tx) => {
      const presupuestoRef = adminDb.collection("presupuestos").doc(presupuestoId);
      const presupuestoSnap = await tx.get(presupuestoRef);
      if (!presupuestoSnap.exists) throw new ErrorValidacion("Presupuesto no encontrado");
      const presupuesto = presupuestoSnap.data() as Presupuesto;

      if (!puedeAnularse(presupuesto.estado)) {
        throw new ErrorValidacion(
          "Solo se puede anular la confirmación de un presupuesto Confirmado",
        );
      }

      const confirmacionSnap = await tx.get(
        adminDb
          .collection("movimientos")
          .where("presupuestoId", "==", presupuestoId)
          .where("tipo", "==", "CONFIRMACION_PRESUPUESTO")
          .limit(1),
      );
      if (confirmacionSnap.empty) {
        throw new ErrorValidacion("No se encontró la confirmación de este presupuesto");
      }
      const movConfirmacionDoc = confirmacionSnap.docs[0];
      const confirmacion = movConfirmacionDoc.data() as Movimiento;

      const yaAnuladaSnap = await tx.get(
        adminDb
          .collection("movimientos")
          .where("movAnuladoId", "==", movConfirmacionDoc.id)
          .limit(1),
      );
      if (!yaAnuladaSnap.empty) throw new ErrorValidacion("Esta confirmación ya fue anulada");

      const clienteRef = adminDb.collection("clientes").doc(presupuesto.clienteId);
      const clienteSnap = await tx.get(clienteRef);
      if (!clienteSnap.exists) throw new ErrorValidacion("Cliente no encontrado");
      const cliente = clienteSnap.data() as Cliente;

      const codigo = await proximoCodigo(tx, "movimientos");
      const ahora = FieldValue.serverTimestamp();

      tx.set(adminDb.collection("movimientos").doc(), {
        codigo,
        fechaHora: ahora,
        clienteId: presupuesto.clienteId,
        clienteNombre: presupuesto.clienteNombre,
        tipo: "ANULACION_PRESUPUESTO",
        presupuestoId,
        codigoObra: presupuesto.obraCodigo,
        versionPresupuesto: presupuesto.version,
        concepto: `Anulación de confirmación - ${presupuesto.obraCodigo} v${presupuesto.version}`,
        debe: 0,
        haber: confirmacion.debe,
        medioPago: "",
        referencia: "",
        motivo: motivoLimpio,
        movAnuladoId: movConfirmacionDoc.id,
        reciboPath: "",
        notas: "",
        creadoPor: usuario.uid,
      });

      tx.update(presupuestoRef, { estado: "Anulado", actualizadoEn: ahora });

      tx.update(clienteRef, {
        saldo: cliente.saldo - confirmacion.debe,
        actualizadoEn: ahora,
      });
    });

    return { ok: true };
  } catch (err) {
    return { ok: false, error: mensajeError(err) };
  }
}

/**
 * R8 - Anula un pago: motivo obligatorio, inserta el inverso (debe)
 * vinculado por `movAnuladoId`. Un pago no se puede anular dos veces.
 */
export async function anularPago(movimientoId: string, motivo: string): Promise<ResultadoAccion> {
  try {
    const usuario = await requerirUsuario();
    const motivoLimpio = exigirMotivo(motivo);

    await adminDb.runTransaction(async (tx) => {
      const movimientoRef = adminDb.collection("movimientos").doc(movimientoId);
      const movimientoSnap = await tx.get(movimientoRef);
      if (!movimientoSnap.exists) throw new ErrorValidacion("Movimiento no encontrado");
      const movimiento = movimientoSnap.data() as Movimiento;
      if (movimiento.tipo !== "PAGO") throw new ErrorValidacion("Solo se pueden anular pagos");

      const yaAnuladoSnap = await tx.get(
        adminDb.collection("movimientos").where("movAnuladoId", "==", movimientoId).limit(1),
      );
      if (!yaAnuladoSnap.empty) throw new ErrorValidacion("Este pago ya fue anulado");

      const clienteRef = adminDb.collection("clientes").doc(movimiento.clienteId);
      const clienteSnap = await tx.get(clienteRef);
      if (!clienteSnap.exists) throw new ErrorValidacion("Cliente no encontrado");
      const cliente = clienteSnap.data() as Cliente;

      const codigo = await proximoCodigo(tx, "movimientos");
      const ahora = FieldValue.serverTimestamp();

      tx.set(adminDb.collection("movimientos").doc(), {
        codigo,
        fechaHora: ahora,
        clienteId: movimiento.clienteId,
        clienteNombre: movimiento.clienteNombre,
        tipo: "ANULACION_PAGO",
        presupuestoId: movimiento.presupuestoId,
        codigoObra: movimiento.codigoObra,
        versionPresupuesto: movimiento.versionPresupuesto,
        concepto: `Anulación de pago ${movimiento.codigo}`,
        debe: movimiento.haber,
        haber: 0,
        medioPago: "",
        referencia: "",
        motivo: motivoLimpio,
        movAnuladoId: movimientoId,
        reciboPath: "",
        notas: "",
        creadoPor: usuario.uid,
      });

      tx.update(clienteRef, {
        saldo: cliente.saldo + movimiento.haber,
        actualizadoEn: ahora,
      });
    });

    return { ok: true };
  } catch (err) {
    return { ok: false, error: mensajeError(err) };
  }
}

/** R8 - Ajuste manual libre: motivo obligatorio, debe o haber (no ambos). */
export async function registrarAjuste(datos: DatosAjuste): Promise<ResultadoAccion> {
  try {
    const usuario = await requerirUsuario();
    const motivoLimpio = exigirMotivo(datos.motivo);
    if (datos.debe < 0 || datos.haber < 0) {
      throw new ErrorValidacion("Los montos no pueden ser negativos");
    }
    if (datos.debe > 0 && datos.haber > 0) {
      throw new ErrorValidacion("Un ajuste no puede tener debe y haber a la vez");
    }
    if (datos.debe === 0 && datos.haber === 0) {
      throw new ErrorValidacion("Ingresá un monto de debe o de haber");
    }

    await adminDb.runTransaction(async (tx) => {
      const clienteRef = adminDb.collection("clientes").doc(datos.clienteId);
      const clienteSnap = await tx.get(clienteRef);
      if (!clienteSnap.exists) throw new ErrorValidacion("Cliente no encontrado");
      const cliente = clienteSnap.data() as Cliente;

      const codigo = await proximoCodigo(tx, "movimientos");
      const ahora = FieldValue.serverTimestamp();

      tx.set(adminDb.collection("movimientos").doc(), {
        codigo,
        fechaHora: ahora,
        clienteId: datos.clienteId,
        clienteNombre: cliente.nombre,
        tipo: "AJUSTE",
        presupuestoId: null,
        codigoObra: "",
        versionPresupuesto: 0,
        concepto: "Ajuste manual",
        debe: datos.debe,
        haber: datos.haber,
        medioPago: "",
        referencia: "",
        motivo: motivoLimpio,
        movAnuladoId: null,
        reciboPath: "",
        notas: "",
        creadoPor: usuario.uid,
      });

      tx.update(clienteRef, {
        saldo: cliente.saldo + datos.debe - datos.haber,
        actualizadoEn: ahora,
      });
    });

    return { ok: true };
  } catch (err) {
    return { ok: false, error: mensajeError(err) };
  }
}
