// J3 do docs/PLANO-PENDULO.md (estudo P1b): o pano de fundo (MM200 + crédito) prevê queda melhor que a MM200 sozinha?
//
// REGRAS REGISTRADAS EM 20/11/2026, ANTES DE RODAR (não alterar depois de ver o resultado):
//  Mesmo protocolo do P1 (scripts/pendulum-study.mjs): Yahoo ajustado, eixo = pregões do SPY desde 2006, séries de
//  fora repetem o último valor por até 5 pregões, avaliação de 2008 em diante, alvo = queda > 10% em 63 pregões
//  (mínimo futuro ÷ preço de hoje − 1 ≤ −10%). Fora da amostra ano a ano desde 2011 (logística, treino expansivo,
//  expurgo de 63 pregões, ≥ 500 linhas de treino); todos os modelos no MESMO conjunto de dias.
//  Variáveis (as mesmas do pano de fundo da tela, assets/backdrop.js): tendência = SPY ÷ MM200 − 1; crédito =
//  variação de 60 pregões de HYG/IEF; estado = −1 defesa (os dois contra), 0 atenção, +1 favorável.
//   HP6: logística [tendência, crédito] tem Brier skill > a da MM200 sozinha E bootstrap em blocos de 63 pregões
//        (2.000 sorteios, semente fixa) da diferença de Brier com p ≤ 0,10.
//   HP7: regime atual (regime() de assets/dash.js) com h = 63 tem Brier skill > h = 1.
//  Registro (não decide): skill do estado discreto e taxa de queda por estado.
//  Saída: data/backdrop-study.json, docs/ESTUDO-PANO-DE-FUNDO.md e data/backdrop-model.json (coeficientes do
//  treino com todos os alvos já fechados; `aprovado` = HP6). O app só mostra a probabilidade (J4) se aprovado.
//  HP8 (REGISTRADA EM 20/11/2026 DEPOIS DO RESULTADO DE HP6 E ANTES DE RODAR; modo --hp8, arquivos próprios):
//   estado só pela MM200 (+1 acima, −1 abaixo, mesma histerese de 2 pregões) tem Brier skill > o do estado de 3
//   níveis (MM200 + crédito) E bootstrap em blocos de 63 (2.000 sorteios, semente fixa) com p ≤ 0,10.
//   Aprovada → o pano de fundo da tela passa a decidir o estado só pela MM200 (crédito vira detalhe).
//   Reprovada → a tela não muda.  Saída: data/backdrop-hp8.json e docs/ESTUDO-PANO-DE-FUNDO-HP8.md.
// Uso: node scripts/backdrop-study.mjs [--synth] [--hp8]  (--synth: séries sintéticas, só testa o código; não grava nada)
// Material educacional; não é recomendação de investimento.
import { writeFile } from "node:fs/promises";
import { RATIOS, regime } from "../assets/dash.js";

const SYNTH = process.argv.includes("--synth");
const HP8MODE = process.argv.includes("--hp8");
const FWD = 63;
const fin = Number.isFinite;
const SYMS = [...new Set(["SPY", "HYG", "IEF", "^VIX", "^VIX3M", ...RATIOS.flatMap(([a, b]) => (b ? [a, b] : [a]))])]; // prettier-ignore

