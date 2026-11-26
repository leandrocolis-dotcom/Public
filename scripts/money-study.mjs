// D3 (docs/ROADMAP-DINHEIRO.md): H9 volatilidade-alvo, H10 alavancado com filtro de tendência, H11 tendência entre
// classes de ativo. Pergunta (docs/OBJETIVO.md): alguma regra simples bate SEGURAR O SPY em dinheiro e em queda?
//
// REGRAS REGISTRADAS EM 18/11/2026, ANTES DE RODAR (não alterar depois de ver o resultado; se piorar, reverter):
//  Dados: Yahoo ajustado (dividendos reinvestidos), histórico inteiro de cada ETF; o estudo começa no primeiro mês em
//  que TODOS os ativos usados têm 210 pregões (com SSO/DBC/GLD/IEF/EFA isso cai em 2007, cobrindo 2008, 2020 e 2022).
//  Avaliação no fechamento do último pregão do mês; pesos valem a partir do pregão seguinte. Custo 0,05% por perna sobre
//  o giro (soma |Δpeso|). Caixa rende T-bill (^IRX). Só ETFs dos EUA.
//   N   Segurar SPY (régua).
//   P   SPY + MM200 mensal (já estudada; só referência).
//   H9  Volatilidade-alvo: peso no SPY = min(1; 16% ÷ volatilidade realizada dos últimos 21 pregões, anualizada);
//       o resto em caixa. Sem alavancagem.
//   H10 Alavancado com filtro: SPY acima da MM200 E vol. 21 pregões < 20% → 100% SSO (2x S&P); SPY acima da MM200
//       com vol. ≥ 20% → 100% SPY; SPY abaixo da MM200 → 100% caixa. (QLD/QQQ medidos só para registro.)
//   H11 Tendência entre classes (5 partes de 20%): SPY, EFA, IEF, GLD, DBC; cada parte fica no ativo se ele fechou o
//       mês acima da média dos 10 últimos fechamentos mensais, senão vai para caixa.
//  Métricas: ganho ao ano (CAGR), queda máxima, retorno/queda, Sharpe (excesso sobre o caixa), retorno anualizado nos
//  dias de alta (SPY > MM200) e de baixa, e CAGR em 3 períodos (até 2012, 2013–2019, 2020 em diante).
//  APROVAÇÃO (contra N):
//   H9  Sharpe > N E queda máx. menor que a de N E CAGR ≥ CAGR de N − 1 p.p.
//   H10 CAGR > N E queda máx. não pior que a de N E CAGR > N em pelo menos 2 dos 3 períodos.
//   H11 retorno/queda > N E Sharpe > N E queda máx. menor que a de N.
//  SIGNIFICÂNCIA (camada 5 do MODELO-UNICO): bootstrap em blocos de 21 pregões (2.000 sorteios, semente fixa) da
//  diferença do Sharpe (H9, H11) ou do retorno médio diário (H10) contra N; p unilateral; Benjamini-Hochberg a 10%
//  nas três. Critério cumprido + BH → "aprovada: vai para modo sombra". Critério sem BH → "em observação".
//  Reprovada → nada muda. Nada vai para a aba Decisões sem ordem do usuário.
// Uso: node scripts/money-study.mjs [--local] [--out=caminho-base]
//  --local lê data/ohlc.json (só ~2 anos, sem SSO/IEF): serve para testar o código, NÃO é resultado do estudo.
import { readFile, writeFile } from "node:fs/promises";

const COST = 0.0005;
const args = process.argv.slice(2);
const LOCAL = args.includes("--local");
const OUT = args.find((a) => a.startsWith("--out="))?.slice(6) ?? "";
const SYMS = ["SPY", "SSO", "QQQ", "QLD", "EFA", "IEF", "GLD", "DBC"];
const CLASSES = ["SPY", "EFA", "IEF", "GLD", "DBC"];

