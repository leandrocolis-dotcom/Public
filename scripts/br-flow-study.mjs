// Assertividade do Fluxo Onshore (Mercados › Onshore › Fluxo) com dados reais da B3.
// Para cada pregão dos últimos ~60 dias (barras de 5 min do Yahoo) e cada hora do pregão (15%, 30%, 50%, 70%, 85% e
// o fechamento), refaz a leitura da tela com o MESMO código do app (brFlowTable → flowSnapshot → groupFlows →
// flowNarrative, universo BR_UNI) usando só o que se sabia naquela hora, e mede o que veio depois, em excesso
// sobre o Ibovespa:
//  - setores "ganhando força" (média ≥ +0,5σ): o setor fechou o dia acima do Ibovespa? ("perdendo força": abaixo?)
//  - "para observar entrada" (fortes) e "fracos": retorno do resto do dia (da hora até o fechamento) e do dia seguinte.
//  - curva de volume: parcela do volume do dia que sai até cada hora (o app usa para o volume relativo do dia).
// Uso: node scripts/br-flow-study.mjs [--days=60]   →   data/br-flow-study.json
import { writeFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";
import { BR_FLOW_SYMBOLS, BR_UNI, brFlowTable, volShare } from "../assets/br-flow.js";
import { b3Session } from "../assets/br.js";
import { flowNarrative, flowSnapshot, groupFlows } from "../assets/flow-engine.js";

export const CHECKPOINTS = [
  [0.15, "1ª hora"],
  [0.3, "fim da manhã"],
  [0.5, "meio do pregão"],
  [0.7, "meio da tarde"],
  [0.85, "última hora"],
  [1, "fechamento"],
];
const CURVE_AT = [0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9];
const SP = 3 * 3600; // Brasília = UTC−3 (sem horário de verão desde 2019)
const isB3Equity = (a) => a && /\.SA$/.test(a.sym) && (a.group === "br_idx" || BR_UNI.byId[a.group]?.bench === "^BVSP") && a.group !== "br_rf"; // prettier-ignore

/** Abertura e fechamento do pregão (segundos) de um dia "AAAA-MM-DD" da B3. */
export function sessionBounds(day) {
  const noon = Date.parse(`${day}T15:00:00Z`) / 1000; // 12:00 em Brasília
  const close = Number(b3Session(new Date(noon * 1000)).close.split(":")[0]);
  const base = Date.parse(`${day}T00:00:00Z`) / 1000 + SP;
  return { open: base + 10 * 3600, close: base + close * 3600 };
}

const dayKey = (t) => new Date((t - SP) * 1000).toISOString().slice(0, 10); // dia em Brasília
const mean = (xs) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);
const median = (xs) => {
  if (!xs.length) return null;
  const s = [...xs].sort((a, b) => a - b);
  const m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};
function summary(xs, sign = 1) {
  const v = xs.filter(Number.isFinite);
  if (!v.length) return { n: 0 };
  const m = mean(v);
  const sd = Math.sqrt(v.reduce((a, b) => a + (b - m) ** 2, 0) / Math.max(1, v.length - 1));
  return {
    n: v.length,
    bps: Math.round(m * 1e4 * 10) / 10,
    hit: Math.round((v.filter((x) => x * sign > 0).length / v.length) * 1000) / 1000,
    t: sd > 0 ? Math.round((m / (sd / Math.sqrt(v.length))) * 100) / 100 : null,
  };
}

/**
 * Núcleo do estudo (puro, testável). daily: { SÍMBOLO: { dates, close, vol } } (diário, ajustado) ·
 * intra: { SÍMBOLO: { t: [seg], c: [...], v: [...] } } (5 min) · days: dias a estudar ("AAAA-MM-DD", da B3).
 */
