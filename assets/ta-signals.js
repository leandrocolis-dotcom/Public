// Motor de sinais: transforma os indicadores de ta.js em um placar, um veredito em linguagem simples
// e um plano (entrada, saída e metas). Funções puras (sem DOM, sem fetch), testadas.
//
// O placar é uma CONFLUÊNCIA de sinais (quantos indicadores independentes apontam para o mesmo lado),
// não uma probabilidade. Cada voto traz o motivo em português para o usuário entender o porquê.
import * as T from "./ta.js";
import { sessionInfo } from "./sessions.js";
import { num, pct, pctU } from "./format.js";
import { fmtR, simulateR, tradeStats } from "./edge.js";

const { clamp, isNum } = T;

// ───────────────────────── vereditos ─────────────────────────

/** Faixas do placar (-100 a +100). `tone` casa com as cores do site (buy, wait, sell). */
export const VERDICTS = [
  { key: "sell", min: -Infinity, label: "VENDER / REDUZIR", short: "Vender", tone: "sell" },
  { key: "lean-sell", min: -45, label: "Viés de venda", short: "Viés de baixa", tone: "sell" },
  { key: "wait", min: -20, label: "AGUARDAR", short: "Aguardar", tone: "wait" },
  { key: "lean-buy", min: 20, label: "Viés de compra", short: "Viés de alta", tone: "buy" },
  { key: "buy", min: 45, label: "COMPRAR", short: "Comprar", tone: "buy" },
];
export function verdictOf(score) {
  let v = VERDICTS[0];
  for (const x of VERDICTS) if (score >= x.min) v = x;
  return v;
}

export const CATS = {
  tendencia: "Tendência",
  momentum: "Força do movimento",
  volatilidade: "Esticado ou calmo?",
  volume: "Dinheiro (volume)",
  estrutura: "Pisos, tetos e padrões",
  hoje: "Hoje no pregão",
};

const vote = (cat, id, dir, w, title, text, tip = id) => ({
  cat, id, dir: Number(clamp(dir).toFixed(2)), w, title, text, tip,
}); // prettier-ignore

function summarize(votes) {
  let sw = 0;
  let s = 0;
  const cats = {};
  for (const v of votes) {
    sw += v.w;
    s += v.w * v.dir;
    const c = (cats[v.cat] ??= { w: 0, s: 0 });
    c.w += v.w;
    c.s += v.w * v.dir;
  }
  const catScores = Object.fromEntries(
    Object.entries(cats).map(([k, c]) => [k, c.w ? c.s / c.w : 0]),
  );
  const score = sw ? Math.round((100 * s) / sw) : 0;
  const sign = Math.sign(score);
  const aligned = Object.values(catScores).filter(
    (x) => sign && Math.sign(x) === sign && Math.abs(x) > 0.12,
  ).length;
  const total = Object.keys(catScores).length;
  const confidence = !sign
    ? "baixa"
    : aligned >= Math.max(4, total - 1)
      ? "alta"
      : aligned >= 3
        ? "média"
        : "baixa";
  return { score, catScores, confidence, aligned, total };
}

// ───────────────────────── plano (entrada, saída, metas) ─────────────────────────

/**
 * Plano de operação a partir de suportes/resistências e de uma "unidade" de risco (ATR).
 * long: stop abaixo do suporte mais próximo (limitado entre stopMin e stopMax unidades);
 * metas na resistência mais próxima que dê ao menos 1,2x o risco, senão 1,5x e 3x o risco.
 * short (vender/reduzir): espelhado; o "stop" é o nível que invalida a ideia.
 */
export function buildPlan({
  dir,
  price,
  unit,
  supports = [],
  resistances = [],
  stopMin = 1,
  stopMax = 3,
}) {
  if (!(price > 0) || !(unit > 0)) return null;
  const long = dir > 0;
  const struct = long
    ? supports.find((s) => s < price - 0.4 * unit)
    : resistances.find((r) => r > price + 0.4 * unit);
  const rawDist =
    struct == null ? 2 * unit : long ? price - struct + 0.25 * unit : struct - price + 0.25 * unit;
  const risk = clamp(rawDist, stopMin * unit, stopMax * unit);
  const stop = long ? price - risk : price + risk;
  const targets = long ? resistances : supports;
  const far = (t) => (long ? t - price : price - t);
  const t1c = targets.find((t) => far(t) >= 1.2 * risk && far(t) <= 4 * risk);
  const t1 = t1c ?? (long ? price + 1.5 * risk : price - 1.5 * risk);
  const t2c = targets.find((t) => far(t) >= 2.4 * risk && far(t) <= 7 * risk && t !== t1c);
  const t2 = t2c ?? (long ? price + 3 * risk : price - 3 * risk);
  return {
    dir: long ? 1 : -1,
    entry: price,
    stop,
    t1,
    t2,
    riskPct: risk / price,
    rr: far(t1) / risk,
    t1Structural: t1c != null,
  };
}

// ───────────────────────── análise diária (swing) ─────────────────────────

/** Calcula todos os indicadores diários de uma vez (reaproveitado pelo placar de qualquer dia). */
export function prepareDaily(bars) {
  const { h, l, c, v } = bars;
  const vol = !bars.closeOnly && T.hasVolume(v);
  return {
    bars,
    n: c.length,
    vol,
    sma20: T.sma(c, 20),
    sma50: T.sma(c, 50),
    sma200: T.sma(c, 200),
    ema9: T.ema(c, 9),
    ema21: T.ema(c, 21),
    rsi: T.rsi(c),
    macd: T.macd(c),
    bb: T.bollinger(c),
    st: T.stochastic(h, l, c),
    atr: T.atr(h, l, c),
    adx: T.adx(h, l, c),
    obv: vol ? T.obv(c, v) : null,
    cmf: vol ? T.cmf(h, l, c, v) : null,
    mfi: vol ? T.mfi(h, l, c, v) : null,
    vavg: vol ? T.avgVolumePrior(v, 20) : null,
    roc20: T.roc(c, 20),
    hi20: T.highest(h, 20),
    lo20: T.lowest(l, 20),
  };
}

/** Estrutura (pivôs, níveis, Fibonacci, divergência) usando só os dados até a barra i. */
function structureAt(P, i) {
  const from = Math.max(0, i - 160);
  const { h, l } = P.bars;
  const sw = T.swings(h.slice(from, i + 1), l.slice(from, i + 1), 3).map((s) => ({
    ...s,
    i: s.i + from,
  }));
  const price = P.bars.c[i];
  const tol = Math.max(0.6 * (P.atr[i] ?? 0), 0.004 * price);
  const lv = T.levels(sw, price, tol);
  return {
    sw,
    dow: T.dowStructure(sw),
    levels: lv,
    fib: T.fibonacci(sw, price),
    div: T.divergence(sw, P.rsi, i + 1),
  };
}

/** Rank percentil (0 a 1) da largura das bandas hoje contra as últimas 126 barras: perto de 0 = "mola comprimida". */
function bwRank(bw, i, win = 126) {
  const x = bw[i];
  let n = 0;
  let below = 0;
  for (let j = Math.max(0, i - win); j < i; j++) {
    if (!isNum(bw[j])) continue;
    n++;
    if (bw[j] < x) below++;
  }
  return n >= 30 ? below / n : null;
}

/**
 * Placar do dia i (por padrão, o último). Retorna votos, categorias, veredito, timing e plano.
 * @param partialLast true se a última barra (hoje) ainda está em formação: o volume dela não vira sinal.
 */
