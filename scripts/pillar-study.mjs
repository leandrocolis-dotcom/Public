// Estudo de pesos dos pilares (o Simulador usa para distribuir o peso de cada análise pela assertividade medida).
// Base: data/hist/*.csv (~2 anos de pregões de ~925 ativos dos EUA) + data/fund-hist.json (LPA/receita por data).
// Método (Fama-MacBeth): em cada pregão, regressão cruzada do retorno futuro em excesso (vs. média do universo)
// nos z-scores dos pilares. Cada pregão × horizonte × universo é um teste. O coeficiente médio é o peso; o t mostra
// se ele é estável. Fora da amostra: estima nos primeiros 60% dos pregões e mede o acerto da nota nos 40% finais.
// Uso: node scripts/pillar-study.mjs  → data/pillar-weights.json. Material educacional.
import { readFile, readdir, writeFile } from "node:fs/promises";

const root = new URL("../", import.meta.url);
const HIST = new URL("data/hist/", root);
const fund = JSON.parse(await readFile(new URL("data/fund-hist.json", root), "utf8").catch(() => '{"syms":{}}')).syms; // prettier-ignore
const quant = JSON.parse(await readFile(new URL("data/quant.json", root), "utf8").catch(() => '{"rows":[]}')); // prettier-ignore
const STOCK = new Set(quant.rows.map((r) => r.sym));

// ── pilares (cada um vira z-score entre os ativos no dia) ──
export const PILLARS = [
  ["tec", "Técnica (tendência: preço vs. MM200)"],
  ["graf", "Gráfica (posição na faixa de 52 semanas)"],
  ["mom", "Momentum (6 meses menos o último mês)"],
  ["rev", "Reversão curta (queda dos últimos 5 dias)"],
  ["volu", "Volume (5 dias vs. 3 meses)"],
  ["lowvol", "Baixa volatilidade (63 dias)"],
  ["ep", "Fundamentalista: lucro/preço (LPA 12 m ÷ preço)"],
  ["growth", "Fundamentalista: crescimento do LPA (ano)"],
];
const TECH = ["tec", "graf", "mom", "rev", "volu", "lowvol"];
const FULL = [...TECH, "ep", "growth"];
const H = [5, 21];

const files = (await readdir(HIST)).filter((f) => f.endsWith(".csv"));
const series = {};
for (const f of files) {
  const sym = f.slice(0, -4);
  const lines = (await readFile(new URL(f, HIST), "utf8")).trim().split("\n").slice(1);
  const d = [], c = [], v = []; // prettier-ignore
  for (const l of lines) {
    const x = l.split(",");
    if (!(+x[4] > 0)) continue;
    d.push(x[0]);
    c.push(+x[4]);
    v.push(+x[5] || 0);
  }
  if (c.length >= 260) series[sym] = { d, c, v };
}
const syms = Object.keys(series);
// calendário: as datas do SPY
const cal = series.SPY.d;
const idxOf = Object.fromEntries(syms.map((s) => [s, new Map(series[s].d.map((x, i) => [x, i]))]));

const addDays = (iso, n) => new Date(Date.parse(iso) + n * 864e5).toISOString().slice(0, 10);
/** LPA de 12 meses disponível no dia (point-in-time): soma de 4 trimestres publicados (asOf + 45 d) ou o anual (+ 75 d). */
function epsAt(sym, day) {
  const f = fund[sym];
  if (!f) return null;
  const q = (f.eps ?? []).filter(([a, x]) => x !== null && addDays(a, 45) <= day);
  if (q.length >= 4) return q.slice(-4).reduce((s, [, x]) => s + x, 0);
  const a = (f.epsA ?? []).filter(([d, x]) => x !== null && addDays(d, 75) <= day);
  return a.length ? a.at(-1)[1] : null;
}
function growthAt(sym, day) {
  const a = (fund[sym]?.epsA ?? []).filter(([d, x]) => x !== null && addDays(d, 75) <= day);
  if (a.length < 2) return null;
  const [p, n] = [a.at(-2)[1], a.at(-1)[1]];
  return Math.abs(p) > 0.05 ? Math.max(-2, Math.min(2, (n - p) / Math.abs(p))) : null;
}

