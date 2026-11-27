// Long & Short, Fase 5: cada um dos 33 alertas disparando e não disparando; mensagens preenchidas; dedupe de
// 15 min; nenhuma trava bloqueia REDUZIR/ZERAR; RSK-01 trava o dia sem desbloqueio manual.
import { describe, expect, it } from "vitest";
import { computeLs } from "../assets/ls-engine.js";
import { ALERT_IDS, dedupeAlerts, evaluateAlerts, fillMsg, overnightFilters } from "../assets/ls-alerts.js"; // prettier-ignore
import { assetInfo } from "../assets/ls-etfs.js";
import { pyRound } from "../assets/ls-core.js";

const NOW = Date.parse("2026-12-01T15:15:00Z"); // 10:15 ET
const quote = (P, spread = 0.01, ageS = 2) => ({ P, bid: pyRound(P - spread / 2, 3), ask: pyRound(P + spread / 2, 3), ts: NOW - ageS * 1000 }); // prettier-ignore
const under = (S, atrIntra, extra = {}) => ({ S, atrIntra, atrD: S * 0.02, vwap: { value: S * 0.995 }, or: { done: true }, breakout: { dir: null }, crosses: 1, ...extra }); // prettier-ignore

/** Carteira calma: SOXL × SQQQ pequenos, sem nada a fazer. */
function calm(over = {}) {
  return {
    now: NOW,
    session: "REGULAR",
    minET: 615,
    date: "2026-12-01",
    capital: 25000,
    plan: { ok: true, pairs: { semis: { dirPlan: 0 } } },
    calendar: { blocks: false },
    day: {},
    vix: 15,
    pairs: [
      {
        id: "semis",
        name: "Semis vs Nasdaq",
        corr: 0.8,
        long: { sym: "SOXL", dir: 1, qty: 50, avg: 30, stop: 29.19, hwm: 30.1, pRef: 30, sessions: 0, asset: assetInfo("SOXL"), quote: quote(30.1), under: under(250, 1.5) }, // prettier-ignore
        short: { sym: "SQQQ", dir: 1, qty: 80, avg: 20, stop: 19.55, hwm: 20.05, pRef: 20, sessions: 0, asset: assetInfo("SQQQ"), quote: quote(20.05), under: under(500, 2.5) }, // prettier-ignore
      },
    ],
    ...over,
  };
}
const run = (st) => {
  const out = computeLs(st);
  return { out, alerts: evaluateAlerts(st, out) };
};
const ids = (st) => run(st).alerts.map((a) => a.id);
const L = (st) => st.pairs[0].long;
const S = (st) => st.pairs[0].short;

/** Para cada alerta: muda o estado calmo até disparar. */
const FIRE = {
  "PRE-01": (s) => (s.plan = { ok: false }),
  "PRE-02": (s) => (s.events = [{ atMs: NOW + 3 * 3600000 }]),
  "PRE-03": (s) =>
    Object.assign(s, { session: "PRE", minET: 500 }) && (L(s).under.gap = { atr: 2 }),
  "CAL-01": (s) => (s.calendar = { blocks: true }),
  "SES-01": (s) => Object.assign(s, { session: "POS", minET: 1000 }) && (L(s).quote = quote(29)),
  "SES-02": (s) => (L(s).quote = quote(30.1, 0.2)),
  "SES-03": (s) => Object.assign(s, { session: "PRE", minET: 500 }) && (L(s).quote = quote(29)),
  "EXE-01": (s) => (L(s).quote = quote(30.1, 0.01, 60)),
  "EXE-02": (s) => (s.liveOrders = [{ sym: "SQQQ", purpose: "REDUZIR", status: "PARCIAL", qtySug: 100, qtyExec: 40 }]), // prettier-ignore
  "ETF-01": (s) => (L(s).retDay = { etf: -0.45, under: -0.05 }),
  "SHR-01": (s) => (S(s).recall = true),
  "INT-01": (s) => (s.minET = 575),
  "INT-02": (s) => (L(s).under.breakout = { dir: "up", volRel: 2 }),
  "INT-03": (s) => (L(s).under.crosses = 4),
  "PAR-01": (s) => (s.pairs[0].corr = 0.3),
  "DEC-01": (s) => {
    Object.assign(L(s), { qty: 154, hwm: 31.2, quote: quote(31.2) });
    Object.assign(S(s), { qty: 277, hwm: 20, quote: quote(19.7) });
  },
  "DEC-02": () => {}, // depende de um aumento com pnl < 0: teste próprio abaixo
  "DEC-03": (s) => FIRE["DEC-01"](s),
  "DEC-04": (s) => Object.assign(L(s), { qty: 154, hwm: 32, quote: quote(32) }),
  "DEC-05": (s) => Object.assign(L(s), { entryUnder: 240 }),
  "DEC-06": (s) => Object.assign(L(s), { hwm: 34, quote: quote(32) }),
  "DEC-07": (s) => (L(s).quote = quote(29)),
  "DEC-08": (s) => {
    FIRE["DEC-04"](s);
    s.day = { lastAdj: { SOXL: NOW - 3 * 60000 } };
  },
  "RSK-01": (s) => Object.assign(L(s), { qty: 154, quote: quote(26.5), stop: 20 }),
  "RSK-02": (s) => (s.day = { losses: 3 }),
  "RSK-03": (s) => Object.assign(L(s), { qty: 600, pRef: 30.1 }),
  "RSK-04": (s) => {
    L(s).stop = 25;
    S(s).stop = 16;
  },
  "BEH-01": (s) => (s.day = { ignoredRisk30: 2 }),
  "BEH-02": (s) => (s.day = { entries: 6 }),
  "POS-01": (s) => Object.assign(s, { minET: 935, balancePost: ["SOXL"] }),
  "EOD-01": (s) => (s.minET = 950),
  "EOD-02": (s) => Object.assign(s, { session: "POS", minET: 1190 }),
  "SWG-01": (s) => (L(s).sessions = 6),
};

