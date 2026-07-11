import { Timestamp } from "firebase-admin/firestore";
import { adminDb } from "@/lib/firebase/admin";
import { finDeDia, inicioDeDia, rangoMes, sumarDias } from "@/lib/reglas/hoy";
import type { Cuota, EstadoComercial, Obra, Presupuesto } from "@/lib/tipos";

const ESTADOS_ACTIVOS: EstadoComercial[] = ["PendienteEnvio", "Enviado", "EnNegociacion"];
const HORIZONTE_DIAS = 7;

export interface SeguimientoHoy {
  obraCodigo: string;
  clienteNombre: string;
  proximoSeguimiento: Date;
  presupuestoId: string | null;
}

export interface PresupuestoHoy {
  presupuestoId: string;
  obraCodigo: string;
  clienteNombre: string;
  version: number;
  venceEl: Date;
  total: number;
}

export interface CuotaHoy {
  cuotaId: string;
  clienteId: string;
  obraCodigo: string;
  clienteNombre: string;
  presupuestoId: string;
  concepto: string;
  monto: number;
  venceEl: Date;
}

export interface IndicadoresMes {
  emitido: number;
  confirmado: number;
  cobrado: number;
  /** null cuando no hay obras cerradas en el mes: mostrar "—", nunca un 0% falso. */
  conversion: number | null;
}

export interface DatosHoy {
  seguimientos: SeguimientoHoy[];
  presupuestosPorVencer: PresupuestoHoy[];
  presupuestosVencidos: PresupuestoHoy[];
  cuotasVencidas: CuotaHoy[];
  cuotasPorVencer: CuotaHoy[];
  indicadores: IndicadoresMes;
}

function aFecha(valor: Timestamp | Date | null | undefined): Date | null {
  if (!valor) return null;
  return valor instanceof Date ? valor : valor.toDate();
}

/** Presupuesto "Emitido" vigente de una obra (el que representa la oferta activa). */
async function obtenerPresupuestoEmitido(obraCodigo: string): Promise<string | null> {
  const snap = await adminDb
    .collection("presupuestos")
    .where("obraCodigo", "==", obraCodigo)
    .where("estado", "==", "Emitido")
    .limit(1)
    .get();
  return snap.empty ? null : snap.docs[0].id;
}

async function obtenerSeguimientos(hoy: Date): Promise<SeguimientoHoy[]> {
  const snap = await adminDb
    .collection("obras")
    .where("estadoComercial", "in", ESTADOS_ACTIVOS)
    .where("proximoSeguimiento", "<=", Timestamp.fromDate(finDeDia(hoy)))
    .orderBy("proximoSeguimiento", "asc")
    .get();

  const obras = snap.docs
    .map((d) => ({ codigo: d.id, obra: d.data() as Obra }))
    .filter((o) => o.obra.proximoSeguimiento);

  return Promise.all(
    obras.map(async ({ codigo, obra }) => ({
      obraCodigo: codigo,
      clienteNombre: obra.clienteNombre,
      proximoSeguimiento: aFecha(obra.proximoSeguimiento)!,
      presupuestoId: await obtenerPresupuestoEmitido(codigo),
    })),
  );
}

async function obtenerPresupuestosPorVencerYVencidos(
  hoy: Date,
  obrasActivas: Map<string, Obra>,
): Promise<{ porVencer: PresupuestoHoy[]; vencidos: PresupuestoHoy[] }> {
  const horizonte = finDeDia(sumarDias(hoy, HORIZONTE_DIAS));
  const snap = await adminDb
    .collection("presupuestos")
    .where("estado", "==", "Emitido")
    .where("venceEl", "<=", Timestamp.fromDate(horizonte))
    .orderBy("venceEl", "asc")
    .get();

  const inicioHoy = inicioDeDia(hoy);
  const porVencer: PresupuestoHoy[] = [];
  const vencidos: PresupuestoHoy[] = [];

  for (const doc of snap.docs) {
    const presupuesto = doc.data() as Presupuesto;
    if (!obrasActivas.has(presupuesto.obraCodigo)) continue;
    const venceEl = aFecha(presupuesto.venceEl);
    if (!venceEl) continue;

    const item: PresupuestoHoy = {
      presupuestoId: doc.id,
      obraCodigo: presupuesto.obraCodigo,
      clienteNombre: presupuesto.clienteNombre,
      version: presupuesto.version,
      venceEl,
      total: presupuesto.total,
    };
    if (venceEl.getTime() < inicioHoy.getTime()) {
      vencidos.push(item);
    } else {
      porVencer.push(item);
    }
  }

  return { porVencer, vencidos };
}

