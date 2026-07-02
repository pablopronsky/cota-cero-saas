import { describe, expect, it } from "vitest";
import { normalizar } from "./normalizar";

describe("normalizar", () => {
  it("pasa a minusculas", () => {
    expect(normalizar("Colocación")).toBe("colocacion");
  });

  it("quita acentos y mayusculas combinadas", () => {
    expect(normalizar("LIJADO Fino")).toBe("lijado fino");
  });

  it("recorta espacios", () => {
    expect(normalizar("  Servicio  ")).toBe("servicio");
  });
});
