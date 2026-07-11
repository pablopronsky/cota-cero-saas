import type { EstadoComercial } from "@/lib/tipos";

/** Extrae días de textos habituales como "15 días". Sin un número válido, no hay vigencia calculable. */
export function parseValidezDias(validez: string): number | null {
  const match = validez.match(/\d+/);
  if (!match) return null;

  const dias = Number.parseInt(match[0], 10);
  return Number.isSafeInteger(dias) && dias >= 0 ? dias : null;
}

/** Un presupuesto puede vencer solo mientras su obra sigue en un estado comercial activo. */
export function estaVencido(
  venceEl: Date | { toDate(): Date } | null | undefined,
  estadoComercial: EstadoComercial,
  hoy = new Date(),
): boolean {
  if (!venceEl || !["PendienteEnvio", "Enviado", "EnNegociacion"].includes(estadoComercial)) {
    return false;
  }

  const fecha = venceEl instanceof Date ? venceEl : venceEl.toDate();
  return fecha.getTime() < hoy.getTime();
}