function raw(sym, i, day) {
  const { c, v } = series[sym];
  if (i < 200) return null;
  const mean = (a, b) => { let s = 0; for (let k = a; k < b; k++) s += c[k]; return s / (b - a); }; // prettier-ignore
  const ma200 = mean(i - 199, i + 1);
  let hi = -Infinity, lo = Infinity; // prettier-ignore
  for (let k = Math.max(0, i - 251); k <= i; k++) { if (c[k] > hi) hi = c[k]; if (c[k] < lo) lo = c[k]; } // prettier-ignore
  let s2 = 0;
  for (let k = i - 62; k <= i; k++) { const r = Math.log(c[k] / c[k - 1]); s2 += r * r; } // prettier-ignore
  const v5 = v.slice(i - 4, i + 1).reduce((a, b) => a + b, 0) / 5;
  const v63 = v.slice(i - 62, i + 1).reduce((a, b) => a + b, 0) / 63;
  const eps = STOCK.has(sym) ? epsAt(sym, day) : null;
  return {
    tec: Math.log(c[i] / ma200),
    graf: hi > lo ? (c[i] - lo) / (hi - lo) : null,
    mom: Math.log(c[i - 21] / c[i - 126]),
    rev: -Math.log(c[i] / c[i - 5]),
    volu: v63 > 0 && v5 > 0 ? Math.log(v5 / v63) : null,
    lowvol: -Math.sqrt(s2 / 63),
    ep: eps === null ? null : eps / c[i],
    growth: STOCK.has(sym) ? growthAt(sym, day) : null,
  };
}

/** z-score com corte em ±3 (um ativo extremo não domina o dia). */
function zs(rows, k) {
  const xs = rows.map((r) => r.x[k]).filter(Number.isFinite);
  const m = xs.reduce((a, b) => a + b, 0) / xs.length;
  const sd = Math.sqrt(xs.reduce((a, b) => a + (b - m) ** 2, 0) / xs.length) || 1;
  for (const r of rows) r.z[k] = Number.isFinite(r.x[k]) ? Math.max(-3, Math.min(3, (r.x[k] - m) / sd)) : 0; // prettier-ignore
}

/** OLS com intercepto (equações normais + Gauss). */
function ols(X, y) {
  const k = X[0].length + 1;
  const A = Array.from({ length: k }, () => Array(k + 1).fill(0));
  for (let n = 0; n < X.length; n++) {
    const row = [1, ...X[n]];
    for (let a = 0; a < k; a++) {
      for (let b = 0; b < k; b++) A[a][b] += row[a] * row[b];
      A[a][k] += row[a] * y[n];
    }
  }
  for (let a = 0; a < k; a++) A[a][a] += 1e-9;
  for (let p = 0; p < k; p++) {
    let m = p;
    for (let r = p + 1; r < k; r++) if (Math.abs(A[r][p]) > Math.abs(A[m][p])) m = r;
    [A[p], A[m]] = [A[m], A[p]];
    for (let r = 0; r < k; r++) {
      if (r === p) continue;
      const f = A[r][p] / A[p][p];
      for (let col = p; col <= k; col++) A[r][col] -= f * A[p][col];
    }
  }
  return A.map((r, i) => r[k] / r[i]);
}

const UNIV = {
  todos: { pick: () => true, keys: TECH },
  acoes: { pick: (s) => STOCK.has(s), keys: FULL },
  etfs: { pick: (s) => !STOCK.has(s), keys: TECH },
};

const tests = [];
const daily = {}; // `${u}|${h}` -> [{ day, b:{}, rows }]
const t0 = Date.now();
for (let di = 200; di < cal.length - 5; di++) {
  const day = cal[di];
  const base = [];
  for (const s of syms) {
    const i = idxOf[s].get(day);
    if (i === undefined) continue;
    const x = raw(s, i, day);
    if (!x) continue;
    base.push({ s, i, x });
  }
  for (const h of H) {
    if (di + h >= cal.length) continue;
    const withY = base
      .map((r) => {
        const { c, d } = series[r.s];
        return d[r.i + h] === cal[di + h]
          ? { ...r, y: Math.log(c[r.i + h] / c[r.i]), z: {} }
          : null;
      })
      .filter(Boolean);
    for (const [u, U] of Object.entries(UNIV)) {
      let rows = withY.filter((r) => U.pick(r.s));
      if (U.keys.includes("ep")) rows = rows.filter((r) => Number.isFinite(r.x.ep));
      if (rows.length < 40) continue;
      const my = rows.reduce((a, r) => a + r.y, 0) / rows.length;
      for (const r of rows) r.ex = r.y - my;
      for (const k of U.keys) zs(rows, k);
      const b = ols(
        rows.map((r) => U.keys.map((k) => r.z[k])),
        rows.map((r) => r.ex),
      );
      const coef = Object.fromEntries(U.keys.map((k, j) => [k, b[j + 1]]));
      tests.push({ day, h, u, n: rows.length, coef });
      (daily[`${u}|${h}`] ??= []).push({
        day,
        coef,
        rows: rows.map((r) => ({ z: { ...r.z }, ex: r.ex })),
      });
    }
  }
}

