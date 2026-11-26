import { describe, expect, it } from "vitest";
import { GROUPS, MARKETS, TABS, TAB_INFO, isOnshore, marketOf } from "../assets/state.js";
import { subNavHtml } from "../assets/ui.js";
import {
  classifyBR,
  dedupeBR,
  normalizeNasdaqEcoBR,
  normalizeNasdaqEco,
} from "../assets/macro-alerts.js";
import { brFlow } from "../assets/br.js";
import { viewNews } from "../assets/news-view.js";
import { viewBrCalendar } from "../assets/br-views.js";

describe("Mercados: Offshore × Onshore", () => {
  it("os dois lados têm as mesmas sete telas, na mesma ordem e com os mesmos nomes", () => {
    const name = Object.fromEntries(TABS);
    const [off, on] = MARKETS;
    expect(off.tabs.map((t) => name[t])).toEqual([
      "Visão geral",
      "Macro",
      "Juros",
      "Notícias",
      "Agenda",
      "Fluxo",
      "Watchlist",
    ]);
    expect(on.tabs.map((t) => name[t])).toEqual(off.tabs.map((t) => name[t]));
    const g = GROUPS.find((x) => x.id === "market");
    expect(g.label).toBe("Mercados");
    expect(g.tabs).toEqual([...off.tabs, ...on.tabs]);
    for (const t of g.tabs) expect(TAB_INFO[t]).toMatch(/^(Offshore|Onshore) · /);
  });
  it("marketOf e isOnshore", () => {
    expect(marketOf("calendar").id).toBe("off");
    expect(marketOf("brcal").id).toBe("on");
    expect(marketOf("portfolio")).toBeNull();
    expect(isOnshore("local")).toBe(true);
    expect(isOnshore("dash")).toBe(false);
  });
  it("sub-navegação: lados no topo e só as telas do lado aberto; o outro lado lembra a última tela", () => {
    const html = subNavHtml(GROUPS, TABS, TAB_INFO, "brnews", {
      groupLast: { "market:off": "flow" },
    });
    expect(html).toContain('class="mkt-side" role="tab" data-tab="flow" aria-selected="false"');
    expect(html).toContain('data-tab="brnews" aria-selected="true"><span class="mkt-flag"');
    expect(html).toContain('data-tab="local"');
    expect(html).not.toContain('data-tab="brcal"'); // Agenda do Onshore está no Laboratório › Arquivo
    expect(html).not.toContain('class="subtab" role="tab" data-tab="calendar"');
  });
});

describe("agenda do Brasil (Nasdaq)", () => {
  const rows = [
    { country: "Brazil", gmt: "08:00", eventName: "IPCA-15 Mid-Month CPI YoY", actual: "4.9%", consensus: "5.0%", previous: "5.1%" },
    { country: "Brazil", gmt: "17:30", eventName: "Interest Rate Decision", actual: "", consensus: "15%", previous: "15%" },
    { country: "Brazil", gmt: "08:00", eventName: "Something Odd", actual: "", consensus: "", previous: "" },
    { country: "United States", gmt: "08:30", eventName: "CPI YoY", actual: "3%", consensus: "3%", previous: "3%" },
  ]; // prettier-ignore
  it("classifica os indicadores do Brasil e ignora os outros países", () => {
    const ev = normalizeNasdaqEcoBR(rows, "2026-10-28");
    expect(ev).toHaveLength(3);
    expect(ev[0]).toMatchObject({
      cc: "BRL",
      label: "IPCA-15 (prévia da inflação) a/a",
      impact: "high",
      actual: "4.9%",
    });
    expect(ev[1]).toMatchObject({
      label: "Decisão de juros do Copom (Selic)",
      impact: "high",
      actual: null,
    });
    expect(ev[2]).toMatchObject({ label: "Something Odd", impact: "low" });
    expect(classifyBR("Inflation Rate YoY").label).toBe("Inflação (IPCA) a/a");
  });
  it("o Brasil não entra na agenda Offshore nem nos avisos push", () => {
    expect(normalizeNasdaqEco(rows, "2026-10-28").every((e) => e.cc !== "BRL")).toBe(true);
  });
  it("a tela filtra por impacto", () => {
    const now = Date.parse("2026-10-28T12:00:00Z") / 1000;
    const cal = { events: normalizeNasdaqEcoBR(rows, "2026-10-29"), corporate: [], released: [] };
    const hi = viewBrCalendar({ cal, min: "high", now });
    expect(hi).toContain("Copom");
    expect(hi).not.toContain("Something Odd");
    expect(viewBrCalendar({ cal, min: "all", now })).toContain("Something Odd");
  });
});

