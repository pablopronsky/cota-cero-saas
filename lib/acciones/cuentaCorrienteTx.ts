/**
 * Núcleo transaccional compartido de la cuenta corriente. NO lleva "use server":
 * exporta un helper que recibe una `Transaction` de Firestore (no serializable),
 * cosa que un archivo de server actions no puede exportar. Tanto
 * `cuentaCorriente.ts` como `cuotas.ts` lo reutilizan para que registrar un pago
 * —solo o vinculado a una cuota— comparta EXACTAMENTE la misma lógica contable.
 */
import { FieldValue, type Transaction } from "firebase-admin/firestore";
import { adminDb } from "@/lib/firebase/admin";
import { proximoCodigo } from "@/lib/firebase/numeracion";
import type { Cliente, Presupuesto } from "@/lib/tipos";

/** Errores esperados (validación de negocio) cuyo mensaje es seguro mostrar tal cual. */
export class ErrorValidacion extends Error {}

/** Pago que supera el saldo deudor sin permitirSaldoAFavor: la UI debe confirmar y reintentar. */
export class ErrorSaldoAFavor extends Error {
  constructor(public saldoResultante: number) {
    super("El pago genera saldo a favor");
  }
}

export interface DatosPago {
  clienteId: string;
  monto: number;
  medioPago?: string;
  referencia?: string;
  presupuestoId?: string | null;
  /** Si el pago supera el saldo deudor, hay que reintentar con esto en true. */
  permitirSaldoAFavor?: boolean;
  /** Concepto a registrar en el movimiento; si se omite, se deriva del presupuesto. */
  concepto?: string;
}

export function mensajeError(err: unknown): string {
  if (err instanceof ErrorValidacion) return err.message;
  console.error(err);
  return "Ocurrió un error inesperado. Intentá de nuevo.";
}

export function fmtMonto(n: number): string {
  return n.toLocaleString("es-AR", { style: "currency", currency: "ARS" });
}

export function exigirMotivo(motivo: string): string {
  const limpio = motivo.trim();
  if (!limpio) throw new ErrorValidacion("El motivo es obligatorio");
  return limpio;
}

/**
 * Cuerpo transaccional de un pago: lecturas/escrituras contables DENTRO de la
 * transacción `tx` recibida. Inserta el movimiento `haber` y descuenta el saldo.
 * Lanza `ErrorSaldoAFavor` si genera saldo a favor sin permiso explícito. No abre
 * su propia transacción: el que lo llama es dueño de la `tx` (así se puede saldar
 * una cuota en el MISMO átomo que el pago). Todas sus lecturas ocurren antes de
 * cualquier escritura, así que el llamador solo puede leer antes de invocarlo.
 */
export async function registrarPagoEnTx(
  tx: Transaction,
  usuarioUid: string,
  datos: DatosPago,
): Promise<{ movimientoId: string }> {
  if (!(datos.monto > 0)) throw new ErrorValidacion("El monto debe ser mayor a cero");

  const clienteRef = adminDb.collection("clientes").doc(datos.clienteId);
  const clienteSnap = await tx.get(clienteRef);
  if (!clienteSnap.exists) throw new ErrorValidacion("Cliente no encontrado");
  const cliente = clienteSnap.data() as Cliente;

  let presupuesto: Presupuesto | null = null;
  if (datos.presupuestoId) {
    const presupuestoSnap = await tx.get(
      adminDb.collection("presupuestos").doc(datos.presupuestoId),
    );
    if (!presupuestoSnap.exists) throw new ErrorValidacion("Presupuesto no encontrado");
    presupuesto = presupuestoSnap.data() as Presupuesto;
    if (presupuesto.clienteId !== datos.clienteId) {
      throw new ErrorValidacion("El presupuesto no pertenece a este cliente");
    }
  }

  const nuevoSaldo = cliente.saldo - datos.monto;
  if (nuevoSaldo < 0 && !datos.permitirSaldoAFavor) {
    throw new ErrorSaldoAFavor(nuevoSaldo);
  }

  const codigo = await proximoCodigo(tx, "movimientos");
  const ahora = FieldValue.serverTimestamp();
  const movimientoRef = adminDb.collection("movimientos").doc();

  tx.set(movimientoRef, {
    codigo,
    fechaHora: ahora,
    clienteId: datos.clienteId,
    clienteNombre: cliente.nombre,
    tipo: "PAGO",
    presupuestoId: datos.presupuestoId ?? null,
    codigoObra: presupuesto?.obraCodigo ?? "",
    versionPresupuesto: presupuesto?.version ?? 0,
    concepto:
      datos.concepto?.trim() ||
      (presupuesto ? `Pago - ${presupuesto.obraCodigo} v${presupuesto.version}` : "Pago"),
    debe: 0,
    haber: datos.monto,
    medioPago: datos.medioPago?.trim() ?? "",
    referencia: datos.referencia?.trim() ?? "",
    motivo: "",
    movAnuladoId: null,
    reciboPath: "",
    notas: "",
    creadoPor: usuarioUid,
  });

  tx.update(clienteRef, { saldo: nuevoSaldo, actualizadoEn: ahora });

  return { movimientoId: movimientoRef.id };
}
