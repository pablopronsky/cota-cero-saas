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
import {
  anularConfirmacion,
  anularPago,
  confirmarPresupuesto,
  registrarAjuste,
  registrarPago,
} from "@/lib/acciones/cuentaCorriente";
import { obtenerUsuarioSesion } from "@/lib/firebase/sesion";

const clienteBase = { nombre: "Cliente Test", saldo: 0 };
const presupuestoBase = {
  obraCodigo: "COTA-2026-0001",
  version: 1,
  clienteId: "CLI-0001",
  clienteNombre: "Cliente Test",
  estado: "Emitido",
  total: 1000,
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

async function movimientos() {
  return (await adminDb.collection("movimientos").get()).docs.map((doc): Record<string, unknown> => ({
    id: doc.id,
    ...doc.data(),
  }));
}

describe("acciones de cuenta corriente", () => {
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
  });

  it("confirma, registra el debe y supera las otras versiones emitidas", async () => {
    await adminDb.collection("presupuestos").doc("p1").set(presupuestoBase);
    await adminDb.collection("presupuestos").doc("p2").set({ ...presupuestoBase, version: 2 });

    expect(await confirmarPresupuesto("p1")).toEqual({ ok: true });

    expect((await adminDb.doc("clientes/CLI-0001").get()).data()?.saldo).toBe(1000);
    expect((await adminDb.doc("presupuestos/p1").get()).data()?.estado).toBe("Confirmado");
    expect((await adminDb.doc("presupuestos/p2").get()).data()?.estado).toBe("Superado");
    expect(await movimientos()).toEqual([
      expect.objectContaining({ tipo: "CONFIRMACION_PRESUPUESTO", debe: 1000, haber: 0 }),
    ]);
  });

  it("rechaza otra versión si la obra ya tiene una confirmada sin modificar nada", async () => {
    await adminDb.collection("presupuestos").doc("p1").set({ ...presupuestoBase, estado: "Confirmado" });
    await adminDb.collection("presupuestos").doc("p2").set({ ...presupuestoBase, version: 2 });

    const resultado = await confirmarPresupuesto("p2");

    expect(resultado).toEqual({
      ok: false,
      error: "Esta obra ya tiene la versión 1 confirmada. Anulá esa confirmación antes de confirmar otra versión.",
    });
    expect((await adminDb.doc("clientes/CLI-0001").get()).data()?.saldo).toBe(0);
    expect((await adminDb.doc("presupuestos/p2").get()).data()?.estado).toBe("Emitido");
    expect(await movimientos()).toHaveLength(0);
  });

  it("rechaza confirmar dos veces el mismo presupuesto", async () => {
    await adminDb.collection("presupuestos").doc("p1").set(presupuestoBase);
    expect((await confirmarPresupuesto("p1")).ok).toBe(true);
    expect((await confirmarPresupuesto("p1")).ok).toBe(false);
    expect(await movimientos()).toHaveLength(1);
    expect((await adminDb.doc("clientes/CLI-0001").get()).data()?.saldo).toBe(1000);
  });

  it("registra pagos y exige confirmación explícita para saldo a favor", async () => {
    await adminDb.doc("clientes/CLI-0001").update({ saldo: 500 });
    expect((await registrarPago({ clienteId: "CLI-0001", monto: 200 })).ok).toBe(true);
    expect((await adminDb.doc("clientes/CLI-0001").get()).data()?.saldo).toBe(300);

    const rechazado = await registrarPago({ clienteId: "CLI-0001", monto: 400 });
    expect(rechazado).toEqual(expect.objectContaining({ ok: false, codigoError: "SALDO_A_FAVOR" }));
    expect(await movimientos()).toHaveLength(1);
    expect((await adminDb.doc("clientes/CLI-0001").get()).data()?.saldo).toBe(300);

    expect((await registrarPago({ clienteId: "CLI-0001", monto: 400, permitirSaldoAFavor: true })).ok).toBe(true);
    expect((await adminDb.doc("clientes/CLI-0001").get()).data()?.saldo).toBe(-100);
  });

  it("anula una confirmación una sola vez y restaura el saldo", async () => {
    await adminDb.collection("presupuestos").doc("p1").set(presupuestoBase);
    await confirmarPresupuesto("p1");

    expect(await anularConfirmacion("p1", "Error de versión")).toEqual({ ok: true });
    expect((await adminDb.doc("presupuestos/p1").get()).data()?.estado).toBe("Anulado");
    expect((await adminDb.doc("clientes/CLI-0001").get()).data()?.saldo).toBe(0);
    const lista = await movimientos();
    const confirmacion = lista.find((mov) => mov.tipo === "CONFIRMACION_PRESUPUESTO");
    expect(lista).toContainEqual(expect.objectContaining({ tipo: "ANULACION_PRESUPUESTO", movAnuladoId: confirmacion?.id, haber: 1000 }));
    expect((await anularConfirmacion("p1", "Otra vez")).ok).toBe(false);
  });

  it("rechaza anular un no-pago y no permite anular un pago dos veces", async () => {
    const pago = await registrarPago({ clienteId: "CLI-0001", monto: 100, permitirSaldoAFavor: true });
    if (!pago.ok) throw new Error(pago.error);
    await adminDb.collection("movimientos").doc("ajuste-manual").set({ tipo: "AJUSTE" });

    expect((await anularPago("ajuste-manual", "No corresponde")).ok).toBe(false);
    expect(await anularPago(pago.movimientoId, "Pago duplicado")).toEqual({ ok: true });
    expect((await anularPago(pago.movimientoId, "Otra vez")).ok).toBe(false);
  });

  it("valida ajustes y aplica uno válido al saldo", async () => {
    expect((await registrarAjuste({ clienteId: "CLI-0001", debe: 10, haber: 10, motivo: "x" })).ok).toBe(false);
    expect((await registrarAjuste({ clienteId: "CLI-0001", debe: 0, haber: 0, motivo: "x" })).ok).toBe(false);
    expect(await registrarAjuste({ clienteId: "CLI-0001", debe: 250, haber: 0, motivo: "Corrección" })).toEqual({ ok: true });
    expect((await adminDb.doc("clientes/CLI-0001").get()).data()?.saldo).toBe(250);
  });

  it("todas las acciones rechazan una sesión inactiva", async () => {
    vi.mocked(obtenerUsuarioSesion).mockResolvedValue(null);
    expect(await registrarAjuste({ clienteId: "CLI-0001", debe: 1, haber: 0, motivo: "x" })).toEqual({ ok: false, error: "No autenticado" });
    expect(await movimientos()).toHaveLength(0);
  });
});
