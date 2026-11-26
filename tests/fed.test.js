import { describe, expect, it } from "vitest";
import {
  meetingPath,
  monthlyPath,
  monthsAhead,
  parseFomc,
  pathSummary,
  zqSymbol,
} from "../assets/fed.js";
import { parseEffr, parseZq } from "../api/_fed.js";
import { probText } from "../assets/fed-view.js";

const today = "2026-11-18";
// EFFR 3,88%; corte de 25 bp em 09/12 com 100%; manutenção em janeiro; corte em 17/03
const px = { "2026-11": 96.12, "2026-12": 100 - ((9 / 31) * 3.88 + (22 / 31) * 3.63), "2027-01": 96.37, "2027-02": 96.37, "2027-03": 100 - ((17 / 31) * 3.63 + (14 / 31) * 3.38), "2027-04": 96.62 }; // prettier-ignore
const contracts = monthsAhead(today, 6).map((ym) => ({ ym, p: px[ym], h: [["2026-10-16", px[ym] + 0.1], ["2026-11-17", px[ym]]] })); // prettier-ignore
const meetings = ["2026-10-28", "2026-12-09", "2027-01-27", "2027-03-17"];

describe("fed (puro)", () => {
  it("símbolos e meses", () => {
    expect(zqSymbol("2026-12")).toBe("ZQZ26.CBT");
    expect(monthsAhead("2026-11-18", 3)).toEqual(["2026-11", "2026-12", "2027-01"]);
  });
  it("juro por mês = 100 − preço; data passada usa o fechamento ≤ data", () => {
    const p = monthlyPath(contracts, today);
    expect(p[0]).toMatchObject({ ym: "2026-11", t: 0, y: 3.88 });
    expect(monthlyPath(contracts, today, "2026-10-20")[0].y).toBeCloseTo(3.78, 3);
  });
  it("reunião a reunião: corte, manutenção, corte; ignora reunião passada", () => {
    const mp = meetingPath(monthlyPath(contracts, today), meetings, 3.88, today);
    expect(mp.map((m) => [m.date, m.move, m.cum, m.dir])).toEqual([
      ["2026-12-09", -25, -25, "corte"],
      ["2027-01-27", 0, -25, "manter"],
      ["2027-03-17", -25, -50, "corte"],
    ]);
    expect(mp[0].prob).toBe(100);
    const s = pathSummary(mp, today);
    expect(s.endYear.date).toBe("2026-12-09");
    expect(s.endNext.cuts).toBe(2);
  });
  it("texto da chance", () => {
    expect(probText({ dir: "corte", prob: 72 })).toBe("72% de corte de 25 bp");
    expect(probText({ dir: "manter", prob: 0 })).toBe("manutenção provável");
    expect(probText({ dir: "corte", prob: 130 })).toMatch(/30% de mais 25/);
  });
  it("calendário do FOMC: decisão no último dia, sem votos por notação", () => {
    const html = '<h4>2027 FOMC Meetings</h4><div class="fomc-meeting__month col"><strong>January</strong></div><div class="fomc-meeting__date col">26-27</div><div class="fomc-meeting__month"><strong>Apr/May</strong></div><div class="fomc-meeting__date">30-1*</div><div class="fomc-meeting__month"><strong>May</strong></div><div class="fomc-meeting__date">15 (notation vote)</div>'; // prettier-ignore
    expect(parseFomc(html)).toEqual(["2027-01-27", "2027-05-01"]);
  });
  it("API: chart do Yahoo e EFFR do Fed de NY", () => {
    const t = Date.parse("2026-11-17T20:00:00Z") / 1000;
    const j = { chart: { result: [{ meta: { regularMarketPrice: 96.3, regularMarketTime: t }, timestamp: [t - 86400, t], indicators: { quote: [{ close: [96.25, 96.3] }] } }] } }; // prettier-ignore
    expect(parseZq(j)).toMatchObject({ p: 96.3, pc: 96.25 });
    expect(parseEffr({ refRates: [{ effectiveDate: "2026-11-17", percentRate: 3.88, targetRateFrom: 3.75, targetRateTo: 4 }] })).toEqual({ rate: 3.88, date: "2026-11-17", lo: 3.75, hi: 4 }); // prettier-ignore
  });
});
