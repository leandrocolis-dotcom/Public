// Como andou o regime (puro, sem DOM): refaz a nota do pêndulo da Início (−100 a +100) em cada momento do
// passado, para ver se o regime está se intensificando, perdendo força ou virando, e quanto tempo ele dura.
//
// Em cada instante t vale a MESMA regra do pêndulo ao vivo:
//  • referência = último fechamento regular de NY antes de t (no pregão, o da véspera; no pós, o do dia);
//  • preço de cada ativo em t = a própria barra (bolsa aberta, com pré/pós) e, se ela estiver parada há mais de
//    45 min, o futuro equivalente (SPY ← ES=F…) ou, nas bolsas de fora sem futuro, o ETF do país em NY,
//    aplicado sobre o último preço do ativo (PROXY de assets/offmarket.js);
//  • nota = regime() de assets/dash.js com o histórico diário até a referência + o preço em t.
// Janelas 1h/5h/24h usam barras de 5 min (2 pregões); 48h e 1 semana, de 30 min (5 pregões); 1 mês, os
// fechamentos diários. Leitura em modo sombra; material educacional, não é recomendação.
import { RATIOS, regime } from "./dash.js";
import { PROXY } from "./offmarket.js";
import { nyClock, sessionInfo } from "./sessions.js";
import { completeLastBar, livePoint } from "./rot-intraday.js";

/** [id, rótulo, fonte das barras ("short" 5 min | "long" 30 min | "daily"), duração (s), passo (s)]. */
export const REG_WINDOWS = [
  ["1h", "1h", "short", 3600, 300],
  ["5h", "5h", "short", 5 * 3600, 600],
  ["24h", "24h", "short", 24 * 3600, 1800],
  ["48h", "48h", "long", 48 * 3600, 1800],
  ["1w", "1 semana", "long", 7 * 86400, 3 * 3600],
  ["1m", "1 mês", "daily", 31 * 86400, 86400],
];

/** Barra parada há mais que isso (s) → usa o futuro / ETF do país. */
export const STALE = 45 * 60;

const LEGS = [...new Set(RATIOS.flatMap(([a, b]) => (b ? [a, b] : [a])))];
const TRADEABLE_PROXY = (sym) => {
  const px = PROXY[sym];
  return px && px[3] !== "y" && px[3] !== "etf" ? px : null;
};

/** Símbolos que o histórico precisa: as pontas das razões, o VIX e os substitutos de cada ponta. */
export const REGIME_SYMS = [
  ...new Set([
    ...LEGS,
    "^VIX",
    "^VIX3M",
    ...LEGS.map((s) => TRADEABLE_PROXY(s)?.[0]).filter(Boolean),
  ]),
];

/** Instante (s) de um horário de NY: data AAAA-MM-DD e minuto do dia. */
export function nyEpoch(date, min) {
  let guess = Date.parse(`${date}T00:00:00Z`) / 1000 + min * 60 + 5 * 3600;
  for (let i = 0; i < 2; i++) {
    const c = nyClock(guess * 1000);
    const dd = (Date.parse(`${c.date}T00:00:00Z`) - Date.parse(`${date}T00:00:00Z`)) / 1000;
    guess -= dd + (c.min - min) * 60;
  }
  return guess;
}

/** Data (AAAA-MM-DD) do último fechamento regular de NY até t (s). */
export function usRefDate(t) {
  let date = nyClock(t * 1000).date;
  for (let i = 0; i < 10; i++) {
    const info = sessionInfo(date);
    if (info.open && nyEpoch(date, info.closeMin) <= t) return date;
    const d = new Date(`${date}T12:00:00Z`);
    d.setUTCDate(d.getUTCDate() - 1);
    date = d.toISOString().slice(0, 10);
  }
  return date;
}

/** Último índice i com arr[i] ≤ x (busca binária), ou −1. */
export function lastLE(arr, x) {
  let lo = 0;
  let hi = arr.length - 1;
  let r = -1;
  while (lo <= hi) {
    const m = (lo + hi) >> 1;
    if (arr[m] <= x) {
      r = m;
      lo = m + 1;
    } else hi = m - 1;
  }
  return r;
}

