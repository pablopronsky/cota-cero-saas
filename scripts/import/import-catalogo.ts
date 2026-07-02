/**
 * Importa el catálogo desde el CSV exportado de la hoja PRECIOS.
 *
 * Columnas esperadas: codigo, rubro, nombre, unidad, precio_lista,
 * precio_final_iva, estado, especificacion
 *
 * Todo ítem se vende en PESOS: si el export trae una columna de moneda (ej.
 * "Moneda costo" de Tienda Nube), es la moneda en la que el PROVEEDOR cobra,
 * no el precio de venta — se ignora a propósito. El precio de venta que trae
 * la columna precio_final_iva/"Precio Final ($)" ya está en pesos tal cual
 * figura, sin conversión.
 *
 * Uso:
 *   npm run import:catalogo -- <archivo.csv>                  → dry-run contra emulador
 *   npm run import:catalogo -- <archivo.csv> --ejecutar        → importa al emulador
 *   npm run import:catalogo -- <archivo.csv> --produccion      → dry-run contra producción
 *   npm run import:catalogo -- <archivo.csv> --ejecutar --produccion  → importa a producción
 *   agregar --wipe para borrar el catálogo existente antes de importar
 *
 * Siempre genera reporte-import-catalogo.csv con qué se importa, qué se
 * excluye (y por qué) y qué queda flaggeado para verificar.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { config as cargarEnv } from "dotenv";
import { cert, getApps, initializeApp } from "firebase-admin/app";
import { getFirestore, Timestamp } from "firebase-admin/firestore";
import { clasificarGrupoContable } from "../../lib/reglas/clasificacion";
import { extraerM2PorCaja } from "../../lib/reglas/m2caja";
import type { EstadoCatalogo, ItemCatalogo } from "../../lib/tipos";

cargarEnv({ path: resolve(__dirname, "../../.env.local") });

const argumentos = process.argv.slice(2);
const archivoCsv = argumentos.find((a) => !a.startsWith("--"));
const ejecutar = argumentos.includes("--ejecutar");
const produccion = argumentos.includes("--produccion");
const wipe = argumentos.includes("--wipe");

if (!archivoCsv) {
  console.error("Uso: tsx scripts/import/import-catalogo.ts <archivo.csv> [--ejecutar] [--produccion] [--wipe]");
  process.exit(1);
}

const PATRON_FECHA_EN_CODIGO = /\|\s*\d{4}-\d{2}-\d{2}/;
const NOMBRES_EXCLUIDOS = ["no usar", "sin stock", "copia de"];

interface FilaCsv {
  codigo: string;
  rubro: string;
  nombre: string;
  unidad: string;
  precioLista: number;
  precioFinalIva: number;
  estado: string;
  especificacion: string;
  proveedor: string;
}

/** Detecta si el CSV usa ";" (export típico de Excel/Tienda Nube en es-AR) o "," como separador. */
function detectarDelimitador(primeraLinea: string): "," | ";" {
  const puntoYComa = (primeraLinea.match(/;/g) ?? []).length;
  const coma = (primeraLinea.match(/,/g) ?? []).length;
  return puntoYComa > coma ? ";" : ",";
}

/** Parser CSV simple: soporta campos entre comillas con separadores y comillas escapadas (""). */
function parsearCsv(texto: string, separador: "," | ";"): string[][] {
  const filas: string[][] = [];
  let fila: string[] = [];
  let campo = "";
  let entreComillas = false;

  for (let i = 0; i < texto.length; i++) {
    const c = texto[i];
    if (entreComillas) {
      if (c === '"') {
        if (texto[i + 1] === '"') {
          campo += '"';
          i++;
        } else {
          entreComillas = false;
        }
      } else {
        campo += c;
      }
    } else if (c === '"') {
      entreComillas = true;
    } else if (c === separador) {
      fila.push(campo);
      campo = "";
    } else if (c === "\n" || c === "\r") {
      if (c === "\r" && texto[i + 1] === "\n") i++;
      fila.push(campo);
      filas.push(fila);
      fila = [];
      campo = "";
    } else {
      campo += c;
    }
  }
  if (campo !== "" || fila.length > 0) {
    fila.push(campo);
    filas.push(fila);
  }
  return filas.filter((f) => f.some((c) => c.trim() !== ""));
}

