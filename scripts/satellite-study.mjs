// F30 (docs/MODELO-UNICO.md, H3/H4): top 20% do momentum 12-1 + regime mensal × "SPY + MM200 mensal" × segurar SPY.
// Pergunta (docs/OBJETIVO.md): escolher ativos (satélite) rende mais por unidade de queda que só proteger o índice?
//
// REGRAS REGISTRADAS ANTES DE RODAR (não alterar depois de ver o resultado; se piorar, reverter):
//  Universo: ETFs do Pêndulo (sem macro), até 10 anos de Yahoo ajustado. Ordenador: momentum 12-1 (H2 reprovou o SCTR).
//  Avaliação no fechamento do último pregão de cada mês; pesos valem a partir do pregão seguinte.
//  Custo 0,05% por perna sobre o giro (soma |Δpeso|). Caixa rende T-bill (^IRX).
//   N  Segurar SPY.
//   P  SPY + MM200 mensal: 100% SPY se o SPY fechou o mês acima da MM200; senão 100% caixa.
//   S  Satélite: se o SPY fechou o mês acima da MM200 (regime LIGADO), pesos iguais entre os ETFs no top 20% do 12-1
//      que também fecharam acima da própria MM200 (exige 273 pregões de histórico e ≥ 10 ativos elegíveis);
//      a parte sem candidato fica em caixa. Regime DESLIGADO: 100% caixa.
//  Métricas: ganho ao ano (CAGR), queda máxima, retorno/queda (CAGR ÷ |queda máx.|), Sharpe, e retorno anualizado
//  nos dias de alta (SPY > MM200 no dia) e de baixa.
//  APROVAÇÃO de H3 (S contra P): (1) retorno/queda de S > o de P nos 10 anos; (2) retorno anualizado de S nos dias de
//  baixa > o de P; (3) retorno anualizado de S nos dias de alta ≥ o de P. H4: o satélite só existe se H3 for aprovada.
//  Se reprovar: núcleo = índice protegido (P), sem satélite.
//
// F32 (H6), registrada em 12/10/2026 ANTES de rodar, no mesmo script (usa as séries de P e S acima):
//   M  Núcleo-satélite 70/30: 70% em P (núcleo protegido) e 30% em S (satélite), rebalanceados no fim de cada mês
//      com custo 0,05% sobre o valor movido entre as partes.
//  APROVAÇÃO de H6: Sharpe de M > Sharpe de P E > Sharpe de S. Se reprovar: só núcleo (P).
//  Pelo MODELO-UNICO, sem H3 aprovada o satélite não existe; a F32 é medida mesmo assim, só para registro.
// Uso: node scripts/satellite-study.mjs [--local] [--out=caminho-base]
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
    return { bars, irx: new Map() };
  }
  for (const a of Object.values(ASSETS).filter((x) => !MACRO.has(x.code))) {
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

const { bars, irx } = await load();
const spyKey = bars.SPY ? "SPY" : "IVV";
if (!bars[spyKey]) throw new Error("sem SPY/IVV");
const spy = bars[spyKey];
const dates = spy.dates; // calendário do SPY
const codes = Object.keys(bars).filter((k) => bars[k].c.length > 300);
const px = {}; // preço por data (null se não negociou)
const ma = {};
const ix = {};
for (const k of codes) {
  const m = sma(bars[k].c, 200);
  ix[k] = new Map(bars[k].dates.map((d, i) => [d, i]));
  px[k] = (d) => (ix[k].has(d) ? bars[k].c[ix[k].get(d)] : null);
  ma[k] = (d) => (ix[k].has(d) ? m[ix[k].get(d)] : null);
}
let lastIrx = 0;
const rfOf = (d) => {
  if (irx.has(d)) lastIrx = irx.get(d);
  return lastIrx / 100 / 252;
};
const mom = (k, d) => {
  const i = ix[k].get(d);
  if (i === undefined || i < 273) return null;
  const c = bars[k].c;
  return c[i - 21] / c[i - 252] - 1;
};
const above = (k, d) => {
  const p = px[k](d);
  const m = ma[k](d);
  return p && m ? p > m : null;
};

function targets(key, d) {
  const on = above(spyKey, d);
  if (key === "N") return { [spyKey]: 1 };
  if (on === null) return null; // sem MM200 ainda: fica como está
  if (key === "P") return on ? { [spyKey]: 1 } : {};
  if (!on) return {};
  const el = codes.map((k) => [k, mom(k, d)]).filter(([, m]) => Number.isFinite(m));
  if (el.length < 10) return null;
  el.sort((a, b) => b[1] - a[1]);
  const top = el.slice(0, Math.max(1, Math.round(el.length * 0.2)));
  const picks = top.filter(([k]) => above(k, d)).map(([k]) => k);
  const w = 1 / top.length; // vaga sem candidato fica em caixa
  return Object.fromEntries(picks.map((k) => [k, w]));
}

const i0 = 273;
function run(key) {
  let w = {}; // pesos atuais
  const rets = [];
  let started = false;
  for (let i = i0; i < dates.length; i++) {
    const d = dates[i];
    const prev = dates[i - 1];
    let r = 0;
    let inv = 0;
    for (const [k, wk] of Object.entries(w)) {
      const a = px[k](prev);
      const b = px[k](d);
      if (a && b) r += wk * (b / a - 1);
      inv += wk;
    }
    r += (1 - inv) * rfOf(d);
    // pesos derivam com o preço (sem rebalancear fora do fim do mês)
    const tot = 1 + r;
    for (const k of Object.keys(w)) {
      const a = px[k](prev);
      const b = px[k](d);
      w[k] = (w[k] * (a && b ? b / a : 1)) / tot;
    }
    const monthEnd = i + 1 >= dates.length || dates[i + 1].slice(0, 7) !== d.slice(0, 7);
    if (monthEnd) {
      const t = targets(key, d);
      if (t) {
        const ks = new Set([...Object.keys(w), ...Object.keys(t)]);
        let turn = 0;
        ks.forEach((k) => (turn += Math.abs((t[k] ?? 0) - (w[k] ?? 0))));
        r -= turn * COST;
        w = { ...t };
        started = true;
      }
    }
    if (started) rets.push({ d, r });
  }
  return rets;
}

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
    const g = above(spyKey, d);
    if (g === true) up.push(r);
    else if (g === false) dn.push(r);
  }
  const n = rets.length;
  const mean = rets.reduce((a, b) => a + b.r, 0) / n;
  const sd = Math.sqrt(rets.reduce((a, b) => a + (b.r - mean) ** 2, 0) / (n - 1));
  const ann = (l) => (l.length ? (l.reduce((a, b) => a + b, 0) / l.length) * 252 : null);
  const cagr = eq ** (252 / n) - 1;
  return {
    cagr,
    dd,
    retDd: dd ? cagr / Math.abs(dd) : null,
    vol: sd * Math.sqrt(252),
    sharpe: sd ? (mean / sd) * Math.sqrt(252) : null,
    annUp: ann(up),
    annDn: ann(dn),
    daysDn: dn.length,
  };
}

