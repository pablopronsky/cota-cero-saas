import { Document, Page, View, Text, Image, StyleSheet } from "@react-pdf/renderer";
import type { ConfigGeneral, GrupoContable, ItemPresupuesto, Presupuesto } from "@/lib/tipos";
import { gruposIncluidos } from "@/lib/reglas/totales";
import { LOGO_COTA_CERO_PNG, LOGO_RATIO } from "@/lib/pdf/logo";

/**
 * Plantilla calcada del PDF de referencia del sistema anterior
 * ("Erico y Norma - UV Marble 3mm.pdf", 2026-07): logo con descriptor arriba,
 * código de obra en Courier cobre, tablas con celdas de etiqueta en hueso,
 * encabezados de tabla en grafito y total de la propuesta en cobre sobre grafito.
 */

const COBRE = "#c38a5a";
const COBRE_OSCURO = "#8a5527";
const GRAFITO = "#1f1f1f";
const PIEDRA = "#b8aea3";
const HUESO = "#f5f2ed";
const GRIS_TEXTO = "#6b6259";

const TAGLINE = "La diferencia está en la ejecución.";

const MODALIDAD_LABEL: Record<Presupuesto["modalidad"], string> = {
  integrada: "Obra integrada — materiales y ejecución completa por COTA CERO.",
  colocacion: "Colocación — mano de obra y accesorios; los materiales los provee el cliente.",
  materiales: "Solo materiales — provisión de materiales y accesorios, sin ejecución.",
};

const GRUPO_LABEL: Record<GrupoContable, string> = {
  materiales: "Materiales",
  mano_obra: "Mano de obra",
  accesorios: "Accesorios e insumos",
};

const LOGO_ANCHO = 150;

