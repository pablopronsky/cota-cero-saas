import { Document, Page, View, Text, StyleSheet } from "@react-pdf/renderer";
import type { ConfigGeneral, Movimiento } from "@/lib/tipos";
import { montoEnLetras } from "@/lib/reglas/montoEnLetras";

/** Recibo tipo cheque, mismo membrete que PresupuestoPDF. Se genera al registrar un pago. */

const COBRE = "#c38a5a";
const GRAFITO = "#1f1f1f";
const PIEDRA = "#b8aea3";

const styles = StyleSheet.create({
  page: { padding: 40, fontSize: 10, fontFamily: "Helvetica", color: GRAFITO },
  encabezado: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    borderBottomWidth: 2,
    borderBottomColor: COBRE,
    paddingBottom: 12,
    marginBottom: 24,
  },
  marca: { fontSize: 18, fontFamily: "Helvetica-Bold", color: COBRE },
  membreteDato: { fontSize: 8, color: GRAFITO, marginTop: 1 },
  tituloRecibo: { fontSize: 14, fontFamily: "Helvetica-Bold", textAlign: "right" },
  subtituloRecibo: { fontSize: 9, textAlign: "right", marginTop: 2, color: GRAFITO },
  cuerpo: { marginTop: 10 },
  filaDato: {
    flexDirection: "row",
    alignItems: "flex-end",
    borderBottomWidth: 0.5,
    borderBottomColor: PIEDRA,
    paddingBottom: 4,
    marginBottom: 14,
  },
  filaDatoLabel: { fontSize: 9, color: "#6b6259", width: 120 },
  filaDatoValor: { fontSize: 11, flex: 1 },
  montoBox: {
    marginTop: 10,
    alignSelf: "flex-end",
    borderWidth: 1,
    borderColor: GRAFITO,
    paddingVertical: 8,
    paddingHorizontal: 16,
  },
  montoValor: { fontSize: 16, fontFamily: "Helvetica-Bold" },
  footer: {
    position: "absolute",
    bottom: 30,
    left: 40,
    right: 40,
    fontSize: 7,
    color: "#6b6259",
    borderTopWidth: 0.5,
    borderTopColor: PIEDRA,
    paddingTop: 6,
    textAlign: "center",
  },
});

const fmtMoneda = (n: number) =>
  `$ ${n.toLocaleString("es-AR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const fmtFecha = (d: Date) => d.toLocaleDateString("es-AR");

function capitalizar(s: string): string {
  return s ? s.charAt(0).toUpperCase() + s.slice(1) : s;
}

function Fila({ label, valor }: { label: string; valor: string }) {
  return (
    <View style={styles.filaDato}>
      <Text style={styles.filaDatoLabel}>{label}</Text>
      <Text style={styles.filaDatoValor}>{valor || "—"}</Text>
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
            <Text style={styles.tituloRecibo}>RECIBO {movimiento.codigo}</Text>
            <Text style={styles.subtituloRecibo}>{fmtFecha(movimiento.fechaHora.toDate())}</Text>
          </View>
        </View>

        <View style={styles.cuerpo}>
          <Fila label="Recibí de" valor={movimiento.clienteNombre} />
          <Fila label="La suma de pesos" valor={capitalizar(montoEnLetras(monto))} />
          <Fila label="En concepto de" valor={movimiento.concepto} />
          {movimiento.medioPago && <Fila label="Medio de pago" valor={movimiento.medioPago} />}
          {movimiento.referencia && <Fila label="Referencia" valor={movimiento.referencia} />}
        </View>

        <View style={styles.montoBox}>
          <Text style={styles.montoValor}>{fmtMoneda(monto)}</Text>
        </View>

        <View style={styles.footer} fixed>
          <Text>
            {membrete?.nombre || "COTA CERO"} · Documento generado por el sistema, no válido como
            factura.
          </Text>
        </View>
      </Page>
    </Document>
  );
}
