import { Document, Page, View, Text, StyleSheet } from "@react-pdf/renderer";
import type { ConfigGeneral, GrupoContable, ItemPresupuesto, Presupuesto } from "@/lib/tipos";
import { gruposIncluidos } from "@/lib/reglas/totales";

/**
 * Plantilla PROVISORIA (Fase 7): no había PDF de referencia del sistema
 * viejo ni logo en formato raster en el repo (solo SVG, que @react-pdf no
 * puede embeber como <Image>), así que el membrete queda en texto con la
 * paleta de marca. Comparar contra el PDF real cuando Pablo lo traiga y
 * ajustar layout/tipografía/logo.
 */

const COBRE = "#c38a5a";
const GRAFITO = "#1f1f1f";
const PIEDRA = "#b8aea3";

const GRUPO_LABEL: Record<GrupoContable, string> = {
  materiales: "Materiales",
  mano_obra: "Mano de obra",
  accesorios: "Accesorios",
};

const MODALIDAD_LABEL: Record<Presupuesto["modalidad"], string> = {
  integrada: "Integrada (materiales + mano de obra + accesorios)",
  colocacion: "Colocación (mano de obra + accesorios)",
  materiales: "Solo materiales (materiales + accesorios)",
};

const styles = StyleSheet.create({
  page: { padding: 32, fontSize: 9, fontFamily: "Helvetica", color: GRAFITO },
  encabezado: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    borderBottomWidth: 2,
    borderBottomColor: COBRE,
    paddingBottom: 10,
    marginBottom: 14,
  },
  marca: { fontSize: 18, fontFamily: "Helvetica-Bold", color: COBRE },
  membreteDato: { fontSize: 8, color: GRAFITO, marginTop: 1 },
  tituloPresupuesto: { fontSize: 12, fontFamily: "Helvetica-Bold", textAlign: "right" },
  subtituloPresupuesto: { fontSize: 9, textAlign: "right", marginTop: 2, color: GRAFITO },
  seccion: { marginBottom: 12 },
  seccionTitulo: {
    fontSize: 9,
    fontFamily: "Helvetica-Bold",
    color: "#fff",
    backgroundColor: GRAFITO,
    padding: 4,
    marginBottom: 6,
  },
  filaDatos: { flexDirection: "row", flexWrap: "wrap" },
  dato: { width: "33%", marginBottom: 6 },
  datoLabel: { fontSize: 7, color: "#6b6259", textTransform: "uppercase" },
  datoValor: { fontSize: 9, marginTop: 1 },
  tablaHeader: {
    flexDirection: "row",
    backgroundColor: GRAFITO,
    color: "#fff",
    padding: 4,
    fontFamily: "Helvetica-Bold",
  },
  tablaFila: {
    flexDirection: "row",
    padding: 4,
    borderBottomWidth: 0.5,
    borderBottomColor: PIEDRA,
  },
  tablaFilaExcluida: { color: "#6b6259" },
  colCodigo: { width: "12%" },
  colNombre: { width: "38%" },
  colCantidad: { width: "12%", textAlign: "right" },
  colPrecio: { width: "18%", textAlign: "right" },
  colSubtotal: { width: "20%", textAlign: "right" },
  grupoTitulo: {
    fontSize: 8,
    fontFamily: "Helvetica-Bold",
    marginTop: 8,
    marginBottom: 2,
    color: COBRE,
  },
  totalesFila: { flexDirection: "row", justifyContent: "flex-end", marginTop: 3 },
  totalesLabel: { width: 100, fontSize: 9 },
  totalesValor: { width: 90, fontSize: 9, textAlign: "right" },
  totalFinal: {
    flexDirection: "row",
    justifyContent: "flex-end",
    marginTop: 6,
    paddingTop: 6,
    borderTopWidth: 1,
    borderTopColor: GRAFITO,
  },
  totalFinalLabel: { width: 100, fontSize: 11, fontFamily: "Helvetica-Bold" },
  totalFinalValor: { width: 90, fontSize: 11, fontFamily: "Helvetica-Bold", textAlign: "right" },
  footer: {
    position: "absolute",
    bottom: 20,
    left: 32,
    right: 32,
    fontSize: 7,
    color: "#6b6259",
    borderTopWidth: 0.5,
    borderTopColor: PIEDRA,
    paddingTop: 6,
    flexDirection: "row",
    justifyContent: "space-between",
  },
});

