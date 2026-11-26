import { describe, it, expect } from "vitest";
import { newsAlerts, NEWS_PER_DAY } from "../scripts/lib/push-alerts.mjs";
import { newsSig, sameStory } from "../assets/news.js";

const now = Date.UTC(2026, 10, 6, 15) / 1000;
const item = (id, title, source = "Reuters", dt = 0) => ({ id, title, source, t: now - 600 + dt });
const hold = [{ sym: "SOXL", qty: 1 }]; // Micron entra pelo tema semicondutores
// simula o ciclo do push: cada rodada registra a chave e as coberturas
function run(items, sent) {
  const out = newsAlerts(hold, items, { nowSec: now, sent });
  for (const a of out) [a.key, ...a.covers].forEach((k) => sent.add(k));
  return out;
}

describe("notícia da carteira no push: a mesma história só uma vez", () => {
  it("títulos diferentes da mesma história contam como uma só", () => {
    const a = newsSig({
      title: "Micron shares jump after record quarterly revenue forecast beats estimates",
    });
    const b = newsSig({ title: "Micron shares jump on record revenue forecast - Bloomberg" });
    expect(sameStory(a, b)).toBe(true);
    const c = newsSig({ title: "Fed holds rates steady as inflation cools" });
    expect(sameStory(a, c)).toBe(false);
  });
  it("versões da mesma notícia em rodadas seguidas avisam uma vez", () => {
    const sent = new Set();
    const r1 = run(
      [item("a", "Micron stock jumps after record revenue forecast beats estimates")],
      sent,
    );
    const r2 = run(
      [item("b", "Micron stock jumps on record revenue forecast, beats estimates", "CNBC", 60)],
      sent,
    );
    const r3 = run(
      [item("c", "Micron (MU) stock jumps after record revenue forecast", "Yahoo", 120)],
      sent,
    );
    expect(r1.length).toBe(1);
    expect(r2.length + r3.length).toBe(0);
  });
  it("no máximo NEWS_PER_DAY avisos de notícia por ativo por dia", () => {
    const sent = new Set();
    const titles = [
      "Micron stock jumps after earnings beat",
      "Micron announces new memory plant in Idaho with investment",
      "Analysts raise Micron price target on AI demand",
      "Micron CEO says HBM supply sold out through next year",
    ];
    const n = titles.map((t, i) => run([item(`x${i}`, t, "Reuters", i * 60)], sent).length);
    expect(n.reduce((s, x) => s + x, 0)).toBe(NEWS_PER_DAY);
  });
});
