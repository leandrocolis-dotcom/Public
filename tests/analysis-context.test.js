import { describe, it, expect } from "vitest";
import { parseProfile, parseSeries } from "../api/profile.js";
import { contextHtml, growth } from "../assets/analysis-context.js";

const qs = {
  quoteSummary: { result: [{
    assetProfile: { longBusinessSummary: "Makes phones.", sector: "Technology", fullTimeEmployees: 150000, website: "https://apple.com", companyOfficers: [{ name: "Tim", title: "CEO" }] },
    financialData: { recommendationKey: "buy", recommendationMean: { raw: 2.1 }, targetMeanPrice: { raw: 120 }, targetLowPrice: { raw: 90 }, targetHighPrice: { raw: 150 } },
    recommendationTrend: { trend: [{ period: "0m", strongBuy: 5, buy: 10, hold: 4, sell: 1, strongSell: 0 }] },
    upgradeDowngradeHistory: { history: [{ epochGradeDate: 1790870151, firm: "MS", fromGrade: "Hold", toGrade: "Buy", action: "up", currentPriceTarget: 130, priorPriceTarget: 110 }] },
    calendarEvents: { earnings: { earningsDate: [{ raw: 1793649600 }], earningsAverage: { raw: 1.98 } } },
    earnings: { earningsChart: { quarterly: [{ date: "2Q2026", actual: { raw: 2 }, estimate: { raw: 1.9 } }] } },
  }] },
}; // prettier-ignore

describe("api/profile", () => {
  it("lê perfil, analistas e resultados", () => {
    const p = parseProfile(qs);
    expect(p.profile.sector).toBe("Technology");
    expect(p.analysts.trend).toEqual({ sb: 5, b: 10, h: 4, s: 1, ss: 0 });
    expect(p.analysts.changes[0]).toMatchObject({ firm: "MS", to: "Buy", pt: 130 });
    expect(p.earnings.next).toBe("2026-11-02");
    expect(p.fund).toBeNull();
    expect(parseProfile({})).toBeNull();
  });
  it("organiza as séries por data", () => {
    const s = parseSeries({ timeseries: { result: [
      { meta: { type: ["quarterlyTotalRevenue"] }, quarterlyTotalRevenue: [{ asOfDate: "2026-03-31", reportedValue: { raw: 90 } }, { asOfDate: "2025-12-31", reportedValue: { raw: 80 } }] },
      { meta: { type: ["quarterlyNetIncome"] }, quarterlyNetIncome: [{ asOfDate: "2026-03-31", reportedValue: { raw: 9 } }, null] },
    ] } }); // prettier-ignore
    expect(s.quarterly.map((r) => r.date)).toEqual(["2025-12-31", "2026-03-31"]);
    expect(s.quarterly[1]).toMatchObject({ TotalRevenue: 90, NetIncome: 9 });
  });
});

describe("contexto na Análise", () => {
  it("crescimento contra período anterior, inclusive base negativa", () => {
    expect(growth([{ x: 100 }, { x: 110 }], "x", 1)).toBeCloseTo(0.1);
    expect(growth([{ x: -10 }, { x: 5 }], "x", 1)).toBeCloseTo(1.5);
    expect(growth([{ x: 1 }], "x", 4)).toBeNull();
  });
  it("monta as seções", () => {
    const h = contextHtml({ ...parseProfile(qs), news: [{ title: "Apple <b>sobe</b>", link: "https://x.com", t: 1 }], financials: { quarterly: [{ date: "2026-03-31", TotalRevenue: 9e10, NetIncome: 2e10 }], annual: [] } }, 100);
    for (const t of ["Sobre a empresa", "Últimas manchetes", "Opinião dos analistas", "Últimos dados financeiros", "+20"]) expect(h).toContain(t);
    expect(h).not.toContain("<b>sobe</b>");
  }); // prettier-ignore
});
