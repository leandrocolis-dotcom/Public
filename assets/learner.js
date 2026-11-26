// Aprendizado do modelo de análise a partir do Simulador (modo sombra). Funções puras e testadas
// (tests/learner.test.js); quem roda é scripts/train-model.mjs, todo dia depois do fechamento, gravando
// data/model.json (estado do modelo) e data/model-journal.json (diário fora da amostra).
//
// Ciclo:
// 1. DIÁRIO FORA DA AMOSTRA: cada pregão grava os gatilhos que a aba Sinais de hoje mostraria naquele dia (com a decisão
//    do modelo atual e a do modelo em treino) e, 5 pregões depois, o resultado (Atingiu/Parcial/Não atingiu).
//    Só esse diário decide: o backtest do último ano aparece apenas como prévia (as regras foram escolhidas com
//    esses mesmos anos, então ele é otimista).
// 2. LÓGICAS: cada combinação tipo + gatilho + tom (ex.: "sinal recuo em alta → comprar") é uma lógica. Os ativos
//    andam juntos, então cada DIA conta como uma observação (média dos gatilhos daquele dia). Com 30+ dias,
//    aproveitamento < 60% elimina; ≥ 60% aprova. Eliminação antecipada se, com 15+ dias, nem o limite otimista
//    (90%) chega a 60%. Uma eliminada só volta com ≥ 63% (evita liga-desliga).
// 3. PESOS DA DECISÃO: a cada retreino semanal, mede quanto cada sub-análise (técnica, fundamentos, mercado,
//    situações parecidas) acerta sozinha a direção em 5 pregões e move o peso devagar (25% do caminho), dentro de
//    0,5× a 1,5× do peso original.
// 4. MODELO FINAL: 60+ pregões de diário, 3+ lógicas aprovadas, 2+ delas mandando comprar ou vender (só "esperar"
//    não serve para operar), todas com 30+ dias, ≥ 60% e limite pessimista ≥ 50%,
//    e 4 retreinos seguidos sem mudar as lógicas aprovadas nem os pesos (variação < 2 p.p.). Aí o modelo congela
//    e a tela avisa. Depois disso o treino só monitora: se uma lógica aprovada cair abaixo de 55% nos últimos 30
//    gatilhos, aparece um alerta de degradação (nada muda sozinho).
//
// v2 (docs/ROADMAP-APRENDIZADO.md, autorizado pelo usuário em 09/10/2026): cada gatilho também é medido em R
// (stop de 2,5 ATR, custo por perna) no horizonte da lógica (decisões 20 pregões; sinais e níveis 5), em EXCESSO
// sobre a média do universo no mesmo dia (tira a "maré" do mercado), e separado por regime (S&P × MM200).
// Lógicas que mandam operar passam a ser aprovadas pela expectativa em excesso (com correção de Benjamini-Hochberg
// para testes múltiplos); "esperar" segue pelo aproveitamento. Pesos pela correlação de postos com o excesso.
// O acerto antigo continua calculado e exibido. O modelo segue em MODO SOMBRA.
import { SUB_W } from "./decision.js";

export const RULES = {
  threshold: 0.6, // aproveitamento mínimo de uma lógica
  revive: 0.63, // eliminada só volta acima disto
  minN: 30, // DIAS distintos com gatilho encerrado, fora da amostra, para decidir
  earlyN: 15, // eliminação antecipada a partir daqui (dias)
  z: 1.645, // 90% bilateral (limites de confiança)
  finalLower: 0.5, // limite pessimista mínimo das aprovadas no modelo final
  finalSessions: 60, // pregões de diário
  finalApproved: 3, // lógicas aprovadas
  finalActionable: 2, // delas, que mandam comprar ou vender (só "esperar" não serve para operar)
  finalStableVersions: 4, // retreinos seguidos estáveis
  stableWeight: 0.02, // variação máxima de peso entre retreinos para contar como estável
  retrainEvery: 5, // pregões entre retreinos (semanal)
  weightMinN: 50, // decisões com a sub-análise ativa para mexer no peso
  weightStep: 0.25, // fração do caminho até o peso-alvo por retreino
  weightRange: [0.5, 1.5], // limites em relação ao peso original
  degrade: 0.55, // alerta pós-final
  journalMax: 20000,
  // v2: vantagem em R
  stopAtr: 2.5, // stop da medição em R (× ATR14)
  minK: 0.01, // risco mínimo (fração do preço) para medir em R
  cost: 0.0005, // custo por perna (spread + escorregamento)
  horizon: { dec: 20, sig: 5, level: 5 }, // pregões por tipo de lógica
  fdr: 0.1, // Benjamini-Hochberg: no máximo 10% de aprovações falsas esperadas
  reviveR: 0.05, // eliminada só volta com excesso médio acima disto (em R)
  bearMinN: 10, // dias em regime de baixa para julgar a lógica nele
  icStep: 4, // peso: cada +0,05 de correlação = +20%
};

