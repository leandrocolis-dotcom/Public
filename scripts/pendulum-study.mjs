// P1 do Pêndulo 2.0 (docs/ROADMAP-PENDULO.md): o pêndulo de 6 forças prevê queda e volatilidade melhor que o pêndulo
// atual e que a MM200 simples, FORA DA AMOSTRA? Pergunta do docs/OBJETIVO.md: "deixar de perder quando já alocado".
//
// REGRAS REGISTRADAS EM 20/11/2026, ANTES DE RODAR (não alterar depois de ver o resultado):
//  Dados: Yahoo ajustado, histórico inteiro; eixo = pregões do SPY desde 2006; demais séries repetem o último valor
//  por até 5 pregões (feriados de fora). Avaliação de 2008 em diante (forças ausentes no começo ficam de fora da média).
//  Pêndulo atual: o próprio regime() de assets/dash.js (nota −100 a +100) com h = 1, 5 e 21, só com fechamentos.
//  Pêndulo 2.0: 6 forças; cada indicador (sinal: maior = apetite a risco) vira estado = percentil do valor de hoje
//   nos últimos 5 anos (mín. 1 ano, só dados até t) e impulso = percentil da variação de 20 pregões; nota do indicador
//   = média de estado e impulso (−100 a +100); força = média dos indicadores; pêndulo = média das 5 forças de risco
//   (Inflação fica só no quadrante). Histerese: defesa entra < −30 e sai > −10; risco entra > +30 e sai < +10.
//   Tendência: SPY/MM200, SPY/MM50, ACWI/MM200, EEM/MM200, retorno 12-1 do SPY, % de 9 setores acima da MM200.
//   Vol/estresse: −vol 20d do SPY, −VIX, −VIX/VIX3M, prêmio de variância (VIX² − vol²), −turbulência (5 dias).
//   Crédito: HYG/IEF e JNK/IEF contra a MM200.
//   Crescimento: XLY/XLP, XLI/XLU, IWM/SPY, cobre/ouro contra a MM200; curva 10a − 3m.
//   Inflação: TIP/IEF, DBC e USO contra a MM200 (quadrante).  Global: −UUP, EEM/SPY, EFA/SPY, −FXY contra a MM200.
//  Alvos (em t, fechamento): queda > 10% em 63 pregões (mínimo futuro ÷ preço de hoje − 1 ≤ −10%); vol realizada dos
//  21 pregões seguintes; retorno de 21 pregões.
//  Fora da amostra: ano a ano a partir de 2011, logística treinada só com linhas cujo alvo terminou antes do ano
//  (expansiva, com expurgo de 63 pregões). Brier skill = 1 − Brier ÷ Brier da taxa base do treino.
//  Quintis: percentil de cada sinal no próprio passado (≥ 1 ano); por quintil, taxa de queda, vol futura e Sharpe/queda
//  máx. de ficar no SPY só nos dias do quintil. Monotonia = Spearman(quintil, taxa de queda).
//  APROVAÇÃO DA P1 (seguir para a P2, ainda em modo sombra):
//   (a) Brier skill do 2.0 > o do atual (h=1) E > o da MM200;
//   (b) Spearman do 2.0 ≤ −0,9 E razão (taxa de queda no quintil de baixo ÷ taxa base) do 2.0 > a do atual e a da MM200.
//   Significância: bootstrap em blocos de 63 pregões (2.000 sorteios, semente fixa) da diferença de Brier do 2.0
//   contra o melhor dos dois; p ≤ 0,10 → "aprovada"; senão "aprovada com ressalva (não significativa)".
//  HIPÓTESES: HP1 a HP5 como em docs/ROADMAP-PENDULO.md §4. HP5: peso no SPY = mín(1; 16% ÷ σ̂), σ̂ = média da vol
//   20d e do VIX/100; ×0,5 com SPY abaixo da MM200; troca só se |Δpeso| > 0,15; custo 0,05% sobre o giro; caixa a
//   T-bill; sinal no fechamento vale do pregão seguinte. Variante registrada: o mesmo com ×0,5 na faixa de defesa do 2.0.
// Uso: node scripts/pendulum-study.mjs [--local] [--out=caminho-base]
//  --local lê data/hist + data/ohlc.json (~2 anos): só testa o código, NÃO é resultado do estudo.
// Material educacional; não é recomendação de investimento.
import { readFile, writeFile } from "node:fs/promises";
import { regime } from "../assets/dash.js";
import { metrics } from "./lib/study-data.mjs";

const args = process.argv.slice(2);
const SYNTH = args.includes("--synth"); // séries sintéticas de 20 anos: só testa o código
const LOCAL = args.includes("--local") || SYNTH;
const OUT = args.find((a) => a.startsWith("--out="))?.slice(6) ?? "";
const MINW = LOCAL && !SYNTH ? 60 : 252; // histórico mínimo do percentil
const MAXW = 1260; // 5 anos
const FWD = 63;
const COST = 0.0005;
const SECT = ["XLK", "XLF", "XLV", "XLE", "XLB", "XLI", "XLU", "XLY", "XLP"];
const TURB = ["SPY", "TLT", "EFA", "EEM", "HYG", "DBC"];
const SYMS = [...new Set(["SPY", "TLT", "HYG", "IEF", "JNK", "XLY", "XLP", "XLI", "XLU", "IWM", "RSP", "EEM", "EFA", "EMB", "ACWI", "TIP", "DBC", "USO", "UUP", "FXY", "GLD", ...SECT, "^STOXX50E", "^N225", "^HSI", "^KS11", "HG=F", "GC=F", "AUDJPY=X", "DX-Y.NYB", "^VIX", "^VIX3M", "^IRX", "^TNX"])]; // prettier-ignore
const fin = Number.isFinite;

