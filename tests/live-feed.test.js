import { describe, expect, it } from "vitest";
import {
  TOPIC,
  feedHealthy,
  feedSession,
  heartbeatMsg,
  joinMsg,
  mergeLive,
  parseFrame,
} from "../assets/live-feed.js";
import { usSession } from "../assets/refresh.js";

const pack = (at, quotes, extra = {}) => ({
  fetched_at: at,
  count: Object.keys(quotes).length,
  total: Object.keys(quotes).length,
  quotes,
  missing: [],
  ...extra,
});

describe("live-feed: protocolo", () => {
  it("monta join no canal público e heartbeat", () => {
    const j = joinMsg(1);
    expect(j).toMatchObject({ topic: TOPIC, event: "phx_join", ref: "1", join_ref: "1" });
    expect(j.payload.config.private).toBe(false);
    expect(heartbeatMsg(2)).toEqual({
      topic: "phoenix",
      event: "heartbeat",
      payload: {},
      ref: "2",
    });
  });

  it("reconhece entrada, pacote de cotações e erro", () => {
    const ok = {
      topic: TOPIC,
      event: "phx_reply",
      ref: "1",
      join_ref: "1",
      payload: { status: "ok" },
    };
    expect(parseFrame(JSON.stringify(ok))).toEqual({ kind: "joined" });
    const data = pack("2026-10-09T14:00:00Z", { SPY: { p: 1 } });
    const b = { topic: TOPIC, event: "broadcast", payload: { event: "quotes", payload: data } };
    expect(parseFrame(JSON.stringify(b))).toEqual({ kind: "quotes", data });
    expect(parseFrame(JSON.stringify({ topic: TOPIC, event: "phx_error", payload: {} }))).toEqual({
      kind: "error",
    });
  });

  it("ignora heartbeat, outro canal, evento desconhecido e texto inválido", () => {
    const hb = { topic: "phoenix", event: "phx_reply", ref: "2", payload: { status: "ok" } };
    expect(parseFrame(JSON.stringify(hb))).toBeNull();
    const other = { topic: TOPIC, event: "broadcast", payload: { event: "x", payload: {} } };
    expect(parseFrame(JSON.stringify(other))).toBeNull();
    expect(parseFrame("{nope")).toBeNull();
  });
});

describe("live-feed: mergeLive", () => {
  const prev = pack("2026-10-09T14:00:00Z", { SPY: { p: 1 }, XYZ: { p: 5 } });

  it("aplica o pacote novo e mantém extras que só o app tinha", () => {
    const m = mergeLive(prev, pack("2026-10-09T14:00:15Z", { SPY: { p: 2 } }));
    expect(m.quotes.SPY.p).toBe(2);
    expect(m.quotes.XYZ.p).toBe(5);
    expect(m.count).toBe(2);
    expect(m.total).toBeGreaterThanOrEqual(m.count);
    expect(m.fetched_at).toBe("2026-10-09T14:00:15Z");
  });

  it("pacote enxuto atualiza o preço e preserva os campos que só a busca normal traz", () => {
    const full = pack("2026-10-09T14:00:00Z", { SPY: { p: 1, h52: 9, n: "SPDR" } });
    const m = mergeLive(full, pack("2026-10-09T14:00:15Z", { SPY: { p: 2 } }));
    expect(m.quotes.SPY).toEqual({ p: 2, h52: 9, n: "SPDR" });
  });

  it("descarta pacote velho (fora de ordem) ou vazio", () => {
    expect(mergeLive(prev, pack("2026-10-09T13:59:00Z", { SPY: { p: 9 } }))).toBeNull();
    expect(mergeLive(prev, pack("2026-10-09T14:01:00Z", {}))).toBeNull();
    expect(mergeLive(prev, null)).toBeNull();
  });

  it("funciona sem cotação anterior e limpa 'missing' do que o app já tem", () => {
    expect(mergeLive(null, pack("2026-10-09T14:00:00Z", { SPY: { p: 1 } })).count).toBe(1);
    const m = mergeLive(
      prev,
      pack("2026-10-09T14:00:15Z", { SPY: { p: 2 } }, { missing: ["XYZ", "ABC"] }),
    );
    expect(m.missing).toEqual(["ABC"]);
  });
});

describe("live-feed: saúde do canal", () => {
  const now = Date.parse("2026-10-09T15:00:00Z");
  it("saudável só aberto, com pacote recente e algo negociando", () => {
    expect(feedHealthy({ joined: true, lastAt: now - 20_000 }, "open", now)).toBe(true);
    expect(feedHealthy({ joined: true, lastAt: now - 120_000 }, "open", now)).toBe(false);
    expect(feedHealthy({ joined: true, lastAt: now - 60_000 }, "pre", now)).toBe(true);
    expect(feedHealthy({ joined: true, lastAt: now - 120_000 }, "night", now)).toBe(true);
    expect(feedHealthy({ joined: false, lastAt: now }, "open", now)).toBe(false);
    expect(feedHealthy({ joined: true, lastAt: now }, null, now)).toBe(false);
    expect(feedHealthy({ joined: true, lastAt: 0 }, "open", now)).toBe(false);
  });
});

describe("live-feed: sessão do canal (bolsa + futuros à noite)", () => {
  // Nova York em UTC-4; 7/out/2026 é quarta
  const at = (hhmm, day = "2026-10-07") => Date.parse(`${day}T${hhmm}:00-04:00`);
  const s = (hhmm, day) => feedSession(at(hhmm, day), usSession);
  it("pré, pregão e pós seguem a bolsa", () => {
    expect(s("05:00")).toBe("pre");
    expect(s("10:00")).toBe("open");
    expect(s("17:00")).toBe("post");
  });
  it("noite de dia útil e domingo depois das 18:00 = futuros", () => {
    expect(s("22:00")).toBe("night");
    expect(s("02:00")).toBe("night");
    expect(s("19:00", "2026-10-11")).toBe("night"); // domingo
    expect(s("02:00", "2026-10-12")).toBe("night"); // segunda de madrugada
  });
  it("sexta à noite, sábado e domingo de dia = nada", () => {
    expect(s("21:00", "2026-10-09")).toBeNull();
    expect(s("12:00", "2026-10-10")).toBeNull();
    expect(s("12:00", "2026-10-11")).toBeNull();
  });
});