/** Horizonte (pregões) de um gatilho: decisões de tendência precisam de mais tempo que sinais e níveis. */
export const horizonOf = (e) => e.h ?? RULES.horizon[e.t] ?? 5;

/** Risco por unidade de preço (fração): 2,5 × ATR14 ÷ preço. bars = { h, l, c } (h/l opcionais). */
export function riskK(bars, i, mult = RULES.stopAtr) {
  const c = bars?.c;
  if (!c || i < 15 || !(c[i] > 0)) return null;
  const hi = bars.h?.length === c.length ? bars.h : c;
  const lo = bars.l?.length === c.length ? bars.l : c;
  let s = 0;
  for (let k = i - 13; k <= i; k++)
    s += Math.max(hi[k] - lo[k], Math.abs(hi[k] - c[k - 1]), Math.abs(lo[k] - c[k - 1]));
  const atr = s / 14;
  return atr > 0 ? +((mult * atr) / c[i]).toFixed(5) : null;
}

export const STATUS = {
  eval: { label: "Em avaliação", tone: "neutral" },
  approved: { label: "Aprovada", tone: "buy" },
  eliminated: { label: "Eliminada", tone: "sell" },
};

/** Chave da lógica: tipo + código + tom (ex.: "sig:dip:buy", "dec:buy-part:buy", "level:res:wait"). */
export const logicKey = (e) => `${e.t}:${e.c}:${e.o}`;

const PTS = { hit: 1, partial: 0.5, miss: 0 };

/**
 * Aproveitamento por DIA: os ativos sobem e caem juntos, então 30 gatilhos no mesmo dia são, na prática, uma
 * observação só. Cada pregão vale 1 (a média dos gatilhos daquele dia); n = dias distintos, raw = gatilhos.
 * outOf(e) = resultado do gatilho (padrão: e.out).
 */
export function dayScore(entries, outOf = (e) => e.out) {
  const by = new Map();
  for (const e of entries) {
    const o = outOf(e);
    if (!o) continue;
    const x = by.get(e.d) ?? [0, 0];
    x[0] += PTS[o];
    x[1]++;
    by.set(e.d, x);
  }
  const days = [...by.values()].map(([p, k]) => p / k);
  const n = days.length;
  if (!n) return { n: 0, raw: 0, score: null, lower: null, upper: null };
  const p = days.reduce((a, b) => a + b, 0) / n;
  const raw = [...by.values()].reduce((a, [, k]) => a + k, 0);
  return { n, raw, score: p, ...wilson(p, n, RULES.z) };
}

/** Intervalo de Wilson (proporção p em n casos). */
export function wilson(p, n, z = RULES.z) {
  if (!n) return { lower: null, upper: null };
  const z2 = z * z;
  const c = (p + z2 / (2 * n)) / (1 + z2 / n);
  const h = (z * Math.sqrt((p * (1 - p)) / n + z2 / (4 * n * n))) / (1 + z2 / n);
  return { lower: Math.max(0, c - h), upper: Math.min(1, c + h) };
}