// ── síntese por universo × horizonte ──
const mean = (a) => a.reduce((x, y) => x + y, 0) / a.length;
const sd = (a) => { const m = mean(a); return Math.sqrt(a.reduce((x, y) => x + (y - m) ** 2, 0) / (a.length - 1)); }; // prettier-ignore
const corr = (a, b) => {
  const ma = mean(a), mb = mean(b); // prettier-ignore
  let s = 0, sa = 0, sb = 0; // prettier-ignore
  for (let i = 0; i < a.length; i++) { s += (a[i] - ma) * (b[i] - mb); sa += (a[i] - ma) ** 2; sb += (b[i] - mb) ** 2; } // prettier-ignore
  return s / Math.sqrt(sa * sb || 1);
};
const models = {};
for (const [key, list] of Object.entries(daily)) {
  const [u, hs] = key.split("|");
  const h = +hs;
  const keys = UNIV[u].keys;
  // t sem sobreposição: um pregão a cada h (os retornos de h dias se sobrepõem)
  const step = list.filter((_, i) => i % h === 0);
  const coef = {};
  for (const k of keys) {
    const all = list.map((x) => x.coef[k]);
    const nov = step.map((x) => x.coef[k]);
    const t = (mean(nov) / sd(nov)) * Math.sqrt(nov.length);
    coef[k] = { b: mean(all), t, pos: all.filter((x) => x > 0).length / all.length };
  }
  // pesos: só pilares com sinal estável (|t| ≥ 1,5) entram, proporcionais ao coeficiente; o resto vale 0
  const kept = keys.filter((k) => Math.abs(coef[k].t) >= 1.5);
  const tot = kept.reduce((a, k) => a + Math.abs(coef[k].b), 0) || 1;
  const weight = Object.fromEntries(keys.map((k) => [k, kept.includes(k) ? coef[k].b / tot : 0]));
  // fora da amostra: estima nos primeiros 60%, aplica nos 40% finais
  const cut = Math.floor(list.length * 0.6);
  const est = Object.fromEntries(
    keys.map((k) => [k, mean(list.slice(0, cut).map((x) => x.coef[k]))]),
  );
  const ics = [], spreads = []; // prettier-ignore
  for (const x of list.slice(cut)) {
    const sc = x.rows.map((r) => keys.reduce((a, k) => a + est[k] * r.z[k], 0));
    ics.push(
      corr(
        sc,
        x.rows.map((r) => r.ex),
      ),
    );
    const ord = sc.map((v, i) => [v, x.rows[i].ex]).sort((a, b) => a[0] - b[0]);
    const q = Math.max(1, Math.floor(ord.length / 5));
    spreads.push(mean(ord.slice(-q).map((o) => o[1])) - mean(ord.slice(0, q).map((o) => o[1])));
  }
  const icStep = ics.filter((_, i) => i % h === 0);
  models[key] = {
    u, h, days: list.length, from: list[0].day, to: list.at(-1).day, avgN: Math.round(mean(list.map((x) => x.rows.length))),
    coef, weight,
    oos: { days: ics.length, ic: mean(ics), icT: (mean(icStep) / sd(icStep)) * Math.sqrt(icStep.length), hitDays: ics.filter((v) => v > 0).length / ics.length, spreadTopBottom: mean(spreads) },
  }; // prettier-ignore
}

const fmt = (x) => (x >= 0 ? "+" : "−") + Math.abs(x * 1e4).toFixed(1);
function equation(m) {
  const keys = Object.keys(m.coef);
  return `Y(${m.h}d, bps) = ${keys.map((k) => `${fmt(m.coef[k].b)}·z_${k}`).join(" ")}`;
}
const result = {
  updated_at: new Date().toISOString(),
  method:
    "Fama-MacBeth: regressão cruzada diária do retorno futuro em excesso (log) nos z-scores dos pilares; peso = coeficiente médio dos pilares com |t| ≥ 1,5 (t sem sobreposição), normalizado pela soma dos módulos.",
  tests: tests.length,
  assets: syms.length,
  pillars: Object.fromEntries(PILLARS),
  missing: {
    news: "sem histórico de manchetes por data: começa a acumular no diário (data/news.json) e entra quando houver 6 meses",
    analistas: "sem histórico de recomendações por data na fonte gratuita",
  },
  models: Object.fromEntries(
    Object.entries(models).map(([k, m]) => [k, { ...m, equation: equation(m) }]),
  ),
};
await writeFile(new URL("data/pillar-weights.json", root), JSON.stringify(result, null, 1));
console.log(
  `${tests.length} testes (regressões diárias) · ${syms.length} ativos · ${((Date.now() - t0) / 1000).toFixed(0)} s`,
);
for (const m of Object.values(result.models)) {
  console.log(
    `\n[${m.u} · ${m.h} pregões · ${m.days} dias · ~${m.avgN} ativos/dia]\n${m.equation}`,
  );
  console.log(Object.entries(m.coef).map(([k, c]) => `${k}: t=${c.t.toFixed(2)} pos=${(c.pos * 100).toFixed(0)}% peso=${(m.weight[k] * 100).toFixed(0)}%`).join(" | ")); // prettier-ignore
  console.log(`fora da amostra (${m.oos.days} dias): IC ${m.oos.ic.toFixed(3)} (t ${m.oos.icT.toFixed(2)}), dias com IC>0 ${(m.oos.hitDays * 100).toFixed(0)}%, topo−fundo ${(m.oos.spreadTopBottom * 100).toFixed(2)}%`); // prettier-ignore
}
