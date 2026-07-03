import { Document, Page, View, Text, Image, StyleSheet } from "@react-pdf/renderer";
import type { ConfigGeneral, Movimiento } from "@/lib/tipos";
import { montoEnLetras } from "@/lib/reglas/montoEnLetras";
import { LOGO_COTA_CERO_PNG, LOGO_RATIO } from "@/lib/pdf/logo";

/**
 * Plantilla calcada del recibo de referencia del sistema anterior
 * ("Recibo_Pacheco_Martin_COTA_CERO.pdf", 2026-06): logo a la izquierda,
 * "RECIBO DE PAGO" espaciado a la derecha, secciones con título subrayado,
 * caja de valores recibidos y líneas de firma. Colores llevados a la paleta
 * oficial (grafito/cobre/hueso) en lugar del gris azulado del original.
 */

const COBRE_OSCURO = "#8a5527";
const GRAFITO = "#1f1f1f";
const PIEDRA = "#b8aea3";
const HUESO = "#f5f2ed";
const GRIS_TEXTO = "#6b6259";

const LOGO_ANCHO = 120;

const styles = StyleSheet.create({
  page: {
    paddingTop: 44,
    paddingHorizontal: 48,
    paddingBottom: 60,
    fontSize: 10,
    fontFamily: "Helvetica",
    color: GRAFITO,
  },

  encabezado: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    marginBottom: 26,
  },
  logo: { width: LOGO_ANCHO, height: LOGO_ANCHO * LOGO_RATIO, marginTop: 2 },
  encabezadoDerecha: { alignItems: "flex-end" },
  tituloRecibo: { fontSize: 22, letterSpacing: 3, color: GRAFITO },
  numeroRecibo: { fontFamily: "Helvetica-Bold", fontSize: 12, marginTop: 6, color: COBRE_OSCURO },
  fechaRecibo: { fontSize: 10, color: GRIS_TEXTO, marginTop: 3 },

  seccionTitulo: {
    fontFamily: "Helvetica-Bold",
    fontSize: 11,
    letterSpacing: 1.2,
    textTransform: "uppercase",
    marginBottom: 4,
  },
  seccionRegla: { borderBottomWidth: 1.5, borderBottomColor: GRAFITO, marginBottom: 10 },
  seccion: { marginBottom: 22 },

  filaDatos: { flexDirection: "row", marginBottom: 7 },
  datoLabel: { width: 90, fontFamily: "Helvetica-Bold", fontSize: 10 },
  datoValor: { flex: 1, fontSize: 10 },
  datoLabel2: { width: 90, fontFamily: "Helvetica-Bold", fontSize: 10, marginLeft: 24 },

  conceptoHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    backgroundColor: HUESO,
    paddingVertical: 6,
    paddingHorizontal: 10,
    marginBottom: 8,
  },
  conceptoHeaderTexto: {
    fontFamily: "Helvetica-Bold",
    fontSize: 8,
    letterSpacing: 0.8,
    textTransform: "uppercase",
    color: "#44403a",
  },
  conceptoCuerpo: { paddingHorizontal: 10 },
  conceptoPrincipal: { fontFamily: "Helvetica-Bold", fontSize: 10, marginBottom: 3 },
  conceptoDetalle: { fontSize: 10, color: GRIS_TEXTO },

  valoresBox: {
    backgroundColor: "#faf8f5",
    borderWidth: 1,
    borderColor: "#e5e0d8",
    paddingVertical: 14,
    paddingHorizontal: 16,
  },
  valoresFila: {
    flexDirection: "row",
    justifyContent: "flex-end",
    alignItems: "baseline",
    marginBottom: 6,
  },
  valoresLabel: { fontSize: 10, color: GRIS_TEXTO, textAlign: "right" },
  valoresValor: { width: 130, fontSize: 10, textAlign: "right" },
  valoresSeparador: { borderBottomWidth: 0.75, borderBottomColor: PIEDRA, marginVertical: 8 },
  totalFila: {
    flexDirection: "row",
    justifyContent: "flex-end",
    alignItems: "baseline",
  },
  totalLabel: { fontFamily: "Helvetica-Bold", fontSize: 12, textAlign: "right" },
  totalValor: {
    width: 150,
    fontFamily: "Helvetica-Bold",
    fontSize: 15,
    textAlign: "right",
    color: COBRE_OSCURO,
  },
  sonTexto: {
    marginTop: 10,
    textAlign: "right",
    fontSize: 10,
  },
  sonLabel: { fontFamily: "Helvetica-Bold" },
  sonValor: { fontFamily: "Helvetica-Oblique" },

  firmas: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginTop: 64,
    paddingHorizontal: 24,
  },
  firma: { width: 190, alignItems: "center" },
  firmaLinea: { borderBottomWidth: 0.75, borderBottomColor: GRIS_TEXTO, alignSelf: "stretch" },
  firmaTexto: { marginTop: 6, fontSize: 9, color: GRIS_TEXTO },

  footer: {
    position: "absolute",
    bottom: 28,
    left: 48,
    right: 48,
    textAlign: "center",
    fontSize: 9,
    color: PIEDRA,
  },
});