/** Valores comuns a todas as regras do diário num pregão `i`; null se faltarem dados mínimos. */
function dailyContext(P, i, partialLast) {
  const { bars } = P;
  const c = bars.c[i];
  const atr = P.atr[i];
  if (!isNum(atr) || !isNum(P.sma50[i]) || !isNum(P.rsi[i])) return null;
  const st = structureAt(P, i);
  const adxV = P.adx.adx[i];
  const pdi = P.adx.pdi[i];
  const mdi = P.adx.mdi[i];
  const trending = isNum(adxV) && adxV >= 25;
  const trendDir = isNum(pdi) ? Math.sign(pdi - mdi) : 0;
  const r = P.rsi[i];
  const sup = st.levels.supports;
  const res = st.levels.resistances;
  const nearS = sup[0] && (c - sup[0].price) / atr < 0.8 ? sup[0] : null;
  const nearR = res[0] && (res[0].price - c) / atr < 0.8 ? res[0] : null;
  return {
    P,
    i,
    bars,
    c,
    atr,
    st,
    adxV,
    pdi,
    mdi,
    trending,
    trendDir,
    r,
    sup,
    res,
    nearS,
    nearR,
    partialLast,
  };
}

/** Tendência: médias, MACD, ADX e estrutura de Dow. */
function trendVotes(k) {
  const { P, i, c, st, adxV, trendDir } = k;
  const votes = [];
  const s50 = P.sma50[i];
  votes.push(
    vote("tendencia", "sma50", c > s50 ? 1 : -1, 10,
      c > s50 ? "Preço acima da média de 50 dias" : "Preço abaixo da média de 50 dias",
      c > s50
        ? `O preço (${num(c)}) está acima da média dos últimos 50 pregões (${num(s50)}). Quem comprou nos últimos 2 meses está, em média, no lucro: sinal de força.`
        : `O preço (${num(c)}) está abaixo da média dos últimos 50 pregões (${num(s50)}). Quem comprou nos últimos 2 meses está, em média, no prejuízo: sinal de fraqueza.`,
      "sma"),
  ); // prettier-ignore
  const s200 = P.sma200[i];
  if (isNum(s200)) {
    votes.push(
      vote("tendencia", "sma200", c > s200 ? 1 : -1, 10,
        c > s200 ? "Acima da média de 200 dias (tendência maior de alta)" : "Abaixo da média de 200 dias (tendência maior de baixa)",
        c > s200
          ? `A média de 200 dias (${num(s200)}) é a "linha" entre mercado de alta e de baixa. Estar acima dela favorece quem compra.`
          : `A média de 200 dias (${num(s200)}) é a "linha" entre mercado de alta e de baixa. Estar abaixo dela favorece quem vende; comprar aqui é nadar contra a maré maior.`,
        "sma"),
    ); // prettier-ignore
    const golden = s50 > s200;
    votes.push(
      vote("tendencia", "cross", golden ? 0.8 : -0.8, 5,
        golden ? "Média de 50 acima da de 200 (\"cruz dourada\")" : "Média de 50 abaixo da de 200 (\"cruz da morte\")",
        golden
          ? "A média curta (50 dias) está acima da longa (200 dias): o mercado vem subindo há meses."
          : "A média curta (50 dias) está abaixo da longa (200 dias): o mercado vem caindo há meses.",
        "cross"),
    ); // prettier-ignore
  }
  const m = P.macd;
  if (isNum(m.signal[i])) {
    const above = m.line[i] > m.signal[i];
    const pos = m.line[i] > 0;
    const d = above && pos ? 1 : above ? 0.3 : pos ? -0.3 : -1;
    const fresh = [1, 2, 3].some(
      (k) => isNum(m.hist[i - k]) && Math.sign(m.hist[i - k]) !== Math.sign(m.hist[i]),
    );
    votes.push(
      vote("tendencia", "macd", d, 10,
        d > 0.5 ? "MACD positivo e acima do sinal" : d < -0.5 ? "MACD negativo e abaixo do sinal" : above ? "MACD virou para cima (ainda abaixo de zero)" : "MACD perdendo força (ainda acima de zero)",
        `O MACD compara a velocidade de duas médias. ${above ? "Está acima da linha de sinal: o impulso é de alta" : "Está abaixo da linha de sinal: o impulso é de baixa"}${fresh ? ", e isso mudou nos últimos 3 pregões (cruzamento recente)" : ""}.`,
        "macd"),
    ); // prettier-ignore
  }
  if (isNum(adxV)) {
    const strength = clamp((adxV - 15) / 20, 0, 1);
    votes.push(
      vote("tendencia", "adx", trendDir * strength, 10,
        adxV < 20 ? "Sem tendência clara (mercado lateral)" : trendDir > 0 ? "Tendência de alta com força" : "Tendência de baixa com força",
        adxV < 20
          ? `O ADX está em ${num(adxV, 0)} (abaixo de 20): o preço anda de lado. Nesse cenário, sinais de tendência falham mais; funciona melhor comprar perto do piso e vender perto do teto.`
          : `O ADX está em ${num(adxV, 0)} (${adxV >= 25 ? "tendência forte" : "tendência se formando"}) e os ${trendDir > 0 ? "compradores" : "vendedores"} dominam. Em tendência, o caminho mais provável é seguir o movimento.`,
        "adx"),
    ); // prettier-ignore
  }
  votes.push(
    st.dow.trend === "up"
      ? vote("tendencia", "dow", 1, 10, "Topos e fundos cada vez mais altos", "Cada topo e cada fundo recente ficou acima do anterior: é a definição clássica de tendência de alta (Teoria de Dow).", "dow")
      : st.dow.trend === "down"
        ? vote("tendencia", "dow", -1, 10, "Topos e fundos cada vez mais baixos", "Cada topo e cada fundo recente ficou abaixo do anterior: é a definição clássica de tendência de baixa (Teoria de Dow).", "dow")
        : vote("tendencia", "dow", 0, 10, "Topos e fundos sem direção clara", "Os últimos topos e fundos não seguem um padrão claro de alta nem de baixa.", "dow"),
  ); // prettier-ignore
  return votes;
}

