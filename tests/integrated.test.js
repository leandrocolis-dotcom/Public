import { describe, it, expect } from "vitest";
import {
  analyzeTicker,
  fundPillar,
  analystPillar,
  momPillar,
  riskOf,
  scaleOf,
  techPillar,
} from "../assets/integrated.js";

/** Barras sintéticas: tendência suave com ruído determinístico. */
function bars(n, drift = 0.001, start = 100) {
  const c = [];
  let p = start;
  for (let i = 0; i < n; i++) {
    p *= 1 + drift + 0.01 * Math.sin(i * 1.7);
    c.push(p);
  }
  return {
    dates: c.map(
      (_, i) =>
        `2025-${String(1 + (Math.floor(i / 28) % 12)).padStart(2, "0")}-${String(1 + (i % 28)).padStart(2, "0")}`,
    ),
    o: c.map((x) => x * 0.998),
    h: c.map((x) => x * 1.01),
    l: c.map((x) => x * 0.99),
    c,
    v: c.map(() => 1e6),
  };
}

describe("integrated: escala", () => {
  it("faixas da escala", () => {
    expect(scaleOf(80).label).toBe("Nota muito favorável");
    expect(scaleOf(65).label).toBe("Nota favorável");
    expect(scaleOf(50).label).toBe("Nota neutra");
    expect(scaleOf(30).label).toBe("Nota desfavorável");
    expect(scaleOf(10).label).toBe("Nota muito desfavorável");
    expect(scaleOf(null)).toBeNull();
  });
});

describe("integrated: pilares", () => {
  it("técnico e momentum altos em tendência de alta, baixos em queda", () => {
    const up = bars(400, 0.002);
    const dn = bars(400, -0.002);
    expect(techPillar(up).score).toBeGreaterThan(techPillar(dn).score);
    expect(momPillar(up).score).toBeGreaterThan(60);
    expect(momPillar(dn).score).toBeLessThan(40);
    expect(techPillar(bars(100)).score).toBeNull();
    expect(techPillar(up).reasons.join(" ")).not.toMatch(/undefined/);
  });
  it("fundamentos de ação: barata e de qualidade > cara e endividada", () => {
    const good = fundPillar({
      type: "EQUITY",
      pe: 10,
      fpe: 9,
      peg: 0.8,
      fcf: 8e9,
      marketCap: 1e11,
      roe: 0.25,
      margin: 0.2,
      debtEq: 40,
      revGrowth: 0.15,
      epsGrowth: 0.2,
    });
    const bad = fundPillar({
      type: "EQUITY",
      pe: 80,
      fpe: 60,
      peg: 4,
      fcf: -1e9,
      marketCap: 1e11,
      roe: 0.02,
      margin: 0.01,
      debtEq: 350,
      revGrowth: -0.05,
      epsGrowth: -0.3,
    });
    expect(good.score).toBeGreaterThan(70);
    expect(bad.score).toBeLessThan(30);
  });
  it("fundamentos de ETF: P/L contra o S&P 500; renda fixa fica sem nota", () => {
    expect(fundPillar({ type: "ETF", pe: 15, dy: 0.03 }, 25).score).toBeGreaterThan(60);
    expect(fundPillar({ type: "ETF", pe: null }, 25).score).toBeNull();
    expect(fundPillar(null).score).toBeNull();
  });
  it("analistas exigem 3+ opiniões", () => {
    expect(analystPillar({ analysts: 2, target: 120, recMean: 2 }, 100).score).toBeNull();
    const a = analystPillar({ analysts: 20, target: 130, recMean: 1.5 }, 100);
    expect(a.upside).toBeCloseTo(0.3);
    expect(a.score).toBeGreaterThan(75);
  });
  it("risco: alavancado e queda forte geram aviso", () => {
    const r = riskOf(bars(300, -0.004), { name: "Direxion Daily 3X Bull", beta: 3 }, "XYZ");
    expect(r.warn.length).toBeGreaterThanOrEqual(3);
  });
});

describe("integrated: nota final", () => {
  it("combina pilares disponíveis e renormaliza os pesos", () => {
    const r = analyzeTicker("ABC", {
      bars: bars(400, 0.002),
      fund: {
        type: "EQUITY",
        name: "ABC",
        pe: 12,
        roe: 0.2,
        margin: 0.15,
        debtEq: 50,
        revGrowth: 0.1,
        analysts: 10,
        target: 200,
        recMean: 2,
      },
    });
    expect(r.score).toBeGreaterThan(50);
    expect(r.scale).not.toBeNull();
    expect(r.confidence).toBeTruthy();
    const onlyTech = analyzeTicker("TLT", {
      bars: bars(400, -0.002),
      fund: { type: "ETF", pe: null },
    });
    expect(onlyTech.pillars.fund.score).toBeNull();
    expect(onlyTech.score).toBeLessThan(50);
  });
  it("sem barras suficientes e sem fundamentos: sem nota", () => {
    expect(analyzeTicker("X", { bars: bars(50), fund: null }).score).toBeNull();
  });
});
