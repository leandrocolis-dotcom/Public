import { describe, expect, it } from "vitest";
import {
  applyEdge,
  edgeOf,
  kellyQuarter,
  momentumRank,
  regimeOf,
  sectorRotation,
  simulateR,
  tradeStats,
} from "../assets/edge.js";

describe("tradeStats", () => {
  it("calcula expectativa, payoff, profit factor e empate como na lição 13", () => {
    // 35% de acerto, ganho de 3R, perda de 1R → +0,40R
    const rs = [...Array(7).fill(3), ...Array(13).fill(-1)];
    const s = tradeStats(rs);
    expect(s.n).toBe(20);
    expect(s.winRate).toBeCloseTo(0.35);
    expect(s.payoff).toBeCloseTo(3);
    expect(s.expectancy).toBeCloseTo(0.4);
    expect(s.breakeven).toBeCloseTo(0.25);
    expect(s.profitFactor).toBeCloseTo(21 / 13);
  });
  it("mede o pior drawdown em R", () => {
    expect(tradeStats([2, -1, -1, -1, 3]).maxDD).toBe(3);
  });
  it("lista vazia não quebra", () => {
    expect(tradeStats([]).n).toBe(0);
  });
});

describe("simulateR", () => {
  const flat = (n, v) => Array(n).fill(v);
  it("entra na abertura seguinte e sai no stop com perda de ~1R mais custos", () => {
    const c = [100, 100, 95, 95, 95, 95];
    const bars = {
      o: [100, 100, 100, 95, 95, 95],
      h: c.map((x) => x + 1),
      l: [99, 99, 90, 94, 94, 94],
      c,
    };
    const r = simulateR(bars, [0], flat(6, 2), { dir: 1, stopAtr: 2, h: 4, cost: 0 });
    expect(r).toHaveLength(1);
    expect(r[0]).toBeCloseTo(-1);
  });
  it("sem stop, sai no fechamento de i+h", () => {
    const c = [100, 100, 102, 104, 106, 108];
    const bars = { o: c, h: c.map((x) => x + 0.5), l: c.map((x) => x - 0.5), c };
    const r = simulateR(bars, [0], flat(6, 2), { dir: 1, stopAtr: 2, h: 4, cost: 0 });
    expect(r[0]).toBeCloseTo((106 - 100) / 4);
  });
  it("ignora sinais sem janela completa (não olha o futuro)", () => {
    const c = [100, 101, 102];
    const bars = { o: c, h: c, l: c, c };
    expect(simulateR(bars, [1], [1, 1, 1], { h: 4 })).toHaveLength(0);
  });
});

describe("regime e momentum", () => {
  const up = Array.from({ length: 300 }, (_, i) => 100 * 1.001 ** i);
  const down = Array.from({ length: 300 }, (_, i) => 100 * 0.999 ** i);
  it("S&P acima da MM200 = regime de alta", () => {
    expect(regimeOf(up).bull).toBe(true);
    expect(regimeOf(down).bull).toBe(false);
    expect(regimeOf(up.slice(0, 100))).toBeNull();
  });
  it("ranqueia o momentum em percentil", () => {
    const m = momentumRank({ A: up, B: down });
    expect(m.A.m12Pct).toBe(1);
    expect(m.B.m12Pct).toBe(0);
  });
  it("rotação: top setores com regime de alta; caixa com regime de baixa", () => {
    const map = { A: up, B: down };
    expect(sectorRotation(map, up, 1).picks).toEqual(["A"]);
    const bear = sectorRotation(map, down, 1);
    expect(bear.cash).toBe(true);
    expect(bear.picks).toEqual([]);
  });
});

describe("edgeOf e applyEdge", () => {
  const good = tradeStats([...Array(8).fill(2), ...Array(8).fill(-1)]); // +0,5R
  const bad = tradeStats([...Array(4).fill(1), ...Array(8).fill(-1)]);
  const call = { key: "buy-now", tone: "buy", headline: "COMPRAR AGORA", why: "x.", action: "y." };
  it("expectativa negativa medida rebaixa a compra para aguardar", () => {
    const e = edgeOf({ dir: 1, stats: bad });
    expect(e.grade).toBe("D");
    const out = applyEdge(call, e);
    expect(out.tone).toBe("wait");
    expect(out.key).toBe("buy-now-noedge");
  });
  it("regime de baixa corta o tamanho pela metade em ações", () => {
    const e = edgeOf({ dir: 1, stats: good, regime: { bull: false }, group: "Setores" });
    expect(e.sizeMult).toBe(0.5);
    expect(e.grade).toBe("B");
    expect(applyEdge(call, e).action).toMatch(/metade/);
  });
  it("vantagem medida e contexto a favor = nota A", () => {
    const e = edgeOf({ dir: 1, stats: good, regime: { bull: true }, group: "Setores", mom: { m12Pct: 0.9 } }); // prettier-ignore
    expect(e.grade).toBe("A");
  });
  it("amostra pequena não bloqueia", () => {
    const e = edgeOf({ dir: 1, stats: tradeStats([-1, -1]) });
    expect(e.grade).toBe("C");
    expect(e.block).toBe(false);
  });
  it("Kelly ¼ só com amostra e expectativa positiva", () => {
    const big = tradeStats([...Array(12).fill(2), ...Array(12).fill(-1)]);
    expect(kellyQuarter(big)).toBeCloseTo((0.5 - 0.5 / 2) / 4);
    expect(kellyQuarter(good)).toBeNull(); // menos de 20 operações
    expect(kellyQuarter(bad)).toBeNull();
  });
});

describe("vantagem nas decisões ao vivo e nos pushes", async () => {
  const { decisionEdge, traderDecision } = await import("../assets/decision.js");
  const { edgeNote } = await import("../scripts/lib/push-alerts.mjs");
  // série que sobe e cai em ondas: o placar técnico dá sinais nos dois sentidos
  const c = Array.from(
    { length: 520 },
    (_, i) => 100 * 1.0004 ** i * (1 + 0.08 * Math.sin(i / 15)),
  );
  const bars = { dates: c.map((_, i) => `d${i}`), o: c, h: c.map((x) => x * 1.01), l: c.map((x) => x * 0.99), c, v: c.map(() => 1e6) }; // prettier-ignore
  const r = { sym: "TESTE", name: "Teste", bars, series: { dates: bars.dates, close: c }, price: c.at(-1), pillars: {}, fund: null }; // prettier-ignore

  it("decisionEdge mede a expectativa no próprio ativo e respeita o regime", () => {
    const e = decisionEdge(r, { spy: c.map((_, i) => 100 * 0.999 ** i) }, 1);
    expect(e.stats.n).toBeGreaterThan(0);
    expect(e.flags.some((f) => /regime de baixa/.test(f.text))).toBe(true);
    expect(e.sizeMult).toBe(0.5);
    expect(decisionEdge(r, {}, 0)).toBeNull();
  });
  it("sem gate (Simulador e treino do modelo) a decisão não muda nem traz vantagem", () => {
    const a = traderDecision(r, {});
    expect(a.edge).toBeNull();
  });
  it("push: regra sem vantagem e compra contra o regime ganham a marca ✗", () => {
    const global = { base: { avgFwd: 0.003 }, rules: { x: { n: 50, avgFwd: 0.001 } } };
    const t = edgeNote({ kind: "entry", code: "x" }, "AAPL", { global, regime: { bull: false } });
    expect(t).toMatch(/sem vantagem/);
    expect(t).toMatch(/metade do tamanho/);
    expect(edgeNote({ kind: "exit", code: "x" }, "AAPL", { global })).toBe("");
  });
});