/** Próximo status de uma lógica a partir das estatísticas fora da amostra e do status anterior. */
export function nextStatus(st, prev = "eval") {
  const R = RULES;
  if (!st?.n) return prev === "eliminated" ? "eliminated" : "eval";
  if (prev === "eliminated")
    return st.n >= R.minN && st.score >= R.revive ? "approved" : "eliminated";
  if (st.n >= R.minN) return st.score >= R.threshold ? "approved" : "eliminated";
  if (st.n >= R.earlyN && st.upper < R.threshold) return "eliminated";
  return prev === "approved" ? "approved" : "eval";
}

// ───────────── diário fora da amostra ─────────────

/**
 * Acrescenta ao diário os gatilhos do dia (já no formato compacto). Um mesmo gatilho do mesmo ativo só volta a
 * entrar depois de 5 pregões (o prazo da avaliação). sessionsOf(sym) = datas do ativo (para contar pregões).
 */
export function appendJournal(journal, entries, sessionsOf) {
  const list = [...(journal ?? [])];
  const lastBy = new Map();
  for (const e of list) lastBy.set(`${e.s}:${logicKey(e)}`, e.d);
  let added = 0;
  for (const e of entries) {
    const k = `${e.s}:${logicKey(e)}`;
    const prev = lastBy.get(k);
    if (prev) {
      if (prev >= e.d) continue; // o mesmo dia rodado de novo
      const ds = sessionsOf(e.s) ?? [];
      const gap = ds.filter((d) => d > prev && d <= e.d).length;
      if (gap < RULES.retrainEvery) continue;
    }
    list.push(e);
    lastBy.set(k, e.d);
    added++;
  }
  return { list: list.slice(-RULES.journalMax), added };
}

const dirClass = ({ r, ret, e, v }) => {
  if (r === 0) {
    const vol = v > 0 ? v : 0.02;
    return ret <= 0.5 * vol ? "hit" : ret <= vol ? "partial" : "miss";
  }
  const d = r * ret;
  return d >= e ? "hit" : d > 0 ? "partial" : "miss";
};

/**
 * Fecha os gatilhos que já completaram 5 pregões: ret, out (resultado do modelo atual) e, nas decisões, aout
 * (resultado da decisão do modelo em treino). barsOf(sym) = { dates, c, h?, l? }.
 * v2: quando o gatilho tem `k` (risco) e o horizonte da lógica terminou, grava rR (resultado em R com stop e custo),
 * xR (excesso em R sobre a média do universo no mesmo dia: mktOf(data, horizonte)) e, nas decisões, xs (excesso
 * simples, para os pesos por correlação).
 */
export function settleJournal(journal, barsOf, horizon = 5, { mktOf = null } = {}) {
  return journal.map((e) => {
    const needOut = !e.out;
    // risco < 1% do preço (T-bills, flutuantes): sem operação técnica relevante; em R, qualquer ruído vira dezenas de R
    const needR = e.k >= RULES.minK && e.rR === undefined && Number.isFinite(e.r);
    if (!needOut && !needR) return e;
    const b = barsOf(e.s);
    const i = b?.dates?.indexOf(e.d) ?? -1;
    if (i < 0 || !(e.p > 0)) return e;
    let x = e;
    if (needOut && i + horizon < b.c.length) {
      const ret = b.c[i + horizon] / e.p - 1;
      const out = dirClass({ ...e, ret });
      x = { ...x, ret: +ret.toFixed(5), out };
      if (e.a) x.aout = dirClass({ ...e, r: e.a.r, ret });
    }
    const H = horizonOf(e);
    if (needR && i + H < b.c.length) {
      const m = mktOf ? mktOf(e.d, H) : 0;
      const retH = b.c[i + H] / e.p - 1;
      x = { ...x, xs: +(retH - (m ?? 0)).toFixed(5) };
      if (e.r !== 0) {
        const rr = rMultiple(b, i, e.p, e.r, e.k, H);
        x.rR = +rr.toFixed(4);
        x.xR = +(rr - (e.r * (m ?? 0)) / e.k).toFixed(4);
      } else x.rR = null;
    }
    return x;
  });
}

