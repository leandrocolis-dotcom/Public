// Fase 3.3: a cópia rasa do overlay dá o mesmo resultado da cópia profunda e não altera a tabela de entrada.
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { applyLiveToFlow, applyLiveToPrices } from "../assets/live.js";

const flow = JSON.parse(readFileSync(new URL("./fixtures/flow.json", import.meta.url)));
const lastDate = flow.dates.at(-1);
const t = (d, h = 15) => Date.parse(`${d}T${h}:00:00Z`) / 1000;
const nextDay = (d) => new Date(Date.parse(`${d}T12:00:00Z`) + 86400000).toISOString().slice(0, 10);

function liveFor(table, key, day, bump = 1.01) {
  const quotes = { SPY: { p: 500, pc: 495, t: t(day), v: 1 } };
  for (const [c, s] of Object.entries(table[key]).slice(0, 40))
    quotes[c] = { p: s.at(-1) * bump, pc: s.at(-1), t: t(day), v: 1234 };
  return { quotes };
}

describe("overlay sem structuredClone", () => {
  for (const [label, day] of [
    ["mesmo pregão", lastDate],
    ["pregão novo (acrescenta linha)", nextDay(lastDate)],
  ])
    it(`${label}: entrada intacta e resultado consistente`, () => {
      const before = structuredClone(flow);
      const live = liveFor(flow, "close", day);
      const r = applyLiveToFlow(flow, live);
      expect(flow).toEqual(before); // nada da entrada foi alterado
      expect(r.applied.length).toBeGreaterThan(0);
      const c = r.applied[0];
      expect(r.table.close[c].at(-1)).toBeCloseTo(live.quotes[c].p, 10);
      expect(r.table.dates.at(-1)).toBe(day);
      expect(r.table.close[c].length).toBe(r.table.dates.length);
      // mexer no resultado não vaza para a entrada
      r.table.close[c][0] = -1;
      r.table.dates[0] = "x";
      expect(flow).toEqual(before);
    });

  it("prices.json: mesma regra e meta nova sem tocar a base", () => {
    const prices = { dates: ["2026-10-06", "2026-10-07"], series: { SPY: [490, 495], TLT: [90, 91] }, last_real: {}, meta: { a: 1 } }; // prettier-ignore
    const before = structuredClone(prices);
    const r = applyLiveToPrices(prices, {
      quotes: { SPY: { p: 500, pc: 495, t: t("2026-10-08"), ms: "REGULAR" } },
    });
    expect(prices).toEqual(before);
    expect(r.table.series.SPY).toEqual([490, 495, 500]);
    expect(r.table.series.TLT).toEqual([90, 91, 91]);
    expect(r.table.meta.market_status).toBe("Intradiário");
  });
});
