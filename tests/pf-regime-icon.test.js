import { describe, it, expect, vi } from "vitest";

vi.mock("../assets/regime-watch.js", () => ({
  shiftOf: (sym) =>
    sym === "AAA"
      ? {
          sym,
          from: { label: "Manter" },
          to: { label: "Reduzir", day: -0.012 },
          why: ["perdeu a MM200"],
        }
      : null,
}));

const { viewPortfolio } = await import("../assets/portfolio-view.js");

const row = (sym) => ({ sym, name: sym, qty: 1, avg: 10, price: 11, value: 11, weight: 0.5, dayPLPct: 0, dayPL: 0, netPLPct: 0.1, netPL: 1, live: true }); // prettier-ignore
const ctx = (sigOpen = {}) => ({
  portfolio: { holdings: [{ sym: "AAA" }, { sym: "BBB" }] },
  valuation: { rows: [row("AAA"), row("BBB")], total: 22, cost: 20, dayPL: 0, dayPLPct: 0, netPL: 2, netPLPct: 0.1, missingQuotes: [], leveragedWeight: 0 }, // prettier-ignore
  signals: [],
  sigOpen,
});

describe("Carteira: mudança de regime vira ícone na linha", () => {
  it("mostra ↘ só na linha do ativo que piorou, sem o quadro separado", () => {
    const h = viewPortfolio(ctx());
    expect(h).not.toContain("regime-alert");
    expect((h.match(/pf-si rs/g) ?? []).length).toBe(1);
    expect(h).toContain('data-pf-sig="AAA"');
    expect(h).not.toContain('data-pf-sig="BBB"');
  });
  it("o toque abre o detalhe do regime no balão", () => {
    const h = viewPortfolio(ctx({ AAA: true }));
    expect(h).toContain("Regime piorou: Manter → Reduzir");
    expect(h).toContain("perdeu a MM200");
  });
});
