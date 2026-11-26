import { describe, expect, it } from "vitest";
import {
  bandChanges,
  bandTrack,
  coherence,
  forward,
  intensity,
  lagProfile,
  reactionTimes,
  segments,
  spearman,
  zoneIdx,
  accuracyReport,
} from "../assets/pend-accuracy.js";
import { mergePoints, packJournal, unpackJournal } from "../scripts/pend-accuracy-study.mjs";

const T0 = 1_790_000_000;
/** Pontos a cada 5 min a partir de uma série de z; nota = f(z) com atraso de `lag` passos. */
function mk(zs, { lag = 0, k = 30, day = "2026-11-20", ses = "reg" } = {}) {
  return zs.map((z, i) => ({
    t: T0 + i * 300,
    z,
    s: Math.max(-100, Math.min(100, Math.round(k * zs[Math.max(0, i - lag)]))),
    day,
    ses,
    b: { eq: Math.round(k * zs[Math.max(0, i - lag)]) },
  }));
}
// passeio determinístico
const walk = (n, seed = 7) => {
  let x = 0;
  let r = seed;
  return Array.from({ length: n }, () => {
    r = (r * 1103515245 + 12345) % 2 ** 31;
    x += (r / 2 ** 31 - 0.5) * 0.3;
    return Math.round(x * 1000) / 1000;
  });
};

describe("pend-accuracy", () => {
  it("spearman e faixas", () => {
    expect(spearman([1, 2, 3, 4], [10, 20, 30, 40])).toBeCloseTo(1);
    expect(spearman([1, 2, 3, 4], [4, 3, 2, 1])).toBeCloseTo(-1);
    expect([-80, -40, 0, 40, 80].map(zoneIdx)).toEqual([0, 1, 2, 3, 4]);
  });

  it("segmenta por dia de referência e por buraco", () => {
    const a = mk([0, 0.1, 0.2]);
    const b = mk([0, 0.1], { day: "2026-11-21" }).map((p) => ({ ...p, t: p.t + 900 }));
    const gap = { ...a[2], t: a[2].t + 3600 };
    expect(segments([...a, ...b]).length).toBe(2);
    expect(segments([...a, gap]).length).toBe(2);
  });

  it("coerência 100% quando a nota segue o lado do SPY", () => {
    const c = coherence(mk([-1, -0.8, 0.9, 1.2, 0.1]));
    expect(c.active).toBe(4);
    expect(c.hitPct).toBe(100);
  });

  it("acha o atraso da nota na correlação cruzada", () => {
    const zs = walk(400);
    expect(lagProfile(mk(zs, { lag: 0 })).lagMin).toBe(0);
    expect(lagProfile(mk(zs, { lag: 2 })).lagMin).toBe(10);
  });

  it("reação a choque: nota atrasada 2 passos → 10 min de atraso", () => {
    const zs = [...Array(10).fill(0), 0.2, 0.4, 0.6, 0.8, 0.8, 0.8, 0.8, ...Array(20).fill(0.8)];
    const r = reactionTimes(mk(zs, { lag: 2, k: 60 }));
    expect(r.n).toBeGreaterThan(0);
    expect(r.medLagMin).toBeGreaterThan(0);
    const r0 = reactionTimes(mk(zs, { lag: 0, k: 60 }));
    expect(r0.medLagMin).toBeLessThanOrEqual(r.medLagMin);
  });

  it("histerese: só troca de faixa passando a fronteira por 5 pontos", () => {
    const sg = [0, 22, 24, 26, 18, 14].map((s, i) => ({ t: i, s }));
    expect(bandTrack(sg)).toEqual([2, 2, 2, 3, 3, 2]);
  });

  it("troca de faixa confirmada, tarde e com pouco a andar", () => {
    // SPY sobe de 0 a 1,2σ e depois fica parado; nota = 30·z → troca para Risco quando z ≥ 0,84
    const zs = [0, 0.2, 0.4, 0.6, 0.8, 0.9, 1.0, 1.1, 1.2, ...Array(14).fill(1.2)];
    const b = bandChanges(mk(zs));
    expect(b.n).toBe(1);
    const c = b.changes[0];
    expect(c.d).toBe(1);
    expect(c.lateMin).toBe(25);
    expect(c.whipsaw).toBe(false);
    expect(c.leftPct).toBeLessThan(40);
  });

  it("intensidade em ordem e acerto à frente", () => {
    const zs = walk(600, 3);
    const I = intensity(mk(zs));
    expect(I.r2).toBeGreaterThan(0.5);
    const F = forward(mk(zs));
    expect(F[30].n).toBeGreaterThanOrEqual(0);
    const rep = accuracyReport(mk(zs));
    expect(rep.blocks[0].id).toBe("eq");
    expect(rep.bySession.reg.n).toBe(600);
  });

  it("diário colunar ida e volta e mescla (o novo vence)", () => {
    const pts = mk([0.1, 0.2]).map(({ t, s, z, b }) => ({ t, s, z, b }));
    expect(unpackJournal(packJournal(pts))).toEqual(pts);
    const m = mergePoints(pts, [
      { ...pts[1], s: 99 },
      { ...pts[1], t: pts[1].t + 300 },
    ]);
    expect(m.map((p) => p.s)).toEqual([pts[0].s, 99, pts[1].s]);
  });
});

