import { beforeEach, describe, expect, it, vi } from "vitest";

const { getCookie, verifySessionCookie, getUsuario } = vi.hoisted(() => ({
  getCookie: vi.fn(),
  verifySessionCookie: vi.fn(),
  getUsuario: vi.fn(),
}));

vi.mock("next/headers", () => ({
  cookies: vi.fn(async () => ({ get: getCookie })),
}));
vi.mock("@/lib/firebase/admin", () => ({
  adminAuth: { verifySessionCookie },
  adminDb: { collection: () => ({ doc: () => ({ get: getUsuario }) }) },
}));

import { obtenerUsuarioSesion } from "@/lib/firebase/sesion";

describe("obtenerUsuarioSesion", () => {
  beforeEach(() => {
    getCookie.mockReturnValue({ value: "cookie" });
    verifySessionCookie.mockResolvedValue({ uid: "u1", email: "a@b.com" });
  });

  it("devuelve null cuando el usuario está desactivado", async () => {
    getUsuario.mockResolvedValue({ exists: true, data: () => ({ activo: false }) });
    await expect(obtenerUsuarioSesion()).resolves.toBeNull();
  });

  it("devuelve null cuando no existe el documento de usuario", async () => {
    getUsuario.mockResolvedValue({ exists: false });
    await expect(obtenerUsuarioSesion()).resolves.toBeNull();
  });
});
