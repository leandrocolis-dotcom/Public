import { describe, it, expect } from "vitest";
import { speedCode, reversalCode, rsRatio, tailOn, dailySpeeds, dailyEntries, cutSeries, sessionSpeeds, sessionEntries, latestSessionSpeeds, barDays, isoOfDay, speedModel, speedCodeLabel, SPEED_H } from "../assets/speed-learn.js"; // prettier-ignore
import { dailyTail } from "../assets/watchlist.js";
import { speedLevel } from "../assets/rot-intraday.js";

const sp = (rel, vx, quadrant = "Liderando") => ({
  rel,
  vx,
  vy: 0,
  level: speedLevel(rel),
  quadrant,
});

describe("código do gatilho de velocidade", () => {
  it("só rápido e muito rápido; sentido pela força", () => {
    expect(speedCode(sp(1.6, 0.3))).toEqual({ c: "up-fast", o: "buy", r: 1 });
    expect(speedCode(sp(3.2, -0.5), "pre")).toEqual({ c: "pre-dn-vfast", o: "sell", r: -1 });
    expect(speedCode(sp(1.2, 0.3))).toBeNull();
    expect(speedCode(null)).toBeNull();
  });
  it("hipótese de repique: queda muito rápida em Perdendo força vira compra", () => {
    expect(reversalCode(sp(3.5, -0.4, "Perdendo força"))).toEqual({ c: "rev-pf", o: "buy", r: 1 });
    expect(reversalCode(sp(1.8, -0.4, "Perdendo força"))).toBeNull();
    expect(reversalCode(sp(3.5, -0.4, "Atrasado"))).toBeNull();
    expect(reversalCode(sp(3.5, 0.4, "Perdendo força"))).toBeNull();
  });
  it("rótulos legíveis", () => {
    expect(speedCodeLabel("pre-up-vfast")).toBe("Pré-mercado · força subindo muito rápido (≥ 3x)");
    expect(speedCodeLabel("dn-fast")).toBe("Fechamento · força caindo rápido (≥ 1,5x)");
    expect(speedCodeLabel("rev-pf")).toMatch(/repique/);
  });
});

describe("diário: força relativa pré-calculada", () => {
  const dates = Array.from({ length: 140 }, (_, i) => `2026-${String(1 + Math.floor(i / 28)).padStart(2, "0")}-${String(1 + (i % 28)).padStart(2, "0")}`); // prettier-ignore
  const bench = { dates, c: dates.map((_, i) => 100 + Math.sin(i / 7)) };
  const mk = (f) => ({ dates, c: dates.map((_, i) => f(i)) });
  it("mesma cauda da Watchlist (dailyTail)", () => {
    const a = mk((i) => 50 * 1.003 ** i + Math.cos(i / 3));
    const rr = rsRatio(a, bench);
    const t1 = tailOn(rr, dates.at(-1));
    const t2 = dailyTail({ dates, close: a.c }, { dates, close: bench.c });
    expect(t1.map((p) => p.x)).toEqual(t2.map((p) => expect.closeTo(p.x, 9)));
    expect(t1.at(-1).date).toBe(dates.at(-1));
  });
  it("quem dispara contra o resto vira gatilho de compra; horizonte de 10 pregões", () => {
    const ratios = {};
    for (let k = 0; k < 12; k++) ratios[`S${k}`] = rsRatio(mk((i) => 100 + k * 0.01 * i + Math.sin(i / 5 + k)), bench); // prettier-ignore
    ratios.ROCKET = rsRatio(
      mk((i) => (i < 120 ? 100 : 100 * 1.02 ** (i - 120))),
      bench,
    );
    const d = dates.at(-1);
    const speeds = dailySpeeds(ratios, d);
    expect(speeds.ROCKET.rel).toBeGreaterThan(1.5);
    const es = dailyEntries(speeds, d, () => ({ p: 1, k: 0.05 }));
    const r = es.find((e) => e.s === "ROCKET");
    expect(r).toMatchObject({ t: "spd", h: SPEED_H.spd, o: "buy", r: 1 });
    expect(SPEED_H.spd).toBe(10);
    expect(dailyEntries(speeds, d, () => null)).toEqual([]);
  });
});

