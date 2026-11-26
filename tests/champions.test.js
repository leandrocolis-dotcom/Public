import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import {
  champBadge,
  champCardHtml,
  champListSyms,
  champSyms,
  champTag,
} from "../assets/champions.js";

const data = JSON.parse(readFileSync(new URL("../data/champions.json", import.meta.url), "utf8"));

describe("campeões dos setores", () => {
  it("JSON respeita os limites das regras", () => {
    const { perSector, total } = data.rules;
    expect(data.members.length).toBeGreaterThan(0);
    expect(data.members.length).toBeLessThanOrEqual(total);
    const by = {};
    data.members.forEach((m) => (by[m.sector] = (by[m.sector] ?? 0) + 1));
    Object.values(by).forEach((n) => expect(n).toBeLessThanOrEqual(perSector));
    expect(new Set(champSyms(data)).size).toBe(data.members.length);
  });
  it("cartão mostra revisão, entradas e saídas", () => {
    const d = {
      asOf: "2026-11-02",
      members: [{ s: "MU", name: "Micron", sector: "Technology", industry: "Semiconductors", Q: 80, T: 90, rank: 1, dist200: 0.4 }], // prettier-ignore
      entering: [{ s: "MU", why: "1º do setor" }],
      leaving: [{ s: "XOM", why: "perdeu a MM200", since: "2026-10-12" }],
      history: [{}, {}],
      funnel: { screener: 7000, liquid: 1700, eligible: 600 },
    };
    const h = champCardHtml(d);
    expect(h).toContain("revisão de 02/11/2026");
    expect(h).toContain("Entraram (1)");
    expect(h).toContain("perdeu a MM200");
    expect(h).toContain("Tecnologia:");
    expect(champBadge("MU", d)).toContain("Campeão · Tecnologia");
    expect(champBadge("AAPL", d)).toBe("");
    expect(champCardHtml(null)).toContain("Carregando");
  });
  it("lista 🏆 traz a lista inteira do usuário + os campeões do modelo", () => {
    const all = champListSyms("all", data);
    expect(all.length).toBeGreaterThan(480);
    expect(new Set(all).size).toBe(all.length);
    champSyms(data).forEach((s) => expect(all).toContain(s));
    expect(champListSyms("model", data)).toEqual(champSyms(data));
    const parts = ["SINGLE", "ETF", "LEV", "INV"].map((k) => champListSyms(k, data).length);
    expect(parts.reduce((a, b) => a + b, 0)).toBe(all.length);
    expect(champListSyms("LEV", data)).toContain("TQQQ");
    expect(champTag("TQQQ", data)).toContain("LEV");
    expect(champTag("MU", data)).toContain("🏆");
  });
});
