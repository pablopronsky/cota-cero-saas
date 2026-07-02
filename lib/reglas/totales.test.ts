import { describe, expect, it } from "vitest";
import { calcularTotales } from "./totales";

const items = [
  { grupoContable: "materiales" as const, subtotal: 100000 },
  { grupoContable: "mano_obra" as const, subtotal: 30000 },
  { grupoContable: "accesorios" as const, subtotal: 5000 },
];

describe("calcularTotales", () => {
  it("modalidad integrada suma los 3 grupos", () => {
    const r = calcularTotales(items, "integrada");
    expect(r.subtotalMateriales).toBe(100000);
    expect(r.subtotalManoObra).toBe(30000);
    expect(r.subtotalAccesorios).toBe(5000);
    expect(r.total).toBe(135000);
  });

  it("modalidad colocacion excluye materiales del total pero lo sigue subtotalizando", () => {
    const r = calcularTotales(items, "colocacion");
    expect(r.subtotalMateriales).toBe(100000);
    expect(r.total).toBe(35000);
  });

  it("modalidad materiales excluye mano_obra del total pero lo sigue subtotalizando", () => {
    const r = calcularTotales(items, "materiales");
    expect(r.subtotalManoObra).toBe(30000);
    expect(r.total).toBe(105000);
  });
});
