// Rotação setorial (sistema-semente da lição 17; docs/ROADMAP-APRENDIZADO.md, fase F16).
// Regras definidas ANTES do teste: rebalanceio no último pregão de cada mês, 0,05% de custo sobre o giro.
//   A: top 3 dos 11 setores SPDR por retorno de 6 meses, só com o S&P acima da MM200; senão caixa (BIL, T-bill).
//   B: igual, mas ranqueando pelo momentum 12-1 (12 meses sem o último).
//   C: top 3 por 6 meses, sempre investido (sem o filtro da MM200).
// Referências: S&P (SPY) comprar e segurar; 11 setores em pesos iguais (rebalanceio mensal).
// Uso: node scripts/sector-study.mjs [--dry]   Saída: data/sector-study.json (o relatório vai em docs/ESTUDO-SETORIAL.md).
import { writeFile } from "node:fs/promises";

const root = new URL("..", import.meta.url);
const DRY = process.argv.includes("--dry");
const SECT = ["XLK", "XLC", "XLY", "XLP", "XLE", "XLF", "XLV", "XLI", "XLB", "XLRE", "XLU"];
const COST = 0.0005;

async function chart(sym) {
  const p1 = Math.floor(Date.UTC(2007, 0, 1) / 1000);
  const p2 = Math.floor(Date.now() / 1000);
  const u = `https://query1.finance.yahoo.com/v8/finance/chart/${sym}?period1=${p1}&period2=${p2}&interval=1d`; // diário explícito (range=max vira mensal)
  const r = await fetch(u, { headers: { "User-Agent": "Mozilla/5.0" }, signal: AbortSignal.timeout(30000) }); // prettier-ignore
  const j = (await r.json()).chart?.result?.[0];
  const adj = j?.indicators?.adjclose?.[0]?.adjclose;
  const out = new Map();
  j.timestamp.forEach((t, i) => {
    if (adj[i] > 0) out.set(new Date(t * 1000).toISOString().slice(0, 10), adj[i]); // ajustado: inclui dividendos
  });
  return out;
}
const series = {};
for (const s of ["SPY", "BIL", ...SECT]) series[s] = await chart(s);
const dates = [...series.SPY.keys()].filter((d) => d >= "2008-01-01").sort();
const px = (s, d) => series[s].get(d);
const idx = new Map(dates.map((d, i) => [d, i]));
const back = (s, i, n) => (i - n >= 0 ? px(s, dates[i - n]) : undefined);
const sma = (s, i, n) => {
  let t = 0;
  for (let k = i - n + 1; k <= i; k++) {
    const v = px(s, dates[k]);
    if (!(v > 0)) return null;
    t += v;
  }
  return t / n;
};
const monthEnds = dates.filter(
  (d, i) => i + 1 < dates.length && dates[i + 1].slice(0, 7) !== d.slice(0, 7),
);

/** Pesos-alvo de uma estratégia no fechamento do dia i (só com dados até i). */
function target(kind, i) {
  if (kind === "spy") return { SPY: 1 };
  if (kind === "D") return px("SPY", dates[i]) > sma("SPY", i, 200) ? { SPY: 1 } : { BIL: 1 }; // diagnóstico extra
  const elig = SECT.filter((s) => px(s, dates[i]) > 0 && back(s, i, 252) > 0);
  if (kind === "ew") return Object.fromEntries(elig.map((s) => [s, 1 / elig.length]));
  const spy = px("SPY", dates[i]);
  const bull = spy > sma("SPY", i, 200);
  if (kind !== "C" && !bull) return { BIL: 1 };
  const score = (s) => (kind === "B" ? back(s, i, 21) / back(s, i, 252) - 1 : px(s, dates[i]) / back(s, i, 126) - 1); // prettier-ignore
  const top = elig.map((s) => [s, score(s)]).filter(([, v]) => Number.isFinite(v)).sort((a, b) => b[1] - a[1]).slice(0, 3); // prettier-ignore
  return Object.fromEntries(top.map(([s]) => [s, 1 / top.length]));
}