// ---------- dados ----------
async function yahoo(sym) {
  const p2 = Math.floor(Date.now() / 1000);
  const u = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(sym)}?period1=0&period2=${p2}&interval=1d`;
  for (let k = 0; k < 3; k++) {
    try {
      const r = await fetch(u, { headers: { "User-Agent": "Mozilla/5.0" }, signal: AbortSignal.timeout(30000) }); // prettier-ignore
      const j = (await r.json()).chart?.result?.[0];
      const q = j?.indicators?.quote?.[0];
      const adj = j?.indicators?.adjclose?.[0]?.adjclose;
      if (!j?.timestamp || !q) throw new Error("sem dados");
      const m = new Map();
      j.timestamp.forEach((t, i) => {
        const c = adj?.[i] > 0 ? adj[i] : q.close[i];
        if (c > 0) m.set(new Date(t * 1000).toISOString().slice(0, 10), c);
      });
      return m;
    } catch (e) {
      if (k === 2) console.warn(`${sym}: ${e.message}`);
      await new Promise((r) => setTimeout(r, 1500 * (k + 1)));
    }
  }
  return null;
}

async function localData() {
  const raw = {};
  const LOC = { "^VIX": "VIX", "^TNX": "US10Y", "^IRX": "US3M", "DX-Y.NYB": "DXY" };
  const f = JSON.parse(await readFile(new URL("../data/ohlc.json", import.meta.url), "utf8"));
  for (const s of SYMS) {
    try {
      const txt = await readFile(new URL(`../data/hist/${s}.csv`, import.meta.url), "utf8");
      const m = new Map();
      for (const line of txt.trim().split("\n").slice(1)) {
        const [d, , , , c] = line.split(",");
        if (+c > 0) m.set(d, +c);
      }
      raw[s] = m;
    } catch {
      const b = f.bars[LOC[s]];
      if (b?.c) {
        const ds = f.dates.slice(-b.c.length);
        raw[s] = new Map(ds.map((d, i) => [d, b.c[i]]).filter(([, c]) => c > 0));
      }
    }
  }
  return raw;
}

function synthData() {
  let z = 7;
  const r = () => (z = (z * 1103515245 + 12345) % 2147483648) / 2147483648;
  const gauss = () => Math.sqrt(-2 * Math.log(r() + 1e-12)) * Math.cos(2 * Math.PI * r());
  const ds = [];
  for (
    let d = new Date("2005-01-03");
    d < new Date("2026-11-20");
    d = new Date(d.getTime() + 86400000)
  )
    if (d.getUTCDay() % 6) ds.push(d.toISOString().slice(0, 10));
  let vol = 0.01;
  const mkt = ds.map(() => {
    vol = Math.min(0.05, Math.max(0.005, vol * Math.exp(0.1 * gauss()) * (r() < 0.002 ? 3 : 1) * 0.999 + 0.00001)); // prettier-ignore
    return { e: 0.0003 + vol * gauss(), vol };
  });
  const out = {};
  SYMS.forEach((s, k) => {
    const beta = s === "TLT" || s === "IEF" ? -0.3 : 0.5 + (k % 5) * 0.2;
    let p = 100;
    const m = new Map();
    ds.forEach((d, i) => {
      if (s === "^VIX" || s === "^VIX3M") m.set(d, mkt[i].vol * 1600 * (s === "^VIX3M" ? 1.05 : 1));
      else if (s === "^IRX" || s === "^TNX")
        m.set(d, s === "^TNX" ? 3 + Math.sin(i / 900) : 2 + Math.sin(i / 700)); // prettier-ignore
      else m.set(d, (p *= 1 + beta * mkt[i].e + 0.006 * gauss()));
    });
    out[s] = m;
  });
  return out;
}

const raw = SYNTH
  ? synthData()
  : LOCAL
    ? await localData()
    : Object.fromEntries(await Promise.all(SYMS.map(async (s) => [s, await yahoo(s)])));
if (!raw.SPY) throw new Error("sem SPY");
const dates = [...raw.SPY.keys()].filter((d) => d >= "2006-01-01").sort();
const N = dates.length;
const C = {};
for (const s of SYMS) {
  const m = raw[s];
  if (!m) continue;
  const keys = [...m.keys()].sort();
  const out = new Array(N).fill(null);
  let j = 0;
  let last = null;
  let age = 99;
  for (let i = 0; i < N; i++) {
    while (j < keys.length && keys[j] <= dates[i]) {
      last = m.get(keys[j]);
      age = keys[j] === dates[i] ? 0 : 1;
      j++;
    }
    if (keys[j - 1] !== dates[i]) age++;
    out[i] = age <= 5 ? last : null;
  }
  C[s] = out;
}
const missing = SYMS.filter((s) => !C[s]);

// ---------- utilitários ----------
const smaArr = (s, n) => {
  const o = new Array(s.length).fill(null);
  let sum = 0;
  let cnt = 0;
  for (let i = 0; i < s.length; i++) {
    if (fin(s[i])) ((sum += s[i]), cnt++);
    if (i >= n && fin(s[i - n])) ((sum -= s[i - n]), cnt--);
    if (i >= n - 1 && cnt === n) o[i] = sum / n;
  }
  return o;
};
const ratio = (a, b) => (C[a] && C[b] ? C[a].map((v, i) => (fin(v) && C[b][i] > 0 ? v / C[b][i] : null)) : null); // prettier-ignore
const dev = (s, n = 200) => {
  if (!s) return null;
  const m = smaArr(s, n);
  return s.map((v, i) => (fin(v) && m[i] > 0 ? v / m[i] - 1 : null));
};
const neg = (s) => s && s.map((v) => (fin(v) ? -v : null));
const rets = (s) => s.map((v, i) => (i && fin(v) && s[i - 1] > 0 ? v / s[i - 1] - 1 : null));
const rvol = (s, n) => {
  const r = rets(s);
  return r.map((_, i) => {
    if (i < n) return null;
    const w = r.slice(i - n + 1, i + 1);
    if (!w.every(fin)) return null;
    const m = w.reduce((a, b) => a + b, 0) / n;
    return Math.sqrt((w.reduce((a, b) => a + (b - m) ** 2, 0) / (n - 1)) * 252);
  });
};
/** Percentil (−100 a +100) do valor de t na janela passada [t−MAXW, t], mínimo MINW pontos. */
function pctl(x) {
  const o = new Array(N).fill(null);
  if (!x) return o;
  for (let t = 0; t < N; t++) {
    if (!fin(x[t])) continue;
    let lo = 0;
    let n = 0;
    for (let k = Math.max(0, t - MAXW); k <= t; k++) {
      if (!fin(x[k])) continue;
      n++;
      if (x[k] < x[t]) lo++;
      else if (x[k] === x[t] && k < t) lo += 0.5;
    }
    if (n >= MINW) o[t] = (2 * (lo / (n - 1 || 1)) - 1) * 100;
  }
  return o;
}
const diff = (x, n) => x && x.map((v, i) => (i >= n && fin(v) && fin(x[i - n]) ? v - x[i - n] : null)); // prettier-ignore
const avg = (xs) => {
  const f = xs.filter(fin);
  return f.length ? f.reduce((a, b) => a + b, 0) / f.length : null;
};

/** Turbulência (Kritzman): distância de Mahalanobis dos retornos do dia contra a covariância de 252 pregões. */
function turbulence() {
  const R = TURB.filter((s) => C[s]).map((s) => rets(C[s]));
  const k = R.length;
  const o = new Array(N).fill(null);
  if (k < 3) return o;
  for (let t = 253; t < N; t++) {
    const rows = [];
    for (let i = t - 252; i < t; i++) {
      const r = R.map((x) => x[i]);
      if (r.every(fin)) rows.push(r);
    }
    const today = R.map((x) => x[t]);
    if (rows.length < 200 || !today.every(fin)) continue;
    const mu = Array.from({ length: k }, (_, j) => rows.reduce((a, r) => a + r[j], 0) / rows.length); // prettier-ignore
    const S = Array.from(
      { length: k },
      (_, a) =>
      Array.from({ length: k }, (_, b) => rows.reduce((s, r) => s + (r[a] - mu[a]) * (r[b] - mu[b]), 0) / (rows.length - 1)), // prettier-ignore
    );
    const d = today.map((v, j) => v - mu[j]);
    const y = solve(S, d);
    if (y) o[t] = d.reduce((s, v, j) => s + v * y[j], 0) / k;
  }
  return o.map((_, t) => avg(o.slice(Math.max(0, t - 4), t + 1)));
}

/** Resolve A x = b (eliminação de Gauss com pivô); null se singular. */
function solve(A0, b0) {
  const n = b0.length;
  const A = A0.map((r, i) => [...r, b0[i]]);
  for (let c = 0; c < n; c++) {
    let p = c;
    for (let r = c + 1; r < n; r++) if (Math.abs(A[r][c]) > Math.abs(A[p][c])) p = r;
    if (Math.abs(A[p][c]) < 1e-14) return null;
    [A[c], A[p]] = [A[p], A[c]];
    for (let r = 0; r < n; r++) {
      if (r === c) continue;
      const f = A[r][c] / A[c][c];
      for (let k = c; k <= n; k++) A[r][k] -= f * A[c][k];
    }
  }
  return A.map((r, i) => r[n] / r[i]);
}

// ---------- indicadores e forças do 2.0 ----------
const spy = C.SPY;
const rv20 = rvol(spy, 20);
const vix = C["^VIX"];
const sectAbove = (() => {
  const ds = SECT.filter((s) => C[s]).map((s) => dev(C[s]));
  return spy.map((_, i) => {
    const v = ds.map((d) => d[i]).filter(fin);
    return v.length >= 5 ? v.filter((x) => x > 0).length / v.length : null;
  });
})();
const mom121 = spy.map((v, i) => (i >= 252 && spy[i - 21] > 0 && spy[i - 252] > 0 ? spy[i - 21] / spy[i - 252] - 1 : null)); // prettier-ignore
const vixTerm = vix && C["^VIX3M"] ? vix.map((v, i) => (v > 0 && C["^VIX3M"][i] > 0 ? -(v / C["^VIX3M"][i]) : null)) : null; // prettier-ignore
const vrp = vix ? vix.map((v, i) => (v > 0 && fin(rv20[i]) ? (v / 100) ** 2 - rv20[i] ** 2 : null)) : null; // prettier-ignore
const curve = C["^TNX"] && C["^IRX"] ? C["^TNX"].map((v, i) => (fin(v) && fin(C["^IRX"][i]) ? v - C["^IRX"][i] : null)) : null; // prettier-ignore

const FORCES = {
  trend: { label: "Tendência", risk: true, ind: { spy200: dev(spy), spy50: dev(spy, 50), acwi200: dev(C.ACWI), eem200: dev(C.EEM), mom121, setores: sectAbove } }, // prettier-ignore
  vol: { label: "Volatilidade/estresse", risk: true, ind: { rv20: neg(rv20), vix: neg(vix), vixTerm, vrp, turb: neg(turbulence()) } }, // prettier-ignore
  credit: { label: "Crédito", risk: true, ind: { hygIef: dev(ratio("HYG", "IEF")), jnkIef: dev(ratio("JNK", "IEF")) } }, // prettier-ignore
  growth: { label: "Crescimento", risk: true, ind: { xlyXlp: dev(ratio("XLY", "XLP")), xliXlu: dev(ratio("XLI", "XLU")), iwmSpy: dev(ratio("IWM", "SPY")), cobreOuro: dev(ratio("HG=F", "GC=F")), curva: curve } }, // prettier-ignore
  inflation: { label: "Inflação", risk: false, ind: { tipIef: dev(ratio("TIP", "IEF")), dbc: dev(C.DBC), uso: dev(C.USO) } }, // prettier-ignore
  global: { label: "Global/dólar", risk: true, ind: { uup: neg(dev(C.UUP)), eemSpy: dev(ratio("EEM", "SPY")), efaSpy: dev(ratio("EFA", "SPY")), fxy: neg(dev(C.FXY)) } }, // prettier-ignore
};
const F = {};
for (const [id, f] of Object.entries(FORCES)) {
  const parts = Object.entries(f.ind)
    .filter(([, x]) => x)
    .map(([k, x]) => ({ k, st: pctl(x), im: pctl(diff(x, 20)) }));
  const score = (t) => avg(parts.map((p) => avg([p.st[t], p.im[t]])));
  F[id] = {
    parts,
    st: Array.from({ length: N }, (_, t) => avg(parts.map((p) => p.st[t]))),
    im: Array.from({ length: N }, (_, t) => avg(parts.map((p) => p.im[t]))),
    s: Array.from({ length: N }, (_, t) => score(t)),
  };
}
const RISK = Object.keys(FORCES).filter((k) => FORCES[k].risk);
const p2 = Array.from({ length: N }, (_, t) => {
  const v = RISK.map((k) => F[k].s[t]).filter(fin);
  return v.length >= 3 ? avg(v) : null;
});
// histerese: −1 defesa, 0 neutro, +1 risco
const band = new Array(N).fill(null);
for (let t = 0, b = 0; t < N; t++) {
  const x = p2[t];
  if (!fin(x)) continue;
  if (b === -1 && x > -10) b = 0;
  if (b === 1 && x < 10) b = 0;
  if (b === 0 && x < -30) b = -1;
  if (b === 0 && x > 30) b = 1;
  band[t] = b;
}

// ---------- pêndulo atual (regime() de assets/dash.js) ----------
const START = Math.max(
  260,
  dates.findIndex((d) => d >= (LOCAL && !SYNTH ? "2000" : "2008-01-01")),
);
const cur = {
  h1: new Array(N).fill(null),
  h5: new Array(N).fill(null),
  h21: new Array(N).fill(null),
};
for (let t = START; t < N; t++) {
  const close = {};
  for (const s of SYMS) if (C[s]) close[s] = C[s].slice(Math.max(0, t - 299), t + 1);
  for (const h of [1, 5, 21]) {
    try {
      const sc = regime(close, h)?.strength?.raw;
      if (fin(sc)) cur[`h${h}`][t] = sc;
    } catch {
      /* dia sem dados suficientes */
    }
  }
}

// ---------- alvos ----------
const dd63 = spy.map((v, t) => {
  if (t + FWD >= N) return null;
  let mn = Infinity;
  for (let k = t + 1; k <= t + FWD; k++) mn = Math.min(mn, spy[k]);
  return mn / v - 1 <= -0.1 ? 1 : 0;
});
const rv21 = rvol(spy, 21);
const rvF21 = spy.map((_, t) => (t + 21 < N ? rv21[t + 21] : null)); // vol dos 21 pregões seguintes
const fwd21 = spy.map((v, t) => (t + 21 < N ? spy[t + 21] / v - 1 : null));

// ---------- logística e validação fora da amostra ----------
function logit(X, y, lam = 1e-3) {
  const k = X[0].length + 1;
  let w = new Array(k).fill(0);
  for (let it = 0; it < 30; it++) {
    const g = new Array(k).fill(0);
    const H = Array.from({ length: k }, () => new Array(k).fill(0));
    X.forEach((x, i) => {
      const z = [1, ...x];
      const p = 1 / (1 + Math.exp(-z.reduce((s, v, j) => s + v * w[j], 0)));
      const q = p * (1 - p);
      z.forEach((a, r) => {
        g[r] += (p - y[i]) * a;
        z.forEach((b, c) => (H[r][c] += q * a * b));
      });
    });
    for (let j = 1; j < k; j++) ((g[j] += lam * w[j]), (H[j][j] += lam));
    const step = solve(H, g);
    if (!step) break;
    w = w.map((v, j) => v - step[j]);
    if (Math.max(...step.map(Math.abs)) < 1e-8) break;
  }
  return (x) => 1 / (1 + Math.exp(-[1, ...x].reduce((s, v, j) => s + v * w[j], 0)));
}
function ols(X, y) {
  const k = X[0].length + 1;
  const A = Array.from({ length: k }, () => new Array(k).fill(0));
  const b = new Array(k).fill(0);
  X.forEach((x, i) => {
    const z = [1, ...x];
    z.forEach((a, r) => {
      b[r] += a * y[i];
      z.forEach((c, s) => (A[r][s] += a * c));
    });
  });
  for (let j = 1; j < k; j++) A[j][j] += 1e-9;
  const w = solve(A, b) ?? new Array(k).fill(0);
  return (x) => [1, ...x].reduce((s, v, j) => s + v * w[j], 0);
}

const EVAL = [];
for (let t = START; t < N; t++) if (fin(p2[t]) && fin(cur.h1[t]) && dd63[t] != null) EVAL.push(t);
const periodOf = (t) => (LOCAL && !SYNTH ? `${dates[t].slice(0, 4)}-${dates[t].slice(5, 7) <= "06" ? 1 : 2}` : dates[t].slice(0, 4)); // prettier-ignore
const PERIODS = [...new Set(EVAL.map(periodOf))].filter((p) => (LOCAL && !SYNTH) || p >= "2011");

const sc = (x) => (fin(x) ? x / 100 : null);
const FEATS = {
  base: () => [],
  atual_h1: (t) => [sc(cur.h1[t])],
  atual_h5: (t) => [sc(cur.h5[t])],
  atual_h21: (t) => [sc(cur.h21[t])],
  mm200: (t) => [FORCES.trend.ind.spy200[t] * 10],
  vol_simples: (t) => [rv20[t] * 5],
  p2: (t) => [sc(p2[t])],
  p2_forcas: (t) => RISK.map((k) => sc(F[k].s[t])),
  tend_vol: (t) => [sc(F.trend.s[t]), sc(F.vol.s[t])],
  tend_vol_cresc: (t) => [sc(F.trend.s[t]), sc(F.vol.s[t]), sc(F.growth.s[t])],
  credito_nivel: (t) => [sc(F.credit.parts[0]?.st[t])],
  credito_var60: (t) => [sc(cred60[t])],
};
const cred60 = pctl(diff(FORCES.credit.ind.hygIef, 60));

/** Previsão fora da amostra de um modelo: { t → p } nos períodos de teste. */
function oos(name) {
  const fx = FEATS[name];
  const pred = new Map();
  for (const per of PERIODS) {
    const first = EVAL.find((t) => periodOf(t) === per);
    const train = EVAL.filter((t) => t + FWD < first && fx(t).every(fin));
    const test = EVAL.filter((t) => periodOf(t) === per && fx(t).every(fin));
    if (train.length < (LOCAL ? 40 : 500) || !test.length) continue;
    const y = train.map((t) => dd63[t]);
    const base = y.reduce((a, b) => a + b, 0) / y.length;
    if (name === "base" || base === 0 || base === 1) {
      test.forEach((t) => pred.set(t, Math.min(Math.max(base, 1e-4), 1 - 1e-4)));
      continue;
    }
    const m = logit(train.map(fx), y);
    test.forEach((t) => pred.set(t, m(fx(t))));
  }
  return pred;
}
const PRED = Object.fromEntries(Object.keys(FEATS).map((k) => [k, oos(k)]));
// avalia todos no MESMO conjunto de dias (onde todos têm previsão)
const COMMON = EVAL.filter((t) => Object.values(PRED).every((m) => m.has(t)));
const brier = (m) => COMMON.reduce((s, t) => s + (m.get(t) - dd63[t]) ** 2, 0) / COMMON.length;
const B0 = brier(PRED.base);
const BRIER = Object.fromEntries(
  Object.keys(FEATS).map((k) => {
    const b = brier(PRED[k]);
    return [k, { brier: b, skill: 1 - b / B0 }];
  }),
);

// bootstrap em blocos: 2.0 contra o melhor de (atual h1, mm200)
let seed = 20261120;
const rnd = () => (seed = (seed * 1664525 + 1013904223) % 4294967296) / 4294967296;
const rival = BRIER.atual_h1.brier <= BRIER.mm200.brier ? "atual_h1" : "mm200";
const dl = COMMON.map((t) => (PRED.p2.get(t) - dd63[t]) ** 2 - (PRED[rival].get(t) - dd63[t]) ** 2);
let worse = 0;
const DRAWS = 2000;
for (let b = 0; b < DRAWS; b++) {
  let s = 0;
  let n = 0;
  while (n < dl.length) {
    const st = Math.floor(rnd() * dl.length);
    for (let k = 0; k < 63 && n < dl.length; k++, n++) s += dl[(st + k) % dl.length];
  }
  if (s / dl.length >= 0) worse++;
}
const pBoot = dl.length ? worse / DRAWS : null;

// ---------- quintis fora da amostra ----------
const SIGNALS = { atual_h1: cur.h1, atual_h5: cur.h5, atual_h21: cur.h21, mm200: FORCES.trend.ind.spy200, p2 }; // prettier-ignore
const spyR = rets(spy);
const baseRate = COMMON.reduce((s, t) => s + dd63[t], 0) / (COMMON.length || 1);
function spearman(a, b) {
  const rk = (v) => v.map((x) => v.filter((y) => y < x).length + (v.filter((y) => y === x).length - 1) / 2); // prettier-ignore
  const ra = rk(a);
  const rb = rk(b);
  const m = (ra.length - 1) / 2;
  const num = ra.reduce((s, x, i) => s + (x - m) * (rb[i] - m), 0);
  const den = Math.sqrt(ra.reduce((s, x) => s + (x - m) ** 2, 0) * rb.reduce((s, x) => s + (x - m) ** 2, 0)); // prettier-ignore
  return den ? num / den : null;
}
function quintiles(sig) {
  const pq = pctl(sig);
  const rows = [1, 2, 3, 4, 5].map((q) => {
    const ts = COMMON.filter(
      (t) => fin(pq[t]) && Math.min(5, Math.floor((pq[t] + 100) / 40) + 1) === q,
    );
    const days = ts.filter((t) => t + 1 < N && fin(spyR[t + 1])).map((t) => ({ d: dates[t + 1], r: spyR[t + 1] })); // prettier-ignore
    const m = days.length > 20 ? metrics(days) : null;
    const rate = ts.length ? ts.reduce((s, t) => s + dd63[t], 0) / ts.length : null;
    return {
      q,
      n: ts.length,
      quedaTaxa: rate,
      razaoBase: baseRate ? rate / baseRate : null,
      volFutura: avg(ts.map((t) => rvF21[t])),
      ret21: avg(ts.map((t) => fwd21[t])),
      sharpe: m?.sharpe ?? null,
      quedaMax: m?.dd ?? null,
    };
  });
  const ok = rows.filter((r) => fin(r.quedaTaxa));
  return { rows, spearman: ok.length >= 3 ? spearman(ok.map((r) => r.q), ok.map((r) => r.quedaTaxa)) : null }; // prettier-ignore
}
const QUINT = Object.fromEntries(Object.entries(SIGNALS).map(([k, s]) => [k, quintiles(s)]));

// ---------- HP2: força Vol prevê a vol de 21 pregões além da vol de hoje ----------
function r2oos(fx) {
  let sse = 0;
  let sst = 0;
  for (const per of PERIODS) {
    const first = EVAL.find((t) => periodOf(t) === per);
    const ok = (t) => fx(t).every(fin) && rvF21[t] > 0;
    const train = EVAL.filter((t) => t + 22 < first && ok(t));
    const test = EVAL.filter((t) => periodOf(t) === per && ok(t));
    if (train.length < (LOCAL ? 40 : 500) || !test.length) continue;
    const y = train.map((t) => Math.log(rvF21[t]));
    const mu = y.reduce((a, b) => a + b, 0) / y.length;
    const m = ols(train.map(fx), y);
    for (const t of test) {
      const yt = Math.log(rvF21[t]);
      sse += (yt - m(fx(t))) ** 2;
      sst += (yt - mu) ** 2;
    }
  }
  return sst ? 1 - sse / sst : null;
}
const r2a = r2oos((t) => [rv20[t] > 0 ? Math.log(rv20[t]) : null]);
const r2b = r2oos((t) => [rv20[t] > 0 ? Math.log(rv20[t]) : null, sc(F.vol.s[t])]);

// ---------- HP5: exposição por vol-alvo ----------
const irx = C["^IRX"];
const sma200 = smaArr(spy, 200);
function strat(target) {
  const out = [];
  let w = null;
  for (let t = START; t + 1 < N; t++) {
    const want = target(t);
    let cost = 0;
    if (fin(want) && (w === null || Math.abs(want - w) > 0.15)) {
      cost = Math.abs(want - (w ?? 0)) * COST;
      w = want;
    }
    if (w === null || !fin(spyR[t + 1])) continue;
    const cash = fin(irx?.[t]) ? irx[t] / 100 / 252 : 0;
    out.push({ d: dates[t + 1], r: w * spyR[t + 1] + (1 - w) * cash - cost });
  }
  return out;
}
const sig = (t) => (fin(rv20[t]) && vix?.[t] > 0 ? (rv20[t] + vix[t] / 100) / 2 : rv20[t]);
const vt = (t) => (sig(t) > 0 ? Math.min(1, 0.16 / sig(t)) : null);
const STRATS = {
  N: () => 1,
  mm200: (t) => (sma200[t] ? (spy[t] > sma200[t] ? 1 : 0) : null),
  vt,
  vt_mm200: (t) => (vt(t) != null && sma200[t] ? vt(t) * (spy[t] < sma200[t] ? 0.5 : 1) : null),
  vt_p2: (t) => (vt(t) != null && band[t] != null ? vt(t) * (band[t] === -1 ? 0.5 : 1) : null),
};
const EXPO = Object.fromEntries(Object.entries(STRATS).map(([k, f]) => [k, metrics(strat(f))]));

// ---------- faixas com histerese e quadrante ----------
const bands = [-1, 0, 1].map((b) => {
  const ts = COMMON.filter((t) => band[t] === b);
  return { faixa: b, dias: ts.length, share: ts.length / (COMMON.length || 1), quedaTaxa: avg(ts.map((t) => dd63[t])), volFutura: avg(ts.map((t) => rvF21[t])) }; // prettier-ignore
});
const tlt = C.TLT;
const quad = ["↑cresc ↓infl", "↑cresc ↑infl", "↓cresc ↑infl", "↓cresc ↓infl"].map((label, i) => {
  const want = (t) => {
    const g = F.growth.im[t];
    const f = F.inflation.im[t];
    if (!fin(g) || !fin(f)) return false;
    return [g >= 0 && f < 0, g >= 0 && f >= 0, g < 0 && f >= 0, g < 0 && f < 0][i];
  };
  const ts = EVAL.filter((t) => want(t) && t + FWD < N);
  return {
    quadrante: label,
    dias: ts.length,
    spy63: avg(ts.map((t) => spy[t + FWD] / spy[t] - 1)),
    tlt63: tlt ? avg(ts.map((t) => (tlt[t] > 0 && tlt[t + FWD] > 0 ? tlt[t + FWD] / tlt[t] - 1 : null))) : null, // prettier-ignore
  };
});

// ---------- hipóteses e veredito ----------
const qb = (k) => QUINT[k].rows[0].razaoBase;
const HP = {
  HP1: {
    ok: qb("p2") >= 2 && qb("atual_h1") <= 1.3,
    detalhe: { p2: qb("p2"), atual_h1: qb("atual_h1") },
  },
  HP2: { ok: fin(r2a) && fin(r2b) && r2b - r2a > 0, detalhe: { r2VolHoje: r2a, r2ComForca: r2b } },
  HP3: { ok: BRIER.credito_var60.skill > BRIER.credito_nivel.skill, detalhe: { nivel: BRIER.credito_nivel.skill, var60: BRIER.credito_var60.skill } }, // prettier-ignore
  HP4: (() => {
    const a = BRIER.tend_vol.skill;
    const b = BRIER.tend_vol_cresc.skill;
    return {
      ok: a > 0 ? (b - a) / a < 0.1 : b - a < 0.01,
      detalhe: { tendVol: a, comCrescimento: b },
    };
  })(),
  HP5: {
    ok:
      Math.abs(EXPO.vt_mm200.dd) <= 0.7 * Math.abs(EXPO.N.dd) &&
      EXPO.vt_mm200.cagr >= EXPO.N.cagr - 0.015,
    detalhe: { ddN: EXPO.N.dd, dd: EXPO.vt_mm200.dd, cagrN: EXPO.N.cagr, cagr: EXPO.vt_mm200.cagr },
  },
};
const critA = BRIER.p2.skill > BRIER.atual_h1.skill && BRIER.p2.skill > BRIER.mm200.skill;
const critB = QUINT.p2.spearman <= -0.9 && qb("p2") > qb("atual_h1") && qb("p2") > qb("mm200");
const verdict = critA && critB ? (pBoot <= 0.1 ? "aprovada" : "aprovada com ressalva (não significativa)") : "reprovada"; // prettier-ignore
const VARIANTS = Object.keys(FEATS).length - 1 + Object.keys(STRATS).length - 1;

const last = N - 1;
const hoje = {
  data: dates[last],
  p2: p2[last],
  faixa: band[last],
  atual_h1: cur.h1[last],
  forcas: Object.fromEntries(Object.keys(FORCES).map((k) => [k, { estado: F[k].st[last], impulso: F[k].im[last], nota: F[k].s[last] }])), // prettier-ignore
};

const res = {
  geradoEm: new Date().toISOString(),
  local: LOCAL,
  periodo: [dates[COMMON[0]] ?? null, dates[COMMON.at(-1)] ?? null],
  dias: COMMON.length,
  taxaBase: baseRate,
  faltando: missing,
  brier: BRIER,
  bootstrap: { rival, p: pBoot, sorteios: DRAWS, bloco: 63 },
  quintis: QUINT,
  faixas: bands,
  quadrante: quad,
  exposicao: EXPO,
  hipoteses: HP,
  criterio: { a: critA, b: critB },
  veredito: verdict,
  variantes: VARIANTS,
  hoje,
};

// ---------- relatório ----------
const pc = (x) => (fin(x) ? `${(x * 100).toFixed(1)}%` : "—");
const f2 = (x) => (fin(x) ? x.toFixed(2) : "—");
const f3 = (x) => (fin(x) ? x.toFixed(3) : "—");
const yn = (b) => (b ? "sim" : "não");
const NAMES = { base: "Taxa base", atual_h1: "Atual (h=1, Início)", atual_h5: "Atual (h=5)", atual_h21: "Atual (h=21)", mm200: "MM200 simples", vol_simples: "Vol 20d simples", p2: "Pêndulo 2.0", p2_forcas: "2.0 (5 forças separadas)", tend_vol: "Tendência + Vol", tend_vol_cresc: "Tendência + Vol + Crescimento", credito_nivel: "Crédito: nível", credito_var60: "Crédito: variação 60d" }; // prettier-ignore
const SN = { N: "Segurar SPY", mm200: "SPY + MM200 (diário)", vt: "Vol-alvo 16%", vt_mm200: "Vol-alvo + MM200 (HP5)", vt_p2: "Vol-alvo + defesa do 2.0" }; // prettier-ignore
const md = `# Estudo P1: Pêndulo 2.0 × pêndulo atual × MM200