/** Último preço da série de barras { t, c } até t: { p, t } ou null. */
function barAt(ser, t) {
  if (!ser?.t?.length) return null;
  const i = lastLE(ser.t, t);
  return i < 0 ? null : { p: ser.c[i], t: ser.t[i] };
}

/**
 * Melhor preço de um ativo em t: a própria barra; parada há mais de STALE, o substituto (futuro ou ETF do país)
 * aplicado sobre ela: p = próprio × (1 + k × variação do substituto desde a hora do próprio).
 */
export function priceAt(sym, t, series) {
  const own = barAt(series[sym], t);
  if (own && t - own.t <= STALE) return { p: own.p, src: "own" };
  const px = TRADEABLE_PROXY(sym);
  const f = px ? barAt(series[px[0]], t) : null;
  if (own && f && t - f.t <= STALE) {
    const f0 = barAt(series[px[0]], own.t);
    if (f0?.p > 0) return { p: own.p * (1 + px[1] * (f.p / f0.p - 1)), src: px[0] };
  }
  return own ? { p: own.p, src: "own" } : null;
}

/**
 * Nota do regime em t (s) a partir do histórico diário { dates, close } e das barras intraday. refIdx fixa o
 * fechamento de referência (índice em daily.dates) para toda uma trilha não pular na troca de referência às 16h
 * (radar de virada, assets/regime-reversal.js); sem ele vale o último fechamento regular antes de t.
 */
export function regimeAt(t, daily, series, refIdx = null) {
  const idx = refIdx ?? lastLE(daily.dates, usRefDate(t));
  if (idx < 30) return null;
  const close = {};
  for (const sym of [...LEGS, "^VIX", "^VIX3M"]) {
    const d = daily.close[sym];
    if (!d) continue;
    const p = priceAt(sym, t, series);
    const arr = d.slice(0, idx + 1);
    if (p?.p > 0) arr.push(p.p);
    else arr.push(arr.at(-1));
    close[sym] = arr;
  }
  let rg = null;
  try {
    rg = regime(close, 1);
  } catch {
    rg = null;
  }
  if (!rg?.strength) return null;
  return {
    t,
    score: rg.strength.score,
    blocks: Object.fromEntries((rg.blocks ?? []).map((b) => [b.id, b.score])),
  };
}

/** Nota no fechamento de cada um dos últimos `n` pregões (janela de 1 mês). */
export function dailyHistory(daily, n = 22) {
  const out = [];
  const N = daily.dates.length;
  for (let i = Math.max(31, N - n); i < N; i++) {
    const close = {};
    for (const [sym, s] of Object.entries(daily.close)) close[sym] = s.slice(0, i + 1);
    let rg = null;
    try {
      rg = regime(close, 1);
    } catch {
      rg = null;
    }
    if (!rg?.strength) continue;
    const t = nyEpoch(daily.dates[i], sessionInfo(daily.dates[i]).closeMin);
    out.push({
      t,
      score: rg.strength.score,
      blocks: Object.fromEntries((rg.blocks ?? []).map((b) => [b.id, b.score])),
    });
  }
  return out;
}

/** Série da janela: pontos { t, score, blocks } de agora − duração até agora, no passo da janela. */
export function regimeHistory(winId, { daily, series = {}, now = Date.now() / 1000, live = null }) {
  const w = REG_WINDOWS.find((x) => x[0] === winId);
  if (!w || !daily?.dates?.length) return [];
  const [, , src, span, step] = w;
  let pts;
  if (src === "daily") pts = dailyHistory(daily).filter((p) => p.t >= now - span);
  else {
    // só onde há barras: começa na primeira barra do SPY (a busca cobre 2 ou 5 pregões)
    const first = series.SPY?.t?.[0] ?? now - span;
    const start = Math.max(now - span, first);
    pts = [];
    for (let t = Math.ceil(start / step) * step; t <= now; t += step) {
      const p = regimeAt(t, daily, series);
      if (p) pts.push(p);
    }
  }
  // o ponto de agora é sempre o do pêndulo (mesma nota da tela)
  if (live && Number.isFinite(live.score)) {
    pts = pts.filter((p) => p.t < now - 60);
    pts.push({ t: now, score: live.score, blocks: live.blocks ?? {} });
  }
  return pts;
}

