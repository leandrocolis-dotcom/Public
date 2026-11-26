import { describe, expect, it } from "vitest";
import { isNews, linkFor, mergeLog } from "../assets/notif-log.js";
import { alertsFor } from "../scripts/lib/push-alerts.mjs";

describe("histórico de avisos", () => {
  it("guarda notícias (central do sino), tira repetidos e ordena do mais novo", () => {
    const l = mergeLog(
      [{ at: 1, title: "▲ Entrada · SPY", body: "x" }],
      [
        { at: 5, title: "📰 Carteira · SPY", body: "n", url: "./?tab=news" },
        { at: 2, title: "▲ Entrada · SPY", body: "x" },
        { at: 9, title: "🔴 NVDA · Perto do stop", body: "y" },
      ],
    );
    expect(l.map((x) => x.title)).toEqual([
      "🔴 NVDA · Perto do stop",
      "📰 Carteira · SPY",
      "▲ Entrada · SPY",
    ]);
    expect(isNews({ title: "a", url: "./?tab=news" })).toBe(true);
  });
  it("link leva ao ativo", () => {
    expect(linkFor({ tab: "portfolio", hold: "NVDA" })).toBe("./?tab=portfolio&hold=NVDA");
    expect(linkFor({ asset: "XLE" })).toBe("./?tab=signals&asset=XLE");
  });
  it("push de sinal da carteira aponta para o ativo", () => {
    const close = Array.from(
      { length: 260 },
      (_, i) => 100 + Math.sin(i / 3) * 5 - (i > 250 ? 20 : 0),
    );
    const dates = close.map((_, i) => `2026-01-${String(i).padStart(3, "0")}`);
    const { all } = alertsFor({ holdings: [{ sym: "SPY", qty: 1 }], live: { SPY: { close, dates } }, news: [], prefs: { news: "off" } }); // prettier-ignore
    for (const a of all) expect(a.url).toBe("./?tab=portfolio&hold=SPY");
  });
});
