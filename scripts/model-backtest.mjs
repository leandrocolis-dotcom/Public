// Backtest do modelo novo, ponto a ponto no tempo: em cada pregão dos ~2 anos de data/hist, roda as regras de
// gatilho (assets/signals.js) em cada ativo e, para cada gatilho de entrada, monta o que o modelo sabia NAQUELE dia:
// pilares (técnica etc.), regime do S&P, regime macro (FRED com atraso de publicação), estresse de crédito e a
// inclinação histórica do setor no regime (só com meses anteriores). Depois mede 5 e 21 pregões à frente, em
// excesso sobre o SPY, comparando "todos os gatilhos" com os filtros do modelo. Os pesos dos pilares são
// estimados só na primeira metade (dentro da amostra) e avaliados na segunda (fora da amostra).
// Uso: node scripts/model-backtest.mjs → data/model-backtest.json (+ data/macro-hist.json como banco). Educacional.
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { readFile, readdir, writeFile } from "node:fs/promises";
import { RULES, indicators } from "../assets/signals.js";

const run = promisify(execFile);
const root = new URL("../", import.meta.url);
const read = async (p, d) => JSON.parse(await readFile(new URL(p, root), "utf8").catch(() => JSON.stringify(d))); // prettier-ignore
const curl = async (url, ua = true) => (await run("curl", ["-sS", "-m", "40", "-f", ...(ua ? ["-A", "Mozilla/5.0"] : []), url], { maxBuffer: 64e6 })).stdout; // prettier-ignore

// ── banco macro histórico (FRED + setores mensais), reaproveitado nas próximas rodadas ──
const mh = await read("data/macro-hist.json", { at: null, fred: {}, monthly: {} });
const fresh = mh.at && Date.now() - Date.parse(mh.at) < 20 * 3600e3;
if (!fresh) {
  for (const id of ["INDPRO", "CPIAUCSL", "BAMLH0A0HYM2", "T10Y3M"]) {
    try {
      const csv = await curl(`https://fred.stlouisfed.org/graph/fredgraph.csv?id=${id}`, false);
      mh.fred[id] = csv.trim().split("\n").slice(1).map((l) => l.split(",")).filter(([, v]) => v && v !== ".").map(([d, v]) => [d, +v]); // prettier-ignore
    } catch (e) {
      console.log(`FRED ${id}: ${e.message} (uso o banco)`);
    }
  }
  for (const s of [
    "SPY",
    "XLB",
    "XLE",
    "XLF",
    "XLI",
    "XLK",
    "XLP",
    "XLU",
    "XLV",
    "XLY",
    "XLRE",
    "XLC",
    "TLT",
    "GLD",
    "IWM",
    "EEM",
  ]) {
    try {
      const j = JSON.parse(
        await curl(`https://query1.finance.yahoo.com/v8/finance/chart/${s}?range=max&interval=1mo`),
      );
      const r = j.chart.result[0];
      const adj = r.indicators.adjclose?.[0]?.adjclose ?? r.indicators.quote[0].close;
      mh.monthly[s] = r.timestamp.map((t, i) => [new Date(t * 1000).toISOString().slice(0, 7), adj[i]]).filter(([, v]) => v > 0); // prettier-ignore
    } catch (e) {
      console.log(`Yahoo ${s}: ${e.message} (uso o banco)`);
    }
  }
  mh.at = new Date().toISOString();
  await writeFile(new URL("data/macro-hist.json", root), JSON.stringify(mh));
}

// ── regime macro mensal (relógio do investimento), conhecido com 1 mês de atraso ──
const mm = (s) => new Map(s.map(([d, v]) => [d.slice(0, 7), v]));
const ip = mm(mh.fred.INDPRO), cpi = mm(mh.fred.CPIAUCSL); // prettier-ignore
const shift = (m, k) => { let [y, mo] = m.split("-").map(Number); mo += k; while (mo < 1) { mo += 12; y--; } while (mo > 12) { mo -= 12; y++; } return `${y}-${String(mo).padStart(2, "0")}`; }; // prettier-ignore
const yoyM = (map, m) =>
  map.get(m) && map.get(shift(m, -12)) ? map.get(m) / map.get(shift(m, -12)) - 1 : null;