/** Força do movimento: RSI, estocástico e variação em 1 mês. */
function momentumVotes(k) {
  const { P, i, trending, trendDir, r } = k;
  const votes = [];
  {
    let d;
    let t;
    let x;
    if (r > 80)
      [d, t, x] = [
        -0.3,
        "RSI muito alto (esticado)",
        `O RSI está em ${num(r, 0)}: o preço subiu rápido demais. A tendência pode seguir, mas é um péssimo ponto para entrar; o risco de um recuo é alto.`,
      ];
    else if (r > 70)
      [d, t, x] = [
        0.2,
        "RSI alto (forte, mas perto do limite)",
        `O RSI está em ${num(r, 0)}: há força compradora, mas o preço já subiu bastante. Evite entrar com pressa.`,
      ];
    else if (r >= 55)
      [d, t, x] = [
        0.7,
        "RSI saudável (compradores no comando)",
        `O RSI está em ${num(r, 0)}: acima de 55 e abaixo de 70 é a zona típica de uma alta saudável.`,
      ];
    else if (r >= 45)
      [d, t, x] = [0, "RSI neutro", `O RSI está em ${num(r, 0)}: nenhum lado domina.`];
    else if (r >= 30)
      [d, t, x] = [
        -0.5,
        "RSI fraco (vendedores no comando)",
        `O RSI está em ${num(r, 0)}: abaixo de 45 costuma indicar um mercado de baixa ou sem força.`,
      ];
    else
      [d, t, x] = [
        0.3,
        "RSI muito baixo (esticado para baixo)",
        `O RSI está em ${num(r, 0)}: o preço caiu rápido demais. Pode haver um repique, mas é arriscado "pegar faca caindo" sem um sinal de virada.`,
      ];
    votes.push(vote("momentum", "rsi", d, 10, t, x, "rsi"));
  }
  if (isNum(P.st.d[i])) {
    const k = P.st.k[i];
    const d2 = P.st.d[i];
    let d = k > d2 ? 0.3 : -0.3;
    let t = k > d2 ? "Estocástico apontando para cima" : "Estocástico apontando para baixo";
    let x = `O estocástico mede onde o preço fechou dentro da faixa dos últimos 14 dias (${num(k, 0)} de 100). ${k > d2 ? "Está virando para cima" : "Está virando para baixo"}.`;
    if (k < 20 && k > d2)
      [d, t, x] = [
        1,
        "Estocástico saindo da zona de sobrevenda",
        `O estocástico (${num(k, 0)}) estava muito baixo e virou para cima: sinal clássico de repique.`,
      ];
    if (k > 80 && k < d2)
      [d, t, x] = [
        -1,
        "Estocástico saindo da zona de sobrecompra",
        `O estocástico (${num(k, 0)}) estava muito alto e virou para baixo: sinal clássico de recuo.`,
      ];
    if (trending && Math.sign(d) !== trendDir) d *= 0.4; // em tendência forte, oscilador contra a tendência pesa menos
    votes.push(vote("momentum", "stoch", d, 5, t, x, "stoch"));
  }
  if (isNum(P.roc20[i])) {
    const x = P.roc20[i];
    votes.push(
      vote("momentum", "roc", x / 0.08, 5,
        x >= 0 ? `Subiu ${pct(x)} em 1 mês` : `Caiu ${pctU(x)} em 1 mês`,
        `Variação dos últimos 20 pregões: ${pct(x)}. Ativos que sobem (ou caem) tendem a continuar na mesma direção no curto prazo (momentum).`,
        "roc"),
    ); // prettier-ignore
  }
  return votes;
}

/** Esticado ou calmo: bandas de Bollinger e distância da média de 20 dias. */
function volatilityVotes(k) {
  const { P, i, c, atr, trending, trendDir } = k;
  const votes = [];
  const bb = P.bb;
  if (isNum(bb.pctB[i])) {
    const pb = bb.pctB[i];
    const rank = bwRank(bb.bw, i);
    let d = (pb - 0.5) * 0.4;
    let t = "Preço no meio das bandas de Bollinger";
    let x = `As bandas de Bollinger mostram a faixa "normal" do preço. Ele está ${pb > 0.5 ? "na metade de cima" : "na metade de baixo"} dessa faixa: nada fora do comum.`;
    if (pb > 1) {
      if (trending && trendDir > 0)
        [d, t, x] = [
          0.4,
          "Preço colado na banda de cima, em tendência forte",
          'Em tendência forte, o preço pode "andar" na banda de cima por semanas. É sinal de força, não de topo.',
        ];
      else
        [d, t, x] = [
          -0.7,
          "Preço acima da banda de cima (esticado)",
          "O preço saiu da faixa normal para cima sem uma tendência forte por trás. Costuma voltar para a média: risco de recuo.",
        ];
    } else if (pb < 0) {
      if (trending && trendDir < 0)
        [d, t, x] = [
          -0.4,
          "Preço colado na banda de baixo, em tendência de baixa",
          'Em tendência de baixa forte, o preço pode "andar" na banda de baixo. É sinal de fraqueza, não de fundo.',
        ];
      else
        [d, t, x] = [
          0.7,
          "Preço abaixo da banda de baixo (esticado)",
          "O preço saiu da faixa normal para baixo sem uma tendência de baixa forte. Costuma voltar para a média: chance de repique.",
        ];
    }
    if (rank != null && rank <= 0.1) {
      d *= 0.5;
      t = `Mola comprimida (volatilidade mínima do semestre). ${t}`;
      x +=
        " Além disso, as bandas estão muito estreitas: costuma vir um movimento forte, mas a direção só aparece quando o preço romper uma das bandas.";
    }
    votes.push(vote("volatilidade", "bollinger", d, 8, t, x, "bollinger"));
  }
  if (isNum(P.sma20[i])) {
    const ext = (c - P.sma20[i]) / atr;
    const d = ext > 3 ? -0.6 : ext < -3 ? 0.4 : 0;
    votes.push(
      vote("volatilidade", "extensao", d, 7,
        ext > 3 ? "Muito longe da média de 20 dias (esticado para cima)" : ext < -3 ? "Muito longe da média de 20 dias (esticado para baixo)" : "Perto da média de 20 dias (sem esticar)",
        `O preço está a ${num(Math.abs(ext), 1)} "oscilações normais" (ATR) ${ext >= 0 ? "acima" : "abaixo"} da média de 20 dias. ${Math.abs(ext) > 3 ? "Quando o preço se afasta tanto, o elástico costuma puxar de volta." : "Distância normal: sem esticar."}`,
        "atr"),
    ); // prettier-ignore
  }
  return votes;
}

/** Volume: OBV, fluxo de dinheiro (CMF) e volume relativo. */
function volumeVotes(k) {
  const { P, i, bars, partialLast } = k;
  const votes = [];
  if (P.vol && isNum(P.cmf[i]) && i >= 20) {
    const o20 = P.obv[i] - P.obv[i - 20];
    const av = P.vavg[i] * 20;
    const ratio = av ? o20 / av : 0;
    votes.push(
      vote("volume", "obv", ratio * 3, 8,
        ratio > 0.1 ? "Volume maior nos dias de alta (dinheiro entrando)" : ratio < -0.1 ? "Volume maior nos dias de queda (dinheiro saindo)" : "Volume equilibrado entre altas e quedas",
        `O OBV soma o volume nos dias de alta e subtrai nos de queda. Nos últimos 20 pregões, ${ratio > 0.1 ? "os dias de alta tiveram mais negócios: compradores mais convictos" : ratio < -0.1 ? "os dias de queda tiveram mais negócios: vendedores mais convictos" : "não houve diferença relevante"}.`,
        "obv"),
    ); // prettier-ignore
    const cm = P.cmf[i];
    votes.push(
      vote("volume", "cmf", cm / 0.2, 7,
        cm > 0.05 ? "Fechando perto da máxima do dia, com volume (acumulação)" : cm < -0.05 ? "Fechando perto da mínima do dia, com volume (distribuição)" : "Fechamentos sem viés",
        `O Chaikin Money Flow está em ${num(cm, 2)}. ${cm > 0.05 ? "Os fechamentos vêm perto da máxima: compradores levando o jogo" : cm < -0.05 ? "Os fechamentos vêm perto da mínima: vendedores levando o jogo" : "Perto de zero: sem vantagem clara."}`,
        "cmf"),
    ); // prettier-ignore
    const j = partialLast && i === P.n - 1 ? i - 1 : i;
    const rv = P.vavg[j] ? bars.v[j] / P.vavg[j] : 0;
    const ret = bars.c[j] / bars.c[j - 1] - 1;
    const strong = rv >= 1.5 && Math.abs(ret) >= 0.005;
    votes.push(
      vote("volume", "relvol", strong ? Math.sign(ret) * 0.8 : 0, 5,
        strong ? (ret > 0 ? "Alta recente com volume forte" : "Queda recente com volume forte") : "Volume normal no último pregão",
        strong
          ? `No último pregão completo o volume foi ${num(rv, 1)}x a média e o preço ${ret > 0 ? "subiu" : "caiu"} ${pctU(ret)}: movimento com convicção.`
          : `O volume do último pregão completo foi ${num(rv, 1)}x a média: nada fora do comum.`,
        "relvol"),
    ); // prettier-ignore
  }
  return votes;
}

