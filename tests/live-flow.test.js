import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import {
  applyLiveToPrices,
  applyLiveToFlow,
  nyDate,
  brtISO,
  lateQuotes,
  toleranceMin,
} from "../assets/live.js";
import {
  assetFlow, flowSnapshot, groupFlows, flowHeadline, rotation, squarify, relVolume, sessionFraction, seriesOf, flowNarrative, narrativeChanges, flowPhase,
} from "../assets/flow-engine.js"; // prettier-ignore
import { FLOW_ASSETS, FLOW_BY_SYM, FLOW_GROUPS } from "../assets/flow-universe.js";
import { ASSETS } from "../assets/universe.js";
import { computeSnapshot, validatePrices } from "../assets/engine.js";
import { walk, tradingDates } from "./helpers.js";

const unix = (iso) => Date.parse(iso) / 1000;

describe("cotações ao vivo sobre o histórico", () => {
  const dates = tradingDates(300, "2026-10-05");
  const prices = {
    meta: { updated_at_brt: "2026-10-05T17:00:00-03:00", market_status: "Fechamento" },
    dates,
    series: {
      SPY: walk(300),
      VIXY: walk(300, { seed: 2 }),
      US10Y: walk(300, { seed: 3, start: 4 }),
    },
    last_real: { SPY: "2026-10-05", VIXY: "2026-10-05", US10Y: "2026-10-05" },
  };
  const t = unix("2026-10-06T15:00:00Z"); // 11h em NY, terça
  const live = {
    quotes: {
      SPY: { p: 500, t, ms: "REGULAR" },
      VIXY: { p: 20, t: unix("2026-10-05T19:59:00Z"), ms: "REGULAR" }, // sem negócio hoje
      "^TNX": { p: 4.5, t, ms: "REGULAR" },
    },
  };

  it("data de NY e horário de Brasília", () => {
    expect(nyDate(unix("2026-10-06T03:00:00Z"))).toBe("2026-10-05"); // 23h em NY
    expect(brtISO(t)).toBe("2026-10-06T12:00:00-03:00");
  });
  it("pregão novo: acrescenta a linha, aplica quem tem cotação de hoje e mantém os demais defasados", () => {
    const { table, applied, session } = applyLiveToPrices(prices, live);
    expect(session).toBe("2026-10-06");
    expect(table.dates.at(-1)).toBe("2026-10-06");
    expect(validatePrices(table).filter((e) => !e.includes("histórico curto"))).toEqual([]);
    expect(table.series.SPY.at(-1)).toBe(500);
    expect(table.series.US10Y.at(-1)).toBe(4.5); // US10Y <- ^TNX
    expect(applied.sort()).toEqual(["SPY", "US10Y"]);
    expect(table.series.VIXY.at(-1)).toBe(prices.series.VIXY.at(-1));
    expect(table.last_real.VIXY).toBe("2026-10-05"); // ficará defasado: derruba os pares do VIXY
    expect(table.meta.market_status).toBe("Intradiário");
    expect(prices.dates.at(-1)).toBe("2026-10-05"); // original intacto
  });
  it("mesmo pregão: sobrescreve o último preço sem acrescentar linha", () => {
    const sameDay = { quotes: { SPY: { p: 501, t: unix("2026-10-05T18:00:00Z"), ms: "REGULAR" } } };
    const { table } = applyLiveToPrices(prices, sameDay);
    expect(table.dates.length).toBe(prices.dates.length);
    expect(table.series.SPY.at(-1)).toBe(501);
  });
  it("cotação mais antiga que o histórico não é aplicada", () => {
    const old = { quotes: { SPY: { p: 1, t: unix("2026-10-01T18:00:00Z"), ms: "CLOSED" } } };
    expect(applyLiveToPrices(prices, old).applied).toEqual([]);
  });
  it("métricas recalculam com o preço do momento", () => {
    const real = JSON.parse(readFileSync(new URL("../data/prices.json", import.meta.url)));
    const last = real.dates.at(-1);
    const t2 = unix(`${last}T19:00:00Z`);
    const spyP = real.series.SPY.at(-1);
    const crash = { quotes: { SPY: { p: spyP * 0.9, t: t2, ms: "REGULAR" } } };
    const before = computeSnapshot(real, null, { now: new Date(t2 * 1000) });
    const after = computeSnapshot(applyLiveToPrices(real, crash).table, null, {
      now: new Date(t2 * 1000),
    });
    expect(after.assets.SPY.momentum).toBeLessThan(before.assets.SPY.momentum);
    expect(after.assets.SPY.r1d).toBeLessThan(before.assets.SPY.r1d);
  });
  it("flow.json: aplica preço e volume", () => {
    const flow = {
      dates: dates.slice(-100),
      close: { SPY: walk(100), "BRL=X": walk(100, { seed: 4, start: 5 }) },
      vol: { SPY: Array(60).fill(1e6) },
      last_real: {},
    };
    const lv = {
      quotes: { SPY: { p: 600, t, ms: "REGULAR", v: 5e5 }, "BRL=X": { p: 5.1, t, ms: "REGULAR" } },
    };
    const { table } = applyLiveToFlow(flow, lv);
    expect(table.close.SPY.at(-1)).toBe(600);
    expect(table.vol.SPY.at(-1)).toBe(5e5);
    expect(table.vol.SPY.length).toBe(61);
    expect(table.close["BRL=X"].at(-1)).toBe(5.1);
  });
  it("atraso: tolerância por tipo e só com o mercado do ativo aberto", () => {
    expect(toleranceMin("ES=F")).toBe(25);
    expect(toleranceMin("^TNX")).toBe(75);
    expect(toleranceMin("SPY")).toBe(20);
    const now = unix("2026-10-06T16:00:00Z");
    const lv = { quotes: {
      SPY: { t: now - 5 * 60, ms: "REGULAR" }, EWZ: { t: now - 40 * 60, ms: "REGULAR" },
      "ES=F": { t: now - 12 * 60, ms: "REGULAR" }, QAT: { t: now - 300 * 60, ms: "CLOSED" },
    } }; // prettier-ignore
    expect(lateQuotes(lv, ["SPY", "EWZ", "ES=F", "QAT"], now)).toEqual([
      { sym: "EWZ", lagMin: 40 },
    ]);
  });

  it("pouco negociado, câmbio lento e série só de fechamento não contam como atraso", () => {
    expect(toleranceMin("CNY=X")).toBe(60);
    expect(toleranceMin("^SKEW")).toBe(Infinity);
    const now = unix("2026-11-17T20:09:00Z");
    // caso real de 17/11/2026 15h de NY: 15 "atrasados", todos falsos
    const lv = { quotes: {
      SPY: { t: now - 60, ms: "REGULAR", av3: 43e6 },
      EIRL: { t: now - 252 * 60, ms: "REGULAR", v: 1142, av3: 4518 },
      JXI: { t: now - 59 * 60, ms: "REGULAR", v: 84814 }, // sem média (app aberto pela foto do canal)
      "CNH=F": { t: now - 194 * 60, ms: "REGULAR", av3: 445 },
      "CNY=X": { t: now - 29 * 60, ms: "REGULAR", v: 0, av3: 0 },
      "^SKEW": { t: now - 1329 * 60, ms: "REGULAR", v: 0 },
      XLK: { t: now - 45 * 60, ms: "REGULAR", av3: 9e6 },
    } }; // prettier-ignore
    expect(lateQuotes(lv, Object.keys(lv.quotes), now)).toEqual([{ sym: "XLK", lagMin: 45 }]);
  });
});

