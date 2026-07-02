"use client";

import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { doc, onSnapshot } from "firebase/firestore";
import { db } from "@/lib/firebase/client";
import type { Presupuesto } from "@/lib/tipos";
import { PresupuestoForm, presupuestoAPrefill } from "@/components/presupuestos/presupuesto-form";

/** Maneja tanto la creación normal como el duplicado (?duplicarDe=&destino=). */
export function NuevoPresupuesto() {
  const searchParams = useSearchParams();
  const duplicarDe = searchParams.get("duplicarDe");
  const destino = searchParams.get("destino");

  const [origen, setOrigen] = useState<Presupuesto | null | undefined>(
    duplicarDe ? undefined : null,
  );

  useEffect(() => {
    if (!duplicarDe) return;
    return onSnapshot(
      doc(db, "presupuestos", duplicarDe),
      (snap) => setOrigen(snap.exists() ? (snap.data() as Presupuesto) : null),
      (error) => {
        if (error.code !== "permission-denied") console.error(error);
      },
    );
  }, [duplicarDe]);

  if (duplicarDe && origen === undefined) {
    return <p className="text-muted-foreground">Cargando...</p>;
  }
  if (duplicarDe && origen === null) {
    return <p className="text-muted-foreground">Presupuesto de origen no encontrado.</p>;
  }

  if (duplicarDe && origen) {
    return (
      <PresupuestoForm
        modo="duplicar"
        obraCodigoDestino={destino === "nuevaVersion" ? origen.obraCodigo : undefined}
        prefill={presupuestoAPrefill(origen)}
      />
    );
  }

  return <PresupuestoForm />;
}
