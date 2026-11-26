// Análise integrada por ticker (aba "Análise"): técnico + momentum + fundamentos + analistas -> nota 0-100 e escala.
// Funções puras. Teoria e pesos: docs/ROADMAP-ANALISE.md e docs/ANALISE-FUNDAMENTALISTA.md.
import { decSep } from "./format.js";
import { analyzeDaily, nyParts, sessionInfo } from "./ta-signals.js";
import { momentumOf, rsi14 } from "./engine.js";
import { interp } from "./fa.js";
import { isLeveraged } from "./portfolio.js";
import {
  bondEtfFund,
  equityEtfFund,
  etfClass,
  goldFund,
  leverageOf,
  leveragedFund,
} from "./etf-fund.js";

export const WEIGHTS = { tech: 0.3, mom: 0.25, fund: 0.35, analyst: 0.1 };
export const PILLARS = {
  tech: "Técnico",
  mom: "Momentum",
  fund: "Fundamentos",
  analyst: "Analistas",
};

export const SCALE = [
  { min: 75, key: "strong-buy", label: "Nota muito favorável", tone: "buy" },
  { min: 60, key: "buy", label: "Nota favorável", tone: "buy" },
  { min: 40, key: "hold", label: "Nota neutra", tone: "wait" },
  { min: 25, key: "reduce", label: "Nota desfavorável", tone: "sell" },
  { min: -Infinity, key: "sell", label: "Nota muito desfavorável", tone: "sell" },
];
export const scaleOf = (score) =>
  Number.isFinite(score) ? SCALE.find((s) => score >= s.min) : null;

const avg = (xs) => {
  const v = xs.filter(Number.isFinite);
  return v.length ? v.reduce((a, b) => a + b, 0) / v.length : null;
};
const pct = (x, d = 1) => `${(x * 100).toFixed(d).replace(".", decSep())}%`;
const n1 = (x, d = 1) => x.toFixed(d).replace(".", decSep());

/** O último candle é o pregão de HOJE ainda em andamento? (mesma regra da aba Quando entrar) */
export function lastBarPartial(bars, nowSec = Date.now() / 1000) {
  const { date, min } = nyParts(nowSec);
  const info = sessionInfo(date);
  return bars?.dates?.at(-1) === date && info.open && min >= 570 && min < info.closeMin;
}

/** Técnico: placar diário de ta-signals (−100..+100) -> 0..100, com o plano de entrada/saída. */
export function techPillar(bars, nowSec = Date.now() / 1000) {
  if (!bars?.c?.length || bars.c.length < 210)
    return {
      score: null,
      reasons: ["Histórico curto para a análise gráfica (precisa de ~10 meses)."],
    };
  // dia em andamento é tratado como parcial (volume e fechamento ainda incompletos), como em Quando entrar
  const a = analyzeDaily(bars, { partialLast: lastBarPartial(bars, nowSec) });
  if (!a) return { score: null, reasons: ["Análise gráfica indisponível."] };
  const force = (v) => v.w * Math.abs(v.dir);
  const top = (sign) =>
    a.votes
      .filter((v) => Math.sign(v.dir) === sign)
      .sort((x, y) => force(y) - force(x))
      .slice(0, 2);
  const pros = top(1);
  const cons = top(-1);
  return {
    score: (a.score + 100) / 2,
    raw: a.score,
    verdict: a.verdict.label,
    plan: a.plan,
    price: a.price,
    confidence: a.confidence,
    atr: a.atr,
    levels: a.struct?.levels ?? null,
    reasons: [
      `Placar gráfico ${a.score > 0 ? "+" : ""}${a.score} (${a.verdict.label}).`,
      ...pros.map((v) => `A favor: ${v.title}.`),
      ...cons.map((v) => `Contra: ${v.title}.`),
    ],
  };
}

const sma = (c, w) => (c.length >= w ? c.slice(-w).reduce((a, b) => a + b, 0) / w : null);
const ret = (c, k) => (c.length > k ? c.at(-1) / c.at(-1 - k) - 1 : null);

