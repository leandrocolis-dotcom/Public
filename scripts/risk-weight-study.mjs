// F31 (docs/MODELO-UNICO.md, H5): risco igual por ativo (peso ∝ 1/ATR) × pesos iguais.
// Pergunta (docs/OBJETIVO.md): dividir pelo risco reduz a queda sem custar retorno ajustado?
//
// REGRAS REGISTRADAS ANTES DE RODAR (não alterar depois de ver o resultado; se piorar, reverter):
//  Universo: ETFs do Pêndulo (sem macro), até 10 anos de Yahoo ajustado. Carteira sempre investida em todos os ETFs
//  com ≥ 30 pregões de histórico; rebalanceamento no fechamento do último pregão de cada mês; custo 0,05% por perna
//  sobre o giro (soma |Δpeso|), inclusive a deriva entre rebalanceamentos.
//   Q  Pesos iguais.
//   R  Risco igual: peso ∝ 1 / (ATR20 ÷ fechamento), normalizado para somar 100%.
//  APROVAÇÃO de H5 (R contra Q): Sharpe maior E queda máxima menor (menos negativa), custo de giro incluído.
//  Se reprovar: pesos iguais. Também se reporta por regime (SPY acima/abaixo da MM200).
// Uso: node scripts/risk-weight-study.mjs [--local] [--out=caminho-base]
import { writeFile } from "node:fs/promises";
import { ASSETS } from "../assets/universe.js";
import {
  MACRO,
  chart,
  localBars,
  atr,
  sma,
  isMonthEnd,
  metrics,
  pc,
  f2,
  yn,
} from "./lib/study-data.mjs";

const COST = 0.0005;
const args = process.argv.slice(2);
const LOCAL = args.includes("--local");
const OUT = args.find((a) => a.startsWith("--out="))?.slice(6) ?? "";

let bars = {};
if (LOCAL) bars = await localBars();
else
  for (const a of Object.values(ASSETS).filter((x) => !MACRO.has(x.code))) {
    try {
      bars[a.code] = await chart(a.yahoo || a.code);
    } catch {
      /* ativo sem dados fica fora */
    }
  }
const spyKey = bars.SPY ? "SPY" : "IVV";
const spy = bars[spyKey];
const dates = spy.dates;
const codes = Object.keys(bars).filter((k) => bars[k].c.length > 60);
const ix = {};
const a20 = {};
for (const k of codes) {
  ix[k] = new Map(bars[k].dates.map((d, i) => [d, i]));
  a20[k] = atr(bars[k], 20);
}
const px = (k, d) => (ix[k].has(d) ? bars[k].c[ix[k].get(d)] : null);
const spyMa = sma(spy.c, 200);
const regime = (d) => {
  const i = ix[spyKey].get(d);
  return spyMa[i] ? spy.c[i] > spyMa[i] : null;
};

function targets(key, d) {
  const el = codes.filter((k) => {
    const i = ix[k].get(d);
    return i !== undefined && i >= 30 && a20[k][i];
  });
  if (!el.length) return null;
  const raw = el.map((k) => {
    const i = ix[k].get(d);
    return key === "Q" ? 1 : 1 / (a20[k][i] / bars[k].c[i]);
  });
  const s = raw.reduce((a, b) => a + b, 0);
  return Object.fromEntries(el.map((k, j) => [k, raw[j] / s]));
}

function run(key) {
  let w = {};
  const rets = [];
  for (let i = 1; i < dates.length; i++) {
    const d = dates[i];
    const prev = dates[i - 1];
    let r = 0;
    for (const [k, wk] of Object.entries(w)) {
      const a = px(k, prev);
      const b = px(k, d);
      if (a && b) r += wk * (b / a - 1);
    }
    const tot = 1 + r;
    for (const k of Object.keys(w)) {
      const a = px(k, prev);
      const b = px(k, d);
      w[k] = (w[k] * (a && b ? b / a : 1)) / tot;
    }
    if (isMonthEnd(dates, i)) {
      const t = targets(key, d);
      if (t) {
        const ks = new Set([...Object.keys(w), ...Object.keys(t)]);
        let turn = 0;
        ks.forEach((k) => (turn += Math.abs((t[k] ?? 0) - (w[k] ?? 0))));
        if (rets.length || Object.keys(w).length) r -= turn * COST;
        w = { ...t };
      }
    }
    if (Object.keys(w).length) rets.push({ d, r });
  }
  return rets.slice(1);
}

const NAMES = { Q: "Pesos iguais", R: "Risco igual (peso ∝ 1/ATR)" };
const res = { gerado: new Date().toISOString(), local: LOCAL, ativos: codes.length, regras: {} };
for (const k of Object.keys(NAMES)) res.regras[k] = metrics(run(k), regime);
const q = res.regras.Q;
const r = res.regras.R;
res.veredito = { sharpeMaior: r.sharpe > q.sharpe, quedaMenor: r.dd > q.dd };
res.veredito.aprovada = res.veredito.sharpeMaior && res.veredito.quedaMenor;

const md = `# Estudo F31: risco igual por ativo (peso ∝ 1/ATR) × pesos iguais

> \`node scripts/risk-weight-study.mjs\` → \`data/risk-weight-study.json\`. Regras e critério registrados no cabeçalho do
> script antes de rodar. ${codes.length} ETFs do Pêndulo, até 10 anos (Yahoo ajustado), rebalanceamento mensal, custo
> 0,05% por perna sobre o giro.${LOCAL ? " **Rodada local (~2 anos): só teste de código, não é resultado.**" : ""}
> Material educacional; não é recomendação de investimento.

| Regra | Ganho ao ano | Queda máx. | Retorno/queda | Volatilidade | Sharpe | Ano em alta do S&P | Ano em baixa do S&P |
|---|---:|---:|---:|---:|---:|---:|---:|
${Object.entries(NAMES)
  .map(([k, n]) => {
    const m = res.regras[k];
    return `| ${k} ${n} | ${pc(m.cagr)} | ${pc(m.dd)} | ${f2(m.retDd)} | ${pc(m.vol)} | ${f2(m.sharpe)} | ${pc(m.annUp)} | ${pc(m.annDn)} |`;
  })
  .join("\n")}

## Veredito de H5 (critério fixado antes)

- Sharpe do risco igual maior? ${yn(res.veredito.sharpeMaior)}.
- Queda máxima menor? ${yn(res.veredito.quedaMenor)}.
- **H5 ${res.veredito.aprovada ? "APROVADA" : "REPROVADA"}.** ${res.veredito.aprovada ? "Risco igual vira o tamanho candidato (em modo sombra)." : "Ficam os pesos iguais."}

Aprovar aqui não aplica nada na aba Decisões: só entra em modo sombra (docs/MODELO-UNICO.md, camada 5).
`;

if (OUT) {
  await writeFile(`${OUT}.json`, JSON.stringify(res, null, 1));
  await writeFile(`${OUT}.md`, md);
} else if (!LOCAL) {
  await writeFile(
    new URL("../data/risk-weight-study.json", import.meta.url),
    JSON.stringify(res, null, 1),
  );
  await writeFile(new URL("../docs/ESTUDO-RISCO-IGUAL.md", import.meta.url), md);
}
console.log(md);