function regimeOfMonth(m) {
  const g = yoyM(ip, m), g3 = yoyM(ip, shift(m, -3)), p = yoyM(cpi, m), p3 = yoyM(cpi, shift(m, -3)); // prettier-ignore
  if ([g, g3, p, p3].some((x) => x === null)) return null;
  const dg = g - g3, dp = p - p3; // prettier-ignore
  return dg >= 0 ? (dp >= 0 ? "super" : "recup") : dp >= 0 ? "estag" : "desac";
}
/** Regime que se conhecia no dia: o do mês anterior (dado publicado com ~1 mês de atraso), ou o mais recente antes. */
function regimeOnDay(day) {
  for (let k = 2; k <= 4; k++) {
    const r = regimeOfMonth(shift(day.slice(0, 7), -k + 1));
    if (r) return r;
  }
  return null;
}
// inclinação do setor no regime, só com meses anteriores ao dia (sem olhar o futuro)
const mon = Object.fromEntries(Object.entries(mh.monthly).map(([s, l]) => [s, new Map(l)]));
const months = [...(mon.SPY?.keys() ?? [])].filter((m) => m >= "1999-01");
const tiltCache = new Map();
function sectorTilt(sec, reg, day) {
  const key = `${sec}|${reg}|${day.slice(0, 7)}`;
  if (tiltCache.has(key)) return tiltCache.get(key);
  const xs = [];
  for (let i = 0; i < months.length - 1; i++) {
    const m = months[i], n = months[i + 1]; // prettier-ignore
    if (n >= day.slice(0, 7)) break;
    if (regimeOnDay(`${m}-15`) !== reg) continue;
    const a = mon[sec]?.get(m), b = mon[sec]?.get(n), sa = mon.SPY.get(m), sb = mon.SPY.get(n); // prettier-ignore
    if (a > 0 && b > 0 && sa > 0 && sb > 0) xs.push(b / a - sb / sa);
  }
  const v =
    xs.length >= 12
      ? (xs.reduce((x, y) => x + y, 0) / xs.length) * (xs.length / (xs.length + 24))
      : null;
  tiltCache.set(key, v);
  return v;
}
const hyS = mh.fred.BAMLH0A0HYM2 ?? [];
function hyStress(day) {
  let i = hyS.findIndex(([d]) => d >= day);
  if (i < 0) i = hyS.length;
  const now = hyS[i - 1]?.[1], before = hyS[i - 22]?.[1]; // prettier-ignore
  return now != null && before != null ? now - before : null;
}

// ── ativos, setores e pesos dos pilares ──
const quant = await read("data/quant.json", { rows: [] });
const GICS = { "Information Technology": "XLK", "Health Care": "XLV", Financials: "XLF", "Consumer Discretionary": "XLY", "Consumer Staples": "XLP", Energy: "XLE", Industrials: "XLI", Materials: "XLB", Utilities: "XLU", "Real Estate": "XLRE", "Communication Services": "XLC" }; // prettier-ignore
const SECTOR = Object.fromEntries(
  quant.rows.map((r) => [r.sym, GICS[r.sector]]).filter(([, v]) => v),
);
for (const s of Object.keys(mon)) SECTOR[s] ??= s;
Object.assign(SECTOR, { QQQ: "XLK", SMH: "XLK", VGT: "XLK", XOP: "XLE", USO: "XLE", KRE: "XLF", IEF: "TLT", GDX: "GLD", IAU: "GLD", SLV: "GLD", IBB: "XLV", ITA: "XLI" }); // prettier-ignore

const HIST = new URL("data/hist/", root);
const series = {};
for (const f of (await readdir(HIST)).filter((x) => x.endsWith(".csv"))) {
  const rows = (await readFile(new URL(f, HIST), "utf8")).trim().split("\n").slice(1).map((l) => l.split(",")); // prettier-ignore
  const d = [], c = []; // prettier-ignore
  for (const x of rows) if (+x[4] > 0) (d.push(x[0]), c.push(+x[4]));
  if (c.length >= 260) series[f.slice(0, -4)] = { d, c, at: new Map(d.map((x, i) => [x, i])) };
}
const spy = series.SPY;
const ma = (c, i, n) => { let s = 0; for (let k = i - n + 1; k <= i; k++) s += c[k]; return s / n; }; // prettier-ignore

// ── simulações: um gatilho de entrada = uma simulação ──
const sims = [];
for (const [sym, S] of Object.entries(series)) {
  for (let i = 200; i < S.c.length - 5; i++) {
    const day = S.d[i];
    const si = spy.at.get(day);
    if (si === undefined) continue;
    const x = indicators(S.c, i); // só usa preços até i (sem olhar o futuro)
    if (!x) continue;
    for (const r of RULES) {
      if (r.kind !== "entry") continue;
      const st = r.test(x);
      if (!(st > 0)) continue;
      const fwd = (h) => (S.d[i + h] && spy.d[si + h] === S.d[i + h] ? Math.log(S.c[i + h] / S.c[i]) - Math.log(spy.c[si + h] / spy.c[si]) : null); // prettier-ignore
      const reg = regimeOnDay(day);
      const sec = SECTOR[sym];
      sims.push({
        sym, day, code: r.code, strength: st,
        tec: Math.log(S.c[i] / ma(S.c, i, 200)),
        spyBull: spy.c[si] > ma(spy.c, si, 200),
        reg, sec,
        tilt: sec && reg ? sectorTilt(sec, reg, day) : null,
        hy: hyStress(day),
        r5: fwd(5), r21: fwd(21),
      }); // prettier-ignore
    }
  }
}

