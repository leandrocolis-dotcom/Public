// Estudo do Medo & Ganância da CNN (docs/ESTUDO-FEAR-GREED.md): o alívio do medo extremo prevê alta do SPY, e isso
// acrescenta algo ao VIX (que o pêndulo já usa)? Base: CNN desde jan/2021 (diário) + SPY e ^VIX do Yahoo.
// Eventos (um por episódio, 10 pregões de intervalo): FG < 25; alívio FG = mínimo dos 5 últimos ≤ 25 e subida ≥ 10
// pontos; alívio VIX = máximo dos 5 últimos ≥ 25 e queda ≥ 15%; alívio FG sem alívio do VIX (±2 pregões).
// Alvo: retorno do SPY em 5, 10 e 20 pregões. Teste: média do evento × de dias quaisquer, aproveitamento e p por
// sorteio (5.000 conjuntos de dias ao acaso do mesmo tamanho). Também a regressão do retorno de 20 pregões na
// variação de 5 dias do FG e do VIX juntos (o FG explica algo com o VIX no modelo?). Material educacional.
// Uso: node scripts/fear-greed-study.mjs   Saída: data/fear-greed-study.json
import { writeFile } from "node:fs/promises";

const UA = { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36", Referer: "https://edition.cnn.com/" }; // prettier-ignore
const day = (ms) => new Date(ms).toISOString().slice(0, 10);

async function cnn() {
  const r = await fetch(
    "https://production.dataviz.cnn.io/index/fearandgreed/graphdata/2021-01-01",
    { headers: UA },
  );
  const j = await r.json();
  const m = new Map();
  for (const p of j.fear_and_greed_historical.data) m.set(day(p.x), p.y);
  return m;
}
async function chart(sym) {
  const r = await fetch(`https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(sym)}?range=10y&interval=1d`, { headers: { "User-Agent": "Mozilla/5.0" } }); // prettier-ignore
  const x = (await r.json()).chart.result[0];
  const c = x.indicators.adjclose?.[0]?.adjclose ?? x.indicators.quote[0].close;
  const m = new Map();
  x.timestamp.forEach((t, i) => c[i] > 0 && m.set(day(t * 1000), c[i]));
  return m;
}

const [fgM, spyM, vixM] = await Promise.all([cnn(), chart("SPY"), chart("^VIX")]);
const dates = [...spyM.keys()].filter((d) => fgM.has(d) && vixM.has(d)).sort();
const fg = dates.map((d) => fgM.get(d));
const spy = dates.map((d) => spyM.get(d));
const vix = dates.map((d) => vixM.get(d));
const N = dates.length;
const H = [5, 10, 20];
const fwd = (i, h) => (i + h < N ? spy[i + h] / spy[i] - 1 : null);

const mean = (a) => a.reduce((s, x) => s + x, 0) / a.length;
const base = Object.fromEntries(H.map((h) => { const r = dates.map((_, i) => fwd(i, h)).filter((x) => x != null); return [h, { mean: mean(r), hit: r.filter((x) => x > 0).length / r.length, n: r.length }]; })); // prettier-ignore

/** Dias com o gatilho, um por episódio (cooldown de 10 pregões). */
function events(test) {
  const out = [];
  let last = -99;
  for (let i = 5; i < N; i++)
    if (test(i) && i - last >= 10) {
      out.push(i);
      last = i;
    }
  return out;
}
const minFg = (i) => Math.min(...fg.slice(i - 5, i));
const maxVix = (i) => Math.max(...vix.slice(i - 5, i));
const fgRelief = (i) => minFg(i) <= 25 && fg[i] - minFg(i) >= 10;
const vixRelief = (i) => maxVix(i) >= 25 && vix[i] <= 0.85 * maxVix(i);
const near = (i, f) => [-2, -1, 0, 1, 2].some((k) => i + k >= 5 && i + k < N && f(i + k));

let seed = 7;
const rnd = () => (seed = (seed * 1103515245 + 12345) % 2 ** 31) / 2 ** 31;
function stats(idx) {
  const out = { n: idx.length, dates: idx.map((i) => dates[i]) };
  for (const h of H) {
    const r = idx.map((i) => fwd(i, h)).filter((x) => x != null);
    if (!r.length) continue;
    const m = mean(r);
    const pool = dates.map((_, i) => fwd(i, h)).filter((x) => x != null);
    let ge = 0;
    for (let k = 0; k < 5000; k++) {
      let s = 0;
      for (let j = 0; j < r.length; j++) s += pool[Math.floor(rnd() * pool.length)];
      if (s / r.length >= m) ge++;
    }
    out[h] = { n: r.length, mean: m, excess: m - base[h].mean, hit: r.filter((x) => x > 0).length / r.length, p: ge / 5000 }; // prettier-ignore
  }
  return out;
}

const sets = {
  fgExtremeFear: events((i) => fg[i] < 25),
  fgRelief: events(fgRelief),
  vixRelief: events(vixRelief),
  fgReliefOnly: events((i) => fgRelief(i) && !near(i, vixRelief)),
  vixReliefOnly: events((i) => vixRelief(i) && !near(i, fgRelief)),
  both: events((i) => fgRelief(i) && near(i, vixRelief)),
  // a leitura do usuário em outras formas: sair do medo extremo (cruza 25 para cima) e voltar ao neutro (cruza 45
  // para cima tendo estado < 25 nos 20 pregões anteriores); fundo muito profundo (< 15)
  fgCross25: events((i) => fg[i - 1] < 25 && fg[i] >= 25),
  fgBackTo45: events(
    (i) => fg[i - 1] < 45 && fg[i] >= 45 && Math.min(...fg.slice(Math.max(0, i - 20), i)) < 25,
  ),
  fgBelow15: events((i) => fg[i] < 15),
};
const result = Object.fromEntries(Object.entries(sets).map(([k, v]) => [k, stats(v)]));

// regressão: retorno de 20 pregões ~ variação de 5 dias do FG (pontos) + variação de 5 dias do VIX (log), padronizadas
function ols(X, y) {
  const k = X[0].length;
  const XtX = Array.from({ length: k }, (_, a) => Array.from({ length: k }, (_, b) => X.reduce((s, r) => s + r[a] * r[b], 0))); // prettier-ignore
  const Xty = Array.from({ length: k }, (_, a) => X.reduce((s, r, i) => s + r[a] * y[i], 0));
  const A = XtX.map((r, i) => [...r, Xty[i]]);
  for (let c = 0; c < k; c++) {
    const p = A[c][c];
    for (let j = c; j <= k; j++) A[c][j] /= p;
    for (let r = 0; r < k; r++) if (r !== c) { const f = A[r][c]; for (let j = c; j <= k; j++) A[r][j] -= f * A[c][j]; } // prettier-ignore
  }
  return A.map((r) => r[k]);
}
const rows = [];
for (let i = 5; i + 20 < N; i += 20)
  rows.push([fg[i] - fg[i - 5], Math.log(vix[i] / vix[i - 5]), fwd(i, 20), fg[i]]); // sem sobreposição
const z = (a) => { const m = mean(a); const s = Math.sqrt(mean(a.map((x) => (x - m) ** 2))); return a.map((x) => (x - m) / s); }; // prettier-ignore
const dFg = z(rows.map((r) => r[0]));
const dVix = z(rows.map((r) => r[1]));
const lvl = z(rows.map((r) => r[3]));
const y = rows.map((r) => r[2]);
const corr = (a, b) => { const ma = mean(a); const mb = mean(b); const n = a.reduce((s, x, i) => s + (x - ma) * (b[i] - mb), 0); return n / Math.sqrt(a.reduce((s, x) => s + (x - ma) ** 2, 0) * b.reduce((s, x) => s + (x - mb) ** 2, 0)); }; // prettier-ignore
const reg = {
  n: rows.length,
  corrFgChange: corr(dFg, y),
  corrVixChange: corr(dVix, y),
  corrFgLevel: corr(lvl, y),
  corrFgVixChanges: corr(dFg, dVix),
  coefFgChangeWithVix: ols(
    rows.map((_, i) => [1, dFg[i], dVix[i]]),
    y,
  )[1],
  coefVixChangeWithFg: ols(
    rows.map((_, i) => [1, dFg[i], dVix[i]]),
    y,
  )[2],
};

const out = {
  generated_at: new Date().toISOString(),
  from: dates[0],
  to: dates.at(-1),
  days: N,
  base,
  result,
  reg,
};
await writeFile(
  new URL("../data/fear-greed-study.json", import.meta.url),
  JSON.stringify(out, null, 1),
);
const pc = (x) => (x == null ? "  –  " : `${(x * 100).toFixed(2)}%`);
console.log(`${dates[0]} → ${dates.at(-1)} (${N} pregões). Base 20d: ${pc(base[20].mean)} acerto ${(base[20].hit * 100).toFixed(0)}%`); // prettier-ignore
for (const [k, s] of Object.entries(result))
  console.log(k.padEnd(15), `n=${String(s.n).padStart(3)}`, H.map((h) => (s[h] ? `${h}d ${pc(s[h].mean)} (exc ${pc(s[h].excess)}, acerto ${(s[h].hit * 100).toFixed(0)}%, p ${s[h].p.toFixed(3)})` : "")).join(" | ")); // prettier-ignore
console.log(
  "reg",
  JSON.stringify(reg, (k, v) => (typeof v === "number" ? Math.round(v * 10000) / 10000 : v)),
);
