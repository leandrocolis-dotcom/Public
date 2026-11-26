// Botão Atualizar BTG com duas contas do Claude: a principal primeiro; sem foto nova em 90 s, pede a 2ª conta.
import { afterEach, describe, expect, it, vi } from "vitest";

const calls = [];
let synced = "2026-11-25T16:42:51Z";
vi.mock("../assets/cloud.js", () => ({
  cloudUser: () => ({ id: "u" }),
  authMessage: (e) => String(e?.message ?? e),
  fireBtg: vi.fn(async (opt = {}) => {
    calls.push(opt.fallback ? "conta2" : "principal");
    return { ok: true, since: new Date().toISOString(), syncedAt: "2026-11-25T16:42:51Z", hasFallback: true }; // prettier-ignore
  }),
  pullBroker: vi.fn(async () => ({ syncedAt: synced, status: "ok" })),
}));
vi.mock("../assets/cloud-sync.js", () => ({ syncCloud: vi.fn(async () => true) }));
vi.mock("../assets/widgets.js", () => ({ toast: vi.fn() }));

afterEach(() => {
  vi.useRealTimers();
  calls.length = 0;
});

describe("btg: prioridade da conta principal e tentativa na 2ª conta", () => {
  it("principal grava a tempo: a 2ª conta não é chamada", async () => {
    vi.useFakeTimers();
    const { refreshBtg } = await import("../assets/btg-sync.js");
    const p = refreshBtg();
    await vi.advanceTimersByTimeAsync(8000);
    synced = new Date().toISOString();
    await vi.advanceTimersByTimeAsync(8000);
    await p;
    expect(calls).toEqual(["principal"]);
  });
  it("principal não grava em 90 s: pede a 2ª conta uma vez", async () => {
    vi.useFakeTimers();
    synced = "2026-11-25T16:42:51Z";
    const { refreshBtg, FALLBACK_AFTER_MS } = await import("../assets/btg-sync.js");
    const p = refreshBtg();
    await vi.advanceTimersByTimeAsync(FALLBACK_AFTER_MS + 5000);
    expect(calls).toEqual(["principal", "conta2"]);
    synced = new Date().toISOString();
    await vi.advanceTimersByTimeAsync(8000);
    await p;
    expect(calls).toEqual(["principal", "conta2"]);
  });
});
