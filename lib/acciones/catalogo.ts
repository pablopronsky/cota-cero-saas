"use server";

import { FieldValue } from "firebase-admin/firestore";
import { adminDb } from "@/lib/firebase/admin";
import { obtenerUsuarioSesion } from "@/lib/firebase/sesion";
import { clasificarGrupoContable } from "@/lib/reglas/clasificacion";
import { extraerM2PorCaja } from "@/lib/reglas/m2caja";
import { precioEfectivo } from "@/lib/reglas/precios";
import type { ConfigGeneral, EstadoCatalogo, ItemCatalogo, Moneda } from "@/lib/tipos";

export interface DatosItemCatalogo {
  codigo: string;
  rubro: string;
  nombre: string;
  unidad: string;
  especificacion?: string;
  proveedor?: string;
  precioLista: number;
  precioFinalIva: number;
  moneda: Moneda;
}

export type ResultadoCrearItem = { ok: true; id: string } | { ok: false; error: string };
export type ResultadoAccion = { ok: true } | { ok: false; error: string };
export type ResultadoActualizacionMasiva =
  | { ok: true; cantidad: number }
  | { ok: false; error: string };

export interface FiltroActualizacionPrecios {
  rubro?: string;
  proveedor?: string;
  moneda?: Moneda | "";
}

/** Errores esperados (validación de negocio) cuyo mensaje es seguro mostrar tal cual. */
class ErrorValidacion extends Error {}

async function requerirUsuario() {
  const usuario = await obtenerUsuarioSesion();
  if (!usuario) throw new ErrorValidacion("No autenticado");
  return usuario;
}

function validarDatos(datos: DatosItemCatalogo) {
  if (!datos.codigo.trim()) throw new ErrorValidacion("El código es obligatorio");
  if (!datos.rubro.trim()) throw new ErrorValidacion("El rubro es obligatorio");
  if (!datos.nombre.trim()) throw new ErrorValidacion("El nombre es obligatorio");
  if (!datos.unidad.trim()) throw new ErrorValidacion("La unidad es obligatoria");
  if (!(datos.precioLista >= 0)) throw new ErrorValidacion("El precio de lista no es válido");
  if (!(datos.precioFinalIva >= 0)) {
    throw new ErrorValidacion("El precio final con IVA no es válido");
  }
}

function mensajeError(err: unknown): string {
  if (err instanceof ErrorValidacion) return err.message;
  console.error(err);
  return "Ocurrió un error inesperado. Intentá de nuevo.";
}

/** Recalcula grupoContable (R2), m2PorCaja (R5) y requiereVerificacion (R4) al guardar. */
function camposDerivados(datos: DatosItemCatalogo) {
  const especificacion = datos.especificacion?.trim() ?? "";
  const grupoContable = clasificarGrupoContable({ rubro: datos.rubro });
  const m2PorCaja = extraerM2PorCaja(datos.nombre, especificacion);
  const { requiereVerificacion } = precioEfectivo(
    { moneda: datos.moneda, precioFinalIva: datos.precioFinalIva },
    1,
  );

  return {
    codigo: datos.codigo.trim(),
    rubro: datos.rubro.trim(),
    nombre: datos.nombre.trim(),
    unidad: datos.unidad.trim(),
    especificacion,
    proveedor: datos.proveedor?.trim() ?? "",
    precioLista: datos.precioLista,
    precioFinalIva: datos.precioFinalIva,
    moneda: datos.moneda,
    grupoContable,
    m2PorCaja,
    requiereVerificacion,
  };
}

function redondearPrecio(valor: number) {
  return Math.round((valor + Number.EPSILON) * 100) / 100;
}

