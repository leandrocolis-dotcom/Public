import { describe, expect, it } from "vitest";
import { isUsSitus, structureCost } from "../assets/structure-cost.js";

describe("custo de estrutura (não residente)", () => {
  it("separa ETF americano de UCITS/estrangeiro", () => {
    expect(isUsSitus("SPY")).toBe(true);
    expect(isUsSitus("BRK-B")).toBe(true);
    expect(isUsSitus("CSPX.L")).toBe(false);
    expect(isUsSitus("PETR4.SA")).toBe(false);
  });
  it("retenção 30% × 15% e pior caso da herança", () => {
    const r = structureCost([
      { sym: "SPY", value: 100_000, dy: 0.012 },
      { sym: "TLT", value: 50_000, dy: 0.04 },
      { sym: "CSPX.L", value: 20_000, dy: 0 },
      { sym: "XYZ", value: 10_000, dy: null },
    ]);
    expect(r.divs).toBeCloseTo(1200 + 2000);
    expect(r.leak).toBeCloseTo(3200 * 0.3);
    expect(r.saving).toBeCloseTo(3200 * 0.15);
    expect(r.lines[0].sym).toBe("TLT"); // maior economia primeiro
    expect(r.usValue).toBe(160_000);
    expect(r.estateWorst).toBeCloseTo(100_000 * 0.4);
    expect(r.unknown).toEqual(["XYZ"]);
    expect(r.savingPct).toBeCloseTo(480 / 180_000);
  });
  it("carteira pequena não tem exposição à herança", () => {
    expect(structureCost([{ sym: "SPY", value: 50_000, dy: 0.01 }]).estateWorst).toBe(0);
  });
});
