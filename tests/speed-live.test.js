import { describe, expect, it } from "vitest";
import { mergePoints, speedOf } from "../assets/speed-live.js";
import { betaProxies, offQuote, PROXY } from "../assets/offmarket.js";

const T0 = 1_800_000_000;
const bars = (prices, step = 300) => ({ t: prices.map((_, i) => T0 + i * step), c: prices });

describe("velocidade ao vivo", () => {
  it("ritmo por hora dos últimos 15 min e aceleração", () => {
    // 1 h quase parada, depois +1% em 15 min
    const pts = mergePoints(
      bars([100, 100, 100, 100, 100, 100, 100, 100, 100, 100.2, 100.5, 101, 101]),
    );
    const now = T0 + 12 * 300;
    const s = speedOf(pts, now);
    expect(s.v15).toBeCloseTo(0.008, 3); // 101 / 100,2 (preço de 15 min atrás)
    expect(s.rate).toBeCloseTo(0.032, 3);
    expect(s.trend).toBe("acel");
  });
  it("virando: subiu na hora, caindo agora", () => {
    const pts = mergePoints(
      bars([100, 101, 102, 103, 104, 105, 106, 106, 106, 106, 105.5, 105, 104.5]),
    );
    expect(speedOf(pts, T0 + 12 * 300).trend).toBe("vira");
  });
  it("ticks depois da última barra entram; sem dados recentes, nada", () => {
    const pts = mergePoints(bars([100, 100, 100, 100]), [
      { t: T0 + 3 * 300 + 60, p: 101 },
      { t: T0, p: 1 },
    ]);
    expect(pts.at(-1).p).toBe(101);
    expect(pts).toHaveLength(5);
    expect(speedOf(pts, T0 + 10 * 86400)).toBeNull();
    expect(speedOf([], T0)).toBeNull();
  });
});

describe("preço fora do pregão da carteira", () => {
  it("alavancados de índice seguem o futuro com o fator", () => {
    expect(PROXY.TQQQ).toEqual(["NQ=F", 3, false]);
    expect(PROXY.SQQQ[1]).toBe(-3);
  });
  it("beta contra o SPY vira proxy do S&P (fora do PROXY)", () => {
    const dates = Array.from({ length: 60 }, (_, i) => `2026-01-${String(i).padStart(3, "0")}`);
    let s = 100;
    let a = 50;
    const spy = [];
    const aa = [];
    for (let i = 0; i < 60; i++) {
      const r = (i % 3) - 1 === 0 ? 0.01 : -0.006 * ((i % 3) - 1);
      s *= 1 + r;
      a *= 1 + 2 * r;
      spy.push(s);
      aa.push(a);
    }
    const p = betaProxies(["AAA", "QQQ"], {
      SPY: { dates, close: spy },
      AAA: { dates, close: aa },
    });
    expect(p.QQQ).toBeUndefined();
    expect(p.AAA[0]).toBe("ES=F");
    expect(p.AAA[1]).toBeCloseTo(2, 1);
  });
  it("sem pré/pós, o proxy da carteira move o preço (estimado)", () => {
    const now = T0;
    const q = { p: 50, pc: 49, t: now - 5 * 3600 };
    const es = { p: 101, pc: 100, t: now - 60 };
    const r = offQuote("AAA", q, { "ES=F": es }, now, { AAA: ["ES=F", 2, false] });
    expect(r.offSrc).toBe("fut~");
    expect(r.p).not.toBe(50);
    expect(offQuote("AAA", q, { "ES=F": es }, now).p).toBe(50);
  });
});

describe("carteira ao vivo fora do pregão", async () => {
  const { mergeQuotes, staleHeld } = await import("../assets/live-feed.js");
  it("acha posição com preço velho", () => {
    const q = { A: { t: 100, xt: 990 }, B: { t: 100 }, C: null };
    expect(staleHeld(["A", "B", "C"], q, 1000)).toEqual(["B", "C"]);
  });
  it("junta a busca própria sem mexer no carimbo do canal nem voltar no tempo", () => {
    const prev = {
      fetched_at: "x",
      quotes: { A: { p: 1, t: 10, n: "A Inc" }, B: { p: 5, t: 20 } },
    };
    const next = mergeQuotes(prev, { A: { p: 2, t: 11 }, B: { p: 4, t: 19 } });
    expect(next.fetched_at).toBe("x");
    expect(next.quotes.A).toEqual({ p: 2, t: 11, n: "A Inc" });
    expect(next.quotes.B.p).toBe(5);
    expect(mergeQuotes(prev, { B: { p: 4, t: 19 } })).toBe(prev);
  });
});