export async function actualizarPreciosEnMasa(
  filtro: FiltroActualizacionPrecios,
  porcentaje: number,
): Promise<ResultadoActualizacionMasiva> {
  try {
    await requerirUsuario();
    if (!Number.isFinite(porcentaje) || porcentaje < -100) {
      throw new ErrorValidacion("El porcentaje no es válido");
    }
    if (porcentaje === 0) throw new ErrorValidacion("El porcentaje no puede ser cero");

    const snap = await adminDb.collection("catalogo").get();
    const afectados = snap.docs.filter((doc) => {
      const item = doc.data() as ItemCatalogo;
      return (
        (!filtro.rubro || item.rubro === filtro.rubro) &&
        (!filtro.proveedor || item.proveedor === filtro.proveedor) &&
        (!filtro.moneda || item.moneda === filtro.moneda)
      );
    });
    if (afectados.length === 0) throw new ErrorValidacion("No hay ítems para actualizar");

    const factor = 1 + porcentaje / 100;
    for (let inicio = 0; inicio < afectados.length; inicio += 500) {
      const batch = adminDb.batch();
      for (const doc of afectados.slice(inicio, inicio + 500)) {
        const item = doc.data() as ItemCatalogo;
        const precioLista = redondearPrecio(item.precioLista * factor);
        const precioFinalIva = redondearPrecio(item.precioFinalIva * factor);
        batch.update(doc.ref, {
          ...camposDerivados({ ...item, precioLista, precioFinalIva }),
          actualizadoEn: FieldValue.serverTimestamp(),
        });
      }
      await batch.commit();
    }

    return { ok: true, cantidad: afectados.length };
  } catch (err) {
    return { ok: false, error: mensajeError(err) };
  }
}

export async function crearItemCatalogo(datos: DatosItemCatalogo): Promise<ResultadoCrearItem> {
  try {
    await requerirUsuario();
    validarDatos(datos);
    const codigo = datos.codigo.trim();

    const id = await adminDb.runTransaction(async (tx) => {
      const duplicados = await tx.get(
        adminDb.collection("catalogo").where("codigo", "==", codigo).limit(1),
      );
      if (!duplicados.empty) {
        throw new ErrorValidacion(`Ya existe un ítem con el código ${codigo}`);
      }

      const ref = adminDb.collection("catalogo").doc();
      const ahora = FieldValue.serverTimestamp();
      tx.set(ref, {
        ...camposDerivados(datos),
        estado: "Habilitado" satisfies EstadoCatalogo,
        creadoEn: ahora,
        actualizadoEn: ahora,
      });
      return ref.id;
    });

    return { ok: true, id };
  } catch (err) {
    return { ok: false, error: mensajeError(err) };
  }
}

export async function actualizarItemCatalogo(
  id: string,
  datos: DatosItemCatalogo,
): Promise<ResultadoAccion> {
  try {
    await requerirUsuario();
    validarDatos(datos);
    const codigo = datos.codigo.trim();

    await adminDb.runTransaction(async (tx) => {
      const ref = adminDb.collection("catalogo").doc(id);
      const actual = await tx.get(ref);
      if (!actual.exists) throw new ErrorValidacion("Ítem no encontrado");

      if (codigo !== actual.data()?.codigo) {
        const duplicados = await tx.get(
          adminDb.collection("catalogo").where("codigo", "==", codigo).limit(1),
        );
        const otro = duplicados.docs.find((d) => d.id !== id);
        if (otro) throw new ErrorValidacion(`Ya existe un ítem con el código ${codigo}`);
      }

      tx.update(ref, {
        ...camposDerivados(datos),
        actualizadoEn: FieldValue.serverTimestamp(),
      });
    });

    return { ok: true };
  } catch (err) {
    return { ok: false, error: mensajeError(err) };
  }
}

export async function cambiarEstadoItemCatalogo(
  id: string,
  estado: EstadoCatalogo,
): Promise<ResultadoAccion> {
  try {
    await requerirUsuario();
    await adminDb.collection("catalogo").doc(id).update({
      estado,
      actualizadoEn: FieldValue.serverTimestamp(),
    });
    return { ok: true };
  } catch (err) {
    return { ok: false, error: mensajeError(err) };
  }
}

export interface DatosConfigGeneral {
  tcUsd: number;
  validezDefault: string;
  membrete: {
    nombre: string;
    direccion: string;
    telefono: string;
    logoUrl: string;
  };
}

export async function actualizarConfigGeneral(
  datos: DatosConfigGeneral,
): Promise<ResultadoAccion> {
  try {
    await requerirUsuario();
    if (!(datos.tcUsd > 0)) throw new ErrorValidacion("El tipo de cambio debe ser mayor a 0");

    await adminDb
      .collection("config")
      .doc("general")
      .set(
        {
          tcUsd: datos.tcUsd,
          validezDefault: datos.validezDefault.trim(),
          membrete: {
            nombre: datos.membrete.nombre.trim(),
            direccion: datos.membrete.direccion.trim(),
            telefono: datos.membrete.telefono.trim(),
            logoUrl: datos.membrete.logoUrl.trim(),
          },
        } satisfies ConfigGeneral,
        { merge: true },
      );

    return { ok: true };
  } catch (err) {
    return { ok: false, error: mensajeError(err) };
  }
}
