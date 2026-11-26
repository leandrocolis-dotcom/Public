import { describe, expect, it } from "vitest";
import { overnightOpen } from "../assets/sessions.js";
import { valuePortfolio, withNight } from "../assets/portfolio.js";
import { nightOf } from "../api/quotes.js";

// 25/11/2026 (quarta) às 3:03 de NY = 08:03 UTC
const at = (iso) => Date.parse(iso);
describe("sessão noturna", () => {
  it("20:00–4:00 de NY na véspera de pregão", () => {
    expect(overnightOpen(at("2026-11-25T08:03:00Z"))).toBe(true); // qua 3:03
    expect(overnightOpen(at("2026-11-25T09:30:00Z"))).toBe(false); // qua 4:30 (pré)
    expect(overnightOpen(at("2026-11-25T01:30:00Z"))).toBe(true); // ter 20:30
    expect(overnightOpen(at("2026-11-24T23:00:00Z"))).toBe(false); // ter 18:00 (pós)
    expect(overnightOpen(at("2026-11-26T02:00:00Z"))).toBe(false); // qua 21:00 → qui feriado (Ação de Graças)
    expect(overnightOpen(at("2026-11-29T02:00:00Z"))).toBe(false); // sáb 21:00
    expect(overnightOpen(at("2026-11-30T02:00:00Z"))).toBe(true); // dom 21:00 → seg
  });
  it("fulldayPrice só vale quando difere do regular", () => {
    expect(nightOf({ fulldayPrice: 67.1, regularMarketPrice: 60.96 })).toEqual({
      xp: 67.1,
      regP: 60.96,
    });
    expect(nightOf({ fulldayPrice: 60.96, regularMarketPrice: 60.96 })).toBeNull();
    expect(nightOf({})).toBeNull();
  });
  it("preço da noite entra no valor da carteira por cima do pós", () => {
    const quotes = { SOXS: { p: 60.96, pc: 49.11, t: 100, xk: "post", xp: 62.7, xt: 200 } };
    const q = withNight(quotes, { at: 300000, q: { SOXS: { xp: 67, regP: 60.96 } } });
    const v = valuePortfolio([{ sym: "SOXS", qty: 10, avg: 50 }], q);
    expect(v.rows[0].price).toBe(67);
    expect(v.rows[0].xk).toBe("night");
    expect(v.extKind).toBe("night");
    expect(v.extPL).toBeCloseTo(10 * (67 - 60.96), 6);
    expect(withNight(quotes, null)).toBe(quotes);
  });
});
