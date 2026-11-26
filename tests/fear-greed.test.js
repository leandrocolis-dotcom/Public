import { describe, expect, it } from "vitest";
import { fgHtml, fgWhen, fgRating, fgSignal, fgTone, parseCnn } from "../assets/fear-greed.js";

const CNN = {
  fear_and_greed: { score: 10.96, rating: "extreme fear", timestamp: "2026-11-25T14:36:16+00:00", previous_close: 17.42, previous_1_week: 29.89, previous_1_month: 16.69, previous_1_year: 15.03 }, // prettier-ignore
  fear_and_greed_historical: {
    data: [
      { x: 1795564800000, y: 17.4 },
      { x: 1795617376000, y: 10.96 },
    ],
  },
  market_volatility_vix: { score: 6.33, rating: "extreme fear" },
  junk_bond_demand: { score: 17.6, rating: "extreme fear" },
};

describe("Medo & Ganância (CNN)", () => {
  const fg = parseCnn(CNN);
  it("lê nota, faixa, comparações e componentes", () => {
    expect(fg.score).toBe(11);
    expect(fg.prev).toEqual({ close: 17.4, week: 29.9, month: 16.7, year: 15 });
    expect(fg.parts.map((p) => p.key)).toEqual(["market_volatility_vix", "junk_bond_demand"]);
    expect(fg.hist.at(-1)).toEqual(["2026-11-25", 11]);
    expect(parseCnn({})).toBeNull();
  });
  it("faixas da CNN e tom (medo = defesa)", () => {
    expect([10, 30, 50, 60, 90].map(fgRating)).toEqual(["extreme fear", "fear", "neutral", "greed", "extreme greed"]); // prettier-ignore
    expect([10, 50, 90].map(fgTone)).toEqual(["dn", "mid", "up"]);
  });
  it("só o medo profundo (< 15) traz a leitura do estudo", () => {
    expect(fgSignal(fg).key).toBe("deep");
    expect(fgSignal({ score: 20 })).toBeNull();
  });
  it("bloco com nota, faixa em português e variação contra ontem", () => {
    const h = fgHtml(fg);
    expect(h).toMatch(/Medo extremo/);
    expect(h).toMatch(/ontem 17 <i class="dn">−6<\/i>/);
    expect(h).toMatch(/Medo profundo/);
    expect(fgHtml(null, { err: "x" })).toMatch(/indisponível/);
  });

  it("hora da nota: ao vivo até 20 min, depois só a hora (e a data se não for hoje)", () => {
    const at = "2026-11-25T15:43:31+00:00";
    const t = Date.parse(at);
    expect(fgWhen(at, t + 5 * 60_000)).toMatch(/^ao vivo \d\d:43$/);
    expect(fgWhen(at, t + 60 * 60_000)).toMatch(/^\d\d:43$/);
    expect(fgWhen(at, t + 3 * 864e5)).toMatch(/^\d\d\/11 \d\d:43$/);
    expect(fgWhen(null)).toBe("");
    expect(fgHtml(null)).toBe("");
  });
});