async function yahoo(sym) {
  const u = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(sym)}?period1=0&period2=${Math.floor(Date.now() / 1000)}&interval=1d`; // prettier-ignore
  for (let k = 0; k < 3; k++) {
    try {
      const j = (await (await fetch(u, { headers: { "User-Agent": "Mozilla/5.0" }, signal: AbortSignal.timeout(30000) })).json()).chart?.result?.[0]; // prettier-ignore
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

function synth() {
  let z = 11;
  const r = () => (z = (z * 1103515245 + 12345) % 2147483648) / 2147483648;
  const g = () => Math.sqrt(-2 * Math.log(r() + 1e-12)) * Math.cos(2 * Math.PI * r());
  const ds = [];
  for (
    let d = new Date("2005-01-03");
    d < new Date("2026-11-20");
    d = new Date(d.getTime() + 864e5)
  )
    if (d.getUTCDay() % 6) ds.push(d.toISOString().slice(0, 10));
  let vol = 0.01;
  const e = ds.map(() => {
    vol = Math.min(0.05, Math.max(0.005, vol * Math.exp(0.1 * g()) * (r() < 0.002 ? 3 : 1) * 0.999 + 1e-5)); // prettier-ignore
    return { e: 0.0003 + vol * g(), vol };
  });
  return Object.fromEntries(
    SYMS.map((s, k) => {
      let p = 100;
      const b = s === "IEF" ? -0.2 : 0.5 + (k % 4) * 0.2;
      return [s, new Map(ds.map((d, i) => [d, /VIX/.test(s) ? e[i].vol * 1600 : (p *= 1 + b * e[i].e + 0.005 * g())]))]; // prettier-ignore
    }),
  );
}

const raw = SYNTH ? synth() : Object.fromEntries(await Promise.all(SYMS.map(async (s) => [s, await yahoo(s)]))); // prettier-ignore
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
  let lastD = null;
  for (let i = 0; i < N; i++) {
    while (j < keys.length && keys[j] <= dates[i]) ((last = m.get(keys[j])), (lastD = j++));
    out[i] = lastD !== null && i - dates.indexOf(keys[lastD]) <= 5 ? last : null;
  }
  C[s] = out;
}
// (indexOf é linear: aceitável para ~5.000 pregões em um estudo sob demanda)

const spy = C.SPY;
const sma = (s, n) => s.map((_, i) => (i >= n - 1 && s.slice(i - n + 1, i + 1).every(fin) ? s.slice(i - n + 1, i + 1).reduce((a, b) => a + b, 0) / n : null)); // prettier-ignore
const m200 = sma(spy, 200);
const trend = spy.map((v, i) => (m200[i] ? v / m200[i] - 1 : null));
const cr =
  C.HYG && C.IEF ? C.HYG.map((v, i) => (fin(v) && C.IEF[i] > 0 ? v / C.IEF[i] : null)) : null;
const credit = spy.map((_, i) => (cr && i >= 60 && fin(cr[i]) && cr[i - 60] > 0 ? cr[i] / cr[i - 60] - 1 : null)); // prettier-ignore
const stateRaw = trend.map((t, i) => {
  if (!fin(t)) return null;
  const bad = (t < 0 ? 1 : 0) + (fin(credit[i]) && credit[i] < 0 ? 1 : 0);
  return bad === 2 ? -1 : bad === 1 ? 0 : 1;
});
// mesma histerese da tela: troca só com 2 pregões seguidos no estado novo
const state = new Array(N).fill(null);
for (let i = 0, s = null; i < N; i++) {
  const x = stateRaw[i];
  if (x === null) continue;
  if (s === null || (x !== s && stateRaw[i - 1] === x)) s = x;
  state[i] = s;
}
// HP8: estado só pela MM200, com a mesma histerese
const stateMM = new Array(N).fill(null);
for (let i = 0, s = null; i < N; i++) {
  const t = trend[i];
  if (!fin(t)) continue;
  const x = t < 0 ? -1 : 1;
  const prev = fin(trend[i - 1]) ? (trend[i - 1] < 0 ? -1 : 1) : null;
  if (s === null || (x !== s && prev === x)) s = x;
  stateMM[i] = s;
}
const START = Math.max(
  260,
  dates.findIndex((d) => d >= "2008-01-01"),
);
const cur = { h1: new Array(N).fill(null), h63: new Array(N).fill(null) };
for (let t = START; t < N; t++) {
  const close = {};
  for (const s of SYMS) if (C[s]) close[s] = C[s].slice(Math.max(0, t - 349), t + 1);
  for (const h of [1, 63]) {
    try {
      const v = regime(close, h)?.strength?.raw;
      if (fin(v)) cur[`h${h}`][t] = v;
    } catch {
      /* sem dados */
    }
  }
}
const dd63 = spy.map((v, t) => {
  if (t + FWD >= N) return null;
  let mn = Infinity;
  for (let k = t + 1; k <= t + FWD; k++) mn = Math.min(mn, spy[k]);
  return mn / v - 1 <= -0.1 ? 1 : 0;
});

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
function logit(X, y, lam = 1e-3) {
  const k = X[0].length + 1;
  let w = new Array(k).fill(0);
  for (let it = 0; it < 30; it++) {
    const g = new Array(k).fill(0);
    const H = Array.from({ length: k }, () => new Array(k).fill(0));
    X.forEach((x, i) => {
      const z = [1, ...x];
      const p = 1 / (1 + Math.exp(-z.reduce((s, v, j) => s + v * w[j], 0)));
      z.forEach((a, r) => {
        g[r] += (p - y[i]) * a;
        z.forEach((b, c) => (H[r][c] += p * (1 - p) * a * b));
      });
    });
    for (let j = 1; j < k; j++) ((g[j] += lam * w[j]), (H[j][j] += lam));
    const st = solve(H, g);
    if (!st) break;
    w = w.map((v, j) => v - st[j]);
    if (Math.max(...st.map(Math.abs)) < 1e-8) break;
  }
  return w;
}
const prob = (w, x) => 1 / (1 + Math.exp(-[1, ...x].reduce((s, v, j) => s + v * w[j], 0)));

// escalas fixas (registradas): tendência ×10, crédito ×20, notas ÷100
const FEATS = {
  base: () => [],
  mm200: (t) => [trend[t] * 10],
  hp6: (t) => [trend[t] * 10, credit[t] * 20],
  estado: (t) => [state[t]],
  estado_mm200: (t) => [stateMM[t]],
  atual_h1: (t) => [cur.h1[t] / 100],
  atual_h63: (t) => [cur.h63[t] / 100],
};
const ok = (t) => dd63[t] !== null && Object.values(FEATS).every((f) => f(t).every(fin));
const EVAL = [];
for (let t = START; t < N; t++) if (ok(t)) EVAL.push(t);
const year = (t) => dates[t].slice(0, 4);
const YEARS = [...new Set(EVAL.map(year))].filter((y) => y >= "2011");
const PRED = {};
for (const [k, fx] of Object.entries(FEATS)) {
  const m = new Map();
  for (const y of YEARS) {
    const first = EVAL.find((t) => year(t) === y);
    const train = EVAL.filter((t) => t + FWD < first);
    const test = EVAL.filter((t) => year(t) === y);
    if (train.length < 500) continue;
    const ys = train.map((t) => dd63[t]);
    const base = Math.min(Math.max(ys.reduce((a, b) => a + b, 0) / ys.length, 1e-4), 1 - 1e-4);
    if (k === "base" || base <= 1e-4 || base >= 1 - 1e-4) test.forEach((t) => m.set(t, base));
    else {
      const w = logit(train.map(fx), ys);
      test.forEach((t) => m.set(t, prob(w, fx(t))));
    }
  }
  PRED[k] = m;
}
const COMMON = EVAL.filter((t) => Object.values(PRED).every((m) => m.has(t)));
const brier = (m) => COMMON.reduce((s, t) => s + (m.get(t) - dd63[t]) ** 2, 0) / COMMON.length;
const B0 = brier(PRED.base);
const BRIER = Object.fromEntries(Object.keys(FEATS).map((k) => [k, { brier: brier(PRED[k]), skill: 1 - brier(PRED[k]) / B0 }])); // prettier-ignore

/** p do bootstrap em blocos de 63: fração dos sorteios em que o modelo a NÃO tem Brier menor que o b. */
function boot(a, b) {
  let seed = 20261120;
  const rnd = () => (seed = (seed * 1664525 + 1013904223) % 4294967296) / 4294967296;
  const dl = COMMON.map((t) => (PRED[a].get(t) - dd63[t]) ** 2 - (PRED[b].get(t) - dd63[t]) ** 2);
  let worse = 0;
  for (let k = 0; k < 2000; k++) {
    let s = 0;
    let n = 0;
    while (n < dl.length) {
      const st = Math.floor(rnd() * dl.length);
      for (let q = 0; q < 63 && n < dl.length; q++, n++) s += dl[(st + q) % dl.length];
    }
    if (s >= 0) worse++;
  }
  return dl.length ? worse / 2000 : null;
}
const pBoot = boot("hp6", "mm200");
const baseRate = COMMON.reduce((s, t) => s + dd63[t], 0) / (COMMON.length || 1);
const byState = [-1, 0, 1].map((s) => {
  const ts = COMMON.filter((t) => state[t] === s);
  const rate = ts.length ? ts.reduce((a, t) => a + dd63[t], 0) / ts.length : null;
  return { estado: ["defesa", "atenção", "favorável"][s + 1], dias: ts.length, fracao: ts.length / (COMMON.length || 1), quedaTaxa: rate, razaoBase: rate !== null && baseRate ? rate / baseRate : null }; // prettier-ignore
});
const HP6 = BRIER.hp6.skill > BRIER.mm200.skill && pBoot !== null && pBoot <= 0.1;
const HP7 = BRIER.atual_h63.skill > BRIER.atual_h1.skill;
const pBoot8 = boot("estado_mm200", "estado");
const HP8 = BRIER.estado_mm200.skill > BRIER.estado.skill && pBoot8 !== null && pBoot8 <= 0.1;
const byStateMM = [-1, 1].map((s) => {
  const ts = COMMON.filter((t) => stateMM[t] === s);
  const rate = ts.length ? ts.reduce((a, t) => a + dd63[t], 0) / ts.length : null;
  return { estado: s < 0 ? "abaixo da MM200" : "acima da MM200", dias: ts.length, fracao: ts.length / (COMMON.length || 1), quedaTaxa: rate, razaoBase: rate !== null && baseRate ? rate / baseRate : null }; // prettier-ignore
});

// modelo final: todos os alvos já fechados (t + 63 < N)
const all = EVAL;
const wFinal = logit(
  all.map(FEATS.hp6),
  all.map((t) => dd63[t]),
);
const model = {
  geradoEm: new Date().toISOString(),
  aprovado: HP6,
  alvo: "queda > 10% em 63 pregões",
  variaveis: ["tendencia×10 (SPY ÷ MM200 − 1)", "credito×20 (HYG/IEF, 60 pregões)"],
  coef: wFinal,
  taxaBase: all.reduce((s, t) => s + dd63[t], 0) / all.length,
  treinoAte: dates[all.at(-1)],
};
const res = {
  geradoEm: model.geradoEm,
  periodo: [dates[COMMON[0]], dates[COMMON.at(-1)]],
  dias: COMMON.length,
  taxaBase: baseRate,
  faltando: SYMS.filter((s) => !C[s]),
  brier: BRIER,
  bootstrap: { p: pBoot, sorteios: 2000, bloco: 63 },
  porEstado: byState,
  hipoteses: { HP6, HP7 },
  modelo: model,
};

const pc = (x) => (fin(x) ? `${(x * 100).toFixed(1)}%` : "—");
const f3 = (x) => (fin(x) ? x.toFixed(3) : "—");
const f2 = (x) => (fin(x) ? x.toFixed(2) : "—");
const yn = (b) => (b ? "sim" : "não");
const NM = { base: "Taxa base", mm200: "MM200 sozinha", hp6: "MM200 + crédito 60d (HP6)", estado: "Estado do pano de fundo (−1/0/+1)", atual_h1: "Regime atual h=1 (1D)", atual_h63: "Regime atual h=63 (3M)" }; // prettier-ignore
const md = `# Estudo J3 (P1b): pano de fundo MM200 + crédito

