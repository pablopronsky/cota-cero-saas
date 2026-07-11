/**
 * Generadores puros de planes de cobro. Devuelven las líneas (concepto + monto +
 * orden); las fechas de vencimiento las asigna la server action a partir de sus
 * inputs. Trabajan en centavos enteros para que la suma de las cuotas dé EXACTO
 * el monto planificado: la última cuota absorbe cualquier diferencia de redondeo.
 */

export interface LineaPlan {
  concepto: string;
  monto: number;
  orden: number;
}

/** Pasa a centavos enteros redondeando (los montos del sistema son ARS con 2 decimales). */
function aCentavos(monto: number): number {
  return Math.round(monto * 100);
}

/**
 * "Anticipo X% + saldo": dos cuotas. El anticipo se redondea a centavos y el
 * saldo absorbe el resto, de modo que anticipo + saldo === total exacto.
 */
export function planAnticipoSaldo(total: number, porcentajeAnticipo: number): LineaPlan[] {
  if (!(total > 0)) throw new Error("El total debe ser mayor a cero");
  if (!(porcentajeAnticipo > 0 && porcentajeAnticipo < 100)) {
    throw new Error("El porcentaje de anticipo debe estar entre 0 y 100");
  }

  const centavosTotal = aCentavos(total);
  const centavosAnticipo = Math.round((centavosTotal * porcentajeAnticipo) / 100);
  const centavosSaldo = centavosTotal - centavosAnticipo;

  return [
    { concepto: `Anticipo ${porcentajeAnticipo}%`, monto: centavosAnticipo / 100, orden: 1 },
    { concepto: "Saldo", monto: centavosSaldo / 100, orden: 2 },
  ];
}

/**
 * "N cuotas iguales": reparte el total en `cantidad` cuotas. Todas iguales salvo
 * la última, que absorbe el resto de la división para que la suma dé exacto.
 */
export function planCuotasIguales(total: number, cantidad: number): LineaPlan[] {
  if (!(total > 0)) throw new Error("El total debe ser mayor a cero");
  if (!Number.isInteger(cantidad) || cantidad < 1) {
    throw new Error("La cantidad de cuotas debe ser un entero mayor o igual a 1");
  }

  const centavosTotal = aCentavos(total);
  const base = Math.floor(centavosTotal / cantidad);
  const resto = centavosTotal - base * cantidad;

  return Array.from({ length: cantidad }, (_, i) => {
    const esUltima = i === cantidad - 1;
    const centavos = esUltima ? base + resto : base;
    return {
      concepto: `Cuota ${i + 1}/${cantidad}`,
      monto: centavos / 100,
      orden: i + 1,
    };
  });
}