import {
  CURRENT,
  bootP,
  priceMomentum,
  radarStudy,
  rescore,
  splitByDay,
  weightGrid,
  weightStudy,
} from "../assets/pend-backtest.js";

describe("pend-backtest", () => {
  it("grade de pesos soma 1 e inclui o atual", () => {
    const g = weightGrid();
    expect(g.length).toBe(66);
    expect(g.every((w) => Math.abs(w.eq + w.cls + w.vol - 1) < 1e-9)).toBe(true);
    expect(g.some((w) => w.eq === CURRENT.eq && w.cls === CURRENT.cls)).toBe(true);
  });

  it("refaz a nota pelos blocos", () => {
    const p = [{ s: 0, b: { eq: 50, cls: -10, vol: 20 } }];
    expect(rescore(p, CURRENT)[0].s).toBe(20);
    expect(rescore(p, { eq: 1, cls: 0, vol: 0 })[0].s).toBe(50);
  });

  it("separa treino e teste por pregão", () => {
    const pts = ["a", "a", "b", "c"].map((day, i) => ({ day, t: i }));
    const s = splitByDay(pts, 2 / 3);
    expect(s.train.map((p) => p.day)).toEqual(["a", "a", "b"]);
    expect(s.test.map((p) => p.day)).toEqual(["c"]);
  });

  it("bootstrap: candidato sempre melhor → p 0; igual → p 1", () => {
    const cand = new Map([
      ["d1", [9, 10]],
      ["d2", [8, 10]],
    ]);
    const cur = new Map([
      ["d1", [5, 10]],
      ["d2", [4, 10]],
    ]);
    expect(bootP(cand, cur, 200)).toBe(0);
    expect(bootP(cur, cur, 200)).toBe(1);
  });

  it("estudos rodam ponta a ponta em dados sintéticos", () => {
    const zs = walk(900, 11);
    const pts = zs.map((z, i) => ({
      t: T0 + i * 300,
      z,
      s: Math.round(30 * z),
      day: `2026-11-${String(10 + Math.floor(i / 100)).padStart(2, "0")}`,
      ses: "reg",
      b: { eq: Math.round(35 * z), cls: Math.round(25 * z), vol: Math.round(30 * z) },
    }));
    const W = weightStudy(pts);
    expect(W.variants).toBe(66);
    expect(typeof W.approved).toBe("boolean");
    const R = radarStudy(pts);
    expect(R.band.n).toBeGreaterThanOrEqual(0);
    expect(R.confirmed.whipsawPct).toBeNull();
    expect(priceMomentum(pts).n).toBeGreaterThan(0);
  });
});
