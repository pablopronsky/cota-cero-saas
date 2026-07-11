import type { Timestamp } from "firebase-admin/firestore";

/** Fuente de verdad del modelo de datos. Ver ARQUITECTURA.md para el detalle. */

export type Rol = "usuario";

export interface Usuario {
  nombre: string;
  email: string;
  rol: Rol;
  activo: boolean;
}

export type EstadoCliente = "Activo" | "Inactivo";

export interface Cliente {
  /** doc ID = codigo (CLI-0001) */
  nombre: string;
  telefono: string;
  telefonoNormalizado: string;
  email: string;
  direccion: string;
  localidad: string;
  tipo: string;
  cuitDni: string;
  condicionIva: string;
  origen: string;
  notas: string;
  estado: EstadoCliente;
  /** Denormalizado: sum(debe) - sum(haber). Solo lo actualizan las transacciones de movimientos. */
  saldo: number;
  fechaAlta: Timestamp;
  creadoEn: Timestamp;
  actualizadoEn: Timestamp;
}

export type Moneda = "Pesos" | "Dolar";
export type GrupoContable = "materiales" | "mano_obra" | "accesorios";
export type EstadoCatalogo = "Habilitado" | "Deshabilitado";

export interface ItemCatalogo {
  codigo: string;
  rubro: string;
  nombre: string;
  unidad: string;
  especificacion: string;
  /** Preparado para un futuro módulo de proveedores/compras. Hoy es solo texto libre. */
  proveedor: string;
  precioLista: number;
  precioFinalIva: number;
  moneda: Moneda;
  estado: EstadoCatalogo;
  grupoContable: GrupoContable;
  m2PorCaja: number | null;
  requiereVerificacion: boolean;
  creadoEn: Timestamp;
  actualizadoEn: Timestamp;
}

export interface Obra {
  /** doc ID = codigo (COTA-2026-0001) */
  anio: number;
  numero: number;
  clienteId: string;
  clienteNombre: string;
  ultimaVersion: number;
  /** Pipeline comercial, independiente del estado documental; opcional solo hasta migrar obras existentes. */
  estadoComercial?: EstadoComercial;
  proximoSeguimiento?: Timestamp | null;
  motivoPerdida?: MotivoPerdida | null;
  motivoPerdidaDetalle?: string;
  /** Historial breve de contactos, embebido como los ítems de presupuesto. */
  contactos?: ContactoComercial[];
  actualizadoEn?: Timestamp;
}

export type EstadoComercial =
  | "PendienteEnvio"
  | "Enviado"
  | "EnNegociacion"
  | "Ganado"
  | "Perdido";

export type MotivoPerdida =
  | "precio"
  | "plazo"
  | "competidor"
  | "alcance"
  | "sin_respuesta"
  | "otro";

export type CanalContacto = "whatsapp" | "llamada" | "visita" | "email" | "otro";

export interface ContactoComercial {
  fechaHora: Timestamp;
  canal: CanalContacto;
  nota: string;
  /** Email del usuario que registró el contacto. */
  usuario: string;
  /** Versión vigente al momento de registrar el contacto. */
  versionPresupuesto: number;
}

export type ModalidadPresupuesto = "integrada" | "colocacion" | "materiales";
export type EstadoPresupuesto = "Emitido" | "Confirmado" | "Anulado" | "Superado";

export interface ItemPresupuesto {
  catalogoId: string | null;
  codigo: string;
  nombre: string;
  rubro: string;
  unidad: string;
  cantidad: number;
  precioUnitario: number;
  subtotal: number;
  grupoContable: GrupoContable;
  esManual: boolean;
  grupoContableExplicito: boolean;
  requiereVerificacion: boolean;
  orden: number;
}

export interface Presupuesto {
  obraCodigo: string;
  version: number;
  clienteId: string;
  clienteNombre: string;
  telefono: string;
  direccionObra: string;
  tipoObra: string;
  vendedor: string;
  fechaVisita: Timestamp;
  fechaEmision: Timestamp;
  m2Relevados: number;
  subpiso: string;
  nivelSubpiso: string;
  observacionesRiesgos: string;
  modalidad: ModalidadPresupuesto;
  formaPago: string;
  validez: string;
  moneda: string;
  exclusiones: string;
  estado: EstadoPresupuesto;
  /** Derivada de fechaEmision + validez; null si no se interpreta y opcional solo en datos previos a Fase A. */
  venceEl?: Timestamp | null;
  tcUsdSnapshot: number;
  items: ItemPresupuesto[];
  subtotalMateriales: number;
  subtotalManoObra: number;
  subtotalAccesorios: number;
  total: number;
  esLegado: boolean;
  linkPdfLegado: string;
  pdfPath: string;
  creadoPor: string;
  creadoEn: Timestamp;
  actualizadoEn: Timestamp;
}

export type TipoMovimiento =
  | "CONFIRMACION_PRESUPUESTO"
  | "PAGO"
  | "ANULACION_PRESUPUESTO"
  | "ANULACION_PAGO"
  | "AJUSTE";

export interface Movimiento {
  codigo: string;
  fechaHora: Timestamp;
  clienteId: string;
  clienteNombre: string;
  tipo: TipoMovimiento;
  presupuestoId: string | null;
  codigoObra: string;
  versionPresupuesto: number;
  concepto: string;
  debe: number;
  haber: number;
  medioPago: string;
  referencia: string;
  /** Obligatorio si tipo es anulación o ajuste (validado en el server). */
  motivo: string;
  movAnuladoId: string | null;
  reciboPath: string;
  notas: string;
  creadoPor: string;
}

export type NombreContador = "clientes" | "movimientos" | `obras-${number}`;

export interface Contador {
  ultimo: number;
}

export interface ConfigGeneral {
  tcUsd: number;
  validezDefault: string;
  membrete: {
    nombre: string;
    direccion: string;
    telefono: string;
    logoUrl: string;
  };
}
