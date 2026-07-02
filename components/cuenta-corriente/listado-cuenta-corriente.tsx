"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { collection, onSnapshot, query, where } from "firebase/firestore";
import { db } from "@/lib/firebase/client";
import type { Cliente } from "@/lib/tipos";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

interface ClienteConCodigo extends Cliente {
  codigo: string;
}

const fmtMoneda = (n: number) => n.toLocaleString("es-AR", { style: "currency", currency: "ARS" });

export function ListadoCuentaCorriente() {
  const [clientes, setClientes] = useState<ClienteConCodigo[] | null>(null);

  useEffect(() => {
    return onSnapshot(
      query(collection(db, "clientes"), where("saldo", "!=", 0)),
      (snap) => {
        const lista = snap.docs.map((d) => ({ codigo: d.id, ...(d.data() as Cliente) }));
        lista.sort((a, b) => a.nombre.localeCompare(b.nombre));
        setClientes(lista);
      },
      (error) => {
        if (error.code !== "permission-denied") console.error(error);
      },
    );
  }, []);

  const deudores = clientes?.filter((c) => c.saldo > 0) ?? [];
  const aFavor = clientes?.filter((c) => c.saldo < 0) ?? [];
  const totalDeuda = deudores.reduce((acc, c) => acc + c.saldo, 0);
  const totalAFavor = aFavor.reduce((acc, c) => acc + c.saldo, 0);

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-semibold">Cuenta corriente</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Clientes con saldo distinto de cero. Total deudores: {fmtMoneda(totalDeuda)} · Total a
          favor: {fmtMoneda(totalAFavor)}
        </p>
      </div>

      <div className="rounded-md border bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Código</TableHead>
              <TableHead>Nombre</TableHead>
              <TableHead className="text-right">Saldo</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {clientes === null && (
              <TableRow>
                <TableCell colSpan={3} className="text-center text-muted-foreground">
                  Cargando...
                </TableCell>
              </TableRow>
            )}
            {clientes !== null && clientes.length === 0 && (
              <TableRow>
                <TableCell colSpan={3} className="text-center text-muted-foreground">
                  Ningún cliente tiene saldo pendiente.
                </TableCell>
              </TableRow>
            )}
            {clientes?.map((c) => (
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
                <TableCell
                  className={`text-right font-medium ${c.saldo > 0 ? "text-destructive" : "text-primary"}`}
                >
                  {fmtMoneda(c.saldo)}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
