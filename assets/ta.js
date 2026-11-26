// Análise técnica: indicadores, níveis e padrões. Funções puras (sem DOM, sem fetch), testadas.
// Convenção: cada série devolvida tem o mesmo tamanho da entrada; `null` onde ainda não há valor.
// Barras: { o, h, l, c, v } como arrays paralelos (v pode ser tudo 0 em índices, sem volume).

export const isNum = (x) => typeof x === "number" && Number.isFinite(x);
const nulls = (n) => new Array(n).fill(null);
export const clamp = (x, lo = -1, hi = 1) => Math.max(lo, Math.min(hi, x));

// ───────────────────────── médias ─────────────────────────

/** Média móvel simples. Aceita série com `null` no começo. */
export function sma(xs, n) {
  const out = nulls(xs.length);
  const s0 = xs.findIndex(isNum);
  if (s0 < 0) return out;
  let sum = 0;
  for (let i = s0; i < xs.length; i++) {
    sum += xs[i];
    if (i - s0 >= n) sum -= xs[i - n];
    if (i - s0 >= n - 1) out[i] = sum / n;
  }
  return out;
}

/** Média móvel exponencial (semente = média simples dos n primeiros valores). */
export function ema(xs, n) {
  return smooth(xs, n, 2 / (n + 1));
}

/** Suavização de Wilder (RMA): alfa = 1/n. Base do RSI, ATR e ADX. */
function rma(xs, n) {
  return smooth(xs, n, 1 / n);
}

function smooth(xs, n, alpha) {
  const out = nulls(xs.length);
  const s0 = xs.findIndex(isNum);
  if (s0 < 0 || xs.length - s0 < n) return out;
  let prev = 0;
  for (let i = s0; i < s0 + n; i++) prev += xs[i];
  prev /= n;
  out[s0 + n - 1] = prev;
  for (let i = s0 + n; i < xs.length; i++) {
    prev = xs[i] * alpha + prev * (1 - alpha);
    out[i] = prev;
  }
  return out;
}

/** Máxima/mínima das últimas n posições (inclui a atual). */
function rolling(xs, n, fn) {
  const out = nulls(xs.length);
  for (let i = n - 1; i < xs.length; i++) {
    let m = xs[i];
    for (let j = i - n + 1; j < i; j++) m = fn(m, xs[j]);
    out[i] = m;
  }
  return out;
}
export const highest = (xs, n) => rolling(xs, n, Math.max);
export const lowest = (xs, n) => rolling(xs, n, Math.min);

// ───────────────────────── osciladores de momentum ─────────────────────────

const rsiVal = (g, l) => (l === 0 ? (g === 0 ? 50 : 100) : 100 - 100 / (1 + g / l));

/** RSI de Wilder (14): 100 - 100/(1+RS), RS = média dos ganhos / média das perdas (suavização RMA). */
export function rsi(c, n = 14) {
  const out = nulls(c.length);
  if (c.length <= n) return out;
  let g = 0;
  let l = 0;
  for (let i = 1; i <= n; i++) {
    const d = c[i] - c[i - 1];
    if (d > 0) g += d;
    else l -= d;
  }
  g /= n;
  l /= n;
  out[n] = rsiVal(g, l);
  for (let i = n + 1; i < c.length; i++) {
    const d = c[i] - c[i - 1];
    g = (g * (n - 1) + Math.max(d, 0)) / n;
    l = (l * (n - 1) + Math.max(-d, 0)) / n;
    out[i] = rsiVal(g, l);
  }
  return out;
}

/** MACD: EMA(12) - EMA(26); sinal = EMA(9) do MACD; histograma = MACD - sinal. */
export function macd(c, fast = 12, slow = 26, sig = 9) {
  const f = ema(c, fast);
  const s = ema(c, slow);
  const line = c.map((_, i) => (isNum(f[i]) && isNum(s[i]) ? f[i] - s[i] : null));
  const signal = ema(line, sig);
  const hist = line.map((x, i) => (isNum(x) && isNum(signal[i]) ? x - signal[i] : null));
  return { line, signal, hist };
}

