"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { collection, onSnapshot, orderBy, query } from "firebase/firestore";
import { Plus, Search, Users, Zap } from "lucide-react";
import { db } from "@/lib/firebase/client";
import { normalizar } from "@/lib/reglas/normalizar";
import type { Cliente } from "@/lib/tipos";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/ui/empty-state";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { EstadoClienteBadge } from "@/components/estado-badge";
import { PageHeader } from "@/components/page-header";
import { ClienteFormDialog } from "@/components/clientes/cliente-form-dialog";
import { ClienteAltaRapidaDialog } from "@/components/clientes/cliente-alta-rapida-dialog";

interface ClienteConCodigo extends Cliente {
  codigo: string;
}

const fmtMoneda = (n: number) => n.toLocaleString("es-AR", { style: "currency", currency: "ARS" });

export function ListadoClientes() {
  const router = useRouter();
  const [clientes, setClientes] = useState<ClienteConCodigo[] | null>(null);
  const [busqueda, setBusqueda] = useState("");
  const [dialogNuevo, setDialogNuevo] = useState(false);
  const [dialogRapido, setDialogRapido] = useState(false);

  useEffect(() => {
    const q = query(collection(db, "clientes"), orderBy("nombre"));
    return onSnapshot(
      q,
      (snap) => {
        setClientes(snap.docs.map((d) => ({ codigo: d.id, ...(d.data() as Cliente) })));
      },
      (error) => {
        // permission-denied esperado cuando el listener sigue activo al cerrar sesión.
        if (error.code !== "permission-denied") console.error(error);
      },
    );
  }, []);

  const filtrados = useMemo(() => {
    if (!clientes) return [];
    const termino = normalizar(busqueda.trim());
    if (!termino) return clientes;
    const soloDigitos = termino.replace(/\D/g, "");
    return clientes.filter((c) => {
      if (normalizar(c.nombre).includes(termino)) return true;
      if (normalizar(c.codigo).includes(termino)) return true;
      if (soloDigitos && c.telefono.replace(/\D/g, "").includes(soloDigitos)) return true;
      return false;
    });
  }, [clientes, busqueda]);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Clientes"
        description={
          clientes === null ? "Cargando clientes..." : `${clientes.length} cliente${clientes.length === 1 ? "" : "s"} en cartera`
        }
        actions={
          <>
            <Button variant="outline" onClick={() => setDialogRapido(true)}>
              <Zap data-icon="inline-start" />
              Alta rápida
            </Button>
            <Button onClick={() => setDialogNuevo(true)}>
              <Plus data-icon="inline-start" />
              Nuevo cliente
            </Button>
          </>
        }
      />

      <div className="relative w-full max-w-sm">
        <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          placeholder="Buscar por nombre, código o teléfono..."
          value={busqueda}
          onChange={(e) => setBusqueda(e.target.value)}
          className="bg-card pl-8"
        />
      </div>

      {clientes === null ? (
        <Skeleton className="h-64 w-full rounded-xl" />
      ) : filtrados.length === 0 ? (
        <Card>
          <EmptyState
            icon={Users}
            title={busqueda.trim() ? "Sin resultados" : "Todavía no hay clientes"}
            description={
              busqueda.trim()
                ? "Probá con otro nombre, código o teléfono."
                : "Cargá el primer cliente para poder presupuestar."
            }
          >
            {!busqueda.trim() && (
              <Button variant="outline" size="sm" onClick={() => setDialogNuevo(true)}>
                <Plus data-icon="inline-start" />
                Nuevo cliente
              </Button>
            )}
          </EmptyState>
        </Card>
      ) : (
        <>
          {/* Tabla — desktop/tablet */}
          <div className="hidden overflow-hidden rounded-xl bg-card ring-1 ring-foreground/10 md:block">
            <Table>
              <TableHeader>
                <TableRow className="hover:bg-transparent">
                  <TableHead className="pl-4">Código</TableHead>
                  <TableHead>Nombre</TableHead>
                  <TableHead>Teléfono</TableHead>
                  <TableHead>Localidad</TableHead>
                  <TableHead>Estado</TableHead>
                  <TableHead className="pr-4 text-right">Saldo</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtrados.map((c) => (
                  <TableRow
                    key={c.codigo}
                    className="cursor-pointer"
                    onClick={() => router.push(`/clientes/${c.codigo}`)}
                  >
                    <TableCell className="pl-4 font-mono text-xs text-muted-foreground">
                      {c.codigo}
                    </TableCell>
                    <TableCell>
                      <Link
                        href={`/clientes/${c.codigo}`}
                        className="font-medium hover:text-cobre-oscuro"
                        onClick={(e) => e.stopPropagation()}
                      >
                        {c.nombre}
                      </Link>
                    </TableCell>
                    <TableCell className="tnum text-muted-foreground">{c.telefono}</TableCell>
                    <TableCell className="text-muted-foreground">{c.localidad || "—"}</TableCell>
                    <TableCell>
                      <EstadoClienteBadge estado={c.estado} />
                    </TableCell>
                    <TableCell
                      className={`tnum pr-4 text-right font-medium ${
                        c.saldo > 0 ? "text-destructive" : c.saldo < 0 ? "text-exito" : "text-muted-foreground"
                      }`}
                    >
                      {fmtMoneda(c.saldo)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>

          {/* Tarjetas — mobile */}
          <div className="space-y-2 md:hidden">
            {filtrados.map((c) => (
              <Link
                key={c.codigo}
                href={`/clientes/${c.codigo}`}
                className="block rounded-xl bg-card p-3 ring-1 ring-foreground/10 transition-colors active:bg-accent/60"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate font-medium">{c.nombre}</p>
                    <p className="mt-0.5 font-mono text-xs text-muted-foreground">{c.codigo}</p>
                  </div>
                  <EstadoClienteBadge estado={c.estado} />
                </div>
                <div className="mt-3 flex items-end justify-between gap-3 border-t border-border pt-2.5">
                  <div className="min-w-0 text-xs text-muted-foreground">
                    <p className="tnum">{c.telefono}</p>
                    {c.localidad && <p className="truncate">{c.localidad}</p>}
                  </div>
                  <p
                    className={`tnum text-right text-sm font-semibold ${
                      c.saldo > 0 ? "text-destructive" : c.saldo < 0 ? "text-exito" : "text-muted-foreground"
                    }`}
                  >
                    {fmtMoneda(c.saldo)}
                  </p>
                </div>
              </Link>
            ))}
          </div>
        </>
      )}

      <ClienteFormDialog key={dialogNuevo ? "abierto" : "cerrado"} open={dialogNuevo} onOpenChange={setDialogNuevo} />
      <ClienteAltaRapidaDialog open={dialogRapido} onOpenChange={setDialogRapido} />
    </div>
  );
}
