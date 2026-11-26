import { describe, it, expect, vi } from "vitest";

vi.mock("../assets/net.js", async (orig) => {
  const real = await orig();
  return {
    ...real,
    // bloco com 2 ativos sempre cai; cada ativo sozinho responde
    fetchJSON: vi.fn(async (url) => {
      const syms = decodeURIComponent(url.split("symbols=")[1]).split(",");
      if (syms.length > 1) throw new Error("fonte demorou demais (504)");
      return { items: { [syms[0]]: { ok: 1 } }, errors: [] };
    }),
  };
});
vi.mock("../assets/integrated.js", () => ({
  analyzeTicker: (sym) => ({ sym }),
}));

describe("ensureAnalysis", () => {
  it("bloco que falha: tenta de novo e depois busca cada ativo sozinho", async () => {
    const { ensureAnalysis, an } = await import("../assets/analysis-data.js");
    const got = await ensureAnalysis(["KORU", "SOXL"]);
    expect(got.map((x) => x.sym).sort()).toEqual(["KORU", "SOXL"]);
    expect(an.fail.KORU).toBeUndefined();
  }, 20_000);
});