> \`node scripts/pendulum-study.mjs\` → \`data/pendulum-study.json\`. Regras e critério registrados no cabeçalho do
> script antes de rodar (20/11/2026). ${res.periodo[0]} a ${res.periodo[1]} (fora da amostra, ${res.dias} pregões),
> Yahoo ajustado. Taxa base de queda > 10% em 63 pregões: **${pc(baseRate)}**.${missing.length ? ` Séries sem dados: ${missing.join(", ")}.` : ""}${LOCAL ? " **Rodada de teste (local ou sintética): só testa o código, NÃO é resultado.**" : ""}
> Material educacional; não é recomendação de investimento.

## Veredito: **${verdict}**

- (a) Brier skill do 2.0 > atual (h=1) e > MM200: **${yn(critA)}** (${f3(BRIER.p2.skill)} × ${f3(BRIER.atual_h1.skill)} × ${f3(BRIER.mm200.skill)})
- (b) Monotonia do 2.0 (Spearman ≤ −0,9) e quintil de baixo mais concentrado que os dois: **${yn(critB)}** (Spearman ${f2(QUINT.p2.spearman)}; razões ${f2(qb("p2"))} × ${f2(qb("atual_h1"))} × ${f2(qb("mm200"))})
- Bootstrap (blocos de 63, ${DRAWS} sorteios) do Brier do 2.0 contra ${NAMES[rival]}: p = ${f2(pBoot)}
- Variantes testadas (contam para superajuste): ${VARIANTS}

## 1. Probabilidade de queda > 10% em 63 pregões (fora da amostra)

Brier skill > 0 = melhor que chutar a taxa base. Logística ano a ano, treino expansivo com expurgo.

| Modelo | Brier | Skill |
|---|---:|---:|
${Object.keys(FEATS)
  .map((k) => `| ${NAMES[k]} | ${f3(BRIER[k].brier)} | ${f3(BRIER[k].skill)} |`)
  .join("\n")}

## 2. Quintis de cada sinal (quintil 1 = mais defensivo)

${Object.entries(QUINT)
  .map(
    ([k, q]) => `**${NAMES[k]}** (Spearman quintil × queda: ${f2(q.spearman)})

