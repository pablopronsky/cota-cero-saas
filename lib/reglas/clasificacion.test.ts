import { describe, expect, it } from "vitest";
import { clasificarGrupoContable } from "./clasificacion";

describe("clasificarGrupoContable", () => {
  it("Flete -> accesorios", () => {
    expect(clasificarGrupoContable({ rubro: "Flete" })).toBe("accesorios");
  });

  it("Servicio de colocación -> mano_obra", () => {
    expect(clasificarGrupoContable({ rubro: "Servicio de colocación" })).toBe("mano_obra");
  });

  it("Lijado -> mano_obra (no accesorios, pese a contener 'lija')", () => {
    expect(clasificarGrupoContable({ rubro: "Lijado" })).toBe("mano_obra");
  });

  it("Lija grano 40 -> accesorios", () => {
    expect(clasificarGrupoContable({ rubro: "Lija grano 40" })).toBe("accesorios");
  });

  it("Hidrolaca -> accesorios", () => {
    expect(clasificarGrupoContable({ rubro: "Hidrolaca" })).toBe("accesorios");
  });

  it("Restauración -> mano_obra", () => {
    expect(clasificarGrupoContable({ rubro: "Restauración" })).toBe("mano_obra");
  });

  it("Pisos de madera -> materiales", () => {
    expect(clasificarGrupoContable({ rubro: "Pisos de madera" })).toBe("materiales");
  });

  it("ítem manual con grupo explícito manda sobre la clasificación automática", () => {
    expect(
      clasificarGrupoContable({
        rubro: "flete",
        esManual: true,
        grupoContableExplicito: true,
        grupoContable: "materiales",
      })
    ).toBe("materiales");
  });

  it("ítem manual SIN grupo explícito se clasifica igual que uno de catálogo", () => {
    expect(clasificarGrupoContable({ rubro: "flete", esManual: true })).toBe("accesorios");
  });
});