describe("sessões: pré, pregão e pós", () => {
  // dois dias de barras de 5 min (fuso de NY no inverno: −5 h), das 4h às 20h
  const g = -5 * 3600;
  const D1 = 20396; // 2025-11-04
  // burst = alta acelerada nas 2 últimas horas do pregão do 2º dia (o que a velocidade tem de pegar)
  const mkSeries = (drift, burst = 0, ph = 0) => {
    const t = [];
    const c = [];
    const s = [];
    let lvl = 1;
    for (const day of [D1, D1 + 1])
      for (let m = 240; m < 1200; m += 5) {
        t.push(day * 86400 + m * 60 - g);
        const k = t.length;
        if (day === D1 + 1 && m >= 840 && m < 960) lvl *= 1 + burst;
        c.push(100 * lvl * (1 + drift * k + 0.001 * Math.sin(k / 4 + ph)));
        s.push(m < 570 ? "pre" : m < 960 ? "reg" : "post");
      }
    return { t, c, s, g };
  };
  const data = { series: { SPY: mkSeries(0), A: mkSeries(0.00002, 0, 1), B: mkSeries(-0.00002, 0, 2), C: mkSeries(0, 0.003, 3), D: mkSeries(-0.00001, 0, 4) } }; // prettier-ignore
  it("corta no fim da sessão e acha os dias", () => {
    expect(barDays(data.series.SPY)).toEqual([D1, D1 + 1]);
    expect(isoOfDay(D1)).toBe("2025-11-04");
    const cut = cutSeries(data.series.SPY, D1, "pre");
    const lastMin = (((cut.t.at(-1) + g) % 86400) + 86400) % 86400;
    expect(lastMin / 60).toBe(565);
    expect(cut.s.at(-1)).toBe("pre");
  });
  it("velocidade por sessão; quem dispara é o mais rápido", () => {
    const v = sessionSpeeds(data, "SPY", ["A", "B", "C", "D"], D1 + 1, "reg");
    expect(Object.keys(v).sort()).toEqual(["A", "B", "C", "D"]);
    const top = Object.entries(v).sort((a, b) => b[1].rel - a[1].rel)[0];
    expect(top[0]).toBe("C");
    expect(v.C.vx).toBeGreaterThan(0);
    expect(v.C.p).toBeGreaterThan(0);
  });
  it("gatilhos: pré gravado na véspera, pregão e pós no próprio dia, horizonte 1", () => {
    const dates = ["2025-11-03", "2025-11-04", "2025-11-05"];
    const es = sessionEntries(data, "SPY", ["A", "B", "C", "D"], dates, {
      base: () => ({ k: 0.03 }),
    });
    expect(es.length).toBeGreaterThan(0);
    expect(es.every((e) => e.t === "ispd" && e.h === 1)).toBe(true);
    const pre = es.find((e) => e.c.startsWith("pre-") && e.at === "2025-11-05 pre");
    if (pre) expect(pre.d).toBe("2025-11-04");
    const reg = es.find((e) => e.c.startsWith("reg-") && e.at === "2025-11-05 reg");
    if (reg) expect(reg.d).toBe("2025-11-05");
    // sessão que ainda não terminou não grava
    const none = sessionEntries(data, "SPY", ["A", "B", "C", "D"], dates, { done: () => false });
    expect(none).toEqual([]);
  });
  it("tela: últimas sessões (pós do dia, se já existe)", () => {
    const ls = latestSessionSpeeds(data, "SPY", ["A", "C"]);
    expect(ls.pre.iso).toBe("2025-11-05");
    expect(ls.post.iso).toBe("2025-11-05");
    expect(ls.reg.by.C.rel).toBeGreaterThan(0);
  });
});

describe("estado das lógicas de velocidade", () => {
  it("prévia (bf) não decide; 30+ dias positivos e significativos aprovam", () => {
    const j = [];
    for (let d = 0; d < 40; d++) {
      const day = `2026-01-${String(d + 1).padStart(2, "0")}`;
      j.push({ d: day, s: "A", t: "spd", c: "up-fast", o: "buy", r: 1, xR: 0.3 + 0.05 * Math.sin(d), rR: 0.3 }); // prettier-ignore
      j.push({ d: day, s: "B", t: "spd", c: "dn-fast", o: "sell", r: -1, xR: -0.2, rR: -0.2 });
      j.push({ d: day, s: "C", t: "spd", c: "rev-pf", o: "buy", r: 1, xR: 0.5, rR: 0.5, bf: 1 });
    }
    const m = speedModel(j, {}, "2026-02-10");
    expect(m.logics["spd:up-fast:buy"].status).toBe("approved");
    expect(m.logics["spd:dn-fast:sell"].status).toBe("eliminated");
    expect(m.logics["spd:rev-pf:buy"].status).toBe("eval"); // só prévia
    expect(m.logics["spd:rev-pf:buy"].preview.n).toBe(40);
    expect(m.logics["spd:up-fast:buy"].since).toBe("2026-02-10");
  });
});
