"use server";

import { FieldValue } from "firebase-admin/firestore";
import { adminDb } from "@/lib/firebase/admin";
import { proximoCodigo } from "@/lib/firebase/numeracion";
import { obtenerUsuarioSesion } from "@/lib/firebase/sesion";
import { telefonoValido } from "@/lib/reglas/validaciones";
import { clasificarGrupoContable } from "@/lib/reglas/clasificacion";
import { calcularTotales } from "@/lib/reglas/totales";
import type {
  Cliente,
  ConfigGeneral,
  GrupoContable,
  ItemCatalogo,
  ItemPresupuesto,
  ModalidadPresupuesto,
} from "@/lib/tipos";

/** Errores esperados (validación de negocio) cuyo mensaje es seguro mostrar tal cual. */
class ErrorValidacion extends Error {}

export interface DatosItemPresupuesto {
  /** null = ítem manual */
  catalogoId: string | null;
  cantidad: number;
  precioUnitario: number;
  /** Requeridos solo si catalogoId es null (ítem manual). */
  nombreManual?: string;
  rubroManual?: string;
  unidadManual?: string;
  grupoContableManual?: GrupoContable;
}

export interface DatosPresupuesto {
  clienteId: string;
  telefono: string;
  direccionObra?: string;
  tipoObra?: string;
  vendedor?: string;
  fechaVisita: string;
  fechaEmision: string;
  m2Relevados?: number;
  subpiso?: string;
  nivelSubpiso?: string;
  observacionesRiesgos?: string;
  modalidad: ModalidadPresupuesto;
  formaPago?: string;
  validez?: string;
  moneda?: string;
  exclusiones?: string;
  items: DatosItemPresupuesto[];
}

export type ResultadoCrearPresupuesto =
  | { ok: true; presupuestoId: string; obraCodigo: string }
  | { ok: false; error: string };

async function requerirUsuario() {
  const usuario = await obtenerUsuarioSesion();
  if (!usuario) throw new ErrorValidacion("No autenticado");
  return usuario;
}

function mensajeError(err: unknown): string {
  if (err instanceof ErrorValidacion) return err.message;
  console.error(err);
  return "Ocurrió un error inesperado. Intentá de nuevo.";
}

const MODALIDADES: ModalidadPresupuesto[] = ["integrada", "colocacion", "materiales"];

function validarDatos(datos: DatosPresupuesto) {
  if (!datos.clienteId.trim()) throw new ErrorValidacion("Elegí un cliente");
  if (!telefonoValido(datos.telefono)) {
    throw new ErrorValidacion("El teléfono debe tener entre 8 y 13 dígitos");
  }
  if (!MODALIDADES.includes(datos.modalidad)) throw new ErrorValidacion("Modalidad inválida");
  if (!datos.fechaVisita) throw new ErrorValidacion("Falta la fecha de visita");
  if (!datos.fechaEmision) throw new ErrorValidacion("Falta la fecha de emisión");
  if (datos.items.length === 0) {
    throw new ErrorValidacion("Agregá al menos un ítem");
  }
  for (const item of datos.items) {
    if (!(item.cantidad > 0)) throw new ErrorValidacion("Hay un ítem con cantidad inválida");
    if (!(item.precioUnitario >= 0)) {
      throw new ErrorValidacion("Hay un ítem con precio unitario inválido");
    }
    if (!item.catalogoId) {
      if (!item.nombreManual?.trim() || !item.rubroManual?.trim() || !item.unidadManual?.trim()) {
        throw new ErrorValidacion(
          "Los ítems manuales necesitan nombre, rubro y unidad",
        );
      }
      if (!item.grupoContableManual) {
        throw new ErrorValidacion("Los ítems manuales necesitan un grupo contable");
      }
    }
  }
}

function fechaDesdeInput(valor: string): Date {
  return new Date(`${valor}T12:00:00`);
}

/**
 * Fase 5 - Crea una obra nueva (version 1) con su presupuesto. Todo en UNA
 * transacción: valida cliente, resuelve ítems (catálogo o manuales), toma el
 * código de obra del año de emisión (R6) y calcula subtotales/total (R3).
 */