const styles = StyleSheet.create({
  page: {
    paddingTop: 40,
    paddingHorizontal: 40,
    paddingBottom: 64,
    fontSize: 9,
    fontFamily: "Helvetica",
    color: GRAFITO,
  },
  logo: { width: LOGO_ANCHO, height: LOGO_ANCHO * LOGO_RATIO, marginBottom: 18 },

  codigoFila: { flexDirection: "row", alignItems: "baseline", marginBottom: 2 },
  codigoObra: { fontFamily: "Courier-Bold", fontSize: 16, color: COBRE_OSCURO },
  emitido: { fontSize: 9, color: GRIS_TEXTO, marginLeft: 8 },
  vendedor: { fontSize: 10, marginBottom: 14 },

  /* Tabla de datos del cliente: celdas etiqueta en hueso + celdas valor. */
  tablaDatos: { borderWidth: 1, borderColor: GRAFITO, marginBottom: 18 },
  tablaDatosFila: { flexDirection: "row", borderBottomWidth: 1, borderBottomColor: GRAFITO },
  tablaDatosFilaUltima: { flexDirection: "row" },
  celdaLabel: {
    width: "22%",
    backgroundColor: HUESO,
    paddingVertical: 6,
    paddingHorizontal: 8,
    borderRightWidth: 1,
    borderRightColor: GRAFITO,
    fontFamily: "Helvetica-Bold",
    fontSize: 7,
    textTransform: "uppercase",
    color: "#44403a",
    justifyContent: "center",
  },
  celdaValor: {
    width: "28%",
    paddingVertical: 6,
    paddingHorizontal: 8,
    fontSize: 10,
    justifyContent: "center",
  },
  celdaValorBorde: { borderRightWidth: 1, borderRightColor: GRAFITO },

  /* Tabla de ítems. */
  tablaItems: { marginBottom: 18 },
  itemsHeader: {
    flexDirection: "row",
    backgroundColor: GRAFITO,
    color: "#ffffff",
    fontFamily: "Helvetica-Bold",
    fontSize: 8,
    paddingVertical: 6,
    paddingHorizontal: 6,
  },
  itemsFila: {
    flexDirection: "row",
    borderBottomWidth: 0.75,
    borderBottomColor: PIEDRA,
    paddingVertical: 6,
    paddingHorizontal: 6,
  },
  itemsFilaAlterna: { backgroundColor: "#faf8f5" },
  itemsFilaExcluida: { color: GRIS_TEXTO },
  colNum: { width: "5%" },
  colDescripcion: { width: "31%", paddingRight: 6 },
  colCodigo: { width: "13%", fontFamily: "Courier", fontSize: 8 },
  colUnidad: { width: "11%" },
  colCantidad: { width: "12%", textAlign: "right", paddingRight: 8 },
  colPrecio: { width: "14%", textAlign: "right" },
  colSubtotal: { width: "14%", textAlign: "right", fontFamily: "Helvetica-Bold" },
  notaExcluido: { fontSize: 7, color: GRIS_TEXTO, marginTop: 1 },

  /* Bloque de totales. */
  totales: { borderWidth: 1, borderColor: GRAFITO, marginBottom: 20 },
  totalesFila: {
    flexDirection: "row",
    borderBottomWidth: 1,
    borderBottomColor: GRAFITO,
  },
  totalesLabel: {
    width: "55%",
    backgroundColor: HUESO,
    paddingVertical: 6,
    paddingHorizontal: 8,
    borderRightWidth: 1,
    borderRightColor: GRAFITO,
    fontSize: 9,
    color: "#44403a",
  },
  totalesValor: {
    flex: 1,
    paddingVertical: 6,
    paddingHorizontal: 8,
    textAlign: "right",
    fontFamily: "Courier",
    fontSize: 10,
  },
  totalesExcluido: { color: PIEDRA },
  totalFinalFila: { flexDirection: "row", backgroundColor: GRAFITO },
  totalFinalLabel: {
    width: "55%",
    paddingVertical: 8,
    paddingHorizontal: 8,
    color: "#ffffff",
    fontFamily: "Helvetica-Bold",
    fontSize: 11,
  },
  totalFinalValor: {
    flex: 1,
    paddingVertical: 8,
    paddingHorizontal: 8,
    textAlign: "right",
    fontFamily: "Courier-Bold",
    fontSize: 13,
    color: COBRE,
  },

  /* Condiciones. */
  condicionesTitulo: {
    fontFamily: "Helvetica-Bold",
    fontSize: 8,
    textTransform: "uppercase",
    color: "#44403a",
    marginBottom: 4,
  },
  condiciones: { borderWidth: 1, borderColor: GRAFITO, marginBottom: 18 },
  condicionesFila: { flexDirection: "row", borderBottomWidth: 1, borderBottomColor: GRAFITO },
  condicionesFilaUltima: { flexDirection: "row" },
  condicionesLabel: {
    width: "30%",
    backgroundColor: HUESO,
    paddingVertical: 6,
    paddingHorizontal: 8,
    borderRightWidth: 1,
    borderRightColor: GRAFITO,
    fontFamily: "Helvetica-Bold",
    fontSize: 9,
    color: "#44403a",
  },
  condicionesValor: {
    flex: 1,
    paddingVertical: 6,
    paddingHorizontal: 8,
    fontFamily: "Helvetica-Bold",
    fontSize: 9,
  },

  /* Modalidad, exclusiones y observaciones (texto corrido, como la pág. 2 de referencia). */
  textoModalidad: {
    fontFamily: "Helvetica-BoldOblique",
    fontSize: 10,
    lineHeight: 1.45,
    marginBottom: 8,
    color: "#3a3a3a",
  },

  footer: {
    position: "absolute",
    bottom: 24,
    left: 40,
    right: 40,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-end",
  },
  footerIzq: { maxWidth: "55%" },
  footerWhatsapp: { fontFamily: "Helvetica-BoldOblique", fontSize: 8, color: PIEDRA },
  footerTc: { fontFamily: "Helvetica-Oblique", fontSize: 7, color: PIEDRA, marginTop: 1 },
  footerNota: { fontSize: 6.5, color: PIEDRA, marginTop: 2 },
  footerTagline: {
    fontFamily: "Helvetica-BoldOblique",
    fontSize: 10,
    color: PIEDRA,
    textAlign: "right",
  },
});

