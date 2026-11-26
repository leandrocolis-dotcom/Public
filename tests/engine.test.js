import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import {
  rsi14, momentumOf, momentumBand, flowOf, assetMetrics, isStale, businessDaysBetween,
  computeFreshness, computeRegime,
  computeSnapshot, diffSnapshots, compactSnapshot, applyManualPrices, validatePrices,
  stdSample,
} from "../assets/engine.js"; // prettier-ignore
import { ASSETS, REGION_LIST, SECTOR_LIST } from "../assets/universe.js";
import { walk, tradingDates } from "./helpers.js";

const N = 900;
const dates = tradingDates(N);
const lastDate = dates.at(-1);

/** prices.json sintético com todos os 47 ativos. */
function makePrices(overrides = {}) {
  const series = {};
  Object.keys(ASSETS).forEach((c, i) => {
    series[c] = walk(N, { seed: i + 1, start: 50 + i, drift: 0.0003, vol: 0.01 });
  });
  series.VIX = walk(N, { seed: 99, start: 18, drift: 0, vol: 0.02 });
  series.US10Y = walk(N, { seed: 98, start: 4, drift: 0, vol: 0.004 });
  series.US3M = walk(N, { seed: 97, start: 3.5, drift: 0, vol: 0.002 });
  const last_real = Object.fromEntries(Object.keys(series).map((c) => [c, lastDate]));
  return {
    meta: {
      updated_at_brt: `${lastDate}T17:00:00-03:00`,
      market_status: "Fechamento",
      source: "teste",
    },
    dates,
    series: { ...series, ...(overrides.series ?? {}) },
    last_real: { ...last_real, ...(overrides.last_real ?? {}) },
  };
}
const NOW = new Date(`${lastDate}T21:00:00Z`);

describe("universo", () => {
  it("tem 47 ativos e as listas de regiões e setores", () => {
    expect(Object.keys(ASSETS)).toHaveLength(47);
    expect(REGION_LIST).toHaveLength(25);
    expect(SECTOR_LIST).toHaveLength(13);
  });
});

describe("indicadores", () => {
  it("RSI: só altas = 100; alternado simétrico = 50", () => {
    expect(rsi14(Array.from({ length: 30 }, (_, i) => 100 + i))).toBe(100);
    const alt = Array.from({ length: 30 }, (_, i) => 100 + (i % 2));
    expect(rsi14(alt)).toBeCloseTo(50, 5);
  });
  it("faixas de momentum", () => {
    expect([85, 70, 50, 25, 5].map(momentumBand)).toEqual([
      "Forte alta",
      "Alta",
      "Neutro",
      "Baixa",
      "Forte baixa",
    ]);
  });
  it("momentum fica entre 0 e 100 e é máximo em tendência perfeita", () => {
    const top = momentumOf({ p: 2, ma50: 1.5, ma200: 1, r1m: 0.5, r3m: 0.5, r6m: 0.5, rsi: 100 });
    const bottom = momentumOf({
      p: 1,
      ma50: 1.5,
      ma200: 2,
      r1m: -0.5,
      r3m: -0.5,
      r6m: -0.5,
      rsi: 0,
    });
    expect(top).toBeCloseTo(100, 5);
    expect(bottom).toBeCloseTo(0, 5);
  });
  it("fluxo por preço", () => {
    expect(flowOf({ r1m: 0.01, r3m: 0.02, vsMa50: 0.01 })).toBe("Entrando");
    expect(flowOf({ r1m: -0.01, r3m: -0.02, vsMa50: -0.01 })).toBe("Saindo");
    expect(flowOf({ r1m: 0.01, r3m: -0.02, vsMa50: 0.01 })).toBe("Misto");
  });
  it("retornos, médias e topo de 52 semanas em série linear", () => {
    const s = Array.from({ length: 300 }, (_, i) => 100 + i);
    const m = assetMetrics("SPY", s, tradingDates(300), { SPY: lastDate });
    expect(m.price).toBe(399);
    expect(m.r1d).toBeCloseTo(399 / 398 - 1, 10);
    expect(m.r1m).toBeCloseTo(399 / (399 - 21) - 1, 10);
    expect(m.ma50).toBeCloseTo((350 + 399) / 2, 10);
    expect(m.fromHigh).toBe(0);
    expect(m.d21).toBe(21);
    expect(m.spark).toHaveLength(126);
    expect(m.spark[0]).toBeCloseTo(100, 10);
  });
  it("ativo com menos de 260 pregões não entra nos cálculos", () => {
    const m = assetMetrics("SPY", walk(200), tradingDates(200), { SPY: lastDate });
    expect(m.ok).toBe(false);
  });
  it("YTD usa o último fechamento do ano anterior", () => {
    const d = ["2025-12-30", "2025-12-31", "2026-01-02", "2026-01-05"];
    const s = [1, 2, 3, 4];
    const full = [...Array(296).fill(1), ...s];
    const dd = [...tradingDates(296, "2025-12-29"), ...d];
    const m = assetMetrics("SPY", full, dd, { SPY: "2026-01-05" });
    expect(m.ytd).toBeCloseTo(4 / 2 - 1, 10);
  });
});