export function runStudy(daily, intra, days) {
  const at = {};
  for (const [sym, s] of Object.entries(daily)) at[sym] = new Map(s.dates.map((d, i) => [d, i]));
  const px = (sym, d, k = 0) => {
    const i = at[sym]?.get(d);
    return i == null ? null : (daily[sym].close[i + k] ?? null);
  };
  // preço e volume acumulado até o instante t (barras de 5 min do dia; cada série indexada por dia)
  const byDay = {};
  for (const [sym, s] of Object.entries(intra)) {
    const m = (byDay[sym] = new Map());
    s.t.forEach((t, i) => {
      const d = dayKey(t);
      if (!m.has(d)) m.set(d, i);
    });
  }
  const upTo = (sym, t, open) => {
    const s = intra[sym];
    const i0 = byDay[sym]?.get(dayKey(open));
    if (!s || i0 == null) return null;
    let p = null;
    let v = 0;
    for (let i = i0; i < s.t.length && s.t[i] < t; i++) {
      if (s.t[i] < open - 3600) continue;
      if (s.c[i] > 0) p = s.c[i];
      v += s.v[i] > 0 ? s.v[i] : 0;
    }
    return p == null ? null : { p, v };
  };

  // 1) curva de volume: parcela mediana do volume do dia (diário) que sai até cada fração do pregão
  const shares = CURVE_AT.map(() => []);
  for (const day of days) {
    const { open, close } = sessionBounds(day);
    for (const sym of Object.keys(intra)) {
      const a = BR_UNI.bySym[sym];
      if (!isB3Equity(a)) continue;
      const i = at[sym]?.get(day);
      const tot = i == null ? 0 : daily[sym].vol?.[i];
      if (!(tot > 0)) continue;
      CURVE_AT.forEach((f, k) => {
        const u = upTo(sym, open + f * (close - open), open);
        if (u && u.v > 0 && u.v <= tot * 1.05) shares[k].push(u.v / tot);
      });
    }
  }
  const volCurve = CURVE_AT.map((f, k) => [f, median(shares[k])]).filter(([, y]) => y > 0 && y < 1);
  for (let k = 1; k < volCurve.length; k++) volCurve[k][1] = Math.max(volCurve[k][1], volCurve[k - 1][1]); // prettier-ignore

  // 2) a leitura da tela em cada hora e o que veio depois
  const acc = CHECKPOINTS.map(() => ({ up: [], down: [], upRest: [], downRest: [], cand: [], candNext: [], weak: [], weakNext: [], base: [], baseNext: [] })); // prettier-ignore
  const allDates = daily["^BVSP"].dates;
  for (const day of days) {
    const di = allDates.indexOf(day);
    if (di < 70 || di >= allDates.length - 1) continue; // precisa de 60 pregões antes e do dia seguinte
    const next = allDates[di + 1];
    const { open, close } = sessionBounds(day);
    const hist = {};
    for (const [sym, s] of Object.entries(daily)) {
      const i = at[sym].get(day) ?? s.dates.findIndex((d) => d > day);
      const end = i < 0 ? s.dates.length : i;
      const from = Math.max(0, end - 260);
      hist[sym] = { dates: s.dates.slice(from, end), close: s.close.slice(from, end), vol: s.vol?.slice(from, end) }; // prettier-ignore
    }
    const ib = { pc: px("^BVSP", day, -1), c: px("^BVSP", day), n: px("^BVSP", next) };
    CHECKPOINTS.forEach(([f], k) => {
      const t = f < 1 ? open + f * (close - open) : close + 3600;
      const quotes = {};
      const cp = {};
      for (const sym of Object.keys(daily)) {
        const pc = px(sym, day, -1);
        let p;
        let v;
        if (f < 1) {
          const u = upTo(sym, t, open);
          if (!u) continue;
          ({ p, v } = u);
        } else {
          p = px(sym, day);
          v = daily[sym].vol?.[at[sym].get(day)] ?? 0;
        }
        if (!(p > 0)) continue;
        cp[sym] = p;
        quotes[sym] = { p, pc, v, t: Math.floor(t) - 60 };
      }
      if (!cp["^BVSP"] || !ib.c || !ib.pc || !ib.n) return;
      const table = brFlowTable(hist, quotes);
      if (!table || table.dates.at(-1) !== day) return;
      const share = f < 1 ? volShare(f, volCurve) : 1;
      const rows = flowSnapshot(table, { horizon: "1d", sessionFrac: share, uni: BR_UNI }).rows;
      const nar = flowNarrative(rows, groupFlows(rows, BR_UNI), { session: f < 1 ? "open" : "closed", sessionFrac: f, uni: BR_UNI }); // prettier-ignore
      const ibRest = ib.c / cp["^BVSP"] - 1;
      const ibDay = ib.c / ib.pc - 1;
      const ibNext = ib.n / ib.c - 1;
      const rest = (sym) => (cp[sym] && px(sym, day) ? px(sym, day) / cp[sym] - 1 - ibRest : null);
      const nextX = (sym) => (px(sym, day) && px(sym, next) ? px(sym, next) / px(sym, day) - 1 - ibNext : null); // prettier-ignore
      const dayX = (sym) => (px(sym, day) && px(sym, day, -1) ? px(sym, day) / px(sym, day, -1) - 1 - ibDay : null); // prettier-ignore
      const A = acc[k];
      for (const m of nar.markets) {
        const g = BR_UNI.byId[m.id];
        if (g?.bench !== "^BVSP" || m.id === "br_idx" || m.state === "flat") continue;
        const mem = BR_UNI.assets.filter((a) => a.group === m.id).map((a) => a.sym);
        const dx = mean(mem.map(dayX).filter(Number.isFinite));
        const rx = mean(mem.map(rest).filter(Number.isFinite));
        if (dx == null) continue;
        (m.state === "up" ? A.up : A.down).push(dx);
        if (rx != null) (m.state === "up" ? A.upRest : A.downRest).push(rx);
      }
      for (const c of nar.candidates.filter((r) => isB3Equity(BR_UNI.bySym[r.sym]))) {
        A.cand.push(rest(c.sym));
        A.candNext.push(nextX(c.sym));
      }
      for (const w of nar.weak.filter((r) => isB3Equity(BR_UNI.bySym[r.sym]))) {
        A.weak.push(rest(w.sym));
        A.weakNext.push(nextX(w.sym));
      }
      for (const a of BR_UNI.assets) {
        if (!isB3Equity(a) || a.nt) continue;
        A.base.push(rest(a.sym));
        A.baseNext.push(nextX(a.sym));
      }
    });
  }
  const r1 = (x) => (x?.n ? x : null);
  const checkpoints = CHECKPOINTS.map(([frac, label], k) => {
    const A = acc[k];
    const up = summary(A.up, 1);
    const down = summary(A.down, -1);
    const c = summary(A.cand, 1);
    const cn = summary(A.candNext, 1);
    const w = summary(A.weak, -1);
    const wn = summary(A.weakNext, -1);
    return {
      frac,
      label,
      sectors: {
        up: {
          n: up.n,
          cont: up.hit ?? null,
          dayBps: up.bps ?? null,
          restBps: summary(A.upRest).bps ?? null,
        },
        down: { n: down.n, cont: down.hit ?? null, dayBps: down.bps ?? null, restBps: summary(A.downRest).bps ?? null }, // prettier-ignore
      },
      cand: { n: cn.n, restBps: frac < 1 ? (r1(c)?.bps ?? null) : null, restHit: frac < 1 ? (r1(c)?.hit ?? null) : null, restT: frac < 1 ? (r1(c)?.t ?? null) : null, nextBps: cn.bps ?? null, nextHit: cn.hit ?? null, nextT: cn.t ?? null }, // prettier-ignore
      weak: { n: wn.n, restBps: frac < 1 ? (r1(w)?.bps ?? null) : null, restHit: frac < 1 ? (r1(w)?.hit ?? null) : null, restT: frac < 1 ? (r1(w)?.t ?? null) : null, nextBps: wn.bps ?? null, nextHit: wn.hit ?? null, nextT: wn.t ?? null }, // prettier-ignore
      base: { restBps: frac < 1 ? (summary(A.base).bps ?? null) : null, nextBps: summary(A.baseNext).bps ?? null }, // prettier-ignore
    };
  });
  const mid = checkpoints.find((c) => c.frac === 0.5);
  const used = days.filter((d) => {
    const i = allDates.indexOf(d);
    return i >= 70 && i < allDates.length - 1;
  });
  return {
    days: used.length,
    from: used[0] ?? null,
    to: used.at(-1) ?? null,
    volCurve: volCurve.map(([x, y]) => [x, Math.round(y * 1000) / 1000]),
    checkpoints,
    base: mid?.base ?? null,
  };
}

