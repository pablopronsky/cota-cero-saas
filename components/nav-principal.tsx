"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { CerrarSesionBoton } from "@/components/cerrar-sesion-boton";
import type { UsuarioSesion } from "@/lib/firebase/sesion";

const ENLACES = [
  { href: "/presupuestos", label: "Presupuestos" },
  { href: "/clientes", label: "Clientes" },
  { href: "/catalogo", label: "Catálogo" },
  { href: "/cuenta-corriente", label: "Cuenta corriente" },
];

export function NavPrincipal({ usuario }: { usuario: UsuarioSesion }) {
  const pathname = usePathname();

  return (
    <aside className="flex w-56 shrink-0 flex-col justify-between bg-sidebar text-sidebar-foreground">
      <div>
        <div className="flex items-center px-4 py-5">
          <img
            src="/logo/cota_cero_logo_negativo_outline.svg"
            alt="COTA CERO"
            className="h-6"
          />
        </div>
        <nav className="flex flex-col gap-1 px-2">
          {ENLACES.map((enlace) => {
            const activo = pathname.startsWith(enlace.href);
            return (
              <Link
                key={enlace.href}
                href={enlace.href}
                className={cn(
                  "rounded-md px-3 py-2 text-sm font-medium transition-colors",
                  activo
                    ? "bg-sidebar-primary text-sidebar-primary-foreground"
                    : "text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
                )}
              >
                {enlace.label}
              </Link>
            );
          })}
        </nav>
      </div>
      <div className="border-t border-sidebar-border px-2 py-3">
        <p className="truncate px-3 pb-2 text-xs text-sidebar-foreground/60">
          {usuario.nombre}
        </p>
        <CerrarSesionBoton />
      </div>
    </aside>
  );
}
