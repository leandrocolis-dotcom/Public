// Camadas do robô de cotações (assets/feed-tiers.js): quente, morna, fria; limite de 1 consulta na quente.
import { describe, expect, it } from "vitest";
import { CHUNK, hotList, pickTier, REFS, slots, yahooCalls } from "../assets/feed-tiers.js";
import { SYMBOLS } from "../api/quotes.js";

const edt = (day, hhmm) => Date.parse(`${day}T${hhmm}:00-04:00`);
const OPEN = edt("2026-10-07", "11:00");
const NIGHT = edt("2026-10-07", "22:00");

describe("feed-tiers: lista quente", () => {
  it("referências primeiro, depois os pedidos, sem repetir", () => {
    const h = hotList([["NVDA", "SPY"], ["AAPL"]], OPEN);
    expect(h.slice(0, 2)).toEqual(["SPY", "QQQ"]);
    expect(h).toContain("NVDA");
    expect(h).toContain("AAPL");
    expect(h.filter((s) => s === "SPY")).toHaveLength(1);
  });
  it("não passa de 1 consulta (futuro conta 2 vagas)", () => {
    const many = Array.from({ length: 120 }, (_, i) => `T${i}`);
    const h = hotList([many], OPEN);
    expect(h.reduce((n, s) => n + slots(s), 0)).toBeLessThanOrEqual(CHUNK);
    expect(yahooCalls(h)).toBe(1);
  });
  it("fora do horário, ação dos EUA e B3 saem da quente", () => {
    const h = hotList([["NVDA", "PETR4.SA", "GC=F"]], NIGHT);
    expect(h).not.toContain("NVDA");
    expect(h).not.toContain("SPY");
    expect(h).not.toContain("PETR4.SA");
    expect(h).toContain("GC=F");
    expect(h).toContain("ES=F");
  });
  it("ignora lixo", () => {
    expect(hotList([[null, 3, ""]], OPEN)).toEqual(REFS);
  });
});

describe("feed-tiers: escolha da rodada", () => {
  const hot = hotList([["XYZW"]], OPEN);
  it("1ª rodada da instância busca tudo (universo + carteiras)", () => {
    const r = pickTier({ now: OPEN, universe: SYMBOLS, extra: ["ZZZZ"], hot, lastWarmAt: 0 });
    expect(r.tier).toBe("full");
    expect(r.syms.length).toBe(SYMBOLS.length);
    expect(r.extra).toEqual(expect.arrayContaining(["ZZZZ", "XYZW"]));
  });
  it("morna a cada 60 s, só mercados abertos; quente nas rodadas do meio", () => {
    const warm = pickTier({ now: OPEN, universe: SYMBOLS, hot, lastWarmAt: OPEN - 60_000 });
    expect(warm.tier).toBe("warm");
    expect(warm.syms).toContain("SPY");
    expect(warm.syms).toContain("PETR4.SA"); // 11:00 NY = 12:00 SP: B3 aberta
    const mid = pickTier({ now: OPEN, universe: SYMBOLS, hot, lastWarmAt: OPEN - 15_000 });
    expect(mid.tier).toBe("hot");
    expect(yahooCalls([...mid.syms, ...mid.extra])).toBe(1);
  });
  it("noite: morna só com futuros, moedas, cripto e bolsas do mundo (~2 consultas, antes 7)", () => {
    const r = pickTier({ now: NIGHT, universe: SYMBOLS, hot: [], lastWarmAt: NIGHT - 60_000 });
    expect(r.tier).toBe("warm");
    expect(r.syms).not.toContain("SPY");
    expect(r.syms).not.toContain("BOVA11.SA");
    expect(r.syms).toContain("CL=F");
    expect(yahooCalls(r.syms)).toBeLessThanOrEqual(3);
    expect(yahooCalls(SYMBOLS)).toBe(7); // universo inteiro, com os contratos vigentes dos futuros
  });
  it("noite: sem rodada quente entre as mornas", () => {
    const h = hotList([["GC=F"]], NIGHT);
    const r = pickTier({
      now: NIGHT,
      universe: SYMBOLS,
      hot: h,
      lastWarmAt: NIGHT - 15_000,
      session: "night",
    });
    expect(r.tier).toBeNull();
    const day = pickTier({
      now: OPEN,
      universe: SYMBOLS,
      hot: h,
      lastWarmAt: OPEN - 15_000,
      session: "open",
    });
    expect(day.tier).toBe("hot");
  });
  it("nada aberto (sábado) = nada a buscar", () => {
    const sat = edt("2026-10-10", "12:00");
    const r = pickTier({
      now: sat,
      universe: SYMBOLS.filter((s) => !s.endsWith("-USD")),
      hot: [],
      lastWarmAt: sat - 60_000,
    });
    expect(r.tier).toBeNull();
  });
});
