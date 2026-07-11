import { describe, expect, it } from "vitest";
import { finDeDia, inicioDeDia, rangoMes, sumarDias } from "@/lib/reglas/hoy";

describe("inicioDeDia / finDeDia", () => {
  it("acota al día sin importar la hora de entrada", () => {
    const fecha = new Date("2026-07-11T15:30:00");
    expect(inicioDeDia(fecha).getHours()).toBe(0);
    expect(inicioDeDia(fecha).getDate()).toBe(11);
    expect(finDeDia(fecha).getHours()).toBe(23);
    expect(finDeDia(fecha).getDate()).toBe(11);
  });
});

describe("sumarDias", () => {
  it("avanza cruzando el fin de mes", () => {
    const fecha = new Date("2026-07-28T10:00:00");
    const resultado = sumarDias(fecha, 7);
    expect(resultado.getMonth()).toBe(7); // agosto
    expect(resultado.getDate()).toBe(4);
  });
});

describe("rangoMes", () => {
  it("cubre desde el 1 hasta el último día del mes", () => {
    const { inicio, fin } = rangoMes(new Date("2026-02-15T10:00:00"));
    expect(inicio.getDate()).toBe(1);
    expect(inicio.getMonth()).toBe(1);
    expect(fin.getDate()).toBe(28); // 2026 no es bisiesto
    expect(fin.getMonth()).toBe(1);
  });
});
