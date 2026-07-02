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
 * Dos casos conocidos del export real de COTA CERO se manejan de forma
 * explícita (por decisión de Pablo, no es una corrección silenciosa):
 *
 * 1. Filas de la época anterior a la numeración COTA-AAAA-NNNN, con
 *    codigo_obra vacío o un número suelto (ej. "9"): se agrupan por
 *    (codigo_obra crudo + cliente resuelto) como versiones sucesivas de UNA
 *    obra, y se les asigna un código NUEVO (nunca se reutiliza el número
 *    suelto como si fuera el NNNN final, para no chocar con códigos
 *    COTA-AAAA-NNNN reales que ya existan con ese mismo número).
 * 2. Filas que comparten el mismo codigo_obra+version porque el presupuesto
 *    se generó mal y se rehizo (el PDF se regeneró varias veces): se
 *    conserva la más reciente por fecha_hora y las anteriores quedan
 *    registradas en el reporte como regeneraciones descartadas (no como
 *    anomalía a resolver).
 *
 * Cliente no resuelto, fecha/total/estado inválido, o conflicto con un doc
 * ya existente en destino, se siguen reportando sin importar en silencio.
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
  codigoObraCrudo: string;
  requiereCodigoNuevo: boolean;
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

  // Se carga toda la colección de obras una sola vez: sirve tanto para el
  // chequeo de colisión como para saber a partir de qué número seguir al
  // asignar códigos nuevos a las filas sin codigo_obra válido.
  const obrasExistentes = new Map<string, Obra>();
  const maxNumeroPorAnio = new Map<number, number>();
  const snapObras = await db.collection("obras").get();
  for (const doc of snapObras.docs) {
    const data = doc.data() as Obra;
    obrasExistentes.set(doc.id, data);
    maxNumeroPorAnio.set(data.anio, Math.max(maxNumeroPorAnio.get(data.anio) ?? 0, data.numero));
  }

  const reporte: FilaReporte[] = [];
  const validas: FilaValida[] = [];

  for (const fila of filas) {
    const advertencias: string[] = [];

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

    // Estado vacío = no se guardó en el Excel (confirmado por Pablo), no
    // "estado desconocido": se asume 'Emitido' (como mínimo el presupuesto
    // se generó) y queda visible en advertencias para revisión puntual.
    // Un valor NO vacío que no matchea ninguno de los 4 válidos sí sigue
    // bloqueando, porque ahí hay un dato real y raro que hay que mirar.
    const estadoNormalizado = fila.estado.trim().toLowerCase();
    let estado: EstadoPresupuesto;
    if (!estadoNormalizado) {
      estado = "Emitido";
      advertencias.push('estado vacío en el legado; se asume "Emitido" por default');
    } else {
      const encontrado = ESTADOS_VALIDOS.find((e) => e.toLowerCase() === estadoNormalizado);
      if (!encontrado) {
        reporte.push({
          codigoObra: fila.codigoObra,
          version: fila.version,
          clienteNombreCsv: fila.clienteNombre,
          accion: "omitido",
          motivo: `estado desconocido: "${fila.estado}"`,
        });
        continue;
      }
      estado = encontrado;
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

    const matchCodigo = fila.codigoObra.match(CODIGO_OBRA);
    let codigoObra = "";
    let anio: number;
    let numeroObra: number;
    let requiereCodigoNuevo = false;
    if (matchCodigo) {
      codigoObra = fila.codigoObra.toUpperCase();
      anio = Number(matchCodigo[1]);
      numeroObra = Number(matchCodigo[2]);
      maxNumeroPorAnio.set(anio, Math.max(maxNumeroPorAnio.get(anio) ?? 0, numeroObra));
    } else {
      requiereCodigoNuevo = true;
      anio = fechaHora.getFullYear();
      numeroObra = -1;
      advertencias.push(
        `codigo_obra vacío/no válido en el legado ("${fila.codigoObra}") — se le asigna un código nuevo`,
      );
    }

    validas.push({
      codigoObra,
      codigoObraCrudo: fila.codigoObra.trim(),
      requiereCodigoNuevo,
      anio,
      numero: numeroObra,
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

  // Filas de la época sin numeración COTA-AAAA-NNNN: se agrupan por
  // (codigo_obra crudo + cliente resuelto) como versiones sucesivas de UNA
  // obra que nunca tuvo código formal, y se les asigna un código nuevo
  // (nunca el número suelto original, que puede chocar con un código real).
  const gruposCodigoNuevo = new Map<string, FilaValida[]>();
  for (const v of validas) {
    if (!v.requiereCodigoNuevo) continue;
    const clave = `${v.codigoObraCrudo}#${v.clienteId}`;
    const lista = gruposCodigoNuevo.get(clave) ?? [];
    lista.push(v);
    gruposCodigoNuevo.set(clave, lista);
  }
  const gruposOrdenados = [...gruposCodigoNuevo.values()].sort(
    (a, b) => Math.min(...a.map((f) => f.fechaHora.getTime())) - Math.min(...b.map((f) => f.fechaHora.getTime())),
  );
  for (const grupo of gruposOrdenados) {
    grupo.sort((a, b) => a.fechaHora.getTime() - b.fechaHora.getTime());
    const anio = grupo[0].fechaHora.getFullYear();
    const siguiente = (maxNumeroPorAnio.get(anio) ?? 0) + 1;
    maxNumeroPorAnio.set(anio, siguiente);
    const codigoNuevo = `COTA-${anio}-${String(siguiente).padStart(4, "0")}`;
    grupo.forEach((f, i) => {
      f.codigoObra = codigoNuevo;
      f.numero = siguiente;
      f.version = i + 1;
      f.advertencias.push(
        `código asignado automáticamente: ${codigoNuevo} (codigo_obra original="${f.codigoObraCrudo}"; versión renumerada a ${i + 1} de ${grupo.length} para este grupo del mismo cliente)`,
      );
    });
  }

  // Regeneraciones repetidas del mismo presupuesto (mismo codigo_obra +
  // version porque el PDF se armó mal y se rehizo): se conserva la más
  // reciente por fecha_hora; las anteriores no son una anomalía a resolver,
  // quedan solo registradas en el reporte.
  const porObraVersion = new Map<string, FilaValida[]>();
  for (const v of validas) {
    const clave = `${v.codigoObra}#${v.version}`;
    const lista = porObraVersion.get(clave) ?? [];
    lista.push(v);
    porObraVersion.set(clave, lista);
  }

  const aProcesar: FilaValida[] = [];
  for (const grupo of porObraVersion.values()) {
    if (grupo.length === 1) {
      aProcesar.push(grupo[0]);
      continue;
    }
    const ordenado = [...grupo].sort((a, b) => b.fechaHora.getTime() - a.fechaHora.getTime());
    const [ganador, ...resto] = ordenado;
    aProcesar.push(ganador);
    for (const v of resto) {
      reporte.push({
        codigoObra: v.codigoObra,
        version: String(v.version),
        clienteNombreCsv: v.clienteNombre,
        accion: "omitido",
        motivo: `regeneración anterior del mismo presupuesto (se conserva la más reciente, del ${ganador.fechaHora.toISOString()})`,
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
  console.log(`Omitidos (requieren resolución o regeneración descartada): ${omitidos}`);
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
