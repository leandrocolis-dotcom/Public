import { describe, expect, it } from "vitest";
import {
  EARN_THEMES,
  buildCompany,
  daysUntil,
  earningsUniverse,
  earningsView,
  epsGrowth,
  parseCalendarRows,
  parseForecast,
  parseSurprise,
  priceAround,
  setupOf,
  usDate,
} from "../assets/earnings.js";
import { viewEarnings } from "../assets/earnings-view.js";
import { viewCalendar } from "../assets/calendar-view.js";

const SURPRISE = {
  data: {
    earningsSurpriseTable: {
      rows: [
        { fiscalQtrEnd: "Jul 2026", dateReported: "8/26/2026", eps: 2.22, consensusForecast: "2.09", percentageSurprise: "6.22" },
        { fiscalQtrEnd: "Apr 2026", dateReported: "5/20/2026", eps: 1.87, consensusForecast: "1.7", percentageSurprise: "10" },
        { fiscalQtrEnd: "Oct 2025", dateReported: "11/19/2025", eps: 1.24, consensusForecast: "1.18", percentageSurprise: "5.08" },
      ],
    },
  },
}; // prettier-ignore
const FORECAST = {
  data: {
    quarterlyForecast: {
      rows: [
        { fiscalEnd: "Jul 2026", consensusEPSForecast: 2.1, highEPSForecast: 2.2, lowEPSForecast: 2, noOfEstimates: 10, up: 0, down: 0 },
        { fiscalEnd: "Oct 2026", consensusEPSForecast: 2.49, highEPSForecast: 2.7, lowEPSForecast: 2.34, noOfEstimates: 13, up: 3, down: 1 },
      ],
    },
  },
}; // prettier-ignore
const CAL = [
  { time: "time-after-hours", symbol: "NVDA", name: "NVIDIA Corporation", marketCap: "$5,000,000,000,000", fiscalQuarterEnding: "Oct/2026", epsForecast: "$2.49", noOfEsts: "13", lastYearRptDt: "11/19/2025", lastYearEPS: "$1.24" },
  { time: "time-not-supplied", symbol: "BRK/B", epsForecast: "N/A" },
]; // prettier-ignore

/** 30 pregões úteis com fechamento 100, 101, 102… a partir de 2026-08-04. */
function bars() {
  const out = [];
  let d = Date.parse("2026-08-04T12:00:00Z");
  for (; out.length < 30; d += 864e5) {
    const dt = new Date(d);
    if (dt.getUTCDay() % 6) out.push({ date: dt.toISOString().slice(0, 10), c: 100 + out.length });
  }
  return out;
}

describe("balanços tech: leitura da Nasdaq", () => {
  it("datas, calendário, surpresas e previsão", () => {
    expect(usDate("8/26/2026")).toBe("2026-08-26");
    expect(usDate("bad")).toBeNull();
    const [nv, brk] = parseCalendarRows(CAL, "2026-11-17");
    expect(nv).toMatchObject({ sym: "NVDA", time: "post", eps: 2.49, ests: 13, lastEps: 1.24, fiscal: "Oct 2026", mcap: 5e12 }); // prettier-ignore
    expect(brk).toMatchObject({ sym: "BRK-B", time: "na", eps: null });
    const s = parseSurprise(SURPRISE);
    expect(s.map((r) => r.date)).toEqual(["2025-11-19", "2026-05-20", "2026-08-26"]);
    expect(s[2].surprisePct).toBeCloseTo(6.22);
    expect(parseForecast(FORECAST)).toHaveLength(2);
    expect(parseSurprise({ data: null })).toEqual([]);
  });

  it("universo vem dos subtemas do Fluxo, sem duplicar ticker", () => {
    expect(EARN_THEMES.some((t) => t.label === "GPUs")).toBe(true);
    const u = earningsUniverse();
    const nv = u.find((x) => x.sym === "NVDA");
    expect(nv.themes).toEqual(expect.arrayContaining(["Semicondutores", "GPUs"]));
    expect(new Set(u.map((x) => x.sym)).size).toBe(u.length);
  });

  it("crescimento do LPA só com base positiva", () => {
    expect(epsGrowth(2.49, 1.24)).toBeCloseTo(1.008, 3);
    expect(epsGrowth(0.12, -0.01)).toBeNull();
    expect(epsGrowth(0.12, 0.01)).toBeNull();
  });
});

describe("balanços tech: preço em volta da divulgação", () => {
  const b = bars();
  it("depois do fechamento: corrida até o próprio dia e reação no pregão seguinte", () => {
    const d = b[15].date;
    const r = priceAround(b, d, "post", 10);
    expect(r.run).toBeCloseTo(115 / 105 - 1);
    expect(r.react).toBeCloseTo(116 / 115 - 1);
  });
  it("antes da abertura: reação no próprio dia", () => {
    const r = priceAround(b, b[15].date, "pre", 10);
    expect(r.run).toBeCloseTo(114 / 104 - 1);
    expect(r.react).toBeCloseTo(115 / 114 - 1);
  });
  it("sem barras suficientes", () => {
    expect(priceAround(b, b[3].date)).toBeNull();
    expect(priceAround(null, "2026-08-10")).toBeNull();
  });
});

