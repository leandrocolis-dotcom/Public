// Backtest da nota Quant Aberto (réplica do Seeking Alpha) com o passado: em cada pregão dos ~2 anos de data/hist,
// reconstrói as métricas de cada ação do S&P 500 só com o que já estava publicado (balanço anual +75 dias,
// trimestral +45 dias; data/fund-hist.json) e o preço do dia, roda o mesmo scoreUniverse do app e mede o retorno
// 21 pregões depois: correlação nota × retorno (IC), retorno por faixa (Compra forte … Venda forte), por fator,
// e a carteira Top 20 rebalanceada a cada 21 pregões contra o SPY e a média das ações.
// Limite: "Revisões" (25% da nota no SA) não tem histórico por data na fonte gratuita: fica de fora e os pesos dos
// outros fatores se redistribuem. Crescimento usa 4 métricas anuais (sem as projeções do SA).
// Uso: node scripts/quant-backtest.mjs → data/quant-backtest.json. Material educacional.
import { readFile, writeFile } from "node:fs/promises";
import { FACTORS, scoreUniverse, spearman, topPicks } from "../assets/quant.js";

const root = new URL("../", import.meta.url);
const read = async (p, d) => JSON.parse(await readFile(new URL(p, root), "utf8").catch(() => JSON.stringify(d))); // prettier-ignore
const fund = (await read("data/fund-hist.json", { syms: {} })).syms;
const quant = await read("data/quant.json", { rows: [] });
// crescimento só com o que existe por data (o SA usa também projeções de analistas)
FACTORS.growth.metrics = [
  ["revG", 1],
  ["epsG", 1],
  ["niG", 1],
  ["ocfG", 1],
];

const H = 21;
const series = {};
for (const sym of [...quant.rows.map((r) => r.sym), "SPY"]) {
  const txt = await readFile(new URL(`data/hist/${sym.replace(".", "-")}.csv`, root), "utf8").catch(() => null) ?? await readFile(new URL(`data/hist/${sym}.csv`, root), "utf8").catch(() => null); // prettier-ignore
  if (!txt) continue;
  const d = [], c = []; // prettier-ignore
  for (const l of txt.trim().split("\n").slice(1)) {
    const x = l.split(",");
    if (+x[4] > 0) (d.push(x[0]), c.push(+x[4]));
  }
  if (c.length > 200) series[sym] = { d, c, at: new Map(d.map((x, i) => [x, i])) };
}
const cal = series.SPY.d;
const sector = Object.fromEntries(quant.rows.map((r) => [r.sym, r.sector]));
const add = (iso, n) => new Date(Date.parse(iso) + n * 864e5).toISOString().slice(0, 10);

/** Valor publicado até o dia: soma dos 4 trimestres (fluxo) ou o último trimestre (estoque); senão o anual. */
function pit(f, key, day, flow) {
  const q = (f[key] ?? []).filter(([a, v]) => v !== null && add(a, 45) <= day);
  if (flow && q.length >= 4) return q.slice(-4).reduce((s, [, v]) => s + v, 0);
  if (!flow && q.length) return q.at(-1)[1];
  const a = (f[`${key}A`] ?? []).filter(([d, v]) => v !== null && add(d, 75) <= day);
  return a.length ? a.at(-1)[1] : null;
}
function annualGrowth(f, key, day) {
  const a = (f[`${key}A`] ?? []).filter(([d, v]) => v !== null && add(d, 75) <= day);
  if (a.length < 2) return null;
  const [p, n] = [a.at(-2)[1], a.at(-1)[1]];
  return Math.abs(p) > 0 ? Math.max(-3, Math.min(3, (n - p) / Math.abs(p))) : null;
}
const r = (S, i, k) => (i - k >= 0 ? S.c[i] / S.c[i - k] - 1 : null);

