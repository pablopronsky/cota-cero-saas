import "server-only";
import { cookies } from "next/headers";
import { adminAuth } from "@/lib/firebase/admin";
import { NOMBRE_COOKIE_SESION } from "@/lib/constantes";

const DURACION_MS = 5 * 24 * 60 * 60 * 1000; // 5 días

export async function crearCookieSesion(idToken: string): Promise<void> {
  const cookieSesion = await adminAuth.createSessionCookie(idToken, {
    expiresIn: DURACION_MS,
  });
  const store = await cookies();
  store.set(NOMBRE_COOKIE_SESION, cookieSesion, {
    maxAge: DURACION_MS / 1000,
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
  });
}

export async function borrarCookieSesion(): Promise<void> {
  const store = await cookies();
  store.delete(NOMBRE_COOKIE_SESION);
}

export interface UsuarioSesion {
  uid: string;
  email: string;
  nombre: string;
}

export async function obtenerUsuarioSesion(): Promise<UsuarioSesion | null> {
  const store = await cookies();
  const cookieSesion = store.get(NOMBRE_COOKIE_SESION)?.value;
  if (!cookieSesion) return null;

  try {
    const decoded = await adminAuth.verifySessionCookie(cookieSesion, true);
    return {
      uid: decoded.uid,
      email: decoded.email ?? "",
      nombre: (decoded.name as string | undefined) ?? decoded.email ?? "Usuario",
    };
  } catch {
    return null;
  }
}
