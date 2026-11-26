import { describe, expect, it } from "vitest";
import { ALL, activeList, deskRow, filterRows, sortRows } from "../assets/desk.js";
import { state } from "../assets/state.js";
import { analyzeTicker } from "../assets/integrated.js";

function item(n = 300, drift = 0.1) {
  const c = Array.from({ length: n }, (_, i) => 100 + i * drift + 3 * Math.sin(i / 4));
  return { bars: { c, o: c, h: c.map((x) => x + 0.5), l: c.map((x) => x - 0.5), v: c.map(() => 1e6), dates: c.map((_, i) => `2025-${String(i).padStart(4, "0")}`) }, fund: null }; // prettier-ignore
}

describe("painel de decisões", () => {
  const r = analyzeTicker("AAA", item());
  it("linha junta decisão, médio prazo, sinais e usa a cotação ao vivo", () => {
    const row = deskRow("AAA", { r, quote: { p: 135, pc: 134 }, hold: null, market: {} });
    expect(row.price).toBe(135);
    expect(row.day).toBeCloseTo(135 / 134 - 1);
    expect(row.dec.final.step.label).toBeTruthy();
    expect(Array.isArray(row.sigs)).toBe(true);
  });
  it("sem posição nunca sugere ampliar/reduzir", () => {
    for (const p of [120, 125, 130, 133, 136, 140]) {
      const row = deskRow("AAA", { r, quote: { p }, hold: null, market: {} });
      if (row.alert) expect(row.alert.action).not.toMatch(/Ampliar|Reduzir/);
    }
  });
  it("sem dados vira linha 'missing' e vai para o fim", () => {
    const rows = sortRows([
      deskRow("ZZZ", {}),
      deskRow("AAA", { r, quote: { p: 135 }, market: {} }),
    ]);
    expect(rows.at(-1).missing).toBe(true);
  });
});

describe("filtros dos balões e visão global", () => {
  const rows = [
    { sym: "A", dec: { final: { step: { tone: "buy" } } }, alert: null, sigs: [] },
    { sym: "B", dec: { final: { step: { tone: "sell" } } }, alert: { tone: "sell" }, sigs: [{}] },
    { sym: "C", dec: { final: { step: { tone: "wait" } } }, alert: null, sigs: [] },
    { sym: "Z", missing: true },
  ];
  it("cada balão filtra só as linhas da sua contagem", () => {
    expect(filterRows(rows, "buy").map((r) => r.sym)).toEqual(["A"]);
    expect(filterRows(rows, "sell").map((r) => r.sym)).toEqual(["B"]);
    expect(filterRows(rows, "wait").map((r) => r.sym)).toEqual(["C"]);
    expect(filterRows(rows, "near").map((r) => r.sym)).toEqual(["B"]);
    expect(filterRows(rows, "sig").map((r) => r.sym)).toEqual(["B"]);
  });
  it("sem filtro devolve tudo", () => {
    expect(filterRows(rows, null)).toHaveLength(4);
  });
  it("'Todas' junta carteira e watchlists sem repetir ticker", () => {
    const prev = { ...state.prefs };
    state.prefs.watchlists = [
      { id: "w1", name: "Tech", syms: ["AAPL", "MSFT"] },
      { id: "w2", name: "Div", syms: ["MSFT", "KO"] },
    ];
    state.prefs.deskList = ALL;
    const l = activeList();
    expect(l.global).toBe(true);
    expect(l.syms.filter((s) => s === "MSFT")).toHaveLength(1);
    expect(l.syms).toEqual(expect.arrayContaining(["AAPL", "MSFT", "KO"]));
    state.prefs.deskList = "w1";
    expect(activeList().syms).toEqual(["AAPL", "MSFT"]);
    Object.assign(state.prefs, prev);
  });
});

describe("adicionar ativo a uma watchlist", async () => {
  const { addToList } = await import("../assets/desk.js");
  it("cria lista nova, acrescenta sem repetir e valida", () => {
    state.prefs.watchlists = [];
    const l = addToList("aapl", { name: "Tech" });
    expect(l.syms).toEqual(["AAPL"]);
    expect(addToList("MSFT", { id: l.id }).syms).toEqual(["AAPL", "MSFT"]);
    expect(addToList("MSFT", { id: l.id }).syms).toEqual(["AAPL", "MSFT"]);
    expect(addToList("NVDA", { name: "tech" }).syms).toEqual(["AAPL", "MSFT", "NVDA"]);
    expect(addToList("NVDA", {}).error).toBeTruthy();
    expect(state.prefs.watchlists).toHaveLength(1);
  });
});

import { applyColFilters, colOrder, moveCol } from "../assets/desk.js";
describe("colunas e filtros da tabela", () => {
  it("move a coluna para o lugar da outra e completa a ordem salva", () => {
    const o = colOrder([]);
    expect(moveCol(o, "sigs", "dec").indexOf("sigs")).toBe(o.indexOf("dec"));
    expect(colOrder(["level", "xxx"])[0]).toBe("level");
    expect(colOrder(["level"])).toHaveLength(o.length);
  });
  it("filtra pela decisão de agora", () => {
    const rows = [
      { sym: "A", dec: { now: { label: "Comprar", tone: "buy" } }, sigs: [] },
      { sym: "B", dec: { now: { label: "Aguardar", tone: "wait" } }, sigs: [1] },
    ];
    expect(applyColFilters(rows, { dec: "Comprar" }).map((r) => r.sym)).toEqual(["A"]);
    expect(applyColFilters(rows, { sig: "Com sinal" }).map((r) => r.sym)).toEqual(["B"]);
    expect(applyColFilters(rows, { dec: "" })).toHaveLength(2);
    expect(applyColFilters(rows, { dec: ["Comprar", "Aguardar"] })).toHaveLength(2);
    expect(applyColFilters(rows, { dec: ["Aguardar"] }).map((r) => r.sym)).toEqual(["B"]);
    expect(applyColFilters(rows, { dec: [] })).toHaveLength(2);
  });
});

describe("lente e busca na tabela", () => {
  const rows = [
    { sym: "AAA", name: "Alpha", dec: { now: { label: "Comprar" } }, sigs: [] },
    { sym: "BBB", name: "Beta Corp", dec: { now: { label: "Comprar" } }, sigs: [] },
    { sym: "CCC", name: "Gama", dec: { now: { label: "Comprar" } }, sigs: [] },
  ];
  const L = {
    x: {
      rank: new Map([
        ["CCC", 0],
        ["AAA", 1],
      ]),
      src: "teste",
    },
  };
  it("a lente filtra e ordena pela posição dela", () => {
    expect(applyColFilters(rows, { lens: "x" }, L).map((r) => r.sym)).toEqual(["CCC", "AAA"]);
  });
  it("busca por ticker ou nome", () => {
    expect(applyColFilters(rows, { q: "beta" }, L).map((r) => r.sym)).toEqual(["BBB"]);
    expect(applyColFilters(rows, { q: "cc" }, L).map((r) => r.sym)).toEqual(["CCC"]);
  });
});