/** Momentum: mesma fórmula do Pêndulo (preço vs. MM50/MM200, retornos 1/3/6 meses, RSI). */
export function momPillar(bars) {
  const c = bars?.c ?? [];
  if (c.length < 200)
    return { score: null, reasons: ["Histórico curto para o momentum (precisa de 200 pregões)."] };
  const m = {
    p: c.at(-1),
    ma50: sma(c, 50),
    ma200: sma(c, 200),
    r1m: ret(c, 21),
    r3m: ret(c, 63),
    r6m: ret(c, 126),
    rsi: rsi14(c),
  };
  const r12 = ret(c, 252);
  return {
    score: momentumOf(m),
    m: { ...m, r12 },
    reasons: [
      `Preço ${m.p > m.ma200 ? "acima" : "abaixo"} da média de 200 dias e ${m.p > m.ma50 ? "acima" : "abaixo"} da de 50.`,
      `Retornos: 1m ${pct(m.r1m)} · 3m ${pct(m.r3m)} · 6m ${pct(m.r6m)}${r12 === null ? "" : ` · 12m ${pct(r12)}`}.`,
      `RSI ${Math.round(m.rsi)}${m.rsi > 70 ? " (esticado)" : m.rsi < 30 ? " (sobrevendido)" : ""}.`,
    ],
  };
}

/** Fundamentos de ações: valor + qualidade + crescimento, por faixas fixas (sem histórico por ativo). */
function stockFund(f) {
  const reasons = [];
  const pe = f.fpe > 0 ? f.fpe : f.pe > 0 ? f.pe : null;
  const ey = pe ? 100 / pe : null;
  const fcfY = f.fcf && f.marketCap ? (100 * f.fcf) / f.marketCap : null;
  const value = avg([
    ey === null ? (f.pe !== null || f.fpe !== null ? 10 : null) : interp([[0, 10], [3, 25], [5, 50], [8, 80], [12, 95]], ey),
    f.peg > 0 ? interp([[0.5, 90], [1, 75], [2, 45], [3, 20]], f.peg) : null,
    fcfY === null ? null : interp([[-2, 5], [0, 15], [2, 40], [4, 65], [7, 90]], fcfY),
  ]); // prettier-ignore
  if (pe)
    reasons.push(
      `P/L ${f.fpe > 0 ? "futuro" : "passado"} ${n1(pe)} (rendimento do lucro ${n1(ey)}%): ${ey >= 6 ? "barato" : ey >= 4 ? "razoável" : "caro"}.`,
    );
  else if (f.pe !== null || f.fpe !== null)
    reasons.push("Lucro negativo: P/L não se aplica (pesa contra).");
  if (fcfY !== null) reasons.push(`Fluxo de caixa livre de ${n1(fcfY)}% do valor de mercado.`);
  const quality = avg([
    f.roe === null ? null : interp([[0, 15], [0.1, 50], [0.2, 80], [0.35, 95]], f.roe),
    f.margin === null ? null : interp([[-0.1, 5], [0, 15], [0.1, 50], [0.2, 75], [0.3, 90]], f.margin),
    f.debtEq === null ? null : interp([[30, 85], [100, 60], [200, 30], [400, 10]], f.debtEq),
  ]); // prettier-ignore
  if (f.roe !== null)
    reasons.push(
      `ROE ${pct(f.roe, 0)} e margem líquida ${f.margin === null ? "–" : pct(f.margin, 0)}.`,
    );
  if (f.debtEq !== null)
    reasons.push(`Dívida/patrimônio ${Math.round(f.debtEq)}%${f.debtEq > 200 ? " (alta)" : ""}.`);
  const growth = avg([
    f.revGrowth === null ? null : interp([[-0.1, 10], [0, 35], [0.1, 65], [0.25, 90]], f.revGrowth),
    f.epsGrowth === null ? null : interp([[-0.2, 10], [0, 35], [0.15, 65], [0.3, 90]], f.epsGrowth),
  ]); // prettier-ignore
  if (f.revGrowth !== null)
    reasons.push(
      `Crescimento: receita ${pct(f.revGrowth, 0)}${f.epsGrowth === null ? "" : `, lucro ${pct(f.epsGrowth, 0)}`} (12 meses).`,
    );
  return { score: avg([value, quality, growth]), parts: { value, quality, growth }, reasons };
}

