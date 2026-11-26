// Estudo Q1: decomposição inversa das notas quant do Seeking Alpha (SA) no S&P 500.
// Reproduzir: node scripts/quant-calib-study.mjs → data/quant-calib.json (relatório em docs/QUANT-ABERTO.md).
//
// Dado: a API pública do SA libera, por ação, a foto de 6 meses atrás (period=6) com a nota quant (1–5) e as notas
// por fator (código 1 = A+ … 13 = F). As fotos mais novas vêm bloqueadas. Uma chamada por ação, 2 por vez.
// O SA tem proteção contra robôs (PerimeterX): na 1ª execução (12/10/2026) bloqueou com CAPTCHA depois de ~30
// chamadas. O script NÃO contorna isso: para no primeiro 403 e guarda o que obteve em data/quant-calib-sa.json;
// as execuções seguintes usam esse cache (só consultam o SA de novo com --fetch-sa).
//
// Hipóteses e critérios (registrados ANTES de rodar, 12/10/2026):
//  C1 Pesos do SA: regressão linear da nota quant nas 5 notas por fator (convertidas para 0–100). Se R² ≥ 0,6, os
//     pesos do Quant Aberto passam a ser os coeficientes normalizados (só os positivos); senão ficam os pesos a priori.
//  C2 Teto "Manter": entre as ações com crescimento, momentum ou revisões ≤ D+, ou valor ou rentabilidade ≤ D−,
//     a fração com nota quant ≥ 3,5 deve ser < 5% para a regra ser considerada confirmada.
//  C3 Réplica do momentum (exata no tempo: só preços até a data da foto): Spearman entre o nosso fator momentum e
//     a nota de momentum do SA ≥ 0,6 = réplica boa.
//  C4 Réplica dos demais fatores com fundamentos de HOJE como aproximação (não há histórico grátis): Spearman
//     informado, sem critério (o atraso de 6 meses rebaixa a concordância, sobretudo em revisões e momentum).
//  C5 O que copiamos funciona? Retorno das ações nos 6 meses seguintes à foto × nota quant do SA: IC de Spearman e
//     "Compra forte" (≥ 4,5) × SPY. Um único período: só informativo, não aprova nada.
// Material educacional; não é recomendação de investimento.
import { readFile, writeFile } from "node:fs/promises";
import { httpFetch } from "../api/_http.js";
import { pool, summary, universe, weekly } from "./lib/quant-source.mjs";
import { FACTORS, WEIGHTS, deriveMetrics, scoreUniverse, spearman } from "../assets/quant.js";

const root = new URL("..", import.meta.url);
const read = async (f, d) => {
  try {
    return JSON.parse(await readFile(new URL(f, root), "utf8"));
  } catch {
    return d;
  }
};
const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const fin = (x) => typeof x === "number" && Number.isFinite(x);
const toPct = (code) => (fin(code) ? ((13 - code) / 12) * 100 : null); // 1 (A+) → 100, 13 (F) → 0
const GRADE_KEY = { value: "valueGrade", growth: "growthGrade", profit: "profitabilityGrade", mom: "momentumGrade", rev: "epsRevisionsGrade" }; // prettier-ignore

let blocked = false;
async function saRating(sym) {
  if (blocked) throw new Error("SA bloqueado (proteção contra robôs): parado");
  const slug = sym.replace("-", ".").toLowerCase();
  const url = `https://seekingalpha.com/api/v3/symbols/${encodeURIComponent(slug)}/rating/periods?filter[periods][]=6`;
  await sleep(150);
  return httpFetch(
    url,
    { timeout: 15000, ua: UA, headers: { Accept: "application/json" } },
    async (r) => {
      if (r.status === 403 || r.status === 429) blocked = true;
      if (!r.ok) throw new Error(`SA HTTP ${r.status}`);
      const d = (await r.json())?.data?.find((x) => x.meta?.period === 6);
      const a = d?.attributes?.ratings;
      if (d?.meta?.is_locked || !fin(a?.quantRating)) throw new Error("sem nota");
      return { asDate: d.attributes.asDate, quant: a.quantRating, ...Object.fromEntries(Object.entries(GRADE_KEY).map(([k, f]) => [k, a[f] ?? null])) }; // prettier-ignore
    },
  );
}