/**
 * Resumo da janela. A nota de 1 dia oscila de um ponto para o outro, então a tendência compara a MÉDIA do
 * primeiro quarto da janela com a do último quarto (não o primeiro e o último ponto): intensificando ou
 * perdendo força = a média se afastou ou se aproximou do zero em 10 pontos ou mais; virou de lado = as médias
 * estão em lados opostos (cada uma a 10 pontos ou mais do zero). Permanência = parte dos pontos do mesmo lado
 * de agora.
 */
export function historySummary(pts) {
  if (!pts?.length) return null;
  const scores = pts.map((p) => p.score);
  const q = Math.max(1, Math.ceil(pts.length / 4));
  const avg = (xs) => Math.round(xs.reduce((a, b) => a + b, 0) / xs.length);
  const first = avg(scores.slice(0, q));
  const end = avg(scores.slice(-q));
  const last = scores.at(-1);
  const side = Math.sign(last);
  const same = side ? scores.filter((x) => Math.sign(x) === side).length / scores.length : null;
  let trend;
  if (Math.sign(first) === -Math.sign(end) && Math.abs(first) >= 10 && Math.abs(end) >= 10)
    trend = "virou de lado";
  else if (Math.abs(end) - Math.abs(first) >= 10) trend = "intensificando";
  else if (Math.abs(first) - Math.abs(end) >= 10) trend = "perdendo força";
  else trend = "estável";
  return {
    first,
    end,
    last,
    delta: end - first,
    min: Math.min(...scores),
    max: Math.max(...scores),
    same,
    trend,
    n: pts.length,
  };
}

/**
 * Barras de 5 min completadas com o preço ao vivo (cotação crua: negócio real do próprio ativo, com pré/pós),
 * para a nota de agora não esperar a próxima barra.
 */
export function withLiveBars(series, quotes, barMin = 5) {
  const out = {};
  for (const [sym, ser] of Object.entries(series ?? {}))
    out[sym] = completeLastBar(ser, livePoint(quotes?.[sym]), barMin);
  return out;
}

/**
 * Nota de agora e de `lookback` s atrás pela MESMA conta (regimeAt), para os avisos de mudança de regime.
 * daily = { dates, close } (fechamentos publicados); series = barras de 5 min; quotes = cotações cruas.
 */
/** Desvio de uma janela de horas a partir do desvio de um dia (pregão de 6,5 h; teto de 1 dia). */
export const hourScale = (hours) => Math.sqrt(Math.min(hours, 6.5) / 6.5);

/**
 * Pêndulo das últimas `hours` horas (janelas 1h/3h/5h da Início): o humor do mercado SÓ nesse intervalo. Cada
 * razão mede o preço agora × o preço de `hours` atrás (barras de 5 min com pré/pós + preço ao vivo; parada, o
 * futuro ou ETF do país, como em regimeAt), em desvios de um dia × √(horas ÷ 6,5); mesmos pesos ao vivo do 1D.
 * Devolve o objeto de regime() (nota em strength.score) ou null sem barras.
 */
export function regimeOver({
  daily,
  series,
  quotes = null,
  nowSec = Date.now() / 1000,
  hours = 1,
}) {
  if (!daily?.dates?.length || !series) return null;
  const ser = quotes ? withLiveBars(series, quotes) : series;
  const idx = lastLE(daily.dates, usRefDate(nowSec));
  if (idx < 30) return null;
  const close = {};
  for (const sym of [...LEGS, "^VIX", "^VIX3M"]) {
    const d = daily.close[sym];
    if (!d) continue;
    const a = priceAt(sym, nowSec - hours * 3600, ser);
    const b = priceAt(sym, nowSec, ser);
    const arr = d.slice(0, idx + 1);
    // sem preço numa das pontas: a razão fica parada (variação 0) em vez de inventar
    const pa = a?.p > 0 ? a.p : b?.p > 0 ? b.p : arr.at(-1);
    const pb = b?.p > 0 ? b.p : pa;
    arr.push(pa, pb);
    close[sym] = arr;
  }
  try {
    return regime(close, 1, null, { sdScale: hourScale(hours) });
  } catch {
    return null;
  }
}

