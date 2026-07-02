"use server";

import { FieldValue } from "firebase-admin/firestore";
import { adminDb } from "@/lib/firebase/admin";
import { proximoCodigo } from "@/lib/firebase/numeracion";
import { telefonoValido } from "@/lib/reglas/validaciones";
import { obtenerUsuarioSesion } from "@/lib/firebase/sesion";
import type { Cliente, EstadoCliente } from "@/lib/tipos";

export interface DatosCliente {
  nombre: string;
  telefono: string;
  email?: string;
  direccion?: string;
  localidad?: string;
  tipo?: string;
  cuitDni?: string;
  condicionIva?: string;
  origen?: string;
  notas?: string;
}

function normalizarTelefono(telefono: string): string {
  return telefono.replace(/\D/g, "");
}

async function requerirUsuario() {
  const usuario = await obtenerUsuarioSesion();
  if (!usuario) throw new Error("No autenticado");
  return usuario;
}

function camposComunes(datos: DatosCliente, telefonoNormalizado: string) {
  return {
    nombre: datos.nombre.trim(),
    telefono: datos.telefono.trim(),
    telefonoNormalizado,
    email: datos.email?.trim() ?? "",
    direccion: datos.direccion?.trim() ?? "",
    localidad: datos.localidad?.trim() ?? "",
    tipo: datos.tipo?.trim() ?? "",
    cuitDni: datos.cuitDni?.trim() ?? "",
    condicionIva: datos.condicionIva?.trim() ?? "",
    origen: datos.origen?.trim() ?? "",
    notas: datos.notas?.trim() ?? "",
  };
}

function validarDatos(datos: DatosCliente): string {
  if (!datos.nombre.trim()) throw new Error("El nombre es obligatorio");
  if (!telefonoValido(datos.telefono)) {
    throw new Error("El teléfono debe tener entre 8 y 13 dígitos");
  }
  return normalizarTelefono(datos.telefono);
}

/** R9 - Alta de cliente: valida teléfono, chequea duplicado por telefonoNormalizado dentro de la transacción, toma el próximo código CLI-NNNN y crea el doc. */
export async function crearCliente(datos: DatosCliente): Promise<{ codigo: string }> {
  await requerirUsuario();
  const telefonoNormalizado = validarDatos(datos);

  const codigo = await adminDb.runTransaction(async (tx) => {
    const duplicados = await tx.get(
      adminDb
        .collection("clientes")
        .where("telefonoNormalizado", "==", telefonoNormalizado)
        .limit(1),
    );
    if (!duplicados.empty) {
      const existente = duplicados.docs[0].data() as Cliente;
      throw new Error(`Ya existe: ${existente.nombre}`);
    }

    const codigoNuevo = await proximoCodigo(tx, "clientes");
    const ahora = FieldValue.serverTimestamp();

    tx.set(adminDb.collection("clientes").doc(codigoNuevo), {
      ...camposComunes(datos, telefonoNormalizado),
      estado: "Activo",
      saldo: 0,
      fechaAlta: ahora,
      creadoEn: ahora,
      actualizadoEn: ahora,
    });

    return codigoNuevo;
  });

  return { codigo };
}

/** Edita un cliente existente. Si cambia el teléfono, vuelve a chequear duplicados (excluyéndose a sí mismo). */
export async function actualizarCliente(codigo: string, datos: DatosCliente): Promise<void> {
  await requerirUsuario();
  const telefonoNormalizado = validarDatos(datos);

  await adminDb.runTransaction(async (tx) => {
    const ref = adminDb.collection("clientes").doc(codigo);
    const actual = await tx.get(ref);
    if (!actual.exists) throw new Error("Cliente no encontrado");

    const clienteActual = actual.data() as Cliente;
    if (telefonoNormalizado !== clienteActual.telefonoNormalizado) {
      const duplicados = await tx.get(
        adminDb
          .collection("clientes")
          .where("telefonoNormalizado", "==", telefonoNormalizado)
          .limit(1),
      );
      const otro = duplicados.docs.find((d) => d.id !== codigo);
      if (otro) {
        throw new Error(`Ya existe: ${(otro.data() as Cliente).nombre}`);
      }
    }

    tx.update(ref, {
      ...camposComunes(datos, telefonoNormalizado),
      actualizadoEn: FieldValue.serverTimestamp(),
    });
  });
}

/** No hay borrado físico de clientes: solo se alterna Activo/Inactivo. */
export async function cambiarEstadoCliente(
  codigo: string,
  estado: EstadoCliente,
): Promise<void> {
  await requerirUsuario();
  await adminDb.collection("clientes").doc(codigo).update({
    estado,
    actualizadoEn: FieldValue.serverTimestamp(),
  });
}