/** Junta o look-through do Yahoo (P/L da carteira) com a média ponderada das maiores posições. */
function withBasket(look, bk) {
  if (!bk) return look;
  if (!look) {
    return { score: bk.score, parts: { basket: bk.score }, conf: "Média", basis: "média ponderada das maiores posições", reasons: bk.reasons }; // prettier-ignore
  }
  return {
    ...look,
    score: (look.score ?? bk.score) * 0.5 + bk.score * 0.5,
    parts: { ...look.parts, basket: bk.score },
    basis: "carteira do fundo e média ponderada das maiores posições",
    reasons: [...look.reasons, ...bk.reasons],
  };
}

/**
 * Fundamentos de ETFs por classe (assets/etf-fund.js): ações pela carteira do fundo, alavancados pelo ativo de
 * referência menos o custo de carregar, renda fixa por taxa/duration/juro real, ouro pelo juro real.
 * ctx = { sym, bars, under: { sym, fund }, macro: { cash, y10, y30, real10 } } (api/analyze).
 */
function etfFund(
  f,
  spyPe,
  { sym = "", bars = null, under = null, macro = null, basket = null } = {},
) {
  // prettier-ignore
  const none = (why) => ({ score: null, reasons: [`${why} Avaliado só por técnico e momentum.`] });
  const lv = leverageOf(sym, f.name);
  let p;
  if (lv) {
    const uf = under?.sym === lv.under ? under.fund : null;
    if (!uf)
      return none(`Alavancado/inverso de ${lv.under}: fundamentos de ${lv.under} indisponíveis.`);
    const up = etfClass(uf, lv.under)
      ? etfFund(uf, spyPe, { sym: lv.under, macro, basket: under.basket })
      : stockFund(uf);
    p = leveragedFund(lv, lv.under, up, volOf(bars), f.expense);
    if (!p) return none(`Alavancado/inverso de ${lv.under}: ${lv.under} sem nota de fundamentos.`);
  } else {
    const cls = etfClass(f, sym);
    p =
      cls === "bond"
        ? bondEtfFund(f, sym, macro)
        : cls === "gold"
          ? goldFund(macro)
          : cls === "equity"
            ? withBasket(equityEtfFund(f, spyPe), basketFund(basket))
            : null;
    if (!p)
      return none(
        cls === "commodity"
          ? "Commodity sem fluxo de caixa: o retorno depende da curva de futuros e do ciclo, sem dado gratuito confiável."
          : cls === "vol"
            ? "ETF de volatilidade: não tem fundamento, só serve para operar curtíssimo prazo."
            : cls === "bond"
              ? "Renda fixa sem taxa de juros disponível agora."
              : cls === "gold"
                ? "Juro real indisponível agora."
                : "ETF sem P/L da carteira (dado ausente).",
      );
  }
  if (f.expense > 0.0075)
    p.reasons.push(`Taxa de administração alta (${pct(f.expense, 2)} ao ano).`);
  return p;
}

export function fundPillar(f, spyPe = 25, ctx = {}) {
  // alavancado conhecido: avalia pelo ativo de referência mesmo sem o resumo do próprio ETF
  if (!f && leverageOf(ctx.sym, "")) return etfFund({ type: "ETF", name: ctx.sym }, spyPe, ctx);
  if (!f) return { score: null, reasons: ["Fundamentos indisponíveis para este ticker."] };
  const isEtf = f.type === "ETF" || f.type === "MUTUALFUND" || leverageOf(ctx.sym, f.name);
  return isEtf ? etfFund(f, spyPe, ctx) : stockFund(f);
}

