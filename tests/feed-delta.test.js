// Pacote "só o que mudou" do canal (assets/feed-delta.js) e compatibilidade com o mergeLive do app.
import { describe, expect, it } from "vitest";
import {
  addStats,
  diffQuotes,
  FULL_EVERY,
  newMem,
  planPacket,
  PULSE_EVERY,
  slimQuote,
} from "../assets/feed-delta.js";
import { mergeLive } from "../assets/live-feed.js";

const T0 = Date.parse("2026-10-07T15:00:00Z");
const data = (quotes, at = T0) => ({
  fetched_at: new Date(at).toISOString(),
  version: "supabase",
  source: "Yahoo Finance",
  market_state: "REGULAR",
  count: Object.keys(quotes).length,
  quotes,
  missing: [],
  errors: [],
  feed: { session: "open", at: new Date(at).toISOString(), tier: "hot" },
});

describe("feed-delta: enxuto e diferença", () => {
  it("tira 52 semanas, médias de volume, valor de mercado e nome", () => {
    expect(slimQuote({ p: 1, t: 2, h52: 3, l52: 4, av3: 5, mc: 6, av: 7, n: "x", pc: 8 })).toEqual({
      p: 1,
      t: 2,
      pc: 8,
    });
  });
  it("só o que mudou: preço igual com hora nova conta como mudança", () => {
    const prev = { SPY: { p: 1, t: 10 }, QQQ: { p: 2, t: 10 } };
    const cur = { SPY: { p: 1, t: 11 }, QQQ: { p: 2, t: 10 }, NEW: { p: 3, t: 10 } };
    expect(Object.keys(diffQuotes(prev, cur)).sort()).toEqual(["NEW", "SPY"]);
  });
});

describe("feed-delta: plano do pacote", () => {
  it("1º pacote é completo; depois só delta; completo de novo após 5 min", () => {
    let r = planPacket(newMem(), data({ SPY: { p: 1, t: 1 }, QQQ: { p: 2, t: 1 } }), T0);
    expect(r.packet.feed).toMatchObject({ seq: 1, kind: "full", tier: "hot" });
    expect(r.packet.count).toBe(2);
    r = planPacket(
      r.mem,
      data({ SPY: { p: 1.1, t: 2 }, QQQ: { p: 2, t: 1 } }, T0 + 15_000),
      T0 + 15_000,
    );
    expect(r.packet.feed).toMatchObject({ seq: 2, kind: "delta" });
    expect(Object.keys(r.packet.quotes)).toEqual(["SPY"]);
    expect(r.packet.total).toBe(2);
    const later = T0 + FULL_EVERY;
    r = planPacket(r.mem, data({ SPY: { p: 1.2, t: 3 } }, later), later);
    expect(r.packet.feed.kind).toBe("full");
    expect(Object.keys(r.packet.quotes).sort()).toEqual(["QQQ", "SPY"]);
  });
  it("nada mudou: não envia; passado 1 min manda pulso de 1 ativo (canal não fica mudo)", () => {
    const q = { SPY: { p: 1, t: 1, ms: "REGULAR" }, QQQ: { p: 2, t: 1 } };
    let r = planPacket(newMem(), data(q), T0);
    const r2 = planPacket(r.mem, data(q, T0 + 15_000), T0 + 15_000);
    expect(r2.packet).toBeNull();
    expect(r2.mem.seq).toBe(1);
    r = planPacket(r2.mem, data(q, T0 + PULSE_EVERY), T0 + PULSE_EVERY);
    expect(r.packet.count).toBe(1);
    expect(r.packet.feed).toMatchObject({ seq: 2, kind: "delta", pulse: true });
    expect(r.packet.market_state).toBe("REGULAR");
  });
  it("o pacote delta funciona no mergeLive do app ANTIGO (junta por ativo)", () => {
    const first = planPacket(
      newMem(),
      data({ SPY: { p: 1, t: 1, pc: 0.9 }, QQQ: { p: 2, t: 1 } }),
      T0,
    );
    let live = mergeLive(null, first.packet);
    const d = planPacket(
      first.mem,
      data({ SPY: { p: 1.5, t: 2, pc: 0.9 } }, T0 + 15_000),
      T0 + 15_000,
    );
    live = mergeLive(live, d.packet);
    expect(live.quotes.SPY.p).toBe(1.5);
    expect(live.quotes.QQQ.p).toBe(2);
    expect(live.count).toBe(2);
  });
  it("mergeLive: ativo mais velho num pacote novo não volta o preço no tempo", () => {
    const prev = { fetched_at: "2026-10-07T15:00:00Z", count: 1, quotes: { SPY: { p: 2, t: 20 } } };
    const old = {
      fetched_at: "2026-10-07T15:00:15Z",
      count: 2,
      quotes: { SPY: { p: 1, t: 10 }, QQQ: { p: 3, t: 10 } },
    };
    const m = mergeLive(prev, old);
    expect(m.quotes.SPY.p).toBe(2);
    expect(m.quotes.QQQ.p).toBe(3);
    // mesma hora do pregão, pós mais velho também não volta
    const p2 = {
      fetched_at: "2026-10-07T21:00:00Z",
      count: 1,
      quotes: { SPY: { p: 2, t: 20, xt: 50, xp: 2.1 } },
    };
    const o2 = {
      fetched_at: "2026-10-07T21:00:15Z",
      count: 1,
      quotes: { SPY: { p: 2, t: 20, xt: 40, xp: 2.0 } },
    };
    expect(mergeLive(p2, o2).quotes.SPY.xp).toBe(2.1);
  });
});

describe("feed-delta: contadores do dia", () => {
  it("soma por dia e guarda só os últimos dias", () => {
    let s = addStats(null, { runs: 1, yahoo_calls: 7 }, "2026-10-07");
    s = addStats(s, { runs: 1, yahoo_calls: 1, bytes_sent: 100 }, "2026-10-07");
    expect(s["2026-10-07"]).toMatchObject({ runs: 2, yahoo_calls: 8, bytes_sent: 100, packets: 0 });
    for (let d = 1; d <= 20; d++)
      s = addStats(s, { runs: 1 }, `2026-11-${String(d).padStart(2, "0")}`);
    expect(Object.keys(s)).toHaveLength(14);
    expect(s["2026-10-07"]).toBeUndefined();
  });
});