/** Resultado em R de entrar no fechamento do dia i: stop a k (fração) do preço, saída no stop ou em H pregões. */
export function rMultiple(b, i, p, dir, k, H, cost = RULES.cost) {
  const stop = p * (1 - dir * k);
  const lo = b.l?.length === b.c.length ? b.l : b.c;
  const hi = b.h?.length === b.c.length ? b.h : b.c;
  const op = b.o?.length === b.c.length ? b.o : b.c;
  let exit = b.c[i + H];
  for (let j = i + 1; j <= i + H; j++) {
    if (dir > 0 ? lo[j] <= stop : hi[j] >= stop) {
      exit = dir > 0 ? Math.min(stop, op[j] || stop) : Math.max(stop, op[j] || stop);
      break;
    }
  }
  return (dir * (exit - p) - cost * (p + exit)) / (k * p);
}

/** Média do universo no mesmo dia e horizonte (para o excesso): devolve mktOf(data, H). barsAll = { sym: bars }. */
export function marketMeanOf(barsAll) {
  const memo = new Map();
  const list = Object.values(barsAll ?? {}).filter((b) => b?.dates?.length);
  const idx = list.map((b) => new Map(b.dates.map((d, i) => [d, i])));
  return (d, H) => {
    const key = `${d}|${H}`;
    if (memo.has(key)) return memo.get(key);
    let s = 0;
    let n = 0;
    list.forEach((b, k) => {
      const i = idx[k].get(d);
      if (i === undefined || i + H >= b.c.length || !(b.c[i] > 0)) return;
      const r = b.c[i + H] / b.c[i] - 1;
      if (Number.isFinite(r) && Math.abs(r) < 1) {
        s += r;
        n++;
      }
    });
    const v = n >= 5 ? s / n : null;
    memo.set(key, v);
    return v;
  };
}

// ───────────── estatística em R (v2) ─────────────

/** Φ (normal padrão acumulada), aproximação de Abramowitz-Stegun. */
export function normCdf(z) {
  const t = 1 / (1 + 0.2316419 * Math.abs(z));
  const d = 0.3989423 * Math.exp((-z * z) / 2);
  const p =
    d * t * (0.3193815 + t * (-0.3565638 + t * (1.781478 + t * (-1.821256 + t * 1.330274))));
  return z > 0 ? 1 - p : p;
}

/**
 * Média por DIA de um campo numérico (cada pregão vale 1, como no aproveitamento): n dias, média, erro-padrão,
 * limites de 90% e p unilateral (H0: média ≤ 0). field = nome do campo (ex.: "xR") ou função.
 */
export function dayStatsR(entries, field = "xR") {
  const get = typeof field === "function" ? field : (e) => e[field];
  const by = new Map();
  for (const e of entries) {
    const v = get(e);
    if (!Number.isFinite(v)) continue;
    const x = by.get(e.d) ?? [0, 0];
    x[0] += v;
    x[1]++;
    by.set(e.d, x);
  }
  const days = [...by.values()].map(([s, k]) => s / k);
  const n = days.length;
  if (!n) return { n: 0, raw: 0, mean: null, se: null, lower: null, upper: null, p: null };
  const mean = days.reduce((a, b) => a + b, 0) / n;
  const sd = n > 1 ? Math.sqrt(days.reduce((a, b) => a + (b - mean) ** 2, 0) / (n - 1)) : null;
  const se = sd != null ? sd / Math.sqrt(n) : null;
  const raw = [...by.values()].reduce((a, [, k]) => a + k, 0);
  const z = RULES.z;
  return {
    n,
    raw,
    mean,
    se,
    lower: se != null ? mean - z * se : null,
    upper: se != null ? mean + z * se : null,
    p: se > 0 ? 1 - normCdf(mean / se) : mean > 0 ? 0 : 1,
  };
}