/** Pisos, tetos e padrões: suportes/resistências, rompimento de 4 semanas, candles, divergência e Fibonacci. */
function structureVotes(k) {
  const { P, i, bars, c, atr, st, sup, res, nearS, nearR, partialLast } = k;
  const votes = [];
  {
    let d = 0;
    let t = "Longe de pisos e tetos importantes";
    let x =
      sup[0] || res[0]
        ? `O piso mais próximo está em ${sup[0] ? num(sup[0].price) : "–"} e o teto mais próximo em ${res[0] ? num(res[0].price) : "–"}. O preço está no meio do caminho.`
        : "Sem pisos ou tetos claros no histórico recente.";
    if (nearR)
      [d, t, x] = [
        -0.6,
        "Colado em um teto (resistência)",
        `O preço está encostando em ${num(nearR.price)}, uma região onde ele já virou para baixo ${nearR.touches} vez(es). Ali costuma haver vendedores esperando.`,
      ];
    if (nearS)
      [d, t, x] = [
        0.6,
        "Perto de um piso (suporte)",
        `O preço está perto de ${num(nearS.price)}, uma região onde ele já virou para cima ${nearS.touches} vez(es). Ali costuma haver compradores esperando; se o piso romper, a ideia de compra falha.`,
      ];
    votes.push(vote("estrutura", "sr", d, 10, t, x, "sr"));
  }
  if (i >= 21) {
    const prevHi = T.highest(bars.h.slice(i - 20, i), 20).at(-1);
    const prevLo = T.lowest(bars.l.slice(i - 20, i), 20).at(-1);
    const rvOk =
      P.vol && P.vavg[i] && bars.v[i] / P.vavg[i] >= 1.2 && !(partialLast && i === P.n - 1);
    let d = 0;
    let t = "Dentro da faixa das últimas 4 semanas";
    let x = `O preço está entre a mínima (${num(prevLo)}) e a máxima (${num(prevHi)}) das últimas 4 semanas.`;
    if (c > prevHi)
      [d, t, x] = [
        rvOk ? 1 : 0.7,
        "Rompeu a máxima das últimas 4 semanas",
        `O preço fechou acima de ${num(prevHi)}, a máxima das últimas 4 semanas${rvOk ? ", com volume acima da média (rompimento confirmado)" : " (sem volume forte: confirme antes de confiar)"}.`,
      ];
    if (c < prevLo)
      [d, t, x] = [
        rvOk ? -1 : -0.7,
        "Perdeu a mínima das últimas 4 semanas",
        `O preço fechou abaixo de ${num(prevLo)}, a mínima das últimas 4 semanas${rvOk ? ", com volume acima da média" : " (sem volume forte)"}.`,
      ];
    votes.push(vote("estrutura", "donchian", d, 8, t, x, "donchian"));
  }
  const pats = [i, i - 1]
    .flatMap((j) => T.candlePatterns(bars, j, atr).map((p) => ({ ...p, ago: i - j })))
    .filter((p) => p.dir !== 0 && !bars.closeOnly);
  if (!bars.closeOnly) {
    const p = pats[0];
    const atLevel = (p?.dir > 0 && nearS) || (p?.dir < 0 && nearR);
    votes.push(
      p
        ? vote("estrutura", "candle", p.dir * (atLevel ? 1 : 0.5), 6,
            `Padrão de candle: ${p.name}${atLevel ? " em piso/teto" : ""}`,
            `Apareceu o padrão "${p.name}" ${p.ago ? "no pregão anterior" : "hoje"}, que sugere ${p.dir > 0 ? "virada para cima" : "virada para baixo"}. ${atLevel ? "Como ocorreu num piso/teto importante, pesa mais." : "Longe de pisos e tetos, candles isolados acertam pouco (perto de 55%); por isso o peso é menor."}`,
            "candle")
        : vote("estrutura", "candle", 0, 6, "Sem padrão de candle relevante", "Nenhum padrão clássico de virada nos últimos 2 pregões.", "candle"),
    ); // prettier-ignore
  }
  votes.push(
    st.div.bullish
      ? vote("estrutura", "divergence", 0.9, 8, "Divergência de alta no RSI", "O preço fez um fundo mais baixo, mas o RSI fez um fundo mais alto: a pressão vendedora está acabando. Sinal clássico de virada para cima.", "divergence")
      : st.div.bearish
        ? vote("estrutura", "divergence", -0.9, 8, "Divergência de baixa no RSI", "O preço fez um topo mais alto, mas o RSI fez um topo mais baixo: a alta está perdendo fôlego. Sinal clássico de virada para baixo.", "divergence")
        : vote("estrutura", "divergence", 0, 8, "Sem divergência entre preço e RSI", "Preço e RSI estão andando juntos: nenhum aviso de enfraquecimento.", "divergence"),
  ); // prettier-ignore
  if (st.fib) {
    const f = st.fib;
    const inZone = f.retr >= 0.34 && f.retr <= 0.66;
    const turning = f.dir === "up" ? c > bars.c[i - 1] : c < bars.c[i - 1];
    votes.push(
      vote("estrutura", "fib", inZone && turning ? (f.dir === "up" ? 0.7 : -0.7) : 0, 5,
        inZone ? (f.dir === "up" ? "Recuo na zona de Fibonacci de uma alta" : "Repique na zona de Fibonacci de uma queda") : "Fora da zona clássica de Fibonacci",
        inZone
          ? `O preço devolveu ${num(f.retr * 100, 0)}% da última ${f.dir === "up" ? "alta" : "queda"}. Entre 38% e 62% é onde os recuos "saudáveis" costumam terminar${turning ? " e o preço já está virando a favor da tendência" : ", mas ainda não virou"}.`
          : `O preço devolveu ${num(f.retr * 100, 0)}% da última ${f.dir === "up" ? "alta" : "queda"}: fora da zona clássica (38% a 62%).`,
        "fib"),
    ); // prettier-ignore
  }
  return { votes, pats };
}

/** Timing: o ativo é bom, mas é um bom momento de entrar? Devolve { status, text, zone }. */
function timingOf(k, votes, dir) {
  const { P, i, c, atr, r, sup, res, nearS, nearR } = k;
  const bb = P.bb;
  const ext = isNum(P.sma20[i]) ? (c - P.sma20[i]) / atr : 0;
  const overheated = r > 75 || ext > 2.5 || (isNum(bb.pctB[i]) && bb.pctB[i] > 1);
  const oversold = r < 28 || ext < -2.5 || (isNum(bb.pctB[i]) && bb.pctB[i] < 0);
  const brokeUp = votes.find((v) => v.id === "donchian")?.dir > 0.6;
  const pullbackTo = Math.max(
    ...[P.ema21[i], sup[0]?.price].filter((x) => isNum(x) && x < c),
    c - 1.5 * atr,
  );
  const bounceTo = Math.min(
    ...[P.ema21[i], res[0]?.price].filter((x) => isNum(x) && x > c),
    c + 1.5 * atr,
  );
  let timing = {
    status: "none",
    text: "Sem ideia de entrada: o placar está equilibrado.",
    zone: null,
  };
  if (dir > 0) {
    if (brokeUp && !overheated)
      timing = {
        status: "enter",
        text: "Entrada por rompimento: o preço passou da máxima de 4 semanas. Se for entrar, entre perto daqui e use a regra de saída abaixo.",
        zone: null,
      };
    else if (overheated || nearR)
      timing = {
        status: "wait",
        text: `O ativo está bom, mas o preço está esticado ou colado num teto. Espere um recuo até perto de ${num(pullbackTo)} para entrar com risco menor.`,
        zone: [pullbackTo, pullbackTo + 0.5 * atr],
      };
    else
      timing = {
        status: "enter",
        text: "O preço está numa zona razoável para entrar (não está esticado nem colado num teto).",
        zone: null,
      };
  } else if (dir < 0) {
    if (oversold || nearS)
      timing = {
        status: "wait",
        text: `A tendência é ruim, mas o preço já caiu muito ou está num piso. Vender agora é "vender no fundo": espere um repique até perto de ${num(bounceTo)}.`,
        zone: [bounceTo - 0.5 * atr, bounceTo],
      };
    else
      timing = {
        status: "enter",
        text: "Se já tem o ativo, é momento de reduzir. Se não tem, evite comprar.",
        zone: null,
      };
  }
  return timing;
}