describe("frescor e defasagem (seção 9)", () => {
  it("dias úteis", () => {
    expect(businessDaysBetween("2026-10-02", "2026-10-05")).toBe(1); // sex → seg
    expect(businessDaysBetween("2026-10-05", "2026-10-08")).toBe(3);
    expect(businessDaysBetween("2026-10-05", "2026-10-05")).toBe(0);
  });
  it("selo intradiário: ao vivo até 10 min, atenção até 30, atrasado acima; defasado e sem horário", () => {
    const meta = (t, st) => ({ updated_at_brt: t, market_status: st });
    const at = (iso) => new Date(iso);
    const m = {
      ...meta("2026-10-05T14:20:00-03:00", "Intradiário"),
      source: "Yahoo Finance (ao vivo)",
    };
    expect(computeFreshness(m, at("2026-10-05T17:25:00Z")).label).toBe("Ao vivo"); // 5 min
    const file = meta("2026-10-05T14:20:00-03:00", "Intradiário"); // arquivo publicado, não ao vivo
    expect(computeFreshness(file, at("2026-10-05T17:25:00Z")).label).toBe("Intradiário");
    expect(computeFreshness(m, at("2026-10-05T17:35:00Z")).level).toBe("warn"); // 15 min
    expect(computeFreshness(m, at("2026-10-05T17:55:00Z")).level).toBe("bad"); // 35 min
    expect(computeFreshness(m, at("2026-10-05T17:55:00Z")).label).toBe("Atrasado 35 min");
    expect(
      computeFreshness(meta("2026-10-05T17:00:00-03:00", "Fechamento"), at("2026-10-05T23:30:00Z"))
        .label,
    ).toBe("Fechamento");
    expect(
      computeFreshness(meta("2026-10-01T17:00:00-03:00", "Fechamento"), at("2026-10-05T15:00:00Z"))
        .label,
    ).toBe("Defasado");
    expect(computeFreshness({}, new Date()).label).toBe("Sem horário");
  });
  it("ativo defasado: sem last_real, data antiga ou 3 fechamentos iguais", () => {
    const ok = [1, 2, 3, 4];
    expect(isStale("X", ok, { X: lastDate }, lastDate)).toBe(false);
    expect(isStale("X", ok, {}, lastDate)).toBe(true);
    expect(isStale("X", ok, { X: "2026-09-01" }, lastDate)).toBe(true);
    expect(isStale("X", [1, 5, 5, 5], { X: lastDate }, lastDate)).toBe(true);
  });
});

describe("regime (seção 5.2)", () => {
  const mk = (over) => ({ ok: true, ...over });
  it("risco, dólar, juros, commodities e curva", () => {
    const assets = {
      VIX: mk({ price: 30, ma50: 20 }),
      DXY: mk({ vsMa50: 0.01, r1m: 0.01 }),
      US10Y: mk({ price: 4.5, ma50: 4.3 }),
      DBC: mk({ vsMa50: -0.01, r1m: -0.01 }),
    };
    const r = computeRegime(assets, { US10Y: [4.5], US3M: [5.2] });
    expect(r.risk.label).toBe("RISK-OFF");
    expect(r.dollar.label).toBe("DÓLAR FORTE");
    expect(r.rates.label).toBe("JUROS SUBINDO");
    expect(r.commodities.label).toBe("EM BAIXA");
    expect(r.curve.label).toBe("INVERTIDA");
    expect(computeRegime({ VIX: mk({ price: 15, ma50: 17 }) }, {}).risk.label).toBe("RISK-ON");
    expect(computeRegime({ VIX: mk({ price: 20, ma50: 19 }) }, {}).risk.label).toBe("NEUTRO");
  });
});

describe("estatística", () => {
  it("desvio amostral usa n-1", () => {
    expect(stdSample([1, 2, 3, 4])).toBeCloseTo(Math.sqrt(5 / 3), 10);
  });
});

describe("snapshot, mudanças e atualização manual", () => {
  it("sem snapshot anterior → nenhuma mudança", () => {
    const s = computeSnapshot(makePrices(), null, { now: NOW });
    expect(s.changes).toEqual([]);
  });
  it("avisa quando o fluxo de um ativo muda", () => {
    const s = computeSnapshot(makePrices(), null, { now: NOW });
    const curr = compactSnapshot(s);
    const code = Object.keys(curr.flows)[0];
    const prev = structuredClone(curr);
    prev.flows[code] = `${curr.flows[code]}*`;
    expect(diffSnapshots(prev, curr).map((c) => c.type)).toEqual(["Fluxo mudou"]);
    expect(diffSnapshots({ pairs: {} }, curr)).toEqual([]); // snapshot antigo salvo (só pares) não quebra
  });
  it("atualização manual sobrescreve o último preço e ignora linhas inválidas", () => {
    const p = makePrices();
    const { prices, applied, ignored } = applyManualPrices(
      p,
      "SPY;123,45\nXYZ;1\nQQQ;abc\n\nGLD 200.5",
    );
    expect(applied).toEqual(["SPY", "GLD"]);
    expect(ignored).toHaveLength(2);
    expect(prices.series.SPY.at(-1)).toBe(123.45);
    expect(prices.series.GLD.at(-1)).toBe(200.5);
    expect(p.series.SPY.at(-1)).not.toBe(123.45); // original intacto
  });
  it("validação do prices.json", () => {
    expect(validatePrices(makePrices())).toEqual([]);
    const bad = makePrices();
    bad.series.SPY = bad.series.SPY.slice(1);
    expect(validatePrices(bad)[0]).toContain("SPY");
    expect(validatePrices({}).length).toBeGreaterThan(0);
  });
});

describe("data/prices.json real", () => {
  const prices = JSON.parse(readFileSync(new URL("../data/prices.json", import.meta.url)));
  it("é válido e cobre os 47 ativos", () => {
    expect(validatePrices(prices)).toEqual([]);
    for (const c of Object.keys(ASSETS)) expect(prices.series[c], c).toBeDefined();
    expect(Object.keys(prices.last_real).length).toBeGreaterThanOrEqual(47);
  });
  it("calcula o snapshot sem quebrar", () => {
    const s = computeSnapshot(prices, null, { now: new Date(prices.meta.updated_at_brt) });
    expect(s.regime).toBeTruthy();
    expect(Object.keys(s.assets).length).toBeGreaterThanOrEqual(47);
  });
});
