import type { EstadoCatalogo, EstadoCliente, EstadoPresupuesto, TipoMovimiento } from "@/lib/tipos";

import { cn } from "@/lib/utils";

type Tono = "cobre" | "exito" | "rojo" | "neutro" | "gris";

const TONO_CLASS: Record<Tono, string> = {
  cobre: "border-cobre/40 bg-cobre/10 text-cobre-oscuro",
  exito: "border-exito/30 bg-exito/10 text-exito",
  rojo: "border-destructive/30 bg-destructive/8 text-destructive",
  neutro: "border-border bg-muted text-muted-foreground",
  gris: "border-transparent bg-muted/60 text-muted-foreground line-through decoration-piedra",
};

const DOT_CLASS: Record<Tono, string> = {
  cobre: "bg-cobre",
  exito: "bg-exito",
  rojo: "bg-destructive",
  neutro: "bg-piedra",
  gris: "bg-piedra",
};

function Pill({ tono, children, dot = true }: { tono: Tono; children: React.ReactNode; dot?: boolean }) {
  return (
    <span
      className={cn(
        "inline-flex h-5 shrink-0 items-center gap-1.5 rounded-full border px-2 text-xs font-medium whitespace-nowrap",
        TONO_CLASS[tono],
      )}
    >
      {dot && <span className={cn("size-1.5 rounded-full", DOT_CLASS[tono])} />}
      {children}
    </span>
  );
}

const ESTADO_PRESUPUESTO_TONO: Record<EstadoPresupuesto, Tono> = {
  Emitido: "cobre",
  Confirmado: "exito",
  Anulado: "rojo",
  Superado: "neutro",
};

export function EstadoPresupuestoBadge({ estado }: { estado: EstadoPresupuesto }) {
  return <Pill tono={ESTADO_PRESUPUESTO_TONO[estado]}>{estado}</Pill>;
}

export function EstadoClienteBadge({ estado }: { estado: EstadoCliente }) {
  return <Pill tono={estado === "Activo" ? "exito" : "neutro"}>{estado}</Pill>;
}

export function EstadoCatalogoBadge({ estado }: { estado: EstadoCatalogo }) {
  return <Pill tono={estado === "Habilitado" ? "exito" : "neutro"}>{estado}</Pill>;
}

const TIPO_MOVIMIENTO_TONO: Record<TipoMovimiento, Tono> = {
  CONFIRMACION_PRESUPUESTO: "cobre",
  PAGO: "exito",
  ANULACION_PRESUPUESTO: "rojo",
  ANULACION_PAGO: "rojo",
  AJUSTE: "neutro",
};

const TIPO_MOVIMIENTO_LABEL: Record<TipoMovimiento, string> = {
  CONFIRMACION_PRESUPUESTO: "Confirmación",
  PAGO: "Pago",
  ANULACION_PRESUPUESTO: "Anulación confirmación",
  ANULACION_PAGO: "Anulación pago",
  AJUSTE: "Ajuste",
};

export function TipoMovimientoBadge({ tipo }: { tipo: TipoMovimiento }) {
  return <Pill tono={TIPO_MOVIMIENTO_TONO[tipo]}>{TIPO_MOVIMIENTO_LABEL[tipo]}</Pill>;
}

/** Aviso "Verificar": ítems con precio dudoso heredado de la migración. */
export function VerificarBadge() {
  return <Pill tono="rojo">Verificar</Pill>;
}