/** Estocástico lento: %K = 100*(C-mín n)/(máx n-mín n) suavizado por 3; %D = média de 3 do %K. */
export function stochastic(h, l, c, n = 14, kSmooth = 3, dSmooth = 3) {
  const hh = highest(h, n);
  const ll = lowest(l, n);
  const raw = c.map((x, i) =>
    isNum(hh[i]) ? (hh[i] === ll[i] ? 50 : (100 * (x - ll[i])) / (hh[i] - ll[i])) : null,
  );
  const k = sma(raw, kSmooth);
  return { k, d: sma(k, dSmooth) };
}

/** Retorno em n pregões (fração). */
export function roc(c, n) {
  return c.map((x, i) => (i >= n && c[i - n] ? x / c[i - n] - 1 : null));
}

// ───────────────────────── volatilidade e tendência ─────────────────────────

export function trueRange(h, l, c) {
  return c.map((_, i) =>
    i === 0
      ? h[i] - l[i]
      : Math.max(h[i] - l[i], Math.abs(h[i] - c[i - 1]), Math.abs(l[i] - c[i - 1])),
  );
}

/** ATR de Wilder (14): amplitude média "verdadeira" (inclui gaps). Mede o balanço normal do preço. */
export function atr(h, l, c, n = 14) {
  return rma(trueRange(h, l, c), n);
}

/** Bandas de Bollinger (20, 2σ populacional). %B: posição na banda (0 = inferior, 1 = superior). */
export function bollinger(c, n = 20, k = 2) {
  const mid = sma(c, n);
  const up = nulls(c.length);
  const lo = nulls(c.length);
  const pctB = nulls(c.length);
  const bw = nulls(c.length);
  for (let i = n - 1; i < c.length; i++) {
    let v = 0;
    for (let j = i - n + 1; j <= i; j++) v += (c[j] - mid[i]) ** 2;
    const sd = Math.sqrt(v / n);
    up[i] = mid[i] + k * sd;
    lo[i] = mid[i] - k * sd;
    pctB[i] = up[i] > lo[i] ? (c[i] - lo[i]) / (up[i] - lo[i]) : 0.5;
    bw[i] = mid[i] ? (up[i] - lo[i]) / mid[i] : 0;
  }
  return { mid, up, lo, pctB, bw };
}

/** ADX / +DI / -DI de Wilder (14): força da tendência (ADX) e quem domina (+DI compradores, -DI vendedores). */
export function adx(h, l, c, n = 14) {
  const len = c.length;
  const out = { adx: nulls(len), pdi: nulls(len), mdi: nulls(len) };
  if (len < 2 * n + 1) return out;
  const tr = [0];
  const pdm = [0];
  const mdm = [0];
  for (let i = 1; i < len; i++) {
    const up = h[i] - h[i - 1];
    const dn = l[i - 1] - l[i];
    pdm.push(up > dn && up > 0 ? up : 0);
    mdm.push(dn > up && dn > 0 ? dn : 0);
    tr.push(Math.max(h[i] - l[i], Math.abs(h[i] - c[i - 1]), Math.abs(l[i] - c[i - 1])));
  }
  let sTR = 0;
  let sP = 0;
  let sM = 0;
  for (let i = 1; i <= n; i++) {
    sTR += tr[i];
    sP += pdm[i];
    sM += mdm[i];
  }
  const dx = nulls(len);
  for (let i = n; i < len; i++) {
    if (i > n) {
      sTR = sTR - sTR / n + tr[i];
      sP = sP - sP / n + pdm[i];
      sM = sM - sM / n + mdm[i];
    }
    const p = sTR ? (100 * sP) / sTR : 0;
    const m = sTR ? (100 * sM) / sTR : 0;
    out.pdi[i] = p;
    out.mdi[i] = m;
    dx[i] = p + m ? (100 * Math.abs(p - m)) / (p + m) : 0;
  }
  let a = 0;
  for (let i = n; i < 2 * n; i++) a += dx[i];
  a /= n;
  out.adx[2 * n - 1] = a;
  for (let i = 2 * n; i < len; i++) {
    a = (a * (n - 1) + dx[i]) / n;
    out.adx[i] = a;
  }
  return out;
}

