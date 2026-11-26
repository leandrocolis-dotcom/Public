// Gabarito numérico: roda os motores sobre dados reais congelados (tests/fixtures) e devolve tudo
// o que a tela mostra de número/insight. Serve para provar que refatorações não mudam resultados.
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { rng, walk } from "./helpers.js";
import { computeSnapshot } from "../assets/engine.js";
import {
  flowSnapshot,
  groupFlows,
  flowHeadline,
  rotation,
  quadrantOf,
} from "../assets/flow-engine.js";
import { FLOW_ASSETS, FLOW_GROUPS } from "../assets/flow-universe.js";
import { signalsFor, ruleStats } from "../assets/signals.js";
import * as S from "../assets/ta-signals.js";
import { valuePortfolio, parseInvestingPortfolio } from "../assets/portfolio.js";

const load = (n) =>
  JSON.parse(readFileSync(new URL(`./fixtures/${n}.json`, import.meta.url), "utf8"));

/** Arredonda números a 9 casas significativas (tolera ruído de ponto flutuante entre versões do Node). */
function norm(x) {
  return JSON.parse(
    JSON.stringify(x, (_, v) => {
      if (typeof v === "number") return Number.isFinite(v) ? Number(v.toPrecision(9)) : String(v);
      if (v instanceof Date) return v.toISOString();
      return v;
    }),
  );
}

const sha = (x) =>
  createHash("sha256")
    .update(JSON.stringify(norm(x)))
    .digest("hex")
    .slice(0, 16);

