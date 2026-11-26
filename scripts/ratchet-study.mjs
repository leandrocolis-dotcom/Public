// F28 (docs/MODELO-UNICO.md, H1): catraca + MM200 mensal do ativo × stop fixo de 8% × segurar.
// Pergunta (docs/OBJETIVO.md): para quem JÁ está alocado, qual regra de saída evita mais perda sem abrir mão do retorno?
//
// REGRAS REGISTRADAS ANTES DE RODAR (não alterar depois de ver o resultado; se piorar, reverter):
//  Universo: ETFs do Pêndulo com mais de 400 pregões (sem macro), 10 anos de Yahoo ajustado, comprados no 1º dia e
//  mantidos por regra. Custo 0,05% por perna. Caixa rende T-bill (^IRX). Sinais pelo fechamento; stop executado em
//  min(abertura, stop) quando a mínima do dia o toca; entradas/saídas mensais no fechamento do último pregão do mês.
//  Reentrada (todas as variantes com saída): no fim do mês, se fechamento > MM200 do ativo.
//   A  Segurar.
//   B  Stop fixo de 8% abaixo do preço de entrada.
//   C  Stop fixo de 2,5 ATR(20) abaixo da entrada (sem catraca).
//   D  Catraca: stop inicial 2,5 ATR(20); depois stop = max(stop, máxima desde a entrada − 3 ATR(22)); nunca desce.
//   E  Só MM200 mensal do ativo (sai no fim do mês se fechar abaixo da MM200).
//   F  D + E.
//  APROVAÇÃO de H1 (D ou F contra B, a referência "stop fixo"): na carteira de pesos iguais (1) queda máxima menor
//  que a de B, (2) ganho ao ano ≥ o de B − 1 p.p., (3) em pelo menos 60% dos ativos a queda máxima não é pior que a de B.
//  Se reprovar: manter o stop fixo de 2,5 ATR já usado no simulador (C). Também se reporta contra A (segurar).
// Uso: node scripts/ratchet-study.mjs [--local] [--out=caminho-base]
//  --local lê data/ohlc.json (só ~2 anos): serve para testar o código, NÃO é resultado do estudo.
import { readFile, writeFile } from "node:fs/promises";
import { ASSETS } from "../assets/universe.js";

const COST = 0.0005;
const YEARS = 11;
const MACRO = new Set(["VIX", "DXY", "US10Y", "US3M", "WTI", "USDJPY", "USDBRL"]);
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
  const o = { dates: [], o: [], h: [], l: [], c: [] };
  j.timestamp.forEach((t, i) => {
    const c = q.close[i];
    if (!(c > 0) || !(q.high[i] > 0) || !(q.low[i] > 0)) return;
    const f = adj?.[i] > 0 ? adj[i] / c : 1;
    o.dates.push(new Date(t * 1000).toISOString().slice(0, 10));
    o.o.push((q.open[i] || c) * f);
    o.h.push(q.high[i] * f);
    o.l.push(q.low[i] * f);
    o.c.push(c * f);
  });
  return o;
}

async function load() {
  const bars = {};
  if (LOCAL) {
    const f = JSON.parse(await readFile(new URL("../data/ohlc.json", import.meta.url), "utf8"));
    for (const [code, b] of Object.entries(f.bars)) {
      if (MACRO.has(code) || !b?.c) continue;
      bars[code] = { dates: f.dates.slice(-b.c.length), o: b.o, h: b.h, l: b.l, c: b.c };
    }
    return { bars, irx: new Map() };
  }
  const codes = Object.values(ASSETS).filter((a) => !MACRO.has(a.code));
  for (const a of codes) {
    try {
      bars[a.code] = await chart(a.yahoo || a.code);
    } catch {
      /* ativo sem dados fica fora */
    }
  }
  const irx = new Map();
  try {
    const r = await chart("^IRX");
    r.dates.forEach((d, i) => irx.set(d, r.c[i]));
  } catch {
    /* sem T-bill: caixa a 0% (declarado no relatório) */
  }
  return { bars, irx };
}

const sma = (c, n) => {
  const out = [];
  let s = 0;
  c.forEach((x, i) => {
    s += x - (i >= n ? c[i - n] : 0);
    out.push(i >= n - 1 ? s / n : null);
  });
  return out;
};
function atr(b, n) {
  const out = new Array(b.c.length).fill(null);
  let a = null;
  for (let i = 1; i < b.c.length; i++) {
    const tr = Math.max(
      b.h[i] - b.l[i],
      Math.abs(b.h[i] - b.c[i - 1]),
      Math.abs(b.l[i] - b.c[i - 1]),
    );
    if (i < n) a = (a ?? 0) + tr / n;
    else a = (a * (n - 1) + tr) / n;
    if (i >= n - 1) out[i] = a;
  }
  return out;
}

