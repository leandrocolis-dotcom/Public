import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { momLineHtml, momStudyHtml } from "../assets/momentum-study.js";

const data = JSON.parse(readFileSync(new URL("../data/momentum-universe-study.json", import.meta.url), "utf8")); // prettier-ignore

describe("estudo F35 (momentum 12-1)", () => {
  it("JSON traz o estudo e a foto de hoje", () => {
    expect(data.groups.SINGLE.approved).toBe(false);
    expect(data.groups.ETF.approved).toBe(false);
    expect(Object.keys(data.all).length).toBeGreaterThan(300);
    for (const g of ["SINGLE", "ETF"])
      for (const x of data.today[g].top) expect(data.all[x.s].pass).toBe(x.dist200 > 0);
  });
  it("linha da página do ativo", () => {
    const d = { regimeToday: { date: "2026-10-12" }, today: { ETF: { n: 155 } }, all: { SMH: { g: "ETF", pct: 0.955, mom: 0.652, above: true, pass: true } } }; // prettier-ignore
    const h = momLineHtml("SMH", d);
    expect(h).toContain("Percentil <b>96º</b> entre 155 ETFs");
    expect(h).toContain("Passa na regra");
    expect(h).toContain("não é recomendação");
    expect(momLineHtml("XYZ", d)).toBe("");
    expect(momLineHtml("SMH", null)).toBe("");
    d.all.SMH = { ...d.all.SMH, above: false, pass: false };
    expect(momLineHtml("SMH", d)).toContain("Top 20%, mas abaixo da MM200");
  });
  it("painel do Aprendizado mostra o veredito e quem passa", () => {
    const h = momStudyHtml(data);
    expect(h).toContain("Reprovado");
    const n = Object.values(data.all).filter((x) => x.pass && x.g === "SINGLE").length;
    expect(h).toContain(`Quem passa na regra hoje (${n} ações`);
    expect(momStudyHtml(null)).toBe("");
  });
});
