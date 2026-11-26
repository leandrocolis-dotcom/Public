import { describe, it, expect } from "vitest";
import {
  rangePos,
  liquidityOf,
  quoteFromBars,
  windowReturns,
  priceStatus,
} from "../assets/asset-pop.js";

describe("painel do ativo", () => {
  it("posição na faixa (mín–máx)", () => {
    expect(rangePos(10, 20, 15)).toBe(0.5);
    expect(rangePos(10, 20, 25)).toBe(1);
    expect(rangePos(10, 10, 10)).toBeNull();
    expect(rangePos(null, 20, 15)).toBeNull();
  });
  it("cotação de reserva a partir das barras (ticker fora do ao vivo)", () => {
    const n = 260;
    const bars = {
      c: Array(n).fill(10),
      h: Array(n).fill(11),
      l: Array(n).fill(9),
      v: Array(n).fill(1000),
    };
    bars.h[n - 1] = 12;
    const q = quoteFromBars(bars, 5e9);
    expect(q).toMatchObject({
      fb: true,
      dh: 12,
      dl: 9,
      h52: 12,
      l52: 9,
      av: 1000,
      av3: 1000,
      mc: 5e9,
    });
    expect(quoteFromBars({ c: [1], h: [1], l: [1], v: [1] })).toBeNull();
  });
  it("liquidez pelo giro diário em US$", () => {
    expect(liquidityOf(500, 1e6).label).toBe("Alta");
    expect(liquidityOf(20, 1e6).label).toBe("Média");
    expect(liquidityOf(5, 1e5).label).toBe("Baixa");
    expect(liquidityOf(5, null)).toBeNull();
  });
  it("rentabilidade de cada janela", () => {
    const close = Array.from({ length: 300 }, (_, i) => 100 + i);
    const r = windowReturns(close);
    expect(r["1D"]).toBeCloseTo(399 / 398 - 1);
    expect(r["1M"]).toBeCloseTo(399 / 378 - 1);
    expect(r["1A"]).toBeCloseTo(399 / 147 - 1);
    expect(r["2A"]).toBeNull();
    expect(windowReturns(Array(1250).fill(1).concat([2]))["5A"]).toBeCloseTo(1);
    expect(windowReturns(close, { p: 410, pc: 400 })["1D"]).toBeCloseTo(0.025);
    expect(windowReturns(close, { p: 410, pc: 400 })["1M"]).toBeCloseTo(410 / 378 - 1);
  });
  it("live só com pregão aberto e cotação recente; senão o horário do último preço", () => {
    const now = 1_800_000_000;
    expect(priceStatus({ ms: "REGULAR", t: now - 60, p: 10 }, null, now).live).toBe(true);
    expect(priceStatus({ ms: "REGULAR", t: now - 3600, p: 10 }, null, now).live).toBe(false);
    expect(priceStatus({ ms: "CLOSED", t: now - 60, p: 10 }, null, now).text).toMatch(
      /^Último preço: /,
    );
    expect(priceStatus(null, "2026-10-09", now).text).toBe("Último preço: 09/10/2026");
  });
});
