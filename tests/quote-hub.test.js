// Central de cotações (assets/quote-hub.js): união de pedidos, sem o que o canal cobre, blocos estáveis de 60,
// validade por ativo, erro registrado por ativo, presença em ordem de prioridade; mesma cotação para todas as telas.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { demandSyms, fetchQuotes, hub, hubErrors, needFetch, want } from "../assets/quote-hub.js";
import { snapshotUsable } from "../assets/live-feed.js";
import { state } from "../assets/state.js";

const calls = [];
function fakeFetch(url) {
  const u = new URL(url, "http://x");
  const syms = u.searchParams.get("extra").split(",");
  calls.push(syms);
  if (syms.includes("BOOM")) return Promise.resolve(new Response("x", { status: 500 }));
  const quotes = Object.fromEntries(
    syms.filter((s) => s !== "NOPE").map((s) => [s, { p: 10, pc: 8, t: 1_790_000_000 }]),
  );
  return Promise.resolve(new Response(JSON.stringify({ quotes }), { status: 200 }));
}

beforeEach(() => {
  calls.length = 0;
  Object.assign(hub, { quotes: {}, at: {}, err: {}, inflight: new Set(), wants: new Map() });
  state.live = null;
  vi.stubGlobal("fetch", vi.fn(fakeFetch));
});
afterEach(() => vi.unstubAllGlobals());

describe("quote-hub: o que buscar", () => {
  it("tira o que o canal cobre, o que está válido e o que já está sendo buscado", () => {
    const now = 1_000_000;
    const need = needFetch(["A", "B", "C", "D", "A"], {
      now,
      at: { B: now - 10_000, C: now - 90_000 },
      inflight: new Set(["D"]),
      live: (s) => (s === "A" ? { p: 1 } : null),
    });
    expect(need).toEqual(["C"]);
    expect(needFetch(["B"], { now, at: { B: now - 10_000 }, force: true })).toEqual(["B"]);
  });
});

describe("quote-hub: busca", () => {
  it("blocos de 60 (1 consulta ao Yahoo), devolve a mesma cotação do /api/quotes", async () => {
    const syms = Array.from({ length: 130 }, (_, i) => `S${String(i).padStart(3, "0")}`);
    const r = await fetchQuotes(syms);
    expect(calls.map((c) => c.length)).toEqual([60, 60, 10]);
    expect(r.fetched).toBe(130);
    expect(r.quotes.S000).toEqual({ p: 10, pc: 8, t: 1_790_000_000 }); // p / pc intactos
  });
  it("2ª chamada dentro da validade não busca; o canal recente prevalece", async () => {
    await fetchQuotes(["X", "Y"]);
    state.live = { fetched_at: new Date().toISOString(), quotes: { Y: { p: 99, pc: 90 } } };
    const r = await fetchQuotes(["X", "Y"]);
    expect(calls).toHaveLength(1);
    expect(r.fetched).toBe(0);
    expect(r.quotes.Y.p).toBe(99);
  });
  it("canal velho (> 90 s) não conta como cobertura", async () => {
    state.live = {
      fetched_at: new Date(Date.now() - 120_000).toISOString(),
      quotes: { Z: { p: 1 } },
    };
    await fetchQuotes(["Z"]);
    expect(calls).toEqual([["Z"]]);
  });
  it("erro fica registrado por ativo (falha da função e ativo sem cotação)", async () => {
    await fetchQuotes(["BOOM"]);
    await fetchQuotes(["NOPE"]);
    const errs = Object.fromEntries(hubErrors());
    expect(errs.BOOM.msg).toBeTruthy();
    expect(errs.NOPE.msg).toMatch(/sem cotação/);
  });
});

describe("quote-hub: presença", () => {
  it("carteira primeiro, depois a tela mais recente; até 80; pedidos velhos saem", () => {
    const now = 10_000_000;
    want("watch", ["AAA", "BBB"], now - 60_000);
    want("panel", ["CCC"], now - 1_000);
    want("old", ["ZZZ"], now - 10 * 60_000);
    expect(demandSyms(now, ["HELD", "BBB"])).toEqual(["HELD", "BBB", "CCC", "AAA"]);
    want(
      "big",
      Array.from({ length: 200 }, (_, i) => `B${i}`),
      now,
    );
    expect(demandSyms(now)).toHaveLength(80);
  });
});

describe("snapshotUsable: abrir com a foto do servidor", () => {
  const now = Date.parse("2026-10-07T15:00:00Z");
  const snap = (at, quotes = { SPY: { p: 1 } }) => ({ at, data: { count: 1, quotes } });
  it("foto recente que cobre a carteira serve; velha ou sem a carteira, não", () => {
    expect(snapshotUsable(snap("2026-10-07T14:59:00Z"), now, ["SPY"])).toBe(true);
    expect(snapshotUsable(snap("2026-10-07T14:57:00Z"), now)).toBe(false);
    expect(snapshotUsable(snap("2026-10-07T14:59:00Z"), now, ["PETR4.SA"])).toBe(false);
    expect(snapshotUsable({ at: "2026-10-07T14:59:00Z", data: null }, now)).toBe(false);
    expect(snapshotUsable(null, now)).toBe(false);
  });
});
