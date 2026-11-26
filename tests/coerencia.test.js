// Coerência: a variação do dia de um ativo é a MESMA em todas as telas (tabela, painel, carteira, Onshore).
// Caso real de 30/10/2026: Brent na tabela −0,19%, no painel +1,88% e no botão 1D +2,6%.
import { describe, expect, it } from "vitest";
import { isEveningFutBar, isFutMeta } from "../assets/futures.js";
import { parseChart } from "../api/history.js";
import { parseChart as parseIntraday } from "../api/intraday.js";
import { applyLiveToFlow } from "../assets/live.js";
import { mergeLive } from "../assets/br.js";
import { intradaySeries, windowReturns } from "../assets/asset-pop.js";

const at = (iso) => Date.parse(iso) / 1000;

describe("fonte: barra da noite dos futuros", () => {
  // 29/10 00:00 NY = ajuste 110,80; 29/10 18:00 NY = sessão de 30/10 já negociando (113,84)
  const json = (type = "FUTURE") => ({
    chart: { result: [{
      meta: { symbol: "BZF27.NYM", instrumentType: type, exchangeTimezoneName: "America/New_York" },
      timestamp: [at("2026-10-28T04:00:00Z"), at("2026-10-29T04:00:00Z"), at("2026-10-29T22:00:00Z")],
      indicators: { quote: [{ close: [111.64, 110.8, 113.84] }] },
    }] },
  }); // prettier-ignore
  it("descarta a última barra carimbada às 18:00 (pregão de amanhã); o ajuste de 29/10 fica", () => {
    const p = parseChart(json());
    expect(p.dates).toEqual(["2026-10-28", "2026-10-29"]);
    expect(p.close).toEqual([111.64, 110.8]);
  });
  it("ações e ETFs não são afetados", () => {
    expect(parseChart(json("ETF")).close).toHaveLength(3);
  });
  it("regra pura", () => {
    expect(isEveningFutBar(at("2026-10-29T22:00:00Z"), "America/New_York", true)).toBe(true);
    expect(isEveningFutBar(at("2026-10-29T04:00:00Z"), "America/New_York", true)).toBe(false);
    expect(isEveningFutBar(at("2026-10-29T22:00:00Z"), "America/New_York", false)).toBe(false);
    expect(isFutMeta({ symbol: "BZ=F" })).toBe(true);
    expect(isFutMeta({ symbol: "SPY", instrumentType: "ETF" })).toBe(false);
  });
});

describe("app: variação do dia = preço ÷ fechamento anterior oficial da cotação", () => {
  const flow = { dates: ["2026-10-28", "2026-10-29"], close: { "BZ=F": [111.64, 113.84], SPY: [772.31, 769.36] }, last_real: {} }; // prettier-ignore
  const live = {
    quotes: {
      SPY: { p: 754, pc: 769.36, t: at("2026-10-30T18:00:00Z") },
      "BZ=F": { p: 113.54, pc: 110.8, t: at("2026-10-30T18:00:00Z") },
    },
  };
  it("tabela (flow/prices + ao vivo) usa o pc da cotação", () => {
    const r = applyLiveToFlow(flow, live);
    const s = r.table.close["BZ=F"];
    expect(s.at(-1) / s.at(-2) - 1).toBeCloseTo(113.54 / 110.8 - 1, 10); // +2,47%, não −0,19%
    expect(r.fixedPrev.map((x) => x.code)).toEqual(["BZ=F"]);
    expect(windowReturns(s, live.quotes["BZ=F"])["1D"]).toBeCloseTo(s.at(-1) / s.at(-2) - 1, 10);
  });
  it("Onshore (br.js) usa o mesmo pc", () => {
    const m = mergeLive({ dates: ["2026-10-29"], close: [113.84] }, { p: 113.54, pc: 110.8, t: at("2026-10-30T15:00:00Z") }); // prettier-ignore
    expect(m.close).toEqual([110.8, 113.54]);
  });
  it("diferença absurda (dado quebrado) não mexe na base", () => {
    const r = applyLiveToFlow(
      { dates: ["2026-10-29"], close: { X: [100] } },
      { quotes: { SPY: live.quotes.SPY, X: { p: 72, pc: 70, t: live.quotes.SPY.t } } },
    );
    expect(r.table.close.X).toEqual([100, 72]);
  });
  it("gráfico 1D do painel: linha 'Fechamento anterior' = pc da cotação", () => {
    const j = { gmtoffset: -14400, bars: { t: [at("2026-10-30T13:30:00Z"), at("2026-10-30T13:35:00Z")], c: [112, 113] } }; // prettier-ignore
    const s = intradaySeries(j, 1, { p: 113.54, pc: 110.8 }, at("2026-10-30T13:40:00Z"));
    expect(s.ref).toBe(110.8);
    expect(s.close.at(-1)).toBe(113.54);
  });
});

describe("intradiário: pré/pós só em ações e ETFs", () => {
  const mk = (type, symbol) => ({
    chart: { result: [{
      meta: { symbol, instrumentType: type, gmtoffset: -14400 },
      timestamp: [at("2026-10-30T09:00:00Z"), at("2026-10-30T14:00:00Z")],
      indicators: { quote: [{ open: [1, 1], high: [1, 1], low: [1, 1], close: [1, 1], volume: [0, 0] }] },
    }] },
  }); // prettier-ignore
  it("futuro: tudo pregão (sem tracejado de pré/pós)", () => {
    expect(parseIntraday(mk("FUTURE", "BZF27.NYM"), true).bars.s).toEqual(["reg", "reg"]);
  });
  it("ETF: pré e pregão", () => {
    expect(parseIntraday(mk("ETF", "CIBR"), true).bars.s).toEqual(["pre", "reg"]);
  });
});
