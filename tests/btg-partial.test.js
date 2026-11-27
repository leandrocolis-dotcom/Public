// Foto parcial do BTG (27/11/2026): o conector deixou de trazer as posições do exterior ativo a ativo.
import { describe, expect, it } from "vitest";
import { checkSnapshot, fetchPtax } from "../scripts/btg-snapshot.mjs";
import { manualActive, positionsAsOf } from "../assets/btg.js";
import { btgFailMsg, btgTryFailed } from "../assets/btg-sync.js";

const asOf = "2026-11-27T01:50:00.000Z";
const now = Date.parse(asOf) + 60000;
const partial = () => ({
  asOf,
  unsupported: null,
  keepPositions: true,
  fx: { ptax: 5.5, date: "2026-11-26" },
  onshore: { total: 100, items: [{ name: "CDB", value: 100, date: "2026-11-26" }] },
  offshore: { totalUsd: 1100, investedUsd: 1000, cashUsd: 100, totalBrl: 1100 * 5.5, positions: null }, // prettier-ignore
});

describe("foto parcial do BTG", () => {
  it("aceita Brasil + totais do exterior e marca as posições como antigas", () => {
    const r = checkSnapshot(partial(), now);
    expect(r.ok).toBe(true);
    expect(r.snap.offshore.positions).toBeNull();
    expect(r.snap.offshore.positionsStale).toBe(true);
  });
  it("sem o pedido explícito (keepPositions), foto sem posições segue recusada", () => {
    const s = partial();
    delete s.keepPositions;
    expect(checkSnapshot(s, now).ok).toBe(false);
  });
  it("recusa total em reais que não fecha com a PTAX e câmbio ausente", () => {
    expect(checkSnapshot({ ...partial(), offshore: { ...partial().offshore, totalBrl: 1000 } }, now).ok).toBe(false); // prettier-ignore
    expect(checkSnapshot({ ...partial(), fx: null }, now).ok).toBe(false);
  });
  it("ajuste manual vale até chegar foto COM posições mais novas", () => {
    const row = {
      asOf: "2026-11-27T01:50:00Z",
      summary: { offshore: { positionsStale: true, positionsAsOf: "2026-11-25T18:24:37Z" } },
    };
    expect(positionsAsOf(row)).toBe("2026-11-25T18:24:37Z");
    expect(manualActive(row, { baseAsOf: "2026-11-25T18:24:37Z" })).toBe(true);
    expect(manualActive({ asOf: "2026-11-28T13:00:00Z", summary: { offshore: {} } }, { baseAsOf: "2026-11-25T18:24:37Z" })).toBe(false); // prettier-ignore
  });
  it("PTAX do Banco Central: pula dia sem cotação", async () => {
    const calls = [];
    const get = async (url) => {
      calls.push(url);
      return calls.length < 2
        ? { ok: true, json: async () => ({ value: [] }) }
        : { ok: true, json: async () => ({ value: [{ cotacaoVenda: 5.5, dataHoraCotacao: "2026-11-26 13:08:22.111" }] }) }; // prettier-ignore
    };
    expect(await fetchPtax(new Date("2026-11-27T12:00:00Z"), get)).toEqual({ ptax: 5.5, date: "2026-11-26" }); // prettier-ignore
    expect(calls[0]).toContain("11-27-2026");
    expect(calls[1]).toContain("11-26-2026");
  });
});

describe("botão Atualizar BTG", () => {
  const since = "2026-11-27T01:45:00Z";
  it("para de esperar quando a rotina anota a falha depois do disparo", () => {
    expect(btgTryFailed({ tryAt: "2026-11-27T01:46:00Z", tryDetail: "conector BTG desconectado", syncedAt: "2026-11-25T18:25:04Z" }, since)).toBe("conector BTG desconectado"); // prettier-ignore
    expect(btgTryFailed({ tryAt: "2026-11-27T01:00:00Z", tryDetail: "velho" }, since)).toBeNull();
    expect(btgTryFailed({ tryAt: "2026-11-27T01:46:00Z", tryDetail: "x", syncedAt: "2026-11-27T01:47:00Z" }, since)).toBeNull(); // prettier-ignore
  });
  it("rotina pausada ou token recusado dizem o que fazer", () => {
    expect(btgFailMsg("rotina recusou (HTTP 400: Routine is paused.)")).toMatch(/pausada/);
    expect(btgFailMsg("rotina recusou (HTTP 401, authentication_error)")).toMatch(/token/);
  });
});

describe("conferência das quantidades com o total do BTG", async () => {
  const { qtyCheck } = await import("../assets/btg.js");
  const photo = Date.parse("2026-11-27T01:55:00Z"); // noite: sem pregão até agora
  it("bate dentro de 3% e acusa diferença maior", () => {
    expect(qtyCheck(1000, 1020, photo, photo + 3600e3)).toMatchObject({ ok: true });
    expect(qtyCheck(1000, 1100, photo, photo + 3600e3)).toMatchObject({ ok: false });
  });
  it("não compara quando houve pregão entre a leitura e agora", () => {
    const day = Date.parse("2026-11-25T15:00:00Z"); // 10h de NY, pregão aberto
    expect(qtyCheck(1000, 1100, day - 2 * 3600e3, day)).toBeNull();
    // leitura de 10 min atrás: compara mesmo com pregão aberto
    expect(qtyCheck(1000, 1100, day - 10 * 60e3, day)).toMatchObject({ ok: false });
  });
});

describe("importação com conta BTG", async () => {
  const { nextManual, manualActive: active } = await import("../assets/btg.js");
  it("vale por cima da foto parcial e sai quando o BTG manda posições mais novas", () => {
    const stale = { asOf: "2026-11-27T19:49:22Z", summary: { offshore: { positionsStale: true, positionsAsOf: "2026-11-25T18:24:37Z" } } }; // prettier-ignore
    const m = nextManual(stale, null, {});
    expect(active(stale, m)).toBe(true);
    const full = {
      asOf: "2026-11-28T14:00:00Z",
      summary: { asOf: "2026-11-28T14:00:00Z", offshore: {} },
    };
    expect(active(full, m)).toBe(false);
  });
});