async function obtenerCuotas(
  hoy: Date,
): Promise<{ vencidas: CuotaHoy[]; porVencer: CuotaHoy[] }> {
  const horizonte = finDeDia(sumarDias(hoy, HORIZONTE_DIAS));
  const snap = await adminDb
    .collection("cuotas")
    .where("estado", "==", "Pendiente")
    .where("venceEl", "<=", Timestamp.fromDate(horizonte))
    .orderBy("venceEl", "asc")
    .get();

  const inicioHoy = inicioDeDia(hoy);
  const vencidas: CuotaHoy[] = [];
  const porVencer: CuotaHoy[] = [];

  for (const doc of snap.docs) {
    const cuota = doc.data() as Cuota;
    const venceEl = aFecha(cuota.venceEl);
    if (!venceEl) continue;

    const item: CuotaHoy = {
      cuotaId: doc.id,
      clienteId: cuota.clienteId,
      obraCodigo: cuota.obraCodigo,
      clienteNombre: cuota.clienteNombre,
      presupuestoId: cuota.presupuestoId,
      concepto: cuota.concepto,
      monto: cuota.monto,
      venceEl,
    };
    if (venceEl.getTime() < inicioHoy.getTime()) {
      vencidas.push(item);
    } else {
      porVencer.push(item);
    }
  }

  return { vencidas, porVencer };
}

async function obtenerIndicadores(hoy: Date): Promise<IndicadoresMes> {
  const { inicio, fin } = rangoMes(hoy);
  const inicioTs = Timestamp.fromDate(inicio);
  const finTs = Timestamp.fromDate(fin);
  const dentroDelMes = (t: Timestamp | null | undefined) =>
    !!t && t.toMillis() >= inicioTs.toMillis() && t.toMillis() <= finTs.toMillis();

  const [presupuestosSnap, confirmacionesSnap, pagosSnap, cerradasSnap] = await Promise.all([
    adminDb.collection("presupuestos")
      .where("esLegado", "==", false)
      .where("fechaEmision", ">=", inicioTs)
      .where("fechaEmision", "<=", finTs)
      .get(),
    adminDb.collection("movimientos")
      .where("tipo", "==", "CONFIRMACION_PRESUPUESTO")
      .where("fechaHora", ">=", inicioTs)
      .where("fechaHora", "<=", finTs)
      .get(),
    adminDb.collection("movimientos")
      .where("tipo", "==", "PAGO")
      .where("fechaHora", ">=", inicioTs)
      .where("fechaHora", "<=", finTs)
      .get(),
    adminDb.collection("obras")
      .where("estadoComercial", "in", ["Ganado", "Perdido"])
      .where("actualizadoEn", ">=", inicioTs)
      .where("actualizadoEn", "<=", finTs)
      .get(),
  ]);

  const emitido = presupuestosSnap.docs.reduce((acc, d) => {
    const p = d.data() as Presupuesto;
    return dentroDelMes(p.fechaEmision as unknown as Timestamp) ? acc + p.total : acc;
  }, 0);

  const confirmado = confirmacionesSnap.docs.reduce((acc, d) => {
    const m = d.data();
    return dentroDelMes(m.fechaHora) ? acc + m.debe : acc;
  }, 0);

  const cobrado = pagosSnap.docs.reduce((acc, d) => {
    const m = d.data();
    return dentroDelMes(m.fechaHora) ? acc + m.haber : acc;
  }, 0);

  let ganadas = 0;
  let perdidas = 0;
  for (const doc of cerradasSnap.docs) {
    const obra = doc.data() as Obra;
    if (!dentroDelMes(obra.actualizadoEn as unknown as Timestamp)) continue;
    if (obra.estadoComercial === "Ganado") ganadas += 1;
    else if (obra.estadoComercial === "Perdido") perdidas += 1;
  }
  const totalCerradas = ganadas + perdidas;

  return {
    emitido,
    confirmado,
    cobrado,
    conversion: totalCerradas > 0 ? ganadas / totalCerradas : null,
  };
}

export async function obtenerDatosHoy(hoy: Date = new Date()): Promise<DatosHoy> {
  const obrasActivasSnap = await adminDb
    .collection("obras")
    .where("estadoComercial", "in", ESTADOS_ACTIVOS)
    .get();
  const obrasActivas = new Map(obrasActivasSnap.docs.map((d) => [d.id, d.data() as Obra]));

  const [seguimientos, { porVencer, vencidos }, { vencidas, porVencer: cuotasPorVencer }, indicadores] =
    await Promise.all([
      obtenerSeguimientos(hoy),
      obtenerPresupuestosPorVencerYVencidos(hoy, obrasActivas),
      obtenerCuotas(hoy),
      obtenerIndicadores(hoy),
    ]);

  return {
    seguimientos,
    presupuestosPorVencer: porVencer,
    presupuestosVencidos: vencidos,
    cuotasVencidas: vencidas,
    cuotasPorVencer,
    indicadores,
  };
}