export function scoreDailyAt(P, i = P.n - 1, { partialLast = false } = {}) {
  const k = dailyContext(P, i, partialLast);
  if (!k) return null;
  const { c, atr, st, adxV, pdi, mdi, r, sup, res } = k;
  const { votes: structure, pats } = structureVotes(k);
  const votes = [
    ...trendVotes(k),
    ...momentumVotes(k),
    ...volatilityVotes(k),
    ...volumeVotes(k),
    ...structure,
  ];
  const sum = summarize(votes);
  const verdict = verdictOf(sum.score);
  const dir = sum.score >= 20 ? 1 : sum.score <= -20 ? -1 : 0;

  const timing = timingOf(k, votes, dir);

  let plan = null;
  if (dir !== 0) {
    const entryPrice = timing.status === "wait" ? (timing.zone[0] + timing.zone[1]) / 2 : c;
    plan = buildPlan({
      dir,
      price: entryPrice,
      unit: atr,
      supports: sup.map((s) => s.price),
      resistances: res.map((s) => s.price),
      stopMin: 1.2,
      stopMax: 3,
    });
  }

  const m = P.macd;
  const bb = P.bb;
  return {
    i,
    price: c,
    atr,
    votes,
    ...sum,
    verdict,
    dir,
    timing,
    plan,
    struct: st,
    patterns: pats,
    ind: {
      rsi: r, adx: adxV, pdi, mdi, macd: m.line[i], macdSignal: m.signal[i], hist: m.hist[i],
      sma20: P.sma20[i], sma50: P.sma50[i], sma200: P.sma200[i], ema21: P.ema21[i], pctB: bb.pctB[i],
      stochK: P.st.k[i], cmf: P.cmf?.[i] ?? null, mfi: P.mfi?.[i] ?? null,
    }, // prettier-ignore
  };
}

/**
 * Quanto esse tipo de sinal já funcionou neste ativo: para cada dia com placar de compra (>= +20) ou
 * de venda (<= -20), olha o retorno `h` pregões depois. Sinais com menos de h pregões entre si não se repetem
 * (evita contar o mesmo movimento várias vezes). Resultado é histórico, não promessa.
 */
export function backtestDaily(P, { h = 5, start = 210 } = {}) {
  const c = P.bars.c;
  const buys = [];
  const sells = [];
  const all = [];
  let blockBuy = -1;
  let blockSell = -1;
  const buyIdx = [];
  const sellIdx = [];
  for (let i = Math.max(start, 60); i < P.n - h; i++) {
    const fwd = c[i + h] / c[i] - 1;
    all.push(fwd);
    const a = scoreDailyAt(P, i);
    if (!a) continue;
    if (a.score >= 20) buyIdx.push(i);
    else if (a.score <= -20) sellIdx.push(i);
    if (a.score >= 20 && i > blockBuy) {
      buys.push(fwd);
      blockBuy = i + h - 1;
    } else if (a.score <= -20 && i > blockSell) {
      sells.push(fwd);
      blockSell = i + h - 1;
    }
  }
  // Trades simulados em R (lição 13): abertura seguinte, stop 2,5 ATR, saída em 20 pregões, custo por perna.
  const buyR = tradeStats(simulateR(P.bars, buyIdx, P.atr, { dir: 1 }));
  const sellR = tradeStats(simulateR(P.bars, sellIdx, P.atr, { dir: -1 }));
  const avg = (xs) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);
  return {
    h,
    days: all.length,
    base: avg(all),
    buy: {
      n: buys.length,
      avg: avg(buys),
      hit: buys.length ? buys.filter((x) => x > 0).length / buys.length : null,
    },
    sell: {
      n: sells.length,
      avg: avg(sells),
      hit: sells.length ? sells.filter((x) => x < 0).length / sells.length : null,
    },
    buyR,
    sellR,
  };
}

/** Texto simples do histórico do sinal para a direção atual (1 compra, -1 venda). */
export function backtestText(bt, dir) {
  if (!bt || !dir) return null;
  const s = dir > 0 ? bt.buy : bt.sell;
  if (!s.n)
    return `Nos últimos ${bt.days} pregões, este ativo não teve um sinal parecido para comparar.`;
  const word = dir > 0 ? "compra" : "venda";
  const good = dir > 0 ? "subiu" : "caiu";
  const few = s.n < 8 ? " São poucos casos: não dá para confiar muito neste número." : "";
  const edge = dir > 0 ? s.avg - bt.base : bt.base - s.avg;
  const r = dir > 0 ? bt.buyR : bt.sellR;
  const rTxt = r?.n
    ? ` Simulando operações de verdade (entrada na abertura seguinte, stop de 2,5 ATR, saída em 20 pregões, custos incluídos): ${r.n} operações, acerto de ${Math.round(r.winRate * 100)}% (precisa de ${r.breakeven != null ? Math.round(r.breakeven * 100) : "–"}% para empatar), expectativa de ${fmtR(r.expectancy)} por operação${r.profitFactor != null && Number.isFinite(r.profitFactor) ? `, profit factor ${num(r.profitFactor, 2)}` : ""}.`
    : "";
  return `Nos últimos ${bt.days} pregões, as ${s.n} vezes em que o placar deu sinal de ${word} neste ativo, o preço ${good} em ${Math.round(s.hit * 100)}% dos casos nos ${bt.h} pregões seguintes (variação média ${pct(s.avg)}; num dia qualquer foi ${pct(bt.base)}). ${edge > 0.002 ? "Foi melhor do que um dia qualquer." : "Não foi melhor do que um dia qualquer."}${few}${rTxt}`;
}

/** Prepara e pontua um ativo diário de uma vez. */
export function analyzeDaily(bars, opts = {}) {
  const P = prepareDaily(bars);
  const a = scoreDailyAt(P, P.n - 1, opts);
  if (!a) return null;
  return { P, ...a };
}

// ───────────────────────── análise intradiária (hoje no pregão) ─────────────────────────

const NY_FMT = new Intl.DateTimeFormat("en-US", {
  timeZone: "America/New_York", hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit",
}); // prettier-ignore
const BRT_FMT = new Intl.DateTimeFormat("pt-BR", {
  timeZone: "America/Sao_Paulo", hour: "2-digit", minute: "2-digit", hourCycle: "h23",
}); // prettier-ignore

/** { date: "AAAA-MM-DD", min: minutos desde 00:00 em Nova York } de um horário Unix (segundos). */
export function nyParts(sec) {
  const p = Object.fromEntries(
    NY_FMT.formatToParts(new Date(sec * 1000)).map((x) => [x.type, x.value]),
  );
  return { date: `${p.year}-${p.month}-${p.day}`, min: Number(p.hour) * 60 + Number(p.minute) };
}
export const brtClock = (sec) => BRT_FMT.format(new Date(sec * 1000));