/** Benjamini-Hochberg: devolve o conjunto de chaves aprovadas com FDR q. ps = [[chave, p]]. */
export function bhPass(ps, q = RULES.fdr) {
  const list = ps.filter(([, p]) => Number.isFinite(p)).sort((a, b) => a[1] - b[1]);
  const m = list.length;
  let cut = -1;
  list.forEach(([, p], i) => {
    if (p <= ((i + 1) / m) * q) cut = i;
  });
  return new Set(list.slice(0, cut + 1).map(([k]) => k));
}

/** Estatísticas v2 de uma lógica: excesso em R (geral e por regime), R bruto e acerto em R. */
export function logicR(es) {
  return {
    x: dayStatsR(es, "xR"),
    r: dayStatsR(es, "rR"),
    win: dayStatsR(es, (e) => (Number.isFinite(e.rR) ? (e.rR > 0 ? 1 : 0) : null)),
    bull: dayStatsR(
      es.filter((e) => e.g === 1),
      "xR",
    ),
    bear: dayStatsR(
      es.filter((e) => e.g === 0),
      "xR",
    ),
  };
}

/** Status v2 de uma lógica que manda operar (pelo excesso em R). pass = aprovada no BH. */
export function nextStatusR(x, prev = "eval", pass = false) {
  const R = RULES;
  if (!x?.n) return prev === "eliminated" ? "eliminated" : "eval";
  if (prev === "eliminated")
    return x.n >= R.minN && x.mean > R.reviveR && pass ? "approved" : "eliminated";
  if (x.n >= R.minN) {
    if (x.mean > 0 && pass) return "approved";
    if (x.mean <= 0) return "eliminated";
    return prev === "approved" ? "approved" : "eval"; // positivo mas inconclusivo
  }
  if (x.n >= R.earlyN && x.upper != null && x.upper < 0) return "eliminated";
  return prev === "approved" ? "approved" : "eval";
}

/**
 * O filtro de vantagem (assets/edge.js) funciona? Excesso em R das decisões bloqueadas × liberadas e por nota.
 */
export function edgeValidation(journal) {
  const decs = journal.filter((e) => e.t === "dec" && e.r !== 0 && Number.isFinite(e.xR) && e.eg);
  const by = (f) => dayStatsR(decs.filter(f), "xR");
  return {
    blocked: by((e) => e.eb === 1),
    passed: by((e) => e.eb !== 1),
    grades: Object.fromEntries(["A", "B", "C", "D"].map((g) => [g, by((e) => e.eg === g)])),
  };
}

// ───────────── pesos da decisão ─────────────

/**
 * Peso-alvo de cada sub-análise: acerto de direção sozinha (sinal do dir × retorno em 5 pregões, só quando ela
 * tinha opinião: |dir| ≥ 0,12). Acerto de 50% = peso original; cada +10 p.p. = +40% de peso, dentro dos limites.
 */
/** Correlação de postos (Spearman) entre xs e ys. */
export function spearman(xs, ys) {
  const n = xs.length;
  if (n < 3) return null;
  const rank = (a) => {
    const idx = a.map((v, i) => [v, i]).sort((p, q) => p[0] - q[0]);
    const r = Array(n);
    for (let i = 0; i < n;) {
      let j = i;
      while (j + 1 < n && idx[j + 1][0] === idx[i][0]) j++;
      for (let k = i; k <= j; k++) r[idx[k][1]] = (i + j) / 2;
      i = j + 1;
    }
    return r;
  };
  const a = rank(xs);
  const b = rank(ys);
  const ma = a.reduce((s, v) => s + v, 0) / n;
  const mb = b.reduce((s, v) => s + v, 0) / n;
  let num = 0;
  let da = 0;
  let db = 0;
  for (let i = 0; i < n; i++) {
    num += (a[i] - ma) * (b[i] - mb);
    da += (a[i] - ma) ** 2;
    db += (b[i] - mb) ** 2;
  }
  return da && db ? num / Math.sqrt(da * db) : 0;
}

/**
 * v2: peso-alvo pela correlação de postos entre a opinião de cada sub-análise e o excesso de retorno da decisão
 * (xs, horizonte de 20 pregões). Correlação 0 = peso original; cada +0,05 = +20%, dentro dos limites. Sem 50
 * decisões com excesso, cai no método antigo (acerto de direção).
 */