function metricsAt(sym, day) {
  const S = series[sym];
  const f = fund[sym];
  const i = S?.at.get(day);
  if (i === undefined || !f || i < 126) return null;
  const px = S.c[i];
  const sh = pit(f, "sh", day, false);
  const mcap = sh > 0 ? sh * px : null;
  const rev = pit(f, "rev", day, true), ni = pit(f, "ni", day, true), eps = pit(f, "eps", day, true); // prettier-ignore
  const gp = pit(f, "gp", day, true), oi = pit(f, "oi", day, true), ebitda = pit(f, "ebitda", day, true); // prettier-ignore
  const ocf = pit(f, "ocf", day, true), fcf = pit(f, "fcf", day, true); // prettier-ignore
  const eq = pit(f, "eq", day, false), ta = pit(f, "ta", day, false); // prettier-ignore
  const div = (a, b) => (a !== null && b ? a / b : null);
  return {
    ey: div(eps, px), sy: div(rev, mcap), by: div(eq, mcap), cfy: div(ocf, mcap), fcfy: div(fcf, mcap), ebitdaY: div(ebitda, mcap), ebitY: div(oi, mcap),
    revG: annualGrowth(f, "rev", day), epsG: annualGrowth(f, "eps", day), niG: annualGrowth(f, "ni", day), ocfG: annualGrowth(f, "ocf", day),
    gm: div(gp, rev), om: div(oi, rev), ebitdaM: div(ebitda, rev), pm: div(ni, rev), fcfm: div(fcf, rev), roe: eq > 0 ? div(ni, eq) : null, roa: div(ni, ta), ocfAbs: ocf,
    r3: r(S, i, 63), r6: r(S, i, 126), r9: r(S, i, 189), r12: r(S, i, 252),
  }; // prettier-ignore
}

// ── uma foto por pregão ──
const days = cal.filter((d, k) => k >= 126 && k + H < cal.length);
const RATS = ["Compra forte", "Compra", "Manter", "Venda", "Venda forte"];
const snaps = [];
for (const day of days) {
  const rows = [];
  for (const sym of Object.keys(sector)) {
    const m = metricsAt(sym, day);
    if (m) rows.push({ sym, sector: sector[sym], m });
  }
  if (rows.length < 200) continue;
  const sc = scoreUniverse(rows).filter((x) => x.score !== null);
  const k = cal.indexOf(day);
  const fwd = (sym) => {
    const S = series[sym], i = S.at.get(day); // prettier-ignore
    return S.d[i + H] === cal[k + H] ? S.c[i + H] / S.c[i] - 1 : null;
  };
  const spy = series.SPY.c[k + H] / series.SPY.c[k] - 1;
  const rowsF = sc.map((x) => ({ ...x, fwd: fwd(x.sym) })).filter((x) => x.fwd !== null);
  const avg = rowsF.reduce((a, x) => a + x.fwd, 0) / rowsF.length;
  snaps.push({ day, rows: rowsF, avg, spy });
}

