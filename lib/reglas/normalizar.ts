const DIACRITICOS = /[̀-ͯ]/g;

/** R1 - minusculas + quitar acentos/diacriticos + trim. */
export function normalizar(texto: string): string {
  return texto.normalize("NFD").replace(DIACRITICOS, "").toLowerCase().trim();
}
