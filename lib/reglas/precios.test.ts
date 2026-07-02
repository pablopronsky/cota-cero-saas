import { describe, expect, it } from "vitest";
import { precioEfectivo } from "./precios";

describe("precioEfectivo", () => {
  it("Dolar 100 con tc 1200 -> 120000 + flag", () => {
    const r = precioEfectivo({ moneda: "Dolar", precioFinalIva: 100 }, 1200);
    expect(r.precio).toBe(120000);
    expect(r.requiereVerificacion).toBe(true);
  });

  it("Dolar 8000 (>= umbral) -> 8000 sin flag", () => {
    const r = precioEfectivo({ moneda: "Dolar", precioFinalIva: 8000 }, 1200);
    expect(r.precio).toBe(8000);
    expect(r.requiereVerificacion).toBe(false);
  });

  it("Pesos -> igual, sin flag", () => {
    const r = precioEfectivo({ moneda: "Pesos", precioFinalIva: 54450 }, 1200);
    expect(r.precio).toBe(54450);
    expect(r.requiereVerificacion).toBe(false);
  });

  it("Dolar justo en el umbral (5000) no convierte", () => {
    const r = precioEfectivo({ moneda: "Dolar", precioFinalIva: 5000 }, 1200);
    expect(r.precio).toBe(5000);
    expect(r.requiereVerificacion).toBe(false);
  });
});