describe("balanços tech: empresa e tela", () => {
  const surprise = parseSurprise(SURPRISE);
  const quarters = parseForecast(FORECAST);
  const cal = parseCalendarRows(CAL, "2026-11-17")[0];

  it("data confirmada usa o consenso do calendário e pula o trimestre já divulgado", () => {
    const c = buildCompany({ sym: "NVDA", themes: ["GPUs"], cal, forecast: quarters, surprise });
    expect(c.next).toMatchObject({ date: "2026-11-17", estimated: false, time: "post", eps: 2.49, fiscal: "Oct 2026", up: 3, down: 1 }); // prettier-ignore
    expect(c.next.yoy).toBeCloseTo(1.008, 3);
    expect(c.stats).toMatchObject({ beats: 3, n: 3 });
    // consenso de prejuízo: bateu pelo LPA, sem entrar na média de % (sinal invertido na Nasdaq)
    const loss = buildCompany({ sym: "X", themes: [], surprise: [{ date: "2026-08-01", eps: -0.41, consensus: -0.5, surprisePct: -18 }] }); // prettier-ignore
    expect(loss.stats).toMatchObject({ beats: 1, n: 1, avgSurprise: null });
  });

  it("sem calendário: data estimada (+91 dias) sempre no futuro e LPA do ano anterior pelo histórico", () => {
    const c = buildCompany({
      sym: "NVDA",
      themes: ["GPUs"],
      forecast: quarters,
      surprise,
      today: "2026-12-01",
    });
    expect(c.next.estimated).toBe(true);
    expect(c.next.date >= "2026-12-01").toBe(true);
    expect(c.next.fiscal).toBe("Oct 2026");
    expect(c.next.lastEps).toBe(1.24);
  });

  it("divulgação recente ainda sem número entra como 'a confirmar'", () => {
    const recent = { ...cal, date: "2026-11-03", time: "post", fiscal: "Oct 2026" };
    const c = buildCompany({ sym: "NVDA", themes: ["GPUs"], recent, forecast: quarters, surprise, today: "2026-11-04" }); // prettier-ignore
    expect(c.past.at(-1)).toMatchObject({ date: "2026-11-03", pending: true, consensus: 2.49 });
    expect(c.stats.n).toBe(3);
  });

  it("destaques nos próximos 7 dias, resto na janela e passado em ordem cronológica", () => {
    const mk = (sym, date, past, theme = "GPUs") =>
      buildCompany({ sym, themes: [theme], cal: { ...cal, sym, date }, forecast: quarters, surprise: past }); // prettier-ignore
    const list = [
      mk("AAA", "2026-11-20", [{ date: "2026-10-20", eps: 1, consensus: 1, surprisePct: 0 }]),
      mk("BBB", "2026-11-06", [{ date: "2026-10-10", eps: 1, consensus: 1, surprisePct: 2 }]),
      mk("CCC", "2027-03-01", [], "Memória"),
    ];
    const v = earningsView(list, { today: "2026-11-04", win: "30" });
    expect(v.soon.map((c) => c.sym)).toEqual(["BBB"]);
    expect(v.upcoming.map((c) => c.sym)).toEqual(["AAA"]);
    expect(v.past.map((p) => p.sym)).toEqual(["BBB", "AAA"]);
    expect(earningsView(list, { today: "2026-11-04", win: "all", theme: "Memória" }).upcoming.map((c) => c.sym)).toEqual(["CCC"]); // prettier-ignore
    expect(earningsView(list, { today: "2026-11-04", only: "held", held: new Set(["AAA"]) }).upcoming).toHaveLength(1); // prettier-ignore
    expect(daysUntil("2026-11-06", "2026-11-04")).toBe(2);
    expect(["forte", "neutro", "fraco"]).toContain(setupOf(list[0]));
  });

  it("tela renderiza destaques, tabela e passado; Agenda alterna as visões", () => {
    const c = buildCompany({ sym: "NVDA", themes: ["GPUs"], cal, forecast: quarters, surprise });
    const html = viewEarnings({ data: { companies: [c], themes: ["GPUs"] }, today: "2026-11-14" });
    expect(html).toContain("Próximos 7 dias");
    expect(html).toContain('data-sym="NVDA"');
    expect(html).toContain("depois do fechamento");
    expect(viewEarnings({})).toContain("Carregando");
    expect(viewCalendar({ view: "earn", earnings: {} })).toContain("Balanços tech");
    expect(viewCalendar({ cal: { events: [], corporate: [] } })).toContain("Agenda econômica");
  });
});
