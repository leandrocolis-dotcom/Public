import { describe, it, expect } from "vitest";
import { dailyStats, scoreOfZ, weekendGap, weekendPulse } from "../assets/weekend-pulse.js";
import { measuredAt } from "../assets/home-view.js";
import { pendFloatHtml } from "../assets/pend-float.js";

const sec = (iso) => Date.parse(iso) / 1000;
// sábado 21/11/2026 15:00 UTC (10h NY); sexta 16:00 NY = 21:00 UTC (horário padrão)
const SAT = sec("2026-11-21T15:00:00Z");
const FRI_CLOSE = sec("2026-11-20T21:00:00Z");

/** Histórico diário: SPY e cripto com ruído correlacionado (desvio diário ~1% e ~3%). */
function hist(n = 120) {
  const spy = [100];
  const btc = [50000];
  const eth = [3000];
  for (let i = 1; i < n; i++) {
    const e = Math.sin(i * 1.7) * 0.01;
    const u = Math.cos(i * 2.3) * 0.02;
    spy.push(spy.at(-1) * (1 + e));
    btc.push(btc.at(-1) * (1 + 1.5 * e + u));
    eth.push(eth.at(-1) * (1 + 2 * e + u));
  }
  return { SPY: spy, "BTC-USD": btc, "ETH-USD": eth };
}
const bars = (ref) => ({
  t: [FRI_CLOSE - 1800, FRI_CLOSE, FRI_CLOSE + 1800],
  c: [ref * 0.99, ref, ref * 1.001],
});

describe("pêndulo no fim de semana", () => {
  it("vão: fim de semana sem cotação nova de futuros, câmbio ou pós", () => {
    const stale = { "ES=F": { t: sec("2026-11-20T22:00:00Z") }, SPY: { t: FRI_CLOSE, xt: sec("2026-11-21T01:00:00Z") } }; // prettier-ignore
    expect(weekendGap(stale, SAT)).toBe(true);
    // domingo 18h05 NY: futuros de volta
    const sun = sec("2026-11-22T23:05:00Z");
    expect(weekendGap({ "ES=F": { t: sun - 60 } }, sun)).toBe(false);
    // quarta à tarde: não é fim de semana
    expect(weekendGap({}, sec("2026-11-18T18:00:00Z"))).toBe(false);
  });

  it("desvio e correlação do histórico diário", () => {
    const st = dailyStats(hist(), "BTC-USD");
    expect(st.sd).toBeGreaterThan(0.01);
    expect(st.rho).toBeGreaterThan(0.3);
    expect(dailyStats({ SPY: [1, 2] }, "BTC-USD")).toBeNull();
  });

  it("queda do cripto puxa para a defesa; alta pesa menos (assimetria)", () => {
    const close = hist();
    const series = { "BTC-USD": bars(90000), "ETH-USD": bars(3000) };
    const dn = weekendPulse({ close, series, nowSec: SAT, quotes: { "BTC-USD": { p: 90000 * 0.94, t: SAT - 60 }, "ETH-USD": { p: 3000 * 0.92, t: SAT - 60 } } }); // prettier-ignore
    const up = weekendPulse({ close, series, nowSec: SAT, quotes: { "BTC-USD": { p: 90000 * 1.06, t: SAT - 60 }, "ETH-USD": { p: 3000 * 1.08, t: SAT - 60 } } }); // prettier-ignore
    expect(dn.score).toBeLessThan(-20);
    expect(up.score).toBeGreaterThan(0);
    expect(Math.abs(up.score)).toBeLessThan(Math.abs(dn.score));
    expect(dn.items.map((x) => x.sym)).toEqual(["BTC-USD", "ETH-USD"]);
    expect(dn.items[0].chg).toBeCloseTo(-0.06, 6);
    expect(dn.at).toBe(SAT - 60);
    expect(dn.crash).toBe(true);
    expect(up.crash).toBe(false);
  });

  it("sem barra de sexta ou fora do fim de semana: sem leitura", () => {
    const close = hist();
    expect(weekendPulse({ close, series: {}, nowSec: SAT, quotes: {} })).toBeNull();
    expect(weekendPulse({ close, series: { "BTC-USD": bars(1) }, nowSec: sec("2026-11-18T18:00:00Z"), quotes: {} })).toBeNull(); // prettier-ignore
  });

  it("nota = 100·tanh(z)", () => {
    expect(scoreOfZ(0)).toBe(0);
    expect(scoreOfZ(-5)).toBeLessThanOrEqual(-99);
    expect(scoreOfZ(0.5)).toBe(-scoreOfZ(-0.5));
  });

  it("hora da medição em Brasília e marca fds na pílula", () => {
    expect(measuredAt(SAT)).toMatch(/^sáb 21\/11 12:00$/);
    expect(measuredAt(null)).toBe("");
    const r = { score: -30, zone: { tone: "dn", label: "Defesa" }, stress: false, weekend: {} };
    expect(pendFloatHtml(r)).toContain("fds");
  });
});