export function weightTargetsIC(closedDecisions) {
  const xs = closedDecisions.filter((e) => Number.isFinite(e.xs) && e.sub);
  if (xs.length < RULES.weightMinN) return null;
  const [lo, hi] = RULES.weightRange;
  const ic = {};
  const raw = {};
  for (const [k, w] of Object.entries(SUB_W)) {
    const rows = xs.filter((e) => Number.isFinite(e.sub[k]));
    const c = rows.length >= RULES.weightMinN ? spearman(rows.map((e) => e.sub[k]), rows.map((e) => e.xs)) : null; // prettier-ignore
    ic[k] = { n: rows.length, ic: c };
    raw[k] = w * (c == null ? 1 : Math.min(hi, Math.max(lo, 1 + RULES.icStep * c)));
  }
  // parte sem medição (ex.: fundamentos no backfill) mantém o peso original; só as medidas se redistribuem
  const fixed = Object.keys(SUB_W).filter((k) => ic[k].ic == null);
  const free = 1 - fixed.reduce((a, k) => a + SUB_W[k], 0);
  const measured = Object.keys(SUB_W).filter((k) => ic[k].ic != null);
  const sum = measured.reduce((a, k) => a + raw[k], 0);
  const target = Object.fromEntries(Object.keys(SUB_W).map((k) => [k, +(ic[k].ic == null ? SUB_W[k] : (raw[k] / sum) * free).toFixed(4)])); // prettier-ignore
  return { target, ic };
}

export function weightTargets(closedDecisions) {
  const acc = {};
  for (const k of Object.keys(SUB_W)) {
    const xs = closedDecisions.filter((e) => Number.isFinite(e.sub?.[k]) && Math.abs(e.sub[k]) >= 0.12); // prettier-ignore
    const hits = xs.filter((e) => Math.sign(e.sub[k]) === Math.sign(e.ret)).length;
    acc[k] = { n: xs.length, acc: xs.length ? hits / xs.length : null };
  }
  const [lo, hi] = RULES.weightRange;
  const raw = Object.fromEntries(
    Object.entries(SUB_W).map(([k, w]) => {
      const a = acc[k];
      const f = a.n >= RULES.weightMinN ? Math.min(hi, Math.max(lo, 1 + 4 * (a.acc - 0.5))) : 1;
      return [k, w * f];
    }),
  );
  return { target: normalize(raw), acc };
}

const normalize = (w) => {
  const s = Object.values(w).reduce((a, b) => a + b, 0);
  return Object.fromEntries(Object.entries(w).map(([k, v]) => [k, +(v / s).toFixed(4)]));
};

/** Move os pesos uma fração do caminho até o alvo. */
export const stepWeights = (cur, target, step = RULES.weightStep) =>
  normalize(Object.fromEntries(Object.keys(SUB_W).map((k) => [k, (cur?.[k] ?? SUB_W[k]) + step * (target[k] - (cur?.[k] ?? SUB_W[k]))]))); // prettier-ignore

const maxDiff = (a, b) => Math.max(...Object.keys(SUB_W).map((k) => Math.abs((a?.[k] ?? 0) - (b?.[k] ?? 0)))); // prettier-ignore

// ───────────── modelo ─────────────

export function emptyModel(startDate) {
  return {
    v: 2,
    startDate,
    lastRun: null,
    sessions: 0,
    final: false,
    finalAt: null,
    weights: { ...SUB_W },
    logics: {},
    versions: [],
    criteria: null,
    compare: null,
    degraded: [],
    preview: {},
  };
}

/** Data do n-ésimo dia distinto mais recente (para olhar só os últimos n dias de uma lógica). */
const lastDays = (es, n) => [...new Set(es.map((e) => e.d))].sort().at(-n) ?? "";

/** A lógica manda operar (comprar/ampliar ou vender/reduzir)? "esperar" e "aguardar" não. */
export const actionable = (key) => !key.endsWith(":wait");