/** Números en formato es-AR: "." como separador de miles, "," como decimal. */
function numero(texto: string): number {
  const limpio = texto.replace(/\./g, "").replace(",", ".").replace(/[^\d.-]/g, "");
  return limpio ? Number(limpio) : 0;
}

/** minúsculas + sin acentos/símbolos, para matchear encabezados sin importar formato exacto. */
function normalizarEncabezado(texto: string): string {
  return texto
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/_/g, " ")
    .replace(/[^a-z0-9 ]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Alias de encabezado por campo, para soportar tanto el esquema documentado
 * de la hoja PRECIOS (codigo, precio_lista, precio_final_iva...) como
 * exports de otros sistemas (ej. Tienda Nube: "Código", "Precio ($)",
 * "Precio Final ($)", "Moneda costo", "Medidas").
 */
const ALIAS_ENCABEZADO: Record<keyof FilaCsv, string[]> = {
  codigo: ["codigo"],
  rubro: ["rubro"],
  nombre: ["nombre"],
  unidad: ["unidad"],
  precioLista: ["precio lista", "precio"],
  precioFinalIva: ["precio final iva", "precio final"],
  estado: ["estado"],
  especificacion: ["especificacion", "medidas", "descripcion"],
  proveedor: ["proveedor"],
};

/** Columnas que no todos los exports traen (ej. la hoja PRECIOS documentada no tiene proveedor). */
const CAMPOS_OPCIONALES: (keyof FilaCsv)[] = ["proveedor"];

function leerFilas(rutaCsv: string): FilaCsv[] {
  const contenido = readFileSync(rutaCsv, "utf-8").replace(/^﻿/, "");
  const primeraLinea = contenido.split(/\r?\n/, 1)[0] ?? "";
  const separador = detectarDelimitador(primeraLinea);
  const [encabezadoCrudo, ...resto] = parsearCsv(contenido, separador);
  const encabezado = encabezadoCrudo.map(normalizarEncabezado);

  const idx = {} as Record<keyof FilaCsv, number>;
  for (const campo of Object.keys(ALIAS_ENCABEZADO) as (keyof FilaCsv)[]) {
    idx[campo] = -1;
    for (const alias of ALIAS_ENCABEZADO[campo]) {
      const encontrado = encabezado.indexOf(alias);
      if (encontrado !== -1) {
        idx[campo] = encontrado;
        break;
      }
    }
  }

  const faltantes = (Object.keys(idx) as (keyof FilaCsv)[]).filter(
    (campo) => idx[campo] === -1 && !CAMPOS_OPCIONALES.includes(campo),
  );
  if (faltantes.length > 0) {
    throw new Error(`No se encontraron columnas para: ${faltantes.join(", ")}`);
  }

  return resto.map((fila) => ({
    codigo: (fila[idx.codigo] ?? "").trim().replace(/^'/, ""),
    rubro: (fila[idx.rubro] ?? "").trim(),
    nombre: (fila[idx.nombre] ?? "").trim(),
    unidad: (fila[idx.unidad] ?? "").trim(),
    precioLista: numero(fila[idx.precioLista] ?? ""),
    precioFinalIva: numero(fila[idx.precioFinalIva] ?? ""),
    estado: (fila[idx.estado] ?? "").trim(),
    proveedor: idx.proveedor === -1 ? "" : (fila[idx.proveedor] ?? "").trim(),
    especificacion: (fila[idx.especificacion] ?? "").trim(),
  }));
}

interface FilaReporte {
  codigo: string;
  nombre: string;
  accion: "importar" | "excluido";
  motivo: string;
  grupoContable: string;
}

function motivoExclusion(fila: FilaCsv): string | null {
  if (fila.estado.toLowerCase() !== "habilitado") return `estado = "${fila.estado}"`;
  const nombreNormalizado = fila.nombre.toLowerCase();
  const keyword = NOMBRES_EXCLUIDOS.find((k) => nombreNormalizado.includes(k));
  if (keyword) return `nombre contiene "${keyword}"`;
  if (PATRON_FECHA_EN_CODIGO.test(fila.codigo)) return "código con patrón de fecha";
  if (fila.precioFinalIva === 0) return "precio final = 0";
  return null;
}

function escaparCsv(valor: string): string {
  if (/[",\n]/.test(valor)) return `"${valor.replace(/"/g, '""')}"`;
  return valor;
}

function escribirReporte(filas: FilaReporte[], ruta: string) {
  const encabezado = ["codigo", "nombre", "accion", "motivo", "grupoContable"];
  const lineas = [
    encabezado.join(","),
    ...filas.map((f) =>
      [f.codigo, f.nombre, f.accion, f.motivo, f.grupoContable].map(escaparCsv).join(","),
    ),
  ];
  writeFileSync(ruta, lineas.join("\n"), "utf-8");
}

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
    throw new Error("Falta FIREBASE_SERVICE_ACCOUNT en .env.local para importar a producción");
  }
  return initializeApp({ credential: cert(JSON.parse(serviceAccountJson)) });
}

async function main() {
  const filas = leerFilas(resolve(archivoCsv!));
  const reporte: FilaReporte[] = [];
  const aImportar: Array<Omit<ItemCatalogo, "creadoEn" | "actualizadoEn"> & { creadoEn: Timestamp; actualizadoEn: Timestamp }> = [];

  const ahora = Timestamp.now();

  for (const fila of filas) {
    const motivo = motivoExclusion(fila);
    if (motivo) {
      reporte.push({
        codigo: fila.codigo,
        nombre: fila.nombre,
        accion: "excluido",
        motivo,
        grupoContable: "",
      });
      continue;
    }

    const grupoContable = clasificarGrupoContable({ rubro: fila.rubro });
    const m2PorCaja = extraerM2PorCaja(fila.nombre, fila.especificacion);

    aImportar.push({
      codigo: fila.codigo,
      rubro: fila.rubro,
      nombre: fila.nombre,
      unidad: fila.unidad,
      especificacion: fila.especificacion,
      proveedor: fila.proveedor,
      precioLista: fila.precioLista,
      precioFinalIva: fila.precioFinalIva,
      // Todo se vende en pesos: la moneda del proveedor (si la hay en el
      // export) no es la moneda de venta. Ver comentario al tope del archivo.
      moneda: "Pesos",
      estado: "Habilitado" as EstadoCatalogo,
      grupoContable,
      m2PorCaja,
      requiereVerificacion: false,
      creadoEn: ahora,
      actualizadoEn: ahora,
    });

    reporte.push({
      codigo: fila.codigo,
      nombre: fila.nombre,
      accion: "importar",
      motivo: "",
      grupoContable,
    });
  }

  const rutaReporte = resolve(process.cwd(), "reporte-import-catalogo.csv");
  escribirReporte(reporte, rutaReporte);

  const excluidos = reporte.filter((f) => f.accion === "excluido").length;
  console.log(`Filas leídas: ${filas.length}`);
  console.log(`A importar: ${aImportar.length}`);
  console.log(`Excluidas: ${excluidos}`);
  console.log(`Reporte: ${rutaReporte}`);

  if (!ejecutar) {
    console.log("\nDRY-RUN: no se escribió nada. Agregá --ejecutar para importar de verdad.");
    return;
  }

  console.log(`\nEjecutando importación real contra ${produccion ? "PRODUCCIÓN" : "el emulador"}...`);
  const app = inicializarAdmin();
  const db = getFirestore(app);

  if (wipe) {
    console.log("Borrando catálogo existente (--wipe)...");
    const existentes = await db.collection("catalogo").get();
    const lotes = [];
    for (let i = 0; i < existentes.docs.length; i += 400) {
      const lote = db.batch();
      for (const doc of existentes.docs.slice(i, i + 400)) lote.delete(doc.ref);
      lotes.push(lote.commit());
    }
    await Promise.all(lotes);
    console.log(`Borrados ${existentes.docs.length} ítems.`);
  }

  for (let i = 0; i < aImportar.length; i += 400) {
    const lote = db.batch();
    for (const item of aImportar.slice(i, i + 400)) {
      lote.set(db.collection("catalogo").doc(), item);
    }
    await lote.commit();
  }

  console.log(`Importación completa: ${aImportar.length} ítems.`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
