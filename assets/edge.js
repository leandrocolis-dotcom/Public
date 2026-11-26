// "Vantagem" (edge) na prática: o que a pesquisa sobre traders lucrativos manda checar antes de agir.
// Funções puras (sem DOM). Base: lições 9 a 17 de "Aprenda" (assets/ta-glossary.js) e docs/ANALISE-TECNICA.md §4.1.
//
// - tradeStats: métricas em R (expectativa, profit factor, payoff, acerto de equilíbrio, SQN, drawdown).
// - simulateR: trades simulados sem olhar o futuro (entra na abertura seguinte, stop em ATR, custo por perna).
// - regimeOf: regime do mercado (S&P acima/abaixo da média de 200 dias e volatilidade).
// - momentumRank: momentum 12-1 (Jegadeesh e Titman) e 6 meses, em percentil do universo.
// - sectorRotation: "sistema-semente" da lição 17 (top 3 setores em 6 meses, só com o S&P acima da MM200).
// - edgeOf / applyEdge: junta tudo num veredito de vantagem e ajusta a decisão final.

import { decSep } from "./format.js";
export const COST = 0.0005; // 0,05% por perna (spread + escorregamento), conservador para ETFs líquidos
export const MIN_TRADES = 10; // abaixo disso, a amostra não decide nada

const mean = (xs) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);
const sd = (xs) => {
  if (xs.length < 2) return null;
  const m = mean(xs);
  return Math.sqrt(xs.reduce((a, x) => a + (x - m) ** 2, 0) / (xs.length - 1));
};

/** Métricas de uma lista de resultados em R (múltiplos do risco inicial). */
export function tradeStats(rs) {
  const xs = (rs ?? []).filter((x) => Number.isFinite(x));
  const n = xs.length;
  if (!n) return { n: 0 };
  const wins = xs.filter((x) => x > 0);
  const losses = xs.filter((x) => x <= 0);
  const avgWin = mean(wins) ?? 0;
  const avgLoss = losses.length ? -mean(losses) : 0;
  const grossWin = wins.reduce((a, b) => a + b, 0);
  const grossLoss = -losses.reduce((a, b) => a + b, 0);
  const payoff = avgLoss > 0 && wins.length ? avgWin / avgLoss : null;
  const s = sd(xs);
  let eq = 0;
  let peak = 0;
  let maxDD = 0;
  for (const x of xs) {
    eq += x;
    peak = Math.max(peak, eq);
    maxDD = Math.max(maxDD, peak - eq);
  }
  const exp = mean(xs);
  return {
    n,
    winRate: wins.length / n,
    avgWin,
    avgLoss,
    payoff,
    expectancy: exp,
    profitFactor: grossLoss > 0 ? grossWin / grossLoss : grossWin > 0 ? Infinity : null,
    breakeven: payoff != null ? 1 / (1 + payoff) : null,
    sqn: s ? (Math.sqrt(n) * exp) / s : null,
    maxDD,
    total: eq,
  };
}

/**
 * Simula trades a partir dos dias de sinal (índices i). Sem olhar o futuro: entra na ABERTURA de i+1,
 * stop a `stopAtr`×ATR(i) da entrada, sai no stop (se a mínima/máxima tocar) ou no fechamento de i+h.
 * Desconta `cost` por perna. Devolve a lista de resultados em R. dir: 1 compra, -1 venda.
 */
export function simulateR(bars, idx, atr, { dir = 1, stopAtr = 2.5, h = 20, cost = COST } = {}) {
  const { o, h: hi, l: lo, c } = bars;
  const out = [];
  let busyUntil = -1;
  for (const i of idx) {
    if (i <= busyUntil || i + h >= c.length || !(atr[i] > 0)) continue; // só trades com a janela completa
    const entry = o[i + 1] > 0 ? o[i + 1] : c[i];
    const risk = stopAtr * atr[i];
    const stop = entry - dir * risk;
    const last = i + h;
    let exit = c[last];
    let j = i + 1;
    for (; j <= last; j++) {
      const hit = dir > 0 ? lo[j] <= stop : hi[j] >= stop;
      if (hit) {
        // gap além do stop: sai na abertura (pior que o stop), como na vida real
        exit = dir > 0 ? Math.min(stop, o[j] || stop) : Math.max(stop, o[j] || stop);
        break;
      }
    }
    const gross = dir * (exit - entry);
    const fees = cost * (entry + exit);
    out.push((gross - fees) / risk);
    busyUntil = Math.min(j, last);
  }
  return out;
}

