"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { collection, onSnapshot, orderBy, query } from "firebase/firestore";
import { db } from "@/lib/firebase/client";
import { normalizar } from "@/lib/reglas/normalizar";
import type { EstadoPresupuesto, Presupuesto } from "@/lib/tipos";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

interface PresupuestoConId extends Presupuesto {
  id: string;
}

const ESTADO_VARIANT: Record<
  EstadoPresupuesto,
  "default" | "secondary" | "destructive" | "outline"
> = {
  Emitido: "default",
  Confirmado: "secondary",
  Anulado: "destructive",
  Superado: "outline",
};

const SELECT_CLASS =
  "h-8 rounded-lg border border-input bg-transparent px-2.5 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50";

const fmtMoneda = (n: number) => n.toLocaleString("es-AR", { style: "currency", currency: "ARS" });

export function ListadoPresupuestos() {
  const [presupuestos, setPresupuestos] = useState<PresupuestoConId[] | null>(null);
  const [busqueda, setBusqueda] = useState("");
  const [filtroEstado, setFiltroEstado] = useState("");
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

  const anios = useMemo(() => {
    if (!presupuestos) return [];
    return [...new Set(presupuestos.map((p) => p.obraCodigo.split("-")[1]))].sort().reverse();
  }, [presupuestos]);

  const grupos = useMemo(() => {
    if (!presupuestos) return [];
    const termino = normalizar(busqueda.trim());
    const filtrados = presupuestos.filter((p) => {
      if (filtroEstado && p.estado !== filtroEstado) return false;
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
        versiones: [...lista].sort((a, b) => b.version - a.version),
      }))
      .sort((a, b) => (a.obraCodigo < b.obraCodigo ? 1 : -1));
  }, [presupuestos, busqueda, filtroEstado, filtroAnio]);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-4">
        <h1 className="text-xl font-semibold">Presupuestos</h1>
        <Button asChild>
          <Link href="/presupuestos/nuevo">Nuevo presupuesto</Link>
        </Button>
      </div>

      <div className="flex flex-wrap gap-2">
        <Input
          placeholder="Buscar por cliente u obra..."
          value={busqueda}
          onChange={(e) => setBusqueda(e.target.value)}
          className="max-w-sm"
        />
        <select
          className={SELECT_CLASS}
          value={filtroEstado}
          onChange={(e) => setFiltroEstado(e.target.value)}
        >
          <option value="">Todos los estados</option>
          <option value="Emitido">Emitido</option>
          <option value="Confirmado">Confirmado</option>
          <option value="Anulado">Anulado</option>
          <option value="Superado">Superado</option>
        </select>
        <select
          className={SELECT_CLASS}
          value={filtroAnio}
          onChange={(e) => setFiltroAnio(e.target.value)}
        >
          <option value="">Todos los años</option>
          {anios.map((a) => (
            <option key={a} value={a}>
              {a}
            </option>
          ))}
        </select>
      </div>

      {presupuestos === null && <p className="text-muted-foreground">Cargando...</p>}
      {presupuestos !== null && grupos.length === 0 && (
        <p className="text-muted-foreground">Sin resultados.</p>
      )}

      <div className="space-y-3">
        {grupos.map((g) => (
          <Card key={g.obraCodigo}>
            <CardHeader>
              <CardTitle className="flex items-center justify-between text-sm font-normal">
                <span className="font-mono font-medium">{g.obraCodigo}</span>
                <span className="text-muted-foreground">{g.clienteNombre}</span>
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-1">
              {g.versiones.map((v) => (
                <Link
                  key={v.id}
                  href={`/presupuestos/${v.id}`}
                  className="flex items-center justify-between gap-4 rounded-md px-2 py-1.5 text-sm hover:bg-muted"
                >
                  <span className="w-12">
                    v{v.version}
                    {v.esLegado && " ·L"}
                  </span>
                  <span className="flex-1 text-muted-foreground">{v.modalidad}</span>
                  <Badge variant={ESTADO_VARIANT[v.estado]}>{v.estado}</Badge>
                  <span className="w-28 text-right font-medium">{fmtMoneda(v.total)}</span>
                </Link>
              ))}
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
