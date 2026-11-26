import { describe, expect, it } from "vitest";
import { addDays, brDay, dayReport, historyCard, historyIndex } from "../assets/pf-history.js";

const snap = (px, onTotal = 1000) => ({
  onshore: { total: onTotal, items: [{ name: "CDB X 2027-01-04", value: onTotal, cost: 900 }] },
  offshore: {
    totalUsd: 200,
    totalBrl: 1000,
    investedUsd: 2 * px,
    cashUsd: 200 - 2 * px,
    positions: [{ sym: "SPY", qty: 2, avg: 50, price: px, value: 2 * px }],
  },
  fx: { ptax: 5 },
});
const hist = [
  { as_of: "2026-11-23T02:19:02Z", total_brl: 1500 }, // 22/11 em Brasília
  { as_of: "2026-11-23T22:24:23Z", total_brl: 1800 },
  { as_of: "2026-11-23T23:44:50Z", total_brl: 1900 },
];
const daily = [
  { day: "2026-11-24", as_of: "2026-11-24T23:22:57Z", summary: snap(50) },
  { day: "2026-11-25", as_of: "2026-11-25T10:10:38Z", summary: snap(60), carried: false },
];

describe("posição histórica", () => {
  it("data de Brasília e soma de dias", () => {
    expect(brDay("2026-11-23T02:19:02Z")).toBe("2026-11-22");
    expect(addDays("2026-11-30", 1)).toBe("2026-12-01");
  });
  it("índice junta totais antigos e fotos completas, um por dia (a última vence)", () => {
    const ix = historyIndex(daily, hist);
    expect(ix.map((x) => x.day)).toEqual(["2026-11-22", "2026-11-23", "2026-11-24", "2026-11-25"]);
    expect(ix[1].total).toBe(1900);
    expect(ix[1].row).toBeNull();
    expect(ix[2].total).toBe(2000);
  });
  it("relatório do dia: variação contra o dia anterior e preço contra a foto anterior", () => {
    const r = dayReport(historyIndex(daily, hist), "2026-11-25");
    expect(r.exact).toBe(true);
    expect(r.d).toBe(0);
    expect(r.v.positions[0].chg).toBeCloseTo(0.2);
    expect(r.v.offPL).toBe(20);
    expect(r.v.onPL).toBe(100);
  });
  it("dia sem leitura usa a última foto antes dele; antes do início não há relatório", () => {
    const ix = historyIndex(daily, hist);
    const r = dayReport(ix, "2026-11-28");
    expect(r.exact).toBe(false);
    expect(r.shown).toBe("2026-11-25");
    expect(dayReport(ix, "2026-11-01")).toBeNull();
  });
  it("cartão: fechado mostra a barra; aberto mostra posições ou só o total", () => {
    const ix = historyIndex(daily, hist);
    expect(historyCard(ix, null, "2026-11-25")).toContain("SPY");
    expect(historyCard(ix, null, "2026-11-25")).not.toContain(">Hoje<");
    expect(historyCard(ix, "2026-11-24", "2026-11-25")).toContain(">Hoje<");
    expect(historyCard(ix, "2026-11-25", "2026-11-25")).toContain("SPY");
    expect(historyCard(ix, "2026-11-23", "2026-11-25")).toContain("só o total");
    expect(historyCard([], "2026-11-25", "2026-11-25")).toContain("Sem foto das posições");
  });
});
