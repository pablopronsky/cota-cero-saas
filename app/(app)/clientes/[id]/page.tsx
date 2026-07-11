import { FichaCliente } from "@/components/clientes/ficha-cliente";

export default async function ClientePage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ cuota?: string }>;
}) {
  const [{ id }, query] = await Promise.all([params, searchParams]);
  return <FichaCliente codigo={id} cuotaPagoInicialId={query.cuota} />;
}
