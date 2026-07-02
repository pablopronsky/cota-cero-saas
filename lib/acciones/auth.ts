"use server";

import { adminAuth, adminDb } from "@/lib/firebase/admin";
import { crearCookieSesion, borrarCookieSesion } from "@/lib/firebase/sesion";

/** Verifica el idToken del cliente, emite la cookie de sesión y crea/actualiza usuarios/{uid} en el primer login. */
export async function iniciarSesion(idToken: string): Promise<void> {
  const decoded = await adminAuth.verifyIdToken(idToken);
  await crearCookieSesion(idToken);

  const usuarioRef = adminDb.collection("usuarios").doc(decoded.uid);
  const snap = await usuarioRef.get();
  if (!snap.exists) {
    await usuarioRef.set({
      nombre: decoded.name ?? decoded.email ?? "Usuario",
      email: decoded.email ?? "",
      rol: "usuario",
      activo: true,
    });
  }
}

export async function cerrarSesion(): Promise<void> {
  await borrarCookieSesion();
}
