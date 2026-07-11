import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

vi.hoisted(() => {
  Object.assign(process.env, {
    NODE_ENV: "test",
    NEXT_PUBLIC_FIREBASE_PROJECT_ID: "cota-cero-saas-35cc0",
    FIRESTORE_EMULATOR_HOST: "127.0.0.1:8080",
  });
});

vi.mock("@/lib/firebase/sesion", () => ({
  obtenerUsuarioSesion: vi.fn().mockResolvedValue({
    uid: "usuario-test",
    email: "test@cotacero.com",
    nombre: "Test",
  }),
}));

import { adminDb } from "@/lib/firebase/admin";
import { anularPago, confirmarPresupuesto } from "@/lib/acciones/cuentaCorriente";
import {
  actualizarCuota,
  anularCuota,
  crearCuota,
  generarPlan,
  registrarPagoDeCuota,
} from "@/lib/acciones/cuotas";
import { obtenerUsuarioSesion } from "@/lib/firebase/sesion";
import type { Cuota, Movimiento } from "@/lib/tipos";

const clienteBase = { nombre: "Cliente Test", saldo: 0 };
const presupuestoBase = {
  obraCodigo: "COTA-2026-0001",
  version: 1,
  clienteId: "CLI-0001",
  clienteNombre: "Cliente Test",
  estado: "Emitido",
  total: 1000,
  esLegado: false,
};

async function limpiarFirestore() {
  const host = process.env.FIRESTORE_EMULATOR_HOST;
  const projectId = process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID;
  const respuesta = await fetch(
    `http://${host}/emulator/v1/projects/${projectId}/databases/(default)/documents`,
    { method: "DELETE" },
  );
  if (!respuesta.ok) throw new Error(`No se pudo limpiar Firestore: ${respuesta.status}`);
}

async function saldoDe(clienteId: string): Promise<number> {
  return (await adminDb.doc(`clientes/${clienteId}`).get()).data()?.saldo as number;
}

async function cuotasDeObra(obraCodigo: string) {
  const snap = await adminDb.collection("cuotas").where("obraCodigo", "==", obraCodigo).get();
  return snap.docs
    .map((d) => ({ id: d.id, ...(d.data() as Cuota) }))
    .sort((a, b) => a.orden - b.orden);
}

/** Recalcula el saldo desde los movimientos (lo que hace reconciliar.ts) para verificar integridad. */
async function saldoReconciliado(clienteId: string): Promise<number> {
  const snap = await adminDb.collection("movimientos").where("clienteId", "==", clienteId).get();
  return snap.docs.reduce((acc, d) => {
    const m = d.data() as Movimiento;
    return acc + m.debe - m.haber;
  }, 0);
}

async function confirmarObraConSaldo() {
  await adminDb.collection("presupuestos").doc("p1").set(presupuestoBase);
  expect((await confirmarPresupuesto("p1")).ok).toBe(true);
  expect(await saldoDe("CLI-0001")).toBe(1000);
}

