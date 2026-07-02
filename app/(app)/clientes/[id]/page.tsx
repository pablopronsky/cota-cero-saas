import { FichaCliente } from "@/components/clientes/ficha-cliente";

export default async function ClientePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <FichaCliente codigo={id} />;
}
