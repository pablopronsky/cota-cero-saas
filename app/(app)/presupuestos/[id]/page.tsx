import { DetallePresupuesto } from "@/components/presupuestos/detalle-presupuesto";

export default async function PresupuestoPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <DetallePresupuesto id={id} />;
}
