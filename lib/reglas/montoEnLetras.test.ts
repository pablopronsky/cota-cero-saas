import { describe, expect, it } from "vitest";
import { montoEnLetras } from "./montoEnLetras";

describe("montoEnLetras", () => {
  it("1500 -> mil quinientos", () => {
    expect(montoEnLetras(1500)).toBe("mil quinientos");
  });

  it("1234567.89 -> texto completo con centavos", () => {
    expect(montoEnLetras(1234567.89)).toBe(
      "un millon doscientos treinta y cuatro mil quinientos sesenta y siete con 89/100"
    );
  });

  it("0 -> cero", () => {
    expect(montoEnLetras(0)).toBe("cero");
  });

  it("1 -> uno (no 'un' suelto)", () => {
    expect(montoEnLetras(1)).toBe("uno");
  });

  it("21 -> termina en 'uno', no en 'un'", () => {
    expect(montoEnLetras(21)).toBe("veinte y uno");
  });

  it("1000000 -> 'un millon' (excepción: sí usa 'un' antes de millón)", () => {
    expect(montoEnLetras(1000000)).toBe("un millon");
  });

  it("100 -> cien (no 'ciento')", () => {
    expect(montoEnLetras(100)).toBe("cien");
  });

  it("centavos con un solo dígito se completan a 2", () => {
    expect(montoEnLetras(10.5)).toBe("diez con 50/100");
  });
});
