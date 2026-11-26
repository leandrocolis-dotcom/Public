// F29 (docs/MODELO-UNICO.md, H2): score estilo SCTR (60/30/10) × momentum 12-1 como ordenador do excesso.
// Pergunta (docs/OBJETIVO.md): qual ordenador escolhe melhor QUAL ativo comprar (camada 2 do modelo único)?
//
// REGRAS REGISTRADAS ANTES DE RODAR (não alterar depois de ver o resultado; se piorar, reverter):
//  Universo: ETFs do Pêndulo (sem macro), até 10 anos de Yahoo ajustado (mesmo loader do F28).
//  Datas de avaliação: último pregão de cada mês em que haja ≥ 10 ativos com 260 pregões de histórico.
//  SCTR: cada componente vira percentil (0–1) dentro do universo naquela data; score = soma ponderada:
//    30% distância da MME200 + 30% retorno de 125 pregões + 15% distância da MME50 + 15% retorno de 20 pregões
//    + 5% inclinação de 3 dias do histograma PPO(12,26,9) + 5% RSI(14).
//  Momentum 12-1: retorno de 252 pregões ignorando os últimos 21.
//  Alvo: excesso = retorno do ativo nos próximos h pregões (h = 20 e 60) − média do universo no mesmo período.
//  Medida: correlação de postos (Spearman, IC) entre ordenador e excesso, por data. Média dos ICs; t e p (unicaudal)
//  calculados só em datas que não se sobrepõem (a cada 1 mês para h=20, a cada 3 meses para h=60).
//  BH (FDR 10%, como o learner) sobre as 4 hipóteses: SCTR/12-1 × h20/h60.
//  APROVAÇÃO de H2: em h=20 E em h=60, (1) IC médio do SCTR > IC médio do 12-1 e (2) SCTR aprovado no BH.
//  Se reprovar: ficar com o momentum 12-1. Também se reporta por regime (SPY acima/abaixo da MM200).
// Uso: node scripts/sctr-study.mjs [--local] [--out=caminho-base]
//  --local lê data/ohlc.json (só ~2 anos): serve para testar o código, NÃO é resultado do estudo.
import { readFile, writeFile } from "node:fs/promises";
import { ASSETS } from "../assets/universe.js";
import { bhPass } from "../assets/learner.js";

const YEARS = 11;
const MACRO = new Set(["VIX", "DXY", "US10Y", "US3M", "WTI", "USDJPY", "USDBRL"]);
const HS = [20, 60];
const args = process.argv.slice(2);
const LOCAL = args.includes("--local");
const OUT = args.find((a) => a.startsWith("--out="))?.slice(6) ?? "";

