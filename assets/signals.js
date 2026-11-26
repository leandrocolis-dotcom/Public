// Sinais de entrada e de saída por ativo (funções puras, sobre fechamentos diários + preço ao vivo).
// São regras técnicas simples, não recomendação. O histórico de cada regra é medido em ruleStats().

const mean = (xs) => xs.reduce((a, b) => a + b, 0) / xs.length;
function std(xs) {
  if (xs.length < 2) return 0;
  const m = mean(xs);
  return Math.sqrt(xs.reduce((a, b) => a + (b - m) ** 2, 0) / (xs.length - 1));
}
const sma = (s, i, w) => (i - w + 1 < 0 ? null : mean(s.slice(i - w + 1, i + 1)));

/** RSI simples de 14 (mesma definição do Pêndulo) no índice i. */
export function rsiAt(s, i) {
  if (i < 14) return null;
  let g = 0;
  let l = 0;
  for (let k = i - 13; k <= i; k++) {
    const d = s[k] - s[k - 1];
    if (d > 0) g += d;
    else l -= d;
  }
  return l === 0 ? 100 : 100 - 100 / (1 + g / l);
}

/** Indicadores no índice i (precisa de ~210 pregões para a MM200). */
export function indicators(s, i) {
  if (i < 30) return null;
  const daily = [];
  for (let k = Math.max(1, i - 19); k <= i; k++) daily.push(s[k] / s[k - 1] - 1);
  const vol20 = std(daily);
  const r1 = s[i] / s[i - 1] - 1;
  const r5 = s[i] / s[i - 5] - 1;
  const r5prev = s[i - 1] / s[i - 6] - 1;
  const high20 = Math.max(...s.slice(i - 19, i + 1));
  const low10prev = Math.min(...s.slice(i - 10, i)); // mínima dos 10 pregões anteriores (sem hoje)
  return {
    price: s[i],
    r1,
    r5,
    vol20,
    z5: vol20 > 0 ? r5 / (vol20 * Math.sqrt(5)) : 0,
    z5prev: vol20 > 0 ? r5prev / (vol20 * Math.sqrt(5)) : 0,
    rsi: rsiAt(s, i),
    rsiPrev: rsiAt(s, i - 1),
    rsiMin3: Math.min(rsiAt(s, i - 1) ?? 100, rsiAt(s, i - 2) ?? 100, rsiAt(s, i - 3) ?? 100),
    ma50: sma(s, i, 50),
    ma50prev: sma(s, i - 1, 50),
    ma200: sma(s, i, 200),
    ma200prev: sma(s, i - 1, 200),
    prev: s[i - 1],
    high20,
    dd20: s[i] / high20 - 1,
    low10prev,
  };
}

/**
 * Regras. Cada uma: { code, kind, title, desc, test(ind) -> força 0..1 (0 = não disparou) }.
 * kind: "entry" (oportunidade de entrada), "exit" (expectativa de devolução: reduzir/realizar),
 *       "risk" (alerta de risco para posições; NÃO antecipa queda no histórico, ver ruleStats).
 * Seleção feita com 47 ativos × 1.000 pregões (2022-2026): ficaram só as regras com vantagem sobre a base,
 * além dos dois alertas de risco clássicos, exibidos com o histórico real.
 */
