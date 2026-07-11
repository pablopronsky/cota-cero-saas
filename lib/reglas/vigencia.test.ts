import { describe, expect, it } from "vitest";
import { estaVencido, parseValidezDias } from "@/lib/reglas/vigencia";

describe("parseValidezDias", () => {
  it.each([
    ["15 días", 15],
    ["30 dias corridos", 30],
    ["Validez: 7", 7],
    ["0 días", 0],
  ])("parsea %s", (validez, esperado) => {
    expect(parseValidezDias(validez)).toBe(esperado);
  });

  it.each(["", "vigencia a confirmar", "días hábiles"])('devuelve null para "%s"', (validez) => {
    expect(parseValidezDias(validez)).toBeNull();
  });
});

describe("estaVencido", () => {
  const hoy = new Date("2026-07-10T12:00:00");

  it("solo vence en estados comerciales activos", () => {
    expect(estaVencido(new Date("2026-07-09T12:00:00"), "Enviado", hoy)).toBe(true);
    expect(estaVencido(new Date("2026-07-09T12:00:00"), "Ganado", hoy)).toBe(false);
  });

  it("no considera vencida una fecha futura ni una vigencia ausente", () => {
    expect(estaVencido(new Date("2026-07-11T12:00:00"), "EnNegociacion", hoy)).toBe(false);
    expect(estaVencido(null, "PendienteEnvio", hoy)).toBe(false);
  });
});
