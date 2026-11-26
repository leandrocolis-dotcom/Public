import { describe, expect, it } from "vitest";
import { clampPos, pendFloatHtml } from "../assets/pend-float.js";

const r = (score, tone, label) => ({ score, zone: { tone, label }, stress: false });

describe("pendFloatHtml", () => {
  it("mostra nota com sinal, faixa e movimento da última hora", () => {
    const h = pendFloatHtml(r(34, "up", "Risco"), 5.4);
    expect(h).toContain("+34");
    expect(h).toContain("Risco");
    expect(h).toContain("▲ +5 1h");
  });
  it("nota negativa usa o sinal de menos e queda na hora", () => {
    const h = pendFloatHtml(r(-62, "dn", "Defesa forte"), -3);
    expect(h).toContain("−62");
    expect(h).toContain("▼ −3 1h");
  });
  it("sem movimento conhecido não mostra a hora; sem leitura fica vazio", () => {
    expect(pendFloatHtml(r(0, "mid", "Neutro"))).not.toContain("1h");
    expect(pendFloatHtml(null)).toBe("");
  });
});

describe("clampPos", () => {
  it("mantém a pílula inteira na tela", () => {
    expect(clampPos(-50, 2000, 120, 36, 390, 844)).toEqual({ x: 6, y: 802 });
    expect(clampPos(100, 200, 120, 36, 390, 844)).toEqual({ x: 100, y: 200 });
  });
});
