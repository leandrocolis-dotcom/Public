import { describe, expect, it } from "vitest";
import {
  attachActuals,
  classifyEvent,
  macroAlerts,
  macroSentence,
  normalizeNasdaqEco,
  num,
} from "../assets/macro-alerts.js";
import { alertsFor } from "../scripts/lib/push-alerts.mjs";

const ROWS = [
  { gmt: "08:30", country: "United States", eventName: "CPI (YoY)", actual: "3.1%", consensus: "3.0%", previous: "2.9%" },
  { gmt: "08:30", country: "United States", eventName: "Core CPI (MoM)", actual: "0.2%", consensus: "0.3%", previous: "0.3%" },
  { gmt: "05:00", country: "Euro Zone", eventName: "CPI (YoY)", actual: "", consensus: "2.1%", previous: "2.2%" },
  { gmt: "21:30", country: "China", eventName: "GDP (YoY)", actual: "4.8%", consensus: "4.8%", previous: "5.2%" },
  { gmt: "06:00", country: "Germany", eventName: "German Retail Sales (MoM)", actual: "1%", consensus: "", previous: "" },
  { gmt: "14:00", country: "Brazil", eventName: "CPI (YoY)", actual: "5%", consensus: "5%", previous: "" },
  { gmt: "18:00", country: "United States", eventName: "Fed Chair Speaks", actual: "", consensus: "", previous: "" },
]; // prettier-ignore
const NOW = Date.parse("2026-10-14T13:00:00Z") / 1000;

describe("dados macro divulgados", () => {
  const eco = normalizeNasdaqEco(ROWS, "2026-10-14");
  it("reconhece só os indicadores importantes dos países seguidos", () => {
    expect(eco.map((e) => e.id)).toEqual(["USD:cpi::yy", "USD:cpi:core:mm", "EUR:cpi::yy", "CNY:gdp::yy"]); // prettier-ignore
    expect(eco[0].t).toBe(Date.parse("2026-10-14T12:30:00Z") / 1000);
    expect(eco[2].actual).toBeNull();
  });
  it("frase com acima/abaixo/em linha da expectativa", () => {
    expect(macroSentence(eco[0])).toBe("Inflação (CPI) a/a nos EUA foi de 3,1%, acima da expectativa de mercado de 3,0% (anterior: 2,9%)."); // prettier-ignore
    expect(macroSentence(eco[1])).toMatch(/núcleo m\/m nos EUA foi de 0,2%, abaixo da expectativa/);
    expect(macroSentence(eco[3])).toMatch(/PIB a\/a na China foi de 4,8%, em linha/);
  });
  it("avisa só o que saiu nas últimas 6 h", () => {
    const a = macroAlerts(eco, NOW);
    expect(a.map((x) => `macro:${x.id}`)).toEqual(["macro:USD:cpi::yy", "macro:USD:cpi:core:mm"]);
    expect(a[0].title).toBe("📅 DADO MACRO · Inflação (CPI) a/a nos EUA");
  });
  it("entra nos avisos push e respeita o desligar e o já enviado", () => {
    const base = { holdings: [], flow: null, news: [], live: {}, global: null, eco, nowSec: NOW };
    const on = alertsFor(base).send;
    expect(on).toHaveLength(2);
    expect(alertsFor({ ...base, prefs: { macro: false } }).send).toHaveLength(0);
    expect(alertsFor({ ...base, sent: new Set([on[0].key]) }).send).toHaveLength(1);
  });
  it("números com sufixo e classificação no formato da Forex Factory", () => {
    expect(num("254K")).toBe(254000);
    expect(num("-1.2B")).toBe(-1.2e9);
    expect(num("")).toBeNull();
    expect(classifyEvent("USD", "Core CPI m/m").id).toBe("USD:cpi:core:mm");
    expect(classifyEvent("USD", "FOMC Meeting Minutes")).toBeNull();
    expect(classifyEvent("USD", "Federal Funds Rate").label).toBe("Decisão de juros do Fed");
  });
  it("leva o valor divulgado para a agenda", () => {
    const ev = [{ t: Date.parse("2026-10-14T12:30:00Z") / 1000, cc: "USD", title: "CPI y/y", forecast: "3.0%" }]; // prettier-ignore
    expect(attachActuals(ev, eco)[0].actual).toBe("3.1%");
  });
});