/** Agrupa os gatilhos encerrados do diário por lógica. */
export function logicStats(journal) {
  const g = {};
  for (const e of journal) {
    if (!e.out) continue;
    (g[logicKey(e)] ??= []).push(e);
  }
  return g;
}

/** Aproveitamento do modelo atual (tudo, pesos originais) × modelo em treino (sem as eliminadas, pesos novos). */
export function compareModels(journal, logics) {
  const closed = journal.filter((e) => e.out);
  const kept = closed.filter((e) => logics[logicKey(e)]?.status !== "eliminated");
  return {
    current: dayScore(closed),
    learned: dayScore(kept, (e) => (e.t === "dec" && e.aout ? e.aout : e.out)),
  };
}

/** Critérios do modelo final (cada um com ok e o texto do progresso). */
export function finalCriteria(model) {
  const R = RULES;
  const approved = Object.entries(model.logics).filter(([, l]) => l.status === "approved");
  const act = approved.filter(([k]) => actionable(k));
  const strong = approved.filter(([k, l]) =>
    actionable(k) && l.rx?.n >= R.minN
      ? l.rx.mean > 0 && l.bh
      : l.n >= R.minN && l.score >= R.threshold && l.lower >= R.finalLower,
  ); // prettier-ignore
  const bearBad = approved.filter(([k, l]) => actionable(k) && l.rbear?.n >= R.bearMinN && l.rbear.upper < 0); // prettier-ignore
  const bearUntested = approved.filter(([k, l]) => actionable(k) && !(l.rbear?.n >= R.bearMinN)).length; // prettier-ignore
  const vs = model.versions.slice(-R.finalStableVersions);
  const stable =
    vs.length === R.finalStableVersions &&
    vs.every((v) => v.approved.join() === vs[0].approved.join() && maxDiff(v.weights, vs[0].weights) < R.stableWeight); // prettier-ignore
  const stableRun = (() => {
    let n = 0;
    const vv = model.versions;
    for (let i = vv.length - 1; i > 0; i--) {
      if (
        vv[i].approved.join() === vv[i - 1].approved.join() &&
        maxDiff(vv[i].weights, vv[i - 1].weights) < R.stableWeight
      )
        n++; // prettier-ignore
      else break;
    }
    return vv.length ? n + 1 : 0;
  })();
  const items = [
    { key: "sessions", ok: model.sessions >= R.finalSessions, text: `${model.sessions} de ${R.finalSessions} pregões de diário${model.backfill ? ` (${model.backfill.days} reconstruídos + ${Math.max(0, model.sessions - model.backfill.days)} ao vivo)` : " real"}` }, // prettier-ignore
    { key: "approved", ok: approved.length >= R.finalApproved, text: `${approved.length} de ${R.finalApproved}+ lógicas aprovadas` }, // prettier-ignore
    { key: "actionable", ok: act.length >= R.finalActionable, text: `${act.length} de ${R.finalActionable}+ aprovadas que mandam comprar ou vender` }, // prettier-ignore
    { key: "strong", ok: approved.length > 0 && strong.length === approved.length, text: `${strong.length} de ${approved.length} aprovadas com margem (30+ dias; operar: excesso em R positivo e aprovado na correção de testes múltiplos; esperar: ≥ 60% e limite pessimista ≥ 50%)` }, // prettier-ignore
    { key: "regime", ok: bearBad.length === 0, text: bearBad.length ? `${bearBad.length} aprovada(s) com excesso negativo no regime de baixa` : bearUntested ? `nenhuma aprovada falha no regime de baixa (${bearUntested} ainda testada(s) só em alta)` : "nenhuma aprovada falha no regime de baixa" }, // prettier-ignore
    { key: "stable", ok: stable, text: `${Math.min(stableRun, R.finalStableVersions)} de ${R.finalStableVersions} retreinos seguidos sem mudança` }, // prettier-ignore
  ];
  return { ok: items.every((x) => x.ok), items, bullOnly: bearUntested > 0 };
}

