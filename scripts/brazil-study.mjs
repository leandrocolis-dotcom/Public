// F33 (docs/MODELO-UNICO.md, H7): Brasil — H1 (saídas) e H3 (satélite) na B3 com imposto de 15% sobre o ganho na venda.
// Pergunta (docs/OBJETIVO.md): depois do imposto, sair e voltar ainda rende mais que segurar o BOVA11?
//
// REGRAS REGISTRADAS ANTES DE RODAR (não alterar depois de ver o resultado; se piorar, reverter):
//  Universo B3 fixo (o universo do Pêndulo não tem B3): BOVA11, SMAL11, IVVB11, DIVO11, PIBB11 (Yahoo .SA, ajustado),
//  até 10 anos. Calendário e regime pelo BOVA11. Caixa rende CDI (Banco Central, SGS 12). Custo 0,05% por perna.
//  Imposto: 15% sobre o ganho realizado em cada venda (preço médio por ativo), com prejuízo compensado nas vendas
//  seguintes; ETFs de ações não têm isenção de R$ 20 mil. No fim, TODAS as regras (inclusive segurar) liquidam e pagam o
//  imposto, para comparar o dinheiro líquido no bolso.
//   N  Segurar BOVA11.
//   C  Stop fixo 2,5 ATR(20) abaixo da entrada; reentrada no fim do mês se fechar > MM200.
//   D  Catraca (2,5 ATR → máxima desde a entrada − 3 ATR(22), nunca desce); reentrada igual a C.
//   E  BOVA11 + MM200 mensal (sai no fim do mês abaixo da MM200; volta acima).
//   S  Satélite: regime LIGADO (BOVA11 > MM200 no fim do mês) → o ETF do top 20% do momentum 12-1 (1 de 5) se estiver
//      acima da própria MM200; senão, CDI. Rebalanceamento mensal.
//  APROVAÇÃO de H7, por regra: ganho ao ano LÍQUIDO de imposto > o de N (segurar). H7 é aprovada se pelo menos uma regra
//  passar. Se a E reprovar: não recomendar giro mensal na B3.
// Uso: node scripts/brazil-study.mjs [--out=caminho-base]  (sem modo local: o ohlc.json não tem B3)
import { writeFile } from "node:fs/promises";
import { chart, cdi, rateOf, sma, atr, isMonthEnd, metrics, pc, f2 } from "./lib/study-data.mjs";

const COST = 0.0005;
const TAX = 0.15;
const UNI = ["BOVA11", "SMAL11", "IVVB11", "DIVO11", "PIBB11"];
const OUT =
  process.argv
    .slice(2)
    .find((a) => a.startsWith("--out="))
    ?.slice(6) ?? "";

const bars = {};
for (const k of UNI) {
  try {
    bars[k] = await chart(`${k}.SA`);
  } catch {
    /* ativo sem dados fica fora */
  }
}
if (!bars.BOVA11) throw new Error("sem BOVA11");
const cdiMap = await cdi();
const rf = rateOf(cdiMap);
const B = bars.BOVA11;
const dates = B.dates;
const codes = Object.keys(bars);
const ix = {};
const ma = {};
for (const k of codes) {
  ix[k] = new Map(bars[k].dates.map((d, i) => [d, i]));
  ma[k] = sma(bars[k].c, 200);
}
const px = (k, d) => (ix[k].has(d) ? bars[k].c[ix[k].get(d)] : null);
const above = (k, d) => {
  const i = ix[k].get(d);
  return i !== undefined && ma[k][i] ? bars[k].c[i] > ma[k][i] : null;
};
const mom = (k, d) => {
  const i = ix[k].get(d);
  return i !== undefined && i >= 273 ? bars[k].c[i - 21] / bars[k].c[i - 252] - 1 : null;
};
const a20 = atr(B, 20);
const a22 = atr(B, 22);

