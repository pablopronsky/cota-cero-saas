import { EditarPresupuesto } from "@/components/presupuestos/editar-presupuesto";

export default async function EditarPresupuestoPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <EditarPresupuesto id={id} />;
}
