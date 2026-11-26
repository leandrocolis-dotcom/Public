import { describe, it, expect } from "vitest";
import { newsByAsset, moved } from "../assets/asset-news.js";

describe("notícia por ativo no Painel", () => {
  const now = Date.parse("2026-10-08T15:00:00Z") / 1000;
  const items = [
    { title: "Oil jumps as OPEC signals cuts", t: now - 3600, link: "a" },
    { title: "Gold slips as dollar firms", t: now - 7200, link: "b" },
    { title: "Oil fell yesterday", t: now - 30 * 3600, link: "c" },
    { title: "Vale a pena investir?", t: now - 60, link: "d" },
  ];
  it("liga manchetes do dia aos ativos e descarta as de ontem", () => {
    const m = newsByAsset(items, now);
    expect(m["CL=F"].map((x) => x.link)).toEqual(["a"]);
    expect(m["GC=F"].map((x) => x.link)).toEqual(["b"]);
    expect(m["DX-Y.NYB"].map((x) => x.link)).toEqual(["b"]);
    expect(m["^GSPC"]).toBeUndefined();
  });
  it("só sinaliza movimento relevante", () => {
    expect(moved(0.006)).toBe(true);
    expect(moved(-0.001)).toBe(false);
    expect(moved(4, "yld")).toBe(true);
    expect(moved(null)).toBe(false);
  });
});

describe("fora da curva", () => {
  it("mede a variação de hoje em desvios do normal", async () => {
    const { zMove } = await import("../assets/asset-news.js");
    const s = Array.from({ length: 70 }, (_, i) => 100 * (1 + (i % 2 ? 0.01 : -0.01)));
    // oscilação diária de ~2%: hoje +6% ≈ 3 desvios
    const z = zMove([...s, s.at(-1) * 1.06], 0.06);
    expect(z).toBeGreaterThan(2.5);
    expect(Math.abs(zMove([...s, s.at(-1) * 1.005], 0.005))).toBeLessThan(1);
    expect(zMove([1, 2, 3], 0.1)).toBeNull();
  });
});
