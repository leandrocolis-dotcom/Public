import { describe, expect, it } from "vitest";
import {
  deriveMetrics,
  evalJournal,
  grade,
  healthLabel,
  pctRank,
  ratingOf,
  scoreUniverse,
  spearman,
  topPicks,
} from "../assets/quant.js";

describe("pctRank", () => {
  it("dá 0–100 com empates na média e nulos preservados", () => {
    expect(pctRank([10, null, 30, 20])).toEqual([0, null, 100, 50]);
    expect(pctRank([1, 1, 2])).toEqual([25, 25, 100]);
    expect(pctRank([7])).toEqual([50]);
  });
});

describe("grade e ratingOf", () => {
  it("mapeia percentil em letra e nota em classificação", () => {
    expect(grade(97)).toBe("A+");
    expect(grade(50)).toBe("C+");
    expect(grade(3)).toBe("F");
    expect(grade(null)).toBeNull();
    expect(ratingOf(4.6).label).toBe("Compra forte");
    expect(ratingOf(3.49).label).toBe("Manter");
    expect(ratingOf(1.2).label).toBe("Venda forte");
  });
  it("rotula a saúde", () => {
    expect(healthLabel(4.2)).toBe("Excelente");
    expect(healthLabel(2)).toBe("Razoável");
  });
});

describe("deriveMetrics", () => {
  it("usa rendimentos (lucro negativo vira número baixo) e retornos semanais", () => {
    const weekly = Array.from({ length: 60 }, (_, i) => 100 + i);
    const m = deriveMetrics(
      { price: 159, trailingEps: -2, forwardEps: 8, fcf: 10, mcap: 200, revenue: 100, ma200: 150, e0y: 11, e0y30: 10, up0y: 3, down0y: 1 }, // prettier-ignore
      weekly,
    );
    expect(m.ey).toBeLessThan(0);
    expect(m.fey).toBeCloseTo(8 / 159);
    expect(m.fcfy).toBeCloseTo(0.05);
    expect(m.fcfm).toBeCloseTo(0.1);
    expect(m.r3).toBeCloseTo(159 / 146 - 1);
    expect(m.r12_1).toBeCloseTo(155 / 107 - 1);
    expect(m.r12).toBeCloseTo(159 / 107 - 1);
    expect(m.r9).toBeCloseTo(159 / 120 - 1);
    expect(m.hi52).toBeCloseTo(0);
    expect(m.rev0y30).toBeCloseTo(0.1);
    expect(m.net0y).toBeCloseTo(0.5);
    expect(m.peg).toBeNull();
  });
});

/** Universo sintético: 2 setores × 10 ações; "q" alto = melhor em tudo. */
function synth() {
  const rows = [];
  for (const sector of ["Tech", "Energy"]) {
    for (let q = 0; q < 10; q++) {
      const v = q / 10;
      // prettier-ignore
      const m = { ey: v, fey: v, peg: 3 - v, evSalesY: v, fsy: v, ebitdaY: v, ebitY: v, sy: v, by: v, cfy: v, dy: v, fcfy: v, revG: v, epsG: v, g0y: v, g1y: v, rg0y: v, rg1y: v, gm: v, om: v, ebitdaM: v, pm: v, fcfm: v, roe: v, roa: v, ocfAbs: v, niEmp: v, r3: v, r6: v, r9: v, r12: v, rev0y30: v, rev0y90: v, rev1y30: v, rev1y90: v, net0y: v, net1y: v };
      rows.push({ sym: `${sector[0]}${q}`, name: `${sector} ${q}`, sector, m });
    }
  }
  return rows;
}