const OPEN = 9 * 60 + 30;
const CLOSE = 16 * 60;

/** Fases do pregão (horário de Nova York) com a orientação para quem opera. `min` em minutos NY. */
const PHASES = [
  { id: "pre", from: 0, to: OPEN, name: "Antes da abertura", tip: "O mercado ainda não abriu. Use esse tempo para ler o quadro diário.", good: false },
  { id: "open", from: OPEN, to: 10 * 60, name: "Abertura (primeiros 30 min)", tip: "Movimentos bruscos e muitos falsos sinais. Espere a faixa de abertura se formar antes de entrar.", good: false },
  { id: "morning", from: 10 * 60, to: 11 * 60 + 30, name: "Manhã (melhor janela)", tip: "Volume alto e tendência do dia se definindo: a melhor janela para entradas a favor do movimento.", good: true },
  { id: "lunch", from: 11 * 60 + 30, to: 14 * 60, name: "Almoço (mais calmo)", tip: "Volume cai e o preço costuma andar de lado. Sinais de rompimento falham mais; prefira esperar.", good: false },
  { id: "afternoon", from: 14 * 60, to: 15 * 60 + 30, name: "Tarde (retomada)", tip: "O volume volta e a tendência da manhã costuma ser retomada ou revertida.", good: true },
  { id: "close", from: 15 * 60 + 30, to: CLOSE, name: "Fechamento (última meia hora)", tip: "Volume e oscilação sobem. Evite abrir posição nova sem folga: o dia acaba e não dá tempo de corrigir.", good: false },
  { id: "post", from: CLOSE, to: 24 * 60, name: "Pregão encerrado", tip: "O dia acabou. Os dados abaixo mostram a última sessão completa.", good: false },
]; // prettier-ignore
/** Fase do pregão; `closeMin` = minuto de fechamento (13:00 nos pregões encurtados). */
export const phaseAt = (min, closeMin = CLOSE) => {
  if (min >= closeMin) return PHASES.at(-1);
  if (min >= Math.max(OPEN, closeMin - 30)) return PHASES.find((p) => p.id === "close");
  return PHASES.find((p) => min >= p.from && min < p.to) ?? PHASES[0];
};

// Calendário da NYSE: regra única em assets/sessions.js (também usada pelo robô de cotações).
export { sessionInfo };

/**
 * Agrupa barras de 5 min (arrays t,o,h,l,c,v) em sessões regulares (09:30-16:00 NY).
 * Retorna [{ date, idx: [posições] }] em ordem cronológica.
 */
export function splitSessions(bars) {
  const map = new Map();
  bars.t.forEach((t, i) => {
    const { date, min } = nyParts(t);
    if (min < OPEN || min >= CLOSE) return;
    if (!map.has(date)) map.set(date, []);
    map.get(date).push(i);
  });
  return [...map.entries()]
    .sort((a, b) => (a[0] < b[0] ? -1 : 1))
    .map(([date, idx]) => ({ date, idx }));
}

/**
 * Leitura do pregão. `bars`: { t (s), o, h, l, c, v } de 5 min, vários dias. `now` em segundos (padrão: agora).
 * Retorna null se não houver sessão suficiente.
 */
/** Séries e níveis do pregão de hoje (e do anterior) usados pelas regras intradiárias; null se não houver barras suficientes. */
function intradayContext(bars, now) {
  const sessions = splitSessions(bars);
  if (!sessions.length) return null;
  const today = sessions.at(-1);
  const prev = sessions.at(-2) ?? null;
  const ti = today.idx;
  const info = sessionInfo(today.date);
  if (ti.length < 3) return null;
  const pick = (k, idx) => idx.map((i) => bars[k][i]);
  const all = sessions.flatMap((s) => s.idx);
  const sess = all.map((i) => nyParts(bars.t[i]).date);
  const H = pick("h", all);
  const L = pick("l", all);
  const C = pick("c", all);
  const V = pick("v", all);
  const n = all.length;
  const off = n - ti.length; // posição de hoje dentro das séries concatenadas
  const lastI = n - 1;
  const c = C[lastI];
  const lastT = bars.t[ti.at(-1)];
  const live =
    now - lastT < 15 * 60 && nyParts(now).date === today.date && nyParts(now).min < info.closeMin;
  const nowMin = live ? nyParts(now).min : nyParts(lastT).min;
  const phase = live ? phaseAt(nowMin, info.closeMin) : PHASES.at(-1);

  const vw = T.vwapSessions(H, L, C, V, sess);
  const e9 = T.ema(C, 9);
  const e21 = T.ema(C, 21);
  const r = T.rsi(C, 14);
  const a = T.atr(H, L, C, 14);
  const unit = (a[lastI] ?? c * 0.001) * Math.sqrt(6); // oscilação típica de ~30 min
  const dayO = bars.o[ti[0]];
  const dayH = Math.max(...pick("h", ti));
  const dayL = Math.min(...pick("l", ti));
  const prevClose = prev ? bars.c[prev.idx.at(-1)] : null;
  const prevH = prev ? Math.max(...pick("h", prev.idx)) : null;
  const prevL = prev ? Math.min(...pick("l", prev.idx)) : null;
  const piv = prev ? T.pivotsClassic(prevH, prevL, prevClose) : null;
  const orBars = ti.filter((i) => nyParts(bars.t[i]).min < OPEN + 30);
  const orDone = nowMin >= OPEN + 30 || ti.length > orBars.length;
  const orH = Math.max(...pick("h", orBars));
  const orL = Math.min(...pick("l", orBars));
  const hasVol = T.hasVolume(V);
  const orEndBrt = brtClock(bars.t[ti[0]] + 30 * 60); // fim da faixa de abertura, em horário de Brasília

  // volume acumulado de hoje contra a média das sessões anteriores no mesmo horário
  let relVol = null;
  if (hasVol && prev) {
    const k = ti.length;
    const cum = (idx) => idx.slice(0, k).reduce((s, i) => s + bars.v[i], 0);
    const hist = sessions
      .slice(0, -1)
      .filter((s) => s.idx.length >= k)
      .map((s) => cum(s.idx));
    if (hist.length) relVol = cum(ti) / (hist.reduce((x, y) => x + y, 0) / hist.length);
  }

  const todayH = H.slice(off);
  const todayL = L.slice(off);
  const sw = T.swings(todayH, todayL, 2).map((s) => ({ ...s, i: s.i + off }));
  const dow = T.dowStructure(sw);
  return {
    bars,
    sessions,
    today,
    prev,
    ti,
    info,
    pick,
    all,
    sess,
    H,
    L,
    C,
    V,
    n,
    off,
    lastI,
    c,
    lastT,
    live,
    nowMin,
    phase,
    vw,
    e9,
    e21,
    r,
    unit,
    dayO,
    dayH,
    dayL,
    prevClose,
    prevH,
    prevL,
    piv,
    orBars,
    orDone,
    orH,
    orL,
    hasVol,
    orEndBrt,
    relVol,
    todayH,
    todayL,
    sw,
    dow,
  };
}

