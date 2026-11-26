import { describe, expect, it } from "vitest";
import {
  corporateEvents,
  eventRisk,
  filterEvents,
  groupByDay,
  normalizeEvents,
  titlePT,
} from "../assets/calendar.js";
import { parseSymbols } from "../api/calendar.js";
import { viewCalendar } from "../assets/calendar-view.js";

const RAW = [
  { title: "CPI m/m", country: "USD", date: "2026-10-14T08:30:00-04:00", impact: "High", forecast: "0.3%", previous: "0.4%" },
  { title: "MPC Member Mann Speaks", country: "GBP", date: "2026-10-12T08:50:00-04:00", impact: "Low", forecast: "", previous: "" },
  { title: "Bank Holiday", country: "USD", date: "2026-10-12T07:00:00-04:00", impact: "Holiday", forecast: "", previous: "" },
  { title: "Retail Sales m/m", country: "USD", date: "bad", impact: "High" },
]; // prettier-ignore

describe("agenda econômica", () => {
  const ev = normalizeEvents(RAW);
  it("normaliza, ordena e descarta data inválida", () => {
    expect(ev.map((e) => e.cc)).toEqual(["USD", "GBP", "USD"]);
    expect(ev[2]).toMatchObject({
      impact: "high",
      forecast: "0.3%",
      titlePT: "Inflação (CPI) m/m",
    });
    expect(ev[1].forecast).toBeNull();
  });
  it("traduz títulos conhecidos e mantém os demais", () => {
    expect(titlePT("Non-Farm Employment Change")).toMatch(/Payroll/);
    expect(titlePT("Something Else")).toBe("Something Else");
  });
  it("filtra por país e impacto", () => {
    expect(filterEvents(ev, { ccs: ["USD"], min: "high" })).toHaveLength(1);
    expect(filterEvents(ev, { min: "all" })).toHaveLength(3);
    expect(filterEvents(ev, { min: "medium" })).toHaveLength(1);
  });
  it("risco de evento: alto impacto dos EUA na janela", () => {
    const cpi = ev[2].t;
    expect(eventRisk(ev, cpi - 3600)[0]).toMatchObject({ inMin: 60 });
    expect(eventRisk(ev, cpi - 3 * 3600)).toEqual([]);
    expect(eventRisk(ev, cpi + 10 * 60)[0].inMin).toBe(-10);
    expect(eventRisk(ev, cpi + 3600)).toEqual([]);
  });
  it("agrupa por dia em Brasília", () => {
    const g = groupByDay(ev);
    expect(g.map((x) => x.key)).toEqual(["2026-10-12", "2026-10-14"]);
  });
  it("resultados e dividendos na janela", () => {
    const now = 1_800_000_000;
    const c = corporateEvents(
      [
        { symbol: "AAPL", earningsTimestampStart: now + 86400, isEarningsDateEstimate: true },
        { symbol: "MSFT", earningsTimestamp: now + 200 * 86400, dividendDate: now + 5 * 86400 },
        { symbol: "SPY" },
      ],
      now,
    );
    expect(c.map((x) => `${x.sym}:${x.kind}`)).toEqual(["AAPL:earnings", "MSFT:dividend"]);
    expect(c[0].estimated).toBe(true);
  });
  it("símbolos da função: valida, deduplica e limita", () => {
    expect(parseSymbols("aapl, MSFT,aapl,<x>,")).toEqual(["AAPL", "MSFT"]);
  });
  it("tela escapa texto da fonte", () => {
    const html = viewCalendar({
      cal: { events: normalizeEvents([{ ...RAW[0], title: "<img src=x>" }]), corporate: [] },
      min: "all",
      ccs: "all",
      now: 0,
    });
    expect(html).not.toContain("<img");
    expect(html).toContain("&lt;img");
  });
});
