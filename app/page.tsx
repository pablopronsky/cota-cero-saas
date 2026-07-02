import { adminDb } from "@/lib/firebase/admin";

export const dynamic = "force-dynamic";

async function verificarConexion(): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    await adminDb.collection("_ping").limit(1).get();
    return { ok: true };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : String(error) };
  }
}

export default async function Home() {
  const resultado = await verificarConexion();

  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-zinc-50 font-sans dark:bg-black">
      <h1 className="text-2xl font-semibold text-black dark:text-zinc-50">
        COTA CERO — Presupuestador
      </h1>
      {resultado.ok ? (
        <p className="text-xl font-medium text-green-600">Conectado ✓</p>
      ) : (
        <div className="max-w-lg text-center">
          <p className="text-xl font-medium text-red-600">Error ✗</p>
          <p className="mt-2 break-words text-sm text-zinc-500">{resultado.error}</p>
        </div>
      )}
    </div>
  );
}
