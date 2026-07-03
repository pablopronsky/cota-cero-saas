"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { collection, onSnapshot, orderBy, query, where } from "firebase/firestore";
import { db } from "@/lib/firebase/client";
import type { Presupuesto } from "@/lib/tipos";
import { Skeleton } from "@/components/ui/skeleton";
import { EstadoPresupuestoBadge } from "@/components/estado-badge";

interface PresupuestoConId extends Presupuesto {
  id: string;
}

const fmtMoneda = (n: number) => n.toLocaleString("es-AR", { style: "currency", currency: "ARS" });

export function HistorialPresupuestosCliente({ clienteId }: { clienteId: string }) {
  const [presupuestos, setPresupuestos] = useState<PresupuestoConId[] | null>(null);

  useEffect(() => {
    return onSnapshot(
      query(
        collection(db, "presupuestos"),
        where("clienteId", "==", clienteId),
        orderBy("creadoEn", "desc"),
      ),
      (snap) => setPresupuestos(snap.docs.map((d) => ({ id: d.id, ...(d.data() as Presupuesto) }))),
      (error) => {
        if (error.code !== "permission-denied") console.error(error);
      },
    );
  }, [clienteId]);

  if (presupuestos === null) return <Skeleton className="h-24 w-full rounded-lg" />;
  if (presupuestos.length === 0)
    return <p className="text-sm text-muted-foreground">Sin presupuestos.</p>;

  return (
    <div className="space-y-0.5">
      {presupuestos.map((p) => (
        <Link
          key={p.id}
          href={`/presupuestos/${p.id}`}
          className="flex items-center justify-between gap-2 rounded-lg px-2 py-1.5 text-sm transition-colors hover:bg-accent/60"
        >
          <span className="font-mono text-xs text-cobre-oscuro">
            {p.obraCodigo} <span className="text-muted-foreground">v{p.version}</span>
          </span>
          <EstadoPresupuestoBadge estado={p.estado} />
          <span className="tnum font-medium">{fmtMoneda(p.total)}</span>
        </Link>
      ))}
    </div>
  );
}