const sma = (s, i, n) => {
  if (i + 1 < n) return null;
  let t = 0;
  for (let k = i - n + 1; k <= i; k++) t += s[k];
  return t / n;
};
function realizedVol(s, i, n = 20) {
  if (i < n) return null;
  const r = [];
  for (let k = i - n + 1; k <= i; k++) r.push(Math.log(s[k] / s[k - 1]));
  return sd(r) * Math.sqrt(252);
}

/**
 * Regime do mercado a partir dos fechamentos do S&P 500 (SPY).
 * bull = acima da MM200; calm = volatilidade de 20 dias abaixo da mediana do último ano.
 */
export function regimeOf(closes) {
  const s = (closes ?? []).filter((x) => x > 0);
  const i = s.length - 1;
  const m200 = sma(s, i, 200);
  if (m200 == null) return null;
  const vol = realizedVol(s, i);
  const hist = [];
  for (let k = Math.max(21, i - 251); k <= i; k++) hist.push(realizedVol(s, k));
  const sorted = hist.filter((x) => x != null).sort((a, b) => a - b);
  const volMed = sorted[Math.floor(sorted.length / 2)] ?? vol;
  const bull = s[i] > m200;
  const calm = vol != null && vol <= volMed;
  const dist = s[i] / m200 - 1;
  return {
    bull,
    calm,
    price: s[i],
    sma200: m200,
    dist,
    vol,
    volMed,
    label: bull ? (calm ? "Alta calma" : "Alta agitada") : calm ? "Baixa calma" : "Baixa agitada",
    text: bull
      ? `S&P ${(dist * 100).toFixed(1).replace(".", decSep())}% acima da média de 200 dias: regime de alta. Compras a favor da tendência têm o vento a favor.`
      : `S&P ${(Math.abs(dist) * 100).toFixed(1).replace(".", decSep())}% abaixo da média de 200 dias: regime de baixa. Compras de ações vão contra a maré: tamanho pela metade ou caixa.`,
  };
}

/** Momentum 12-1 (12 meses sem o último) e 6 meses, com percentil (0 a 1) dentro do universo dado. */
export function momentumRank(map) {
  const rows = [];
  for (const [sym, raw] of Object.entries(map ?? {})) {
    const s = (raw ?? []).filter((x) => x > 0);
    const n = s.length;
    if (n < 253) continue;
    rows.push({ sym, m12: s[n - 22] / s[n - 253] - 1, m6: s[n - 1] / s[n - 127] - 1 });
  }
  const rank = (key) => {
    const sorted = [...rows].sort((a, b) => a[key] - b[key]);
    sorted.forEach((r, k) => (r[`${key}Pct`] = rows.length > 1 ? k / (rows.length - 1) : 0.5));
  };
  rank("m12");
  rank("m6");
  return Object.fromEntries(rows.map((r) => [r.sym, r]));
}

/** Sistema-semente: top `k` setores por retorno de 6 meses se o S&P está acima da MM200; senão, caixa (SGOV). */
export function sectorRotation(map, spy, k = 3) {
  const reg = regimeOf(spy);
  const ranks = momentumRank(map);
  const ranked = Object.values(ranks).sort((a, b) => b.m6 - a.m6);
  return {
    regime: reg,
    ranked,
    picks: reg?.bull ? ranked.slice(0, k).map((r) => r.sym) : [],
    cash: !reg?.bull,
  };
}

/** Teto de exposição por Kelly fracionado (¼): só com amostra suficiente e expectativa positiva. */
export function kellyQuarter(st) {
  if (!st || st.n < 20 || !(st.expectancy > 0) || !st.payoff) return null;
  const f = st.winRate - (1 - st.winRate) / st.payoff;
  return f > 0 ? f / 4 : null;
}

const RISK_GROUPS = new Set(["Ações EUA", "Ações Globais", "Setores"]);

/**
 * Vantagem de uma decisão: junta o histórico em R do próprio ativo, o regime do mercado, o momentum
 * relativo e o tipo de produto. Devolve { grade, flags[], sizeMult, block, stats }.
 * grade: "A" (vantagem medida e contexto a favor), "B" (vantagem medida), "C" (sem evidência suficiente),
 * "D" (expectativa negativa medida). block = true rebaixa a decisão para "aguardar".
 */