export function computeGolden() {
  const prices = load("prices");
  const flow = load("flow");
  const ohlc = load("ohlc");
  const out = {};

  const snap = computeSnapshot(prices, null, { now: new Date("2026-10-06T21:00:00Z") });
  out.snapshot = snap;
  out.snapshotDiff = computeSnapshot(
    {
      ...prices,
      series: Object.fromEntries(
        Object.entries(prices.series).map(([k, s]) => [k, s.slice(0, -3)]),
      ),
      dates: prices.dates.slice(0, -3),
    },
    null,
    { now: new Date("2026-10-01T21:00:00Z") },
  );

  out.flow = {};
  for (const horizon of ["1d", "5d", "1m", "3m"]) {
    for (const back of [0, 5]) {
      const f = flowSnapshot(flow, { horizon, back, sessionFrac: 1 });
      const groups = groupFlows(f.rows);
      const full = { ...f, groups, headline: flowHeadline(groups) };
      out.flow[`${horizon}|${back}`] =
        horizon === "1d" && back === 0 ? full : { sha: sha(full), n: f.rows.length };
    }
  }
  out.rotation = Object.fromEntries(
    // grupos sem dado no gabarito congelado (ex.: incluídos depois) ficam de fora
    FLOW_GROUPS.filter((g) => FLOW_ASSETS.some((a) => a.group === g.id && flow.close[a.sym])).map(
      (g) => [g.id, { sha: sha(rotation(flow, g.id)), n: rotation(flow, g.id).length }],
    ),
  );
  out.quadrants = [
    [110, 105],
    [110, 95],
    [90, 95],
    [90, 105],
  ].map(([x, y]) => quadrantOf({ x, y }));

  // Sinais simples (assets/signals.js) sobre todas as séries diárias.
  out.signals = Object.fromEntries(
    Object.entries(prices.series).map(([k, s]) => [k, signalsFor(s, { sym: k, label: k })]),
  );
  out.ruleStats = ruleStats(Object.values(prices.series), 5);

  // Análise gráfica completa (assets/ta-signals.js) sobre as barras OHLC reais.
  out.ta = {};
  for (const [sym, b] of Object.entries(ohlc.bars)) {
    const bars = {
      dates: ohlc.dates,
      o: b.o,
      h: b.h,
      l: b.l,
      c: b.c,
      v: b.vk.map((x) => x * 1000),
      closeOnly: false,
    };
    const P = S.prepareDaily(bars);
    const a = S.scoreDailyAt(P, P.n - 1, {});
    const bt = S.backtestDaily(P);
    out.ta[sym] = {
      a,
      bt,
      text: a ? S.backtestText(bt, a) : null,
      verdict: a ? S.verdictOf(a.score) : null,
    };
    const mid = S.scoreDailyAt(P, P.n - 40, { partialLast: true });
    out.ta[`${sym}@-40`] = mid;
  }

  // Cobertura ampla por hash: pontua TODOS os pregões de cada ativo (percorre todos os ramos das regras).
  out.taAll = {};
  for (const [sym, b] of Object.entries(ohlc.bars)) {
    const bars = {
      dates: ohlc.dates,
      o: b.o,
      h: b.h,
      l: b.l,
      c: b.c,
      v: b.vk.map((x) => x * 1000),
      closeOnly: false,
    };
    const P = S.prepareDaily(bars);
    const all = [];
    for (let i = 60; i < P.n; i++) all.push(S.scoreDailyAt(P, i, { partialLast: i % 2 === 0 }));
    const co = { ...bars, closeOnly: true, o: b.c, h: b.c, l: b.c, v: b.c.map(() => 0) };
    const Pc = S.prepareDaily(co);
    const allC = [];
    for (let i = 60; i < Pc.n; i += 3) allC.push(S.scoreDailyAt(Pc, i, {}));
    out.taAll[sym] = {
      n: all.length,
      full: sha(all),
      closeOnly: sha(allC),
      backtest: sha(S.backtestDaily(P, { h: 3, start: 150 })),
    };
  }

  // Análise intradiária sintética (5 pregões de barras de 5 min, vários cenários e horários).
  const utc = (date, h, m) =>
    Date.parse(`${date}T${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:00Z`) / 1000;
  const days = ["2026-09-29", "2026-09-30", "2026-10-01", "2026-10-02", "2026-10-05"];
  const intraBars = (seed, drift, vol, lastCount) => {
    const r = rng(seed + 7);
    const b = { t: [], o: [], h: [], l: [], c: [], v: [] };
    let px = 500;
    days.forEach((d, di) => {
      const cnt = di === days.length - 1 ? lastCount : 78;
      const w = walk(cnt + 1, { seed: seed + di, start: px, drift, vol });
      for (let k = 0; k < cnt; k++) {
        const o = w[k];
        const c = w[k + 1];
        b.t.push(utc(d, 13, 30) + k * 300);
        b.o.push(o);
        b.c.push(c);
        b.h.push(Math.max(o, c) * (1 + r() * 0.0015));
        b.l.push(Math.min(o, c) * (1 - r() * 0.0015));
        const u = 1 + 1.5 * Math.exp(-k / 6) + 1.2 * Math.exp(-(cnt - k) / 6);
        b.v.push(Math.round(100000 * u * (0.7 + r() * 0.6)));
      }
      px = w[cnt];
    });
    return b;
  };
  const spy = ohlc.bars.SPY;
  const spyBars = {
    dates: ohlc.dates,
    o: spy.o,
    h: spy.h,
    l: spy.l,
    c: spy.c,
    v: spy.vk.map((x) => x * 1000),
    closeOnly: false,
  };
  const dailyA = S.analyzeDaily(spyBars, {});
  out.intraday = {};
  for (const [seed, drift, vol] of [
    [1, 0.0004, 0.0012],
    [2, -0.0004, 0.0012],
    [3, 0, 0.0006],
    [4, 0.0001, 0.003],
  ]) {
    for (const cnt of [3, 12, 40, 78]) {
      const b = intraBars(seed, drift, vol, cnt);
      const lastT = b.t.at(-1);
      for (const [tag, now] of [
        ["live", lastT + 60],
        ["after", utc("2026-10-05", 23, 0)],
      ]) {
        const a = S.analyzeIntraday(b, { now });
        const res = { a, call: a ? S.finalCall(dailyA, a) : null };
        out.intraday[`${seed}|${cnt}|${tag}`] =
          seed === 1 && cnt === 78
            ? res
            : { sha: sha(res), dir: a?.dir ?? null, score: a?.score ?? null };
      }
    }
  }
  out.finalCallNone = [S.finalCall(null, null), S.finalCall(dailyA, null)];

  // Carteira.
  const txt = readFileSync(new URL("./fixtures/investing-portfolio.txt", import.meta.url), "utf8");
  const parsed = parseInvestingPortfolio(txt);
  delete parsed.dec; // campo novo, fora do gabarito
  const quotes = Object.fromEntries(
    (parsed.holdings ?? []).map((h, i) => [
      h.sym,
      { p: h.avg * (1 + 0.01 * (i + 1)), pc: h.avg, t: 1791316800 },
    ]),
  );
  out.portfolio = {
    parsed,
    valued: valuePortfolio(parsed.holdings ?? [], quotes, { today: "2026-10-06" }),
  };
  return norm(out);
}