describe("histórico de dados divulgados", async () => {
  const { releasedHistory, kindOf } = await import("../assets/macro-alerts.js");
  const { releasedHtml } = await import("../assets/calendar-view.js");
  const eco = normalizeNasdaqEco(ROWS, "2026-10-14");
  const h = releasedHistory([...eco, ...eco], 50, NOW);
  it("só o que saiu, sem repetir, mais recente primeiro", () => {
    expect(h.map((e) => e.id)).toEqual(["USD:cpi::yy", "USD:cpi:core:mm", "CNY:gdp::yy"]);
    expect(kindOf("CNY:gdp::yy")).toBe("atividade");
  });
  it("recolhido por padrão e filtra país e tipo", () => {
    const all = releasedHtml(h);
    expect(all).toMatch(/<details class="card" id="cal-released">/);
    expect(all).not.toMatch(/<details[^>]*open/);
    const cn = releasedHtml(h, { cc: "CNY" });
    expect(cn).toMatch(/PIB a\/a/);
    expect(cn).not.toMatch(/CPI/);
    expect(releasedHtml(h, { kind: "inflacao" })).not.toMatch(/PIB/);
  });
});

describe("agenda só com o que vem e o que saiu hoje", async () => {
  const { viewCalendar } = await import("../assets/calendar-view.js");
  const now = Date.parse("2026-10-14T15:00:00Z") / 1000;
  const ev = (h, title, actual = null, day = 14) => ({ t: Date.parse(`2026-10-${day}T${h}:00Z`) / 1000, cc: "USD", title, titlePT: title, impact: "high", forecast: "1%", previous: null, actual }); // prettier-ignore
  const html = viewCalendar({ cal: { events: [ev("12:30", "CPI hoje", "0.3%"), ev("13:00", "Sem dado"), ev("12:30", "Ontem", "1%", 13), ev("18:00", "Depois")] }, min: "all", ccs: "USD", now }); // prettier-ignore
  it("mantém o de hoje (sem valor = aguardando) e tira os dias anteriores", () => {
    expect(html).toMatch(/CPI hoje/);
    expect(html).toMatch(/Depois/);
    expect(html).toMatch(/Sem dado[\s\S]*aguardando/);
    expect(html).not.toMatch(/Ontem/);
  });
});

describe("macro: impacto e carteira", async () => {
  const { exposure, symRegion } = await import("../assets/macro-alerts.js");
  const { ecoAll, dedupeEco } = await import("../api/push-alerts.js");
  const rows = [
    { gmt: "08:30", country: "United States", eventName: "CPI (YoY)", actual: "3.1%", consensus: "3.0%", previous: "2.9%" },
    { gmt: "08:30", country: "United States", eventName: "Initial Jobless Claims", actual: "220K", consensus: "215K", previous: "210K" },
    { gmt: "09:00", country: "Japan", eventName: "Industrial Production (MoM)", actual: "0.5%", consensus: "0.2%", previous: "0.1%" },
    { gmt: "08:00", country: "Brazil", eventName: "IPCA Inflation (YoY)", actual: "4.5%", consensus: "4.6%", previous: "4.7%" },
    { gmt: "08:00", country: "Brazil", eventName: "Consumer Confidence", actual: "90", consensus: "", previous: "89" },
  ]; // prettier-ignore
  const eco = dedupeEco(ecoAll(rows, "2026-10-14"));
  const T = Date.parse("2026-10-14T14:00:00Z") / 1000;
  it("região do ativo e peso na carteira", () => {
    expect(symRegion("EWZ")).toBe("BRL");
    expect(symRegion("PETR4.SA")).toBe("BRL");
    expect(symRegion("EWG")).toBe("DE");
    expect(symRegion("NVDA")).toBe("USD");
    const x = exposure([
      { sym: "SPY", invValue: 80 },
      { sym: "EWJ", invValue: 20 },
    ]);
    expect(x.USD.w).toBeCloseTo(0.8);
    expect(x.JPY.syms).toEqual(["EWJ"]);
  });
  it("sem carteira: só alto impacto (CPI EUA, IPCA); Brasil de baixo impacto nem entra", () => {
    expect(eco.some((e) => /confidence/i.test(e.name))).toBe(false);
    const a = macroAlerts(eco, T);
    expect(a.map((x) => `macro:${x.id}`)).toEqual(["macro:USD:cpi::yy", "macro:BR:ipca::yy"]);
    expect(a[1].url).toBe("./?tab=brcal");
  });
  it("com carteira: médio impacto da região exposta entra, com 💼 e os ativos, e vem primeiro", () => {
    const a = macroAlerts(eco, T, { holdings: [{ sym: "SPY", invValue: 70 }, { sym: "EWJ", invValue: 30 }] }); // prettier-ignore
    expect(a.map((x) => `macro:${x.id}`)).toEqual(["macro:USD:cpi::yy", "macro:USD:claims::", "macro:JPY:ip::mm", "macro:BR:ipca::yy"]); // prettier-ignore
    expect(a[0].title).toMatch(/💼 Inflação/);
    expect(a[2].body).toMatch(/Na carteira: EWJ \(30% da carteira\)/);
    expect(a[3].title).not.toMatch(/💼/);
  });
  it("macroAll: tudo, como antes", () => {
    expect(macroAlerts(eco, T, { all: true })).toHaveLength(4);
  });
});

