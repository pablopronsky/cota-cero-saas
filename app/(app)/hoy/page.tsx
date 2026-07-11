import Link from "next/link";
import {
  AlertTriangle,
  CalendarClock,
  CircleCheck,
  Clock,
  Eye,
  FileWarning,
  MessageSquarePlus,
  Wallet,
} from "lucide-react";
import { obtenerDatosHoy } from "@/lib/consultas/hoy";
import type { CuotaHoy, PresupuestoHoy, SeguimientoHoy } from "@/lib/consultas/hoy";
import { PageHeader } from "@/components/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Button } from "@/components/ui/button";

const fmtMoneda = (n: number) =>
  n.toLocaleString("es-AR", { style: "currency", currency: "ARS", maximumFractionDigits: 0 });
const fmtDias = (f: Date, hoy: Date) =>
  Math.round((f.getTime() - hoy.getTime()) / (24 * 60 * 60 * 1000));

function IndicadorMes({ label, valor }: { label: string; valor: string }) {
  return (
    <Card size="sm">
      <CardContent className="py-4">
        <p className="text-xs text-muted-foreground">{label}</p>
        <p className="tnum mt-1 text-xl font-semibold tracking-tight">{valor}</p>
      </CardContent>
    </Card>
  );
}

function Bandeja({
  icon: Icon,
  title,
  count,
  emptyTitle,
  children,
}: {
  icon: React.ElementType;
  title: string;
  count: number;
  emptyTitle: string;
  children?: React.ReactNode;
}) {
  return (
    <Card size="sm">
      <CardHeader className="flex-row items-center justify-between gap-3 border-b [.border-b]:pb-3">
        <CardTitle className="flex items-center gap-2 text-sm">
          <Icon className="size-4 text-cobre" />
          {title}
        </CardTitle>
        {count > 0 && (
          <span className="inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-muted px-1.5 text-xs font-medium text-muted-foreground">
            {count}
          </span>
        )}
      </CardHeader>
      <CardContent className="space-y-0.5">
        {count === 0 ? (
          <p className="flex items-center gap-2 px-2 py-3 text-sm text-muted-foreground">
            <CircleCheck className="size-4 text-exito" />
            {emptyTitle}
          </p>
        ) : (
          children
        )}
      </CardContent>
    </Card>
  );
}

function ItemFila({
  href,
  titulo,
  subtitulo,
  detalle,
  acciones,
}: {
  href: string;
  titulo: string;
  subtitulo: string;
  detalle: string;
  acciones?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-2 rounded-lg px-2 py-2 text-sm transition-colors hover:bg-accent/60 sm:flex-row sm:items-center sm:justify-between sm:gap-3">
      <Link href={href} className="min-w-0 flex-1">
        <span className="block truncate font-medium">{titulo}</span>
        <span className="mt-0.5 flex flex-wrap items-center gap-x-3 text-xs text-muted-foreground">
          <span className="truncate">{subtitulo}</span>
          <span className="tnum whitespace-nowrap">{detalle}</span>
        </span>
      </Link>
      <div className="flex shrink-0 flex-wrap gap-1.5">
        <Button asChild size="xs" variant="ghost">
          <Link href={href}><Eye data-icon="inline-start" /> Ver</Link>
        </Button>
        {acciones}
      </div>
    </div>
  );
}

function FilaSeguimiento({ item, hoy }: { item: SeguimientoHoy; hoy: Date }) {
  const dias = fmtDias(item.proximoSeguimiento, hoy);
  const detalle = dias < 0 ? `Atrasado ${Math.abs(dias)}d` : "Hoy";
  const href = item.presupuestoId ? `/presupuestos/${item.presupuestoId}` : "/presupuestos";
  return (
    <ItemFila
      href={href}
      titulo={item.clienteNombre}
      subtitulo={item.obraCodigo}
      detalle={detalle}
      acciones={item.presupuestoId ? (
        <Button asChild size="xs" variant="outline">
          <Link href={`/presupuestos/${item.presupuestoId}?accion=contacto`}>
            <MessageSquarePlus data-icon="inline-start" /> Registrar contacto
          </Link>
        </Button>
      ) : undefined}
    />
  );
}