export async function crearPresupuesto(
  datos: DatosPresupuesto,
): Promise<ResultadoCrearPresupuesto> {
  try {
    const usuario = await requerirUsuario();
    validarDatos(datos);

    const resultado = await adminDb.runTransaction(async (tx) => {
      const clienteRef = adminDb.collection("clientes").doc(datos.clienteId);
      const clienteSnap = await tx.get(clienteRef);
      if (!clienteSnap.exists) throw new ErrorValidacion("Cliente no encontrado");
      const cliente = clienteSnap.data() as Cliente;

      const catalogoIds = [
        ...new Set(datos.items.map((i) => i.catalogoId).filter((id): id is string => !!id)),
      ];
      const catalogoSnaps = await Promise.all(
        catalogoIds.map((id) => tx.get(adminDb.collection("catalogo").doc(id))),
      );
      const catalogoPorId = new Map<string, ItemCatalogo>();
      catalogoSnaps.forEach((snap, i) => {
        if (!snap.exists) {
          throw new ErrorValidacion(`El ítem de catálogo ${catalogoIds[i]} ya no existe`);
        }
        catalogoPorId.set(catalogoIds[i], snap.data() as ItemCatalogo);
      });

      const configSnap = await tx.get(adminDb.collection("config").doc("general"));
      const config = configSnap.exists ? (configSnap.data() as ConfigGeneral) : null;
      const tcUsdSnapshot = config?.tcUsd ?? 0;

      const anio = fechaDesdeInput(datos.fechaEmision).getFullYear();
      const obraCodigo = await proximoCodigo(tx, `obras-${anio}`);
      const numero = Number(obraCodigo.split("-").pop());

      const items: ItemPresupuesto[] = datos.items.map((item, orden) => {
        if (item.catalogoId) {
          const catItem = catalogoPorId.get(item.catalogoId)!;
          return {
            catalogoId: item.catalogoId,
            codigo: catItem.codigo,
            nombre: catItem.nombre,
            rubro: catItem.rubro,
            unidad: catItem.unidad,
            cantidad: item.cantidad,
            precioUnitario: item.precioUnitario,
            subtotal: item.cantidad * item.precioUnitario,
            grupoContable: catItem.grupoContable,
            esManual: false,
            grupoContableExplicito: false,
            requiereVerificacion: catItem.requiereVerificacion,
            orden,
          };
        }

        const grupoContable = clasificarGrupoContable({
          rubro: item.rubroManual!,
          esManual: true,
          grupoContableExplicito: true,
          grupoContable: item.grupoContableManual,
        });

        return {
          catalogoId: null,
          codigo: "",
          nombre: item.nombreManual!.trim(),
          rubro: item.rubroManual!.trim(),
          unidad: item.unidadManual!.trim(),
          cantidad: item.cantidad,
          precioUnitario: item.precioUnitario,
          subtotal: item.cantidad * item.precioUnitario,
          grupoContable,
          esManual: true,
          grupoContableExplicito: true,
          requiereVerificacion: false,
          orden,
        };
      });

      const totales = calcularTotales(items, datos.modalidad);

      const obraRef = adminDb.collection("obras").doc(obraCodigo);
      tx.set(obraRef, {
        anio,
        numero,
        clienteId: datos.clienteId,
        clienteNombre: cliente.nombre,
        ultimaVersion: 1,
      });

      const presupuestoRef = adminDb.collection("presupuestos").doc();
      const ahora = FieldValue.serverTimestamp();
      tx.set(presupuestoRef, {
        obraCodigo,
        version: 1,
        clienteId: datos.clienteId,
        clienteNombre: cliente.nombre,
        telefono: datos.telefono.trim(),
        direccionObra: datos.direccionObra?.trim() ?? "",
        tipoObra: datos.tipoObra?.trim() ?? "",
        vendedor: datos.vendedor?.trim() ?? "",
        fechaVisita: fechaDesdeInput(datos.fechaVisita),
        fechaEmision: fechaDesdeInput(datos.fechaEmision),
        m2Relevados: datos.m2Relevados ?? 0,
        subpiso: datos.subpiso?.trim() ?? "",
        nivelSubpiso: datos.nivelSubpiso?.trim() ?? "",
        observacionesRiesgos: datos.observacionesRiesgos?.trim() ?? "",
        modalidad: datos.modalidad,
        formaPago: datos.formaPago?.trim() ?? "",
        validez: datos.validez?.trim() ?? "",
        moneda: datos.moneda?.trim() ?? "Pesos",
        exclusiones: datos.exclusiones?.trim() ?? "",
        estado: "Emitido",
        tcUsdSnapshot,
        items,
        ...totales,
        esLegado: false,
        linkPdfLegado: "",
        pdfPath: "",
        creadoPor: usuario.uid,
        creadoEn: ahora,
        actualizadoEn: ahora,
      });

      return { presupuestoId: presupuestoRef.id, obraCodigo };
    });

    return { ok: true, ...resultado };
  } catch (err) {
    return { ok: false, error: mensajeError(err) };
  }
}