/**
 * Média ponderada pelos pesos das maiores posições de uma cesta (basket = [{ sym, w, fund }]).
 * Devolve { score, share, n, reasons } ou null quando as posições cobrem menos de 25% do fundo.
 */
export function basketFund(basket) {
  const rows = (basket ?? [])
    .map((b) => ({ ...b, p: b.fund ? stockFund(b.fund) : null }))
    .filter((b) => Number.isFinite(b.p?.score) && b.w > 0);
  const share = rows.reduce((a, b) => a + b.w, 0);
  if (share < 0.25) return null;
  const score = rows.reduce((a, b) => a + b.p.score * b.w, 0) / share;
  const top = [...rows].sort((a, b) => b.w - a.w).slice(0, 4);
  return {
    score,
    share,
    n: rows.length,
    reasons: [
      `Média ponderada das ${rows.length} maiores posições (${pct(share, 0)} do fundo): nota ${Math.round(score)}/100. Maiores: ${top.map((b) => `${b.sym} ${pct(b.w, 0)} (${Math.round(b.p.score)})`).join(", ")}.`,
    ],
  };
}

/** Analistas da cesta: potencial e recomendação médios ponderados pelo peso de cada posição. */
export function basketAnalysts(basket) {
  const rows = (basket ?? [])
    .map((b) => ({ ...b, a: b.fund ? analystPillar(b.fund, b.fund.price) : null }))
    .filter((b) => Number.isFinite(b.a?.score) && b.w > 0);
  const share = rows.reduce((a, b) => a + b.w, 0);
  if (share < 0.25) return null;
  const score = rows.reduce((a, b) => a + b.a.score * b.w, 0) / share;
  const upside = rows.reduce((a, b) => a + b.a.upside * b.w, 0) / share;
  return {
    score,
    upside,
    reasons: [
      `Analistas das ${rows.length} maiores posições (${pct(share, 0)} do fundo): potencial médio ponderado até o preço-alvo ${upside >= 0 ? "+" : ""}${pct(upside)}.`,
    ],
  };
}

/** Analistas de quem não tem cobertura própria: ativo de referência (espelhado no inverso) ou a cesta. */
function analystFor(sym, f, price, item) {
  const own = analystPillar(f, price);
  if (Number.isFinite(own.score)) return own;
  const lv = leverageOf(sym, f?.name);
  const uf = lv && item?.under?.sym === lv.under ? item.under : null;
  const base = uf?.basket?.length
    ? basketAnalysts(uf.basket)
    : uf?.fund
      ? analystPillar(uf.fund, uf.fund.price)
      : !lv
        ? basketAnalysts(item?.basket)
        : null;
  if (!Number.isFinite(base?.score)) return own;
  const inv = lv?.lev < 0;
  return {
    score: inv ? 100 - base.score : base.score,
    upside: inv ? -base.upside : base.upside,
    reasons: [
      `${uf ? `Ativo de referência ${uf.sym}${inv ? " (inverso: conta o contrário)" : ""}` : "Cesta"}: ${base.reasons[0]}`,
    ],
  };
}

/** Analistas: potencial até o preço-alvo médio e recomendação média (1 = compra forte … 5 = venda). Exige 3+ analistas. */
export function analystPillar(f, price) {
  if (!f || !(f.analysts >= 3) || !(f.target > 0) || !(price > 0))
    return { score: null, reasons: ["Sem cobertura suficiente de analistas."] };
  const up = f.target / price - 1;
  const s = avg([
    interp([[-0.2, 10], [0, 35], [0.15, 65], [0.3, 85]], up),
    f.recMean > 0 ? interp([[1, 90], [2, 70], [3, 45], [4, 20], [5, 5]], f.recMean) : null,
  ]); // prettier-ignore
  return {
    score: s,
    upside: up,
    reasons: [
      `${f.analysts} analistas: preço-alvo médio ${n1(f.target, 2)} (${up >= 0 ? "+" : ""}${pct(up)} do preço atual)${f.recMean > 0 ? `, recomendação média ${n1(f.recMean)} (1 = compra forte, 5 = venda)` : ""}.`,
    ],
  };
}

