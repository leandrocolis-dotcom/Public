// Long & Short: indicadores de mercado do subjacente (puro, sem rede, sem relógio implícito).
// Insumos: barras de 5 min com pré/pós de api/intraday?prepost=1 ({ t (s), o, h, l, c, v, s }) e diário de
// data/hist/<ATIVO>.csv ([{ date, o, h, l, c, v }]). Fórmulas de `metricas.mercado` do JSON v4.
// ATR = média SIMPLES dos últimos 14 true ranges (conferível em planilha). Sem volume no trecho: VWAP vira
// média por tempo (TWAP) e approx = true ("VWAP aproximada": o filtro de volume desliga).
import { OPEN, PRE, nyClock } from "./sessions.js";
import { PARAMS } from "./ls-params.js";
import { tradingDay } from "./ls-clock.js";

const fin = (x) => typeof x === "number" && Number.isFinite(x);

/** Índices das barras do dia de trading de `ms` com minuto ET em [from, to). */
export function dayIdx(bars, ms, from = PRE, to = 24 * 60) {
  const day = tradingDay(ms);
  const out = [];
  for (let i = 0; i < (bars?.t?.length ?? 0); i++) {
    const t = bars.t[i] * 1000;
    if (t > ms) break;
    const { min } = nyClock(t);
    if (tradingDay(t) === day && min >= from && min < to) out.push(i);
  }
  return out;
}

const typical = (b, i) => (b.h[i] + b.l[i] + b.c[i]) / 3;

/**
 * VWAP do dia: regular desde 9:30 (`extended` = desde 4:00). Só barras até `ms`.
 * { value, approx, missing, n } ou null sem barras. missing = barras sem volume (ficam fora da média).
 * O Yahoo não traz volume no pré/pós (conferido em 27/11/2026: 0 de ~470 barras em SOXX, SOXL, SQQQ, QQQ):
 * a estendida com barra sem volume é aproximada; sem volume nenhum vira média por tempo (TWAP).
 */
export function vwap(bars, ms, { extended = false } = {}) {
  const idx = dayIdx(bars, ms, extended ? PRE : OPEN).filter((i) => extended || bars.s?.[i] !== "post"); // prettier-ignore
  if (!idx.length) return null;
  let pv = 0;
  let vol = 0;
  let tp = 0;
  let missing = 0;
  for (const i of idx) {
    const v = fin(bars.v?.[i]) && bars.v[i] > 0 ? bars.v[i] : 0;
    if (!v) missing++;
    pv += typical(bars, i) * v;
    vol += v;
    tp += typical(bars, i);
  }
  const n = idx.length;
  if (!(vol > 0)) return { value: tp / n, approx: true, missing, n };
  return { value: pv / vol, approx: extended && missing > 0, missing, n };
}

/** True range de cada linha ({ h, l, c }) contra o fechamento anterior. */
export function trueRanges(rows) {
  const out = [];
  for (let i = 1; i < rows.length; i++) {
    const { h, l } = rows[i];
    const pc = rows[i - 1].c;
    out.push(Math.max(h - l, Math.abs(h - pc), Math.abs(l - pc)));
  }
  return out;
}

/** ATR(n) = média simples dos últimos n true ranges; null se faltam linhas. */
export function atr(rows, n = PARAMS.atr_periodo) {
  const tr = trueRanges(rows ?? []);
  if (tr.length < n) return null;
  const last = tr.slice(-n);
  return last.reduce((a, b) => a + b, 0) / n;
}

/** Agrega barras de 5 min do pregão regular em candles de `mins` (padrão 15) alinhados ao relógio. */
export function aggregate(bars, mins = PARAMS.atr_intra_candle_min, ms = Infinity) {
  const out = [];
  let cur = null;
  for (let i = 0; i < (bars?.t?.length ?? 0); i++) {
    if (bars.t[i] * 1000 > ms) break;
    if (bars.s && bars.s[i] !== "reg") continue;
    const key = Math.floor(bars.t[i] / (mins * 60));
    if (!cur || cur.key !== key) {
      cur = { key, t: key * mins * 60, o: bars.o[i], h: bars.h[i], l: bars.l[i], c: bars.c[i], v: bars.v?.[i] ?? 0 }; // prettier-ignore
      out.push(cur);
    } else {
      cur.h = Math.max(cur.h, bars.h[i]);
      cur.l = Math.min(cur.l, bars.l[i]);
      cur.c = bars.c[i];
      cur.v += bars.v?.[i] ?? 0;
    }
  }
  return out;
}

/** ATR intradiário: ATR(14) dos candles de 15 min do regular (inclui pregões anteriores das barras). */
export const atrIntra = (bars, ms, p = PARAMS) => atr(aggregate(bars, p.atr_intra_candle_min, ms), p.atr_periodo); // prettier-ignore

/** Média móvel simples dos fechamentos; `back` pregões atrás. */
export function sma(rows, n = 20, back = 0) {
  const end = rows.length - back;
  if (end < n) return null;
  let s = 0;
  for (let i = end - n; i < end; i++) s += rows[i].c;
  return s / n;
}

/** Viés diário: alta se S > MM20 e MM20 − MM20[5] > 0; baixa se o oposto; senão neutro. */
export function bias(rows, S) {
  const m = sma(rows, 20);
  const m5 = sma(rows, 20, 5);
  if (m === null || m5 === null || !fin(S)) return { bias: null, ma20: m, slope: null };
  const slope = m - m5;
  const b = S > m && slope > 0 ? "alta" : S < m && slope < 0 ? "baixa" : "neutro";
  return { bias: b, ma20: m, slope };
}

