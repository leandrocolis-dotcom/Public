import { describe, it, expect } from "vitest";
import { parseWatchlist, normSym, benchOf, dailyTail, watchLists, activeList, newList, renameList, deleteList, mergeItems, removeItem, itemsOf, MAX_LISTS } from "../assets/watchlist.js"; // prettier-ignore

describe("parser da watchlist", () => {
  it("tabela da watchlist do Investing copiada (com cabeçalho)", () => {
    const txt = [
      "\tName\tSymbol\tLast\tHigh\tLow\tChg.\tChg. %\tVol.\tTime",
      "\tS&P 500 VIX\tVIX\t25.87\t26.10\t17.20\t+9.30\t+56.13%\t\t16:15:00",
      "\t2x Long VIX Futures\tUVIX\t49.38\t50.10\t33.10\t+16.27\t+49.12%\t60.1M\t16:00:00",
      "\tTradr 2X Short SNDK Daily\tSNDQ\t34.28\t35.00\t25.00\t+9.69\t+39.41%\t1.2M\t16:00:00",
    ].join("\n");
    const r = parseWatchlist(txt);
    expect(r.items.map((x) => x.sym)).toEqual(["^VIX", "UVIX", "SNDQ"]);
    expect(r.items[1].name).toBe("2x Long VIX Futures");
    expect(r.aliased).toEqual([["VIX", "^VIX"]]);
  });
  it("mesma tabela sem cabeçalho (Nome, Código, Último…)", () => {
    const r = parseWatchlist(
      "S&P 500 VIX\tVIX\t25.87\t+56.13%\n2x Long VIX Futures\tUVIX\t49.38\t+49.12%",
    );
    expect(r.items.map((x) => x.sym)).toEqual(["^VIX", "UVIX"]);
  });
  it("lista solta de tickers, B3 sem sufixo, classe de ação e repetidos", () => {
    const r = parseWatchlist("aapl, msft; NVDA\nPETR4 VALE3 brk.b AAPL");
    expect(r.items.map((x) => x.sym)).toEqual(["AAPL", "MSFT", "NVDA", "PETR4.SA", "VALE3.SA", "BRK-B"]); // prettier-ignore
  });
  it("ticker com nota (2 colunas)", () => {
    const r = parseWatchlist("NVDA\tsetup de rompimento\nTSLA  esperar balanço");
    expect(r.items).toEqual([
      { sym: "NVDA", note: "setup de rompimento" },
      { sym: "TSLA", note: "esperar balanço" },
    ]);
  });
  it("tabela própria com Ticker / Nome / Nota", () => {
    const r = parseWatchlist("Ticker\tNome\tNota\nSMH\tSemicondutores\tcompra no suporte");
    expect(r.items).toEqual([{ sym: "SMH", name: "Semicondutores", note: "compra no suporte" }]);
  });
  it("lixo é ignorado; sem limite de ativos por lista", () => {
    expect(parseWatchlist("!!! ???").ignored).toHaveLength(1);
    const many = Array.from({ length: 500 }, (_, i) => `T${i}`).join(" ");
    const r = parseWatchlist(many);
    expect(r.items).toHaveLength(500);
    expect(r.cut).toBe(0);
    const l = mergeItems({ id: "a", name: "A", syms: [] }, r.items);
    expect(l.syms).toHaveLength(500);
  });
  it("normSym e benchmark", () => {
    expect(normSym("spx")).toBe("^GSPC");
    expect(normSym("$aapl")).toBe("AAPL");
    expect(normSym("")).toBeNull();
    expect(benchOf("PETR4.SA")).toBe("^BVSP");
    expect(benchOf("AAPL")).toBe("SPY");
  });
});

describe("listas em abas (mesmo formato da aba Sinais de hoje)", () => {
  it("sempre há uma lista; criar, renomear, apagar, juntar e tirar", () => {
    let ls = watchLists({});
    expect(ls).toHaveLength(1);
    ls = newList(ls, "Tech");
    expect(ls.at(-1)).toMatchObject({ name: "Tech", syms: [] });
    const id = ls.at(-1).id;
    expect(activeList({ watchlists: ls, watchActive: id }).name).toBe("Tech");
    ls = renameList(ls, id, "  Tecnologia ");
    expect(ls.at(-1).name).toBe("Tecnologia");
    let l = mergeItems(ls.at(-1), [{ sym: "AAPL", name: "Apple" }, { sym: "MSFT" }]);
    l = mergeItems(l, [{ sym: "AAPL", note: "x" }, { sym: "NVDA" }]);
    expect(l.syms).toEqual(["AAPL", "MSFT", "NVDA"]); // o treino do Simulador lê `syms`
    expect(itemsOf(l)).toEqual([{ sym: "AAPL", name: "Apple", note: "x" }, { sym: "MSFT" }, { sym: "NVDA" }]); // prettier-ignore
    expect(mergeItems(l, [{ sym: "SMH" }], { replace: true })).toEqual({ ...l, syms: ["SMH"], meta: undefined }); // prettier-ignore
    const r = removeItem(l, "AAPL");
    expect(r.syms).toEqual(["MSFT", "NVDA"]);
    expect(r.meta.AAPL).toBeUndefined();
    expect(deleteList(deleteList(ls, id), ls[0].id)).toHaveLength(1); // nunca fica sem lista
  });
  it("lê as listas antigas da aba Sinais de hoje e respeita o limite de listas", () => {
    const old = [{ id: "a", name: "Antiga", syms: ["SPY", "QQQ"] }];
    expect(itemsOf(activeList({ watchlists: old }))).toEqual([{ sym: "SPY" }, { sym: "QQQ" }]);
    let ls = old;
    for (let i = 0; i < 10; i++) ls = newList(ls, `L${i}`) ?? ls;
    expect(ls).toHaveLength(MAX_LISTS);
  });
});