const NAMES = {
  N: `Segurar ${spyKey}`,
  P: `${spyKey} + MM200 mensal`,
  S: "Top 20% 12-1 + regime (satélite)",
};
const res = {
  gerado: new Date().toISOString(),
  local: LOCAL,
  ativos: codes.length,
  caixaComTbill: irx.size > 0,
};
res.regras = {};
const series = {};
for (const k of Object.keys(NAMES)) {
  series[k] = run(k);
  res.regras[k] = metrics(series[k]);
}
const s = res.regras.S;
const p = res.regras.P;
res.veredito = {
  retDdMaior: s.retDd > p.retDd,
  baixaMelhor: s.annDn > p.annDn,
  altaNaoPior: s.annUp >= p.annUp,
};
res.veredito.aprovada =
  res.veredito.retDdMaior && res.veredito.baixaMelhor && res.veredito.altaNaoPior;
res.periodo = [dates[i0], dates.at(-1)];

const pc = (x) => (Number.isFinite(x) ? `${(x * 100).toFixed(1)}%` : "—");
const f2 = (x) => (Number.isFinite(x) ? x.toFixed(2) : "—");
const yn = (b) => (b ? "sim" : "não");
const md = `# Estudo F30: satélite (top 20% do 12-1 + regime) × ${spyKey} + MM200 mensal

> \`node scripts/satellite-study.mjs\` → \`data/satellite-study.json\`. Regras e critério registrados no cabeçalho do
> script antes de rodar. ${codes.length} ETFs do Pêndulo, ${res.periodo[0]} a ${res.periodo[1]}, Yahoo ajustado, rebalanceamento
> mensal, custo 0,05% por perna, caixa ${res.caixaComTbill ? "a T-bill (^IRX)" : "a 0% (sem ^IRX)"}.${LOCAL ? " **Rodada local (~2 anos): só teste de código, não é resultado.**" : ""}
> Material educacional; não é recomendação de investimento.

| Regra | Ganho ao ano | Queda máx. | Retorno/queda | Volatilidade | Sharpe | Ano em alta do S&P | Ano em baixa do S&P |
|---|---:|---:|---:|---:|---:|---:|---:|
${Object.entries(NAMES)
  .map(([k, n]) => {
    const m = res.regras[k];
    return `| ${k} ${n} | ${pc(m.cagr)} | ${pc(m.dd)} | ${f2(m.retDd)} | ${pc(m.vol)} | ${f2(m.sharpe)} | ${pc(m.annUp)} | ${pc(m.annDn)} |`;
  })
  .join("\n")}

"Ano em alta/baixa" = retorno médio diário anualizado nos dias em que o ${spyKey} está acima/abaixo da MM200.

## Veredito de H3/H4 (critério fixado antes)

- Retorno/queda do satélite > o do ${spyKey} + MM200? ${yn(res.veredito.retDdMaior)}.
- Melhor nos dias de baixa? ${yn(res.veredito.baixaMelhor)}.
- Não pior nos dias de alta? ${yn(res.veredito.altaNaoPior)}.
- **H3 ${res.veredito.aprovada ? "APROVADA" : "REPROVADA"}.** ${res.veredito.aprovada ? "H4: o satélite pode existir (em modo sombra)." : "H4: sem satélite; o núcleo é o índice protegido pela MM200 mensal."}

Aprovar aqui não aplica nada na aba Decisões: só entra em modo sombra (docs/MODELO-UNICO.md, camada 5).
`;