async function chart(sym) {
  const p2 = Math.floor(Date.now() / 1000);
  const p1 = p2 - YEARS * 365 * 86400;
  const u = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(sym)}?period1=${p1}&period2=${p2}&interval=1d`;
  const j = (await (await fetch(u, { headers: { "User-Agent": "Mozilla/5.0" }, signal: AbortSignal.timeout(20000) })).json()).chart?.result?.[0]; // prettier-ignore
  const q = j?.indicators?.quote?.[0];
  const adj = j?.indicators?.adjclose?.[0]?.adjclose;
  if (!j?.timestamp || !q) throw new Error("sem dados");
  const o = { dates: [], c: [] };
  j.timestamp.forEach((t, i) => {
    const c = q.close[i];
    if (!(c > 0)) return;
    o.dates.push(new Date(t * 1000).toISOString().slice(0, 10));
    o.c.push(adj?.[i] > 0 ? adj[i] : c);
  });
  return o;
}

async function load() {
  const bars = {};
  if (LOCAL) {
    const f = JSON.parse(await readFile(new URL("../data/ohlc.json", import.meta.url), "utf8"));
    for (const [code, b] of Object.entries(f.bars)) {
      if (MACRO.has(code) || !b?.c) continue;
      bars[code] = { dates: f.dates.slice(-b.c.length), c: b.c };
    }
    return bars;
  }
  for (const a of Object.values(ASSETS).filter((x) => !MACRO.has(x.code))) {
    try {
      bars[a.code] = await chart(a.yahoo || a.code);
    } catch {
      /* ativo sem dados fica fora */
    }
  }
  return bars;
}

const ema = (c, n) => {
  const k = 2 / (n + 1);
  const out = [];
  let e = null;
  c.forEach((x, i) => {
    e = e === null ? x : x * k + e * (1 - k);
    out.push(i >= n - 1 ? e : null);
  });
  return out;
};
const sma = (c, n) => {
  const out = [];
  let s = 0;
  c.forEach((x, i) => {
    s += x - (i >= n ? c[i - n] : 0);
    out.push(i >= n - 1 ? s / n : null);
  });
  return out;
};
function rsi(c, n = 14) {
  const out = new Array(c.length).fill(null);
  let up = 0;
  let dn = 0;
  for (let i = 1; i < c.length; i++) {
    const d = c[i] - c[i - 1];
    const u = Math.max(d, 0);
    const w = Math.max(-d, 0);
    if (i <= n) {
      up += u / n;
      dn += w / n;
    } else {
      up = (up * (n - 1) + u) / n;
      dn = (dn * (n - 1) + w) / n;
    }
    if (i >= n) out[i] = dn === 0 ? 100 : 100 - 100 / (1 + up / dn);
  }
  return out;
}

// Indicadores por ativo, indexados pela data.
function features(b) {
  const c = b.c;
  const e200 = ema(c, 200);
  const e50 = ema(c, 50);
  const e12 = ema(c, 12);
  const e26 = ema(c, 26);
  const ppo = c.map((_, i) => (e26[i] ? ((e12[i] - e26[i]) / e26[i]) * 100 : null));
  const firstPpo = ppo.findIndex((x) => x !== null);
  const sig = new Array(c.length).fill(null);
  if (firstPpo >= 0) {
    const s = ema(ppo.slice(firstPpo), 9);
    s.forEach((x, k) => (sig[firstPpo + k] = x));
  }
  const hist = ppo.map((x, i) => (x !== null && sig[i] !== null ? x - sig[i] : null));
  const r14 = rsi(c);
  const idx = new Map(b.dates.map((d, i) => [d, i]));
  const at = (d) => {
    const i = idx.get(d);
    if (i === undefined || i < 260) return null;
    const ret = (n, skip = 0) => c[i - skip] / c[i - n] - 1;
    if (hist[i] === null || hist[i - 3] === null || !e200[i]) return null;
    return {
      i,
      f: {
        d200: c[i] / e200[i] - 1,
        r125: ret(125),
        d50: c[i] / e50[i] - 1,
        r20: ret(20),
        ppo: (hist[i] - hist[i - 3]) / 3,
        rsi: r14[i],
      },
      mom: ret(252, 21),
    };
  };
  const fwd = (i, h) => (i + h < c.length ? c[i + h] / c[i] - 1 : null);
  return { at, fwd };
}

const W = { d200: 0.3, r125: 0.3, d50: 0.15, r20: 0.15, ppo: 0.05, rsi: 0.05 };
const pct = (vals) => {
  const ord = vals.map((v, k) => [v, k]).sort((a, b) => a[0] - b[0]);
  const out = new Array(vals.length);
  ord.forEach(([, k], r) => (out[k] = vals.length > 1 ? r / (vals.length - 1) : 0.5));
  return out;
};
const ranks = (v) => {
  const ord = v.map((x, k) => [x, k]).sort((a, b) => a[0] - b[0]);
  const out = new Array(v.length);
  let r = 0;
  while (r < ord.length) {
    let s = r;
    while (s + 1 < ord.length && ord[s + 1][0] === ord[r][0]) s++;
    for (let k = r; k <= s; k++) out[ord[k][1]] = (r + s) / 2;
    r = s + 1;
  }
  return out;
};
function spearman(x, y) {
  const rx = ranks(x);
  const ry = ranks(y);
  const n = x.length;
  const mx = rx.reduce((a, b) => a + b, 0) / n;
  const my = ry.reduce((a, b) => a + b, 0) / n;
  let sxy = 0;
  let sxx = 0;
  let syy = 0;
  for (let k = 0; k < n; k++) {
    sxy += (rx[k] - mx) * (ry[k] - my);
    sxx += (rx[k] - mx) ** 2;
    syy += (ry[k] - my) ** 2;
  }
  return sxx && syy ? sxy / Math.sqrt(sxx * syy) : null;
}
// p unicaudal (IC > 0) pela normal.
const pOne = (t) => 0.5 * erfc(t / Math.SQRT2);
function erfc(x) {
  const z = Math.abs(x);
  const t = 1 / (1 + 0.5 * z);
  const r = t * Math.exp(-z * z - 1.26551223 + t * (1.00002368 + t * (0.37409196 + t * (0.09678418 + t * (-0.18628806 + t * (0.27886807 + t * (-1.13520398 + t * (1.48851587 + t * (-0.82215223 + t * 0.17087277))))))))); // prettier-ignore
  return x >= 0 ? r : 2 - r;
}
function stats(list) {
  const n = list.length;
  if (n < 3) return { n, mean: null, t: null, p: null };
  const mean = list.reduce((a, b) => a + b, 0) / n;
  const sd = Math.sqrt(list.reduce((a, b) => a + (b - mean) ** 2, 0) / (n - 1));
  const t = sd ? (mean / sd) * Math.sqrt(n) : null;
  return { n, mean, t, p: t === null ? null : pOne(t) };
}

const bars = await load();
const codes = Object.keys(bars).filter((k) => bars[k].c.length > 300);
const F = Object.fromEntries(codes.map((k) => [k, features(bars[k])]));
const spyKey = codes.find((k) => k === "SPY") ?? codes.find((k) => k === "IVV");
const spyMa = spyKey ? sma(bars[spyKey].c, 200) : null;
const spyIdx = spyKey ? new Map(bars[spyKey].dates.map((d, i) => [d, i])) : null;
const regimeOf = (d) => {
  const i = spyIdx?.get(d);
  return i === undefined || !spyMa[i] ? null : bars[spyKey].c[i] > spyMa[i] ? "alta" : "baixa";
};

// Datas: último pregão de cada mês, pela união dos calendários.
const allDates = [...new Set(codes.flatMap((k) => bars[k].dates))].sort();
const monthEnds = allDates.filter((d, i) => i + 1 >= allDates.length || allDates[i + 1].slice(0, 7) !== d.slice(0, 7)); // prettier-ignore

const rows = []; // {d, regime, ic: {sctr20, mom20, sctr60, mom60}, n}
for (const d of monthEnds) {
  const pts = codes.map((k) => ({ k, x: F[k].at(d) })).filter((p) => p.x);
  if (pts.length < 10) continue;
  const comp = Object.keys(W).map((key) => pct(pts.map((p) => p.x.f[key])));
  const sctr = pts.map((_, j) => Object.keys(W).reduce((s, key, c) => s + W[key] * comp[c][j], 0));
  const ic = {};
  for (const h of HS) {
    const fw = pts.map((p) => F[p.k].fwd(p.x.i, h));
    const ok = fw.map((v, j) => (v === null || !Number.isFinite(pts[j].x.mom) ? -1 : j)).filter((j) => j >= 0); // prettier-ignore
    if (ok.length < 10) continue;
    const mean = ok.reduce((s, j) => s + fw[j], 0) / ok.length;
    const ex = ok.map((j) => fw[j] - mean);
    ic[`sctr${h}`] = spearman(
      ok.map((j) => sctr[j]),
      ex,
    );
    ic[`mom${h}`] = spearman(
      ok.map((j) => pts[j].x.mom),
      ex,
    );
  }
  rows.push({ d, regime: regimeOf(d), n: pts.length, ic });
}

const step = { 20: 1, 60: 3 };
function summarize(sub) {
  const out = {};
  for (const h of HS) {
    for (const s of ["sctr", "mom"]) {
      const key = `${s}${h}`;
      const all = sub.map((r) => r.ic[key]).filter(Number.isFinite);
      const nonOv = sub.filter((_, k) => k % step[h] === 0).map((r) => r.ic[key]).filter(Number.isFinite); // prettier-ignore
      const st = stats(nonOv);
      out[key] = { icMedio: all.length ? all.reduce((a, b) => a + b, 0) / all.length : null, datas: all.length, ...st }; // prettier-ignore
    }
    const diff = sub.filter((_, k) => k % step[h] === 0).map((r) => r.ic[`sctr${h}`] - r.ic[`mom${h}`]).filter(Number.isFinite); // prettier-ignore
    out[`dif${h}`] = stats(diff);
  }
  return out;
}

const geral = summarize(rows);
const porRegime = { alta: summarize(rows.filter((r) => r.regime === "alta")), baixa: summarize(rows.filter((r) => r.regime === "baixa")) }; // prettier-ignore
const pass = bhPass(
  HS.flatMap((h) => ["sctr", "mom"].map((s) => [`${s}${h}`, geral[`${s}${h}`].p])),
);
const crit = Object.fromEntries(
  HS.map((h) => [
    `h${h}`,
    { sctrMaiorQue12_1: geral[`sctr${h}`].icMedio > geral[`mom${h}`].icMedio, sctrBH: pass.has(`sctr${h}`), momBH: pass.has(`mom${h}`) }, // prettier-ignore
  ]),
);
const aprovada = HS.every((h) => crit[`h${h}`].sctrMaiorQue12_1 && crit[`h${h}`].sctrBH);

const res = {
  gerado: new Date().toISOString(),
  local: LOCAL,
  ativos: codes.length,
  datas: rows.length,
  periodo: rows.length ? [rows[0].d, rows.at(-1).d] : null,
  geral,
  porRegime,
  veredito: { ...crit, aprovada },
};

const f = (x, d = 3) => (Number.isFinite(x) ? x.toFixed(d) : "—");
const line = (lab, g) =>
  `| ${lab} | ${HS.map((h) => `${f(g[`sctr${h}`].icMedio)} | ${f(g[`mom${h}`].icMedio)} | ${f(g[`dif${h}`].t, 2)}`).join(" | ")} |`; // prettier-ignore
const md = `# Estudo F29: score SCTR (60/30/10) × momentum 12-1