/** Simula com os pesos derivando entre rebalanceios; devolve a curva diária e o giro. */
function simulate(kind, from) {
  const start = idx.get(monthEnds.find((d) => d >= from));
  let w = target(kind, start);
  let eq = 1;
  const curve = [{ d: dates[start], v: 1, cash: !!w.BIL }];
  let turnover = 0;
  let cashDays = 0;
  for (let i = start + 1; i < dates.length; i++) {
    let r = 0;
    const nw = {};
    for (const [s, x] of Object.entries(w)) {
      const a = px(s, dates[i - 1]);
      const b = px(s, dates[i]);
      const rr = a > 0 && b > 0 ? b / a - 1 : 0;
      r += x * rr;
      nw[s] = x * (1 + rr);
    }
    eq *= 1 + r;
    const tot = Object.values(nw).reduce((a, b) => a + b, 0) || 1;
    w = Object.fromEntries(Object.entries(nw).map(([s, x]) => [s, x / tot]));
    if (w.BIL > 0.5) cashDays++;
    if (monthEnds.includes(dates[i]) && kind !== "spy") {
      const t = target(kind, i);
      const keys = new Set([...Object.keys(w), ...Object.keys(t)]);
      const to = [...keys].reduce((a, s) => a + Math.abs((t[s] ?? 0) - (w[s] ?? 0)), 0);
      turnover += to;
      eq *= 1 - COST * to;
      w = t;
    }
    curve.push({ d: dates[i], v: eq });
  }
  return { curve, turnover, cashDays };
}

function metrics(curve, from, to, rf) {
  const pts = curve.filter((p) => p.d >= from && p.d <= to);
  if (pts.length < 60) return null;
  const rets = pts.slice(1).map((p, k) => p.v / pts[k].v - 1);
  const rfr = pts.slice(1).map((p, k) => (rf.get(p.d) && rf.get(pts[k].d) ? rf.get(p.d) / rf.get(pts[k].d) - 1 : 0)); // prettier-ignore
  const yrs = rets.length / 252;
  const cagr = (pts.at(-1).v / pts[0].v) ** (1 / yrs) - 1;
  const m = rets.reduce((a, b) => a + b, 0) / rets.length;
  const vol =
    Math.sqrt(rets.reduce((a, b) => a + (b - m) ** 2, 0) / (rets.length - 1)) * Math.sqrt(252);
  const ex = rets.map((r, k) => r - rfr[k]);
  const me = ex.reduce((a, b) => a + b, 0) / ex.length;
  const sharpe = (me * 252) / vol;
  let peak = 0;
  let mdd = 0;
  for (const p of pts) {
    peak = Math.max(peak, p.v);
    mdd = Math.min(mdd, p.v / peak - 1);
  }
  return { cagr, vol, sharpe, mdd, calmar: mdd ? cagr / -mdd : null, years: +yrs.toFixed(1) };
}

const FROM = "2009-07-01"; // precisa de 12 meses de histórico dos setores para o momentum
const periods = [
  ["Tudo", FROM, dates.at(-1)],
  ["2009–2015", FROM, "2015-12-31"],
  ["2016–2020", "2016-01-01", "2020-12-31"],
  ["2021–2026", "2021-01-01", dates.at(-1)],
];
const KINDS = { A: "Top 3 em 6 meses + filtro MM200", B: "Top 3 em momentum 12-1 + filtro MM200", C: "Top 3 em 6 meses, sempre investido", D: "S&P com filtro MM200 (diagnóstico extra, fora do plano)", ew: "11 setores em pesos iguais", spy: "S&P 500 (SPY) comprar e segurar" }; // prettier-ignore
const out = {
  generatedAt: new Date().toISOString(),
  from: FROM,
  to: dates.at(-1),
  cost: COST,
  strategies: {},
};
for (const [k, label] of Object.entries(KINDS)) {
  const sim = simulate(k, FROM);
  const yrs = (sim.curve.length - 1) / 252;
  out.strategies[k] = {
    label,
    turnoverYear: +(sim.turnover / yrs).toFixed(2),
    cashShare: +(sim.cashDays / (sim.curve.length - 1)).toFixed(3),
    periods: Object.fromEntries(
      periods.map(([n, a, b]) => [n, metrics(sim.curve, a, b, series.BIL)]),
    ),
  };
}
// posição atual de cada estratégia (último pregão)
const last = dates.length - 1;
out.now = Object.fromEntries(["A", "B", "C"].map((k) => [k, Object.keys(target(k, last))]));
const f = (x, d = 1) => (Number.isFinite(x) ? `${(x * 100).toFixed(d)}%` : "–");
for (const [k, st] of Object.entries(out.strategies)) {
  console.log(`\n${k} · ${st.label} · giro ${st.turnoverYear}x/ano · caixa ${f(st.cashShare, 0)}`);
  for (const [n, m] of Object.entries(st.periods))
    if (m) console.log(`  ${n.padEnd(10)} CAGR ${f(m.cagr).padStart(6)} vol ${f(m.vol).padStart(6)} Sharpe ${m.sharpe.toFixed(2).padStart(5)} MDD ${f(m.mdd).padStart(7)} Calmar ${(m.calmar ?? 0).toFixed(2)}`); // prettier-ignore
}
console.log("\nhoje:", JSON.stringify(out.now));
if (!DRY) await writeFile(new URL("data/sector-study.json", root), JSON.stringify(out, null, 1));