/** Mínimos quadrados com intercepto (eliminação de Gauss nas equações normais). */
function ols(X, y) {
  const A = X.map((r) => [1, ...r]);
  const k = A[0].length;
  const M = Array.from({ length: k }, (_, i) =>
    Array.from({ length: k + 1 }, (_, j) =>
      A.reduce((s, r, n) => s + r[i] * (j < k ? r[j] : y[n]), 0),
    ),
  );
  for (let c = 0; c < k; c++) {
    let p = c;
    for (let r = c + 1; r < k; r++) if (Math.abs(M[r][c]) > Math.abs(M[p][c])) p = r;
    [M[c], M[p]] = [M[p], M[c]];
    for (let r = 0; r < k; r++) {
      if (r === c) continue;
      const f = M[r][c] / M[c][c];
      for (let j = c; j <= k; j++) M[r][j] -= f * M[c][j];
    }
  }
  const b = M.map((r, i) => r[k] / r[i]);
  const yh = A.map((r) => r.reduce((s, x, i) => s + x * b[i], 0));
  const ym = y.reduce((s, v) => s + v, 0) / y.length;
  const ssr = y.reduce((s, v, i) => s + (v - yh[i]) ** 2, 0);
  const sst = y.reduce((s, v) => s + (v - ym) ** 2, 0);
  return { b, r2: 1 - ssr / sst };
}

const prev = await read("data/quant.json", null);
const { list } = await universe(prev);
console.log(`universo: ${list.length}`);

const cache = await read("data/quant-calib-sa.json", null);
const sa =
  process.argv.includes("--fetch-sa") || !cache
    ? await pool(list, 2, (u) => saRating(u.sym))
    : list.map((u) => cache.ratings[u.sym] ?? { error: "fora do cache" });
if (!cache || process.argv.includes("--fetch-sa")) {
  const ratings = Object.fromEntries(
    list.map((u, i) => [u.sym, sa[i]]).filter(([, x]) => x && !x.error),
  );
  await writeFile(new URL("data/quant-calib-sa.json", root), JSON.stringify({ fetched_at: new Date().toISOString(), blocked, ratings }, null, 1)); // prettier-ignore
}
const asDate = sa.find((x) => x?.asDate)?.asDate;
console.log(`SA: ${sa.filter((x) => x && !x.error).length} notas (foto de ${asDate})`);
const w = await pool([...list.map((u) => u.sym), "SPY"], 6, (s) => weekly(s, true));
const fund = await pool(list, 6, (u) => summary(u.sym));

const idxAt = (pts, d) => {
  let i = -1;
  for (let k = 0; k < pts.length; k++) if (pts[k].d <= d) i = k;
  return i;
};
const rows = [];
list.forEach((u, i) => {
  const s = sa[i];
  const pts = w[i];
  if (!s || s.error || !Array.isArray(pts)) return;
  const k = idxAt(pts, asDate);
  if (k < 52) return;
  const hist = pts.slice(0, k + 1).map((p) => p.c);
  const ma200 = hist.slice(-40).reduce((a, b) => a + b, 0) / Math.min(40, hist.length);
  const mThen = deriveMetrics({ price: hist.at(-1), ma200 }, hist);
  const f = fund[i] && !fund[i].error ? fund[i] : null;
  const mNow = f
    ? deriveMetrics(
        f,
        pts.map((p) => p.c),
      )
    : {};
  // momentum na data da foto; o resto com fundamentos de hoje
  const m = { ...mNow, r3: mThen.r3, r6: mThen.r6, r9: mThen.r9, r12: mThen.r12, r12_1: mThen.r12_1, ma200: mThen.ma200, hi52: mThen.hi52 }; // prettier-ignore
  const fwd = pts.at(-1).c / pts[k].c - 1;
  rows.push({ sym: u.sym, name: u.name, sector: u.sector, m, sa: s, fwd });
});
console.log(`amostra: ${rows.length}`);

