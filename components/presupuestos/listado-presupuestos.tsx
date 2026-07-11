"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { collection, onSnapshot, orderBy, query } from "firebase/firestore";
import { FileText, Plus, Search } from "lucide-react";
import { db } from "@/lib/firebase/client";
import { normalizar } from "@/lib/reglas/normalizar";
import type { ModalidadPresupuesto, Obra, Presupuesto } from "@/lib/tipos";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { NativeSelect } from "@/components/ui/native-select";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/ui/empty-state";
import { EstadoComercialBadge, EstadoPresupuestoBadge } from "@/components/estado-badge";
import { VigenciaChip } from "@/components/comercial/vigencia-chip";
import { PageHeader } from "@/components/page-header";

interface PresupuestoConId extends Presupuesto {
  id: string;
}

const MODALIDAD_LABEL: Record<ModalidadPresupuesto, string> = {
  integrada: "Integrada",
  colocacion: "Colocación",
  materiales: "Solo materiales",
};

const fmtMoneda = (n: number) => n.toLocaleString("es-AR", { style: "currency", currency: "ARS" });

export function ListadoPresupuestos() {
  const [presupuestos, setPresupuestos] = useState<PresupuestoConId[] | null>(null);
  const [obras, setObras] = useState<Record<string, Obra>>({});
  const [busqueda, setBusqueda] = useState("");
  const [filtroEstado, setFiltroEstado] = useState("");
  const [filtroComercial, setFiltroComercial] = useState("");
  const [filtroAnio, setFiltroAnio] = useState("");

  useEffect(() => {
    return onSnapshot(
      query(collection(db, "presupuestos"), orderBy("creadoEn", "desc")),
      (snap) => setPresupuestos(snap.docs.map((d) => ({ id: d.id, ...(d.data() as Presupuesto) }))),
      (error) => {
        if (error.code !== "permission-denied") console.error(error);
      },
    );
  }, []);

  useEffect(() => {
    return onSnapshot(collection(db, "obras"), (snap) => {
      setObras(Object.fromEntries(snap.docs.map((d) => [d.id, d.data() as Obra])));
    });
  }, []);

  const anios = useMemo(() => {
    if (!presupuestos) return [];
    return [...new Set(presupuestos.map((p) => p.obraCodigo.split("-")[1]))].sort().reverse();
  }, [presupuestos]);

  const grupos = useMemo(() => {
    if (!presupuestos) return [];
    const termino = normalizar(busqueda.trim());
    const filtrados = presupuestos.filter((p) => {
      if (filtroEstado && p.estado !== filtroEstado) return false;
      if (filtroComercial && obras[p.obraCodigo]?.estadoComercial !== filtroComercial) return false;
      if (filtroAnio && !p.obraCodigo.includes(`-${filtroAnio}-`)) return false;
      if (
        termino &&
        !normalizar(p.clienteNombre).includes(termino) &&
        !normalizar(p.obraCodigo).includes(termino)
      ) {
        return false;
      }
      return true;
    });

    const porObra = new Map<string, PresupuestoConId[]>();
    for (const p of filtrados) {
      const lista = porObra.get(p.obraCodigo) ?? [];
      lista.push(p);
      porObra.set(p.obraCodigo, lista);
    }

    return [...porObra.entries()]
      .map(([obraCodigo, lista]) => ({
        obraCodigo,
        clienteNombre: lista[0].clienteNombre,
        estadoComercial: obras[obraCodigo]?.estadoComercial,
        versiones: [...lista].sort((a, b) => b.version - a.version),
      }))
      .sort((a, b) => (a.obraCodigo < b.obraCodigo ? 1 : -1));
  }, [presupuestos, obras, busqueda, filtroEstado, filtroComercial, filtroAnio]);

  const hayFiltros = busqueda.trim() !== "" || filtroEstado !== "" || filtroComercial !== "" || filtroAnio !== "";

  return (
    <div className="space-y-6">
      <PageHeader
        title="Presupuestos"
        description={
          presupuestos === null
            ? "Cargando obras..."
            : `${grupos.length} obra${grupos.length === 1 ? "" : "s"} · ${presupuestos.length} presupuesto${presupuestos.length === 1 ? "" : "s"}`
        }
        actions={
          <Button asChild>
            <Link href="/presupuestos/nuevo">
              <Plus data-icon="inline-start" />
              Nuevo presupuesto
            </Link>
          </Button>
        }
      />

      <div className="flex flex-wrap gap-2">
        <div className="relative w-full max-w-sm">
          <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Buscar por cliente u obra..."
            value={busqueda}
            onChange={(e) => setBusqueda(e.target.value)}
            className="bg-card pl-8"
          />
        </div>
        <NativeSelect value={filtroEstado} onChange={(e) => setFiltroEstado(e.target.value)}>
          <option value="">Todos los estados</option>
          <option value="Emitido">Emitido</option>
          <option value="Confirmado">Confirmado</option>
          <option value="Anulado">Anulado</option>
          <option value="Superado">Superado</option>
        </NativeSelect>
        <NativeSelect value={filtroComercial} onChange={(e) => setFiltroComercial(e.target.value)}>
          <option value="">Todos los estados comerciales</option>
          <option value="PendienteEnvio">Pendiente de envío</option>
          <option value="Enviado">Enviado</option>
          <option value="EnNegociacion">En negociación</option>
          <option value="Ganado">Ganado</option>
          <option value="Perdido">Perdido</option>
        </NativeSelect>
        <NativeSelect value={filtroAnio} onChange={(e) => setFiltroAnio(e.target.value)}>
          <option value="">Todos los años</option>
          {anios.map((a) => (
            <option key={a} value={a}>
              {a}
            </option>
          ))}
        </NativeSelect>
      </div>

      {presupuestos === null && (
        <div className="space-y-3">
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} className="h-28 w-full rounded-xl" />
          ))}
        </div>
      )}

      {presupuestos !== null && grupos.length === 0 && (
        <Card>
          <EmptyState
            icon={FileText}
            title={hayFiltros ? "Sin resultados" : "Todavía no hay presupuestos"}
            description={
              hayFiltros
                ? "Probá con otro término de búsqueda o limpiá los filtros."
                : "Creá el primer presupuesto para empezar a trabajar."
            }
          >
            {!hayFiltros && (
              <Button asChild variant="outline" size="sm">
                <Link href="/presupuestos/nuevo">
                  <Plus data-icon="inline-start" />
                  Nuevo presupuesto
                </Link>
              </Button>
            )}
          </EmptyState>
        </Card>
      )}

      <div className="space-y-3">
        {grupos.map((g) => (
          <Card key={g.obraCodigo} size="sm">
            <CardHeader className="border-b [.border-b]:pb-3">
              <CardTitle className="flex items-baseline justify-between gap-4 text-sm">
                <span className="font-mono font-semibold tracking-tight text-cobre-oscuro">
                  {g.obraCodigo}
                </span>
                <span className="flex min-w-0 items-center gap-2">
                  <span className="truncate font-sans font-normal text-muted-foreground">{g.clienteNombre}</span>
                  <EstadoComercialBadge estado={g.estadoComercial} />
                </span>
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-0.5">
              {g.versiones.map((v) => (
                <Link
                  key={v.id}
                  href={`/presupuestos/${v.id}`}
                  className="group flex items-center gap-3 rounded-lg px-2 py-2 text-sm transition-colors hover:bg-accent/60"
                >
                  <span className="inline-flex h-5 w-9 shrink-0 items-center justify-center rounded-md bg-muted font-mono text-xs font-medium text-muted-foreground">
                    v{v.version}
                  </span>
                  {v.esLegado && (
                    <span className="shrink-0 rounded-md border border-border px-1.5 py-0.5 text-[10px] tracking-wide text-muted-foreground uppercase">
                      Legado
                    </span>
                  )}
                  <span className="flex-1 truncate text-muted-foreground">
                    {MODALIDAD_LABEL[v.modalidad]}
                  </span>
                  <EstadoPresupuestoBadge estado={v.estado} />
                  <VigenciaChip venceEl={v.venceEl} estadoComercial={g.estadoComercial} />
                  <span className="tnum w-32 text-right font-semibold">{fmtMoneda(v.total)}</span>
                </Link>
              ))}
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