describe("Nasdaq: dia seguinte, PCE sem período e componentes do PIB", async () => {
  const { nasdaqDate } = await import("../api/_eco.js");
  it("pede D + 1 para ler o dia D", () => {
    expect(nasdaqDate("2026-11-25")).toBe("2026-11-26");
    expect(nasdaqDate("2026-12-31")).toBe("2027-01-01");
  });
  const rows = [
    { gmt: "08:30", country: "United States", eventName: "Core PCE Price Index", actual: "0.2%", consensus: "0.3%", previous: "0.3%" },
    { gmt: "08:30", country: "United States", eventName: "Core PCE Price Index", actual: "3.1%", consensus: "3.2%", previous: "3.1%" },
    { gmt: "08:30", country: "United States", eventName: "GDP", actual: "3.6%", consensus: "3.4%", previous: "2.2%" },
    { gmt: "08:30", country: "United States", eventName: "GDP Price Index", actual: "2.2%", consensus: "2.2%", previous: "6.1%" },
  ]; // prettier-ignore
  const eco = normalizeNasdaqEco(rows, "2026-11-25");
  const T = Date.parse("2026-11-25T13:40:00Z") / 1000;
  it("componente do PIB vira médio impacto; manchete segue alta", () => {
    expect(eco.map((e) => e.impact)).toEqual(["high", "high", "high", "medium"]);
  });
  it("as duas linhas do PCE avisam (chaves diferentes) com valor × expectativa", () => {
    const a = macroAlerts(eco, T);
    expect(a).toHaveLength(3);
    expect(new Set(a.map((x) => x.key)).size).toBe(3);
    expect(a[0].body).toMatch(/foi de 0,2%, abaixo da expectativa de mercado de 0,3%/);
  });
  it("a agenda recebe o valor do PCE m/m e a/a pela projeção", () => {
    const t = Date.parse("2026-11-25T13:30:00Z") / 1000;
    const ev = [
      { t, cc: "USD", title: "Core PCE Price Index m/m", forecast: "0.3%", previous: "0.3%" },
      { t, cc: "USD", title: "Core PCE Price Index y/y", forecast: "3.2%", previous: "3.1%" },
    ];
    expect(attachActuals(ev, eco).map((e) => e.actual)).toEqual(["0.2%", "3.1%"]);
  });
});