| Quintil | Dias | Queda > 10% | × base | Vol futura 21d | Ret. 21d | Sharpe (SPY no dia seguinte) | Queda máx. |
|---:|---:|---:|---:|---:|---:|---:|---:|
${q.rows.map((r) => `| ${r.q} | ${r.n} | ${pc(r.quedaTaxa)} | ${f2(r.razaoBase)} | ${pc(r.volFutura)} | ${pc(r.ret21)} | ${f2(r.sharpe)} | ${pc(r.quedaMax)} |`).join("\n")}
`,
  )
  .join("\n")}
## 3. Faixas do 2.0 com histerese (defesa < −30 até > −10; risco > +30 até < +10)

| Faixa | Dias | Fração | Queda > 10% | Vol futura 21d |
|---|---:|---:|---:|---:|
${bands.map((b) => `| ${["Defesa", "Neutro", "Risco"][b.faixa + 1]} | ${b.dias} | ${pc(b.share)} | ${pc(b.quedaTaxa)} | ${pc(b.volFutura)} |`).join("\n")}

## 4. Exposição (HP5)

| Regra | Ganho ao ano | Queda máx. | Retorno/queda | Vol. | Sharpe |
|---|---:|---:|---:|---:|---:|
${Object.entries(EXPO)
  .map(
    ([k, m]) =>
      `| ${SN[k]} | ${pc(m.cagr)} | ${pc(m.dd)} | ${f2(m.retDd)} | ${pc(m.vol)} | ${f2(m.sharpe)} |`,
  )
  .join("\n")}

## 5. Quadrante crescimento × inflação (pelo impulso de 20 pregões)

| Quadrante | Dias | SPY 63d | TLT 63d |
|---|---:|---:|---:|
${quad.map((q) => `| ${q.quadrante} | ${q.dias} | ${pc(q.spy63)} | ${pc(q.tlt63)} |`).join("\n")}

## 6. Hipóteses registradas

| Hipótese | Confirmada? | Números |
|---|---|---|
| HP1: quintil de baixo do 2.0 ≥ 2× a base; atual (h=1) ≤ 1,3× | ${yn(HP.HP1.ok)} | 2.0 ${f2(qb("p2"))}×; atual ${f2(qb("atual_h1"))}× |
| HP2: força Vol melhora a previsão da vol de 21d (R² fora da amostra) | ${yn(HP.HP2.ok)} | só vol de hoje ${f3(r2a)}; com a força ${f3(r2b)} |
| HP3: crédito em variação de 60d > crédito em nível (Brier skill) | ${yn(HP.HP3.ok)} | nível ${f3(HP.HP3.detalhe.nivel)}; var. 60d ${f3(HP.HP3.detalhe.var60)} |
| HP4: Crescimento acrescenta < 10% sobre Tendência + Vol | ${yn(HP.HP4.ok)} | ${f3(HP.HP4.detalhe.tendVol)} → ${f3(HP.HP4.detalhe.comCrescimento)} |
| HP5: vol-alvo + MM200 corta ≥ 30% da queda máx. com CAGR ≥ SPY − 1,5 p.p. | ${yn(HP.HP5.ok)} | queda ${pc(EXPO.vt_mm200.dd)} × ${pc(EXPO.N.dd)}; CAGR ${pc(EXPO.vt_mm200.cagr)} × ${pc(EXPO.N.cagr)} |

## 7. Leitura de hoje (${hoje.data})

Pêndulo 2.0: **${fin(hoje.p2) ? Math.round(hoje.p2) : "—"}** (faixa ${["defesa", "neutro", "risco"][(hoje.faixa ?? 0) + 1]}); atual (h=1): ${fin(hoje.atual_h1) ? Math.round(hoje.atual_h1) : "—"}.

| Força | Estado | Impulso | Nota |
|---|---:|---:|---:|
${Object.entries(hoje.forcas)
  .map(
    ([k, v]) =>
      `| ${FORCES[k].label} | ${fin(v.estado) ? Math.round(v.estado) : "—"} | ${fin(v.impulso) ? Math.round(v.impulso) : "—"} | ${fin(v.nota) ? Math.round(v.nota) : "—"} |`,
  )
  .join("\n")}

Aprovar aqui não muda a tela: a P2 (motor em modo sombra) só começa com a P1 aprovada, e a troca do oficial (P5) só por
ordem do usuário depois de ≥ 2 meses de diário fora da amostra.
`;

if (OUT) {
  await writeFile(`${OUT}.json`, JSON.stringify(res, null, 1));
  await writeFile(`${OUT}.md`, md);
} else if (!LOCAL) {
  await writeFile(
    new URL("../data/pendulum-study.json", import.meta.url),
    JSON.stringify(res, null, 1),
  );
  await writeFile(new URL("../docs/ESTUDO-PENDULO.md", import.meta.url), md);
}
console.log(md);