describe("api/quotes", () => {
  it("ignora símbolos que o Yahoo devolve sem terem sido pedidos", async () => {
    const realFetch = globalThis.fetch;
    const now = Math.floor(Date.now() / 1000);
    globalThis.fetch = async (url) => {
      const u = String(url);
      const json = (o) => ({
        ok: true,
        status: 200,
        headers: { getSetCookie: () => ["A3=x; path=/"] },
        json: async () => o,
        text: async () => "crumb123",
      });
      if (u.includes("getcrumb") || u.includes("fc.yahoo")) return json({});
      return json({ quoteResponse: { result: [
        { symbol: "SPY", regularMarketPrice: 500, regularMarketTime: now, marketState: "REGULAR" },
        { symbol: "SPY.EXTRA", regularMarketPrice: 1, regularMarketTime: now, marketState: "REGULAR" },
      ] } }); // prettier-ignore
    };
    try {
      const { fetchAll } = await import("../api/quotes.js");
      const out = await fetchAll(["SPY"]);
      expect(Object.keys(out.quotes)).toEqual(["SPY"]);
      expect(out.count).toBe(1);
      expect(out.count).toBeLessThanOrEqual(out.total);
    } finally {
      globalThis.fetch = realFetch;
    }
  });
});

describe("mapa de fluxo", () => {
  const flow = JSON.parse(readFileSync(new URL("../data/flow.json", import.meta.url)));

  it("flow.json cobre o universo e tem séries completas", () => {
    // Ativos novos só entram no flow.json no próximo update-prices; tolera até 10% fora.
    expect(Object.keys(flow.close).length).toBeGreaterThanOrEqual(
      Math.floor(FLOW_ASSETS.length * 0.85),
    );
    for (const s of Object.values(flow.close)) expect(s.length).toBe(flow.dates.length);
  });
  it("moeda cotada em 'moeda por US$' é invertida (real se valorizando = positivo)", () => {
    const a = FLOW_BY_SYM["BRL=X"];
    const s = seriesOf({ close: { "BRL=X": [5, 5, 4] } }, a);
    expect(s[2]).toBeCloseTo(0.25, 10);
  });
  it("z: taxa subindo e VIX subindo contam como saída (z negativo)", () => {
    const up = Array.from({ length: 80 }, (_, i) => 4 + i * 0.001 + (i % 2) * 0.01);
    expect(assetFlow(up, { yld: true }, 5, 79).z).toBeLessThan(0);
    expect(assetFlow(up, { yld: true }, 5, 79).unit).toBe("bps");
    const vix = up.map((v) => v * 5);
    expect(assetFlow(vix, { risk: true }, 5, 79).z).toBeLessThan(0);
    expect(assetFlow(vix, {}, 5, 79).z).toBeGreaterThan(0);
  });
  it("liquidez: volume de cripto do Yahoo já vem em US$", async () => {
    const { liquidity } = await import("../assets/flow-engine.js");
    const f = {
      close: { "BTC-USD": [80000, 80000], SPY: [500, 500] },
      vol: { "BTC-USD": [2e10, 2e10], SPY: [1e7, 1e7] },
    };
    expect(liquidity(f, { sym: "BTC-USD" })).toBe(2e10);
    expect(liquidity(f, { sym: "SPY" })).toBe(5e9);
  });
  it("volume relativo ajusta pela fração do pregão", () => {
    const vol = [...Array(25).fill(100), 50];
    expect(relVolume(vol, 0, 1)).toBeCloseTo(0.5, 10);
    expect(relVolume(vol, 0, 0.5)).toBeCloseTo(1, 10);
    expect(relVolume([1, 2], 0, 1)).toBeNull();
  });
  it("snapshot, grupos e manchete", () => {
    const snap = flowSnapshot(flow, { horizon: "5d" });
    expect(snap.rows.length).toBeGreaterThan(150);
    for (const r of snap.rows) expect(Number.isFinite(r.z)).toBe(true);
    const groups = groupFlows(snap.rows);
    const withData = new Set(snap.rows.map((r) => r.group));
    expect(groups.length).toBe(FLOW_GROUPS.filter((g) => withData.has(g.id)).length);
    const zs = groups.map((g) => g.z);
    expect([...zs].sort((a, b) => b - a)).toEqual(zs);
    const { into, out } = flowHeadline(groups);
    for (const g of into) expect(g.z).toBeGreaterThan(0);
    for (const g of out) expect(g.z).toBeLessThan(0);
  });
  it("replay: pregões anteriores dão datas anteriores", () => {
    const a = flowSnapshot(flow, { horizon: "1d", back: 0 });
    const b = flowSnapshot(flow, { horizon: "1d", back: 5 });
    expect(b.date < a.date).toBe(true);
  });
  it("rotação: caudas com 8 pontos e quadrante coerente", () => {
    const r = rotation(flow, "us_sectors");
    expect(r.length).toBe(11);
    for (const p of r) {
      expect(p.tail.length).toBe(8);
      const { x, y } = p.tail.at(-1);
      expect(p.quadrant).toBe(
        x >= 100
          ? y >= 100
            ? "Liderando"
            : "Perdendo força"
          : y < 100
            ? "Atrasado"
            : "Ganhando força",
      );
    }
    expect(rotation(flow, "rates")).toEqual([]);
    expect(rotation(flow, "fx").length).toBeGreaterThan(10); // sem benchmark: média do grupo
  });
  it("treemap preenche a área sem sobrepor", () => {
    const items = [6, 6, 4, 3, 2, 2, 1].map((size, i) => ({ size, i }));
    const rects = squarify(items, { x: 0, y: 0, w: 600, h: 400 });
    expect(rects).toHaveLength(7);
    const area = rects.reduce((a, r) => a + r.w * r.h, 0);
    expect(area).toBeCloseTo(600 * 400, 3);
    for (const r of rects) {
      expect(r.x).toBeGreaterThanOrEqual(-1e-9);
      expect(r.x + r.w).toBeLessThanOrEqual(600 + 1e-6);
      expect(r.y + r.h).toBeLessThanOrEqual(400 + 1e-6);
    }
  });
  it("fração do pregão de NY", () => {
    expect(sessionFraction(new Date("2026-10-06T13:30:00Z"))).toBe(0); // 9h30 NY
    expect(sessionFraction(new Date("2026-10-06T16:45:00Z"))).toBeCloseTo(0.5, 2); // 12h45 NY
    expect(sessionFraction(new Date("2026-10-06T21:00:00Z"))).toBe(1);
  });
  it("todo ativo do Pêndulo tem símbolo Yahoo", () => {
    for (const a of Object.values(ASSETS)) expect(a.yahoo).toBeTruthy();
  });
});