describe("Yahoo: valor no minuto da divulgação", async () => {
  const { normalizeYahooEco, fillFromYahoo, fillConsensus, yahooName } =
    await import("../assets/eco-yahoo.js");
  const { releaseKey } = await import("../assets/macro-alerts.js");
  const ms = Date.parse("2026-11-25T13:30:00Z");
  const Y = { finance: { result: { economicEvents: [{ records: [
    { event: "Core PCE Price Index MM *", countryCode: "US", eventTime: ms, actual: "0.3", prior: "0.3" },
    { event: "Core PCE Price Index YY*", countryCode: "US", eventTime: ms, actual: "3.3", prior: "3.1" },
    { event: "PCE Price Index YY *", countryCode: "US", eventTime: ms, actual: "3.8", prior: "3.6", revisedFrom: "3.7" },
    { event: "GDP 2nd Estimate", countryCode: "US", eventTime: ms, actual: null, prior: "3.4" },
    { event: "Cold Pork Belly Stocks*", countryCode: "US", eventTime: ms, actual: "20" },
  ] }] } } }; // prettier-ignore
  const y = normalizeYahooEco(Y);
  it("nome no formato da agenda, só com valor, % nos indicadores em %", () => {
    expect(yahooName("Core PCE Price Index MM *")).toBe("Core PCE Price Index m/m");
    expect(y.map((e) => [e.id, e.actual, e.previous])).toEqual([["USD:pce:core:mm", "0.3%", "0.3%"], ["USD:pce:core:yy", "3.3%", "3.1%"], ["USD:pce::yy", "3.8%", "3.7%"]]); // prettier-ignore
  });
  const t = ms / 1000;
  const nas = [
    { t, date: "2026-11-25", cc: "USD", sub: null, id: "USD:pce:core:", label: "Inflação PCE núcleo", impact: "high", name: "Core PCE Price Index", actual: null, consensus: "0.3%", previous: "0.3%" },
    { t, date: "2026-11-25", cc: "USD", sub: null, id: "USD:pce:core:", label: "Inflação PCE núcleo", impact: "high", name: "Core PCE Price Index", actual: null, consensus: "3.2%", previous: "3.1%" },
  ]; // prettier-ignore
  it("a Nasdaq sem valor ganha o do Yahoo pelo anterior; o que a Nasdaq cobre não duplica", () => {
    const out = fillFromYahoo(nas, y);
    expect(out.slice(0, 2).map((e) => e.actual)).toEqual(["0.3%", "3.3%"]);
    expect(out.map((e) => e.id)).toEqual(["USD:pce:core:", "USD:pce:core:", "USD:pce::yy"]);
  });
  it("Nasdaq fora do ar: o Yahoo entra sozinho e a projeção vem da Forex Factory no mesmo período", () => {
    const ff = [
      { t, cc: "USD", title: "Core PCE Price Index m/m", forecast: "0.3%", previous: "0.3%" },
    ];
    const out = fillConsensus(fillFromYahoo([], y), ff);
    expect(out.map((e) => e.consensus)).toEqual(["0.3%", null, null]);
    const a = macroAlerts(out, t + 600);
    expect(a[0].body).toMatch(
      /núcleo m\/m nos EUA foi de 0,3%, em linha com a expectativa de mercado de 0,3%/,
    );
  });
  it("a chave do aviso é a mesma vindo da Nasdaq ou do Yahoo (sem push repetido)", () => {
    const viaNas = fillFromYahoo(nas, y)[0];
    expect(releaseKey(viaNas)).toBe(releaseKey({ ...y[0], date: "2026-11-25" }));
  });
});

describe("histórico: alto impacto de hoje fica na agenda", async () => {
  const { releasedHtml } = await import("../assets/calendar-view.js");
  const now = Date.parse("2026-11-25T15:00:00Z") / 1000;
  const r = (t, impact, label) => ({ t: Date.parse(t) / 1000, date: t.slice(0, 10), cc: "USD", id: "USD:pce::", label, impact, actual: "1%" }); // prettier-ignore
  it("sai do histórico hoje e entra amanhã", () => {
    const list = [r("2026-11-25T13:30:00Z", "high", "PCE hoje"), r("2026-11-25T13:30:00Z", "medium", "Médio hoje"), r("2026-11-24T13:30:00Z", "high", "Ontem")]; // prettier-ignore
    const h = releasedHtml(list, { now });
    expect(h).not.toMatch(/PCE hoje/);
    expect(h).toMatch(/Médio hoje/);
    expect(h).toMatch(/Ontem/);
  });
});

describe("várias linhas do mesmo indicador", () => {
  const t = Date.parse("2026-11-25T13:30:00Z") / 1000;
  const eco = normalizeNasdaqEco(
    [
      { gmt: "08:30", country: "United States", eventName: "Continuing Jobless Claims", actual: "1,697K", consensus: "", previous: "1,792K" },
      { gmt: "08:30", country: "United States", eventName: "Initial Jobless Claims", actual: "189K", consensus: "201K", previous: "202K" },
    ],
    "2026-11-25",
  ); // prettier-ignore
  it("a agenda pega a linha certa pela projeção (iniciais, não contínuos)", () => {
    const ev = [{ t, cc: "USD", title: "Unemployment Claims", forecast: "201K", previous: "203K" }];
    expect(attachActuals(ev, eco)[0].actual).toBe("189K");
  });
});
