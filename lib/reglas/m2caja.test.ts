import { describe, expect, it } from "vitest";
import { extraerM2PorCaja } from "./m2caja";

describe("extraerM2PorCaja", () => {
  it('"(2,16 m2)" -> 2.16', () => {
    expect(extraerM2PorCaja("Piso Roble (2,16 m2)", "")).toBe(2.16);
  });

  it('"(3.16 x caja)" -> 3.16', () => {
    expect(extraerM2PorCaja("Piso Eucalipto (3.16 x caja)", "")).toBe(3.16);
  });

  it('"(2,5 m²)" -> 2.5', () => {
    expect(extraerM2PorCaja("Piso Pino (2,5 m²)", "")).toBe(2.5);
  });

  it("sin paréntesis -> null", () => {
    expect(extraerM2PorCaja("Adhesivo para piso", "")).toBeNull();
  });

  it("busca en especificacion si nombre no matchea", () => {
    expect(extraerM2PorCaja("Piso Roble", "Caja (2,16 m2)")).toBe(2.16);
  });
});