describe("narrativa do fluxo no dia", () => {
  const row = (sym, group, z, relVol = null) => ({
    sym,
    label: sym,
    name: sym,
    group,
    z,
    value: z,
    unit: "%",
    relVol,
  });
  const rows = [
    row("SMH", "us_ind", 2, 2), row("IGV", "us_ind", 1.2, 1), row("XLE", "us_sectors", -1.6), row("XLU", "us_sectors", -0.8),
    row("SPY", "idx_us", 1.5), row("ES=F", "idx_fut", 0.9), row("^VIX", "vol", 1.1),
  ]; // prettier-ignore
  const groups = groupFlows(rows);
  it("separa mercados que ganham/perdem força e escolhe candidatos tradáveis", () => {
    const n = flowNarrative(rows, groups, { session: "open", sessionFrac: 0.5 });
    expect(n.markets.find((m) => m.id === "us_ind").state).toBe("up");
    expect(n.markets.find((m) => m.id === "us_sectors").state).toBe("down");
    expect(n.candidates.map((c) => c.sym)).toEqual(["SMH", "IGV"]); // SPY (índice à vista) fora
    expect(n.candidates[0].hot).toBe(true);
    expect(n.weak.map((c) => c.sym)).toEqual(["XLE"]);
    expect(n.tone.id).toBe("risk_on");
  });
  it("fora do pregão ignora o volume relativo", () => {
    const n = flowNarrative(rows, groups, { session: "pre" });
    expect(n.candidates[0].hot).toBe(false);
    expect(n.phase.id).toBe("pre");
  });
  it("fases do pregão regular", () => {
    expect(flowPhase("open", 0.05).id).toBe("open1");
    expect(flowPhase("open", 0.5).id).toBe("open2");
    expect(flowPhase("open", 0.95).id).toBe("open3");
    expect(flowPhase("post").id).toBe("post");
  });
  it("registra o que mudou entre duas leituras", () => {
    const a = flowNarrative(rows, groups, { session: "pre" });
    expect(narrativeChanges(null, a)).toEqual([]);
    const rows2 = rows
      .map((r) => (r.sym === "XLU" ? { ...r, z: -1.4 } : r))
      .concat(row("XLK", "us_sectors", 1.4));
    const b = flowNarrative(rows2, groupFlows(rows2), { session: "open", sessionFrac: 0.5 });
    const txt = narrativeChanges(a, b)
      .map((c) => c.text)
      .join("|");
    expect(txt).toContain("Meio do pregão");
    expect(txt).toContain("XLK entrou na lista de fortes");
  });
});
