import type { Transaction } from "firebase-admin/firestore";
import { adminDb } from "@/lib/firebase/admin";
import type { NombreContador } from "@/lib/tipos";

const PREFIJOS: Record<"clientes" | "movimientos", { prefijo: string; digitos: number }> = {
  clientes: { prefijo: "CLI-", digitos: 4 },
  movimientos: { prefijo: "MOV-", digitos: 6 },
};

/**
 * Lee e incrementa `contadores/{nombre}` DENTRO de la transacción recibida (R6),
 * y devuelve el código formateado correspondiente. Debe llamarse antes de
 * cualquier otra lectura de la transacción que dependa del número.
 */
export async function proximoCodigo(tx: Transaction, nombre: NombreContador): Promise<string> {
  const ref = adminDb.collection("contadores").doc(nombre);
  const snap = await tx.get(ref);
  const ultimo = snap.exists ? (snap.data()?.ultimo as number) : 0;
  const siguiente = ultimo + 1;

  tx.set(ref, { ultimo: siguiente }, { merge: true });

  if (nombre.startsWith("obras-")) {
    const anio = nombre.slice("obras-".length);
    return `COTA-${anio}-${String(siguiente).padStart(4, "0")}`;
  }

  const { prefijo, digitos } = PREFIJOS[nombre as "clientes" | "movimientos"];
  return `${prefijo}${String(siguiente).padStart(digitos, "0")}`;
}