const fmtMonto = (n: number) =>
  `$ ${n.toLocaleString("es-AR", { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;

const MESES = [
  "enero",
  "febrero",
  "marzo",
  "abril",
  "mayo",
  "junio",
  "julio",
  "agosto",
  "septiembre",
  "octubre",
  "noviembre",
  "diciembre",
];

function fechaLarga(d: Date): string {
  return `${d.getDate()} de ${MESES[d.getMonth()]} de ${d.getFullYear()}`;
}

function capitalizar(s: string): string {
  return s ? s.charAt(0).toUpperCase() + s.slice(1) : s;
}

/** "tres millones" → "Tres millones de pesos argentinos exactos". */
function montoEnLetrasCompleto(monto: number): string {
  const letras = montoEnLetras(monto);
  const conCentavos = letras.includes("/100");
  const necesitaDe = /(millón|millones)$/.test(letras.trim());
  const sufijo = `${necesitaDe ? " de" : ""} pesos argentinos${conCentavos ? "" : " exactos"}`;
  return `${capitalizar(letras)}${sufijo}`;
}

function SeccionTitulo({ texto }: { texto: string }) {
  return (
    <View>
      <Text style={styles.seccionTitulo}>{texto}</Text>
      <View style={styles.seccionRegla} />
    </View>
  );
}

export function ReciboPDF({
  movimiento,
  config,
}: {
  movimiento: Movimiento;
  config: ConfigGeneral | null;
}) {
  const membrete = config?.membrete;
  const monto = movimiento.haber;
  const nombreEmpresa = membrete?.nombre || "COTA CERO";

  const piePartes = [nombreEmpresa, "Superficies & Terminaciones"];
  if (membrete?.telefono) piePartes.push(`WhatsApp: ${membrete.telefono}`);

  return (
    <Document title={`Recibo ${movimiento.codigo} — COTA CERO`} author={nombreEmpresa}>
      <Page size="A4" style={styles.page}>
        {/* Encabezado */}
        <View style={styles.encabezado}>
          {/* eslint-disable-next-line jsx-a11y/alt-text -- Image de @react-pdf, no admite alt */}
          <Image src={LOGO_COTA_CERO_PNG} style={styles.logo} />
          <View style={styles.encabezadoDerecha}>
            <Text style={styles.tituloRecibo}>RECIBO DE PAGO</Text>
            <Text style={styles.numeroRecibo}>N° {movimiento.codigo}</Text>
            <Text style={styles.fechaRecibo}>
              Fecha: {fechaLarga(movimiento.fechaHora.toDate())}
            </Text>
          </View>
        </View>

        {/* Información del cliente */}
        <View style={styles.seccion}>
          <SeccionTitulo texto="Información del cliente" />
          <View style={styles.filaDatos}>
            <Text style={styles.datoLabel}>Cliente:</Text>
            <Text style={styles.datoValor}>{movimiento.clienteNombre}</Text>
            <Text style={styles.datoLabel2}>Obra:</Text>
            <Text style={styles.datoValor}>
              {movimiento.codigoObra
                ? `${movimiento.codigoObra}${movimiento.versionPresupuesto ? ` · v${movimiento.versionPresupuesto}` : ""}`
                : "—"}
            </Text>
          </View>
          <View style={styles.filaDatos}>
            <Text style={styles.datoLabel}>Medio de pago:</Text>
            <Text style={styles.datoValor}>{movimiento.medioPago || "—"}</Text>
            <Text style={styles.datoLabel2}>Referencia:</Text>
            <Text style={styles.datoValor}>{movimiento.referencia || "—"}</Text>
          </View>
        </View>

        {/* Concepto */}
        <View style={styles.seccion}>
          <SeccionTitulo texto="Concepto de referencia" />
          <View style={styles.conceptoHeader}>
            <Text style={styles.conceptoHeaderTexto}>Descripción / concepto</Text>
          </View>
          <View style={styles.conceptoCuerpo}>
            <Text style={styles.conceptoPrincipal}>{movimiento.concepto || "Pago a cuenta"}</Text>
            {movimiento.notas ? (
              <Text style={styles.conceptoDetalle}>{movimiento.notas}</Text>
            ) : null}
          </View>
        </View>

        {/* Valores recibidos */}
        <View style={styles.seccion}>
          <SeccionTitulo texto="Especificación de valores recibidos" />
          <View style={styles.valoresBox}>
            <View style={styles.totalFila}>
              <Text style={styles.totalLabel}>Total Recibido (ARS):</Text>
              <Text style={styles.totalValor}>{fmtMonto(monto)}</Text>
            </View>
          </View>
          <Text style={styles.sonTexto}>
            <Text style={styles.sonLabel}>Son: </Text>
            <Text style={styles.sonValor}>{montoEnLetrasCompleto(monto)}.</Text>
          </Text>
        </View>

        {/* Firmas */}
        <View style={styles.firmas}>
          <View style={styles.firma}>
            <View style={styles.firmaLinea} />
            <Text style={styles.firmaTexto}>
              Recibido por{" "}
              {nombreEmpresa
                .toLowerCase()
                .split(/\s+/)
                .map(capitalizar)
                .join(" ")}
            </Text>
          </View>
          <View style={styles.firma}>
            <View style={styles.firmaLinea} />
            <Text style={styles.firmaTexto}>Firma del Cliente</Text>
          </View>
        </View>

        {/* Pie */}
        <Text style={styles.footer} fixed>
          {piePartes.join(" • ")} — Documento generado por el sistema, no válido como factura.
        </Text>
      </Page>
    </Document>
  );
}