// ───────────────────────── volume ─────────────────────────

export const hasVolume = (v) => v.reduce((a, b) => a + b, 0) > 0;

/** OBV: soma o volume nos dias de alta e subtrai nos dias de queda. */
export function obv(c, v) {
  const out = [0];
  for (let i = 1; i < c.length; i++) {
    out.push(out[i - 1] + (c[i] > c[i - 1] ? v[i] : c[i] < c[i - 1] ? -v[i] : 0));
  }
  return out;
}

/** Chaikin Money Flow (20): -1 a +1; positivo = fechamentos perto da máxima com volume (acumulação). */
export function cmf(h, l, c, v, n = 20) {
  const out = nulls(c.length);
  const mfv = c.map((x, i) =>
    h[i] === l[i] ? 0 : ((x - l[i] - (h[i] - x)) / (h[i] - l[i])) * v[i],
  );
  for (let i = n - 1; i < c.length; i++) {
    let a = 0;
    let b = 0;
    for (let j = i - n + 1; j <= i; j++) {
      a += mfv[j];
      b += v[j];
    }
    out[i] = b ? a / b : null;
  }
  return out;
}

/** Money Flow Index (14): "RSI com volume". */
export function mfi(h, l, c, v, n = 14) {
  const out = nulls(c.length);
  const tp = c.map((x, i) => (h[i] + l[i] + x) / 3);
  for (let i = n; i < c.length; i++) {
    let pos = 0;
    let neg = 0;
    for (let j = i - n + 1; j <= i; j++) {
      const f = tp[j] * v[j];
      if (tp[j] > tp[j - 1]) pos += f;
      else if (tp[j] < tp[j - 1]) neg += f;
    }
    out[i] = neg === 0 ? (pos === 0 ? 50 : 100) : 100 - 100 / (1 + pos / neg);
  }
  return out;
}

/** Média do volume das n barras ANTERIORES a cada posição (não inclui a atual). */
export function avgVolumePrior(v, n = 20) {
  const out = nulls(v.length);
  for (let i = n; i < v.length; i++) {
    let s = 0;
    for (let j = i - n; j < i; j++) s += v[j];
    out[i] = s / n;
  }
  return out;
}

/**
 * VWAP por sessão (reinicia a cada dia) com bandas de ±1 desvio-padrão ponderado por volume.
 * `session[i]` identifica o dia de cada barra. Sem volume, usa peso 1 (média do preço típico).
 */
export function vwapSessions(h, l, c, v, session) {
  const vw = nulls(c.length);
  const up = nulls(c.length);
  const lo = nulls(c.length);
  let cur = null;
  let pv = 0;
  let pv2 = 0;
  let vv = 0;
  for (let i = 0; i < c.length; i++) {
    if (session[i] !== cur) {
      cur = session[i];
      pv = pv2 = vv = 0;
    }
    const tp = (h[i] + l[i] + c[i]) / 3;
    const w = v[i] > 0 ? v[i] : 1;
    pv += tp * w;
    pv2 += tp * tp * w;
    vv += w;
    const m = pv / vv;
    const sd = Math.sqrt(Math.max(0, pv2 / vv - m * m));
    vw[i] = m;
    up[i] = m + sd;
    lo[i] = m - sd;
  }
  return { vwap: vw, up, lo };
}

// ───────────────────────── estrutura: topos, fundos, níveis ─────────────────────────

/**
 * Pivôs: topo em i se h[i] é a máxima das k barras de cada lado (confirmado só k barras depois).
 * Retorna lista cronológica de { i, price, type: "H" | "L" }.
 */
export function swings(h, l, k = 3) {
  const out = [];
  for (let i = k; i < h.length - k; i++) {
    let isH = true;
    let isL = true;
    for (let j = 1; j <= k; j++) {
      if (!(h[i] > h[i + j]) || !(h[i] >= h[i - j])) isH = false;
      if (!(l[i] < l[i + j]) || !(l[i] <= l[i - j])) isL = false;
    }
    if (isH) out.push({ i, price: h[i], type: "H" });
    if (isL) out.push({ i, price: l[i], type: "L" });
  }
  return out.sort((a, b) => a.i - b.i);
}

