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
  actualizarEstadoComercial,
  programarSeguimiento,
  registrarContacto,
} from "@/lib/acciones/comercial";

const obraBase = {
  estadoComercial: "Enviado",
  proximoSeguimiento: null,
  motivoPerdida: null,
  motivoPerdidaDetalle: "",
  contactos: [],
};

async function limpiarFirestore() {
  const respuesta = await fetch(
    `http://${process.env.FIRESTORE_EMULATOR_HOST}/emulator/v1/projects/${process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID}/databases/(default)/documents`,
    { method: "DELETE" },
  );
  if (!respuesta.ok) throw new Error(`No se pudo limpiar Firestore: ${respuesta.status}`);
}

describe("acciones comerciales", () => {
  beforeAll(() => expect(process.env.FIRESTORE_EMULATOR_HOST).toBeTruthy());

  beforeEach(async () => {
    await limpiarFirestore();
    await adminDb.collection("obras").doc("COTA-2026-0001").set(obraBase);
  });

  it("exige motivo para marcar una obra como perdida", async () => {
    await expect(
      actualizarEstadoComercial({ obraCodigo: "COTA-2026-0001", estado: "Perdido" }),
    ).resolves.toEqual({ ok: false, error: "Elegí un motivo de pérdida" });
    expect((await adminDb.doc("obras/COTA-2026-0001").get()).data()?.estadoComercial).toBe("Enviado");
  });

  it("registra el motivo y permite reabrir una negociación", async () => {
    expect(
      await actualizarEstadoComercial({
        obraCodigo: "COTA-2026-0001",
        estado: "Perdido",
        motivoPerdida: "precio",
        motivoPerdidaDetalle: "Fuera de presupuesto",
      }),
    ).toEqual({ ok: true });
    expect((await adminDb.doc("obras/COTA-2026-0001").get()).data()).toEqual(
      expect.objectContaining({ estadoComercial: "Perdido", motivoPerdida: "precio" }),
    );

    expect(
      await actualizarEstadoComercial({ obraCodigo: "COTA-2026-0001", estado: "EnNegociacion" }),
    ).toEqual({ ok: true });
    expect((await adminDb.doc("obras/COTA-2026-0001").get()).data()).toEqual(
      expect.objectContaining({ estadoComercial: "EnNegociacion", motivoPerdida: null }),
    );
  });

  it("guarda contactos con el usuario y programa seguimientos", async () => {
    expect(
      await registrarContacto({
        obraCodigo: "COTA-2026-0001",
        canal: "whatsapp",
        nota: "Pidió llamarlo el lunes",
        versionPresupuesto: 2,
      }),
    ).toEqual({ ok: true });
    expect(await programarSeguimiento("COTA-2026-0001", "2026-07-20")).toEqual({ ok: true });

    const obra = (await adminDb.doc("obras/COTA-2026-0001").get()).data();
    expect(obra?.contactos).toEqual([
      expect.objectContaining({ canal: "whatsapp", usuario: "test@cotacero.com", versionPresupuesto: 2 }),
    ]);
    expect(obra?.proximoSeguimiento.toDate().getDate()).toBe(20);
  });
});