describe("plan de cobro y pago de cuotas", () => {
  beforeAll(() => {
    expect(process.env.FIRESTORE_EMULATOR_HOST).toBeTruthy();
  });

  beforeEach(async () => {
    vi.mocked(obtenerUsuarioSesion).mockResolvedValue({
      uid: "usuario-test",
      email: "test@cotacero.com",
      nombre: "Test",
    });
    await limpiarFirestore();
    await adminDb.collection("clientes").doc("CLI-0001").set(clienteBase);
    await adminDb.collection("obras").doc("COTA-2026-0001").set({
      clienteId: "CLI-0001",
      estadoComercial: "Enviado",
      proximoSeguimiento: null,
      motivoPerdida: null,
      motivoPerdidaDetalle: "",
      contactos: [],
    });
  });

  it("genera un plan anticipo+saldo cuyas cuotas suman el total", async () => {
    await confirmarObraConSaldo();

    expect(
      (await generarPlan({
        presupuestoId: "p1",
        tipo: "anticipoSaldo",
        porcentajeAnticipo: 40,
        fechaInicial: "2026-07-15",
      })).ok,
    ).toBe(true);

    const cuotas = await cuotasDeObra("COTA-2026-0001");
    expect(cuotas.map((c) => [c.concepto, c.monto, c.estado])).toEqual([
      ["Anticipo 40%", 400, "Pendiente"],
      ["Saldo", 600, "Pendiente"],
    ]);
    expect(cuotas.every((c) => c.movimientoId === null)).toBe(true);
  });

  it("rechaza generar un segundo plan mientras hay cuotas activas", async () => {
    await confirmarObraConSaldo();
    await generarPlan({ presupuestoId: "p1", tipo: "cuotasIguales", cantidad: 3, fechaInicial: "2026-07-15" });

    const segundo = await generarPlan({
      presupuestoId: "p1",
      tipo: "anticipoSaldo",
      porcentajeAnticipo: 50,
      fechaInicial: "2026-07-15",
    });
    expect(segundo.ok).toBe(false);
    expect(await cuotasDeObra("COTA-2026-0001")).toHaveLength(3);
  });

  it("pagar una cuota descuenta el saldo, la marca Cobrada y queda reconciliado", async () => {
    await confirmarObraConSaldo();
    await generarPlan({
      presupuestoId: "p1",
      tipo: "anticipoSaldo",
      porcentajeAnticipo: 40,
      fechaInicial: "2026-07-15",
    });
    const [cuota1] = await cuotasDeObra("COTA-2026-0001");

    const pago = await registrarPagoDeCuota({ cuotaId: cuota1.id, medioPago: "efectivo" });
    expect(pago.ok).toBe(true);
    if (!pago.ok) throw new Error(pago.error);

    expect(await saldoDe("CLI-0001")).toBe(600);
    const cuota1Post = (await adminDb.doc(`cuotas/${cuota1.id}`).get()).data() as Cuota;
    expect(cuota1Post.estado).toBe("Cobrada");
    expect(cuota1Post.movimientoId).toBe(pago.movimientoId);
    expect(await saldoReconciliado("CLI-0001")).toBe(await saldoDe("CLI-0001"));

    // No se puede volver a pagar una cuota ya cobrada.
    expect((await registrarPagoDeCuota({ cuotaId: cuota1.id })).ok).toBe(false);
  });

  it("anular el pago revierte la cuota a Pendiente y restaura el saldo", async () => {
    await confirmarObraConSaldo();
    await generarPlan({
      presupuestoId: "p1",
      tipo: "anticipoSaldo",
      porcentajeAnticipo: 40,
      fechaInicial: "2026-07-15",
    });
    const [cuota1] = await cuotasDeObra("COTA-2026-0001");
    const pago = await registrarPagoDeCuota({ cuotaId: cuota1.id });
    if (!pago.ok) throw new Error(pago.error);

    expect((await anularPago(pago.movimientoId, "Pago mal imputado")).ok).toBe(true);

    const cuota1Post = (await adminDb.doc(`cuotas/${cuota1.id}`).get()).data() as Cuota;
    expect(cuota1Post.estado).toBe("Pendiente");
    expect(cuota1Post.movimientoId).toBeNull();
    expect(await saldoDe("CLI-0001")).toBe(1000);
    expect(await saldoReconciliado("CLI-0001")).toBe(1000);
  });

  it("edita y anula cuotas pendientes, pero no una cobrada", async () => {
    await confirmarObraConSaldo();
    const creada = await crearCuota({
      presupuestoId: "p1",
      concepto: "Contra entrega",
      monto: 300,
      venceEl: "2026-08-01",
    });
    expect(creada.ok).toBe(true);
    const [cuota] = await cuotasDeObra("COTA-2026-0001");

    expect((await actualizarCuota({ cuotaId: cuota.id, concepto: "Contra entrega", monto: 350, venceEl: "2026-08-05" })).ok).toBe(true);
    expect(((await adminDb.doc(`cuotas/${cuota.id}`).get()).data() as Cuota).monto).toBe(350);

    const pago = await registrarPagoDeCuota({ cuotaId: cuota.id, permitirSaldoAFavor: true });
    if (!pago.ok) throw new Error(pago.error);
    expect((await actualizarCuota({ cuotaId: cuota.id, concepto: "x", monto: 1, venceEl: "2026-08-05" })).ok).toBe(false);
    expect((await anularCuota(cuota.id)).ok).toBe(false);
  });
});
