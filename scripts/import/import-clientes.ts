/**
 * Importa clientes desde el CSV exportado de la hoja Clientes.
 *
 * Columnas esperadas: cliente_id, nombre, telefono, email, direccion,
 * localidad, tipo, cuit_dni, condicion_iva, origen, notas, fecha_alta, estado
 *
 * Preserva el código CLI-NNNN existente como doc ID (clientes/{cliente_id}).
 * Importa siempre con saldo = 0 — lo reconstruye import-movimientos.ts.
 * Al final deja `contadores/clientes` en el máximo NNNN importado (para que
 * los códigos nuevos que genere la app sigan la numeración real).
 *
 * Ninguna anomalía (teléfono inválido/duplicado, cliente_id vacío, estado
 * desconocido, fecha inválida, o un código que ya existe en destino con
 * datos distintos) se resuelve sola: se excluye de la importación por
 * default y queda reportada para que se resuelva a mano (corrigiendo el CSV
 * y volviendo a correr el dry-run) antes de ejecutar contra producción.
 *
 * Uso:
 *   npm run import:clientes -- <archivo.csv>                  → dry-run contra emulador
 *   npm run import:clientes -- <archivo.csv> --ejecutar        → importa al emulador
 *   npm run import:clientes -- <archivo.csv> --produccion      → dry-run contra producción
 *   npm run import:clientes -- <archivo.csv> --ejecutar --produccion  → importa a producción
 *
 * Siempre genera reporte-import-clientes.csv.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { config as cargarEnv } from "dotenv";
import { getFirestore, Timestamp } from "firebase-admin/firestore";
import { telefonoValido } from "../../lib/reglas/validaciones";
import type { Cliente, EstadoCliente } from "../../lib/tipos";
import {
  aTimestamp,
  detectarDelimitador,
  escribirReporte,
  indexarEncabezado,
  inicializarAdmin,
  normalizarEncabezado,
  parsearCsv,
  parsearFecha,
} from "./_shared";

cargarEnv({ path: resolve(__dirname, "../../.env.local") });

const argumentos = process.argv.slice(2);
const archivoCsv = argumentos.find((a) => !a.startsWith("--"));
const ejecutar = argumentos.includes("--ejecutar");
const produccion = argumentos.includes("--produccion");

if (!archivoCsv) {
  console.error("Uso: tsx scripts/import/import-clientes.ts <archivo.csv> [--ejecutar] [--produccion]");
  process.exit(1);
}

type CampoFila =
  | "clienteId"
  | "nombre"
  | "telefono"
  | "email"
  | "direccion"
  | "localidad"
  | "tipo"
  | "cuitDni"
  | "condicionIva"
  | "origen"
  | "notas"
  | "fechaAlta"
  | "estado";

const ALIASES: Record<CampoFila, string[]> = {
  clienteId: ["cliente id", "codigo", "id"],
  nombre: ["nombre"],
  telefono: ["telefono"],
  email: ["email", "correo"],
  direccion: ["direccion"],
  localidad: ["localidad"],
  tipo: ["tipo"],
  cuitDni: ["cuit dni", "cuit", "dni"],
  condicionIva: ["condicion iva"],
  origen: ["origen"],
  notas: ["notas"],
  fechaAlta: ["fecha alta"],
  estado: ["estado"],
};

interface FilaCsv {
  clienteId: string;
  nombre: string;
  telefono: string;
  email: string;
  direccion: string;
  localidad: string;
  tipo: string;
  cuitDni: string;
  condicionIva: string;
  origen: string;
  notas: string;
  fechaAlta: string;
  estado: string;
}

function leerFilas(rutaCsv: string): FilaCsv[] {
  const contenido = readFileSync(rutaCsv, "utf-8").replace(/^﻿/, "");
  const primeraLinea = contenido.split(/\r?\n/, 1)[0] ?? "";
  const separador = detectarDelimitador(primeraLinea);
  const [encabezadoCrudo, ...resto] = parsearCsv(contenido, separador);
  const encabezado = encabezadoCrudo.map(normalizarEncabezado);
  const idx = indexarEncabezado(encabezado, ALIASES);

  return resto.map((fila) => ({
    clienteId: (fila[idx.clienteId] ?? "").trim(),
    nombre: (fila[idx.nombre] ?? "").trim(),
    telefono: (fila[idx.telefono] ?? "").trim(),
    email: (fila[idx.email] ?? "").trim(),
    direccion: (fila[idx.direccion] ?? "").trim(),
    localidad: (fila[idx.localidad] ?? "").trim(),
    tipo: (fila[idx.tipo] ?? "").trim(),
    cuitDni: (fila[idx.cuitDni] ?? "").trim(),
    condicionIva: (fila[idx.condicionIva] ?? "").trim(),
    origen: (fila[idx.origen] ?? "").trim(),
    notas: (fila[idx.notas] ?? "").trim(),
    fechaAlta: (fila[idx.fechaAlta] ?? "").trim(),
    estado: (fila[idx.estado] ?? "").trim(),
  }));
}

interface FilaReporte {
  clienteId: string;
  nombre: string;
  telefono: string;
  accion: "importar" | "omitido";
  motivo: string;
}

const CODIGO_CLI = /^CLI-(\d+)$/i;

async function main() {
  const filas = leerFilas(resolve(archivoCsv!));

  const app = inicializarAdmin(produccion);
  const db = getFirestore(app);

  // Conteo de teléfonos dentro del propio CSV, para detectar duplicados.
  const codigosPorTelefono = new Map<string, string[]>();
  for (const fila of filas) {
    const soloDigitos = fila.telefono.replace(/\D/g, "");
    if (!soloDigitos) continue;
    const lista = codigosPorTelefono.get(soloDigitos) ?? [];
    lista.push(fila.clienteId || "(sin codigo)");
    codigosPorTelefono.set(soloDigitos, lista);
  }

  // Trae los docs existentes (si ya corrió antes, o si Fases 3-8 crearon
  // clientes de prueba con el mismo código) para no pisar datos distintos
  // en silencio.
  const idsValidos = filas.map((f) => f.clienteId).filter((id) => id);
  const existentes = new Map<string, Cliente>();
  for (let i = 0; i < idsValidos.length; i += 300) {
    const lote = idsValidos.slice(i, i + 300);
    const snaps = await db.getAll(...lote.map((id) => db.collection("clientes").doc(id)));
    for (const snap of snaps) {
      if (snap.exists) existentes.set(snap.id, snap.data() as Cliente);
    }
  }

  const reporte: FilaReporte[] = [];
  const aImportar: Array<{ id: string; data: Cliente }> = [];
  const ahora = Timestamp.now();

  for (const fila of filas) {
    const telefonoNormalizado = fila.telefono.replace(/\D/g, "");
    const duplicados = codigosPorTelefono.get(telefonoNormalizado) ?? [];
    const esDuplicado = telefonoNormalizado !== "" && duplicados.length > 1;

    if (!fila.clienteId) {
      reporte.push({
        clienteId: "",
        nombre: fila.nombre,
        telefono: fila.telefono,
        accion: "omitido",
        motivo: "cliente_id vacío",
      });
      continue;
    }
    if (!fila.nombre) {
      reporte.push({
        clienteId: fila.clienteId,
        nombre: "",
        telefono: fila.telefono,
        accion: "omitido",
        motivo: "nombre vacío",
      });
      continue;
    }
    if (!telefonoValido(fila.telefono)) {
      reporte.push({
        clienteId: fila.clienteId,
        nombre: fila.nombre,
        telefono: fila.telefono,
        accion: "omitido",
        motivo: `teléfono inválido: "${fila.telefono}"`,
      });
      continue;
    }

    const estadoNormalizado = fila.estado.trim().toLowerCase();
    let estado: EstadoCliente;
    if (estadoNormalizado === "activo") estado = "Activo";
    else if (estadoNormalizado === "inactivo") estado = "Inactivo";
    else {
      reporte.push({
        clienteId: fila.clienteId,
        nombre: fila.nombre,
        telefono: fila.telefono,
        accion: "omitido",
        motivo: `estado desconocido: "${fila.estado}"`,
      });
      continue;
    }

    const fechaAlta = parsearFecha(fila.fechaAlta);
    if (!fechaAlta) {
      reporte.push({
        clienteId: fila.clienteId,
        nombre: fila.nombre,
        telefono: fila.telefono,
        accion: "omitido",
        motivo: `fecha_alta inválida: "${fila.fechaAlta}"`,
      });
      continue;
    }

    const data: Cliente = {
      nombre: fila.nombre,
      telefono: fila.telefono,
      telefonoNormalizado,
      email: fila.email,
      direccion: fila.direccion,
      localidad: fila.localidad,
      tipo: fila.tipo,
      cuitDni: fila.cuitDni,
      condicionIva: fila.condicionIva,
      origen: fila.origen,
      notas: fila.notas,
      estado,
      saldo: 0,
      fechaAlta: aTimestamp(fechaAlta),
      creadoEn: ahora,
      actualizadoEn: ahora,
    };

    const existente = existentes.get(fila.clienteId);
    if (existente && (existente.nombre !== data.nombre || existente.telefonoNormalizado !== data.telefonoNormalizado)) {
      reporte.push({
        clienteId: fila.clienteId,
        nombre: fila.nombre,
        telefono: fila.telefono,
        accion: "omitido",
        motivo: `"${fila.clienteId}" ya existe en destino con datos distintos (nombre="${existente.nombre}", tel="${existente.telefonoNormalizado}")`,
      });
      continue;
    }

    aImportar.push({ id: fila.clienteId, data });
    reporte.push({
      clienteId: fila.clienteId,
      nombre: fila.nombre,
      telefono: fila.telefono,
      accion: "importar",
      motivo: [
        esDuplicado ? `advertencia: teléfono compartido con ${duplicados.filter((c) => c !== fila.clienteId).join(", ")}` : "",
        existente ? "ya existía en destino (datos idénticos, se reescribe)" : "",
      ]
        .filter(Boolean)
        .join(" | "),
    });
  }

  const rutaReporte = resolve(process.cwd(), "reporte-import-clientes.csv");
  escribirReporte(
    ["clienteId", "nombre", "telefono", "accion", "motivo"],
    reporte.map((f) => [f.clienteId, f.nombre, f.telefono, f.accion, f.motivo]),
    rutaReporte,
  );

  const omitidos = reporte.filter((f) => f.accion === "omitido").length;
  const duplicadosTelefono = [...codigosPorTelefono.values()].filter((v) => v.length > 1).length;
  console.log(`Filas leídas: ${filas.length}`);
  console.log(`A importar: ${aImportar.length}`);
  console.log(`Omitidas (requieren resolución): ${omitidos}`);
  console.log(`Grupos de teléfono duplicado: ${duplicadosTelefono}`);
  console.log(`Reporte: ${rutaReporte}`);

  if (!ejecutar) {
    console.log("\nDRY-RUN: no se escribió nada. Agregá --ejecutar para importar de verdad.");
    return;
  }

  console.log(`\nEjecutando importación real contra ${produccion ? "PRODUCCIÓN" : "el emulador"}...`);

  for (let i = 0; i < aImportar.length; i += 400) {
    const lote = db.batch();
    for (const { id, data } of aImportar.slice(i, i + 400)) {
      lote.set(db.collection("clientes").doc(id), data);
    }
    await lote.commit();
  }

  const maxImportado = aImportar.reduce((max, { id }) => {
    const match = id.match(CODIGO_CLI);
    if (!match) return max;
    return Math.max(max, Number(match[1]));
  }, 0);

  if (maxImportado > 0) {
    const ref = db.collection("contadores").doc("clientes");
    const snap = await ref.get();
    const actual = snap.exists ? ((snap.data()?.ultimo as number) ?? 0) : 0;
    if (maxImportado > actual) {
      await ref.set({ ultimo: maxImportado }, { merge: true });
      console.log(`contadores/clientes actualizado: ${actual} → ${maxImportado}`);
    } else {
      console.log(`contadores/clientes ya estaba en ${actual} (>= ${maxImportado}), no se tocó.`);
    }
  }

  console.log(`Importación completa: ${aImportar.length} clientes.`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
