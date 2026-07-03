/**
 * Renderiza las plantillas PDF con datos de ejemplo para revisarlas sin levantar
 * la app: `npx tsx scripts/preview-pdf.tsx [carpeta-destino]`.
 * Escribe presupuesto-preview.pdf y recibo-preview.pdf.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { Timestamp } from "firebase-admin/firestore";
import { renderToBuffer } from "@react-pdf/renderer";
import { PresupuestoPDF } from "../lib/pdf/PresupuestoPDF";
import { ReciboPDF } from "../lib/pdf/ReciboPDF";
import type { ConfigGeneral, Movimiento, Presupuesto } from "../lib/tipos";

const destino = process.argv[2] ?? ".";
mkdirSync(destino, { recursive: true });

const config: ConfigGeneral = {
  tcUsd: 1495,
  validezDefault: "10 días corridos",
  membrete: {
    nombre: "COTA CERO",
    direccion: "La Plata, Buenos Aires",
    telefono: "221 568-1131",
    logoUrl: "",
  },
};

const presupuesto: Presupuesto = {
  obraCodigo: "COTA-2026-0037",
  version: 2,
  clienteId: "CLI-0012",
  clienteNombre: "Erico y Norma",
  telefono: "2215222157",
  direccionObra: "459 12a y 12b 1930",
  tipoObra: "Vivienda",
  vendedor: "Pablo Pronsky",
  fechaVisita: Timestamp.fromDate(new Date("2026-06-28T12:00:00")),
  fechaEmision: Timestamp.fromDate(new Date("2026-07-01T12:00:00")),
  m2Relevados: 18,
  subpiso: "Ceramica",
  nivelSubpiso: "",
  observacionesRiesgos: "",
  modalidad: "integrada",
  formaPago: "100% materiales al confirmar · 50% MO inicio · 50% MO cierre",
  validez: "10 días corridos",
  moneda: "Pesos",
  exclusiones:
    "No se realiza la extracción ni la recolocación de sanitarios o artefactos de baño. " +
    "Para garantizar la correcta colocación de las placas UV, el espacio debe estar libre de " +
    "artefactos al momento de iniciar la obra.",
  estado: "Emitido",
  tcUsdSnapshot: 1495,
  items: [
    {
      catalogoId: "x1",
      codigo: "MANUAL",
      nombre: "Placa UV Marble 3mm 1220x2440",
      rubro: "Placas UV",
      unidad: "unidad",
      cantidad: 7,
      precioUnitario: 85000,
      subtotal: 595000,
      grupoContable: "materiales",
      esManual: false,
      grupoContableExplicito: false,
      requiereVerificacion: false,
      orden: 1,
    },
    {
      catalogoId: "x2",
      codigo: "MANUAL",
      nombre: "Varilla terminación negra - Placa UV",
      rubro: "Placas UV",
      unidad: "unidad",
      cantidad: 4,
      precioUnitario: 32000,
      subtotal: 128000,
      grupoContable: "materiales",
      esManual: false,
      grupoContableExplicito: false,
      requiereVerificacion: false,
      orden: 2,
    },
    {
      catalogoId: "x3",
      codigo: "KPU524",
      nombre: "Pegamento Poliuretano 40",
      rubro: "Adhesivos",
      unidad: "unidad",
      cantidad: 6,
      precioUnitario: 18500,
      subtotal: 111000,
      grupoContable: "accesorios",
      esManual: false,
      grupoContableExplicito: false,
      requiereVerificacion: false,
      orden: 3,
    },
    {
      catalogoId: "x4",
      codigo: "2766",
      nombre: "Colocacion Placa UV",
      rubro: "Mano de obra",
      unidad: "unidad",
      cantidad: 6,
      precioUnitario: 65000,
      subtotal: 390000,
      grupoContable: "mano_obra",
      esManual: false,
      grupoContableExplicito: false,
      requiereVerificacion: false,
      orden: 4,
    },
    {
      catalogoId: "x5",
      codigo: "F02001",
      nombre: "Flete",
      rubro: "Logística",
      unidad: "unidad",
      cantidad: 1,
      precioUnitario: 100000,
      subtotal: 100000,
      grupoContable: "accesorios",
      esManual: false,
      grupoContableExplicito: false,
      requiereVerificacion: false,
      orden: 5,
    },
  ],
  subtotalMateriales: 723000,
  subtotalManoObra: 390000,
  subtotalAccesorios: 211000,
  total: 1324000,
  esLegado: false,
  linkPdfLegado: "",
  pdfPath: "",
  creadoPor: "preview",
  creadoEn: Timestamp.now(),
  actualizadoEn: Timestamp.now(),
} as Presupuesto;

const movimiento: Movimiento = {
  codigo: "COTA-REC-2026-0027",
  fechaHora: Timestamp.fromDate(new Date("2026-06-29T15:30:00")),
  clienteId: "CLI-0008",
  clienteNombre: "Pacheco Martin",
  tipo: "PAGO",
  presupuestoId: "abc",
  codigoObra: "COTA-2026-0027",
  versionPresupuesto: 1,
  concepto: "Entrega a cuenta por provisión de materiales: Deck Co-Extruded G02 + G10 (22x142x2200)",
  debe: 0,
  haber: 3000000,
  medioPago: "Transferencia",
  referencia: "USD 2.000 · TC $ 1.500",
  motivo: "",
  movAnuladoId: null,
  reciboPath: "",
  notas: "",
  creadoPor: "preview",
} as Movimiento;

async function main() {
  const bufPresupuesto = await renderToBuffer(PresupuestoPDF({ presupuesto, config }));
  writeFileSync(join(destino, "presupuesto-preview.pdf"), bufPresupuesto);
  console.log("presupuesto-preview.pdf OK", bufPresupuesto.length, "bytes");

  const bufRecibo = await renderToBuffer(ReciboPDF({ movimiento, config }));
  writeFileSync(join(destino, "recibo-preview.pdf"), bufRecibo);
  console.log("recibo-preview.pdf OK", bufRecibo.length, "bytes");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
