/**
 * Inicializa el eje comercial de obras y la vigencia de presupuestos existentes.
 *
 * Uso:
 *   tsx scripts/migrar-estado-comercial.ts                    # dry-run en emulador
 *   tsx scripts/migrar-estado-comercial.ts --produccion       # dry-run en producción
 *   tsx scripts/migrar-estado-comercial.ts --ejecutar         # aplica en emulador
 *   tsx scripts/migrar-estado-comercial.ts --ejecutar --produccion
 *
 * El último comando requiere revisión y aprobación explícita de Pablo.
 */
import { config as cargarEnv } from "dotenv";
import { cert, getApps, initializeApp } from "firebase-admin/app";
import { getFirestore, Timestamp, type DocumentData } from "firebase-admin/firestore";
import { resolve } from "node:path";
import { parseValidezDias } from "../lib/reglas/vigencia";
import type { EstadoComercial, Presupuesto } from "../lib/tipos";

cargarEnv({ path: resolve(__dirname, "../.env.local") });

const produccion = process.argv.includes("--produccion");
const ejecutar = process.argv.includes("--ejecutar");

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
    throw new Error("Falta FIREBASE_SERVICE_ACCOUNT en .env.local para leer producción");
  }
  return initializeApp({ credential: cert(JSON.parse(serviceAccountJson)) });
}

function calcularVencimiento(presupuesto: Presupuesto): Date | null {
  if (presupuesto.esLegado) return null;
  const dias = parseValidezDias(presupuesto.validez ?? "");
  if (dias === null || !presupuesto.fechaEmision) return null;

  const fechaEmision = presupuesto.fechaEmision.toDate();
  fechaEmision.setDate(fechaEmision.getDate() + dias);
  return fechaEmision;
}

function estadoInicial(presupuestos: Presupuesto[]): EstadoComercial {
  if (presupuestos.some((p) => p.estado === "Confirmado")) return "Ganado";
  if (presupuestos.length > 0 && presupuestos.every((p) => p.estado === "Anulado")) return "Perdido";
  return "Enviado";
}

async function aplicarEnLotes(
  operaciones: Array<{ ref: FirebaseFirestore.DocumentReference; datos: DocumentData }>,
) {
  const db = getFirestore();
  for (let inicio = 0; inicio < operaciones.length; inicio += 450) {
    const lote = db.batch();
    for (const operacion of operaciones.slice(inicio, inicio + 450)) {
      lote.update(operacion.ref, operacion.datos);
    }
    await lote.commit();
  }
}

async function main() {
  inicializarAdmin();
  const db = getFirestore();
  const entorno = produccion ? "PRODUCCIÓN" : "emulador";
  console.log(`${ejecutar ? "EJECUTANDO" : "DRY-RUN"} migración comercial en ${entorno}\n`);

  const [obrasSnap, presupuestosSnap] = await Promise.all([
    db.collection("obras").get(),
    db.collection("presupuestos").get(),
  ]);
  const presupuestosPorObra = new Map<string, Presupuesto[]>();
  for (const doc of presupuestosSnap.docs) {
    const presupuesto = doc.data() as Presupuesto;
    const lista = presupuestosPorObra.get(presupuesto.obraCodigo) ?? [];
    lista.push(presupuesto);
    presupuestosPorObra.set(presupuesto.obraCodigo, lista);
  }

  const operaciones: Array<{ ref: FirebaseFirestore.DocumentReference; datos: DocumentData }> = [];
  const resumenEstados: Record<EstadoComercial, number> = {
    PendienteEnvio: 0,
    Enviado: 0,
    EnNegociacion: 0,
    Ganado: 0,
    Perdido: 0,
  };

  for (const obraDoc of obrasSnap.docs) {
    const estado = estadoInicial(presupuestosPorObra.get(obraDoc.id) ?? []);
    resumenEstados[estado] += 1;
    operaciones.push({
      ref: obraDoc.ref,
      datos: {
        estadoComercial: estado,
        proximoSeguimiento: null,
        motivoPerdida: estado === "Perdido" ? "otro" : null,
        motivoPerdidaDetalle: estado === "Perdido" ? "migración inicial" : "",
        contactos: [],
        actualizadoEn: Timestamp.now(),
      },
    });
  }

  let vigenciasCalculadas = 0;
  let legadosSinVencimiento = 0;
  for (const presupuestoDoc of presupuestosSnap.docs) {
    const presupuesto = presupuestoDoc.data() as Presupuesto;
    const venceEl = calcularVencimiento(presupuesto);
    if (venceEl) vigenciasCalculadas += 1;
    if (presupuesto.esLegado) legadosSinVencimiento += 1;
    operaciones.push({ ref: presupuestoDoc.ref, datos: { venceEl } });
  }

  console.log(`Obras: ${obrasSnap.size}`);
  console.log(`  Ganado: ${resumenEstados.Ganado}`);
  console.log(`  Perdido: ${resumenEstados.Perdido}`);
  console.log(`  Enviado: ${resumenEstados.Enviado}`);
  console.log(`Presupuestos: ${presupuestosSnap.size}`);
  console.log(`  Vencimientos calculados: ${vigenciasCalculadas}`);
  console.log(`  Legados con venceEl = null: ${legadosSinVencimiento}`);
  console.log(`Operaciones a aplicar: ${operaciones.length}`);

  if (!ejecutar) {
    console.log("\nDRY-RUN terminado. No se escribió ningún documento.");
    return;
  }

  await aplicarEnLotes(operaciones);
  console.log("\nMigración aplicada correctamente.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
