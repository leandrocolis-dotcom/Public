// Long & Short, Fase 3: indicadores com séries sintéticas de valor conhecido (conta à mão nos comentários).
import { describe, expect, it } from "vitest";
import { aggregate, atr, atrIntra, betaCorr, bias, breakout, gap, openingRange, preRange, sma, underlyingView, vwap, vwapCrosses } from "../assets/ls-market.js"; // prettier-ignore

// 2026-12-01 (inverno): minuto ET m → epoch s; 9:30 ET = 14:30 UTC
const T0 = Date.parse("2026-12-01T05:00:00Z") / 1000; // 0:00 ET
const sec = (m) => T0 + m * 60;
const msAt = (m) => sec(m) * 1000;
function mk(rows) {
  const b = { t: [], o: [], h: [], l: [], c: [], v: [], s: [] };
  for (const [m, o, h, l, c, v] of rows) {
    b.t.push(sec(m));
    b.o.push(o);
    b.h.push(h);
    b.l.push(l);
    b.c.push(c);
    b.v.push(v);
    b.s.push(m < 570 ? "pre" : m >= 960 ? "post" : "reg");
  }
  return b;
}

describe("ls-market", () => {
  // pré 4:00 e 9:00; regular 9:30, 9:35, 9:40 (faixa), 9:45, 9:50
  const bars = mk([
    [240, 99, 101, 98, 100, 100],
    [540, 100, 102, 99, 101, 100],
    [570, 101, 103, 100, 102, 1000], // típico 101,667
    [575, 102, 104, 101, 103, 1000], // típico 102,667
    [580, 103, 103, 100, 101, 1000], // típico 101,333
    [585, 101, 106, 101, 105, 3000], // fecha acima da faixa (hi 104) com 3x o volume médio
    [590, 105, 105, 99, 100, 1000],
  ]);

  it("VWAP regular e estendida; sem volume vira TWAP aproximada", () => {
    const w = vwap(bars, msAt(582)); // só as 3 barras da faixa, volume igual → média dos típicos
    expect(w.value).toBeCloseTo((101.6667 + 102.6667 + 101.3333) / 3, 3);
    expect(w.approx).toBe(false);
    const ext = vwap(bars, msAt(582), { extended: true });
    // (99,667·100 + 100,667·100 + 305 667·... ) conferido: soma pv / soma v
    const pv = 99.6667 * 100 + 100.6667 * 100 + (101.6667 + 102.6667 + 101.3333) * 1000;
    expect(ext.value).toBeCloseTo(pv / 3200, 3);
    expect(ext.approx).toBe(false);
    // pré sem volume (como vem do Yahoo): fica fora da média e a estendida se declara aproximada
    const preNoVol = { ...bars, v: bars.v.map((v, i) => (i < 2 ? 0 : v)) };
    expect(vwap(preNoVol, msAt(582), { extended: true })).toMatchObject({
      approx: true,
      missing: 2,
    });
    expect(vwap(preNoVol, msAt(582)).approx).toBe(false);
    const noVol = { ...bars, v: bars.v.map(() => 0) };
    expect(vwap(noVol, msAt(582))).toMatchObject({ approx: true });
    expect(vwap(bars, msAt(500))).toBeNull(); // antes do pregão
  });

  it("PMH/PML, faixa de abertura e rompimento confirmado por volume", () => {
    expect(preRange(bars, msAt(600))).toEqual({ hi: 102, lo: 98 });
    const or = openingRange(bars, msAt(587));
    expect(or).toMatchObject({ hi: 104, lo: 100, avgVol: 1000, done: true });
    expect(openingRange(bars, msAt(577)).done).toBe(false);
    expect(breakout(bars, msAt(587))).toMatchObject({ dir: "up", volRel: 3 });
    expect(breakout(bars, msAt(592)).dir).toBeNull(); // última barra voltou para dentro
    const weak = { ...bars, v: bars.v.map((v, i) => (i === 5 ? 1200 : v)) };
    expect(breakout(weak, msAt(587))).toMatchObject({ dir: null, raw: "up" });
  });

  it("cruzamentos da VWAP contam trocas de lado", () => {
    expect(vwapCrosses(bars, msAt(600))).toBe(3); // +, +, −, +, −
  });

  it("ATR = média simples de 14 true ranges; agregação 5→15 min", () => {
    const rows = Array.from({ length: 15 }, (_, i) => ({ h: 11 + i, l: 9 + i, c: 10 + i }));
    // TR = max(2, |h−pc|=2, |l−pc|=0) = 2 em todas
    expect(atr(rows)).toBe(2);
    expect(atr(rows.slice(0, 10))).toBeNull();
    const agg = aggregate(bars);
    expect(agg).toHaveLength(2); // 9:30–9:45 e 9:45–10:00
    expect(agg[0]).toMatchObject({ o: 101, h: 104, l: 100, c: 101, v: 3000 });
    expect(agg[1]).toMatchObject({ h: 106, l: 99, c: 100, v: 4000 });
    expect(atrIntra(bars, msAt(600))).toBeNull(); // menos de 15 candles
  });

  it("viés pela MM20 e inclinação; gap em % e em ATR", () => {
    const up = Array.from({ length: 30 }, (_, i) => ({ c: 100 + i }));
    expect(sma(up, 20)).toBe(119.5);
    expect(bias(up, 130).bias).toBe("alta");
    expect(bias(up, 110).bias).toBe("neutro");
    const down = up.map((r) => ({ c: 200 - r.c }));
    expect(bias(down, 70).bias).toBe("baixa");
    expect(gap(103, 100, 2)).toEqual({ pct: 3.0000000000000027, atr: 1.5 });
    expect(gap(103, 0, 2)).toBeNull();
  });

  it("beta e correlação de 60 pregões alinhados por data", () => {
    const days = Array.from({ length: 62 }, (_, i) => `2026-0${1 + Math.floor(i / 28)}-${String((i % 28) + 1).padStart(2, "0")}`); // prettier-ignore
    let s = 100;
    let x = 50;
    const spy = [];
    const und = [];
    days.forEach((d, i) => {
      const r = (i % 3) - 1 === 0 ? 0.01 : (i % 3) - 1 > 0 ? -0.005 : 0.004;
      s *= 1 + r;
      x *= 1 + 1.5 * r;
      spy.push({ date: d, c: s });
      und.push({ date: d, c: x });
    });
    const bc = betaCorr(und, spy);
    expect(bc.beta).toBeCloseTo(1.5, 6);
    expect(bc.corr).toBeCloseTo(1, 6);
    expect(betaCorr(und.slice(0, 30), spy).beta).toBeNull();
  });

  it("pacote do subjacente junta tudo", () => {
    const daily = Array.from({ length: 30 }, (_, i) => ({ date: `d${i}`, o: 99, h: 101, l: 99, c: 100 })); // prettier-ignore
    const u = underlyingView({ bars, daily, S: 103, ms: msAt(587) });
    expect(u.atrD).toBe(2);
    expect(u.gap.atr).toBe(1.5);
    expect(u.or.hi).toBe(104);
    expect(u.breakout.dir).toBe("up");
  });
});