// ───────────── coleta (Yahoo) ─────────────

const UA = { "User-Agent": "Mozilla/5.0 (pendulo study)" };
async function yahoo(sym, qs) {
  for (let k = 0; k < 3; k++) {
    try {
      const r = await fetch(`https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(sym)}?${qs}`, { headers: UA }); // prettier-ignore
      if (r.ok) return (await r.json())?.chart?.result?.[0] ?? null;
    } catch {
      /* tenta de novo */
    }
    await new Promise((res) => setTimeout(res, 1500 * (k + 1)));
  }
  return null;
}
const dayOf = (t, tz) =>
  new Intl.DateTimeFormat("en-CA", { timeZone: tz }).format(new Date(t * 1000));

async function loadDaily(sym) {
  const r = await yahoo(sym, "range=2y&interval=1d");
  if (!r?.timestamp) return null;
  const tz = r.meta?.exchangeTimezoneName ?? "America/Sao_Paulo";
  const q = r.indicators?.quote?.[0] ?? {};
  const adj = r.indicators?.adjclose?.[0]?.adjclose ?? q.close ?? [];
  const out = { dates: [], close: [], vol: [], fac: new Map() };
  r.timestamp.forEach((t, i) => {
    if (!(adj[i] > 0)) return;
    const d = dayOf(t, tz);
    if (out.dates.at(-1) === d) (out.dates.pop(), out.close.pop(), out.vol.pop());
    out.dates.push(d);
    out.close.push(adj[i]);
    out.vol.push(q.volume?.[i] > 0 ? q.volume[i] : 0);
    if (q.close?.[i] > 0) out.fac.set(d, adj[i] / q.close[i]); // ajuste por proventos do dia
  });
  return out;
}

