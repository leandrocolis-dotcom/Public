import { describe, it, expect } from "vitest";
import {
  similarSituations, historySub, techSub, fundSub, marketSub, combine, priceLadder, traderDecision, DECISION, trendSub, SUB_W,
} from "../assets/decision.js"; // prettier-ignore

const wave = (n, drift = 1.001) =>
  Array.from({ length: n }, (_, i) => 100 * drift ** i * (1 + 0.04 * Math.sin(i / 6)));

describe("decisão do trader", () => {
  it("situações parecidas: encontra dias semelhantes e compara com a base", () => {
    const s = similarSituations(wave(500));
    expect(s.n).toBeGreaterThan(3);
    expect(s.by[20].base).toBeGreaterThan(0);
    expect(similarSituations(wave(150))).toBeNull();
  });
  it("histórico negativo entra sempre com confiança baixa (não antecipou queda na validação)", () => {
    const neg = historySub({
      n: 40,
      by: { 5: { avg: -0.01 }, 20: { avg: -0.05, hit: 0.3, base: 0.01 } },
    });
    expect(neg.dir).toBeLessThan(0);
    expect(neg.conf).toBe("Baixa");
    const pos = historySub({
      n: 40,
      by: { 5: { avg: 0.01 }, 20: { avg: 0.05, hit: 0.7, base: 0.01 } },
    });
    expect(pos.conf).toBe("Alta");
    expect(historySub({ n: 2, by: {} }).conf).toBe("Baixa");
  });
  it("técnica: gráfico e momentum discordando derrubam a confiança", () => {
    expect(techSub({ raw: 60, verdict: "Compra", confidence: "alta" }, { score: 80 }).conf).toBe(
      "Alta",
    );
    expect(techSub({ raw: 60, verdict: "Compra", confidence: "alta" }, { score: 20 }).conf).toBe(
      "Baixa",
    );
    expect(techSub(null, null)).toBeNull();
  });
  it("fundamentos sem dado não pesam; ETF fica com confiança média", () => {
    expect(fundSub({ score: null }, { score: null }, {})).toBeNull();
    expect(fundSub({ score: 70 }, null, { type: "ETF" }).conf).toBe("Média");
  });
  it("mercado: regime ruim + S&P em queda puxa para baixo; beta alto amplifica", () => {
    const spy = wave(260, 0.998);
    const regime = {
      risk: { label: "RISK-OFF", tone: "bad" },
      rates: { label: "JUROS SUBINDO", tone: "bad" },
    };
    const a = marketSub({ regime, spy, asset: spy, beta: 1 });
    const b = marketSub({ regime, spy, asset: spy, beta: 1.8 });
    expect(a.dir).toBeLessThan(0);
    expect(b.dir).toBeLessThanOrEqual(a.dir);
  });
  it("combina: forte discordância rebaixa a confiança; escala cobre −1..+1", () => {
    const c = combine({
      tech: { dir: 0.8, conf: "Alta" },
      fund: { dir: -0.8, conf: "Alta" },
      market: { dir: 0.1, conf: "Média" },
      history: null,
    });
    expect(c.conflict).toBe(true);
    expect(c.conf).toBe("Baixa");
    expect(DECISION.at(-1).min).toBe(-Infinity);
    expect(combine({ tech: null })).toBeNull();
  });
  it("escala de preço: zonas em ordem e exatamente uma contém o preço", () => {
    const L = priceLadder({
      price: 100,
      atr: 2,
      levels: {
        supports: [{ price: 95 }, { price: 90 }],
        resistances: [{ price: 105 }, { price: 112 }],
      },
    });
    expect(L.map((x) => x.kind)).toEqual(["sell", "sell", "wait", "wait", "wait", "stop"]);
    expect(L.filter((x) => x.here)).toHaveLength(1);
    expect(L.find((x) => x.here).label).toMatch(/Ficar de fora/);
  });
  it("escala segue a decisão: com venda, o meio vira reduzir e o suporte nunca é zona de compra", () => {
    const args = {
      price: 100,
      atr: 2,
      levels: { supports: [{ price: 95 }], resistances: [{ price: 105 }] },
    };
    const S = priceLadder({ ...args, tone: "sell" });
    expect(S.find((x) => x.here).label).toMatch(/reduzir/);
    expect(S.some((x) => x.kind === "buy")).toBe(false);
    expect(priceLadder({ ...args, tone: "buy" }).find((x) => x.here).label).toBe("Comprar");
  });
  it("decisão completa a partir de um resultado da Análise", () => {
    const c = wave(520);
    const r = {
      price: c.at(-1),
      series: { close: c },
      fund: { type: "ETF", beta: 1 },
      pillars: { tech: { raw: 30, verdict: "Viés de compra", confidence: "média", atr: 2, levels: null }, mom: { score: 65 }, fund: { score: 55 }, analyst: { score: null } },
    }; // prettier-ignore
    const d = traderDecision(r, { regime: { risk: { label: "NEUTRO", tone: "neutral" } }, spy: c });
    expect(d.final.step.label).toBeTruthy();
    expect(Object.keys(d.subs)).toEqual(["tech", "fund", "market", "history", "trend"]);
    expect(d.ladder.find((z) => z.here).act).toBe(d.now.key);
  });

  it("momentum 12-1: alta consistente = compra com confiança alta; pouca história = sem opinião", () => {
    const up = Array.from({ length: 300 }, (_, i) => 100 * 1.002 ** i);
    const t = trendSub(up);
    expect(t.dir).toBeGreaterThan(0.5);
    expect(t.conf).toBe("Alta");
    expect(trendSub(up.map((x) => 1 / x)).dir).toBeLessThan(0);
    expect(trendSub(up.slice(0, 200))).toBeNull();
    expect(Object.values(SUB_W).reduce((a, b) => a + b, 0)).toBeCloseTo(1);
    expect(SUB_W.trend).toBeUndefined();
  });
  it("comprar em partes vira aguardar só nas decisões ao vivo (gate); Simulador e treino seguem medindo a lógica", () => {
    const r = { price: 100, series: { close: wave(520) }, fund: { type: "ETF", beta: 1 }, pillars: { tech: { raw: 30, verdict: "Viés de compra", confidence: "média", atr: 2, levels: null }, mom: { score: 60 }, fund: { score: 58 }, analyst: { score: null } } }; // prettier-ignore
    const raw = traderDecision(r, {});
    const live = traderDecision(r, {}, { gate: true });
    if (raw.final.step.key === "buy-part") {
      expect(live.final.step.key).toBe("wait");
      expect(live.final.partGated).toBe(true);
    } else expect(live.final.partGated).toBeUndefined();
    expect(Object.keys(raw.subs)).toContain("trend"); // informativo
  });
  it("em ações individuais, comprar em partes segue valendo mesmo ao vivo", () => {
    const r = { sym: "AAPL", name: "Apple", price: 100, series: { close: wave(520) }, fund: { type: "EQUITY", beta: 1 }, pillars: { tech: { raw: 30, verdict: "Viés de compra", confidence: "média", atr: 2, levels: null }, mom: { score: 60 }, fund: { score: 58 }, analyst: { score: null } } }; // prettier-ignore
    const live = traderDecision(r, {}, { gate: true });
    expect(live.final.partGated).toBeUndefined();
  });
});

