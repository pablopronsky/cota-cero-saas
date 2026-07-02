import type { EstadoPresupuesto } from "@/lib/tipos";

/** R9 - Teléfono válido: 8 a 13 dígitos (después de normalizar, solo dígitos). */
export function telefonoValido(telefono: string): boolean {
  const soloDigitos = telefono.replace(/\D/g, "");
  return /^\d{8,13}$/.test(soloDigitos);
}

/** R7 - Editar in-place solo se permite mientras estado = 'Emitido'. */
export function puedeEditarse(estado: EstadoPresupuesto): boolean {
  return estado === "Emitido";
}

/** R7 - Duplicar siempre está disponible, sin importar el estado. */
export function puedeDuplicarse(_estado: EstadoPresupuesto): boolean {
  return true;
}

/** R8 - Solo se puede confirmar un presupuesto en estado 'Emitido'. */
export function puedeConfirmarse(estado: EstadoPresupuesto): boolean {
  return estado === "Emitido";
}

/** R8 - Solo se puede anular la confirmación de un presupuesto 'Confirmado'. */
export function puedeAnularse(estado: EstadoPresupuesto): boolean {
  return estado === "Confirmado";
}