// ── avaliação ──
const days = [...new Set(sims.map((s) => s.day))].sort();
const cut = days[Math.floor(days.length / 2)];
const mean = (a) => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : null);
const sd = (a) => { const m = mean(a); return Math.sqrt(a.reduce((x, y) => x + (y - m) ** 2, 0) / Math.max(1, a.length - 1)); }; // prettier-ignore
/** t por dia (gatilhos do mesmo dia são correlacionados): média dos dias / erro-padrão entre dias, sem sobreposição. */
function stats(list, h) {
  const k = h === 5 ? "r5" : "r21";
  const l = list.filter((s) => s[k] !== null);
  if (l.length < 30) return { n: l.length };
  const byDay = new Map();
  for (const s of l) (byDay.get(s.day) ?? byDay.set(s.day, []).get(s.day)).push(s[k]);
  const dm = [...byDay].sort((a, b) => a[0].localeCompare(b[0])).map(([, v]) => mean(v));
  const step = dm.filter((_, i) => i % h === 0);
  return {
    n: l.length,
    days: dm.length,
    avg: mean(l.map((s) => s[k])),
    hit: l.filter((s) => s[k] > 0).length / l.length,
    t: step.length > 3 ? (mean(step) / (sd(step) || 1)) * Math.sqrt(step.length) : null,
  };
}
const FILTERS = [
  ["todos", "Todos os gatilhos de entrada (como hoje)", () => true],
  ["tec", "+ técnica a favor (preço acima da MM200)", (s) => s.tec > 0],
  ["spy", "+ S&P acima da MM200", (s) => s.spyBull],
  ["macro", "+ setor favorecido no regime macro", (s) => s.tilt !== null && s.tilt > 0],
  [
    "credito",
    "+ crédito sem estresse (spread HY não abriu > 0,3 p.p. no mês)",
    (s) => s.hy === null || s.hy <= 0.3,
  ],
  ["modelo", "Modelo completo: técnica + S&P + macro + crédito", (s) => s.tec > 0 && s.spyBull && s.tilt > 0 && (s.hy === null || s.hy <= 0.3)], // prettier-ignore
  ["contra", "Gatilhos que o modelo rejeitaria", (s) => !(s.tec > 0 && s.spyBull && s.tilt > 0 && (s.hy === null || s.hy <= 0.3))], // prettier-ignore
];
const halves = { is: sims.filter((s) => s.day < cut), oos: sims.filter((s) => s.day >= cut) };
const table = FILTERS.map(([k, label, f]) => ({
  k, label,
  all: { 5: stats(sims.filter(f), 5), 21: stats(sims.filter(f), 21) },
  is: { 5: stats(halves.is.filter(f), 5), 21: stats(halves.is.filter(f), 21) },
  oos: { 5: stats(halves.oos.filter(f), 5), 21: stats(halves.oos.filter(f), 21) },
})); // prettier-ignore
const byRule = Object.fromEntries(
  RULES.filter((r) => r.kind === "entry").map((r) => {
    const l = sims.filter((s) => s.code === r.code);
    const m = l.filter(FILTERS[5][2]);
    return [r.code, { title: r.title, todos: stats(l, 21), modelo: stats(m, 21), oosTodos: stats(l.filter((s) => s.day >= cut), 21), oosModelo: stats(m.filter((s) => s.day >= cut), 21) }]; // prettier-ignore
  }),
);
const byRegime = Object.fromEntries(
  ["recup", "super", "estag", "desac"].map((g) => [
    g,
    stats(
      sims.filter((s) => s.reg === g),
      21,
    ),
  ]),
);
const out = {
  updated_at: new Date().toISOString(),
  sims: sims.length,
  assets: Object.keys(series).length,
  from: days[0], to: days.at(-1), cut,
  method: "Cada gatilho de entrada (regras de assets/signals.js) em cada ativo e pregão é uma simulação; retorno em log em excesso sobre o SPY em 5 e 21 pregões; t por dia sem sobreposição. Contexto só com o que se sabia no dia: FRED com 1 mês de atraso, inclinação do setor só com meses anteriores.",
  table, byRule, byRegime,
}; // prettier-ignore
await writeFile(new URL("data/model-backtest.json", root), JSON.stringify(out));
const p = (x) => (x == null ? "  –  " : `${(x * 100).toFixed(2)}%`);
console.log(
  `${sims.length} simulações · ${out.assets} ativos · ${out.from} a ${out.to} · corte ${cut}`,
);
for (const r of table)
  console.log(`${r.k.padEnd(8)} 21d: n=${r.all[21].n} média ${p(r.all[21].avg)} acerto ${p(r.all[21].hit)} t ${r.all[21].t?.toFixed(2)} | OOS n=${r.oos[21].n} ${p(r.oos[21].avg)} t ${r.oos[21].t?.toFixed(2)} | 5d média ${p(r.all[5].avg)} t ${r.all[5].t?.toFixed(2)}`); // prettier-ignore
console.log("regimes:", Object.entries(byRegime).map(([g, s]) => `${g} n=${s.n} ${p(s.avg)}`).join(" | ")); // prettier-ignore
