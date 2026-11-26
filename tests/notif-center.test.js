import { describe, expect, it } from "vitest";
import { categoryOf, centerHtml, countByCat, noteHtml } from "../assets/notif-center.js";
import { topicTitle } from "../assets/notif-topics.js";

const log = [
  {
    at: 5,
    title: topicTitle("signal", "▲ Entrada · SPY"),
    body: "x",
    url: "./?tab=portfolio&hold=SPY",
  },
  { at: 4, title: topicTitle("news", "NVDA sobe"), url: "./?tab=news&news=1" },
  { at: 3, title: topicTitle("macro", "CPI"), url: "./?tab=macro" },
  { at: 2, title: topicTitle("trader", "XLE"), url: "./?tab=signals&asset=XLE" },
  { at: 1, title: topicTitle("level", "NVDA perto do stop") },
  { at: 0, title: "🔔 PÊNDULO · Olá" },
];

describe("central de notificações", () => {
  it("separa por categoria", () => {
    expect(log.map(categoryOf)).toEqual([
      "portfolio",
      "news",
      "macro",
      "trader",
      "portfolio",
      "other",
    ]);
    expect(categoryOf({ title: "📰 Carteira · SPY", url: "./?tab=news" })).toBe("news");
    expect(countByCat(log)).toMatchObject({
      all: 6,
      portfolio: 2,
      news: 1,
      macro: 1,
      trader: 1,
      other: 1,
    });
  });
  it("filtra a lista pela aba e escapa o texto", () => {
    const h = centerHtml([...log, { at: 9, title: "<b>x</b>", url: "./?tab=news" }], "news");
    expect(h).toContain("NVDA sobe");
    expect(h).not.toContain("CPI");
    expect(h).toContain("&lt;b&gt;x");
    expect(centerHtml([], "zzz")).toContain("Nenhuma notificação");
  });
  it("cartão fixo da notificação tocada tem o texto e o ✕", () => {
    const h = noteHtml({ title: "📈 SINAL · <SPY>", body: "Entrada" });
    expect(h).toContain("&lt;SPY&gt;");
    expect(h).toContain("Entrada");
    expect(h).toContain("data-nnote-close");
    expect(centerHtml(log)).toContain('data-nt="');
  });
});
