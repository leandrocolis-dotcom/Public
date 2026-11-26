import { describe, it, expect } from "vitest";
import {
  nyEpoch,
  usRefDate,
  priceAt,
  historySummary,
  regimeHistory,
  REGIME_SYMS,
  STALE,
} from "../assets/regime-history.js";

describe("como andou o regime: relógio de NY", () => {
  it("instante de um horário de NY (com horário de verão e de inverno)", () => {
    expect(new Date(nyEpoch("2026-11-20", 960) * 1000).toISOString()).toBe(
      "2026-11-20T21:00:00.000Z",
    );
    expect(new Date(nyEpoch("2026-07-15", 570) * 1000).toISOString()).toBe(
      "2026-07-15T13:30:00.000Z",
    );
  });
  it("referência = último fechamento regular de NY antes do instante", () => {
    const at = (iso) => usRefDate(Date.parse(iso) / 1000);
    expect(at("2026-11-20T12:00:00Z")).toBe("2026-11-19"); // pré de sexta: fechamento de quinta
    expect(at("2026-11-20T18:00:00Z")).toBe("2026-11-19"); // pregão de sexta
    expect(at("2026-11-20T22:00:00Z")).toBe("2026-11-20"); // pós de sexta
    expect(at("2026-11-22T15:00:00Z")).toBe("2026-11-20"); // domingo
    expect(at("2026-11-27T12:00:00Z")).toBe("2026-11-25"); // depois do feriado de Ação de Graças
  });
});

describe("como andou o regime: melhor preço em cada instante", () => {
  it("barra própria; parada, o futuro equivalente aplicado sobre ela", () => {
    const t = 1_000_000;
    const series = {
      SPY: { t: [t - 3 * 3600], c: [700] }, // última barra no pós, 3 h atrás
      "ES=F": { t: [t - 3 * 3600, t - 60], c: [7000, 7070] }, // futuro subiu 1%
    };
    expect(priceAt("SPY", t, series).p).toBeCloseTo(707);
    expect(priceAt("SPY", t, series).src).toBe("ES=F");
    expect(priceAt("SPY", t - 3 * 3600 + STALE - 1, series).src).toBe("own");
    expect(priceAt("XLK", t, series)).toBeNull();
  });
  it("bolsa de fora sem futuro: o ETF do país", () => {
    const t = 2_000_000;
    const series = { "^KS11": { t: [t - 9 * 3600], c: [5000] }, EWY: { t: [t - 9 * 3600, t - 300], c: [60, 57] } }; // prettier-ignore
    expect(priceAt("^KS11", t, series).p).toBeCloseTo(4750);
    expect(REGIME_SYMS).toContain("EWY");
  });
});

describe("como andou o regime: resumo da janela", () => {
  const pts = (...s) => s.map((score, i) => ({ t: i, score }));
  it("intensificando, perdendo força, virou de lado e estável", () => {
    expect(historySummary(pts(-7, -30, -57)).trend).toBe("intensificando");
    expect(historySummary(pts(-60, -40, -25)).trend).toBe("perdendo força");
    expect(historySummary(pts(30, 5, -20)).trend).toBe("virou de lado");
    expect(historySummary(pts(-40, -45, -44)).trend).toBe("estável");
  });
  it("tendência pela média do 1º e do último quarto (a nota de 1 dia oscila)", () => {
    // ponta a ponta parece estável (−45 → −52), mas a média saiu de perto de zero e afundou
    const s = historySummary(pts(-45, -7, -18, 14, 26, -12, -27, -9, -21, -49, -50, -38, -49, -52));
    expect(s.trend).toBe("intensificando");
  });
  it("permanência = parte dos pontos do mesmo lado de agora", () => {
    const s = historySummary(pts(10, -20, -30, -40));
    expect(s.same).toBe(0.75);
    expect([s.min, s.max, s.first, s.end, s.last]).toEqual([-40, 10, 10, -40, -40]);
  });
  it("janela diária de 1 mês termina na nota de agora", () => {
    const n = 80;
    const up = Array.from({ length: n }, (_, i) => 100 + i * 0.3 + Math.sin(i));
    const flat = Array(n).fill(100);
    const dates = Array.from({ length: n }, (_, i) => new Date(Date.UTC(2026, 6, 1) + i * 86400e3).toISOString().slice(0, 10)); // prettier-ignore
    const daily = { dates, close: { SPY: up, TLT: flat, HYG: up, IEF: flat } };
    const now = Date.parse(dates.at(-1) + "T23:00:00Z") / 1000;
    const out = regimeHistory("1m", { daily, now, live: { score: 42, blocks: {} } });
    expect(out.length).toBeGreaterThan(10);
    expect(out.at(-1)).toMatchObject({ t: now, score: 42 });
  });
});

describe("pêndulo ao voltar para o app", () => {
  it("busca as cotações já quando o canal estava desligado e o último pacote é velho", async () => {
    const { refreshOnReturn } = await import("../assets/live-feed.js");
    const now = 1_000_000_000;
    expect(refreshOnReturn({ now, session: "pre", healthy: false, lastAt: now - 5 * 60_000 })).toBe(
      true,
    );
    expect(refreshOnReturn({ now, session: "pre", healthy: false, lastAt: 0 })).toBe(true);
    expect(refreshOnReturn({ now, session: "pre", healthy: true, lastAt: now - 5 * 60_000 })).toBe(
      false,
    );
    expect(refreshOnReturn({ now, session: "pre", healthy: false, lastAt: now - 20_000 })).toBe(
      false,
    );
    expect(refreshOnReturn({ now, session: null, healthy: false, lastAt: 0 })).toBe(false); // nada negociando
    expect(
      refreshOnReturn({ now, session: "open", healthy: false, lastAt: 0, autoReload: 0 }),
    ).toBe(false);
  });
});
