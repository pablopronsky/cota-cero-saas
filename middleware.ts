import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { NOMBRE_COOKIE_SESION } from "@/lib/constantes";

const RUTAS_PUBLICAS = ["/login"];

/**
 * Chequeo liviano de presencia de cookie (edge, sin admin SDK). La
 * verificación real de la cookie de sesión ocurre en el layout protegido
 * (app/(app)/layout.tsx) con obtenerUsuarioSesion().
 */
export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const tieneSesion = request.cookies.has(NOMBRE_COOKIE_SESION);

  if (RUTAS_PUBLICAS.includes(pathname)) {
    if (tieneSesion) {
      return NextResponse.redirect(new URL("/clientes", request.url));
    }
    return NextResponse.next();
  }

  if (!tieneSesion) {
    return NextResponse.redirect(new URL("/login", request.url));
  }

  return NextResponse.next();
}

export const config = {
  // El último grupo (.*\\..*) excluye archivos estáticos de public/ (p. ej.
  // /logo/*.svg): sin esto, el logo del login redirige a /login y no carga.
  matcher: ["/((?!_next/static|_next/image|favicon.ico|api|.*\\..*).*)"],
};