describe("rotação diária contra o benchmark", () => {
  const dates = Array.from({ length: 120 }, (_, i) => `2026-01-${String(i).padStart(3, "0")}`);
  const bench = { dates, close: dates.map(() => 100) };
  it("ativo subindo contra benchmark parado: força acima de 100", () => {
    const a = { dates, close: dates.map((_, i) => 100 * 1.004 ** i) };
    const t = dailyTail(a, bench, { points: 8, step: 5 });
    expect(t).toHaveLength(8);
    expect(t.at(-1).x).toBeGreaterThan(100);
    expect(t.at(-1).date).toBe(dates.at(-1));
  });
  it("alinha pelas datas e devolve vazio com histórico curto", () => {
    const a = { dates: dates.slice(0, 30), close: dates.slice(0, 30).map(() => 50) };
    expect(dailyTail(a, bench)).toEqual([]);
    expect(dailyTail(null, bench)).toEqual([]);
  });
});

import {
  currentSession,
  passFilter,
  toggleFilter,
  normFilter,
  filterActive,
} from "../assets/watchlist.js";

describe("sessão atual (coluna única)", () => {
  const at = (iso) => Date.parse(iso) / 1000; // horário de NY em novembro = UTC−5
  it("pré, pregão, pós e fora do horário", () => {
    expect(currentSession(at("2026-11-11T13:00:00Z"))).toEqual({ id: "pre", live: true }); // 8h NY
    expect(currentSession(at("2026-11-11T15:00:00Z"))).toEqual({ id: "reg", live: true }); // 10h
    expect(currentSession(at("2026-11-11T22:00:00Z"))).toEqual({ id: "post", live: true }); // 17h
    expect(currentSession(at("2026-11-12T02:00:00Z"))).toEqual({ id: "post", live: false }); // 21h
    expect(currentSession(at("2026-11-11T07:00:00Z"))).toEqual({ id: "post", live: false }); // 2h
  });
  it("fim de semana, feriado e pregão encurtado", () => {
    expect(currentSession(at("2026-11-14T15:00:00Z"))).toEqual({ id: "post", live: false }); // sábado
    const hol = () => ({ open: false });
    expect(currentSession(at("2026-11-26T15:00:00Z"), hol)).toEqual({ id: "post", live: false });
    const early = () => ({ open: true, closeMin: 780 });
    expect(currentSession(at("2026-11-27T19:00:00Z"), early)).toEqual({ id: "post", live: true }); // 14h
  });
});

describe("filtros da watchlist", () => {
  const rows = [
    { sym: "A", quadrant: "Liderando", level: "fast", vy: 0.4 },
    { sym: "B", quadrant: "Ganhando força", level: "slow", vy: -0.2 },
    { sym: "C", quadrant: "Atrasado", level: "vfast", vy: 1.1 },
    { sym: "D" },
  ];
  const run = (f) => rows.filter((r) => passFilter(r, f)).map((r) => r.sym);
  it("sem filtro passa tudo", () => {
    expect(run({})).toEqual(["A", "B", "C", "D"]);
    expect(filterActive(null)).toBe(false);
  });
  it("OU dentro da coluna, E entre colunas", () => {
    expect(run({ q: ["Liderando", "Atrasado"] })).toEqual(["A", "C"]);
    expect(run({ mo: ["up"] })).toEqual(["A", "C"]);
    expect(run({ q: ["Liderando", "Atrasado"], lv: ["vfast"] })).toEqual(["C"]);
  });
  it("toggle liga e desliga; valores estranhos somem", () => {
    let f = toggleFilter(null, "q:Liderando");
    expect(f.q).toEqual(["Liderando"]);
    f = toggleFilter(f, "q:Liderando");
    expect(f.q).toEqual([]);
    expect(normFilter({ q: ["x"], lv: ["fast", "fast"], mo: "up" })).toEqual({
      q: [],
      lv: ["fast"],
      mo: [],
    });
  });
});
