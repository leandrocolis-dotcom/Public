import { describe, it, expect } from "vitest";
import { HELP_KEYS, helpText, hq } from "../assets/help.js";

describe("balões de ajuda", () => {
  it("todas as chaves geram título e texto, mesmo sem dados", () => {
    for (const k of HELP_KEYS) {
      const h = helpText(k);
      expect(h.title.length).toBeGreaterThan(2);
      expect(h.body).toContain("<p>");
      expect(h.body).not.toMatch(/undefined|NaN/);
    }
    expect(helpText("nada")).toBeNull();
    expect(hq("nada")).toBe("");
  });
  it("resistência usa o dado atual", () => {
    const h = helpText("res", { sym: "MU", price: 994.31, level: 997.61, p: 0.62, n: 13 });
    expect(h.body).toContain("994,31");
    expect(h.body).toContain("997,61");
    expect(h.body).toContain("Nas 13 vezes");
    expect(h.body).toContain("62%");
  });
  it("decisão explica cada análise", () => {
    const h = helpText("decision", { sym: "DE", label: "Comprar", conf: "Média", subs: [{ name: "Técnica", dir: 0.5 }, { name: "Fundamentalista", dir: -0.4 }] }); // prettier-ignore
    expect(h.body).toContain("Técnica a favor de subir");
    expect(h.body).toContain("Fundamentalista contra");
  });
  it("faixa de 52 semanas e beta", () => {
    expect(helpText("range52", { price: 75, h52: 100, l52: 50 }).body).toContain("posição 50%");
    expect(helpText("beta", { beta: 1.5 }).body).toContain("~15%");
  });
  it("botão leva os dados escapados", () => {
    const b = hq("res", { sym: 'A"B', level: 1 });
    expect(b).toContain('data-help="res"');
    expect(b).toContain('role="button"');
    expect(b).not.toContain('A"B');
  });
});