const RULES = {
  A: { name: "Segurar" },
  B: { name: "Stop fixo 8%", stop: "pct8" },
  C: { name: "Stop fixo 2,5 ATR", stop: "atr25" },
  D: { name: "Catraca (2,5 ATR → 3 ATR da máxima)", stop: "ratchet" },
  E: { name: "Só MM200 mensal", ma: true },
  F: { name: "Catraca + MM200 mensal", stop: "ratchet", ma: true },
};

// Simula uma regra em um ativo. Devolve retornos diários {d, r} a partir de i0 e estatísticas.
function sim(b, key, rfOf) {
  const rule = RULES[key];
  const n = b.c.length;
  const ma = sma(b.c, 200);
  const a20 = atr(b, 20);
  const a22 = atr(b, 22);
  const i0 = 210;
  if (n < i0 + 60) return null;
  const monthEnd = (i) => i + 1 >= n || b.dates[i + 1].slice(0, 7) !== b.dates[i].slice(0, 7);
  let inMkt = true;
  let entry = b.c[i0];
  let hh = b.h[i0];
  let stop = null;
  const setStop = (i) => {
    if (rule.stop === "pct8") stop = entry * 0.92;
    else if (rule.stop === "atr25" || rule.stop === "ratchet")
      stop = a20[i] ? entry - 2.5 * a20[i] : null;
    else stop = null;
  };
  setStop(i0);
  const rets = [];
  let days = 0;
  let exits = 0;
  for (let i = i0 + 1; i < n; i++) {
    let r = 0;
    if (inMkt) {
      days++;
      if (stop && b.l[i] <= stop) {
        r = Math.min(b.o[i], stop) / b.c[i - 1] - 1 - COST;
        inMkt = false;
        exits++;
      } else {
        r = b.c[i] / b.c[i - 1] - 1;
        hh = Math.max(hh, b.h[i]);
        if (rule.stop === "ratchet" && a22[i]) stop = Math.max(stop ?? 0, hh - 3 * a22[i]);
      }
    } else r = rfOf(b.dates[i]);
    if (monthEnd(i) && ma[i]) {
      if (inMkt && rule.ma && b.c[i] < ma[i]) {
        r -= COST;
        inMkt = false;
        exits++;
      } else if (!inMkt && (rule.ma || rule.stop) && b.c[i] > ma[i]) {
        r -= COST;
        inMkt = true;
        entry = b.c[i];
        hh = b.h[i];
        setStop(i);
      }
    }
    rets.push({ d: b.dates[i], r });
  }
  return { rets, inMktPct: days / (n - i0 - 1), exits };
}

function stats(rs) {
  let eq = 1;
  let peak = 1;
  let dd = 0;
  let s = 0;
  let s2 = 0;
  for (const r of rs) {
    eq *= 1 + r;
    peak = Math.max(peak, eq);
    dd = Math.min(dd, eq / peak - 1);
    s += r;
    s2 += r * r;
  }
  const m = s / rs.length;
  const sd = Math.sqrt(Math.max(0, s2 / rs.length - m * m));
  return {
    cagr: eq ** (252 / rs.length) - 1,
    dd,
    vol: sd * Math.sqrt(252),
    sharpe: sd ? (m / sd) * Math.sqrt(252) : 0,
  };
}

const { bars, irx } = await load();
const spy = bars.SPY;
const spyMa = sma(spy.c, 200);
const bull = new Map(spy.dates.map((d, i) => [d, spyMa[i] ? spy.c[i] > spyMa[i] : null]));
let last = 0;
const rfOf = (d) => {
  if (irx.has(d)) last = irx.get(d) / 100 / 252;
  return last;
};
const syms = Object.keys(bars).filter((s) => bars[s].c.length > 400);
console.log(
  `${syms.length} ativos · ${LOCAL ? "LOCAL (teste de código, não é resultado)" : "Yahoo 10 anos"}`,
);

const per = {};
const port = {};
for (const k of Object.keys(RULES)) {
  per[k] = {};
  const byDate = new Map();
  for (const s of syms) {
    const o = sim(bars[s], k, rfOf);
    if (!o) continue;
    per[k][s] = { ...stats(o.rets.map((x) => x.r)), inMkt: o.inMktPct, exits: o.exits };
    for (const x of o.rets) {
      const t = byDate.get(x.d) ?? [0, 0];
      t[0] += x.r;
      t[1]++;
      byDate.set(x.d, t);
    }
  }
  const dates = [...byDate.keys()].sort();
  const daily = dates.map((d) => byDate.get(d)[0] / byDate.get(d)[1]);
  const st = stats(daily);
  const reg = { up: [], dn: [] };
  dates.forEach((d, i) => {
    const g = bull.get(d);
    if (g === true) reg.up.push(daily[i]);
    else if (g === false) reg.dn.push(daily[i]);
  });
  const ann = (xs) => (xs.length ? (xs.reduce((a, b) => a + b, 0) / xs.length) * 252 : null);
  port[k] = { ...st, annUp: ann(reg.up), annDn: ann(reg.dn), daysDn: reg.dn.length };
}

