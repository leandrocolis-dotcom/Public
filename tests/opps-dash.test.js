import { describe, expect, it } from "vitest";
import { oppBlocks } from "../assets/opps-dash.js";
import { marketMetrics } from "../assets/market.js";

const rows = [
  { sym: "A", name: "A", score: 4.9 },
  { sym: "B", name: "B", score: 4.6 },
  { sym: "C", name: "C", score: 1.1 },
  { sym: "D", name: "D", score: 3.0 },
];

describe("painel de oportunidades", () => {
  it("Quant: compra forte da maior nota para a menor; venda forte da menor para a maior", () => {
    const b = Object.fromEntries(oppBlocks({ quant: { rows, top: ["D"] }, champs: null, assets: [] }).map((x) => [x.id, x])); // prettier-ignore
    expect(b["q-buy"].items.map((x) => x.sym)).toEqual(["A", "B"]);
    expect(b["q-sell"].items.map((x) => x.sym)).toEqual(["C"]);
    expect(b.propicks.items.map((x) => x.sym)).toEqual(["D"]);
  });
  it("no máximo 20 por bloco", () => {
    const many = Array.from({ length: 30 }, (_, i) => ({ sym: `S${i}`, score: 4.6 + i / 100 }));
    const b = oppBlocks({ quant: { rows: many }, champs: null, assets: [] });
    expect(b.find((x) => x.id === "q-buy").items).toHaveLength(20);
  });
});

describe("métricas do universo de mercado", () => {
  it("calcula as métricas do Screener com 1 ano de fechamentos", () => {
    const close = Array.from({ length: 250 }, (_, i) => 100 + i);
    const dates = close.map((_, i) => new Date(Date.UTC(2025, 9, 13) + i * 864e5).toISOString().slice(0, 10)); // prettier-ignore
    const m = marketMetrics("X", { close, dates, name: "X Corp" }, { group: "Tecnologia" });
    expect(m.ok).toBe(true);
    expect(m.price).toBe(349);
    expect(m.ma200).toBeLessThan(m.price);
    expect(m.group).toBe("Tecnologia");
  });
  it("menos de 200 pregões fica de fora", () => {
    expect(marketMetrics("X", { close: [1, 2, 3], dates: ["a", "b", "c"] }).ok).toBe(false);
  });
});

describe("intraday no universo", () => {
  const close = Array.from({ length: 250 }, (_, i) => 100 + i * 0.1);
  const dates = close.map((_, i) => new Date(Date.UTC(2025, 9, 13) + i * 864e5).toISOString().slice(0, 10)); // prettier-ignore
  it("o preço ao vivo entra como pregão de hoje e mede o volume relativo", () => {
    const t = Date.UTC(2026, 9, 12, 16) / 1000;
    const m = marketMetrics("X", { close, dates }, {}, { p: 140, t, pc: 124.9, v: 3e6, av: 1e6 });
    expect(m.live).toBe(true);
    expect(m.price).toBe(140);
    expect(m.relVol).toBe(3);
    expect(m.price > m.h52).toBe(true);
  });
  it("blocos ⚡ só usam ativos com preço ao vivo", () => {
    const a = { code: "Z", ok: true, live: false, r1d: 0.1, price: 10, h52: 5, relVol: 5 };
    const b = oppBlocks({ quant: null, champs: null, assets: [a] });
    expect(b.find((x) => x.id === "i-up").items).toHaveLength(0);
    expect(b.find((x) => x.id === "i-up" && x.items.length === 0)).toBeTruthy();
    const b2 = oppBlocks({ quant: null, champs: null, assets: [{ ...a, live: true }] });
    expect(b2.find((x) => x.id === "i-up").items.map((x) => x.sym)).toEqual(["Z"]);
  });
});
