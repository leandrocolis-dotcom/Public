import { describe, expect, it } from "vitest";
import {
  alignReturns,
  corr,
  historicalVaR,
  maxDrawdown,
  portfolioRisk,
  riskNotes,
} from "../assets/risk.js";
import { viewRisk } from "../assets/risk-view.js";
import { structureCost } from "../assets/structure-cost.js";

// série determinística (sem aleatório): seno + tendência
const series = (n, f, amp, drift = 0) => {
  const dates = Array.from({ length: n }, (_, i) => `2025-${String(1 + Math.floor(i / 28)).padStart(2, "0")}-${String(1 + (i % 28)).padStart(2, "0")}`);
  let p = 100;
  const close = dates.map((_, i) => (p *= 1 + drift + amp * Math.sin(i * f)));
  return { dates, close };
}; // prettier-ignore

const H = {
  SPY: series(200, 0.7, 0.01),
  AAA: series(200, 0.7, 0.02), // mesmo ritmo do SPY, 2x a amplitude: beta ~2
  BBB: series(200, 1.9, 0.005),
};

describe("risco da carteira", () => {
  it("alinha retornos nas datas comuns", () => {
    const h = { ...H, CCC: { dates: H.SPY.dates.slice(50), close: H.SPY.close.slice(50) } };
    const a = alignReturns(h, ["SPY", "CCC"], 1000);
    expect(a.dates).toHaveLength(149);
    expect(a.R.SPY).toHaveLength(149);
  });
  it("correlação e queda máxima", () => {
    expect(corr([1, 2, 3], [2, 4, 6])).toBeCloseTo(1);
    expect(maxDrawdown([0.1, -0.5, 0.2])).toBeCloseTo(-0.5);
  });
  it("VaR histórico exige amostra mínima", () => {
    expect(historicalVaR([0.01]).var).toBeNull();
    const r = Array.from({ length: 100 }, (_, i) => (i - 50) / 1000);
    expect(historicalVaR(r).var).toBeGreaterThan(0.04);
  });
  it("beta, parte do risco somando 1 e posições sem histórico", () => {
    const rows = [
      { sym: "AAA", weight: 0.5 },
      { sym: "BBB", weight: 0.4 },
      { sym: "ZZZ", weight: 0.1 },
    ];
    const r = portfolioRisk(rows, H, { total: 10000 });
    expect(r.ok).toBe(true);
    expect(r.missing).toEqual(["ZZZ"]);
    expect(r.coverage).toBeCloseTo(0.9);
    const aaa = r.positions.find((p) => p.sym === "AAA");
    expect(aaa.beta).toBeGreaterThan(1.8);
    expect(r.positions.reduce((a, p) => a + p.riskShare, 0)).toBeCloseTo(1);
    expect(r.var95Usd).toBeCloseTo(r.var95 * 10000);
    expect(r.corr.m[0][0]).toBe(1);
  });
  it("leitura simples aponta concentração de risco", () => {
    const r = portfolioRisk(
      [
        { sym: "AAA", weight: 0.5 },
        { sym: "BBB", weight: 0.5 },
      ],
      H,
    );
    expect(
      riskNotes(r)
        .map((n) => n.text)
        .join(" "),
    ).toMatch(/AAA/);
  });
  it("apostas independentes: iguais juntas = 1 aposta; sem correlação = mais apostas", () => {
    const same = { SPY: H.SPY, A1: H.AAA, A2: { ...H.AAA } };
    const r1 = portfolioRisk([{ sym: "A1", weight: 0.5 }, { sym: "A2", weight: 0.5 }], same, { total: 1000 }); // prettier-ignore
    expect(r1.effN).toBeCloseTo(2);
    expect(r1.effBets).toBeCloseTo(1, 2);
    expect(riskNotes(r1).map((n) => n.text).join(" ")).toMatch(/uma aposta só/); // prettier-ignore
    expect(r1.spyExposure).toBeGreaterThan(1800); // beta ~2 × 1000
    const r2 = portfolioRisk(
      [
        { sym: "AAA", weight: 0.5 },
        { sym: "BBB", weight: 0.5 },
      ],
      H,
    );
    expect(r2.effBets).toBeGreaterThan(1.05);
    expect(r2.spyExposure).toBeNull(); // sem valor total
  });
  it("tela: sem carteira e com dados", () => {
    expect(viewRisk({ risk: null, hasPortfolio: false })).toMatch(/Importe a carteira/);
    const html = viewRisk({
      risk: portfolioRisk([{ sym: "AAA", weight: 1 }], H),
      hasPortfolio: true,
    });
    expect(html).toMatch(/VaR 95%/);
    expect(html).toMatch(/Apostas independentes/);
    const withS = viewRisk({
      risk: portfolioRisk([{ sym: "AAA", weight: 1 }], H),
      structure: structureCost([{ sym: "SPY", value: 200000, dy: 0.012 }]),
      hasPortfolio: true,
    });
    expect(withS).toMatch(/Custo de estrutura/);
    expect(withS).toMatch(/UCITS/);
  });
});