async function chart(sym) {
  const p2 = Math.floor(Date.now() / 1000);
  const u = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(sym)}?period1=0&period2=${p2}&interval=1d`;
  const j = (await (await fetch(u, { headers: { "User-Agent": "Mozilla/5.0" }, signal: AbortSignal.timeout(30000) })).json()).chart?.result?.[0]; // prettier-ignore
  const q = j?.indicators?.quote?.[0];
  const adj = j?.indicators?.adjclose?.[0]?.adjclose;
  if (!j?.timestamp || !q) throw new Error(`${sym}: sem dados`);
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
  const irx = new Map();
  if (LOCAL) {
    const f = JSON.parse(await readFile(new URL("../data/ohlc.json", import.meta.url), "utf8"));
    for (const s of SYMS) {
      const b = f.bars[s];
      if (b?.c) bars[s] = { dates: f.dates.slice(-b.c.length), c: b.c };
    }
    // sem SSO/QLD/IEF no arquivo local: sintetiza (2x diário; IEF ≈ TLT) só para exercitar o código
    const syn2x = (b) => {
      const c = [100];
      for (let i = 1; i < b.c.length; i++) c.push(c[i - 1] * (1 + 2 * (b.c[i] / b.c[i - 1] - 1)));
      return { dates: b.dates, c };
    };
    bars.SSO ??= syn2x(bars.SPY);
    bars.QLD ??= syn2x(bars.QQQ);
    if (!bars.IEF && f.bars.TLT?.c) bars.IEF = { dates: f.dates.slice(-f.bars.TLT.c.length), c: f.bars.TLT.c }; // prettier-ignore
    return { bars, irx };
  }
  for (const s of SYMS) bars[s] = await chart(s);
  try {
    const r = await chart("^IRX");
    r.dates.forEach((d, i) => irx.set(d, r.c[i]));
  } catch {
    /* sem T-bill: caixa a 0% (declarado) */
  }
  return { bars, irx };
}

const { bars, irx } = await load();
const dates = bars.SPY.dates;
const ix = {};
for (const k of Object.keys(bars)) ix[k] = new Map(bars[k].dates.map((d, i) => [d, i]));
const px = (k, d) => (ix[k]?.has(d) ? bars[k].c[ix[k].get(d)] : null);
const idx = (k, d) => ix[k]?.get(d);
function smaAt(k, d, n) {
  const i = idx(k, d);
  if (i === undefined || i < n - 1) return null;
  let s = 0;
  for (let j = i - n + 1; j <= i; j++) s += bars[k].c[j];
  return s / n;
}
function volAt(k, d, n = 21) {
  const i = idx(k, d);
  if (i === undefined || i < n) return null;
  const c = bars[k].c;
  const r = [];
  for (let j = i - n + 1; j <= i; j++) r.push(c[j] / c[j - 1] - 1);
  const m = r.reduce((a, b) => a + b, 0) / n;
  return Math.sqrt(r.reduce((a, b) => a + (b - m) ** 2, 0) / (n - 1)) * Math.sqrt(252);
}
// média dos 10 últimos fechamentos de fim de mês (inclui o mês atual)
const monthEnds = dates.filter((d, i) => i + 1 >= dates.length || dates[i + 1].slice(0, 7) !== d.slice(0, 7)); // prettier-ignore
function sma10m(k, d) {
  const pos = monthEnds.indexOf(d);
  if (pos < 9) return null;
  const v = monthEnds.slice(pos - 9, pos + 1).map((m) => px(k, m));
  return v.every((x) => x > 0) ? v.reduce((a, b) => a + b, 0) / 10 : null;
}
let lastIrx = 0;
const rfOf = (d) => {
  if (irx.has(d)) lastIrx = irx.get(d);
  return lastIrx / 100 / 252;
};
const spyUp = (d) => {
  const m = smaAt("SPY", d, 200);
  return m ? px("SPY", d) > m : null;
};

// primeiro mês com todos os ativos usados com 210 pregões
const need = ["SPY", "SSO", ...CLASSES];
const startI = dates.findIndex((d) => need.every((k) => (idx(k, d) ?? -1) >= 210) && monthEnds.indexOf(d) >= 9); // prettier-ignore
if (startI < 0) throw new Error("histórico insuficiente");

function targets(key, d) {
  const up = spyUp(d);
  const vol = volAt("SPY", d);
  switch (key) {
    case "N":
      return { SPY: 1 };
    case "P":
      return up ? { SPY: 1 } : {};
    case "H9":
      return vol ? { SPY: Math.min(1, 0.16 / vol) } : null;
    case "H10":
      return up ? (vol < 0.2 ? { SSO: 1 } : { SPY: 1 }) : {};
    case "H10q": {
      const m = smaAt("QQQ", d, 200);
      const v = volAt("QQQ", d);
      if (!m || !v) return null;
      return px("QQQ", d) > m ? (v < 0.25 ? { QLD: 1 } : { QQQ: 1 }) : {};
    }
    case "H11": {
      const w = {};
      for (const k of CLASSES) {
        const m = sma10m(k, d);
        if (m && px(k, d) > m) w[k] = 0.2;
      }
      return w;
    }
  }
  return null;
}

function run(key) {
  let w = {};
  const rets = [];
  let started = false;
  for (let i = startI; i < dates.length; i++) {
    const d = dates[i];
    const prev = dates[i - 1];
    let r = 0;
    let inv = 0;
    for (const [k, wk] of Object.entries(w)) {
      const a = px(k, prev);
      const b = px(k, d);
      if (a && b) r += wk * (b / a - 1);
      inv += wk;
    }
    r += (1 - inv) * rfOf(d);
    const tot = 1 + r;
    for (const k of Object.keys(w)) {
      const a = px(k, prev);
      const b = px(k, d);
      w[k] = (w[k] * (a && b ? b / a : 1)) / tot;
    }
    if (started) rets.push({ d, r, rf: rfOf(d) });
    const monthEnd = i + 1 >= dates.length || dates[i + 1].slice(0, 7) !== d.slice(0, 7);
    if (monthEnd) {
      const t = targets(key, d);
      if (t) {
        const ks = new Set([...Object.keys(w), ...Object.keys(t)]);
        let turn = 0;
        ks.forEach((k) => (turn += Math.abs((t[k] ?? 0) - (w[k] ?? 0))));
        if (started) rets.at(-1).r -= turn * COST;
        w = { ...t };
        started = true;
      }
    }
  }
  return rets;
}

const cagrOf = (l) => {
  if (!l.length) return null;
  const eq = l.reduce((a, x) => a * (1 + x.r), 1);
  return eq ** (252 / l.length) - 1;
};
const sharpeOf = (l) => {
  const ex = l.map((x) => x.r - x.rf);
  const m = ex.reduce((a, b) => a + b, 0) / ex.length;
  const sd = Math.sqrt(ex.reduce((a, b) => a + (b - m) ** 2, 0) / (ex.length - 1));
  return sd ? (m / sd) * Math.sqrt(252) : null;
};
const PERIODS = [
  ["até 2012", (d) => d < "2013-01-01"],
  ["2013–2019", (d) => d >= "2013-01-01" && d < "2020-01-01"],
  ["2020 em diante", (d) => d >= "2020-01-01"],
];
function metrics(rets) {
  let eq = 1;
  let peak = 1;
  let dd = 0;
  const up = [];
  const dn = [];
  for (const { d, r } of rets) {
    eq *= 1 + r;
    peak = Math.max(peak, eq);
    dd = Math.min(dd, eq / peak - 1);
    const g = spyUp(d);
    if (g === true) up.push(r);
    else if (g === false) dn.push(r);
  }
  const n = rets.length;
  const mean = rets.reduce((a, b) => a + b.r, 0) / n;
  const sd = Math.sqrt(rets.reduce((a, b) => a + (b.r - mean) ** 2, 0) / (n - 1));
  const ann = (l) => (l.length ? (l.reduce((a, b) => a + b, 0) / l.length) * 252 : null);
  const cagr = cagrOf(rets);
  return {
    cagr,
    dd,
    retDd: dd ? cagr / Math.abs(dd) : null,
    vol: sd * Math.sqrt(252),
    sharpe: sharpeOf(rets),
    annUp: ann(up),
    annDn: ann(dn),
    periods: PERIODS.map(([, f]) => cagrOf(rets.filter((x) => f(x.d)))),
  };
}

// bootstrap em blocos (pareado), semente fixa
function rng(seed) {
  let s = seed >>> 0;
  return () => (s = (s * 1664525 + 1013904223) >>> 0) / 2 ** 32;
}
function bootP(a, b, stat, reps = 2000, block = 21) {
  const n = Math.min(a.length, b.length);
  const rand = rng(20261118);
  let le = 0;
  for (let k = 0; k < reps; k++) {
    const A = [];
    const B = [];
    while (A.length < n) {
      const s = Math.floor(rand() * (n - block));
      for (let j = s; j < s + block && A.length < n; j++) {
        A.push(a[j]);
        B.push(b[j]);
      }
    }
    if (stat(A) - stat(B) <= 0) le++;
  }
  return le / reps;
}
const meanR = (l) => l.reduce((x, y) => x + y.r, 0) / l.length;

const NAMES = {
  N: "Segurar SPY",
  P: "SPY + MM200 mensal",
  H9: "H9 Volatilidade-alvo 16% (SPY/caixa)",
  H10: "H10 SSO 2x com filtro (MM200 + vol < 20%)",
  H10q: "H10 (registro) QLD 2x com filtro no QQQ",
  H11: "H11 Tendência entre 5 classes (10 meses)",
};
const series = {};
const res = {
  gerado: new Date().toISOString(),
  local: LOCAL,
  caixaComTbill: irx.size > 0,
  regras: {},
};
for (const k of Object.keys(NAMES)) {
  series[k] = run(k);
  res.regras[k] = metrics(series[k]);
}
res.periodo = [series.N[0].d, series.N.at(-1).d];
const N = res.regras.N;
const crit = {
  H9: (m) => m.sharpe > N.sharpe && m.dd > N.dd && m.cagr >= N.cagr - 0.01,
  H10: (m) =>
    m.cagr > N.cagr && m.dd >= N.dd && m.periods.filter((c, i) => c > N.periods[i]).length >= 2,
  H11: (m) => m.retDd > N.retDd && m.sharpe > N.sharpe && m.dd > N.dd,
};
const pv = {
  H9: bootP(series.H9, series.N, sharpeOf),
  H10: bootP(series.H10, series.N, meanR),
  H11: bootP(series.H11, series.N, sharpeOf),
};
// Benjamini-Hochberg a 10%
const order = Object.entries(pv).sort((a, b) => a[1] - b[1]);
let kMax = 0;
order.forEach(([, p], i) => {
  if (p <= ((i + 1) / order.length) * 0.1) kMax = i + 1;
});
const bh = new Set(order.slice(0, kMax).map(([h]) => h));
res.veredito = {};
for (const h of ["H9", "H10", "H11"]) {
  const ok = crit[h](res.regras[h]);
  res.veredito[h] = {
    criterio: ok,
    p: pv[h],
    bh: bh.has(h),
    resultado: ok && bh.has(h) ? "aprovada (modo sombra)" : ok ? "em observação" : "reprovada",
  };
}

const pc = (x) => (Number.isFinite(x) ? `${(x * 100).toFixed(1)}%` : "—");
const f2 = (x) => (Number.isFinite(x) ? x.toFixed(2) : "—");
const md = `# Estudo D3: volatilidade-alvo (H9), alavancado com filtro (H10) e tendência entre classes (H11)