/** Votos intradiários: VWAP, faixa de abertura, médias, RSI, volume, estrutura e níveis do dia anterior. */
function intradayVotes(k) {
  const {
    lastI,
    c,
    vw,
    e9,
    e21,
    r,
    unit,
    dayO,
    prevClose,
    prevH,
    prevL,
    orDone,
    orH,
    orL,
    orEndBrt,
    relVol,
    dow,
  } = k;
  const votes = [];
  const v = (id, dir, w, title, text, tip = id) =>
    votes.push(vote("hoje", id, dir, w, title, text, tip));
  const vwapNow = vw.vwap[lastI];
  const dv = (c - vwapNow) / unit;
  v("vwap", clamp(dv * 1.5), 25,
    c > vwapNow ? "Preço acima da VWAP (preço médio do dia)" : "Preço abaixo da VWAP (preço médio do dia)",
    `A VWAP (${num(vwapNow)}) é o preço médio pago por todos os negócios de hoje, ponderado pelo volume; grandes investidores a usam como referência. ${c > vwapNow ? "Estar acima significa que, em média, quem comprou hoje está no lucro: os compradores estão no controle" : "Estar abaixo significa que, em média, quem comprou hoje está no prejuízo: os vendedores estão no controle"}.`,
    "vwap"); // prettier-ignore
  if (!orDone) {
    v(
      "orb",
      0,
      15,
      "Faixa de abertura ainda se formando",
      `Os primeiros 30 minutos do pregão (até as ${orEndBrt} de Brasília) definem a faixa do dia: máxima ${num(orH)} e mínima ${num(orL)} até agora. Só vale agir quando o preço sair dela.`,
      "orb",
    );
  } else if (c > orH) {
    v(
      "orb",
      relVol && relVol < 0.8 ? 0.5 : 1,
      15,
      "Rompeu a faixa de abertura para cima",
      `O preço passou da máxima dos primeiros 30 minutos (${num(orH)}): os compradores venceram a briga da abertura${relVol && relVol >= 1.2 ? ", com volume acima do normal" : ""}.`,
      "orb",
    );
  } else if (c < orL) {
    v(
      "orb",
      relVol && relVol < 0.8 ? -0.5 : -1,
      15,
      "Rompeu a faixa de abertura para baixo",
      `O preço caiu abaixo da mínima dos primeiros 30 minutos (${num(orL)}): os vendedores venceram a briga da abertura${relVol && relVol >= 1.2 ? ", com volume acima do normal" : ""}.`,
      "orb",
    );
  } else {
    v(
      "orb",
      0,
      15,
      "Preço dentro da faixa de abertura",
      `O preço segue entre ${num(orL)} e ${num(orH)} (faixa dos primeiros 30 minutos): ainda não há vencedor. Rompimentos para fora dessa faixa são os sinais mais confiáveis do dia.`,
      "orb",
    );
  }
  if (isNum(e21[lastI])) {
    const up = e9[lastI] > e21[lastI];
    v("ema", up ? 0.8 : -0.8, 15,
      up ? "Médias curtas apontando para cima (5 min)" : "Médias curtas apontando para baixo (5 min)",
      `No gráfico de 5 minutos, a média rápida (9) está ${up ? "acima" : "abaixo"} da média lenta (21): o impulso dos últimos minutos é de ${up ? "alta" : "baixa"}.`, "ema");
  } // prettier-ignore
  v("dow", dow.trend === "up" ? 1 : dow.trend === "down" ? -1 : 0, 15,
    dow.trend === "up" ? "Topos e fundos mais altos hoje" : dow.trend === "down" ? "Topos e fundos mais baixos hoje" : "Sem direção clara hoje",
    dow.trend === "up" ? "Ao longo do dia, cada recuo termina mais alto que o anterior: o dia é de alta."
      : dow.trend === "down" ? "Ao longo do dia, cada repique termina mais baixo que o anterior: o dia é de baixa."
        : "Os topos e fundos de hoje ainda não mostram uma direção.", "dow"); // prettier-ignore
  if (prevH != null) {
    let d = 0;
    let t = "Dentro da faixa de ontem";
    let x = `O preço está entre a mínima (${num(prevL)}) e a máxima (${num(prevH)}) de ontem.`;
    if (c > prevH)
      [d, t, x] = [
        0.8,
        "Acima da máxima de ontem",
        `O preço superou a máxima de ontem (${num(prevH)}): os compradores dominam também na visão de 2 dias.`,
      ];
    if (c < prevL)
      [d, t, x] = [
        -0.8,
        "Abaixo da mínima de ontem",
        `O preço caiu abaixo da mínima de ontem (${num(prevL)}): os vendedores dominam também na visão de 2 dias.`,
      ];
    v("prevday", d, 10, t, x, "pivot");
  }
  if (prevClose != null) {
    const gap = dayO / prevClose - 1;
    if (Math.abs(gap) >= 0.003) {
      const filled = gap > 0 ? c < prevClose : c > prevClose;
      const holding = gap > 0 ? c > dayO : c < dayO;
      const d = filled ? -Math.sign(gap) * 0.8 : holding ? Math.sign(gap) * 0.6 : 0;
      v(
        "gap",
        d,
        10,
        `${gap > 0 ? "Abriu em alta" : "Abriu em queda"} (${pct(gap)}) e ${filled ? "já fechou o buraco" : holding ? "está segurando" : "está perdendo força"}`,
        `O ativo abriu ${pctU(gap)} ${gap > 0 ? "acima" : "abaixo"} do fechamento de ontem (${num(prevClose)}). ${filled ? "O preço voltou ao fechamento de ontem: o impulso da abertura se esgotou, sinal contrário ao do buraco" : holding ? "O preço mantém o ganho da abertura: o impulso continua" : "O preço devolveu parte do movimento da abertura"}.`,
        "gap",
      );
    }
  }
  if (isNum(r[lastI])) {
    const x = r[lastI];
    const d = x > 78 ? -0.5 : x < 22 ? 0.5 : (x - 50) / 50;
    v(
      "rsi5",
      d,
      10,
      x > 78
        ? "RSI de 5 min muito alto (esticado no curto prazo)"
        : x < 22
          ? "RSI de 5 min muito baixo (esticado no curto prazo)"
          : x > 55
            ? "RSI de 5 min com força compradora"
            : x < 45
              ? "RSI de 5 min com força vendedora"
              : "RSI de 5 min neutro",
      `O RSI de 5 minutos está em ${num(x, 0)}. ${x > 78 ? "O preço subiu rápido demais nos últimos minutos: perseguir agora é arriscado" : x < 22 ? "O preço caiu rápido demais nos últimos minutos: pode haver um repique" : "Sem extremos no curto prazo."}`,
      "rsi",
    );
  }
  if (relVol != null) {
    const dayMove = Math.sign(c - dayO);
    v(
      "relvol",
      relVol >= 1.3 ? dayMove * 0.8 : relVol < 0.7 ? 0 : dayMove * 0.2,
      10,
      relVol >= 1.3
        ? "Volume bem acima do normal para este horário"
        : relVol < 0.7
          ? "Volume fraco para este horário"
          : "Volume normal para este horário",
      `Até agora negociou-se ${num(relVol, 1)}x o volume habitual deste horário. ${relVol >= 1.3 ? "Movimento com muita gente participando: mais confiável" : relVol < 0.7 ? "Pouca gente participando: movimentos têm mais chance de ser falsos" : "Participação normal."}`,
      "relvol",
    );
  }
  return votes;
}

