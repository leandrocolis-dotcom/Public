import { describe, expect, it } from "vitest";
import { captureRatios, portfolioPendulum, targetBeta } from "../assets/port-pendulum.js";

const bias = (netBeta) => ({
  ok: true,
  score: Math.round(50 * netBeta),
  netBeta,
  coverage: 1,
  missing: [],
});

describe("pêndulo da carteira", () => {
  it("beta-alvo para carteira comprada: 0,2 na defesa forte, 0,7 no neutro, 1,2 no risco forte", () => {
    expect(targetBeta(-100)).toBeCloseTo(0.2);
    expect(targetBeta(0)).toBeCloseTo(0.7);
    expect(targetBeta(100)).toBeCloseTo(1.2);
    expect(targetBeta(-46)).toBeCloseTo(0.47);
  });
  it("mercado em defesa e carteira com beta 1,1: mais exposta que o cenário, sinergia baixa", () => {
    const p = portfolioPendulum({ bias: bias(1.1), market: -46, total: 100000 });
    expect(p.posture).toBe(55);
    expect(p.zone.key).toBe("rk");
    expect(p.read.key).toBe("hot");
    expect(p.read.move).toBeCloseTo((1.1 - 0.47) * 100000, 0);
    expect(p.synergy).toBeLessThan(45);
  });
  it("carteira no alvo, assimétrica e com alfa: em sintonia", () => {
    const p = portfolioPendulum({
      bias: bias(0.5),
      market: -40,
      capture: { up: 0.9, down: 0.6 },
      day: { port: 0.002, spy: -0.01 },
    });
    expect(p.read.key).toBe("ok");
    expect(p.alpha).toBeCloseTo(0.007, 6);
    expect(p.synergy).toBeGreaterThanOrEqual(70);
    expect(p.level.key).toBe("ok");
  });
  it("sem mercado nem histórico: só a postura, sem quebrar", () => {
    const p = portfolioPendulum({ bias: bias(0.8) });
    expect(p.ok).toBe(true);
    expect(p.synergy).toBeNull();
    expect(portfolioPendulum({ bias: { ok: false, coverage: 0.2 } }).ok).toBe(false);
  });
  it("captura de alta e de queda contra o S&P", () => {
    const dates = Array.from({ length: 40 }, (_, i) => `2026-01-${String(i + 1).padStart(2, "0")}`);
    let s = 100;
    let a = 100;
    const spy = [];
    const aaa = [];
    dates.forEach((_, i) => {
      const r = i % 2 ? 0.01 : -0.01;
      s *= 1 + r;
      a *= 1 + (r > 0 ? 1.2 * r : 0.5 * r); // sobe 120%, cai 50%
      spy.push(s);
      aaa.push(a);
    });
    const c = captureRatios([{ sym: "AAA", weight: 1 }], {
      SPY: { dates, close: spy },
      AAA: { dates, close: aaa },
    });
    expect(c.up).toBeCloseTo(1.2, 6);
    expect(c.down).toBeCloseTo(0.5, 6);
  });
});

describe("detalhe do pêndulo da carteira em linhas", () => {
  it("abre a sinergia nas 3 partes e separa exposição e comportamento", async () => {
    const { portPendHtml } = await import("../assets/home-view.js");
    const p = portfolioPendulum({
      bias: bias(1.1),
      market: -46,
      total: 100000,
      capture: { up: 1.05, down: 0.9, days: 63, coverage: 1 },
      day: { port: 0.012, spy: 0.01 },
    });
    const html = portPendHtml(p);
    expect(html).toContain("Como se forma a sinergia");
    expect(html).toContain("Alinhamento ao alvo");
    expect(html).toContain("Assimetria de captura");
    expect(html).toContain("Exposição × cenário");
    expect(html).toContain("Distância ao alvo");
    expect(html).toContain("Captura na queda");
    expect((html.match(/class="hm-dr"/g) ?? []).length).toBeGreaterThanOrEqual(10);
    // os pontos somados pelas partes fecham a nota de sinergia
    const pts = [...html.matchAll(/soma (\d+) pts/g)].reduce((a, m) => a + Number(m[1]), 0);
    expect(Math.abs(pts - p.synergy)).toBeLessThanOrEqual(2);
  });
});
