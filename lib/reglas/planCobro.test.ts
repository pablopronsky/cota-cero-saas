import { describe, expect, it } from "vitest";
import { planAnticipoSaldo, planCuotasIguales, type LineaPlan } from "@/lib/reglas/planCobro";

const suma = (lineas: LineaPlan[]) =>
  Math.round(lineas.reduce((acc, l) => acc + l.monto, 0) * 100) / 100;

describe("planAnticipoSaldo", () => {
  it("divide en anticipo y saldo que suman exacto el total", () => {
    const lineas = planAnticipoSaldo(1000, 45);
    expect(lineas).toEqual([
      { concepto: "Anticipo 45%", monto: 450, orden: 1 },
      { concepto: "Saldo", monto: 550, orden: 2 },
    ]);
    expect(suma(lineas)).toBe(1000);
  });

  it("el saldo absorbe el resto de redondeo (suma exacta)", () => {
    // 33% de 1000 = 330; saldo 670. Con montos no redondos el saldo cierra la diferencia.
    const lineas = planAnticipoSaldo(999.99, 30);
    expect(suma(lineas)).toBe(999.99);
    expect(lineas[0].monto).toBe(300); // round(99999 * 30 / 100) = 30000 centavos
    expect(lineas[1].monto).toBe(699.99);
  });

  it("rechaza porcentajes fuera de rango y totales no positivos", () => {
    expect(() => planAnticipoSaldo(1000, 0)).toThrow();
    expect(() => planAnticipoSaldo(1000, 100)).toThrow();
    expect(() => planAnticipoSaldo(0, 50)).toThrow();
  });
});

describe("planCuotasIguales", () => {
  it("reparte en N cuotas iguales que suman exacto", () => {
    const lineas = planCuotasIguales(1000, 4);
    expect(lineas.map((l) => l.monto)).toEqual([250, 250, 250, 250]);
    expect(suma(lineas)).toBe(1000);
  });

  it("la última cuota absorbe el resto cuando no divide parejo", () => {
    // 100 / 3 = 33,33 + 33,33 + 33,34
    const lineas = planCuotasIguales(100, 3);
    expect(lineas.map((l) => l.monto)).toEqual([33.33, 33.33, 33.34]);
    expect(suma(lineas)).toBe(100);
    expect(lineas.map((l) => l.concepto)).toEqual(["Cuota 1/3", "Cuota 2/3", "Cuota 3/3"]);
  });

  it("una sola cuota es el total completo", () => {
    expect(planCuotasIguales(777.77, 1)).toEqual([
      { concepto: "Cuota 1/1", monto: 777.77, orden: 1 },
    ]);
  });

  it("rechaza cantidades inválidas y totales no positivos", () => {
    expect(() => planCuotasIguales(1000, 0)).toThrow();
    expect(() => planCuotasIguales(1000, 2.5)).toThrow();
    expect(() => planCuotasIguales(0, 3)).toThrow();
  });
});