/** Passos dos chips "Variação da nota" nas janelas curtas (horas): 1h → 5/15/30/45 min, 3h → 1/2/3 h, 5h → 1/3/5 h. */
export const OVER_STEPS = { 1: [5 / 60, 0.25, 0.5, 0.75], 3: [1, 2, 3], 5: [1, 3, 5] };

/**
 * Velocidade do humor, em MINUTOS (25/11/2026: o mercado vira dentro de uma hora, a medida por hora chegava tarde).
 * Mede quanto a NOTA DO DIA (regimeAt, a mesma dos chips, dos avisos 🧭 e do radar de virada) anda por minuto nos
 * pontos agora, 1, 3, 5, 10 e 15 min atrás. Referência de fechamento fixa em todos os pontos (como o radar).
 * As barras são de 5 min, então 1 e 3 min só existem pela TRILHA: a nota que o app grava a cada atualização de preço
 * (~15 s, `trail` = [{ t, s }]); 5, 10 e 15 min usam a trilha e, sem ela (app recém-aberto), as barras de 5 min.
 * - ritmo = variação em 5 min (pts/min); recente = último minuto; antes = de 1 a 5 min; aceleração = recente − antes;
 *   sem o ponto de 1 min (trilha curta): recente = 0–5 min e antes = 5–15 min (`coarse`);
 * - concordância = trechos 0–1, 1–3, 3–5, 5–10 e 10–15 min que andam para o lado do ritmo.
 * Devolve { pts, now, coarse, ...speedFrom } ou null sem barras.
 */
export const SPEED_MIN = [0, 1, 3, 5, 10, 15];
/** Folga para casar um ponto da trilha com o instante pedido (segundos), por minuto pedido. */
const TRAIL_TOL = { 0: 0, 1: 25, 3: 50, 5: 70, 10: 100, 15: 130 };
/** Trilha da nota (puro): acrescenta { t, s } e guarda só os últimos keepSec segundos. */
export function pushTrail(trail, t, s, keepSec = 20 * 60) {
  if (!Number.isFinite(t) || !Number.isFinite(s)) return trail ?? [];
  const out = (trail ?? []).filter((x) => x.t > t - keepSec && x.t < t);
  out.push({ t, s });
  return out;
}
/** Nota da trilha mais perto do instante t, dentro da folga (segundos); null se não houver. */
export function trailAt(trail, t, tol) {
  let best = null;
  for (const x of trail ?? []) {
    const d = Math.abs(x.t - t);
    if (d <= tol && (!best || d < Math.abs(best.t - t))) best = x;
  }
  return best ? best.s : null;
}
export function moodSpeed({
  daily,
  series,
  quotes = null,
  nowSec = Date.now() / 1000,
  trail = null,
}) {
  if (!daily?.dates?.length || !series) return null;
  const ser = quotes ? withLiveBars(series, quotes) : series;
  const ref = lastLE(daily.dates, usRefDate(nowSec));
  if (ref < 30) return null;
  const at = (t) => {
    // sem barra nenhuma até esse instante, o ponto não existe (não inventa nota parada)
    const has = LEGS.some((sym) => ser[sym] && priceAt(sym, t, ser)?.p > 0);
    return has ? (regimeAt(t, daily, ser, ref)?.score ?? null) : null;
  };
  const now = at(nowSec);
  const pts = { 0: now };
  for (const m of SPEED_MIN.slice(1)) {
    const fromTrail = trailAt(trail, nowSec - m * 60, TRAIL_TOL[m]);
    pts[m] = fromTrail ?? (m >= 5 ? at(nowSec - m * 60) : null);
  }
  const sp = speedFrom(pts);
  return sp && { pts, now, ...sp };
}