/** Máxima/mínima do pré-mercado de hoje (4:00–9:30). */
export function preRange(bars, ms) {
  const idx = dayIdx(bars, ms, PRE, OPEN);
  if (!idx.length) return null;
  return { hi: Math.max(...idx.map((i) => bars.h[i])), lo: Math.min(...idx.map((i) => bars.l[i])) };
}

/** Faixa de abertura (9:30 até 9:30 + faixa_abertura_min): { hi, lo, avgVol, done } ou null. */
export function openingRange(bars, ms, p = PARAMS) {
  const end = OPEN + p.faixa_abertura_min;
  const idx = dayIdx(bars, ms, OPEN, end);
  if (!idx.length) return null;
  const done = nyClock(ms).min >= end;
  const vols = idx.map((i) => bars.v?.[i] ?? 0);
  return {
    hi: Math.max(...idx.map((i) => bars.h[i])),
    lo: Math.min(...idx.map((i) => bars.l[i])),
    avgVol: vols.reduce((a, b) => a + b, 0) / vols.length,
    done,
  };
}

/** Gap: % e em ATR diário contra o fechamento regular anterior. */
export function gap(S, prevClose, atrD) {
  if (!fin(S) || !(prevClose > 0)) return null;
  return { pct: (S / prevClose - 1) * 100, atr: atrD > 0 ? (S - prevClose) / atrD : null };
}

/** Quantas barras de 5 min do regular mudaram de lado da VWAP corrente (cumulativa). */
export function vwapCrosses(bars, ms) {
  const idx = dayIdx(bars, ms, OPEN).filter((i) => bars.s?.[i] !== "post");
  let pv = 0;
  let vol = 0;
  let tp = 0;
  let side = 0;
  let n = 0;
  idx.forEach((i, k) => {
    const v = bars.v?.[i] > 0 ? bars.v[i] : 0;
    pv += typical(bars, i) * v;
    vol += v;
    tp += typical(bars, i);
    const w = vol > 0 ? pv / vol : tp / (k + 1);
    const s = Math.sign(bars.c[i] - w);
    if (s !== 0) {
      if (side !== 0 && s !== side) n++;
      side = s;
    }
  });
  return n;
}

/**
 * Rompimento da faixa de abertura na última barra fechada do regular: { dir: "up"|"down"|null, volRel }.
 * Confirmado só com volRel ≥ volume_confirmacao_mult (sem volume: nunca confirma).
 */
export function breakout(bars, ms, p = PARAMS) {
  const or = openingRange(bars, ms, p);
  if (!or?.done) return { dir: null, volRel: null };
  const idx = dayIdx(bars, ms, OPEN + p.faixa_abertura_min).filter((i) => bars.s?.[i] !== "post");
  const i = idx.at(-1);
  if (i === undefined) return { dir: null, volRel: null };
  const volRel = or.avgVol > 0 ? (bars.v?.[i] ?? 0) / or.avgVol : null;
  const ok = volRel !== null && volRel >= p.volume_confirmacao_mult;
  const dir = bars.c[i] > or.hi ? "up" : bars.c[i] < or.lo ? "down" : null;
  return { dir: ok ? dir : null, volRel, raw: dir };
}

/** Retornos diários alinhados por data dos dois últimos `n` pregões em comum. */
export function alignedReturns(a, b, n = PARAMS.janela_beta_corr_pregoes) {
  const mb = new Map(b.map((r) => [r.date, r.c]));
  const common = a.filter((r) => mb.has(r.date));
  const ra = [];
  const rb = [];
  for (let i = 1; i < common.length; i++) {
    ra.push(common[i].c / common[i - 1].c - 1);
    rb.push(mb.get(common[i].date) / mb.get(common[i - 1].date) - 1);
  }
  return { ra: ra.slice(-n), rb: rb.slice(-n) };
}

/** Beta de a contra b e correlação (null com menos de `n` retornos). */
export function betaCorr(a, b, n = PARAMS.janela_beta_corr_pregoes) {
  const { ra, rb } = alignedReturns(a ?? [], b ?? [], n);
  if (ra.length < n) return { beta: null, corr: null, n: ra.length };
  const ma = ra.reduce((x, y) => x + y, 0) / n;
  const mb = rb.reduce((x, y) => x + y, 0) / n;
  let cov = 0;
  let va = 0;
  let vb = 0;
  for (let i = 0; i < n; i++) {
    cov += (ra[i] - ma) * (rb[i] - mb);
    va += (ra[i] - ma) ** 2;
    vb += (rb[i] - mb) ** 2;
  }
  return { beta: vb > 0 ? cov / vb : null, corr: va > 0 && vb > 0 ? cov / Math.sqrt(va * vb) : null, n }; // prettier-ignore
}

/**
 * Pacote do subjacente para o motor: VWAP (regular e estendida), ATRs, viés, PMH/PML, faixa, gap,
 * cruzamentos, rompimento. `S` = preço atual; `daily` sem a linha de hoje (fechamentos anteriores).
 */
export function underlyingView({ bars, daily, S, ms, params = PARAMS }) {
  const atrD = atr(daily, params.atr_periodo);
  const prevClose = daily?.at(-1)?.c ?? null;
  return {
    S,
    vwap: vwap(bars, ms),
    vwapExt: vwap(bars, ms, { extended: true }),
    atrIntra: atrIntra(bars, ms, params),
    atrD,
    ...bias(daily ?? [], S),
    pre: preRange(bars, ms),
    or: openingRange(bars, ms, params),
    gap: gap(S, prevClose, atrD),
    crosses: vwapCrosses(bars, ms),
    breakout: breakout(bars, ms, params),
  };
}
