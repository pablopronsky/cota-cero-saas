import { DetallePresupuesto } from "@/components/presupuestos/detalle-presupuesto";

export default async function PresupuestoPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ accion?: string }>;
}) {
  const [{ id }, query] = await Promise.all([params, searchParams]);
  return <DetallePresupuesto id={id} abrirContactoInicial={query.accion === "contacto"} />;
}