export const RULES = [
  {
    code: "reversal",
    kind: "entry",
    title: "Reversão após queda forte",
    desc: "Caiu forte em 5 dias (≤ −1,5σ), o RSI esteve abaixo de 30 e hoje vira para cima: a venda perde força.",
    test: (x) =>
      x.z5prev <= -1.5 && x.rsiMin3 < 30 && x.r1 > 0 && x.rsi > x.rsiPrev
        ? Math.min(1, -x.z5prev / 3)
        : 0,
  },
  {
    code: "dip",
    kind: "entry",
    title: "Recuo em tendência de alta",
    desc: "Tendência de alta (acima das médias de 50 e 200) com recuo de 5 dias ≤ −1,25σ e o dia de hoje estabilizando.",
    test: (x) =>
      x.ma200 && x.price > x.ma200 && x.ma50 > x.ma200 && x.z5 <= -1.25 && x.r1 >= 0
        ? Math.min(1, -x.z5 / 2.5)
        : 0,
  },
  {
    code: "pullback10",
    kind: "entry",
    title: "Fraqueza de curto prazo: mínima de 10 dias",
    desc: "Fechou abaixo da mínima dos 10 pregões anteriores com RSI abaixo de 35: no histórico, a fraqueza curta costuma ser devolvida nos dias seguintes (comprar o rompimento para cima, ao contrário, rendeu menos que a média).",
    // Backtest 2022-2026 (47 ETFs, 1.000 pregões): 5 dias +0,69% (base +0,29%), 56% de alta; 10 dias +1,09% (base +0,57%)
    test: (x) =>
      x.low10prev && x.price < x.low10prev && x.rsi < 35 ? Math.min(1, (35 - x.rsi) / 20 + 0.3) : 0,
  },
  {
    code: "stretched",
    kind: "exit",
    title: "Esticado: risco de devolução",
    desc: "Alta de 5 dias ≥ +2σ com RSI acima de 75: historicamente o retorno dos 5 dias seguintes fica perto de zero. Bom momento para realizar parte.",
    test: (x) => (x.z5 >= 2 && x.rsi > 75 ? Math.min(1, x.z5 / 4 + (x.rsi - 75) / 50) : 0),
  },
  {
    code: "rally_down",
    kind: "exit",
    title: "Repique até a resistência em tendência de baixa",
    desc: "Em tendência de baixa (abaixo da MM200 e MM50 < MM200), o preço volta à média de 50: costuma ser oportunidade de reduzir, não de comprar.",
    test: (x) =>
      x.ma200 &&
      x.price < x.ma200 &&
      x.ma50 < x.ma200 &&
      x.price >= x.ma50 * 0.995 &&
      x.prev < x.ma50prev
        ? 0.6
        : 0,
  },
  {
    code: "lost200",
    kind: "risk",
    title: "Perdeu a média de 200 dias",
    desc: "Rompeu para baixo a média de 200. Alerta de proteção, não de ganho: em 10 anos (40 ETFs) não antecipou queda, mas sair por 20 pregões cortou a pior queda de −43% para −36%, ao custo de 1,3 p.p. de rendimento ao ano (docs/ESTUDO-GATILHOS.md).",
    test: (x) => (x.ma200 && x.ma200prev && x.prev >= x.ma200prev && x.price < x.ma200 ? 0.6 : 0),
  },
  {
    code: "breakdown",
    kind: "risk",
    title: "Queda além do ruído",
    desc: "Recuo desde a máxima de 20 dias maior que 2,5 vezes a oscilação normal de 5 dias. Alerta de risco/limite de perda: no histórico recente o preço costumou repicar depois.",
    test: (x) => {
      const lim = -2.5 * x.vol20 * Math.sqrt(5);
      return x.dd20 < lim ? Math.min(1, x.dd20 / lim / 2) : 0;
    },
  },
];

/**
 * Contexto da tendência (MM50/MM200) para o sinal: as regras daqui são de curto prazo e podem ir CONTRA a
 * tendência que a aba Quando entrar e a Análise seguem. Devolve um aviso curto ou "" quando não há conflito.
 */
export function trendContext(kind, x) {
  if (!x?.ma200 || !x?.ma50) return "";
  const up = x.price > x.ma200 && x.ma50 > x.ma200;
  const down = x.price < x.ma200 && x.ma50 < x.ma200;
  if (kind === "entry" && down)
    return "Contra a tendência de baixa (abaixo das médias de 50 e 200 dias): aposta de repique curto; a aba Quando entrar tende a indicar cautela.";
  if (kind !== "entry" && up)
    return "A tendência de fundo segue de alta: sinal para realizar parte ou proteger, não para zerar; a aba Quando entrar pode continuar positiva.";
  return "";
}

/** Sinais ativos no último pregão de uma série. */
export function signalsFor(s, { sym, label } = {}) {
  if (!s || s.length < 60) return [];
  const x = indicators(s, s.length - 1);
  if (!x) return [];
  const out = [];
  for (const r of RULES) {
    const strength = r.test(x);
    if (strength > 0)
      out.push({
        sym,
        label: label ?? sym,
        code: r.code,
        kind: r.kind,
        title: r.title,
        desc: r.desc,
        strength,
        ind: x,
        context: trendContext(r.kind, x),
      });
  }
  return out;
}

/**
 * Histórico de cada regra num conjunto de séries: quantas vezes disparou e o que aconteceu nos 5 pregões
 * seguintes. Para entrada, "acerto" = subiu; para saída, "acerto" = caiu (ou seja, sair evitou perda).
 * Amostra curta e com sobreposição entre ativos: é indicativo, não prova estatística.
 */
export function ruleStats(seriesList, horizon = 5) {
  const base = { n: 0, up: 0, sum: 0 };
  const acc = Object.fromEntries(RULES.map((r) => [r.code, { n: 0, hits: 0, sum: 0 }]));
  for (const s of seriesList) {
    if (!s || s.length < 230) continue;
    for (let i = 210; i < s.length - horizon; i++) {
      const x = indicators(s, i);
      if (!x) continue;
      const fwd = s[i + horizon] / s[i] - 1;
      base.n++;
      base.sum += fwd;
      if (fwd > 0) base.up++;
      for (const r of RULES) {
        if (!(r.test(x) > 0)) continue;
        const a = acc[r.code];
        a.n++;
        a.sum += fwd;
        if (r.kind === "entry" ? fwd > 0 : fwd < 0) a.hits++; // saída/risco: "acerto" = caiu depois
      }
    }
  }
  const rules = Object.fromEntries(
    Object.entries(acc).map(([k, a]) => [
      k,
      { n: a.n, hitRate: a.n ? a.hits / a.n : null, avgFwd: a.n ? a.sum / a.n : null },
    ]),
  );
  return {
    horizon,
    base: {
      n: base.n,
      upRate: base.n ? base.up / base.n : null,
      avgFwd: base.n ? base.sum / base.n : null,
    },
    rules,
  };
}