function FilaPresupuesto({ item, hoy }: { item: PresupuestoHoy; hoy: Date }) {
  const dias = fmtDias(item.venceEl, hoy);
  const detalle = dias < 0 ? `Venció hace ${Math.abs(dias)}d` : `Vence en ${dias}d`;
  return (
    <ItemFila
      href={`/presupuestos/${item.presupuestoId}`}
      titulo={item.clienteNombre}
      subtitulo={`${item.obraCodigo} v${item.version} · ${fmtMoneda(item.total)}`}
      detalle={detalle}
      acciones={(
        <Button asChild size="xs" variant="outline">
          <Link href={`/presupuestos/${item.presupuestoId}?accion=contacto`}>
            <MessageSquarePlus data-icon="inline-start" /> Registrar contacto
          </Link>
        </Button>
      )}
    />
  );
}

function FilaCuota({ item, hoy }: { item: CuotaHoy; hoy: Date }) {
  const dias = fmtDias(item.venceEl, hoy);
  const detalle = dias < 0 ? `Vencida hace ${Math.abs(dias)}d` : `Vence en ${dias}d`;
  return (
    <ItemFila
      href={`/clientes/${item.clienteId}`}
      titulo={item.clienteNombre}
      subtitulo={`${item.concepto} · ${fmtMoneda(item.monto)}`}
      detalle={detalle}
      acciones={(
        <Button asChild size="xs" variant="outline">
          <Link href={`/clientes/${item.clienteId}?cuota=${item.cuotaId}`}>
            <Wallet data-icon="inline-start" /> Registrar pago
          </Link>
        </Button>
      )}
    />
  );
}

export default async function HoyPage() {
  const hoy = new Date();
  const datos = await obtenerDatosHoy(hoy);
  const {
    seguimientos,
    presupuestosPorVencer,
    presupuestosVencidos,
    cuotasVencidas,
    cuotasPorVencer,
    indicadores,
  } = datos;

  const todoVacio =
    seguimientos.length === 0 &&
    presupuestosPorVencer.length === 0 &&
    presupuestosVencidos.length === 0 &&
    cuotasVencidas.length === 0 &&
    cuotasPorVencer.length === 0;

  return (
    <div className="space-y-6">
      <PageHeader title="Hoy" description="Lo que necesita atención primero." />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <IndicadorMes label="Emitido este mes" valor={fmtMoneda(indicadores.emitido)} />
        <IndicadorMes label="Confirmado este mes" valor={fmtMoneda(indicadores.confirmado)} />
        <IndicadorMes label="Cobrado este mes" valor={fmtMoneda(indicadores.cobrado)} />
        <IndicadorMes
          label="Conversión del mes"
          valor={indicadores.conversion === null ? "—" : `${Math.round(indicadores.conversion * 100)}%`}
        />
      </div>

      {todoVacio ? (
        <Card>
          <EmptyState
            icon={AlertTriangle}
            title="No hay nada urgente"
            description="Las cuatro bandejas están al día."
          />
        </Card>
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          <Bandeja
            icon={CalendarClock}
            title="Seguimientos de hoy y atrasados"
            count={seguimientos.length}
            emptyTitle="No hay seguimientos pendientes"
          >
            {seguimientos.map((s) => (
              <FilaSeguimiento key={s.obraCodigo} item={s} hoy={hoy} />
            ))}
          </Bandeja>

          <Bandeja
            icon={Clock}
            title="Presupuestos por vencer"
            count={presupuestosPorVencer.length}
            emptyTitle="No hay presupuestos por vencer"
          >
            {presupuestosPorVencer.map((p) => (
              <FilaPresupuesto key={p.presupuestoId} item={p} hoy={hoy} />
            ))}
          </Bandeja>

          <Bandeja
            icon={FileWarning}
            title="Presupuestos vencidos sin cierre"
            count={presupuestosVencidos.length}
            emptyTitle="No hay presupuestos vencidos sin cerrar"
          >
            {presupuestosVencidos.map((p) => (
              <FilaPresupuesto key={p.presupuestoId} item={p} hoy={hoy} />
            ))}
          </Bandeja>

          <Bandeja
            icon={Wallet}
            title="Cuotas vencidas y por vencer"
            count={cuotasVencidas.length + cuotasPorVencer.length}
            emptyTitle="No hay cuotas pendientes esta semana"
          >
            {[...cuotasVencidas, ...cuotasPorVencer].map((c) => (
              <FilaCuota key={c.cuotaId} item={c} hoy={hoy} />
            ))}
          </Bandeja>
        </div>
      )}
    </div>
  );
}