describe("ls-alerts: os 33 alertas", () => {
  it("o catálogo de disparo cobre todos os ids do JSON", () => {
    expect(Object.keys(FIRE).sort()).toEqual([...ALERT_IDS].sort());
    expect(ALERT_IDS).toHaveLength(33);
  });
  const calmIds = ids(calm());
  it("carteira calma: nenhum alerta", () => expect(calmIds).toEqual([]));
  for (const id of ALERT_IDS) {
    if (id === "DEC-02") continue; // ver teste próprio abaixo
    it(`${id} dispara e a mensagem vem preenchida`, () => {
      const st = calm();
      FIRE[id](st);
      const { alerts } = run(st);
      const a = alerts.find((x) => x.id === id);
      expect(a, `${id} não disparou; vieram ${alerts.map((x) => x.id)}`).toBeTruthy();
      expect(a.msg).not.toMatch(/[{}]/);
      expect(calmIds).not.toContain(id);
    });
  }
  it("DEC-02 (preço médio para baixo) sai do bloqueio do motor quando o aumento tem pnl < 0", () => {
    const st = calm();
    const out = computeLs(st);
    out.orders.push({ sym: "SOXL", purpose: "AUMENTAR", side: "COMPRAR", qty: 10, blockers: [{ id: "DEC-02", why: "x" }] }); // prettier-ignore
    expect(evaluateAlerts(st, out).map((a) => a.id)).toContain("DEC-02");
    expect(calmIds).not.toContain("DEC-02");
  });
  it("mensagens com variáveis: spread, risco no teto, DEC-01 e overnight", () => {
    let st = calm();
    FIRE["SES-02"](st);
    expect(run(st).alerts.find((a) => a.id === "SES-02").msg).toMatch(/^Spread de 0,\d\d% em SOXL/);
    st = calm();
    FIRE["DEC-01"](st);
    expect(run(st).alerts.find((a) => a.id === "DEC-01").msg).toBe("Mercado confirmou SOXL. VENDER 92 de SQQQ e suba o stop de SOXL."); // prettier-ignore
    st = calm();
    FIRE["EOD-01"](st);
    expect(run(st).alerts.find((a) => a.id === "EOD-01").msg).toMatch(/^Checagem de overnight: \d de 5 filtros/); // prettier-ignore
    expect(() => fillMsg("{x}", {})).toThrow();
  });
  it("críticos primeiro", () => {
    const st = calm();
    FIRE["PRE-02"](st);
    FIRE["CAL-01"](st);
    const a = run(st).alerts;
    expect(a[0].id).toBe("CAL-01");
  });
});

describe("travas nunca bloqueiam reduzir ou zerar", () => {
  it("com todas as travas de carteira ativas, as saídas seguem liberadas", () => {
    const st = calm({ plan: { ok: false }, calendar: { blocks: true }, day: { ignoredRisk30: 5, entries: 9, losses: 4 } }); // prettier-ignore
    L(st).quote = quote(29, 0.5, 120); // stop atingido, spread largo e cotação velha
    S(st).recall = true;
    const out = computeLs(st);
    const exits = out.orders.filter((o) => o.purpose === "REDUZIR" || o.purpose === "ZERAR");
    expect(exits.map((o) => o.sym).sort()).toEqual(["SOXL", "SQQQ"]);
    for (const o of exits) expect(o.blocked).toBe(false);
    expect(out.blockers.length).toBeGreaterThanOrEqual(5);
  });
  it("RSK-01 trava o resto do dia mesmo se o P&L voltar (sem desbloqueio manual)", () => {
    const st = calm({ day: { rsk01Locked: true } });
    const { out, alerts } = run(st);
    expect(out.portfolio.flags.rsk01).toBe(true);
    expect(alerts[0].id).toBe("RSK-01");
    expect(out.orders.every((o) => o.purpose === "ZERAR" && !o.blocked)).toBe(true);
  });
});

describe("dedupe e filtros de overnight", () => {
  it("15 min por alerta e posição; prioridade maior fura o intervalo", () => {
    const a = [{ id: "SES-02", sym: "SOXL", prio: "critico" }];
    let r = dedupeAlerts(a, {}, NOW);
    expect(r.show).toHaveLength(1);
    r = dedupeAlerts(a, r.mem, NOW + 5 * 60000);
    expect(r.show).toHaveLength(0);
    expect(dedupeAlerts([{ ...a[0], sym: "SQQQ" }], r.mem, NOW + 5 * 60000).show).toHaveLength(1);
    expect(dedupeAlerts([{ ...a[0], level: 1 }], r.mem, NOW + 5 * 60000).show).toHaveLength(1);
    expect(dedupeAlerts(a, r.mem, NOW + 15 * 60000).show).toHaveLength(1);
  });
  it("5 filtros: dado ausente conta como não atendido", () => {
    const f = overnightFilters({ vix: 20, atrPct: 50, value: 1000, maxValueToday: 2500, sessions: 2, L: 3, decayPp: 1 }); // prettier-ignore
    expect(f.every((x) => x.ok)).toBe(true);
    const g = overnightFilters({ vix: 30, L: 2, sessions: 10 });
    expect(g.filter((x) => x.ok)).toHaveLength(0);
  });
});
