import { describe, expect, it } from "vitest";
import { nameBeta, portfolioBias } from "../assets/port-bias.js";

const risk = (betas) => ({
  positions: Object.entries(betas).map(([sym, beta]) => ({ sym, beta })),
});

describe("termômetro bull/bear da carteira", () => {
  it("carteira igual ao S&P = +50 (Bull)", () => {
    const b = portfolioBias([{ sym: "SPY", weight: 1 }], risk({ SPY: 1 }));
    expect(b.score).toBe(50);
    expect(b.level).toBe("Bull");
  });
  it("inverso puxa para bear e pesos ponderam", () => {
    const rows = [
      { sym: "SPY", weight: 0.5 },
      { sym: "SH", weight: 0.5 },
    ];
    const b = portfolioBias(rows, risk({ SPY: 1, SH: -1 }));
    expect(b.score).toBe(0);
    expect(b.level).toBe("Neutra");
    expect(b.bear[0].sym).toBe("SH");
  });
  it("limita em ±100", () => {
    expect(portfolioBias([{ sym: "SQQQ", weight: 1 }], risk({ SQQQ: -3.5 })).score).toBe(-100);
  });
  it("sem histórico estima pelo nome; sem nada, fica de fora", () => {
    expect(nameBeta("ProShares UltraPro Short QQQ -3x")).toBe(-3);
    expect(nameBeta("Direxion Daily Semiconductor Bull 3X")).toBe(3);
    expect(nameBeta("Apple Inc")).toBeNull();
    const b = portfolioBias(
      [
        { sym: "A", weight: 0.6, name: "Bear 2x" },
        { sym: "B", weight: 0.4, name: "X" },
      ],
      null,
    );
    expect(b.ok).toBe(true);
    expect(b.score).toBe(-100);
    expect(b.missing).toEqual(["B"]);
  });
  it("cobertura < 50% não mede", () => {
    expect(portfolioBias([{ sym: "A", weight: 1 }], null).ok).toBe(false);
  });
  it("aderência ao cenário", () => {
    const rows = [{ sym: "QQQ", weight: 1 }];
    expect(portfolioBias(rows, risk({ QQQ: 1.2 }), 50).fit.key).toBe("ok");
    expect(portfolioBias(rows, risk({ QQQ: 1.2 }), -40).fit.key).toBe("hot");
    expect(portfolioBias(rows, risk({ QQQ: 0.1 }), 70).fit.key).toBe("cold");
  });
});