> \`node scripts/backdrop-study.mjs\` → \`data/backdrop-study.json\` e \`data/backdrop-model.json\`. Regras registradas no
> cabeçalho antes de rodar (20/11/2026). ${res.periodo[0]} a ${res.periodo[1]} (fora da amostra, ${res.dias} pregões).
> Taxa base de queda > 10% em 63 pregões: **${pc(baseRate)}**.${res.faltando.length ? ` Sem dados: ${res.faltando.join(", ")}.` : ""}${SYNTH ? " **Rodada sintética: só teste de código.**" : ""}
> Material educacional; não é recomendação de investimento.

## Hipóteses

| Hipótese | Confirmada? | Números |
|---|---|---|
| HP6: MM200 + crédito > MM200 sozinha (Brier skill) com p ≤ 0,10 | **${yn(HP6)}** | ${f3(BRIER.hp6.skill)} × ${f3(BRIER.mm200.skill)}; p = ${f2(pBoot)} |
| HP7: regime h=63 > h=1 | **${yn(HP7)}** | ${f3(BRIER.atual_h63.skill)} × ${f3(BRIER.atual_h1.skill)} |

## Brier fora da amostra

| Modelo | Brier | Skill |
|---|---:|---:|
${Object.keys(FEATS)
  .map((k) => `| ${NM[k]} | ${f3(BRIER[k].brier)} | ${f3(BRIER[k].skill)} |`)
  .join("\n")}

## Taxa de queda por estado do pano de fundo (o que a tela mostra)

| Estado | Dias | Fração | Queda > 10% em 63d | × base |
|---|---:|---:|---:|---:|
${byState.map((s) => `| ${s.estado} | ${s.dias} | ${pc(s.fracao)} | ${pc(s.quedaTaxa)} | ${f2(s.razaoBase)} |`).join("\n")}

${HP6 ? "HP6 aprovada: a probabilidade (J4) pode aparecer no pano de fundo, em modo sombra." : "HP6 reprovada: a probabilidade (J4) **não** vai para a tela; o pano de fundo segue só com os lados (estado)."}
`;
const md8 = `# Estudo HP8: estado do pano de fundo só pela MM200

> \`node scripts/backdrop-study.mjs --hp8\` → \`data/backdrop-hp8.json\`. Hipótese registrada no cabeçalho do script em
> 20/11/2026, depois do resultado de HP6 (docs/ESTUDO-PANO-DE-FUNDO.md) e antes de rodar. ${res.periodo[0]} a
> ${res.periodo[1]} (fora da amostra, ${res.dias} pregões); taxa base ${pc(baseRate)}.${SYNTH ? " **Rodada sintética: só teste de código.**" : ""}
> Material educacional; não é recomendação de investimento.

## Veredito: **${HP8 ? "aprovada" : "reprovada"}**

| Modelo | Brier skill |
|---|---:|
| Estado de 3 níveis (MM200 + crédito, o da tela) | ${f3(BRIER.estado.skill)} |
| Estado só pela MM200 (HP8) | ${f3(BRIER.estado_mm200.skill)} |
| MM200 contínua (referência) | ${f3(BRIER.mm200.skill)} |

Bootstrap (blocos de 63, 2.000 sorteios) do estado só pela MM200 contra o de 3 níveis: p = ${f2(pBoot8)}.

| Estado | Dias | Fração | Queda > 10% em 63d | × base |
|---|---:|---:|---:|---:|
${byStateMM.map((s) => `| ${s.estado} | ${s.dias} | ${pc(s.fracao)} | ${pc(s.quedaTaxa)} | ${f2(s.razaoBase)} |`).join("\n")}

${HP8 ? "Aprovada: o pano de fundo passa a decidir o estado só pela MM200; o crédito fica como detalhe." : "Reprovada: o pano de fundo da tela não muda (estado de 3 níveis)."}
`;
if (HP8MODE) {
  if (!SYNTH) {
    await writeFile(new URL("../data/backdrop-hp8.json", import.meta.url), JSON.stringify({ geradoEm: res.geradoEm, periodo: res.periodo, dias: res.dias, taxaBase: baseRate, brier: { estado: BRIER.estado, estado_mm200: BRIER.estado_mm200, mm200: BRIER.mm200 }, p: pBoot8, porEstado: byStateMM, aprovada: HP8 }, null, 1)); // prettier-ignore
    await writeFile(new URL("../docs/ESTUDO-PANO-DE-FUNDO-HP8.md", import.meta.url), md8);
  }
  console.log(md8);
  process.exit(0);
}
if (!SYNTH) {
  await writeFile(
    new URL("../data/backdrop-study.json", import.meta.url),
    JSON.stringify(res, null, 1),
  );
  await writeFile(
    new URL("../data/backdrop-model.json", import.meta.url),
    JSON.stringify(model, null, 1),
  );
  await writeFile(new URL("../docs/ESTUDO-PANO-DE-FUNDO.md", import.meta.url), md);
}
console.log(md);