> \`node scripts/money-study.mjs\` → \`data/money-study.json\`. Regras e critério registrados no cabeçalho do script
> antes de rodar (18/11/2026). ${res.periodo[0]} a ${res.periodo[1]}, Yahoo ajustado, rebalanceamento mensal, custo
> 0,05% por perna, caixa ${res.caixaComTbill ? "a T-bill (^IRX)" : "a 0% (sem ^IRX)"}.${LOCAL ? " **Rodada local (~2 anos, SSO/QLD sintéticos): só teste de código, NÃO é resultado.**" : ""}
> Material educacional; não é recomendação de investimento.

| Regra | Ganho ao ano | Queda máx. | Retorno/queda | Vol. | Sharpe | Em alta | Em baixa | ${PERIODS.map((p) => p[0]).join(" | ")} |
|---|---:|---:|---:|---:|---:|---:|---:|${PERIODS.map(() => "---:").join("|")}|
${Object.entries(NAMES)
  .map(([k, n]) => {
    const m = res.regras[k];
    return `| ${n} | ${pc(m.cagr)} | ${pc(m.dd)} | ${f2(m.retDd)} | ${pc(m.vol)} | ${f2(m.sharpe)} | ${pc(m.annUp)} | ${pc(m.annDn)} | ${m.periods.map(pc).join(" | ")} |`;
  })
  .join("\n")}

"Em alta/baixa" = retorno médio diário anualizado nos dias em que o SPY está acima/abaixo da MM200. Sharpe sobre o caixa.

## Veredito (critério fixado antes)

| Hipótese | Critério cumprido? | p (bootstrap) | Passa no BH 10%? | Resultado |
|---|---|---:|---|---|
${["H9", "H10", "H11"]
  .map((h) => {
    const v = res.veredito[h];
    return `| ${NAMES[h]} | ${v.criterio ? "sim" : "não"} | ${f2(v.p)} | ${v.bh ? "sim" : "não"} | **${v.resultado}** |`;
  })
  .join("\n")}

- H9: Sharpe > segurar, queda menor e no máximo 1 p.p. a menos ao ano.
- H10: ganhar mais que segurar, sem queda pior, e ganhar em pelo menos 2 dos 3 períodos.
- H11: retorno/queda e Sharpe maiores e queda menor que segurar.

Aprovar aqui não aplica nada na aba Decisões: só entra em modo sombra. Alavancado (H10) perde valor em mercado lateral
e volátil (decaimento diário); o filtro de volatilidade existe para isso, mas um tombo de um dia (ex.: 2020) pega a
posição cheia antes do fim do mês.
`;

if (OUT) {
  await writeFile(`${OUT}.json`, JSON.stringify(res, null, 1));
  await writeFile(`${OUT}.md`, md);
} else if (!LOCAL) {
  await writeFile(
    new URL("../data/money-study.json", import.meta.url),
    JSON.stringify(res, null, 1),
  );
  await writeFile(new URL("../docs/ESTUDO-DINHEIRO.md", import.meta.url), md);
}
console.log(md);
