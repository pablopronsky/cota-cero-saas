import Link from "next/link";
import { Button } from "@/components/ui/button";

export default function PresupuestosPage() {
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">Presupuestos</h1>
        <Button asChild>
          <Link href="/presupuestos/nuevo">Nuevo presupuesto</Link>
        </Button>
      </div>
      <p className="text-sm text-muted-foreground">Listado próximamente (Fase 6).</p>
    </div>
  );
}