> \`node scripts/sctr-study.mjs\` → \`data/sctr-study.json\`. Regras e critério registrados no cabeçalho do script antes
> de rodar. ${codes.length} ETFs do Pêndulo, ${rows.length} fins de mês${res.periodo ? ` (${res.periodo[0]} a ${res.periodo[1]})` : ""}, Yahoo ajustado.${LOCAL ? " **Rodada local (~2 anos): só teste de código, não é resultado.**" : ""}
> Material educacional; não é recomendação de investimento.

IC = correlação de postos entre o ordenador e o excesso de retorno sobre a média do universo (0 = não ordena; 1 = perfeito).
"t da diferença" > 2 indica SCTR melhor que o 12-1 com folga estatística.

| Amostra | IC SCTR 20d | IC 12-1 20d | t da diferença 20d | IC SCTR 60d | IC 12-1 60d | t da diferença 60d |
|---|---:|---:|---:|---:|---:|---:|
${line("Todos os meses", geral)}
${line("SPY acima da MM200", porRegime.alta)}
${line("SPY abaixo da MM200", porRegime.baixa)}

Significância (datas sem sobreposição, p unicaudal, BH a 10%):

| Hipótese | IC médio | t | p | Aprovada no BH |
|---|---:|---:|---:|---|
${HS.flatMap((h) =>
  ["sctr", "mom"].map((s) => {
    const g = geral[`${s}${h}`];
    return `| ${s === "sctr" ? "SCTR" : "12-1"} em ${h} pregões | ${f(g.mean)} | ${f(g.t, 2)} | ${f(g.p, 4)} | ${pass.has(`${s}${h}`) ? "sim" : "não"} |`;
  }),
).join("\n")}

## Veredito de H2 (critério fixado antes)

${HS.map((h) => `- **${h} pregões:** IC do SCTR > IC do 12-1? ${crit[`h${h}`].sctrMaiorQue12_1 ? "sim" : "não"}; SCTR aprovado no BH? ${crit[`h${h}`].sctrBH ? "sim" : "não"}.`).join("\n")}
- **H2 ${aprovada ? "APROVADA" : "REPROVADA"}.** ${aprovada ? "O SCTR passa a ser o ordenador candidato da camada 2 (em modo sombra)." : "Fica o momentum 12-1 como ordenador da camada 2."}

Aprovar aqui não aplica nada na aba Decisões: só entra em modo sombra (docs/MODELO-UNICO.md, camada 5).
`;

if (!OUT) {
  if (!LOCAL) {
    await writeFile(
      new URL("../data/sctr-study.json", import.meta.url),
      JSON.stringify(res, null, 1),
    );
    await writeFile(new URL("../docs/ESTUDO-SCTR.md", import.meta.url), md);
  }
} else {
  await writeFile(`${OUT}.json`, JSON.stringify(res, null, 1));
  await writeFile(`${OUT}.md`, md);
}
console.log(md);
