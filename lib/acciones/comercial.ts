"use server";

import { FieldValue } from "firebase-admin/firestore";
import { adminDb } from "@/lib/firebase/admin";
import { obtenerUsuarioSesion } from "@/lib/firebase/sesion";
import type {
  CanalContacto,
  EstadoComercial,
  MotivoPerdida,
  Obra,
} from "@/lib/tipos";

class ErrorValidacion extends Error {}

export type ResultadoAccion = { ok: true } | { ok: false; error: string };

export interface DatosEstadoComercial {
  obraCodigo: string;
  estado: EstadoComercial;
  motivoPerdida?: MotivoPerdida | null;
  motivoPerdidaDetalle?: string;
}

export interface DatosContactoComercial {
  obraCodigo: string;
  canal: CanalContacto;
  nota: string;
  versionPresupuesto: number;
}

const ESTADOS: EstadoComercial[] = [
  "PendienteEnvio",
  "Enviado",
  "EnNegociacion",
  "Ganado",
  "Perdido",
];
const MOTIVOS: MotivoPerdida[] = ["precio", "plazo", "competidor", "alcance", "sin_respuesta", "otro"];
const CANALES: CanalContacto[] = ["whatsapp", "llamada", "visita", "email", "otro"];

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

function validarTransicion(actual: EstadoComercial, destino: EstadoComercial) {
  if (destino === "Ganado") {
    throw new ErrorValidacion("Ganado se asigna al confirmar un presupuesto");
  }
  if (["Ganado", "Perdido"].includes(actual) && destino !== "EnNegociacion" && destino !== actual) {
    throw new ErrorValidacion("Una obra cerrada solo se puede reabrir en negociación");
  }
}

/** Actualiza el pipeline comercial sin afectar el estado documental de las versiones. */
export async function actualizarEstadoComercial(
  datos: DatosEstadoComercial,
): Promise<ResultadoAccion> {
  try {
    await requerirUsuario();
    if (!datos.obraCodigo.trim()) throw new ErrorValidacion("Obra no encontrada");
    if (!ESTADOS.includes(datos.estado)) throw new ErrorValidacion("Estado comercial inválido");

    if (datos.estado === "Perdido") {
      const motivo = datos.motivoPerdida;
      if (!motivo || !MOTIVOS.includes(motivo)) {
        throw new ErrorValidacion("Elegí un motivo de pérdida");
      }
    }

    await adminDb.runTransaction(async (tx) => {
      const obraRef = adminDb.collection("obras").doc(datos.obraCodigo);
      const obraSnap = await tx.get(obraRef);
      if (!obraSnap.exists) throw new ErrorValidacion("Obra no encontrada");
      const obra = obraSnap.data() as Obra;
      if (!obra.estadoComercial) {
        throw new ErrorValidacion("La obra necesita la migración comercial antes de modificarse");
      }
      validarTransicion(obra.estadoComercial, datos.estado);

      tx.update(obraRef, {
        estadoComercial: datos.estado,
        motivoPerdida: datos.estado === "Perdido" ? datos.motivoPerdida : null,
        motivoPerdidaDetalle:
          datos.estado === "Perdido" ? (datos.motivoPerdidaDetalle?.trim() ?? "") : "",
        actualizadoEn: FieldValue.serverTimestamp(),
      });
    });
    return { ok: true };
  } catch (err) {
    return { ok: false, error: mensajeError(err) };
  }
}

/** Agrega un contacto al historial embebido y conserva la versión vigente como contexto. */
export async function registrarContacto(datos: DatosContactoComercial): Promise<ResultadoAccion> {
  try {
    const usuario = await requerirUsuario();
    if (!datos.obraCodigo.trim()) throw new ErrorValidacion("Obra no encontrada");
    if (!CANALES.includes(datos.canal)) throw new ErrorValidacion("Canal de contacto inválido");
    const nota = datos.nota.trim();
    if (!nota) throw new ErrorValidacion("Ingresá una nota del contacto");
    if (!Number.isInteger(datos.versionPresupuesto) || datos.versionPresupuesto < 1) {
      throw new ErrorValidacion("Versión de presupuesto inválida");
    }

    await adminDb.runTransaction(async (tx) => {
      const obraRef = adminDb.collection("obras").doc(datos.obraCodigo);
      const obraSnap = await tx.get(obraRef);
      if (!obraSnap.exists) throw new ErrorValidacion("Obra no encontrada");
      const obra = obraSnap.data() as Obra;
      if (!obra.estadoComercial) {
        throw new ErrorValidacion("La obra necesita la migración comercial antes de modificarse");
      }

      tx.update(obraRef, {
        contactos: [
          ...(obra.contactos ?? []),
          {
            fechaHora: new Date(),
            canal: datos.canal,
            nota,
            usuario: usuario.email,
            versionPresupuesto: datos.versionPresupuesto,
          },
        ],
        actualizadoEn: FieldValue.serverTimestamp(),
      });
    });
    return { ok: true };
  } catch (err) {
    return { ok: false, error: mensajeError(err) };
  }
}

/** Programa (o limpia) el próximo seguimiento de una obra. */
export async function programarSeguimiento(
  obraCodigo: string,
  fecha: string | null,
): Promise<ResultadoAccion> {
  try {
    await requerirUsuario();
    if (!obraCodigo.trim()) throw new ErrorValidacion("Obra no encontrada");
    const proximoSeguimiento = fecha ? new Date(`${fecha}T12:00:00`) : null;
    if (proximoSeguimiento && Number.isNaN(proximoSeguimiento.getTime())) {
      throw new ErrorValidacion("Fecha de seguimiento inválida");
    }

    await adminDb.runTransaction(async (tx) => {
      const obraRef = adminDb.collection("obras").doc(obraCodigo);
      const obraSnap = await tx.get(obraRef);
      if (!obraSnap.exists) throw new ErrorValidacion("Obra no encontrada");
      tx.update(obraRef, { proximoSeguimiento, actualizadoEn: FieldValue.serverTimestamp() });
    });
    return { ok: true };
  } catch (err) {
    return { ok: false, error: mensajeError(err) };
  }
}
