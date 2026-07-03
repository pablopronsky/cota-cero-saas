"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { FileText, Menu, Package, Users, Wallet, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { CerrarSesionBoton } from "@/components/cerrar-sesion-boton";
import type { UsuarioSesion } from "@/lib/firebase/sesion";

const ENLACES = [
  { href: "/presupuestos", label: "Presupuestos", icon: FileText },
  { href: "/clientes", label: "Clientes", icon: Users },
  { href: "/catalogo", label: "Catálogo", icon: Package },
  { href: "/cuenta-corriente", label: "Cuenta corriente", icon: Wallet },
];

function iniciales(nombre: string): string {
  return nombre
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() ?? "")
    .join("");
}

function Navegacion({
  pathname,
  onNavegar,
}: {
  pathname: string;
  onNavegar?: () => void;
}) {
  return (
    <nav className="flex flex-col gap-0.5 px-3">
      {ENLACES.map((enlace) => {
        const activo = pathname.startsWith(enlace.href);
        const Icono = enlace.icon;
        return (
          <Link
            key={enlace.href}
            href={enlace.href}
            onClick={onNavegar}
            aria-current={activo ? "page" : undefined}
            className={cn(
              "group relative flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
              activo
                ? "bg-white/8 text-sidebar-foreground"
                : "text-sidebar-foreground/60 hover:bg-white/5 hover:text-sidebar-foreground",
            )}
          >
            {activo && (
              <span className="absolute top-1/2 left-0 h-4 w-0.75 -translate-y-1/2 rounded-full bg-cobre" />
            )}
            <Icono
              className={cn(
                "size-4 transition-colors",
                activo
                  ? "text-cobre"
                  : "text-sidebar-foreground/40 group-hover:text-sidebar-foreground/70",
              )}
            />
            {enlace.label}
          </Link>
        );
      })}
    </nav>
  );
}

function BloqueUsuario({ usuario }: { usuario: UsuarioSesion }) {
  return (
    <div className="border-t border-sidebar-border px-3 py-3">
      <div className="flex items-center gap-2.5 px-2 pb-2">
        <div className="flex size-8 shrink-0 items-center justify-center rounded-full bg-cobre/20 text-xs font-semibold text-cobre">
          {iniciales(usuario.nombre) || "?"}
        </div>
        <div className="min-w-0">
          <p className="truncate text-sm font-medium text-sidebar-foreground">{usuario.nombre}</p>
          <p className="truncate text-xs text-sidebar-foreground/50">{usuario.email}</p>
        </div>
      </div>
      <CerrarSesionBoton />
    </div>
  );
}

export function NavPrincipal({ usuario }: { usuario: UsuarioSesion }) {
  const pathname = usePathname();
  const [abierto, setAbierto] = useState(false);

  // Cierra el drawer al cambiar de ruta (incluye botón atrás del navegador, que
  // no dispara el onClick de los enlaces).
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- reset intencional al navegar
    setAbierto(false);
  }, [pathname]);

  // Bloquea el scroll del body mientras el drawer está abierto.
  useEffect(() => {
    if (!abierto) return;
    const previo = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previo;
    };
  }, [abierto]);

  return (
    <>
      {/* Barra superior — solo mobile/tablet */}
      <header className="sticky top-0 z-30 flex items-center justify-between border-b border-sidebar-border bg-sidebar px-4 py-3 lg:hidden">
        <Link href="/presupuestos" className="inline-block">
          <img
            src="/logo/cota_cero_logo_negativo_outline.svg"
            alt="COTA CERO"
            className="h-6"
          />
        </Link>
        <button
          type="button"
          onClick={() => setAbierto(true)}
          aria-label="Abrir menú"
          className="flex size-9 items-center justify-center rounded-lg text-sidebar-foreground/70 transition-colors hover:bg-white/5 hover:text-sidebar-foreground"
        >
          <Menu className="size-5" />
        </button>
      </header>

      {/* Drawer + backdrop — solo mobile/tablet */}
      <div
        className={cn(
          "fixed inset-0 z-50 lg:hidden",
          abierto ? "pointer-events-auto" : "pointer-events-none",
        )}
        aria-hidden={!abierto}
      >
        <div
          onClick={() => setAbierto(false)}
          className={cn(
            "absolute inset-0 bg-grafito/50 transition-opacity duration-200",
            abierto ? "opacity-100" : "opacity-0",
          )}
        />
        <aside
          className={cn(
            "absolute top-0 left-0 flex h-full w-72 max-w-[82%] flex-col justify-between bg-sidebar text-sidebar-foreground shadow-xl transition-transform duration-200 ease-out",
            abierto ? "translate-x-0" : "-translate-x-full",
          )}
        >
          <div>
            <div className="flex items-center justify-between px-5 pt-5 pb-4">
              <img
                src="/logo/cota_cero_logo_negativo_con_descriptor_outline.svg"
                alt="COTA CERO — Superficies y terminaciones"
                className="h-9"
              />
              <button
                type="button"
                onClick={() => setAbierto(false)}
                aria-label="Cerrar menú"
                className="flex size-8 items-center justify-center rounded-lg text-sidebar-foreground/70 transition-colors hover:bg-white/5 hover:text-sidebar-foreground"
              >
                <X className="size-5" />
              </button>
            </div>
            <div className="px-5 pb-2">
              <p className="text-[10px] font-medium tracking-[0.18em] text-sidebar-foreground/40 uppercase">
                Presupuestador
              </p>
            </div>
            <Navegacion pathname={pathname} onNavegar={() => setAbierto(false)} />
          </div>
          <BloqueUsuario usuario={usuario} />
        </aside>
      </div>

      {/* Sidebar fijo — solo desktop */}
      <aside className="sticky top-0 hidden h-screen w-60 shrink-0 flex-col justify-between bg-sidebar text-sidebar-foreground lg:flex">
        <div>
          <div className="px-5 pt-6 pb-5">
            <Link href="/presupuestos" className="inline-block">
              <img
                src="/logo/cota_cero_logo_negativo_con_descriptor_outline.svg"
                alt="COTA CERO — Superficies y terminaciones"
                className="h-9"
              />
            </Link>
          </div>
          <div className="px-5 pb-2">
            <p className="text-[10px] font-medium tracking-[0.18em] text-sidebar-foreground/40 uppercase">
              Presupuestador
            </p>
          </div>
          <Navegacion pathname={pathname} />
        </div>
        <BloqueUsuario usuario={usuario} />
      </aside>
    </>
  );
}
