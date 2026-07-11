/** Reglas puras de fechas para la pantalla "Hoy". Sin acceso a Firestore. */

/** Medianoche del día de `fecha` (inicio del día, hora local). */
export function inicioDeDia(fecha: Date): Date {
  const d = new Date(fecha);
  d.setHours(0, 0, 0, 0);
  return d;
}

/** Último instante del día de `fecha` (23:59:59.999 hora local). */
export function finDeDia(fecha: Date): Date {
  const d = new Date(fecha);
  d.setHours(23, 59, 59, 999);
  return d;
}

/** `fecha` + `dias` días, conservando la hora. */
export function sumarDias(fecha: Date, dias: number): Date {
  const d = new Date(fecha);
  d.setDate(d.getDate() + dias);
  return d;
}

/** Rango [inicio, fin] del mes calendario que contiene `fecha`. */
export function rangoMes(fecha: Date): { inicio: Date; fin: Date } {
  const inicio = new Date(fecha.getFullYear(), fecha.getMonth(), 1, 0, 0, 0, 0);
  const fin = new Date(fecha.getFullYear(), fecha.getMonth() + 1, 0, 23, 59, 59, 999);
  return { inicio, fin };
}
