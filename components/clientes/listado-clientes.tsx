"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { collection, onSnapshot, orderBy, query } from "firebase/firestore";
import { db } from "@/lib/firebase/client";
import { normalizar } from "@/lib/reglas/normalizar";
import type { Cliente } from "@/lib/tipos";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { ClienteFormDialog } from "@/components/clientes/cliente-form-dialog";
import { ClienteAltaRapidaDialog } from "@/components/clientes/cliente-alta-rapida-dialog";

interface ClienteConCodigo extends Cliente {
  codigo: string;
}

export function ListadoClientes() {
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
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-4">
        <h1 className="text-xl font-semibold">Clientes</h1>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => setDialogRapido(true)}>
            Alta rápida
          </Button>
          <Button onClick={() => setDialogNuevo(true)}>Nuevo cliente</Button>
        </div>
      </div>

      <Input
        placeholder="Buscar por nombre, código o teléfono..."
        value={busqueda}
        onChange={(e) => setBusqueda(e.target.value)}
        className="max-w-sm"
      />

      <div className="rounded-md border bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Código</TableHead>
              <TableHead>Nombre</TableHead>
              <TableHead>Teléfono</TableHead>
              <TableHead>Localidad</TableHead>
              <TableHead>Estado</TableHead>
              <TableHead className="text-right">Saldo</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {clientes === null && (
              <TableRow>
                <TableCell colSpan={6} className="text-center text-muted-foreground">
                  Cargando...
                </TableCell>
              </TableRow>
            )}
            {clientes !== null && filtrados.length === 0 && (
              <TableRow>
                <TableCell colSpan={6} className="text-center text-muted-foreground">
                  Sin resultados.
                </TableCell>
              </TableRow>
            )}
            {filtrados.map((c) => (
              <TableRow key={c.codigo}>
                <TableCell className="font-mono text-xs">
                  <Link href={`/clientes/${c.codigo}`} className="hover:underline">
                    {c.codigo}
                  </Link>
                </TableCell>
                <TableCell>
                  <Link href={`/clientes/${c.codigo}`} className="hover:underline">
                    {c.nombre}
                  </Link>
                </TableCell>
                <TableCell>{c.telefono}</TableCell>
                <TableCell>{c.localidad || "—"}</TableCell>
                <TableCell>
                  <Badge variant={c.estado === "Activo" ? "default" : "secondary"}>
                    {c.estado}
                  </Badge>
                </TableCell>
                <TableCell className="text-right">
                  {c.saldo.toLocaleString("es-AR", { style: "currency", currency: "ARS" })}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      <ClienteFormDialog key={dialogNuevo ? "abierto" : "cerrado"} open={dialogNuevo} onOpenChange={setDialogNuevo} />
      <ClienteAltaRapidaDialog open={dialogRapido} onOpenChange={setDialogRapido} />
    </div>
  );
}