/** Limiares em pontos de nota por MINUTO: ritmo abaixo de PARADO é ruído; ACEL separa ritmo constante de mudança. */
export const SPEED_CUT = { parado: 0.3, acel: 0.3 };
/** Ritmo (pontos/min) entre dois pontos da trilha, a (mais novo) e b (mais velho), em minutos atrás. */
const rateOf = (pts, a, b) =>
  Number.isFinite(pts?.[a]) && Number.isFinite(pts?.[b]) ? (pts[a] - pts[b]) / (b - a) : null;
/**
 * Leitura pura da trilha { 0, 1, 3, 5, 10, 15 } (nota do dia em cada instante, minutos atrás). Precisa do agora e
 * de 5 min; sem 1 min usa 15 min para a aceleração. estado: "parado" (|ritmo| < 0,3/min), "virando" (o trecho
 * recente já anda ≥ 0,3/min contra o ritmo), "acelerando" / "freando" (aceleração ≥ 0,3/min a favor / contra) ou
 * "constante". Confiança pela concordância dos trechos: alta ≥ 80%, média ≥ 60%, baixa abaixo.
 */
export function speedFrom(pts) {
  const pace = rateOf(pts, 0, 5);
  if (pace == null) return null;
  const fine = rateOf(pts, 0, 1) != null && rateOf(pts, 1, 5) != null;
  const fast = fine ? rateOf(pts, 0, 1) : pace;
  const slow = fine ? rateOf(pts, 1, 5) : rateOf(pts, 5, 15);
  if (slow == null) return null;
  const seg = SPEED_MIN.slice(1).map((b, i) => ({ from: SPEED_MIN[i], to: b, rate: rateOf(pts, SPEED_MIN[i], b) })); // prettier-ignore
  const accel = fast - slow;
  const side = Math.abs(pace) < SPEED_CUT.parado ? 0 : Math.sign(pace);
  const rated = seg.filter((x) => x.rate != null);
  const agree = side ? rated.filter((x) => Math.sign(x.rate) === side).length : null;
  let state;
  if (!side) state = "parado";
  else if (Math.sign(fast) === -side && Math.abs(fast) >= SPEED_CUT.acel) state = "virando";
  else if (accel * side >= SPEED_CUT.acel) state = "acelerando";
  else if (accel * side <= -SPEED_CUT.acel) state = "freando";
  else state = "constante";
  const share = agree == null || !rated.length ? null : agree / rated.length;
  const conf = share == null ? null : share >= 0.8 ? "alta" : share >= 0.6 ? "média" : "baixa";
  return { pace, fast, slow, accel, side, state, seg, agree, n: rated.length, conf, coarse: !fine };
}

/**
 * Variação da nota do dia (pontos): nota agora − nota há h horas, cada uma pela MESMA conta (regimeAt sobre barras de
 * 5 min + preço ao vivo, referência fixa). Padrão 1h, 3h e 5h (janela 1D); nas janelas curtas, OVER_STEPS. É a mesma
 * trilha da velocidade do humor (moodSpeed). { [h]: Δ }; ponto sem barra fica null.
 */
export const MOVE_HOURS = [1, 3, 5];
export function regimeMoves({
  daily,
  series,
  quotes = null,
  nowSec = Date.now() / 1000,
  hours = MOVE_HOURS,
}) {
  if (!daily?.dates?.length || !series) return null;
  const ser = quotes ? withLiveBars(series, quotes) : series;
  // referência de fechamento fixa (a de agora) nas duas pontas, como a velocidade do humor e o radar de virada:
  // a troca de referência às 16h não vira um salto falso na variação
  const ref = lastLE(daily.dates, usRefDate(nowSec));
  const now = regimeAt(nowSec, daily, ser, ref);
  if (!now) return null;
  const out = {};
  for (const h of hours) {
    const past = regimeAt(nowSec - h * 3600, daily, ser, ref);
    out[h] = past ? now.score - past.score : null;
  }
  return out;
}

export function regimePair({
  daily,
  series,
  quotes = null,
  nowSec = Date.now() / 1000,
  lookback = 3600,
}) {
  if (!daily?.dates?.length || !series) return null;
  const ser = quotes ? withLiveBars(series, quotes) : series;
  const now = regimeAt(nowSec, daily, ser);
  const past = regimeAt(nowSec - lookback, daily, ser);
  return now && past ? { now, past } : null;
}