// Carteira em dinheiro com preço médio e prejuízo a compensar.
function book() {
  return { cash: 1, pos: {}, loss: 0, taxPaid: 0 };
}
function sell(bk, k, frac, taxed) {
  const p = bk.pos[k];
  if (!p || frac <= 0) return;
  const v = p.v * frac;
  const b = p.b * frac;
  let g = v - b;
  let tax = 0;
  if (taxed) {
    if (g > 0) {
      const off = Math.min(g, bk.loss);
      bk.loss -= off;
      g -= off;
      tax = g * TAX;
    } else bk.loss += -g;
  }
  bk.cash += v * (1 - COST) - tax;
  bk.taxPaid += tax;
  p.v -= v;
  p.b -= b;
  if (p.v <= 1e-12) delete bk.pos[k];
}
function buy(bk, k, amt) {
  if (amt <= 0) return;
  const p = (bk.pos[k] ??= { v: 0, b: 0 });
  const net = amt * (1 - COST);
  p.v += net;
  p.b += net;
  bk.cash -= amt;
}
const equity = (bk) => bk.cash + Object.values(bk.pos).reduce((a, p) => a + p.v, 0);

function run(key, taxed) {
  const bk = book();
  const i0 = 273;
  const rets = [];
  let entry = null;
  let hh = null;
  let stop = null;
  const setStop = (i) => {
    entry = B.c[i];
    hh = B.h[i];
    stop = key === "C" || key === "D" ? (a20[i] ? entry - 2.5 * a20[i] : null) : null;
  };
  if (key !== "S") {
    buy(bk, "BOVA11", bk.cash);
    setStop(i0);
  }
  for (let i = i0 + 1; i < dates.length; i++) {
    const d = dates[i];
    const prev = dates[i - 1];
    const before = equity(bk);
    bk.cash *= 1 + rf(d);
    // stop intradiário (C, D) no BOVA11
    let stopped = false;
    if (stop && bk.pos.BOVA11 && B.l[i] <= stop) {
      const exit = Math.min(B.o[i], stop);
      bk.pos.BOVA11.v *= exit / B.c[i - 1];
      sell(bk, "BOVA11", 1, taxed);
      stop = null;
      stopped = true;
    }
    for (const k of Object.keys(bk.pos)) {
      const a = px(k, prev);
      const b = px(k, d);
      if (a && b) bk.pos[k].v *= b / a;
    }
    if (!stopped && bk.pos.BOVA11 && key === "D" && a22[i]) {
      hh = Math.max(hh, B.h[i]);
      stop = Math.max(stop ?? 0, hh - 3 * a22[i]);
    }
    if (isMonthEnd(dates, i) && ma.BOVA11[i]) {
      const on = above("BOVA11", d);
      if (key === "E" || key === "C" || key === "D") {
        if (key === "E" && bk.pos.BOVA11 && !on) sell(bk, "BOVA11", 1, taxed);
        else if (!bk.pos.BOVA11 && on && !stopped) {
          buy(bk, "BOVA11", bk.cash);
          setStop(i);
        }
      } else if (key === "S") {
        let pick = null;
        if (on) {
          const el = codes.map((k) => [k, mom(k, d)]).filter(([, m]) => Number.isFinite(m));
          el.sort((a, b) => b[1] - a[1]);
          const top = el.slice(0, Math.max(1, Math.round(el.length * 0.2)));
          pick = top.find(([k]) => above(k, d))?.[0] ?? null;
        }
        for (const k of Object.keys(bk.pos)) if (k !== pick) sell(bk, k, 1, taxed);
        if (pick && !bk.pos[pick]) buy(bk, pick, bk.cash);
      }
    }
    rets.push({ d, r: equity(bk) / before - 1 });
  }
  // liquidação final (todas as regras)
  const pre = equity(bk);
  for (const k of Object.keys(bk.pos)) sell(bk, k, 1, taxed);
  const last = rets.at(-1);
  last.r = (1 + last.r) * (equity(bk) / pre) - 1;
  return { rets, taxPaid: bk.taxPaid };
}

