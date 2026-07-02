"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { doc, onSnapshot } from "firebase/firestore";
import { db } from "@/lib/firebase/client";
import { puedeEditarse } from "@/lib/reglas/validaciones";
import type { Presupuesto } from "@/lib/tipos";
import { PresupuestoForm, presupuestoAPrefill } from "@/components/presupuestos/presupuesto-form";

export function EditarPresupuesto({ id }: { id: string }) {
  const [presupuesto, setPresupuesto] = useState<Presupuesto | null | undefined>(undefined);

  useEffect(() => {
    return onSnapshot(
      doc(db, "presupuestos", id),
      (snap) => setPresupuesto(snap.exists() ? (snap.data() as Presupuesto) : null),
      (error) => {
        if (error.code !== "permission-denied") console.error(error);
      },
    );
  }, [id]);

  if (presupuesto === undefined) return <p className="text-muted-foreground">Cargando...</p>;
  if (presupuesto === null) return <p className="text-muted-foreground">Presupuesto no encontrado.</p>;

  if (presupuesto.esLegado || !puedeEditarse(presupuesto.estado)) {
    return (
      <div className="space-y-2">
        <p className="text-muted-foreground">
          Este presupuesto no se puede editar
          {presupuesto.esLegado ? " (es legado)" : ` (estado ${presupuesto.estado})`}.
        </p>
        <Link href={`/presupuestos/${id}`} className="text-sm text-primary hover:underline">
          Volver al detalle
        </Link>
      </div>
    );
  }

  return (
    <PresupuestoForm modo="editar" presupuestoId={id} prefill={presupuestoAPrefill(presupuesto)} />
  );
}
