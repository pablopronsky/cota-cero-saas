const PATRON_M2_CAJA = /\(\s*(\d+[.,]\d+)\s*(?:m2|m²|x\s*caja)\s*\)/i;

/**
 * R5 - Extrae el valor entre parentesis de nombre o especificacion:
 * "(2,16 m2)" -> 2.16, "(3.16 x caja)" -> 3.16. Acepta coma o punto
 * decimal. Si no hay match -> null.
 */
export function extraerM2PorCaja(nombre: string, especificacion: string): number | null {
  for (const texto of [nombre, especificacion]) {
    const match = texto.match(PATRON_M2_CAJA);
    if (match) {
      return Number(match[1].replace(",", "."));
    }
  }
  return null;
}