/**
 * Estrutura de tendência (Teoria de Dow) pelos dois últimos topos e fundos:
 * topos e fundos mais altos = alta; mais baixos = baixa; senão, indefinida.
 */
export function dowStructure(sw) {
  const hs = sw.filter((s) => s.type === "H").slice(-2);
  const ls = sw.filter((s) => s.type === "L").slice(-2);
  if (hs.length < 2 || ls.length < 2) return { trend: "unknown", hh: null, hl: null };
  const hh = hs[1].price > hs[0].price;
  const hl = ls[1].price > ls[0].price;
  const trend = hh && hl ? "up" : !hh && !hl ? "down" : "mixed";
  return { trend, hh, hl, lastHigh: hs[1], lastLow: ls[1] };
}

/**
 * Suportes e resistências: agrupa pivôs próximos (tolerância `tol`) em zonas.
 * Cada zona: { price, touches, last (índice do último toque), kind: "sup" | "res" }.
 * Zonas com 2+ toques valem mais; se não houver nenhuma, usa os pivôs soltos.
 */
export function levels(sw, price, tol) {
  const pts = sw.map((s) => ({ p: s.price, i: s.i })).sort((a, b) => a.p - b.p);
  const zones = [];
  for (const pt of pts) {
    const z = zones[zones.length - 1];
    if (z && pt.p - z.start <= tol) {
      z.sum += pt.p;
      z.n++;
      z.last = Math.max(z.last, pt.i);
    } else zones.push({ start: pt.p, sum: pt.p, n: 1, last: pt.i });
  }
  const all = zones.map((z) => ({
    price: z.sum / z.n,
    touches: z.n,
    last: z.last,
    kind: z.sum / z.n >= price ? "res" : "sup",
  }));
  const strong = all.filter((z) => z.touches >= 2);
  const pool = strong.length >= 2 ? strong : all;
  const res = pool.filter((z) => z.kind === "res").sort((a, b) => a.price - b.price);
  const sup = pool.filter((z) => z.kind === "sup").sort((a, b) => b.price - a.price);
  return { supports: sup, resistances: res };
}

/** Pivôs clássicos do dia anterior: P = (H+L+C)/3; R1 = 2P-L; S1 = 2P-H; R2 = P+(H-L); S2 = P-(H-L). */
export function pivotsClassic(h, l, c) {
  const p = (h + l + c) / 3;
  return { p, r1: 2 * p - l, s1: 2 * p - h, r2: p + (h - l), s2: p - (h - l) };
}

const FIB_RATIOS = [0.236, 0.382, 0.5, 0.618, 0.786];

/**
 * Retração de Fibonacci da última perna relevante (entre o último topo e o último fundo).
 * dir "up": perna de alta (fundo → topo), níveis medem o recuo; "down": perna de queda, níveis medem o repique.
 * `retr`: quanto da perna o preço já devolveu (0 = no extremo, 1 = voltou ao início).
 */
export function fibonacci(sw, price) {
  const lastH = [...sw].reverse().find((s) => s.type === "H");
  const lastL = [...sw].reverse().find((s) => s.type === "L");
  if (!lastH || !lastL || lastH.price === lastL.price) return null;
  const dir = lastH.i > lastL.i ? "up" : "down";
  const high = lastH.price;
  const low = lastL.price;
  const span = high - low;
  const lv = FIB_RATIOS.map((r) => ({
    r,
    price: dir === "up" ? high - r * span : low + r * span,
  }));
  const retr = dir === "up" ? (high - price) / span : (price - low) / span;
  return { dir, high, low, levels: lv, retr, span };
}

/**
 * Divergência de RSI: preço faz novo fundo mais baixo mas o oscilador faz fundo mais alto (altista),
 * ou preço faz topo mais alto e o oscilador topo mais baixo (baixista). Só vale se o 2º pivô é recente.
 */
