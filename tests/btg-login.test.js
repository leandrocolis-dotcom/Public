// Login do conector BTG (dura 6 h): push "🔑 Reconectar BTG" na falha de login e "⏳ expira" 20 min antes.
import { describe, expect, it } from "vitest";
import { btgLoginAlerts, loginLost, loginWindow } from "../assets/btg-login.js";
import { btgParts } from "../assets/btg.js";

const T = (s) => Date.parse(s);
// quinta 27/11/2026, 15h00 UTC = 12h00 de Brasília
const NOW = T("2026-11-27T15:00:00Z");
const failed = {
  synced_at: "2026-11-27T01:50:00Z",
  try_at: "2026-11-27T13:41:00Z",
  try_detail: "BTGPactual connected again with its existing sign-in and was refused",
};

describe("loginLost", () => {
  it("falha de login depois da última foto boa", () => {
    expect(loginLost(failed)).toBe(T(failed.try_at));
  });
  it("outra falha (conferência) não é login", () => {
    expect(loginLost({ ...failed, try_detail: "soma difere 3% do total" })).toBeNull();
  });
  it("foto boa depois da falha ou Reconectei depois da falha", () => {
    expect(loginLost({ ...failed, synced_at: "2026-11-27T14:00:00Z" })).toBeNull();
    expect(loginLost({ ...failed, login_at: "2026-11-27T14:00:00Z" })).toBeNull();
  });
  it("aceita a linha do app (camelCase)", () => {
    expect(loginLost({ syncedAt: failed.synced_at, tryAt: failed.try_at, tryDetail: "BTG indisponível na sessão agendada" })).toBe(T(failed.try_at)); // prettier-ignore
  });
});

describe("btgLoginAlerts", () => {
  it("avisa a queda uma vez (chave pela hora da falha)", () => {
    const [a] = btgLoginAlerts(failed, {}, new Set(), NOW);
    expect(a.title).toBe("🔑 Reconectar BTG");
    expect(a.key).toBe("btg-login:2026-11-27T13:41:00.000Z");
    expect(a.url).toBe("./?tab=portfolio");
    expect(btgLoginAlerts(failed, {}, new Set([a.key]), NOW)).toEqual([]);
  });
  it("desligado nas preferências", () => {
    expect(btgLoginAlerts(failed, { btglogin: false }, new Set(), NOW)).toEqual([]);
  });
  it("lembrete 20 min antes das 6 h do Reconectei", () => {
    const row = { synced_at: "2026-11-27T09:01:00Z", login_at: "2026-11-27T09:00:00Z" };
    expect(loginWindow(row, NOW).left).toBe(0);
    expect(btgLoginAlerts(row, {}, new Set(), T("2026-11-27T14:30:00Z"))).toEqual([]); // faltam 30 min
    const [a] = btgLoginAlerts(row, {}, new Set(), T("2026-11-27T14:45:00Z"));
    expect(a.title).toBe("⏳ Login do BTG expira em 15 min");
    expect(a.key).toBe("btg-exp:2026-11-27T09:00:00.000Z");
    expect(btgLoginAlerts(row, {}, new Set(), NOW)).toEqual([]); // já expirou: a falha da leitura avisa
  });
  it("sem lembrete de madrugada em Brasília", () => {
    const row = { login_at: "2026-11-26T23:00:00Z" }; // expira 05h00 UTC = 02h00 de Brasília
    expect(btgLoginAlerts(row, {}, new Set(), T("2026-11-27T04:50:00Z"))).toEqual([]);
  });
});

describe("cartão Contas BTG", () => {
  const row = {
    asOf: "2026-11-27T01:50:00Z",
    syncedAt: failed.synced_at,
    tryAt: failed.try_at,
    tryDetail: failed.try_detail,
    status: "ok",
    summary: { onshore: { items: [] }, offshore: { positions: [] } },
  };
  it("login caído: como reconectar + Reconectei", () => {
    const p = btgParts(row, NOW);
    expect(p.card).toContain("🔑 O login do conector BTG caiu");
    expect(p.card).toContain('data-action="btg-reconnected"');
    expect(p.card).toContain("claude.ai/settings/connectors");
    expect(p.card).not.toContain("Última tentativa de leitura não gravou");
  });
  it("login válido: hora do fim na linha de status", () => {
    const p = btgParts(
      { ...row, tryAt: null, tryDetail: null, loginAt: "2026-11-27T14:00:00Z" },
      NOW,
    );
    expect(p.card).toContain("login BTG até");
    expect(p.card).not.toContain("btg-reconnected");
  });
});
