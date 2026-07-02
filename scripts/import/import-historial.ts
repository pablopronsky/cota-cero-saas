/**
 * Importa presupuestos legado desde el CSV exportado de la hoja _historial.
 *
 * Columnas esperadas: fecha_hora, codigo_obra, cliente_nombre, total,
 * version, link_pdf, cliente_id, estado.
 *
 * Depende de que `import-clientes.ts` ya haya corrido contra el mismo
 * destino (resuelve cliente_id/cliente_nombre contra la colección real de
 * clientes). Por cada código de obra crea/actualiza `obras/{codigo}`
 * (preservando año, número y versión máxima) y por cada fila un
 * `presupuestos` con `esLegado = true`, `items = []`, sin re-calcular nada.
 *
 * Ninguna fila con cliente no resuelto, versión duplicada, fecha/total/
 * estado inválido, o conflicto con un doc ya existente en destino, se
 * importa en silencio: queda en el reporte para resolución manual.
 *
 * Uso:
 *   npm run import:historial -- <archivo.csv>                  → dry-run contra emulador
 *   npm run import:historial -- <archivo.csv> --ejecutar        → importa al emulador
 *   npm run import:historial -- <archivo.csv> --produccion      → dry-run contra producción
 *   npm run import:historial -- <archivo.csv> --ejecutar --produccion  → importa a producción
 *
 * Siempre genera reporte-import-historial.csv.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { config as cargarEnv } from "dotenv";
import { getFirestore } from "firebase-admin/firestore";
import type { EstadoPresupuesto, Obra, Presupuesto } from "../../lib/tipos";
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
  console.error("Uso: tsx scripts/import/import-historial.ts <archivo.csv> [--ejecutar] [--produccion]");
  process.exit(1);
}

type CampoFila =
  | "fechaHora"
  | "codigoObra"
  | "clienteNombre"
  | "total"
  | "version"
  | "linkPdf"
  | "clienteId"
  | "estado";

const ALIASES: Record<CampoFila, string[]> = {
  fechaHora: ["fecha hora", "fecha y hora", "fecha"],
  codigoObra: ["codigo obra", "codigo"],
  clienteNombre: ["cliente nombre", "cliente"],
  total: ["total"],
  version: ["version", "version pdf"],
  linkPdf: ["link pdf", "link drive", "link", "pdf"],
  clienteId: ["cliente id"],
  estado: ["estado"],
};

interface FilaCsv {
  fechaHora: string;
  codigoObra: string;
  clienteNombre: string;
  total: string;
  version: string;
  linkPdf: string;
  clienteId: string;
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
    fechaHora: (fila[idx.fechaHora] ?? "").trim(),
    codigoObra: (fila[idx.codigoObra] ?? "").trim(),
    clienteNombre: (fila[idx.clienteNombre] ?? "").trim(),
    total: (fila[idx.total] ?? "").trim(),
    version: (fila[idx.version] ?? "").trim(),
    linkPdf: (fila[idx.linkPdf] ?? "").trim(),
    clienteId: (fila[idx.clienteId] ?? "").trim(),
    estado: (fila[idx.estado] ?? "").trim(),
  }));
}

interface FilaReporte {
  codigoObra: string;
  version: string;
  clienteNombreCsv: string;
  accion: "importar" | "omitido";
  motivo: string;
}

const CODIGO_OBRA = /^COTA-(\d{4})-(\d+)$/i;
const ESTADOS_VALIDOS: EstadoPresupuesto[] = ["Emitido", "Confirmado", "Anulado", "Superado"];

interface FilaValida {
  codigoObra: string;
  anio: number;
  numero: number;
  version: number;
  clienteId: string;
  clienteNombre: string;
  telefono: string;
  total: number;
  estado: EstadoPresupuesto;
  fechaHora: Date;
  linkPdf: string;
  advertencias: string[];
}

async function main() {
  const filas = leerFilas(resolve(archivoCsv!));

  const app = inicializarAdmin(produccion);
  const db = getFirestore(app);
  const indiceClientes = await cargarClientes(db);

  const reporte: FilaReporte[] = [];
  const validas: FilaValida[] = [];

  for (const fila of filas) {
    const advertencias: string[] = [];

    const matchCodigo = fila.codigoObra.match(CODIGO_OBRA);
    if (!matchCodigo) {
      reporte.push({
        codigoObra: fila.codigoObra,
        version: fila.version,
        clienteNombreCsv: fila.clienteNombre,
        accion: "omitido",
        motivo: `codigo_obra no tiene el formato COTA-AAAA-NNNN: "${fila.codigoObra}"`,
      });
      continue;
    }

    const version = Number.parseInt(fila.version.trim().replace(/^v/i, ""), 10);
    if (!Number.isFinite(version) || version <= 0) {
      reporte.push({
        codigoObra: fila.codigoObra,
        version: fila.version,
        clienteNombreCsv: fila.clienteNombre,
        accion: "omitido",
        motivo: `version inválida: "${fila.version}"`,
      });
      continue;
    }

    const estadoNormalizado = fila.estado.trim().toLowerCase();
    const estado = ESTADOS_VALIDOS.find((e) => e.toLowerCase() === estadoNormalizado);
    if (!estado) {
      reporte.push({
        codigoObra: fila.codigoObra,
        version: fila.version,
        clienteNombreCsv: fila.clienteNombre,
        accion: "omitido",
        motivo: `estado desconocido: "${fila.estado}"`,
      });
      continue;
    }

    if (!fila.total.trim()) {
      reporte.push({
        codigoObra: fila.codigoObra,
        version: fila.version,
        clienteNombreCsv: fila.clienteNombre,
        accion: "omitido",
        motivo: "total vacío",
      });
      continue;
    }
    const total = numero(fila.total);

    const fechaHora = parsearFecha(fila.fechaHora);
    if (!fechaHora) {
      reporte.push({
        codigoObra: fila.codigoObra,
        version: fila.version,
        clienteNombreCsv: fila.clienteNombre,
        accion: "omitido",
        motivo: `fecha_hora inválida: "${fila.fechaHora}"`,
      });
      continue;
    }

    const resolucion = resolverCliente(indiceClientes, fila.clienteId, fila.clienteNombre);
    if ("error" in resolucion) {
      reporte.push({
        codigoObra: fila.codigoObra,
        version: fila.version,
        clienteNombreCsv: fila.clienteNombre,
        accion: "omitido",
        motivo: `cliente no resuelto: ${resolucion.error}`,
      });
      continue;
    }
    if (resolucion.advertencia) advertencias.push(resolucion.advertencia);
    if (!fila.linkPdf) advertencias.push("sin link_pdf");

    validas.push({
      codigoObra: fila.codigoObra.toUpperCase(),
      anio: Number(matchCodigo[1]),
      numero: Number(matchCodigo[2]),
      version,
      clienteId: resolucion.id,
      clienteNombre: resolucion.nombre,
      telefono: indiceClientes.porId.get(resolucion.id)?.telefono ?? "",
      total,
      estado,
      fechaHora,
      linkPdf: fila.linkPdf,
      advertencias,
    });
  }

  // Version duplicada dentro del mismo codigo_obra: no se puede decidir cuál
  // vale, así que se excluyen todas las filas en conflicto.
  const porObraVersion = new Map<string, FilaValida[]>();
  for (const v of validas) {
    const clave = `${v.codigoObra}#${v.version}`;
    const lista = porObraVersion.get(clave) ?? [];
    lista.push(v);
    porObraVersion.set(clave, lista);
  }
  const clavesDuplicadas = new Set(
    [...porObraVersion.entries()].filter(([, l]) => l.length > 1).map(([k]) => k),
  );

  const aProcesar = validas.filter((v) => !clavesDuplicadas.has(`${v.codigoObra}#${v.version}`));
  for (const clave of clavesDuplicadas) {
    for (const v of porObraVersion.get(clave)!) {
      reporte.push({
        codigoObra: v.codigoObra,
        version: String(v.version),
        clienteNombreCsv: v.clienteNombre,
        accion: "omitido",
        motivo: `version duplicada: hay más de una fila con codigo_obra=${v.codigoObra} y version=${v.version}`,
      });
    }
  }

  // Agrupa por obra para detectar cliente inconsistente entre versiones y
  // para armar el doc de obras/{codigo}.
  const porObra = new Map<string, FilaValida[]>();
  for (const v of aProcesar) {
    const lista = porObra.get(v.codigoObra) ?? [];
    lista.push(v);
    porObra.set(v.codigoObra, lista);
  }

  const obrasExistentes = new Map<string, Obra>();
  const idsObra = [...porObra.keys()];
  for (let i = 0; i < idsObra.length; i += 300) {
    const lote = idsObra.slice(i, i + 300);
    const snaps = await db.getAll(...lote.map((id) => db.collection("obras").doc(id)));
    for (const snap of snaps) {
      if (snap.exists) obrasExistentes.set(snap.id, snap.data() as Obra);
    }
  }

  const obrasAImportar: Array<{ id: string; data: Obra }> = [];
  const presupuestosAImportar: Array<{ data: Presupuesto; filaOrigen: FilaValida }> = [];

  for (const [codigoObra, filasObra] of porObra) {
    const clientesDistintos = new Set(filasObra.map((f) => f.clienteId));
    const inconsistente = clientesDistintos.size > 1
      ? `cliente distinto entre versiones de la misma obra (${[...clientesDistintos].join(", ")})`
      : "";

    const maxVersion = Math.max(...filasObra.map((f) => f.version));
    const filaMasReciente = filasObra.find((f) => f.version === maxVersion)!;
    const { anio, numero: num } = filaMasReciente;

    const obraNueva: Obra = {
      anio,
      numero: num,
      clienteId: filaMasReciente.clienteId,
      clienteNombre: filaMasReciente.clienteNombre,
      ultimaVersion: maxVersion,
    };

    const existente = obrasExistentes.get(codigoObra);
    if (existente && (existente.anio !== obraNueva.anio || existente.numero !== obraNueva.numero || existente.clienteId !== obraNueva.clienteId)) {
      for (const f of filasObra) {
        reporte.push({
          codigoObra,
          version: String(f.version),
          clienteNombreCsv: f.clienteNombre,
          accion: "omitido",
          motivo: `obra "${codigoObra}" ya existe en destino con datos distintos (año/número/cliente)`,
        });
      }
      continue;
    }

    obrasAImportar.push({ id: codigoObra, data: obraNueva });

    for (const f of filasObra) {
      presupuestosAImportar.push({
        filaOrigen: f,
        data: {
          obraCodigo: codigoObra,
          version: f.version,
          clienteId: f.clienteId,
          clienteNombre: f.clienteNombre,
          telefono: f.telefono,
          direccionObra: "",
          tipoObra: "",
          vendedor: "",
          fechaVisita: aTimestamp(f.fechaHora),
          fechaEmision: aTimestamp(f.fechaHora),
          m2Relevados: 0,
          subpiso: "",
          nivelSubpiso: "",
          observacionesRiesgos: "",
          modalidad: "integrada",
          formaPago: "",
          validez: "",
          moneda: "",
          exclusiones: "",
          estado: f.estado,
          tcUsdSnapshot: 0,
          items: [],
          subtotalMateriales: 0,
          subtotalManoObra: 0,
          subtotalAccesorios: 0,
          total: f.total,
          esLegado: true,
          linkPdfLegado: f.linkPdf,
          pdfPath: "",
          creadoPor: "import-historial",
          creadoEn: aTimestamp(f.fechaHora),
          actualizadoEn: aTimestamp(f.fechaHora),
        },
      });
      const motivoAdvertencias = [inconsistente, ...f.advertencias].filter(Boolean).join(" | ");
      reporte.push({
        codigoObra,
        version: String(f.version),
        clienteNombreCsv: f.clienteNombre,
        accion: "importar",
        motivo: motivoAdvertencias,
      });
    }
  }

  // Idempotencia: no duplicar presupuestos si ya se importaron antes
  // (presupuestos usa autoId, así que sin este chequeo un re-run duplicaría).
  // Se carga una sola vez toda la colección de legados existentes en vez de
  // consultar fila por fila.
  const legadosExistentes = new Map<string, Presupuesto>();
  const snapLegados = await db.collection("presupuestos").where("esLegado", "==", true).get();
  for (const doc of snapLegados.docs) {
    const data = doc.data() as Presupuesto;
    legadosExistentes.set(`${data.obraCodigo}#${data.version}`, data);
  }

  const aEscribir: Array<{ data: Presupuesto; filaOrigen: FilaValida }> = [];
  for (const item of presupuestosAImportar) {
    const clave = `${item.data.obraCodigo}#${item.data.version}`;
    const existente = legadosExistentes.get(clave);
    const idx = reporte.findIndex(
      (r) => r.codigoObra === item.data.obraCodigo && r.version === String(item.data.version) && r.accion === "importar",
    );

    if (!existente) {
      aEscribir.push(item);
      continue;
    }

    if (existente.total === item.data.total && existente.estado === item.data.estado) {
      if (idx !== -1) {
        reporte[idx].accion = "omitido";
        reporte[idx].motivo = [reporte[idx].motivo, "ya importado antes (idéntico), se omite"].filter(Boolean).join(" | ");
      }
    } else if (idx !== -1) {
      reporte[idx].accion = "omitido";
      reporte[idx].motivo = `ya existe un legado para ${item.data.obraCodigo} v${item.data.version} con total/estado distinto (total=${existente.total}, estado=${existente.estado})`;
    }
  }

  const rutaReporte = resolve(process.cwd(), "reporte-import-historial.csv");
  escribirReporte(
    ["codigoObra", "version", "clienteNombreCsv", "accion", "motivo"],
    reporte.map((f) => [f.codigoObra, f.version, f.clienteNombreCsv, f.accion, f.motivo]),
    rutaReporte,
  );

  const omitidos = reporte.filter((r) => r.accion === "omitido").length;
  console.log(`Filas leídas: ${filas.length}`);
  console.log(`Obras a crear/actualizar: ${obrasAImportar.length}`);
  console.log(`Presupuestos a importar: ${aEscribir.length}`);
  console.log(`Omitidos (requieren resolución): ${omitidos}`);
  console.log(`Reporte: ${rutaReporte}`);

  if (!ejecutar) {
    console.log("\nDRY-RUN: no se escribió nada. Agregá --ejecutar para importar de verdad.");
    return;
  }

  console.log(`\nEjecutando importación real contra ${produccion ? "PRODUCCIÓN" : "el emulador"}...`);

  for (let i = 0; i < obrasAImportar.length; i += 400) {
    const lote = db.batch();
    for (const { id, data } of obrasAImportar.slice(i, i + 400)) {
      lote.set(db.collection("obras").doc(id), data, { merge: true });
    }
    await lote.commit();
  }

  for (let i = 0; i < aEscribir.length; i += 400) {
    const lote = db.batch();
    for (const { data } of aEscribir.slice(i, i + 400)) {
      lote.set(db.collection("presupuestos").doc(), data);
    }
    await lote.commit();
  }

  const porAnio = new Map<number, number>();
  for (const { data } of obrasAImportar) {
    porAnio.set(data.anio, Math.max(porAnio.get(data.anio) ?? 0, data.numero));
  }
  for (const [anio, maxNumero] of porAnio) {
    const ref = db.collection("contadores").doc(`obras-${anio}`);
    const snap = await ref.get();
    const actual = snap.exists ? ((snap.data()?.ultimo as number) ?? 0) : 0;
    if (maxNumero > actual) {
      await ref.set({ ultimo: maxNumero }, { merge: true });
      console.log(`contadores/obras-${anio} actualizado: ${actual} → ${maxNumero}`);
    } else {
      console.log(`contadores/obras-${anio} ya estaba en ${actual} (>= ${maxNumero}), no se tocó.`);
    }
  }

  console.log(`Importación completa: ${obrasAImportar.length} obras, ${aEscribir.length} presupuestos legado.`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