export function divergence(sw, osc, nBars, maxAge = 15) {
  const check = (type) => {
    const p = sw.filter((s) => s.type === type).slice(-2);
    if (p.length < 2) return false;
    const [a, b] = p;
    if (nBars - 1 - b.i > maxAge || b.i - a.i > 60) return false;
    if (!isNum(osc[a.i]) || !isNum(osc[b.i])) return false;
    return type === "L"
      ? b.price < a.price && osc[b.i] > osc[a.i] + 2
      : b.price > a.price && osc[b.i] < osc[a.i] - 2;
  };
  return { bullish: check("L"), bearish: check("H") };
}

// ───────────────────────── candles ─────────────────────────

const body = (b, i) => Math.abs(b.c[i] - b.o[i]);
const range = (b, i) => b.h[i] - b.l[i];
const upper = (b, i) => b.h[i] - Math.max(b.o[i], b.c[i]);
const lower = (b, i) => Math.min(b.o[i], b.c[i]) - b.l[i];
const isGreen = (b, i) => b.c[i] > b.o[i];
const isRed = (b, i) => b.c[i] < b.o[i];

/**
 * Padrões de candle que TERMINAM na barra i. `unit` = ATR (para medir "tendência anterior" e "candle grande").
 * Candle isolado acerta pouco: o motor de sinais só os usa perto de suportes/resistências.
 * Retorna [{ id, name, dir: +1 | -1 | 0 }].
 */
export function candlePatterns(b, i, unit) {
  const out = [];
  if (i < 4 || !(range(b, i) > 0)) return out;
  const ref = b.c[i - 1];
  const prior = b.c[i - 5] ?? b.c[0];
  const down = prior - ref > 0.6 * unit;
  const up = ref - prior > 0.6 * unit;
  const r = range(b, i);
  const bd = body(b, i);

  if (bd <= 0.1 * r) out.push({ id: "doji", name: "Doji", dir: 0 });
  if (down && lower(b, i) >= 2 * bd && upper(b, i) <= 0.2 * r && bd > 0.03 * r)
    out.push({ id: "hammer", name: "Martelo", dir: 1 });
  if (up && upper(b, i) >= 2 * bd && lower(b, i) <= 0.2 * r && bd > 0.03 * r)
    out.push({ id: "shooting", name: "Estrela cadente", dir: -1 });
  if (
    down &&
    isRed(b, i - 1) &&
    isGreen(b, i) &&
    b.o[i] <= b.c[i - 1] &&
    b.c[i] >= b.o[i - 1] &&
    bd > body(b, i - 1)
  )
    // prettier-ignore
    out.push({ id: "bull-engulf", name: "Engolfo de alta", dir: 1 });
  if (
    up &&
    isGreen(b, i - 1) &&
    isRed(b, i) &&
    b.o[i] >= b.c[i - 1] &&
    b.c[i] <= b.o[i - 1] &&
    bd > body(b, i - 1)
  )
    // prettier-ignore
    out.push({ id: "bear-engulf", name: "Engolfo de baixa", dir: -1 });

  const b0 = i - 2;
  const down2 = b.c[i - 6 >= 0 ? i - 6 : 0] - b.c[b0] > 0.6 * unit;
  const up2 = b.c[b0] - b.c[i - 6 >= 0 ? i - 6 : 0] > 0.6 * unit;
  const mid0 = (b.o[b0] + b.c[b0]) / 2;
  if (
    down2 &&
    isRed(b, b0) &&
    body(b, b0) >= 0.7 * unit &&
    body(b, i - 1) <= 0.35 * body(b, b0) &&
    isGreen(b, i) &&
    b.c[i] > mid0
  )
    // prettier-ignore
    out.push({ id: "morning-star", name: "Estrela da manhã", dir: 1 });
  if (
    up2 &&
    isGreen(b, b0) &&
    body(b, b0) >= 0.7 * unit &&
    body(b, i - 1) <= 0.35 * body(b, b0) &&
    isRed(b, i) &&
    b.c[i] < mid0
  )
    // prettier-ignore
    out.push({ id: "evening-star", name: "Estrela da noite", dir: -1 });
  return out;
}