export function edgeOf({ dir, stats, regime, mom, group, decay = false, macro = null }) {
  const flags = [];
  if (!dir) return { grade: null, flags, sizeMult: 1, block: false, stats };
  let grade = "C";
  let block = false;
  if (stats?.n >= MIN_TRADES) {
    if (stats.expectancy > 0) {
      grade = "B";
      flags.push({
        ok: true,
        text: `Expectativa positiva neste ativo: ${fmtR(stats.expectancy)} por operação em ${stats.n} sinais (já com custos)`,
      });
    } else {
      grade = "D";
      block = true;
      flags.push({
        ok: false,
        text: `Expectativa negativa neste ativo: ${fmtR(stats.expectancy)} por operação em ${stats.n} sinais. Sem vantagem medida, a regra é não operar`,
      });
    }
  } else
    flags.push({
      ok: null,
      text: `Poucos sinais parecidos neste ativo (${stats?.n ?? 0}): sem evidência suficiente para medir a vantagem`,
    });
  let sizeMult = 1;
  const risky = RISK_GROUPS.has(group);
  if (regime && risky) {
    if (dir > 0 && !regime.bull) {
      sizeMult = 0.5;
      flags.push({
        ok: false,
        text: "Mercado em regime de baixa (S&P abaixo da MM200): compra contra a maré, use metade do tamanho",
      });
    } else if (dir > 0)
      flags.push({ ok: true, text: "Regime de alta (S&P acima da MM200): tendência a favor" });
  }
  if (mom) {
    const p = mom.m12Pct;
    if (dir > 0 && p >= 0.7)
      flags.push({
        ok: true,
        text: `Momentum forte: entre os ${Math.round((1 - p) * 100) || 1}% melhores do universo em 12 meses`,
      });
    else if (dir > 0 && p <= 0.3)
      flags.push({
        ok: false,
        text: "Momentum fraco: entre os piores do universo em 12 meses (comprar o mais fraco tem pior histórico)",
      });
    else if (dir < 0 && p <= 0.3) flags.push({ ok: true, text: "Momentum fraco confirma a saída" });
  }
  if (decay) {
    sizeMult = Math.min(sizeMult, 0.5);
    flags.push({
      ok: false,
      text: "Produto com decaimento (inverso, alavancado ou futuros de VIX): só como proteção tática e por poucos dias",
    });
  }
  // contexto macro em modo sombra: aparece, mas não muda nota nem tamanho até o diário provar que acerta
  if (macro && Math.abs(macro.score) >= 0.3) {
    const fav = dir > 0 === macro.score > 0;
    flags.push({
      ok: null,
      shadow: true,
      text: `Macro (modo sombra): regime de ${macro.regime.label.toLowerCase()} ${fav ? "favorece" : "pesa contra"} ${dir > 0 ? "esta compra" : "esta saída"} (${macro.name}: ${macro.score > 0 ? "+" : ""}${macro.score.toFixed(1)} na inclinação histórica e nas notícias)`,
    });
  }
  if (grade === "B" && stats.expectancy >= 0.2 && flags.every((f) => f.ok !== false)) grade = "A";
  return { grade, flags, sizeMult, block, stats };
}

export const fmtR = (x) =>
  x == null ? "–" : `${x >= 0 ? "+" : "−"}${Math.abs(x).toFixed(2).replace(".", decSep())}R`;

export const GRADE_TXT = {
  A: "Vantagem medida e contexto a favor",
  B: "Vantagem medida",
  C: "Sem evidência suficiente",
  D: "Sem vantagem (expectativa negativa)",
};

/**
 * Aplica a vantagem à decisão final (resposta da lista, detalhe e vigiados). Sinal de compra/venda com
 * expectativa negativa medida vira "aguardar"; regime contra e produtos com decaimento entram na ação.
 */
export function applyEdge(call, edge) {
  if (!call || !edge?.grade) return call;
  const out = { ...call, edge };
  if (edge.block && call.tone !== "wait") {
    const buy = call.tone === "buy";
    return {
      ...out,
      key: `${call.key}-noedge`,
      tone: "wait",
      headline: buy
        ? "AGUARDAR: compra sem vantagem medida"
        : "AGUARDAR: venda sem vantagem medida",
      why: `${call.why} Mas, neste ativo, esse tipo de sinal teve expectativa negativa no passado (${fmtR(edge.stats.expectancy)} por operação, já com custos).`,
      action:
        "Sem vantagem comprovada, a decisão disciplinada é não operar. Espere um sinal com histórico melhor.",
    };
  }
  if (edge.sizeMult < 1 && call.tone !== "wait")
    out.action = `${call.action} Use metade do tamanho normal (${edge.flags.find((f) => f.ok === false)?.text.split(":")[0] ?? "contexto contra"}).`;
  return out;
}