const fmtEntero = (n: number) =>
  `$ ${n.toLocaleString("es-AR", { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
const fmtCantidad = (n: number) =>
  n.toLocaleString("es-AR", { maximumFractionDigits: 2 });
const fmtFecha = (d: Date) => d.toLocaleDateString("es-AR");

function FilaDatos({
  l1,
  v1,
  l2,
  v2,
  ultima,
}: {
  l1: string;
  v1: string;
  l2: string;
  v2: string;
  ultima?: boolean;
}) {
  return (
    <View style={ultima ? styles.tablaDatosFilaUltima : styles.tablaDatosFila}>
      <View style={styles.celdaLabel}>
        <Text>{l1}</Text>
      </View>
      <View style={[styles.celdaValor, styles.celdaValorBorde]}>
        <Text>{v1 || "—"}</Text>
      </View>
      <View style={styles.celdaLabel}>
        <Text>{l2}</Text>
      </View>
      <View style={styles.celdaValor}>
        <Text>{v2 || "—"}</Text>
      </View>
    </View>
  );
}

export function PresupuestoPDF({
  presupuesto,
  config,
}: {
  presupuesto: Presupuesto;
  config: ConfigGeneral | null;
}) {
  const incluidos = gruposIncluidos(presupuesto.modalidad);
  const items = [...presupuesto.items].sort((a, b) => a.orden - b.orden);
  const membrete = config?.membrete;
  const whatsapp = membrete?.telefono || "";

  const subtotalPorGrupo: Record<GrupoContable, number> = {
    materiales: presupuesto.subtotalMateriales,
    mano_obra: presupuesto.subtotalManoObra,
    accesorios: presupuesto.subtotalAccesorios,
  };

  const esExcluido = (item: ItemPresupuesto) => !incluidos.includes(item.grupoContable);

  return (
    <Document
      title={`Presupuesto ${presupuesto.obraCodigo} v${presupuesto.version} — COTA CERO`}
      author={membrete?.nombre || "COTA CERO"}
    >
      <Page size="A4" style={styles.page}>
        {/* Membrete */}
        {/* eslint-disable-next-line jsx-a11y/alt-text -- Image de @react-pdf, no admite alt */}
        <Image src={LOGO_COTA_CERO_PNG} style={styles.logo} />

        <View style={styles.codigoFila}>
          <Text style={styles.codigoObra}>{presupuesto.obraCodigo}</Text>
          <Text style={styles.emitido}>
            · Emitido: {fmtFecha(presupuesto.fechaEmision.toDate())} · v{presupuesto.version}
          </Text>
        </View>
        {presupuesto.vendedor ? (
          <Text style={styles.vendedor}>Vendedor: {presupuesto.vendedor}</Text>
        ) : (
          <View style={{ marginBottom: 14 }} />
        )}

        {/* Cliente y obra */}
        <View style={styles.tablaDatos}>
          <FilaDatos
            l1="Cliente"
            v1={presupuesto.clienteNombre}
            l2="Teléfono"
            v2={presupuesto.telefono}
          />
          <FilaDatos
            l1="Dirección"
            v1={presupuesto.direccionObra}
            l2="Tipo de obra"
            v2={presupuesto.tipoObra}
          />
          <FilaDatos
            l1="Superficie"
            v1={presupuesto.m2Relevados > 0 ? `${fmtCantidad(presupuesto.m2Relevados)} m²` : ""}
            l2="Subpiso"
            v2={presupuesto.subpiso}
            ultima
          />
        </View>

        {/* Ítems */}
        <View style={styles.tablaItems}>
          <View style={styles.itemsHeader}>
            <Text style={styles.colNum}>#</Text>
            <Text style={styles.colDescripcion}>Descripción</Text>
            <Text style={styles.colCodigo}>Código</Text>
            <Text style={styles.colUnidad}>Unidad</Text>
            <Text style={styles.colCantidad}>Cantidad</Text>
            <Text style={styles.colPrecio}>Precio u. (ARS)</Text>
            <Text style={styles.colSubtotal}>Subtotal</Text>
          </View>
          {items.map((item, i) => {
            const excluido = esExcluido(item);
            return (
              <View
                key={i}
                style={[
                  styles.itemsFila,
                  ...(i % 2 === 1 ? [styles.itemsFilaAlterna] : []),
                  ...(excluido ? [styles.itemsFilaExcluida] : []),
                ]}
                wrap={false}
              >
                <Text style={styles.colNum}>{i + 1}</Text>
                <View style={styles.colDescripcion}>
                  <Text>{item.nombre}</Text>
                  {excluido && (
                    <Text style={styles.notaExcluido}>
                      No suma al total según la modalidad.
                    </Text>
                  )}
                </View>
                <Text style={styles.colCodigo}>{item.codigo || "MANUAL"}</Text>
                <Text style={styles.colUnidad}>{item.unidad}</Text>
                <Text style={styles.colCantidad}>{fmtCantidad(item.cantidad)}</Text>
                <Text style={styles.colPrecio}>{fmtEntero(item.precioUnitario)}</Text>
                <Text style={styles.colSubtotal}>{fmtEntero(item.subtotal)}</Text>
              </View>
            );
          })}
        </View>

        {/* Totales */}
        <View style={styles.totales} wrap={false}>
          {(Object.keys(GRUPO_LABEL) as GrupoContable[]).map((grupo) => {
            const excluido = !incluidos.includes(grupo);
            return (
              <View key={grupo} style={styles.totalesFila}>
                <Text style={styles.totalesLabel}>
                  {GRUPO_LABEL[grupo]}
                  {excluido ? " (no incluido en esta modalidad)" : ""}
                </Text>
                <Text style={[styles.totalesValor, ...(excluido ? [styles.totalesExcluido] : [])]}>
                  {fmtEntero(subtotalPorGrupo[grupo])}
                </Text>
              </View>
            );
          })}
          <View style={styles.totalFinalFila}>
            <Text style={styles.totalFinalLabel}>TOTAL DE LA PROPUESTA</Text>
            <Text style={styles.totalFinalValor}>{fmtEntero(presupuesto.total)}</Text>
          </View>
        </View>

        {/* Condiciones */}
        <View wrap={false}>
          <Text style={styles.condicionesTitulo}>Condiciones de esta propuesta</Text>
          <View style={styles.condiciones}>
            <View style={styles.condicionesFila}>
              <Text style={styles.condicionesLabel}>Forma de pago</Text>
              <Text style={styles.condicionesValor}>{presupuesto.formaPago || "—"}</Text>
            </View>
            <View style={styles.condicionesFila}>
              <Text style={styles.condicionesLabel}>Validez</Text>
              <Text style={styles.condicionesValor}>{presupuesto.validez || "—"}</Text>
            </View>
            <View style={styles.condicionesFilaUltima}>
              <Text style={styles.condicionesLabel}>Moneda</Text>
              <Text style={styles.condicionesValor}>
                {presupuesto.moneda === "Pesos" ? "Pesos argentinos (ARS)" : presupuesto.moneda}
              </Text>
            </View>
          </View>
        </View>

        {/* Modalidad + exclusiones/observaciones */}
        <View>
          <Text style={styles.textoModalidad}>
            Modalidad: {MODALIDAD_LABEL[presupuesto.modalidad]}
          </Text>
          {presupuesto.exclusiones ? (
            <Text style={styles.textoModalidad}>Exclusiones: {presupuesto.exclusiones}</Text>
          ) : null}
          {presupuesto.observacionesRiesgos ? (
            <Text style={styles.textoModalidad}>
              Observaciones: {presupuesto.observacionesRiesgos}
            </Text>
          ) : null}
        </View>

        {/* Pie de página */}
        <View style={styles.footer} fixed>
          <View style={styles.footerIzq}>
            {whatsapp ? <Text style={styles.footerWhatsapp}>WhatsApp {whatsapp}</Text> : null}
            {presupuesto.tcUsdSnapshot > 0 && (
              <Text style={styles.footerTc}>
                TC de referencia utilizado: {fmtEntero(presupuesto.tcUsdSnapshot)} —{" "}
                {fmtFecha(presupuesto.fechaEmision.toDate())}
              </Text>
            )}
            <Text style={styles.footerNota}>
              Documento generado por el sistema, no válido como factura.
            </Text>
          </View>
          <Text style={styles.footerTagline}>{TAGLINE}</Text>
        </View>
      </Page>
    </Document>
  );
}