describe("scoreUniverse", () => {
  it("ordena dentro do setor e dá nota 1–5", () => {
    const s = scoreUniverse(synth());
    const best = s.find((r) => r.sym === "T9");
    const worst = s.find((r) => r.sym === "E0");
    expect(best.f.value).toBe(100);
    expect(best.g.mom).toBe("A+");
    expect(best.score).toBeGreaterThan(4.5);
    expect(best.rating.label).toBe("Compra forte");
    expect(worst.score).toBeLessThan(1.5);
    expect(best.health).toBeGreaterThan(worst.health);
  });
  it("aplica o teto Manter quando um fator é desqualificante", () => {
    const rows = synth();
    const r = rows.find((x) => x.sym === "T9");
    for (const k of ["r3", "r6", "r9", "r12"]) r.m[k] = -1; // momentum péssimo
    const s = scoreUniverse(rows).find((x) => x.sym === "T9");
    expect(s.capped).toBe(true);
    expect(s.score).toBe(3.49);
    expect(s.rating.label).toBe("Manter");
  });
  it("sem momentum não dá nota", () => {
    const rows = synth();
    for (const k of ["r3", "r6", "r9", "r12"]) rows[0].m[k] = null;
    expect(scoreUniverse(rows)[0].score).toBeNull();
  });
});

describe("topPicks", () => {
  const scored = [
    { sym: "A", name: "Alpha (Class A)", sector: "X", score: 4.9 },
    { sym: "AA", name: "Alpha (Class C)", sector: "X", score: 4.8 },
    { sym: "B", name: "Beta", sector: "X", score: 4.7 },
    { sym: "C", name: "Gamma", sector: "X", score: 4.6 },
    { sym: "D", name: "Delta", sector: "Y", score: 3.6 },
    { sym: "E", name: "Eps", sector: "Y", score: 3.4 },
  ];
  it("limita por setor, não repete empresa e exige nota ≥ 3,5", () => {
    expect(topPicks(scored, { n: 5, maxPerSector: 2 })).toEqual(["A", "B", "D"]);
  });
  it("mantém quem já estava se ainda está entre os melhores", () => {
    expect(topPicks(scored, { n: 2, maxPerSector: 4, prev: ["C"], buffer: 4 })).toEqual(["C", "A"]);
  });
});

describe("spearman e evalJournal", () => {
  it("correlação de postos", () => {
    expect(spearman([1, 2, 3, 4, 5], [10, 20, 30, 40, 50])).toBeCloseTo(1);
    expect(spearman([1, 2, 3, 4, 5], [5, 4, 3, 2, 1])).toBeCloseTo(-1);
    expect(spearman([1, 2], [1, 2])).toBeNull();
  });
  it("não compara fotos de versões diferentes do modelo", () => {
    const s = { A: 1, B: 2, C: 3, D: 4, E: 5 };
    const px = { A: 1, B: 1, C: 1, D: 1, E: 1 };
    const j = [{ d: "2026-10-12", v: 1, top: ["A"], s, px, spy: 1 }, { d: "2026-11-02", v: 2, top: ["A"], s, px, spy: 1 }]; // prettier-ignore
    expect(evalJournal(j).months).toHaveLength(0);
  });
  it("mede a Top N contra o SPY e o IC da nota no mês seguinte", () => {
    const syms = ["A", "B", "C", "D", "E", "F", "G", "H", "I", "J"];
    const s = Object.fromEntries(syms.map((x, i) => [x, 1 + i * 0.4]));
    const px0 = Object.fromEntries(syms.map((x) => [x, 100]));
    const px1 = Object.fromEntries(syms.map((x, i) => [x, 100 + i]));
    const j = [
      { d: "2026-10-12", top: ["I", "J"], s, px: px0, spy: 100 },
      { d: "2026-11-02", top: ["J"], s, px: px1, spy: 102 },
    ];
    const { months, summary } = evalJournal(j);
    expect(months).toHaveLength(1);
    expect(months[0].ic).toBeCloseTo(1);
    expect(months[0].spy).toBeCloseTo(0.02);
    expect(months[0].top).toBeCloseTo(0.085 - 2 * 0.0005); // 1ª carteira: giro total
    expect(months[0].spread).toBeGreaterThan(0);
    expect(summary.verdict).toBe("em observação");
  });
});
