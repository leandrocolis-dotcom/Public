import { describe, expect, it } from "vitest";
import { checkSnapshot } from "../scripts/btg-snapshot.mjs";

const asOf = "2026-11-22T21:48:39.601Z";
const now = Date.parse(asOf) + 60000;
const base = () => ({
  asOf,
  unsupported: null,
  fx: { ptax: 5.8883, date: "2026-11-18" },
  onshore: { total: 100, items: [{ name: "CDB", value: 100, date: "2026-11-19" }] },
  offshore: {
    totalUsd: 1100,
    investedUsd: 1000,
    cashUsd: 100,
    totalBrl: 6477,
    positions: [{ sym: "SOXS", qty: 10, avg: 90, price: 100, value: 1000, cost: 900 }],
  },
});
const change = (fn) => {
  const s = base();
  fn(s);
  return checkSnapshot(s, now);
};

describe("conferência da foto do BTG", () => {
  it("aceita foto coerente e grava só os campos permitidos", () => {
    const r = checkSnapshot({ ...base(), account: "123" }, now);
    expect(r.ok).toBe(true);
    expect(r.snap.account).toBeUndefined();
    expect(r.snap.offshore.positions[0].cost).toBe(900);
  });
  it("recusa número transcrito errado", () => {
    expect(change((s) => (s.offshore.positions[0].qty = 100)).ok).toBe(false);
    expect(change((s) => (s.offshore.positions[0].avg = 9)).ok).toBe(false);
    expect(change((s) => (s.offshore.cashUsd = 500)).ok).toBe(false);
    expect(change((s) => (s.onshore.total = 200)).ok).toBe(false);
  });
  it("recusa leitura parcial, antiga, ticker inválido e posição não suportada", () => {
    expect(change((s) => (s.offshore.positions = [])).ok).toBe(false);
    expect(change((s) => (s.asOf = "2026-11-20T00:00:00Z")).ok).toBe(false);
    expect(change((s) => (s.offshore.positions[0].sym = "A;DROP")).ok).toBe(false);
    expect(change((s) => (s.unsupported = "opção")).ok).toBe(false);
  });
  it("valor aplicado do Brasil é opcional e não pode ser negativo", () => {
    const r = change((s) => (s.onshore.items[0].cost = 90));
    expect(r.snap.onshore.items[0].cost).toBe(90);
    expect(
      change((s) => (s.onshore.items[0].cost = null)).snap.onshore.items[0].cost,
    ).toBeUndefined();
    expect(change((s) => (s.onshore.items[0].cost = -1)).ok).toBe(false);
  });
});
