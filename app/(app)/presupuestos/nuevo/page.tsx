import { Suspense } from "react";
import { NuevoPresupuesto } from "@/components/presupuestos/nuevo-presupuesto";

export default function NuevoPresupuestoPage() {
  return (
    <Suspense fallback={<p className="text-muted-foreground">Cargando...</p>}>
      <NuevoPresupuesto />
    </Suspense>
  );
}