const names = Object.keys(per.A).filter((s) => ["B", "C", "D", "E", "F"].every((k) => per[k][s]));
const mean = (xs) => xs.reduce((a, b) => a + b, 0) / xs.length;
const cmp = (k, ref) => ({
  ddNotWorse: names.filter((s) => per[k][s].dd >= per[ref][s].dd - 1e-9).length / names.length,
  retBeats: names.filter((s) => per[k][s].cagr >= per[ref][s].cagr).length / names.length,
  avgCagr: mean(names.map((s) => per[k][s].cagr)),
  avgDd: mean(names.map((s) => per[k][s].dd)),
  avgExits: mean(names.map((s) => per[k][s].exits)),
  avgInMkt: mean(names.map((s) => per[k][s].inMkt)),
});
const summary = Object.fromEntries(
  Object.keys(RULES).map((k) => [k, { vsB: cmp(k, "B"), vsA: cmp(k, "A") }]),
);

const verdict = {};
for (const k of ["D", "F"]) {
  const p = port[k];
  const b = port.B;
  verdict[k] = {
    quedaMenorQueB: p.dd > b.dd,
    ganhoNoMax1ppAbaixoDeB: p.cagr >= b.cagr - 0.01,
    ativosNaoPiorQueB: summary[k].vsB.ddNotWorse,
    aprovada: p.dd > b.dd && p.cagr >= b.cagr - 0.01 && summary[k].vsB.ddNotWorse >= 0.6,
  };
}

const res = { gerado: new Date().toISOString(), local: LOCAL, ativos: names.length, carteira: port, resumoPorAtivo: summary, veredito: verdict, caixaComTbill: irx.size > 0 }; // prettier-ignore
const pct = (x, d = 1) => (x == null ? "–" : `${(x * 100).toFixed(d)}%`);
const lines = Object.entries(RULES).map(([k, r]) => {
  const p = port[k];
  const s = summary[k];
  return `| ${k} ${r.name} | ${pct(p.cagr)} | ${pct(p.vol)} | ${p.sharpe.toFixed(2)} | ${pct(p.dd)} | ${pct(p.annUp)} | ${pct(p.annDn)} | ${pct(s.vsA.avgDd)} | ${pct(s.vsA.avgInMkt, 0)} | ${s.vsA.avgExits.toFixed(1)} |`;
});
const md = `# Estudo F28: catraca + MM200 mensal × stop fixo × segurar

> \`node scripts/ratchet-study.mjs\` → \`data/ratchet-study.json\`. Regras e critério de aprovação registrados no cabeçalho do
> script antes de rodar. ${names.length} ETFs do Pêndulo, até 10 anos (Yahoo ajustado), carteira de pesos iguais,
> custo 0,05% por perna, caixa ${irx.size ? "a T-bill (^IRX)" : "a 0% (sem ^IRX)"}. Material educacional; não é recomendação de investimento.
${LOCAL ? "\n> **ATENÇÃO: execução local de teste do código (≈2 anos). Não é o resultado do estudo.**\n" : ""}
| Regra | Ganho ao ano | Volatilidade | Sharpe | Queda máx. da carteira | Ano em alta do S&P | Ano em baixa do S&P | Queda máx. média por ativo | Tempo no mercado | Saídas por ativo |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|
${lines.join("\n")}

"Ano em alta/baixa" = retorno médio diário anualizado nos dias em que o SPY está acima/abaixo da MM200.

## Veredito de H1 (critério fixado antes)

${["D", "F"].map((k) => `- **${k} (${RULES[k].name}) × B (stop fixo 8%):** queda menor que B? ${verdict[k].quedaMenorQueB ? "sim" : "não"}; ganho ≥ B − 1 p.p.? ${verdict[k].ganhoNoMax1ppAbaixoDeB ? "sim" : "não"}; ativos com queda não pior que B: ${pct(verdict[k].ativosNaoPiorQueB, 0)} (mínimo 60%). **${verdict[k].aprovada ? "APROVADA" : "REPROVADA"}.**`).join("\n")}

Se reprovar, mantém-se o stop fixo de 2,5 ATR (C), já usado no simulador. Aprovar aqui não aplica nada na aba Decisões:
só entra em modo sombra (docs/MODELO-UNICO.md, camada 5).
`;
if (!OUT) {
  await writeFile(
    new URL("../data/ratchet-study.json", import.meta.url),
    JSON.stringify(res, null, 1),
  );
  await writeFile(new URL("../docs/ESTUDO-CATRACA.md", import.meta.url), md);
} else {
  await writeFile(`${OUT}.json`, JSON.stringify(res, null, 1));
  await writeFile(`${OUT}.md`, md);
}
console.log(md);