const NAMES = {
  N: "Segurar BOVA11",
  C: "Stop 2,5 ATR",
  D: "Catraca",
  E: "BOVA11 + MM200 mensal",
  S: "Satélite B3 (top 20% 12-1 + regime)",
};
const regime = (d) => above("BOVA11", d);
const res = { gerado: new Date().toISOString(), ativos: codes, cdiDias: cdiMap.size, periodo: [dates[274], dates.at(-1)], regras: {} }; // prettier-ignore
for (const k of Object.keys(NAMES)) {
  const bruto = run(k, false);
  const liq = run(k, true);
  res.regras[k] = { bruto: metrics(bruto.rets, regime), liquido: metrics(liq.rets, regime), impostoPago: liq.taxPaid }; // prettier-ignore
}
const n = res.regras.N.liquido.cagr;
res.veredito = Object.fromEntries(
  ["C", "D", "E", "S"].map((k) => [k, { vantagemLiquida: res.regras[k].liquido.cagr - n, aprovada: res.regras[k].liquido.cagr > n }]), // prettier-ignore
);
res.veredito.aprovada = ["C", "D", "E", "S"].some((k) => res.veredito[k].aprovada);

const pp = (x) => (Number.isFinite(x) ? `${x >= 0 ? "+" : ""}${(x * 100).toFixed(1)} p.p.` : "—");
const md = `# Estudo F33: Brasil (B3) com imposto de 15% sobre a venda

> \`node scripts/brazil-study.mjs\` → \`data/brazil-study.json\`. Regras e critério registrados no cabeçalho do script antes
> de rodar. ETFs da B3: ${codes.join(", ")} (Yahoo ajustado), ${res.periodo[0]} a ${res.periodo[1]}. Caixa rende CDI
> (${res.cdiDias ? "Banco Central, SGS 12" : "**sem CDI: caixa a 0%**"}). Custo 0,05% por perna. Imposto de 15% sobre o ganho realizado,
> com prejuízo compensado; no fim todas as regras liquidam e pagam o imposto. Material educacional; não é recomendação
> de investimento nem orientação tributária.

| Regra | Ganho ao ano bruto | Ganho ao ano líquido | Queda máx. | Sharpe (líquido) | Ano em alta do BOVA11 | Ano em baixa do BOVA11 | Imposto pago (por R$ 1) |
|---|---:|---:|---:|---:|---:|---:|---:|
${Object.entries(NAMES)
  .map(([k, nm]) => {
    const r = res.regras[k];
    return `| ${k} ${nm} | ${pc(r.bruto.cagr)} | ${pc(r.liquido.cagr)} | ${pc(r.liquido.dd)} | ${f2(r.liquido.sharpe)} | ${pc(r.liquido.annUp)} | ${pc(r.liquido.annDn)} | R$ ${r.impostoPago.toFixed(2)} |`;
  })
  .join("\n")}

"Ano em alta/baixa" = retorno médio diário anualizado nos dias em que o BOVA11 está acima/abaixo da MM200.

## Veredito de H7 (critério fixado antes: ganho líquido de imposto > segurar BOVA11)

${["C", "D", "E", "S"].map((k) => `- **${k} ${NAMES[k]}:** vantagem líquida ${pp(res.veredito[k].vantagemLiquida)} ao ano → ${res.veredito[k].aprovada ? "APROVADA" : "REPROVADA"}.`).join("\n")}
- **H7 ${res.veredito.aprovada ? "APROVADA" : "REPROVADA"}.** ${res.veredito.E.aprovada ? "O giro mensal pela MM200 se paga depois do imposto." : "Não recomendar giro mensal na B3: depois do imposto, a MM200 mensal não bate segurar o BOVA11."}

Aprovar aqui não aplica nada na aba Decisões: só entra em modo sombra (docs/MODELO-UNICO.md, camada 5).
`;

if (OUT) {
  await writeFile(`${OUT}.json`, JSON.stringify(res, null, 1));
  await writeFile(`${OUT}.md`, md);
} else {
  await writeFile(
    new URL("../data/brazil-study.json", import.meta.url),
    JSON.stringify(res, null, 1),
  );
  await writeFile(new URL("../docs/ESTUDO-BRASIL.md", import.meta.url), md);
}
console.log(md);