if (!OUT) {
  if (!LOCAL) {
    await writeFile(
      new URL("../data/satellite-study.json", import.meta.url),
      JSON.stringify(res, null, 1),
    );
    await writeFile(new URL("../docs/ESTUDO-SATELITE.md", import.meta.url), md);
  }
} else {
  await writeFile(`${OUT}.json`, JSON.stringify(res, null, 1));
  await writeFile(`${OUT}.md`, md);
}
console.log(md);

// ---- F32 (H6): núcleo-satélite 70/30 ----
const rP = new Map(series.P.map((x) => [x.d, x.r]));
const rS = new Map(series.S.map((x) => [x.d, x.r]));
const mix = [];
let vc = 0.7;
let vs = 0.3;
const common = series.P.map((x) => x.d).filter((d) => rS.has(d));
common.forEach((d, k) => {
  const before = vc + vs;
  vc *= 1 + rP.get(d);
  vs *= 1 + rS.get(d);
  let after = vc + vs;
  if (k + 1 >= common.length || common[k + 1].slice(0, 7) !== d.slice(0, 7)) {
    const move = Math.abs(vc - 0.7 * after);
    after -= move * COST;
    vc = 0.7 * after;
    vs = 0.3 * after;
  }
  mix.push({ d, r: after / before - 1 });
});
const m6 = metrics(mix);
const v6 = {
  sharpeMaiorQueNucleo: m6.sharpe > p.sharpe,
  sharpeMaiorQueSatelite: m6.sharpe > s.sharpe,
};
v6.aprovada = v6.sharpeMaiorQueNucleo && v6.sharpeMaiorQueSatelite;
const res6 = {
  gerado: res.gerado,
  local: LOCAL,
  periodo: res.periodo,
  regras: { P: p, S: s, M: m6 },
  veredito: v6,
};
const N6 = {
  P: NAMES.P + " (100% núcleo)",
  S: NAMES.S + " (100% satélite)",
  M: "Núcleo-satélite 70/30",
};
const md6 = `# Estudo F32: núcleo-satélite 70/30 × 100% núcleo × 100% satélite

> \`node scripts/satellite-study.mjs\` → \`data/core-satellite-study.json\`. Regras e critério registrados no cabeçalho do
> script antes de rodar. Mesmas séries da F30 (\`docs/ESTUDO-SATELITE.md\`), ${res.periodo[0]} a ${res.periodo[1]}; rebalanceamento
> mensal entre as partes com custo 0,05%.${LOCAL ? " **Rodada local (~2 anos): só teste de código, não é resultado.**" : ""}
> Material educacional; não é recomendação de investimento.

| Regra | Ganho ao ano | Queda máx. | Retorno/queda | Volatilidade | Sharpe |
|---|---:|---:|---:|---:|---:|
${Object.entries(N6)
  .map(([k, n]) => {
    const m = res6.regras[k];
    return `| ${k} ${n} | ${pc(m.cagr)} | ${pc(m.dd)} | ${f2(m.retDd)} | ${pc(m.vol)} | ${f2(m.sharpe)} |`;
  })
  .join("\n")}

## Veredito de H6 (critério fixado antes)

- Sharpe do 70/30 > o do núcleo? ${yn(v6.sharpeMaiorQueNucleo)}.
- Sharpe do 70/30 > o do satélite? ${yn(v6.sharpeMaiorQueSatelite)}.
- **H6 ${v6.aprovada ? "APROVADA" : "REPROVADA"}.** ${v6.aprovada ? "Mas a H3 foi reprovada: pelo MODELO-UNICO o satélite só existe com H3 aprovada; fica registrado, sem efeito." : "Fica só o núcleo."}

Aprovar aqui não aplica nada na aba Decisões: só entra em modo sombra (docs/MODELO-UNICO.md, camada 5).
`;
if (OUT) {
  await writeFile(`${OUT}-f32.json`, JSON.stringify(res6, null, 1));
  await writeFile(`${OUT}-f32.md`, md6);
} else if (!LOCAL) {
  await writeFile(
    new URL("../data/core-satellite-study.json", import.meta.url),
    JSON.stringify(res6, null, 1),
  );
  await writeFile(new URL("../docs/ESTUDO-NUCLEO-SATELITE.md", import.meta.url), md6);
}
console.log(md6);