async function loadIntra(sym) {
  const r = await yahoo(sym, "range=60d&interval=5m");
  if (!r?.timestamp) return null;
  const q = r.indicators?.quote?.[0] ?? {};
  return { t: r.timestamp, c: q.close ?? [], v: q.volume ?? [] };
}

async function pool(items, n, fn) {
  const out = {};
  let i = 0;
  await Promise.all(
    Array.from({ length: n }, async () => {
      while (i < items.length) {
        const sym = items[i++];
        const v = await fn(sym);
        if (v) out[sym] = v;
      }
    }),
  );
  return out;
}

async function main() {
  const syms = [...new Set([...BR_FLOW_SYMBOLS, "LFTS11.SA"])];
  const daily = await pool(syms, 6, loadDaily);
  const intra = await pool(syms, 6, loadIntra);
  if (!daily["^BVSP"] || !intra["^BVSP"]) throw new Error("sem Ibovespa no Yahoo");
  // ajuste por proventos: o diário é ajustado e o intradiário não; o fator do dia leva o intradiário à mesma escala
  for (const [sym, s] of Object.entries(intra)) {
    const fac = daily[sym]?.fac;
    if (fac) s.c = s.c.map((c, i) => (c > 0 ? c * (fac.get(dayKey(s.t[i])) ?? 1) : c));
  }
  const days = [...new Set(intra["^BVSP"].t.map(dayKey))].sort();
  const res = runStudy(daily, intra, days);
  const out = {
    generated_at: new Date().toISOString(),
    symbols: Object.keys(intra).length,
    ...res,
  };
  await writeFile(new URL("../data/br-flow-study.json", import.meta.url), `${JSON.stringify(out, null, 1)}\n`); // prettier-ignore
  console.log(JSON.stringify({ days: out.days, volCurve: out.volCurve, mid: out.checkpoints.find((c) => c.frac === 0.5) }, null, 1)); // prettier-ignore
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) await main();
