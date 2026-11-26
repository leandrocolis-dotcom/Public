import { describe, expect, it } from "vitest";
import { critique, evalTrade, tradeFromSignal, tradeId } from "../assets/trades.js";

const dates = Array.from({ length: 30 }, (_, i) => `2026-09-${String(i + 1).padStart(2, "0")}`);
const up = { dates, close: dates.map((_, i) => 100 + i) };
const spy = { dates, close: dates.map(() => 100) };
const sg = { sym: "XLK", label: "Tecnologia", code: "pullback", kind: "entry", title: "Recuo em tendência de alta", scope: "universe", strength: 0.7, ind: { price: 100 }, mom: { m12Pct: 0.9 } }; // prettier-ignore

describe("👍 meus trades", () => {
  it("grava o sinal com a promessa do histórico", () => {
    const t = tradeFromSignal(sg, { day: dates[0], stats: { rules: { pullback: { n: 300, hitRate: 0.58, avgFwd: 0.008 } } } }); // prettier-ignore
    expect(t.id).toBe(tradeId("XLK", "pullback", dates[0]));
    expect(t.price).toBe(100);
    expect(t.flags.momStrong).toBe(true);
    expect(t.promise.hitRate).toBe(0.58);
  });
  it("acompanha como backtest: retorno em 1/5/10/21 pregões, excesso sobre o SPY e veredito em 5", () => {
    const t = tradeFromSignal(sg, { day: dates[0] });
    const ev = evalTrade(t, up, spy);
    expect(ev.at[1].r).toBeCloseTo(0.01);
    expect(ev.at[5].r).toBeCloseTo(0.05);
    expect(ev.at[5].ex).toBeCloseTo(0.05);
    expect(ev.at[21].r).toBeCloseTo(0.21);
    expect(ev.hit).toBe(true);
    expect(ev.beatSpy).toBe(true);
    expect(ev.mdd).toBe(0);
  });
  it("antes de 5 pregões fica em andamento", () => {
    const t = tradeFromSignal(sg, { day: dates[27] });
    const ev = evalTrade(t, up, spy);
    expect(ev.hit).toBeNull();
    expect(ev.sessions).toBe(2);
  });
  it("critica a regra contra o prometido", () => {
    const promise = { hitRate: 0.6, avgFwd: 0.01, n: 300 };
    const mk = (hit, r) => ({ t: { code: "pullback", title: "Recuo", promise, flags: { momStrong: hit, againstRegime: false, noEdge: false } }, ev: { hit, at: { 5: { r } } } }); // prettier-ignore
    const c = critique([mk(true, 0.03), mk(false, -0.02), mk(false, -0.01), mk(false, -0.04)]);
    expect(c.all.n).toBe(4);
    expect(c.rules[0].hitRate).toBe(0.25);
    expect(c.rules[0].verdict).toBe("bem abaixo do prometido");
    expect(c.rules[0].small).toBe(true);
    expect(c.flags[0].helps).toBe(true);
  });
});
