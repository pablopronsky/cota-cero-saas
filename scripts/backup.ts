/**
 * Respaldo completo de Firestore: exporta TODAS las colecciones a JSON local,
 * una carpeta por corrida con timestamp en el nombre. Solo lectura — nunca
 * escribe en Firestore.
 *
 * Uso:
 *   npm run backup                    → contra el emulador
 *   npm run backup -- --produccion    → contra producción (solo lectura)
 *
 * Salida: backups/<timestamp>-<entorno>/<coleccion>.json (+ un _meta.json con
 * el resumen). Los Timestamp de Firestore se serializan como
 * { __type: "timestamp", seconds, nanoseconds } para poder restaurarlos sin
 * ambigüedad. La carpeta backups/ está gitignoreada (contiene datos reales).
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { config as cargarEnv } from "dotenv";
import { cert, getApps, initializeApp } from "firebase-admin/app";
import { getFirestore, Timestamp } from "firebase-admin/firestore";

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
    throw new Error("Falta FIREBASE_SERVICE_ACCOUNT en .env.local para respaldar producción");
  }
  return initializeApp({ credential: cert(JSON.parse(serviceAccountJson)) });
}

/** Convierte tipos de Firestore no serializables a formas JSON restaurables. */
function reemplazar(_clave: string, valor: unknown): unknown {
  if (valor instanceof Timestamp) {
    return { __type: "timestamp", seconds: valor.seconds, nanoseconds: valor.nanoseconds };
  }
  return valor;
}

async function main() {
  const app = inicializarAdmin();
  const db = getFirestore(app);

  const entorno = produccion ? "produccion" : "emulador";
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  const carpeta = resolve(__dirname, "../backups", `${timestamp}-${entorno}`);
  mkdirSync(carpeta, { recursive: true });

  console.log(`Respaldando ${produccion ? "PRODUCCIÓN" : "el emulador"} en ${carpeta}\n`);

  const colecciones = await db.listCollections();
  if (colecciones.length === 0) {
    console.log("No se encontró ninguna colección — nada que respaldar.");
    return;
  }

  const resumen: Record<string, number> = {};
  let totalDocs = 0;

  for (const coleccion of colecciones) {
    const snap = await coleccion.get();
    const docs: Record<string, unknown> = {};
    for (const doc of snap.docs) {
      docs[doc.id] = doc.data();
    }
    const ruta = resolve(carpeta, `${coleccion.id}.json`);
    writeFileSync(ruta, JSON.stringify(docs, reemplazar, 2), "utf-8");
    resumen[coleccion.id] = snap.size;
    totalDocs += snap.size;
    console.log(`  ${coleccion.id}: ${snap.size} doc(s)`);
  }

  const meta = {
    fecha: new Date().toISOString(),
    entorno,
    projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID ?? null,
    colecciones: resumen,
    totalDocs,
  };
  writeFileSync(resolve(carpeta, "_meta.json"), JSON.stringify(meta, null, 2), "utf-8");

  console.log("");
  console.log(`Colecciones respaldadas: ${colecciones.length}`);
  console.log(`Total de documentos: ${totalDocs}`);
  console.log(`OK — respaldo escrito en ${carpeta}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
