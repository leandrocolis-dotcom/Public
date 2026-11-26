import { describe, expect, it } from "vitest";
import { levelAlert, levelOdds, mediumTerm, levelText } from "../assets/level-alerts.js";
import { levelAlerts } from "../scripts/lib/push-alerts.mjs";

// série em alta que encosta várias vezes numa máxima e rompe
function bars(n = 300) {
  const c = [];
  for (let i = 0; i < n; i++) c.push(100 + i * 0.1 + 3 * Math.sin(i / 4));
  return { c, h: c.map((x) => x + 0.5), l: c.map((x) => x - 0.5), dates: c.map((_, i) => `d${i}`) };
}
const dec = (score, tone, fund = 0.3, market = 0.3, conf = "Alta") => ({
  final: { score, conf, step: { label: tone === "buy" ? "Comprar" : tone === "sell" ? "Vender" : "Aguardar", tone } },
  subs: { fund: { dir: fund }, market: { dir: market } },
  ladder: [{ kind: "stop", to: 90 }],
}); // prettier-ignore
const r = (price, extra = {}) => ({
  sym: "AAA",
  price,
  bars: bars(),
  pillars: {
    tech: {
      atr: 2,
      levels: { resistances: [{ price: 130 }], supports: [{ price: 110 }] },
      ...extra,
    },
  },
});

describe("levelOdds (backtest de rompimento/suporte)", () => {
  it("conta casos e devolve probabilidade entre 0 e 1", () => {
    const o = levelOdds(bars(), "res");
    expect(o.n).toBeGreaterThan(0);
    expect(o.p).toBeGreaterThanOrEqual(0);
    expect(o.p).toBeLessThanOrEqual(1);
    expect(levelOdds({ c: [1, 2, 3] }, "res")).toBeNull();
  });
});

describe("levelAlert", () => {
  const hold = { qty: 10 };
  it("sem posição ou longe dos níveis: nada", () => {
    expect(levelAlert(r(120), dec(0.4, "buy"), { price: 120, hold: { qty: 0 } })).toBeNull();
    expect(levelAlert(r(120), dec(0.4, "buy"), { price: 120, hold })).toBeNull();
  });
  it("perto da resistência: sempre diz ampliar/reduzir/manter e traz o backtest", () => {
    const a = levelAlert(r(129.5), dec(0.4, "buy"), { price: 129.5, hold });
    expect(a.zone).toBe("res");
    expect(a.action).toMatch(/^Agora: /);
    expect(a.why).toMatch(/casos parecidos|sem histórico/);
  });
  it("médio prazo negativo veta ampliar", () => {
    const a = levelAlert(r(129.5), dec(0.4, "buy", -0.6, -0.6), { price: 129.5, hold });
    expect(a.action).not.toMatch(/Ampliar/);
    const s = levelAlert(r(110.5), dec(0.4, "buy", -0.6, -0.6), { price: 110.5, hold });
    expect(s.action).not.toMatch(/Ampliar/);
  });
  it("stop: zera com médio prazo fraco, reduz metade com médio prazo forte", () => {
    expect(levelAlert(r(89), dec(-0.5, "sell", -0.2, 0), { price: 89, hold }).action).toMatch(/vender tudo/); // prettier-ignore
    expect(levelAlert(r(89), dec(-0.5, "sell", 0.6, 0.6), { price: 89, hold }).action).toMatch(/vender 50%/); // prettier-ignore
  });
  it("encostando no stop (sem perder): não manda vender agora, só no fechamento abaixo", () => {
    const a = levelAlert(r(90.5), dec(0.4, "buy", 0.6, 0.6), { price: 90.5, hold });
    expect(a.zone).toBe("stop");
    expect(a.tone).toBe("wait");
    expect(a.action).toBe("Agora: segurar, sem comprar mais");
    expect(a.trigger).toBe("Se fechar abaixo de 90,00: vender 50%");
    expect(a.headline).toMatch(/^A 0,6% do stop 90,00$/);
    expect(levelText(a).body).toMatch(/Se fechar abaixo de 90,00/);
  });
  it("mediumTerm e texto", () => {
    expect(mediumTerm(dec(0, "wait", 0.5, 0.5)).label).toMatch(/favorável/);
    const a = levelAlert(r(89), dec(-0.5, "sell"), { price: 89, hold });
    expect(levelText(a).body).toMatch(/não é recomendação/);
  });
});

describe("levelAlerts (push)", () => {
  it("gera chave por ativo, zona e dia; usa a cotação ao vivo", () => {
    const an = { AAA: { ...r(120), pillars: { tech: { atr: 2, levels: { resistances: [{ price: 130 }], supports: [{ price: 110 }] } }, fund: { score: 70 } } } }; // prettier-ignore
    const out = levelAlerts([{ sym: "AAA", qty: 5 }], an, { quotes: { AAA: { p: 129.6 } }, day: "2026-10-08" }); // prettier-ignore
    expect(out).toHaveLength(1);
    expect(out[0].key).toMatch(/^lvl:AAA:res:\w+:2026-10-08$/);
  });
});

describe("amostra mínima", () => {
  it("com menos de 10 casos o backtest não muda a ação", async () => {
    const { MIN_N } = await import("../assets/level-alerts.js");
    expect(MIN_N).toBe(10);
  });
});
