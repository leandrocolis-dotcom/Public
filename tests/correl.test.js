import { describe, expect, it } from "vitest";
import { corBand, pearson, portfolioReturns, quintiles } from "../assets/correl.js";
import { worsened } from "../assets/regime-watch.js";
import { helpText, hx } from "../assets/help.js";

const seq = (n, f) => Array.from({ length: n }, (_, i) => f(i));

describe("correlação com a carteira", () => {
  it("pearson: igual = 1, oposto = −1, poucos dias = null", () => {
    const a = seq(40, (i) => Math.sin(i) * 100);
    expect(pearson(a, a)).toBeCloseTo(1, 6);
    expect(
      pearson(
        a,
        a.map((x) => -x),
      ),
    ).toBeCloseTo(-1, 6);
    expect(pearson(a.slice(0, 10), a.slice(0, 10))).toBeNull();
  });
  it("pearson ignora dias sem pregão", () => {
    const a = seq(40, (i) => (i % 2 ? 50 : -30) + i);
    const b = a.map((x, i) => (i === 5 ? null : x));
    expect(pearson(a, b)).toBeCloseTo(1, 6);
  });
  it("carteira = média pesada, renormalizada no dia em que falta um ativo", () => {
    const r = { A: [100, 200, null], B: [0, 100, 50] };
    expect(portfolioReturns({ A: 0.5, B: 0.5 }, r)).toEqual([50, 150, 50]);
    expect(portfolioReturns({ X: 1 }, r)).toBeNull();
  });
  it("escala 1–5 por quintil e seta pelo ρ médio da carteira", () => {
    const cuts = quintiles([-0.4, -0.2, 0, 0.2, 0.4, 0.6]);
    expect(corBand(-0.5, 0.7, cuts)).toMatchObject({
      label: "1 · Muito baixa",
      arrow: "↓",
      tone: "buy",
    });
    expect(corBand(0.9, 0.7, cuts)).toMatchObject({
      label: "5 · Muito alta",
      arrow: "↑",
      tone: "sell",
    });
    expect(corBand(0.5, 0.7, cuts).arrow).toBe("↓");
  });
});

describe("vigia de regime da carteira", () => {
  const base = { label: "Manter", tone: "wait", up200: true, mt: 0.2 };
  it("sem mudança não avisa", () => expect(worsened(base, base)).toEqual([]));
  it("decisão rebaixada, perda da MM200 e médio prazo contra", () => {
    const why = worsened(base, { label: "Reduzir", tone: "sell", up200: false, mt: -0.4 });
    expect(why).toHaveLength(3);
  });
  it("melhora não avisa", () =>
    expect(worsened(base, { ...base, label: "Ampliar", tone: "buy" })).toEqual([]));
});

describe("inverso: proteção, não diversificação", () => {
  it("botão ! abre o balão com a explicação", () => {
    expect(hx("hedge", { sym: "SQQQ", spy: -0.83 })).toContain(">!</span>");
    expect(helpText("hedge", { sym: "SQQQ", spy: -0.83 }).body).toMatch(
      /proteção.*não como diversificação/,
    );
    expect(helpText("hedge", {}).body).toMatch(/Este ativo/);
  });
});

describe("vigia de regime no push de fundo (app fechado)", async () => {
  const { regimeAlerts } = await import("../scripts/lib/push-alerts.mjs");
  const up = Array.from({ length: 220 }, (_, i) => 100 + i * 0.1); // acima da MM200
  const h = [{ sym: "XYZ", qty: 1 }];
  it("perda da MM200 hoje gera 1 aviso com chave do dia", () => {
    const live = { XYZ: { close: [...up, 50] } };
    const a = regimeAlerts(h, {}, { live, day: "2026-10-13" });
    expect(a).toHaveLength(1);
    expect(a[0].key).toBe("rg:XYZ:2026-10-13");
    expect(a[0].body).toMatch(/média de 200 dias/);
  });
  it("sem mudança, sem aviso; sem posição, sem aviso", () => {
    const live = { XYZ: { close: [...up, 125] } };
    expect(regimeAlerts(h, {}, { live })).toEqual([]);
    expect(regimeAlerts([{ sym: "XYZ", qty: 0 }], {}, { live: { XYZ: { close: [...up, 50] } } })).toEqual([]); // prettier-ignore
  });
});
