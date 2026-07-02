/**
 * Recalcula el saldo de cada cliente sumando sus movimientos (debe - haber)
 * y lo compara contra el campo `clientes.saldo` denormalizado. Reporta
 * diferencias, no corrige nada.
 *
 * Uso:
 *   npm run reconciliar                    → contra el emulador
 *   npm run reconciliar -- --produccion    → contra producción (solo lectura)
 */
import { resolve } from "node:path";
import { config as cargarEnv } from "dotenv";
import { cert, getApps, initializeApp } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import type { Cliente, Movimiento } from "../lib/tipos";

cargarEnv({ path: resolve(__dirname, "../.env.local") });

const produccion = process.argv.includes("--produccion");

function inicializarAdmin() {
  if (getApps().length) return getApps()[0];

  if (!produccion) {
    process.env.FIRESTORE_EMULATOR_HOST ??= "127.0.0.1:8080";
    if (!process.env.FIRESTORE_EMULATOR_HOST.match(/^(127\.0\.0\.1|localhost)/)) {
      throw new Error("FIRESTORE_EMULATOR_HOST no apunta a localhost — abortando.");
    }
    return initializeApp({ projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID });
  }

  const serviceAccountJson = process.env.FIREBASE_SERVICE_ACCOUNT;
  if (!serviceAccountJson) {
    throw new Error("Falta FIREBASE_SERVICE_ACCOUNT en .env.local para reconciliar producción");
  }
  return initializeApp({ credential: cert(JSON.parse(serviceAccountJson)) });
}

async function main() {
  const app = inicializarAdmin();
  const db = getFirestore(app);

  console.log(`Reconciliando contra ${produccion ? "PRODUCCIÓN" : "el emulador"}...\n`);

  const [clientesSnap, movimientosSnap] = await Promise.all([
    db.collection("clientes").get(),
    db.collection("movimientos").get(),
  ]);

  const saldoCalculado = new Map<string, number>();
  for (const doc of movimientosSnap.docs) {
    const mov = doc.data() as Movimiento;
    const actual = saldoCalculado.get(mov.clienteId) ?? 0;
    saldoCalculado.set(mov.clienteId, actual + mov.debe - mov.haber);
  }

  let diferencias = 0;
  for (const doc of clientesSnap.docs) {
    const cliente = doc.data() as Cliente;
    const calculado = saldoCalculado.get(doc.id) ?? 0;
    const diff = Math.round((cliente.saldo - calculado) * 100) / 100;
    if (diff !== 0) {
      diferencias++;
      console.log(
        `✗ ${doc.id} (${cliente.nombre}): saldo=${cliente.saldo} calculado=${calculado} diferencia=${diff}`,
      );
    }
  }

  console.log("");
  console.log(`Clientes revisados: ${clientesSnap.docs.length}`);
  console.log(`Movimientos revisados: ${movimientosSnap.docs.length}`);

  if (diferencias === 0) {
    console.log("OK — sin diferencias.");
  } else {
    console.log(`${diferencias} cliente(s) con diferencias de saldo.`);
    process.exitCode = 1;
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
