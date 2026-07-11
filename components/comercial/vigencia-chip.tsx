"use client";

import type { EstadoComercial } from "@/lib/tipos";
import { estaVencido } from "@/lib/reglas/vigencia";

type FechaFirestore = Date | { toDate(): Date } | null | undefined;

function comoFecha(fecha: FechaFirestore): Date | null {
  if (!fecha) return null;
  return fecha instanceof Date ? fecha : fecha.toDate();
}

export function VigenciaChip({
  venceEl,
  estadoComercial,
}: {
  venceEl: FechaFirestore;
  estadoComercial?: EstadoComercial | null;
}) {
  const fecha = comoFecha(venceEl);
  if (!fecha || !estadoComercial) return null;

  const ahora = new Date();
  const diferencia = Math.ceil((fecha.getTime() - ahora.getTime()) / (24 * 60 * 60 * 1000));
  if (estaVencido(fecha, estadoComercial, ahora)) {
    return (
      <span className="shrink-0 rounded-full border border-destructive/30 px-2 py-0.5 text-[11px] font-medium text-destructive uppercase">
        Vencido hace {Math.max(1, Math.abs(diferencia))} días
      </span>
    );
  }
  if (["PendienteEnvio", "Enviado", "EnNegociacion"].includes(estadoComercial)) {
    return (
      <span className="shrink-0 rounded-full border border-border px-2 py-0.5 text-[11px] font-medium text-muted-foreground">
        Vence en {Math.max(0, diferencia)} días
      </span>
    );
  }
  return null;
}
