import { describe, it, expect } from "vitest";
import { assetExposure, rankImpact, scoreItem, toneOf } from "../assets/news-impact.js";
import { impactCardHtml } from "../assets/analysis-context.js";

const xom = assetExposure("XOM", { profile: { name: "Exxon Mobil Corporation", sector: "Energy", industry: "Oil & Gas Integrated", country: "United States" } }); // prettier-ignore
const dal = assetExposure("DAL", { profile: { name: "Delta Air Lines, Inc.", sector: "Industrials", industry: "Airlines" } }); // prettier-ignore
const nvda = assetExposure("NVDA", { profile: { name: "NVIDIA Corporation", sector: "Technology", industry: "Semiconductors" } }); // prettier-ignore
const sqqq = assetExposure("SQQQ", { profile: { name: "ProShares UltraPro Short QQQ" } }, { kind: "INV", label: "MKT.US.LARGE" }); // prettier-ignore

describe("notícias × ativo", () => {
  it("tom do dicionário", () => {
    expect(toneOf("Nvidia beats estimates and raises guidance")).toBe(1);
    expect(toneOf("Company plunges after SEC charges")).toBe(-1);
    expect(toneOf("Markets mixed ahead of data")).toBe(0);
  });
  it("manchete da empresa vale mais e segue o tom", () => {
    const s = scoreItem({ title: "Nvidia beats estimates, raises guidance on AI demand" }, nvda);
    expect(s.tier).toBe("Empresa");
    expect(s.score).toBe(10);
    expect(scoreItem({ title: "Exxon downgraded at Goldman" }, xom).score).toBeLessThan(0);
  });
  it("geopolítica tem efeito oposto por setor", () => {
    const t = { title: "Iran strikes tanker near Strait of Hormuz as tensions escalate" };
    const a = scoreItem(t, xom);
    const b = scoreItem(t, dal);
    expect(a.score).toBeGreaterThan(0);
    expect(b.score).toBeLessThan(0);
    expect(a.geo).toBe(true);
  });
  it("tensão com Taiwan pesa contra chips; inverso troca o sinal", () => {
    expect(
      scoreItem({ title: "US widens chip export controls on China" }, nvda).score,
    ).toBeLessThan(0);
    const fed = { title: "Fed cuts rates, Powell signals more easing" };
    expect(scoreItem(fed, sqqq).score).toBeLessThan(0);
  });
  it("sem relação: fica de fora; ranking e saldo", () => {
    expect(scoreItem({ title: "Local bakery opens new store" }, xom)).toBeNull();
    const now = 1_800_000_000;
    const rk = rankImpact(
      [
        { title: "Exxon beats estimates on record profit", t: now - 3600 },
        { title: "Oil prices surge as OPEC+ cuts output", t: now - 7200 },
        { title: "Exxon beats estimates on record profit", t: now - 3600 },
        { title: "Old Exxon news", t: now - 30 * 86400 },
      ],
      xom,
      now,
    );
    expect(rk.items.length).toBe(2);
    expect(rk.balance).toBeGreaterThan(0);
    const h = impactCardHtml("XOM", rk);
    expect(h).toContain("Saldo +");
    expect(h).toContain("modo sombra");
  });
});