/**
 * Um passo diário de treino. journal já atualizado e fechado; date = pregão de hoje; sessions = pregões desde o
 * início do diário; preview = estatísticas do backtest por lógica (só exibição). Devolve o modelo novo.
 */
export function trainStep(model, journal, { date, sessions, preview = {} }) {
  const m = structuredClone(model);
  m.lastRun = date;
  m.sessions = sessions;
  m.preview = preview;
  const groups = logicStats(journal);
  const keys = new Set([...Object.keys(m.logics), ...Object.keys(groups), ...Object.keys(preview)]);
  // v2: estatísticas em R por lógica e correção de Benjamini-Hochberg entre as que mandam operar
  const rStats = Object.fromEntries([...keys].map((k) => [k, logicR(groups[k] ?? [])]));
  const pass = bhPass(
    [...keys]
      .filter((k) => actionable(k) && rStats[k].x.n >= RULES.minN)
      .map((k) => [k, rStats[k].x.p]),
  );
  const v2 = (k) => ({ rx: rStats[k].x, rr: rStats[k].r, rwin: rStats[k].win, rbull: rStats[k].bull, rbear: rStats[k].bear, bh: pass.has(k) }); // prettier-ignore
  m.v = 2;
  m.edge = edgeValidation(journal);
  if (m.final) {
    // congelado: só atualiza os números e vigia a degradação das aprovadas
    for (const k of keys) {
      const st = dayScore(groups[k] ?? []);
      m.logics[k] = { ...(m.logics[k] ?? { status: "eval" }), ...st, ...v2(k) };
    }
    m.degraded = Object.entries(groups)
      .filter(([k]) => m.logics[k]?.status === "approved")
      .map(([k, es]) => {
        const recent = es.filter((e) => e.d >= lastDays(es, RULES.minN));
        return [k, dayScore(recent), dayStatsR(recent, "xR")];
      })
      .filter(([k, s, x]) =>
        actionable(k) && x.n >= RULES.minN
          ? x.mean < 0
          : s.n >= RULES.minN && s.score < RULES.degrade,
      ) // prettier-ignore
      .map(([k, s, x]) => ({ key: k, score: s.score, xr: x.mean }));
    m.compare = compareModels(journal, m.logics);
    return m;
  }
  for (const k of keys) {
    const st = dayScore(groups[k] ?? []);
    const prev = m.logics[k]?.status ?? "eval";
    const x = rStats[k].x;
    // operar com dados em R: critério v2 (excesso em R); esperar ou sem R ainda: aproveitamento (v1)
    const status =
      actionable(k) && x.n > 0 ? nextStatusR(x, prev, pass.has(k)) : nextStatus(st, prev);
    m.logics[k] = { ...st, ...v2(k), crit: actionable(k) && x.n > 0 ? "R" : "acerto", status, since: status === prev ? (m.logics[k]?.since ?? date) : date }; // prettier-ignore
  }
  // retreino semanal: pesos e versão
  const last = m.versions.at(-1);
  const due = !last || sessions - last.sessions >= RULES.retrainEvery;
  if (due) {
    const decs = journal.filter((e) => e.t === "dec" && e.out && e.sub);
    const ic = weightTargetsIC(decs);
    const { target, acc } = ic ?? weightTargets(decs);
    m.weights = stepWeights(m.weights, target);
    m.weightAcc = acc ?? null;
    m.weightIc = ic?.ic ?? null;
    m.weightMethod = ic ? "correlação" : "acerto";
    const approved = Object.entries(m.logics).filter(([, l]) => l.status === "approved").map(([k]) => k).sort(); // prettier-ignore
    const eliminated = Object.entries(m.logics).filter(([, l]) => l.status === "eliminated").map(([k]) => k).sort(); // prettier-ignore
    m.versions.push({ n: (last?.n ?? 0) + 1, date, sessions, weights: m.weights, approved, eliminated }); // prettier-ignore
  }
  m.compare = compareModels(journal, m.logics);
  m.criteria = finalCriteria(m);
  if (m.criteria.ok) {
    m.final = true;
    m.finalAt = date;
  }
  return m;
}
