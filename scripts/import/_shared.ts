/**
 * Helpers compartidos por los importadores de datos reales (Fase 9):
 * parseo de CSV, números/fechas en formato es-AR, inicialización del admin
 * SDK (emulador por default, producción con --produccion) y escritura de
 * reportes. Ningún importador debe "corregir" datos en silencio: lo que no
 * se puede resolver con certeza se reporta como anomalía.
 */
import { writeFileSync } from "node:fs";
import { cert, getApps, initializeApp } from "firebase-admin/app";
import type { Firestore } from "firebase-admin/firestore";
import { Timestamp } from "firebase-admin/firestore";
import { normalizar } from "../../lib/reglas/normalizar";
import type { Cliente } from "../../lib/tipos";

/** Detecta si el CSV usa ";" (export típico es-AR) o "," como separador. */
export function detectarDelimitador(primeraLinea: string): "," | ";" {
  const puntoYComa = (primeraLinea.match(/;/g) ?? []).length;
  const coma = (primeraLinea.match(/,/g) ?? []).length;
  return puntoYComa > coma ? ";" : ",";
}

/** Parser CSV simple: soporta campos entre comillas con separadores y comillas escapadas (""). */
export function parsearCsv(texto: string, separador: "," | ";"): string[][] {
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

/** Números en formato es-AR: "." separador de miles, "," decimal. */
export function numero(texto: string): number {
  const limpio = texto.replace(/\./g, "").replace(",", ".").replace(/[^\d.-]/g, "");
  return limpio ? Number(limpio) : 0;
}

/** minúsculas + sin acentos/símbolos, para matchear encabezados sin importar formato exacto. */
export function normalizarEncabezado(texto: string): string {
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
 * Parsea fechas en los formatos esperables de un export de Sheets:
 * ISO (2026-01-15 o 2026-01-15 10:23[:45]) o dd/mm/aaaa (con hora opcional).
 * Devuelve null si no matchea ninguno — nunca inventa una fecha.
 */
export function parsearFecha(texto: string): Date | null {
  const t = texto.trim();
  if (!t) return null;

  const iso = t.match(/^(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{1,2}):(\d{2})(?::(\d{2}))?)?$/);
  if (iso) {
    const [, anio, mes, dia, h, m, s] = iso;
    const d = new Date(
      Number(anio),
      Number(mes) - 1,
      Number(dia),
      h ? Number(h) : 0,
      m ? Number(m) : 0,
      s ? Number(s) : 0,
    );
    return Number.isNaN(d.getTime()) ? null : d;
  }

  const dmy = t.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})(?:[T ](\d{1,2}):(\d{2})(?::(\d{2}))?)?$/);
  if (dmy) {
    const [, dia, mes, anio, h, m, s] = dmy;
    const d = new Date(
      Number(anio),
      Number(mes) - 1,
      Number(dia),
      h ? Number(h) : 0,
      m ? Number(m) : 0,
      s ? Number(s) : 0,
    );
    if (Number.isNaN(d.getTime())) return null;
    // Rechaza fechas imposibles que Date "corrige" solo (ej. 31/02 -> marzo).
    if (d.getDate() !== Number(dia) || d.getMonth() !== Number(mes) - 1) return null;
    return d;
  }

  return null;
}

export function aTimestamp(fecha: Date): Timestamp {
  return Timestamp.fromDate(fecha);
}

export function escaparCsv(valor: string): string {
  if (/[",\n]/.test(valor)) return `"${valor.replace(/"/g, '""')}"`;
  return valor;
}

export function escribirReporte(encabezado: string[], filas: string[][], ruta: string): void {
  const lineas = [encabezado.join(","), ...filas.map((f) => f.map(escaparCsv).join(","))];
  writeFileSync(ruta, lineas.join("\n"), "utf-8");
}

/**
 * Inicializa el admin SDK. Sin --produccion apunta SIEMPRE al emulador local
 * (aborta si FIRESTORE_EMULATOR_HOST no es localhost, para que un typo nunca
 * termine escribiendo contra producción por accidente).
 */
export function inicializarAdmin(produccion: boolean) {
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
    throw new Error("Falta FIREBASE_SERVICE_ACCOUNT en .env.local para operar contra producción");
  }
  return initializeApp({ credential: cert(JSON.parse(serviceAccountJson)) });
}

export interface IndiceClientes {
  porId: Map<string, Cliente>;
  porNombreNormalizado: Map<string, string[]>;
}

/** Carga toda la colección de clientes en memoria, para resolver referencias de historial/movimientos. */
export async function cargarClientes(db: Firestore): Promise<IndiceClientes> {
  const snap = await db.collection("clientes").get();
  const porId = new Map<string, Cliente>();
  const porNombreNormalizado = new Map<string, string[]>();
  for (const doc of snap.docs) {
    const data = doc.data() as Cliente;
    porId.set(doc.id, data);
    const key = normalizar(data.nombre);
    const lista = porNombreNormalizado.get(key) ?? [];
    lista.push(doc.id);
    porNombreNormalizado.set(key, lista);
  }
  return { porId, porNombreNormalizado };
}

export type ResolucionCliente =
  | { id: string; nombre: string; advertencia: string }
  | { error: string };

/**
 * Resuelve un cliente por ID (fuente primaria) y, si no existe, por nombre
 * normalizado. Nunca inventa: si no hay match único, devuelve error para
 * que la fila vaya al reporte y la resuelva Pablo.
 */
export function resolverCliente(
  indice: IndiceClientes,
  clienteId: string,
  clienteNombre: string,
): ResolucionCliente {
  if (clienteId && indice.porId.has(clienteId)) {
    return { id: clienteId, nombre: indice.porId.get(clienteId)!.nombre, advertencia: "" };
  }
  const nombreNormalizado = normalizar(clienteNombre);
  const candidatos = indice.porNombreNormalizado.get(nombreNormalizado) ?? [];
  if (candidatos.length === 1) {
    const advertencia = clienteId
      ? `cliente_id "${clienteId}" no encontrado; resuelto por nombre a ${candidatos[0]}`
      : `resuelto por nombre (sin cliente_id) a ${candidatos[0]}`;
    return { id: candidatos[0], nombre: indice.porId.get(candidatos[0])!.nombre, advertencia };
  }
  if (candidatos.length > 1) {
    return {
      error: `nombre "${clienteNombre}" ambiguo: matchea ${candidatos.length} clientes (${candidatos.join(", ")})`,
    };
  }
  return {
    error: clienteId
      ? `cliente_id "${clienteId}" no existe y el nombre no matchea a ningún cliente`
      : `sin cliente_id y el nombre no matchea a ningún cliente`,
  };
}

/** Arma el índice de columnas de un CSV a partir de un mapa de alias por campo. */
export function indexarEncabezado<T extends string>(
  encabezado: string[],
  aliases: Record<T, string[]>,
  opcionales: T[] = [],
): Record<T, number> {
  const idx = {} as Record<T, number>;
  for (const campo of Object.keys(aliases) as T[]) {
    idx[campo] = -1;
    for (const alias of aliases[campo]) {
      const encontrado = encabezado.indexOf(alias);
      if (encontrado !== -1) {
        idx[campo] = encontrado;
        break;
      }
    }
  }
  const faltantes = (Object.keys(idx) as T[]).filter(
    (campo) => idx[campo] === -1 && !opcionales.includes(campo),
  );
  if (faltantes.length > 0) {
    throw new Error(`No se encontraron columnas para: ${faltantes.join(", ")}`);
  }
  return idx;
}
