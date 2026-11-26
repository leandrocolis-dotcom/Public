import { describe, expect, it } from "vitest";
import { portfolioBias } from "../assets/port-bias.js";
import { dailySd, traction, trimAlerts, trimPlan } from "../assets/trim.js";
import { alertsFor } from "../scripts/lib/push-alerts.mjs";

const risk = (betas) => ({
  positions: Object.entries(betas).map(([sym, beta]) => ({ sym, beta })),
});
const row = (sym, qty, avg, price) => ({ sym, qty, avg, price, value: qty * price });

describe("plano de realização (menor perda)", () => {
  // carteira agressiva (beta ~1,4) num cenário bear (−50): precisa baixar a agulha
  const rows = [row("TQQQ", 10, 50, 60), row("QQQ", 2, 500, 400), row("XLU", 10, 70, 80)];
  const tot = rows.reduce((a, r) => a + r.value, 0);
  for (const r of rows) r.weight = r.value / tot;
  const b = portfolioBias(rows, risk({ TQQQ: 3, QQQ: 1.1, XLU: 0.4 }), -50);

  it("sem plano quando aderente", () => {
    expect(
      trimPlan(portfolioBias(rows, risk({ TQQQ: 3, QQQ: 1.1, XLU: 0.4 }), b.score), rows),
    ).toBeNull();
  });
  it("vende primeiro o que está no lucro e não vende o que puxa para o outro lado", () => {
    const p = trimPlan(b, rows);
    expect(b.fit.key).toBe("hot");
    expect(p.legs[0].sym).toBe("TQQQ"); // no lucro e beta alto
    expect(p.legs.some((l) => l.sym === "XLU")).toBe(false); // beta abaixo do alvo: vender subiria a agulha
    expect(p.after).toBeLessThan(b.score);
    for (const l of p.legs) expect(l.qty % 1).toBe(0);
  });
  it("posição no prejuízo entra por último", () => {
    const p = trimPlan(b, rows);
    const iq = p.legs.findIndex((l) => l.sym === "QQQ");
    if (iq >= 0) expect(iq).toBeGreaterThan(0);
    expect(p.totalPL).toBe(p.legs.reduce((a, l) => a + l.pl, 0));
  });
  it("carteira defensiva demais num cenário bull vende o inverso", () => {
    const r2 = [row("SPY", 10, 400, 500), row("SH", 200, 40, 38)];
    const t2 = r2.reduce((a, r) => a + r.value, 0);
    for (const r of r2) r.weight = r.value / t2;
    const b2 = portfolioBias(r2, risk({ SPY: 1, SH: -1 }), 70);
    const p = trimPlan(b2, r2);
    expect(p.dir).toBe(-1);
    expect(p.legs.map((l) => l.sym)).toEqual(["SH"]);
    expect(p.reached).toBe(true);
  });
});

describe("tração das posições marcadas", () => {
  const flat = Array.from({ length: 30 }, (_, i) => 100 * (1 + (i % 2 ? 0.005 : -0.005)));
  it("desvio diário", () => {
    expect(dailySd(flat)).toBeGreaterThan(0.005);
    expect(dailySd([1, 2])).toBeNull();
  });
  it("reduzir: alta acima do limiar ou volta ao preço médio", () => {
    expect(traction("reduce", { p: 103, pc: 100 }, flat).kind).toBe("up");
    expect(traction("reduce", { p: 100.3, pc: 100 }, flat).kind).toBeNull();
    expect(traction("reduce", { p: 100.5, pc: 100 }, flat, 100.2).kind).toBe("be");
  });
  it("aumentar: recuo", () => {
    expect(traction("add", { p: 97, pc: 100 }, flat).kind).toBe("dip");
    expect(traction("add", { p: 103, pc: 100 }, flat).kind).toBeNull();
  });
  it("avisos push: só marcadas, um por dia", () => {
    const h = [
      { sym: "SQQQ", qty: 10, avg: 20 },
      { sym: "QQQ", qty: 1, avg: 400 },
    ];
    const quotes = { SQQQ: { p: 15.6, pc: 15 }, QQQ: { p: 520, pc: 500 } };
    const live = { SQQQ: { close: flat }, QQQ: { close: flat } };
    const a = trimAlerts(h, { SQQQ: "reduce" }, { quotes, live, day: "2026-11-20" });
    expect(a.map((x) => x.key)).toEqual(["trim:SQQQ:up:2026-11-20"]);
    const r = alertsFor({ holdings: h, quotes, live, prefs: { trimPicks: { SQQQ: "reduce" }, macro: false, leaders: false, sig: false, news: "off" } }); // prettier-ignore
    expect(r.send[0].title).toMatch(/AJUSTE DA CARTEIRA · SQQQ: tração de alta/);
    expect(alertsFor({ holdings: h, quotes, live, prefs: { trim: false, trimPicks: { SQQQ: "reduce" }, macro: false, leaders: false, sig: false, news: "off" } }).send).toEqual([]); // prettier-ignore
  });
});
