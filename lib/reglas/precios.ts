import type { Moneda } from "@/lib/tipos";

interface ItemParaPrecio {
  moneda: Moneda;
  precioFinalIva: number;
}

export interface PrecioEfectivo {
  precio: number;
  requiereVerificacion: boolean;
}

const UMBRAL_CONVERSION_USD = 5000;

/**
 * R4 - Regla heredada: si moneda = Dolar y precioFinalIva < 5000, el precio
 * en ARS = precio * tcUsd, y se marca requiereVerificacion. Si es Dolar y
 * >= 5000, no se convierte. Si es Pesos, el precio queda igual.
 */
export function precioEfectivo(item: ItemParaPrecio, tcUsd: number): PrecioEfectivo {
  if (item.moneda === "Dolar" && item.precioFinalIva < UMBRAL_CONVERSION_USD) {
    return { precio: item.precioFinalIva * tcUsd, requiereVerificacion: true };
  }
  return { precio: item.precioFinalIva, requiereVerificacion: false };
}
