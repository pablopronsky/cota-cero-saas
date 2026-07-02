/**
 * Importa la cuenta corriente desde el CSV exportado de la hoja Movimientos.
 *
 * Columnas esperadas: mov_id, fecha_hora, cliente_id, cliente_nombre, tipo,
 * codigo_obra, version_presupuesto, concepto, debe, haber, medio_pago,
 * referencia, mov_anulado_id, usuario, notas.
 *
 * Depende de que `import-clientes.ts` e `import-historial.ts` ya hayan
 * corrido contra el mismo destino: resuelve cliente_id contra clientes real
 * y codigo_obra+version_presupuesto contra los presupuestos legado ya
 * importados (si no matchea, el movimiento igual se guarda con el snapshot
 * de texto, pero queda marcado como huérfano en el reporte).
 *
 * Preserva el código MOV-NNNNNN como campo `codigo` (el doc ID sigue siendo
 * autoId, como en el resto de la colección) y reconstruye mov_anulado_id
 * apuntando al doc real del movimiento original. Al final recalcula y
 * escribe el `saldo` de cada cliente a partir de TODOS sus movimientos
 * (existentes + recién importados).
 *
 * Ninguna anomalía (cliente no resuelto, tipo desconocido, fecha/monto
 * inválido, motivo obligatorio vacío, mov_anulado_id no resuelto, código MOV
 * duplicado) se resuelve sola: se excluye por default y queda reportada.
 *
 * Uso:
 *   npm run import:movimientos -- <archivo.csv>                  → dry-run contra emulador
 *   npm run import:movimientos -- <archivo.csv> --ejecutar        → importa al emulador
 *   npm run import:movimientos -- <archivo.csv> --produccion      → dry-run contra producción
 *   npm run import:movimientos -- <archivo.csv> --ejecutar --produccion  → importa a producción
 *
 * Siempre genera reporte-import-movimientos.csv. Correr scripts/reconciliar.ts
 * como paso final obligatorio después de ejecutar.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { config as cargarEnv } from "dotenv";
import { getFirestore } from "firebase-admin/firestore";
import type { Cliente, Movimiento, Presupuesto, TipoMovimiento } from "../../lib/tipos";
import {
  aTimestamp,
  cargarClientes,
  detectarDelimitador,
  escribirReporte,
  indexarEncabezado,
  inicializarAdmin,
  normalizarEncabezado,
  numero,
  parsearCsv,
  parsearFecha,
  resolverCliente,
} from "./_shared";

cargarEnv({ path: resolve(__dirname, "../../.env.local") });

const argumentos = process.argv.slice(2);
const archivoCsv = argumentos.find((a) => !a.startsWith("--"));
const ejecutar = argumentos.includes("--ejecutar");
const produccion = argumentos.includes("--produccion");

if (!archivoCsv) {
  console.error("Uso: tsx scripts/import/import-movimientos.ts <archivo.csv> [--ejecutar] [--produccion]");
  process.exit(1);
}

type CampoFila =
  | "movId"
  | "fechaHora"
  | "clienteId"
  | "clienteNombre"
  | "tipo"
  | "codigoObra"
  | "versionPresupuesto"
  | "concepto"
  | "debe"
  | "haber"
  | "medioPago"
  | "referencia"
  | "movAnuladoId"
  | "usuario"
  | "notas";

const ALIASES: Record<CampoFila, string[]> = {
  movId: ["mov id", "codigo"],
  fechaHora: ["fecha hora", "fecha"],
  clienteId: ["cliente id"],
  clienteNombre: ["cliente nombre", "cliente"],
  tipo: ["tipo"],
  codigoObra: ["codigo obra"],
  versionPresupuesto: ["version presupuesto", "version"],
  concepto: ["concepto"],
  debe: ["debe"],
  haber: ["haber"],
  medioPago: ["medio pago"],
  referencia: ["referencia"],
  movAnuladoId: ["mov anulado id"],
  usuario: ["usuario"],
  notas: ["notas"],
};

interface FilaCsv {
  movId: string;
  fechaHora: string;
  clienteId: string;
  clienteNombre: string;
  tipo: string;
  codigoObra: string;
  versionPresupuesto: string;
  concepto: string;
  debe: string;
  haber: string;
  medioPago: string;
  referencia: string;
  movAnuladoId: string;
  usuario: string;
  notas: string;
}

function leerFilas(rutaCsv: string): FilaCsv[] {
  const contenido = readFileSync(rutaCsv, "utf-8").replace(/^﻿/, "");
  const primeraLinea = contenido.split(/\r?\n/, 1)[0] ?? "";
  const separador = detectarDelimitador(primeraLinea);
  const [encabezadoCrudo, ...resto] = parsearCsv(contenido, separador);
  const encabezado = encabezadoCrudo.map(normalizarEncabezado);
  const idx = indexarEncabezado(encabezado, ALIASES);

  return resto.map((fila) => ({
    movId: (fila[idx.movId] ?? "").trim(),
    fechaHora: (fila[idx.fechaHora] ?? "").trim(),
    clienteId: (fila[idx.clienteId] ?? "").trim(),
    clienteNombre: (fila[idx.clienteNombre] ?? "").trim(),
    tipo: (fila[idx.tipo] ?? "").trim(),
    codigoObra: (fila[idx.codigoObra] ?? "").trim(),
    versionPresupuesto: (fila[idx.versionPresupuesto] ?? "").trim(),
    concepto: (fila[idx.concepto] ?? "").trim(),
    debe: (fila[idx.debe] ?? "").trim(),
    haber: (fila[idx.haber] ?? "").trim(),
    medioPago: (fila[idx.medioPago] ?? "").trim(),
    referencia: (fila[idx.referencia] ?? "").trim(),
    movAnuladoId: (fila[idx.movAnuladoId] ?? "").trim(),
    usuario: (fila[idx.usuario] ?? "").trim(),
    notas: (fila[idx.notas] ?? "").trim(),
  }));
}

interface FilaReporte {
  movId: string;
  clienteNombreCsv: string;
  tipo: string;
  accion: "importar" | "omitido";
  motivo: string;
}

const TIPOS_VALIDOS: TipoMovimiento[] = [
  "CONFIRMACION_PRESUPUESTO",
  "PAGO",
  "ANULACION_PRESUPUESTO",
  "ANULACION_PAGO",
  "AJUSTE",
];
const TIPOS_CON_MOTIVO_OBLIGATORIO: TipoMovimiento[] = ["ANULACION_PRESUPUESTO", "ANULACION_PAGO", "AJUSTE"];

interface FilaValida {
  movId: string;
  fechaHora: Date;
  clienteId: string;
  clienteNombre: string;
  tipo: TipoMovimiento;
  codigoObra: string;
  versionPresupuesto: number;
  concepto: string;
  motivo: string;
  debe: number;
  haber: number;
  medioPago: string;
  referencia: string;
  movAnuladoIdCsv: string;
  creadoPor: string;
  notas: string;
  advertencias: string[];
}

async function main() {
  const filas = leerFilas(resolve(archivoCsv!));

  const app = inicializarAdmin(produccion);
  const db = getFirestore(app);
  const indiceClientes = await cargarClientes(db);

  const legadosSnap = await db.collection("presupuestos").where("esLegado", "==", true).get();
  const presupuestosLegado = new Map<string, string>();
  for (const doc of legadosSnap.docs) {
    const data = doc.data() as Presupuesto;
    presupuestosLegado.set(`${data.obraCodigo}#${data.version}`, doc.id);
  }

  const movimientosExistentesSnap = await db.collection("movimientos").get();
  const codigosExistentes = new Set<string>();
  for (const doc of movimientosExistentesSnap.docs) {
    codigosExistentes.add((doc.data() as Movimiento).codigo);
  }

  const reporte: FilaReporte[] = [];
  const validas: FilaValida[] = [];
  const codigosVistos = new Set<string>();

  for (const fila of filas) {
    const advertencias: string[] = [];

    if (!fila.movId) {
      reporte.push({ movId: "", clienteNombreCsv: fila.clienteNombre, tipo: fila.tipo, accion: "omitido", motivo: "mov_id vacío" });
      continue;
    }
    if (codigosVistos.has(fila.movId)) {
      reporte.push({ movId: fila.movId, clienteNombreCsv: fila.clienteNombre, tipo: fila.tipo, accion: "omitido", motivo: `mov_id duplicado dentro del propio CSV: "${fila.movId}"` });
      continue;
    }
    if (codigosExistentes.has(fila.movId)) {
      reporte.push({ movId: fila.movId, clienteNombreCsv: fila.clienteNombre, tipo: fila.tipo, accion: "omitido", motivo: `"${fila.movId}" ya existe en destino (posible re-run parcial) — revisar antes de reintentar` });
      continue;
    }
    codigosVistos.add(fila.movId);

    const tipo = TIPOS_VALIDOS.find((t) => t === fila.tipo.trim().toUpperCase());
    if (!tipo) {
      reporte.push({ movId: fila.movId, clienteNombreCsv: fila.clienteNombre, tipo: fila.tipo, accion: "omitido", motivo: `tipo desconocido: "${fila.tipo}"` });
      continue;
    }

    const fechaHora = parsearFecha(fila.fechaHora);
    if (!fechaHora) {
      reporte.push({ movId: fila.movId, clienteNombreCsv: fila.clienteNombre, tipo: fila.tipo, accion: "omitido", motivo: `fecha_hora inválida: "${fila.fechaHora}"` });
      continue;
    }

    if (!/^-?[\d.,]*$/.test(fila.debe) || !/^-?[\d.,]*$/.test(fila.haber)) {
      reporte.push({ movId: fila.movId, clienteNombreCsv: fila.clienteNombre, tipo: fila.tipo, accion: "omitido", motivo: `debe/haber no numérico (debe="${fila.debe}", haber="${fila.haber}")` });
      continue;
    }
    const debe = numero(fila.debe);
    const haber = numero(fila.haber);
    if (debe < 0 || haber < 0) {
      reporte.push({ movId: fila.movId, clienteNombreCsv: fila.clienteNombre, tipo: fila.tipo, accion: "omitido", motivo: `debe/haber negativo (debe=${debe}, haber=${haber})` });
      continue;
    }

    const resolucion = resolverCliente(indiceClientes, fila.clienteId, fila.clienteNombre);
    if ("error" in resolucion) {
      reporte.push({ movId: fila.movId, clienteNombreCsv: fila.clienteNombre, tipo: fila.tipo, accion: "omitido", motivo: `cliente no resuelto: ${resolucion.error}` });
      continue;
    }
    if (resolucion.advertencia) advertencias.push(resolucion.advertencia);

    let motivo = "";
    if (TIPOS_CON_MOTIVO_OBLIGATORIO.includes(tipo)) {
      if (!fila.concepto) {
        reporte.push({ movId: fila.movId, clienteNombreCsv: fila.clienteNombre, tipo: fila.tipo, accion: "omitido", motivo: `motivo obligatorio vacío (tipo ${tipo} requiere motivo y "concepto" está vacío en el export)` });
        continue;
      }
      motivo = fila.concepto;
      advertencias.push('motivo tomado de "concepto" (el export legado no tiene columna motivo propia)');
    }

    let versionPresupuesto = 0;
    if (fila.codigoObra) {
      const v = Number.parseInt(fila.versionPresupuesto, 10);
      if (!Number.isFinite(v) || v <= 0) {
        advertencias.push(`version_presupuesto inválida ("${fila.versionPresupuesto}") — se guarda sin vínculo a presupuesto`);
      } else {
        versionPresupuesto = v;
      }
    }

    validas.push({
      movId: fila.movId,
      fechaHora,
      clienteId: resolucion.id,
      clienteNombre: resolucion.nombre,
      tipo,
      codigoObra: fila.codigoObra.toUpperCase(),
      versionPresupuesto,
      concepto: fila.concepto,
      motivo,
      debe,
      haber,
      medioPago: fila.medioPago,
      referencia: fila.referencia,
      movAnuladoIdCsv: fila.movAnuladoId,
      creadoPor: fila.usuario ? `legado:${fila.usuario}` : "import-movimientos",
      notas: fila.notas,
      advertencias,
    });
  }

  // Doc refs pre-asignados para poder resolver mov_anulado_id sin importar el orden.
  const refPorCodigo = new Map<string, FirebaseFirestore.DocumentReference>();
  for (const v of validas) {
    refPorCodigo.set(v.movId, db.collection("movimientos").doc());
  }

  const aEscribir: Array<{ ref: FirebaseFirestore.DocumentReference; data: Movimiento; movId: string; advertencias: string[] }> = [];

  for (const v of validas) {
    let movAnuladoId: string | null = null;
    if (v.movAnuladoIdCsv) {
      const refAnulado = refPorCodigo.get(v.movAnuladoIdCsv);
      if (!refAnulado) {
        reporte.push({ movId: v.movId, clienteNombreCsv: v.clienteNombre, tipo: v.tipo, accion: "omitido", motivo: `mov_anulado_id apunta a un código no encontrado o inválido: "${v.movAnuladoIdCsv}"` });
        continue;
      }
      movAnuladoId = refAnulado.id;
    }

    const presupuestoId =
      v.codigoObra && v.versionPresupuesto
        ? (presupuestosLegado.get(`${v.codigoObra}#${v.versionPresupuesto}`) ?? null)
        : null;
    if (v.codigoObra && v.versionPresupuesto && !presupuestoId) {
      v.advertencias.push(`codigo_obra/version_presupuesto no matchea ningún legado importado (huérfano): ${v.codigoObra} v${v.versionPresupuesto}`);
    }

    const data: Movimiento = {
      codigo: v.movId,
      fechaHora: aTimestamp(v.fechaHora),
      clienteId: v.clienteId,
      clienteNombre: v.clienteNombre,
      tipo: v.tipo,
      presupuestoId,
      codigoObra: v.codigoObra,
      versionPresupuesto: v.versionPresupuesto,
      concepto: v.concepto,
      debe: v.debe,
      haber: v.haber,
      medioPago: v.medioPago,
      referencia: v.referencia,
      motivo: v.motivo,
      movAnuladoId,
      reciboPath: "",
      notas: v.notas,
      creadoPor: v.creadoPor,
    };

    aEscribir.push({ ref: refPorCodigo.get(v.movId)!, data, movId: v.movId, advertencias: v.advertencias });
    reporte.push({ movId: v.movId, clienteNombreCsv: v.clienteNombre, tipo: v.tipo, accion: "importar", motivo: v.advertencias.join(" | ") });
  }

  const rutaReporte = resolve(process.cwd(), "reporte-import-movimientos.csv");
  escribirReporte(
    ["movId", "clienteNombreCsv", "tipo", "accion", "motivo"],
    reporte.map((f) => [f.movId, f.clienteNombreCsv, f.tipo, f.accion, f.motivo]),
    rutaReporte,
  );

  const omitidos = reporte.filter((r) => r.accion === "omitido").length;
  const huerfanos = aEscribir.filter((f) => f.advertencias.some((a) => a.includes("huérfano"))).length;
  console.log(`Filas leídas: ${filas.length}`);
  console.log(`A importar: ${aEscribir.length}`);
  console.log(`Omitidos (requieren resolución): ${omitidos}`);
  console.log(`Huérfanos (sin presupuesto vinculado, se guardan igual con snapshot de texto): ${huerfanos}`);
  console.log(`Reporte: ${rutaReporte}`);

  if (!ejecutar) {
    console.log("\nDRY-RUN: no se escribió nada. Agregá --ejecutar para importar de verdad.");
    return;
  }

  console.log(`\nEjecutando importación real contra ${produccion ? "PRODUCCIÓN" : "el emulador"}...`);

  for (let i = 0; i < aEscribir.length; i += 400) {
    const lote = db.batch();
    for (const { ref, data } of aEscribir.slice(i, i + 400)) {
      lote.set(ref, data);
    }
    await lote.commit();
  }

  // Recalcula el saldo de cada cliente a partir de TODOS sus movimientos
  // (existentes + recién importados), no solo de los importados ahora.
  const saldoPorCliente = new Map<string, number>();
  for (const doc of movimientosExistentesSnap.docs) {
    const mov = doc.data() as Movimiento;
    saldoPorCliente.set(mov.clienteId, (saldoPorCliente.get(mov.clienteId) ?? 0) + mov.debe - mov.haber);
  }
  for (const { data } of aEscribir) {
    saldoPorCliente.set(data.clienteId, (saldoPorCliente.get(data.clienteId) ?? 0) + data.debe - data.haber);
  }

  const idsClientesAfectados = [...saldoPorCliente.keys()];
  for (let i = 0; i < idsClientesAfectados.length; i += 400) {
    const lote = db.batch();
    for (const clienteId of idsClientesAfectados.slice(i, i + 400)) {
      const saldo = Math.round((saldoPorCliente.get(clienteId) ?? 0) * 100) / 100;
      lote.set(db.collection("clientes").doc(clienteId), { saldo } satisfies Partial<Cliente>, { merge: true });
    }
    await lote.commit();
  }

  const maxMov = aEscribir.reduce((max, { movId }) => {
    const match = movId.match(/^MOV-(\d+)$/i);
    if (!match) return max;
    return Math.max(max, Number(match[1]));
  }, 0);
  if (maxMov > 0) {
    const ref = db.collection("contadores").doc("movimientos");
    const snap = await ref.get();
    const actual = snap.exists ? ((snap.data()?.ultimo as number) ?? 0) : 0;
    if (maxMov > actual) {
      await ref.set({ ultimo: maxMov }, { merge: true });
      console.log(`contadores/movimientos actualizado: ${actual} → ${maxMov}`);
    } else {
      console.log(`contadores/movimientos ya estaba en ${actual} (>= ${maxMov}), no se tocó.`);
    }
  }

  console.log(`Importación completa: ${aEscribir.length} movimientos. Saldos recalculados para ${idsClientesAfectados.length} clientes.`);
  console.log("\nCorré ahora: npm run reconciliar" + (produccion ? " -- --produccion" : ""));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
