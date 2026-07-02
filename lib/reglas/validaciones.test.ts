import { describe, expect, it } from "vitest";
import {
  puedeAnularse,
  puedeConfirmarse,
  puedeDuplicarse,
  puedeEditarse,
  telefonoValido,
} from "./validaciones";

describe("telefonoValido", () => {
  it("acepta 8 a 13 dígitos", () => {
    expect(telefonoValido("22112345")).toBe(true);
    expect(telefonoValido("2211234567890")).toBe(true);
  });

  it("rechaza menos de 8 dígitos", () => {
    expect(telefonoValido("1234567")).toBe(false);
  });

  it("rechaza más de 13 dígitos", () => {
    expect(telefonoValido("12345678901234")).toBe(false);
  });

  it("ignora separadores no numéricos al contar dígitos", () => {
    expect(telefonoValido("221-123-4567")).toBe(true);
  });
});

describe("puedeEditarse", () => {
  it("solo 'Emitido' es editable", () => {
    expect(puedeEditarse("Emitido")).toBe(true);
    expect(puedeEditarse("Confirmado")).toBe(false);
    expect(puedeEditarse("Anulado")).toBe(false);
    expect(puedeEditarse("Superado")).toBe(false);
  });
});

describe("puedeDuplicarse", () => {
  it("cualquier estado se puede duplicar", () => {
    expect(puedeDuplicarse("Emitido")).toBe(true);
    expect(puedeDuplicarse("Confirmado")).toBe(true);
    expect(puedeDuplicarse("Anulado")).toBe(true);
    expect(puedeDuplicarse("Superado")).toBe(true);
  });
});

describe("puedeConfirmarse", () => {
  it("solo 'Emitido' se puede confirmar", () => {
    expect(puedeConfirmarse("Emitido")).toBe(true);
    expect(puedeConfirmarse("Confirmado")).toBe(false);
  });
});

describe("puedeAnularse", () => {
  it("solo 'Confirmado' se puede anular", () => {
    expect(puedeAnularse("Confirmado")).toBe(true);
    expect(puedeAnularse("Emitido")).toBe(false);
    expect(puedeAnularse("Anulado")).toBe(false);
    expect(puedeAnularse("Superado")).toBe(false);
  });
});
