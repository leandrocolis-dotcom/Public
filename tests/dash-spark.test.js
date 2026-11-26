import { describe, expect, it } from "vitest";
import { sparkPoint } from "../assets/dash.js";

describe("sparkPoint", () => {
  const dates = ["2026-10-20", "2026-10-21", "2026-10-22", "2026-10-23"];
  it("acha o pregão mais perto do toque, com data, valor e variação contra o anterior", () => {
    const p = sparkPoint([100, 102, 99, 110], 0.35, "px", dates);
    expect(p.i).toBe(1);
    expect(p.date).toBe("21/10/26");
    expect(p.value).toBe("102,00");
    expect(p.chg).toBe("+2,00%");
    expect(p.up).toBe(true);
  });
  it("extremos ficam presos à curva; o primeiro ponto não tem variação", () => {
    expect(sparkPoint([1, 2, 3], -1, "px", dates.slice(1)).i).toBe(0);
    expect(sparkPoint([1, 2, 3], -1, "px", dates.slice(1)).chg).toBe("");
    expect(sparkPoint([1, 2, 3], 2, "px", dates.slice(1))).toMatchObject({
      i: 2,
      date: "23/10/26",
    });
  });
  it("juros: valor em % e variação em bps", () => {
    const p = sparkPoint([4.95, 4.98], 1, "yld", dates);
    expect(p.value).toBe("4,98%");
    expect(p.chg).toBe("+3 bps");
  });
  it("sem dados suficientes ou ponto vazio: nada", () => {
    expect(sparkPoint([5], 0.5)).toBeNull();
    expect(sparkPoint([1, NaN, 3], 0.5)).toBeNull();
  });
});