describe("brFlow", () => {
  it("pressão = variação × volume relativo; setores ordenados; estrangeiro pelo EWZ", () => {
    const close = {
      "^BVSP": [100, 100, 100, 100, 100, 101],
      "PETR4.SA": [10, 10, 10, 10, 10, 10.5],
      "VALE3.SA": [10, 10, 10, 10, 10, 9.8],
      EWZ: [30, 30, 30, 30, 30, 30.3],
    };
    const quotes = {
      "PETR4.SA": { v: 300, av: 100 },
      "VALE3.SA": { v: 200, av: 100 },
      EWZ: { v: 150, av: 100 },
    };
    const f = brFlow(close, quotes);
    expect(f.sectors[0].key).toBe("oil");
    expect(f.sectors.at(-1).key).toBe("min");
    expect(f.inflow[0].sym).toBe("PETR4.SA");
    expect(f.inflow[0].p).toBeCloseTo(0.15, 9);
    expect(f.outflow[0].sym).toBe("VALE3.SA");
    expect(f.unusual.map((x) => x.sym)).toEqual(["PETR4.SA", "VALE3.SA"]);
    expect(f.volDay).toBeCloseTo(2.5, 9);
    expect(f.ewz.rv).toBeCloseTo(1.5, 9);
  });
});

describe("Notícias por lado", () => {
  const news = {
    items: [
      {
        id: 1,
        title: "Ibovespa sobe com Petrobras",
        region: "br",
        source: "Valor",
        link: "x",
        t: 1,
      },
      {
        id: 2,
        title: "Fed holds rates, stocks rally",
        region: "int",
        source: "CNBC",
        link: "y",
        t: 1,
      },
    ],
  };
  it("Onshore só mostra o Brasil e Offshore só o internacional", () => {
    const br = viewNews({ news, region: "br", filter: "all", tags: null });
    expect(br).toContain("Ibovespa");
    expect(br).not.toContain("Fed holds");
    expect(br).not.toContain("Resumo do fds");
    const int = viewNews({ news, region: "int", filter: "br", tags: null });
    expect(int).toContain("Fed holds");
    expect(int).not.toContain("Ibovespa sobe");
  });
});

describe("agenda do Brasil: dados reais da Nasdaq", () => {
  it("dívida/PIB é fiscal (não PIB), feriado vira Feriado e fluxo cambial é reconhecido", () => {
    expect(classifyBR("Gross Debt-to-GDP ratio")).toMatchObject({
      label: "Resultado fiscal e dívida",
      impact: "medium",
    });
    expect(classifyBR("Brazil - All Souls' Day")).toMatchObject({ impact: "holiday" });
    expect(classifyBR("Foreign Exchange Flows").label).toBe("Fluxo cambial (BCB)");
    expect(classifyBR("Mid-Month CPI").label).toBe("IPCA-15 (prévia da inflação)");
  });
  it("dedupeBR junta a repetição em dias seguidos, mas não eventos semanais", () => {
    const e = (date, t, extra = {}) => ({
      date,
      t,
      name: "Budget Balance",
      consensus: null,
      previous: "-1B",
      ...extra,
    });
    expect(dedupeBR([e("2026-10-30", 100), e("2026-10-31", 100 + 86400)])).toHaveLength(1);
    expect(dedupeBR([e("2026-10-27", 100), e("2026-11-03", 100 + 7 * 86400)])).toHaveLength(2);
  });
});