// C1: pesos do SA
const keys = Object.keys(GRADE_KEY);
const full = rows.filter((r) => keys.every((k) => fin(r.sa[k])));
const X = full.map((r) => keys.map((k) => toPct(r.sa[k])));
const fit = ols(
  X,
  full.map((r) => r.sa.quant),
);
const coef = Object.fromEntries(keys.map((k, i) => [k, fit.b[i + 1]]));
const pos = Object.fromEntries(keys.map((k) => [k, Math.max(0, coef[k])]));
const tot = Object.values(pos).reduce((a, b) => a + b, 0);
const fitted = Object.fromEntries(keys.map((k) => [k, Math.round((pos[k] / tot) * 100) / 100]));
// mesma regressão só com quem NÃO tem fator desqualificante (o teto achata a nota dos demais)
const weakOf = (s) => ["growth", "mom", "rev"].some((k) => s[k] >= 10) || ["value", "profit"].some((k) => s[k] >= 12); // prettier-ignore
const clean = full.filter((r) => !weakOf(r.sa));
const fitClean = clean.length > 30 ? ols(clean.map((r) => keys.map((k) => toPct(r.sa[k]))), clean.map((r) => r.sa.quant)) : null; // prettier-ignore

// C2: teto "Manter"
const weak = full.filter((r) => weakOf(r.sa));
const weakAbove = weak.filter((r) => r.sa.quant >= 3.5).length;

// C3/C4: nossa réplica × notas do SA
const ours = scoreUniverse(
  rows.map((r) => ({ sym: r.sym, sector: r.sector, name: r.name, m: r.m })),
);
const rho = Object.fromEntries(
  Object.keys(FACTORS).map((k) => [
    k,
    spearman(
      ours.map((o) => o.f[k]),
      rows.map((r) => toPct(r.sa[k])),
    ),
  ]),
);
const oursFit = scoreUniverse(
  rows.map((r) => ({ sym: r.sym, sector: r.sector, name: r.name, m: r.m })),
  fit.r2 >= 0.6 ? fitted : WEIGHTS,
);
const rhoTotal = spearman(
  oursFit.map((o) => o.score),
  rows.map((r) => r.sa.quant),
);

// C5: o SA acertou nos 6 meses seguintes?
const spyPts = w.at(-1);
const ks = idxAt(spyPts, asDate);
const spyFwd = spyPts.at(-1).c / spyPts[ks].c - 1;
const ic = spearman(
  rows.map((r) => r.sa.quant),
  rows.map((r) => r.fwd),
);
const avg = (xs) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);
const bucket = (lo, hi) => rows.filter((r) => r.sa.quant >= lo && r.sa.quant < hi);
const buckets = [
  ["Compra forte", 4.5, 9],
  ["Compra", 3.5, 4.5],
  ["Manter", 2.5, 3.5],
  ["Venda", 1.5, 2.5],
  ["Venda forte", 0, 1.5],
].map(([l, lo, hi]) => {
  const b = bucket(lo, hi);
  return { label: l, n: b.length, fwd: avg(b.map((r) => r.fwd)) };
});
const icOurs = spearman(
  oursFit.map((o) => o.score),
  rows.map((r) => r.fwd),
);

const out = {
  generated_at: new Date().toISOString(),
  saDate: asDate,
  sample: rows.length,
  c1: { r2: fit.r2, intercept: fit.b[0], coef, fitted, adopted: fit.r2 >= 0.6, r2Clean: fitClean?.r2 ?? null, coefClean: fitClean ? Object.fromEntries(keys.map((k, i) => [k, fitClean.b[i + 1]])) : null, nClean: clean.length }, // prettier-ignore
  c2: {
    weak: weak.length,
    weakAbove35: weakAbove,
    share: weak.length ? weakAbove / weak.length : null,
  },
  c3c4: { rho, rhoTotal },
  c5: { ic, spyFwd, buckets, icOurs, note: "nossa nota usa fundamentos de hoje: o IC dela tem olhar no futuro e não vale como teste" }, // prettier-ignore
  distribution: buckets.map((b) => [b.label, b.n]),
};
console.log(JSON.stringify(out, null, 1));
await writeFile(new URL("data/quant-calib.json", root), JSON.stringify(out, null, 1));
