import { describe, expect, it } from "vitest";
import { groupsOf, presetCounts, screen } from "../assets/screener.js";
import { viewScreener } from "../assets/screener-view.js";

const A = [
  { code: "SPY", name: "S&P", group: "Ações EUA", ok: true, price: 110, ma50: 105, ma200: 100, vsMa50: 0.05, rsi: 72, fromHigh: -0.01, momentum: 80, r1m: 0.03 },
  { code: "TLT", name: "Treasuries", group: "Juros", ok: true, price: 90, ma50: 92, ma200: 100, vsMa50: -0.02, rsi: 25, fromHigh: -0.2, momentum: 10, r1m: -0.04 },
  { code: "GLD", name: "Ouro", group: "Commodities", ok: true, price: 101, ma50: 103, ma200: 100, vsMa50: -0.02, rsi: 40, fromHigh: -0.05, momentum: 55, r1m: 0.01 },
  { code: "XXX", ok: false },
]; // prettier-ignore

describe("screener", () => {
  it("presets", () => {
    expect(screen(A, { preset: "uptrend", sort: "momentum" }).map((a) => a.code)).toEqual([
      "SPY",
      "GLD",
    ]);
    expect(screen(A, { preset: "oversold" }).map((a) => a.code)).toEqual(["TLT"]);
    expect(screen(A, { preset: "pullback" }).map((a) => a.code)).toEqual(["GLD"]);
  });
  it("grupo, faixa de RSI e ordenação", () => {
    expect(screen(A, { group: "Juros" })).toHaveLength(1);
    expect(screen(A, { rsiMin: 30, rsiMax: 70 }).map((a) => a.code)).toEqual(["GLD"]);
    expect(screen(A, { sort: "r1m", dir: "asc" }).map((a) => a.code)).toEqual([
      "TLT",
      "GLD",
      "SPY",
    ]);
  });
  it("volatilidade em σ", () => {
    const B = [
      { code: "A", group: "x", ok: true, rsi: 50, z1: 2.4, vol20: 0.01, stretch: 3 },
      { code: "B", group: "x", ok: true, rsi: 50, z1: -3, vol20: 0.04, stretch: -1 },
      { code: "C", group: "x", ok: true, rsi: 50, z1: 0.5, vol20: 0.02, stretch: 0 },
    ];
    expect(screen(B).map((a) => a.code)).toEqual(["B", "A", "C"]);
    expect(screen(B, { preset: "moveZ" }).map((a) => a.code)).toEqual(["B", "A"]);
    expect(screen(B, { preset: "stretchUp" }).map((a) => a.code)).toEqual(["A"]);
    expect(screen(B, { preset: "hiVol" }).map((a) => a.code)).toEqual(["B"]);
  });
  it("ignora ativos sem histórico e conta presets", () => {
    expect(screen(A)).toHaveLength(3);
    expect(groupsOf(A)).toEqual(["Todos", "Ações EUA", "Juros", "Commodities"]);
    expect(presetCounts(A).all).toBe(3);
  });
  it("tela lista e escapa", () => {
    const html = viewScreener({ assets: [{ ...A[0], name: "<b>x" }], f: {} });
    expect(html).toContain("SPY");
    expect(html).not.toContain("<b>x");
  });
});