/** Volatilidade anual (log-retornos diários do último ano). */
export function volOf(bars) {
  const w = (bars?.c ?? []).slice(-253);
  const rets = w.slice(1).map((x, i) => Math.log(x / w[i]));
  if (rets.length <= 20) return null;
  const m = avg(rets);
  return Math.sqrt((rets.reduce((a, r) => a + (r - m) ** 2, 0) / (rets.length - 1)) * 252);
}

/** Riscos (não entram na nota): volatilidade anual, queda desde o topo de 1 ano, beta, alavancagem. */
export function riskOf(bars, f, sym) {
  const c = bars?.c ?? [];
  const w = c.slice(-253);
  const vol = volOf(bars);
  const dd = w.length ? c.at(-1) / Math.max(...w) - 1 : null;
  const warn = [];
  if (vol > 0.4) warn.push(`Volatilidade alta (${pct(vol, 0)} ao ano).`);
  if (dd < -0.3) warn.push(`${pct(-dd, 0)} abaixo do topo de 1 ano.`);
  if (f?.beta > 1.5) warn.push(`Beta ${n1(f.beta)}: oscila bem mais que o mercado.`);
  if (isLeveraged(sym, f?.name))
    warn.push("ETF alavancado ou inverso: perde valor com o tempo; não é para carregar.");
  return { vol, dd, beta: f?.beta ?? null, warn };
}

/** Análise completa de um ticker. item = { bars, fund } da api/analyze. */
export function analyzeTicker(sym, item, { spyPe = 25 } = {}) {
  const f = item?.fund ?? null;
  const tech = techPillar(item?.bars);
  const mom = momPillar(item?.bars);
  const fund = fundPillar(f, spyPe, { sym, bars: item?.bars, under: item?.under, macro: item?.macro, basket: item?.basket }); // prettier-ignore
  const price = item?.bars?.c?.at(-1) ?? f?.price ?? null;
  const analyst = analystFor(sym, f, price, item);
  const pillars = { tech, mom, fund, analyst };
  let wsum = 0;
  let acc = 0;
  for (const [k, p] of Object.entries(pillars))
    if (Number.isFinite(p.score)) {
      acc += WEIGHTS[k] * p.score;
      wsum += WEIGHTS[k];
    }
  const score = wsum >= 0.5 ? acc / wsum : null; // exige pilares que somem ao menos metade do peso
  const vals = Object.values(pillars)
    .map((p) => p.score)
    .filter(Number.isFinite);
  const sd =
    vals.length > 1
      ? Math.sqrt(vals.reduce((a, v) => a + (v - avg(vals)) ** 2, 0) / vals.length)
      : 0;
  const conflict =
    Number.isFinite(tech.score) &&
    Number.isFinite(fund.score) &&
    Math.abs(tech.score - fund.score) > 40;
  const confidence =
    score === null
      ? null
      : vals.length >= 4 && sd < 15
        ? "Alta"
        : vals.length <= 2 || sd > 25
          ? "Baixa"
          : "Média";
  return {
    sym,
    name: f?.name ?? sym,
    type: f?.type ?? null,
    sector: f?.sector ?? f?.category ?? null,
    currency: f?.currency ?? item?.bars?.currency ?? null,
    price,
    score,
    scale: scaleOf(score),
    confidence,
    conflict,
    pillars,
    risk: riskOf(item?.bars, f, sym),
    fund: f,
    series: item?.bars ? { dates: item.bars.dates, close: item.bars.c } : null,
    bars: item?.bars ?? null,
  };
}