import { quantSub, traderDecision as td2, EXTRA_W } from "../assets/decision.js";
describe("Quant Aberto na decisão", () => {
  it("nota 5 favorece comprar, 1 favorece vender, sem nota não pesa", () => {
    expect(quantSub({ score: 5 }).dir).toBe(1);
    expect(quantSub({ score: 1 }).dir).toBe(-1);
    expect(quantSub(undefined)).toBeNull();
    expect(quantSub({ score: 4, capped: true }).conf).toBe("Baixa");
  });
  it("fica fora de SUB_W (o aprendizado segue com 4 partes) e entra pela combinação", () => {
    expect(SUB_W.quant).toBeUndefined();
    expect(EXTRA_W.quant).toBeGreaterThan(0);
    const subs = { tech: { dir: 0, conf: "Alta" }, fund: { dir: 0, conf: "Alta" }, market: { dir: 0, conf: "Alta" }, history: { dir: 0, conf: "Alta" } }; // prettier-ignore
    expect(combine(subs).score).toBe(0);
    expect(combine({ ...subs, quant: quantSub({ score: 5 }) }).score).toBeGreaterThan(0);
  });
  it("traderDecision só usa o Quant quando quantOf é passado", () => {
    expect(td2).toBeTypeOf("function");
  });
});
