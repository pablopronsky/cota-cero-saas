const UNIDADES = [
  "",
  "uno",
  "dos",
  "tres",
  "cuatro",
  "cinco",
  "seis",
  "siete",
  "ocho",
  "nueve",
];

const DIEZ_A_DIECINUEVE = [
  "diez",
  "once",
  "doce",
  "trece",
  "catorce",
  "quince",
  "dieciseis",
  "diecisiete",
  "dieciocho",
  "diecinueve",
];

const DECENAS = [
  "",
  "",
  "veinte",
  "treinta",
  "cuarenta",
  "cincuenta",
  "sesenta",
  "setenta",
  "ochenta",
  "noventa",
];

const CENTENAS = [
  "",
  "ciento",
  "doscientos",
  "trescientos",
  "cuatrocientos",
  "quinientos",
  "seiscientos",
  "setecientos",
  "ochocientos",
  "novecientos",
];

function centenasATexto(n: number): string {
  if (n === 0) return "";
  if (n === 100) return "cien";

  const c = Math.floor(n / 100);
  const resto = n % 100;
  const partes: string[] = [];

  if (c > 0) partes.push(CENTENAS[c]);

  if (resto >= 10 && resto < 20) {
    partes.push(DIEZ_A_DIECINUEVE[resto - 10]);
  } else if (resto >= 20) {
    const d = Math.floor(resto / 10);
    const u = resto % 10;
    partes.push(u > 0 ? `${DECENAS[d]} y ${UNIDADES[u]}` : DECENAS[d]);
  } else if (resto > 0) {
    partes.push(UNIDADES[resto]);
  }

  return partes.join(" ");
}

/** Convierte un entero >= 0 en texto, terminando en "uno" (no "un"). */
function enteroATexto(n: number): string {
  if (n === 0) return "cero";

  const grupos: number[] = [];
  let resto = n;
  while (resto > 0) {
    grupos.unshift(resto % 1000);
    resto = Math.floor(resto / 1000);
  }
  // grupos[0] = miles de millon, luego millones, luego miles, luego unidades
  // soportamos hasta miles de millones (suficiente para este dominio)
  while (grupos.length < 4) grupos.unshift(0);
  const [milesMillones, millones, miles, unidades] = grupos;

  const partes: string[] = [];

  if (milesMillones > 0) {
    partes.push(
      milesMillones === 1
        ? "mil millones"
        : `${centenasATexto(milesMillones)} mil millones`
    );
  }

  if (millones > 0) {
    partes.push(millones === 1 ? "un millon" : `${centenasATexto(millones)} millones`);
  }

  if (miles > 0) {
    partes.push(miles === 1 ? "mil" : `${centenasATexto(miles)} mil`);
  }

  if (unidades > 0) {
    partes.push(centenasATexto(unidades));
  }

  return partes.join(" ").trim();
}

/**
 * Convierte un monto a texto en español para recibos tipo cheque.
 * Ej.: 1500 -> "mil quinientos"; 1 -> "uno"; 21 -> "veinte y uno".
 * Si tiene centavos, agrega "con NN/100".
 */
export function montoEnLetras(monto: number): string {
  const negativo = monto < 0;
  const absoluto = Math.abs(monto);
  const parteEntera = Math.floor(absoluto);
  const centavos = Math.round((absoluto - parteEntera) * 100);

  let texto = enteroATexto(parteEntera);
  if (centavos > 0) {
    texto += ` con ${String(centavos).padStart(2, "0")}/100`;
  }

  return negativo ? `menos ${texto}` : texto;
}
