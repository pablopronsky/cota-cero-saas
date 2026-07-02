"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { collection, onSnapshot, orderBy, query, where } from "firebase/firestore";
import { db } from "@/lib/firebase/client";
import type { EstadoPresupuesto, Presupuesto } from "@/lib/tipos";
import { Badge } from "@/components/ui/badge";

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

  if (presupuestos === null) return <p className="text-muted-foreground">Cargando...</p>;
  if (presupuestos.length === 0) return <p className="text-muted-foreground">Sin presupuestos.</p>;

  return (
    <div className="space-y-1">
      {presupuestos.map((p) => (
        <Link
          key={p.id}
          href={`/presupuestos/${p.id}`}
          className="flex items-center justify-between gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-muted"
        >
          <span className="font-mono text-xs">
            {p.obraCodigo} v{p.version}
          </span>
          <Badge variant={ESTADO_VARIANT[p.estado]}>{p.estado}</Badge>
          <span className="font-medium">{fmtMoneda(p.total)}</span>
        </Link>
      ))}
    </div>
  );
}