const fmtMoneda = (n: number) =>
  `$ ${n.toLocaleString("es-AR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const fmtFecha = (d: Date) => d.toLocaleDateString("es-AR");

function Dato({ label, valor }: { label: string; valor: string }) {
  return (
    <View style={styles.dato}>
      <Text style={styles.datoLabel}>{label}</Text>
      <Text style={styles.datoValor}>{valor || "—"}</Text>
    </View>
  );
}

function TablaGrupo({
  grupo,
  items,
  excluido,
}: {
  grupo: GrupoContable;
  items: ItemPresupuesto[];
  excluido: boolean;
}) {
  if (items.length === 0) return null;
  const subtotal = items.reduce((acc, i) => acc + i.subtotal, 0);
  return (
    <View>
      <Text style={styles.grupoTitulo}>
        {GRUPO_LABEL[grupo]}
        {excluido ? " (no suma al total según la modalidad)" : ""}
      </Text>
      {items.map((item, i) => (
        <View key={i} style={[styles.tablaFila, excluido ? styles.tablaFilaExcluida : {}]}>
          <Text style={styles.colCodigo}>{item.codigo || "—"}</Text>
          <Text style={styles.colNombre}>{item.nombre}</Text>
          <Text style={styles.colCantidad}>
            {item.cantidad} {item.unidad}
          </Text>
          <Text style={styles.colPrecio}>{fmtMoneda(item.precioUnitario)}</Text>
          <Text style={styles.colSubtotal}>{fmtMoneda(item.subtotal)}</Text>
        </View>
      ))}
      <View style={styles.totalesFila}>
        <Text style={styles.totalesLabel}>Subtotal {GRUPO_LABEL[grupo].toLowerCase()}</Text>
        <Text style={styles.totalesValor}>{fmtMoneda(subtotal)}</Text>
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
  const porGrupo: Record<GrupoContable, ItemPresupuesto[]> = {
    materiales: [],
    mano_obra: [],
    accesorios: [],
  };
  for (const item of [...presupuesto.items].sort((a, b) => a.orden - b.orden)) {
    porGrupo[item.grupoContable].push(item);
  }

  const membrete = config?.membrete;

  return (
    <Document>
      <Page size="A4" style={styles.page}>
        <View style={styles.encabezado}>
          <View>
            <Text style={styles.marca}>{membrete?.nombre || "COTA CERO"}</Text>
            {membrete?.direccion && <Text style={styles.membreteDato}>{membrete.direccion}</Text>}
            {membrete?.telefono && <Text style={styles.membreteDato}>{membrete.telefono}</Text>}
          </View>
          <View>
            <Text style={styles.tituloPresupuesto}>
              PRESUPUESTO {presupuesto.obraCodigo} · v{presupuesto.version}
            </Text>
            <Text style={styles.subtituloPresupuesto}>
              Emitido el {fmtFecha(presupuesto.fechaEmision.toDate())}
            </Text>
          </View>
        </View>

        <View style={styles.seccion}>
          <Text style={styles.seccionTitulo}>Cliente y obra</Text>
          <View style={styles.filaDatos}>
            <Dato label="Cliente" valor={presupuesto.clienteNombre} />
            <Dato label="Teléfono" valor={presupuesto.telefono} />
            <Dato label="Tipo de obra" valor={presupuesto.tipoObra} />
            <Dato label="Dirección de la obra" valor={presupuesto.direccionObra} />
            <Dato label="Vendedor" valor={presupuesto.vendedor} />
            <Dato label="Fecha de visita" valor={fmtFecha(presupuesto.fechaVisita.toDate())} />
            <Dato label="m² relevados" valor={String(presupuesto.m2Relevados)} />
            <Dato label="Subpiso" valor={presupuesto.subpiso} />
            <Dato label="Nivel de subpiso" valor={presupuesto.nivelSubpiso} />
            <Dato label="Modalidad" valor={MODALIDAD_LABEL[presupuesto.modalidad]} />
          </View>
          {presupuesto.observacionesRiesgos && (
            <Dato label="Observaciones / riesgos" valor={presupuesto.observacionesRiesgos} />
          )}
        </View>

        <View style={styles.seccion}>
          <Text style={styles.seccionTitulo}>Ítems</Text>
          <View style={styles.tablaHeader}>
            <Text style={styles.colCodigo}>Código</Text>
            <Text style={styles.colNombre}>Descripción</Text>
            <Text style={styles.colCantidad}>Cantidad</Text>
            <Text style={styles.colPrecio}>Precio unit.</Text>
            <Text style={styles.colSubtotal}>Subtotal</Text>
          </View>
          <TablaGrupo
            grupo="materiales"
            items={porGrupo.materiales}
            excluido={!incluidos.includes("materiales")}
          />
          <TablaGrupo
            grupo="mano_obra"
            items={porGrupo.mano_obra}
            excluido={!incluidos.includes("mano_obra")}
          />
          <TablaGrupo
            grupo="accesorios"
            items={porGrupo.accesorios}
            excluido={!incluidos.includes("accesorios")}
          />

          <View style={styles.totalFinal}>
            <Text style={styles.totalFinalLabel}>TOTAL</Text>
            <Text style={styles.totalFinalValor}>{fmtMoneda(presupuesto.total)}</Text>
          </View>
        </View>

        <View style={styles.seccion}>
          <Text style={styles.seccionTitulo}>Condiciones</Text>
          <View style={styles.filaDatos}>
            <Dato label="Forma de pago" valor={presupuesto.formaPago} />
            <Dato label="Validez" valor={presupuesto.validez} />
            <Dato label="Moneda" valor={presupuesto.moneda} />
          </View>
          {presupuesto.exclusiones && (
            <Dato label="Exclusiones / observaciones" valor={presupuesto.exclusiones} />
          )}
        </View>

        <View style={styles.footer} fixed>
          <Text>
            {membrete?.nombre || "COTA CERO"} · Documento generado por el sistema, no válido como
            factura.
          </Text>
          <Text
            render={({ pageNumber, totalPages }) => `${pageNumber} / ${totalPages}`}
            fixed
          />
        </View>
      </Page>
    </Document>
  );
}