export function analyzeIntraday(bars, { now = Date.now() / 1000 } = {}) {
  const k = intradayContext(bars, now);
  if (!k) return null;
  const {
    today,
    prev,
    ti,
    pick,
    off,
    lastI,
    c,
    lastT,
    live,
    nowMin,
    phase,
    vw,
    e9,
    e21,
    r,
    unit,
    dayO,
    dayH,
    dayL,
    prevClose,
    prevH,
    prevL,
    piv,
    orDone,
    orH,
    orL,
    orEndBrt,
    relVol,
  } = k;
  const votes = intradayVotes(k);
  const vwapNow = vw.vwap[lastI];
  const dv = (c - vwapNow) / unit;
  const sum = summarize(votes);
  const verdict = verdictOf(sum.score);
  const dir = sum.score >= 20 ? 1 : sum.score <= -20 ? -1 : 0;

  // timing
  const extended = Math.abs(dv) > 2.2 || (isNum(r[lastI]) && (r[lastI] > 78 || r[lastI] < 22));
  const backTo =
    dir > 0 ? Math.max(vwapNow, e21[lastI] ?? vwapNow) : Math.min(vwapNow, e21[lastI] ?? vwapNow);
  let timing = {
    status: "none",
    text: "Sem direção clara hoje: melhor esperar o preço decidir.",
    zone: null,
  };
  if (dir !== 0) {
    if (live && phase.id === "open")
      timing = {
        status: "wait",
        text: `A abertura é a hora mais instável. Espere a faixa de abertura se formar (até as ${orEndBrt} de Brasília).`,
        zone: null,
      };
    else if (extended)
      timing = {
        status: "wait",
        text: `O preço já andou rápido demais ${dir > 0 ? "para cima" : "para baixo"}. Espere voltar perto de ${num(backTo)} (VWAP/média) para entrar com risco menor.`,
        zone: [
          Math.min(backTo, backTo + dir * 0.3 * unit),
          Math.max(backTo, backTo + dir * 0.3 * unit),
        ],
      };
    else if (live && (phase.id === "lunch" || phase.id === "close"))
      timing = { status: "wait", text: `${phase.name}: ${phase.tip}`, zone: null };
    else
      timing = {
        status: "enter",
        text: "O preço está perto da VWAP e a favor do dia: zona razoável para entrar.",
        zone: null,
      };
  }

  const supports = [vwapNow, orL, prevL, piv?.s1, piv?.s2, dayL]
    .filter((x) => isNum(x) && x < c)
    .sort((p, q) => q - p);
  const resistances = [orH, prevH, piv?.r1, piv?.r2, dayH]
    .filter((x) => isNum(x) && x > c)
    .sort((p, q) => p - q);
  let plan = null;
  if (dir !== 0) {
    const entryPrice =
      timing.status === "wait" && timing.zone ? (timing.zone[0] + timing.zone[1]) / 2 : c;
    plan = buildPlan({
      dir,
      price: entryPrice,
      unit,
      supports,
      resistances,
      stopMin: 0.8,
      stopMax: 2.5,
    });
  }

  return {
    live,
    date: today.date,
    prevDate: prev?.date ?? null,
    lastT,
    phase,
    nowMin,
    price: c,
    unit,
    votes,
    ...sum,
    verdict,
    dir,
    timing,
    plan,
    levels: {
      dayV: pick("v", ti).reduce((x, y) => x + y, 0),
      vwap: vwapNow,
      orH: orDone || ti.length > 6 ? orH : null,
      orL: orDone || ti.length > 6 ? orL : null,
      prevH,
      prevL,
      prevClose,
      dayH,
      dayL,
      dayO,
      pivots: piv,
    },
    relVol,
    src: bars,
    series: {
      idx: ti, vwap: vw.vwap.slice(off), vwapUp: vw.up.slice(off), vwapLo: vw.lo.slice(off),
      ema9: e9.slice(off), ema21: e21.slice(off), rsi: r.slice(off),
    }, // prettier-ignore
  };
}

// ───────────────────────── resposta final (diário + hoje) ─────────────────────────

/**
 * Junta o quadro diário (direção maior) com a leitura do dia (momento da entrada) em uma frase de ação.
 * Retorna { key, tone, headline, why, action }. `intra` pode ser null (sem dados do pregão).
 */
export function finalCall(daily, intra) {
  const dd = daily?.dir ?? 0;
  const di = intra?.dir ?? 0;
  const dTxt = daily?.verdict?.label ?? "–";
  if (!daily)
    return {
      key: "none",
      tone: "wait",
      headline: "Sem dados suficientes",
      why: "Faltam dados para analisar este ativo.",
      action: "",
    };
  if (!intra) {
    return dd > 0
      ? {
          key: "daily-buy",
          tone: "buy",
          headline:
            dd && daily.timing.status === "wait"
              ? "Bom ativo, mas espere um recuo"
              : "Tendência favorece comprar",
          why: "Leitura só do quadro diário (sem dados do pregão de hoje).",
          action: daily.timing.text,
        }
      : dd < 0
        ? {
            key: "daily-sell",
            tone: "sell",
            headline: "Tendência favorece vender ou reduzir",
            why: "Leitura só do quadro diário (sem dados do pregão de hoje).",
            action: daily.timing.text,
          }
        : {
            key: "daily-wait",
            tone: "wait",
            headline: "Aguardar",
            why: "O quadro diário está equilibrado.",
            action: daily.timing.text,
          };
  }
  if (dd > 0 && di > 0) {
    const ok = daily.timing.status === "enter" && intra.timing.status === "enter";
    return ok
      ? {
          key: "buy-now",
          tone: "buy",
          headline: "COMPRAR AGORA",
          why: "A tendência dos últimos meses e o movimento de hoje apontam para cima.",
          action: "Entrada razoável agora. Use a saída (stop) do plano de hoje.",
        }
      : {
          key: "buy-wait",
          tone: "buy",
          headline: "COMPRAR, mas espere um pouco",
          why: "Tendência e dia apontam para cima, porém o preço está esticado ou o horário não ajuda.",
          action: intra.timing.status === "wait" ? intra.timing.text : daily.timing.text,
        };
  }
  if (dd > 0 && di <= 0)
    return {
      key: "buy-dip",
      tone: "wait",
      headline: "AGUARDAR: bom ativo, dia fraco",
      why: `O quadro diário é de ${dTxt.toLowerCase()}, mas hoje o preço está sem força (abaixo da VWAP ou perdendo a faixa de abertura).`,
      action:
        "Não entre ainda. Uma entrada melhor aparece quando o preço voltar a ficar acima da VWAP.",
    };
  if (dd < 0 && di < 0)
    return {
      key: "sell-now",
      tone: "sell",
      headline: "VENDER / REDUZIR",
      why: "A tendência dos últimos meses e o movimento de hoje apontam para baixo.",
      action:
        intra.timing.status === "wait"
          ? intra.timing.text
          : "Se já tem, reduza. Se não tem, evite comprar.",
    };
  if (dd < 0 && di >= 0)
    return {
      key: "sell-bounce",
      tone: "wait",
      headline: "CUIDADO: alta de hoje é contra a tendência",
      why: "A tendência maior é de baixa e o dia está subindo: pode ser só um repique.",
      action:
        "Quem está comprado pode aproveitar para reduzir. Evite comprar com a tendência maior contra.",
    };
  if (di > 0)
    return {
      key: "intra-buy",
      tone: "wait",
      headline: "Só o dia está forte: operação curta",
      why: "A tendência maior está indefinida, mas hoje o preço está forte.",
      action: "Se entrar, é uma operação curta de um dia, com saída curta.",
    };
  if (di < 0)
    return {
      key: "intra-sell",
      tone: "wait",
      headline: "Só o dia está fraco: evite entrar",
      why: "A tendência maior está indefinida e hoje o preço está fraco.",
      action: "Melhor esperar.",
    };
  return {
    key: "wait",
    tone: "wait",
    headline: "AGUARDAR",
    why: "Nem a tendência dos últimos meses nem o movimento de hoje dão vantagem clara.",
    action: "Sem pressa: oportunidades melhores aparecem.",
  };
}
