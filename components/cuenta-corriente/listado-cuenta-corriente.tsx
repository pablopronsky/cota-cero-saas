"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { collection, onSnapshot, query, where } from "firebase/firestore";
import { Wallet } from "lucide-react";
import { db } from "@/lib/firebase/client";
import type { Cliente } from "@/lib/tipos";
import { Card, CardContent } from "@/components/ui/card";
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
import { PageHeader } from "@/components/page-header";

interface ClienteConCodigo extends Cliente {
  codigo: string;
}

const fmtMoneda = (n: number) => n.toLocaleString("es-AR", { style: "currency", currency: "ARS" });

export function ListadoCuentaCorriente() {
  const router = useRouter();
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
    <div className="space-y-6">
      <PageHeader
        title="Cuenta corriente"
        description="Clientes con saldo distinto de cero."
      />

      <div className="grid grid-cols-2 gap-4 md:max-w-xl">
        <Card size="sm">
          <CardContent>
            <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
              Total deudores
            </p>
            <p className="tnum mt-1 text-xl font-semibold text-destructive">
              {clientes === null ? "—" : fmtMoneda(totalDeuda)}
            </p>
            <p className="mt-0.5 text-xs text-muted-foreground">
              {deudores.length} cliente{deudores.length === 1 ? "" : "s"}
            </p>
          </CardContent>
        </Card>
        <Card size="sm">
          <CardContent>
            <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
              Total a favor
            </p>
            <p className="tnum mt-1 text-xl font-semibold text-exito">
              {clientes === null ? "—" : fmtMoneda(totalAFavor)}
            </p>
            <p className="mt-0.5 text-xs text-muted-foreground">
              {aFavor.length} cliente{aFavor.length === 1 ? "" : "s"}
            </p>
          </CardContent>
        </Card>
      </div>

      {clientes === null ? (
        <Skeleton className="h-48 w-full rounded-xl" />
      ) : clientes.length === 0 ? (
        <Card>
          <EmptyState
            icon={Wallet}
            title="Ningún cliente tiene saldo pendiente"
            description="Cuando confirmes un presupuesto o registres un pago, el saldo aparece acá."
          />
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
                  <TableHead className="pr-4 text-right">Saldo</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {clientes.map((c) => (
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
                    <TableCell
                      className={`tnum pr-4 text-right font-semibold ${
                        c.saldo > 0 ? "text-destructive" : "text-exito"
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
            {clientes.map((c) => (
              <Link
                key={c.codigo}
                href={`/clientes/${c.codigo}`}
                className="flex items-center justify-between gap-3 rounded-xl bg-card p-3 ring-1 ring-foreground/10 transition-colors active:bg-accent/60"
              >
                <div className="min-w-0">
                  <p className="truncate font-medium">{c.nombre}</p>
                  <p className="mt-0.5 font-mono text-xs text-muted-foreground">{c.codigo}</p>
                </div>
                <p
                  className={`tnum shrink-0 text-right font-semibold ${
                    c.saldo > 0 ? "text-destructive" : "text-exito"
                  }`}
                >
                  {fmtMoneda(c.saldo)}
                </p>
              </Link>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