// ── avaliação ──
const mean = (a) => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : null);
const sd = (a) => { const m = mean(a); return Math.sqrt(a.reduce((x, y) => x + (y - m) ** 2, 0) / Math.max(1, a.length - 1)); }; // prettier-ignore
const tOf = (arr) => { const s = arr.filter((_, i) => i % H === 0); return s.length > 3 ? (mean(s) / (sd(s) || 1)) * Math.sqrt(s.length) : null; }; // prettier-ignore
const cut = snaps[Math.floor(snaps.length / 2)].day;
function evalSet(list) {
  const ic = list.map((s) =>
    spearman(
      s.rows.map((x) => x.score),
      s.rows.map((x) => x.fwd),
    ),
  );
  const fic = Object.fromEntries(Object.keys(FACTORS).map((f) => {
    const v = list.map((s) => { const rr = s.rows.filter((x) => Number.isFinite(x.f[f])); return rr.length > 50 ? spearman(rr.map((x) => x.f[f]), rr.map((x) => x.fwd)) : null; }).filter((x) => x !== null); // prettier-ignore
    return [f, v.length ? { ic: mean(v), t: tOf(v), n: v.length } : null];
  })); // prettier-ignore
  const byRating = Object.fromEntries(RATS.map((rt) => {
    const ex = list.map((s) => { const rr = s.rows.filter((x) => x.rating?.[0] === rt || x.rating === rt || x.rating?.label === rt); return rr.length ? mean(rr.map((x) => x.fwd)) - s.avg : null; }).filter((x) => x !== null); // prettier-ignore
    const n = list.reduce((a, s) => a + s.rows.filter((x) => x.rating?.[0] === rt || x.rating === rt || x.rating?.label === rt).length, 0); // prettier-ignore
    return [rt, { exVsMedia: mean(ex), t: tOf(ex), n }];
  })); // prettier-ignore
  const top = list.map((s) => {
    const set = new Set(topPicks(s.rows, { n: 20 }));
    const rr = s.rows.filter((x) => set.has(x.sym));
    return { ret: mean(rr.map((x) => x.fwd)), spy: s.spy, avg: s.avg };
  });
  return {
    days: list.length,
    ic: { mean: mean(ic), t: tOf(ic), pos: ic.filter((x) => x > 0).length / ic.length },
    factors: fic,
    byRating,
    top20: { vsSpy: mean(top.map((x) => x.ret - x.spy)), vsMedia: mean(top.map((x) => x.ret - x.avg)), t: tOf(top.map((x) => x.ret - x.spy)), hit: top.filter((x) => x.ret > x.spy).length / top.length }, // prettier-ignore
  };
}
// carteira Top 20 encadeada (rebalanceia a cada 21 pregões, sem custos)
let eq = 1, eqSpy = 1, eqAvg = 1; // prettier-ignore
const curve = [];
let prev = [];
for (let i = 0; i < snaps.length; i += H) {
  const s = snaps[i];
  prev = topPicks(s.rows, { n: 20, prev }); // como o ProPicks: quem continua bem colocado fica
  const set = new Set(prev);
  const ret = mean(s.rows.filter((x) => set.has(x.sym)).map((x) => x.fwd));
  eq *= 1 + ret;
  eqSpy *= 1 + s.spy;
  eqAvg *= 1 + s.avg; // prettier-ignore
  curve.push({ day: s.day, top20: eq, spy: eqSpy, media: eqAvg });
}
const ratingKey = (x) => (Array.isArray(x) ? x[0] : (x?.label ?? x));
const sample = snaps
  .at(-1)
  .rows.slice(0, 1)
  .map((x) => ratingKey(x.rating));
const out = {
  updated_at: new Date().toISOString(),
  method: "Fotos diárias da nota Quant Aberto reconstruída só com dados já publicados; retorno de 21 pregões; t sem sobreposição (um a cada 21). Revisões fora (sem histórico).",
  stockDays: snaps.reduce((a, s) => a + s.rows.length, 0),
  snapshots: snaps.length,
  from: snaps[0].day, to: snaps.at(-1).day, cut,
  all: evalSet(snaps), is: evalSet(snaps.filter((s) => s.day < cut)), oos: evalSet(snaps.filter((s) => s.day >= cut)),
  curve, sample,
}; // prettier-ignore
await writeFile(new URL("data/quant-backtest.json", root), JSON.stringify(out));
const p = (x) => (x == null ? "–" : `${(x * 100).toFixed(2)}%`);
console.log(`${out.snapshots} fotos diárias · ${out.stockDays} notas ação-dia · ${out.from} a ${out.to} · amostra rating: ${sample}`); // prettier-ignore
for (const [k, e] of Object.entries({ todo: out.all, dentro: out.is, fora: out.oos })) {
  console.log(`\n[${k}] IC ${e.ic.mean.toFixed(3)} (t ${e.ic.t?.toFixed(2)}, ${p(e.ic.pos)} dias >0) · Top20 vs SPY ${p(e.top20.vsSpy)}/21d (t ${e.top20.t?.toFixed(2)}, bate ${p(e.top20.hit)}) vs média ${p(e.top20.vsMedia)}`); // prettier-ignore
  console.log("  faixas:", Object.entries(e.byRating).map(([r, v]) => `${r} ${p(v.exVsMedia)} (n ${v.n}, t ${v.t?.toFixed(1)})`).join(" | ")); // prettier-ignore
  console.log("  fatores:", Object.entries(e.factors).map(([f, v]) => `${f} ${v ? `${v.ic.toFixed(3)} t${v.t?.toFixed(1)}` : "–"}`).join(" | ")); // prettier-ignore
}
const c = curve.at(-1);
console.log(`\ncarteira Top 20: ${p(c.top20 - 1)} · SPY ${p(c.spy - 1)} · média das ações ${p(c.media - 1)} (${curve.length} rebalanceamentos)`); // prettier-ignore
