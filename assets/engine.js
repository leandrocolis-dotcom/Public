// Motor de cálculo do Pêndulo: funções puras (sem DOM, sem fetch).
// Implementa as seções 4 a 9 e 11 da especificação. Roda no navegador e no Node (testes).
import { ASSETS, MIN_HISTORY, REGION_LIST, SECTOR_LIST, MACRO_LIST } from "./universe.js";

// ───────────────────────── utilitários numéricos ─────────────────────────

const isNum = (x) => typeof x === "number" && Number.isFinite(x);
const clip = (x) => (isNum(x) ? Math.max(-1, Math.min(1, x)) : 0);
const mean = (xs) => xs.reduce((a, b) => a + b, 0) / xs.length;
const sum = (xs) => xs.reduce((a, b) => a + b, 0);

/** Desvio-padrão amostral (n-1). */
export function stdSample(xs) {
  if (xs.length < 2) return 0;
  const m = mean(xs);
  return Math.sqrt(sum(xs.map((x) => (x - m) ** 2)) / (xs.length - 1));
}

/** Retorno de k pregões: p / s[-1-k] - 1. */
const retK = (s, k) => (s.length > k ? s[s.length - 1] / s[s.length - 1 - k] - 1 : null);

/** RSI simples de 14 dias (sem suavização de Wilder). */
export function rsi14(s) {
  if (s.length < 15) return null;
  let g = 0;
  let l = 0;
  for (let i = s.length - 14; i < s.length; i++) {
    const d = s[i] - s[i - 1];
    if (d > 0) g += d;
    else l += -d;
  }
  return l === 0 ? 100 : 100 - 100 / (1 + g / l);
}

// ───────────────────────── datas / frescor (seção 9) ─────────────────────────

const BRT_MS = -3 * 3600 * 1000;
/** Data (AAAA-MM-DD) no fuso de Brasília para um instante. */
const brtDate = (d) => new Date(d.getTime() + BRT_MS).toISOString().slice(0, 10);

/** Dias úteis (seg-sex) no intervalo (de, até]; datas AAAA-MM-DD. */
export function businessDaysBetween(from, to) {
  let n = 0;
  const cur = new Date(`${from}T00:00:00Z`);
  const end = new Date(`${to}T00:00:00Z`);
  while (cur < end) {
    cur.setUTCDate(cur.getUTCDate() + 1);
    const wd = cur.getUTCDay();
    if (wd !== 0 && wd !== 6) n++;
  }
  return n;
}

// Limites do selo no intradiário (minutos desde a última cotação do SPY).
const LIVE_WARN_MIN = 10;
const LIVE_BAD_MIN = 30;

/**
 * Selo de frescor do topo. Retorna { level: "ok"|"warn"|"bad", label, updatedAt, ageMin }.
 * Intradiário: até 10 min = ao vivo; 10 a 30 min = atenção; acima de 30 min = atrasado.
 */
export function computeFreshness(meta, now = new Date()) {
  const updatedAt = meta?.updated_at_brt ? new Date(meta.updated_at_brt) : null;
  if (!updatedAt || Number.isNaN(updatedAt.getTime())) {
    return { level: "bad", label: "Sem horário", updatedAt: null, ageMin: null };
  }
  const ageMin = Math.max(0, Math.round((now - updatedAt) / 60000));
  if (businessDaysBetween(brtDate(updatedAt), brtDate(now)) > 1) {
    return { level: "bad", label: "Defasado", updatedAt, ageMin };
  }
  if (meta.market_status === "Intradiário") {
    if (ageMin > LIVE_BAD_MIN)
      return { level: "bad", label: `Atrasado ${ageMin} min`, updatedAt, ageMin };
    if (ageMin > LIVE_WARN_MIN)
      return { level: "warn", label: `Cotação de ${ageMin} min`, updatedAt, ageMin };
    const live = /ao vivo/i.test(meta.source ?? "");
    return { level: "ok", label: live ? "Ao vivo" : "Intradiário", updatedAt, ageMin };
  }
  return { level: "ok", label: "Fechamento", updatedAt, ageMin };
}

/** Ativo defasado (9.2): sem last_real, last_real < último pregão, ou 3 últimos fechamentos idênticos. */
export function isStale(code, s, lastReal, lastDate) {
  const lr = lastReal?.[code];
  if (!lr || lr < lastDate) return true;
  const n = s.length;
  return n >= 3 && s[n - 1] === s[n - 2] && s[n - 2] === s[n - 3];
}

// ───────────────────────── métricas por ativo (seção 4) ─────────────────────────

export function momentumBand(m) {
  if (m >= 80) return "Forte alta";
  if (m >= 60) return "Alta";
  if (m >= 40) return "Neutro";
  if (m >= 20) return "Baixa";
  return "Forte baixa";
}

/** Fluxo inferido por preço (4.2). */
export function flowOf({ r1m, r3m, vsMa50 }) {
  if (r1m > 0 && r3m > 0 && vsMa50 > 0) return "Entrando";
  if (r1m < 0 && r3m < 0 && vsMa50 < 0) return "Saindo";
  return "Misto";
}

/** Momentum 0 a 100 (4.1). */
export function momentumOf({ p, ma50, ma200, r1m, r3m, r6m, rsi }) {
  const tend = ((p > ma50) + (ma50 > ma200) + (p > ma200)) / 3;
  const rets = ((clip(r1m / 0.1) + clip(r3m / 0.2) + clip(r6m / 0.3)) / 3 + 1) / 2;
  return 100 * (0.4 * tend + 0.4 * rets + 0.2 * (rsi / 100));
}

/** Métricas de um ativo. `dates` é o calendário completo (para o YTD). */
export function assetMetrics(code, s, dates, lastReal, info = ASSETS[code]) {
  const n = s.length;
  const lastDate = dates[dates.length - 1];
  const out = { code, name: info?.name ?? code, group: info?.group ?? "", unit: info?.unit ?? "" };
  out.ok = n >= MIN_HISTORY;
  out.stale = isStale(code, s, lastReal, lastDate);
  out.lastReal = lastReal?.[code] ?? null;
  if (!out.ok) return out;

  const p = s[n - 1];
  const ma = (k) => mean(s.slice(n - k));
  const ma50 = ma(50);
  const ma200 = ma(200);
  const year = lastDate.slice(0, 4);
  let ytd = null;
  for (let i = dates.length - 1; i >= 0; i--) {
    if (dates[i].slice(0, 4) < year) {
      ytd = p / s[i] - 1;
      break;
    }
  }
  const r1m = retK(s, 21);
  const r3m = retK(s, 63);
  const r6m = retK(s, 126);
  const rsi = rsi14(s);
  const vsMa50 = p / ma50 - 1;

  Object.assign(out, {
    price: p,
    r1d: retK(s, 1),
    r5d: retK(s, 5),
    r1m,
    r3m,
    r6m,
    r1y: retK(s, 252),
    ytd,
    ma50,
    ma200,
    vsMa50,
    fromHigh: p / Math.max(...s.slice(n - 252)) - 1,
    d1: p - s[n - 2],
    d5: p - s[n - 6],
    d21: p - s[n - 22],
    rsi,
    timing: rsi > 70 ? "Sobrecomprado" : rsi < 30 ? "Sobrevendido" : null,
    momentum: momentumOf({ p, ma50, ma200, r1m, r3m, r6m, rsi }),
    flow: flowOf({ r1m, r3m, vsMa50 }),
    spark: s.slice(n - 126).map((v) => (100 * v) / s[n - 126]),
  });
  out.band = momentumBand(out.momentum);
  return out;
}

// ───────────────────────── macro e regime (seção 5) ─────────────────────────

const RATE_CODES = new Set(["US10Y", "CURVE"]);

function macroBlock(code, s, name) {
  const n = s.length;
  const isRate = RATE_CODES.has(code);
  const change = (k) =>
    isRate ? (s[n - 1] - s[n - 1 - k]) * 100 : (s[n - 1] / s[n - 1 - k] - 1) * 100;
  return {
    code,
    name,
    level: s[n - 1],
    unit: isRate ? "bps" : "%", // unidade das variações
    c1d: change(1),
    c5d: change(5),
    c1m: change(21),
    spark: s.slice(n - 63),
    invertColors: code === "VIX", // alta do VIX = vermelho
  };
}

/** Regime (5.2). Cada caixa: { label, tone: "good"|"bad"|"neutral" }. */
export function computeRegime(assets, series) {
  const get = (c) => assets[c];
  const vix = get("VIX");
  const dxy = get("DXY");
  const dbc = get("DBC");
  const out = {};

  if (vix?.ok) {
    const risk =
      vix.price > 25 || vix.price > 1.2 * vix.ma50
        ? ["RISK-OFF", "bad"]
        : vix.price < 18 && vix.price < vix.ma50
          ? ["RISK-ON", "good"]
          : ["NEUTRO", "neutral"];
    out.risk = { label: risk[0], tone: risk[1] };
  }
  if (dxy?.ok) {
    const [l, t] =
      dxy.vsMa50 > 0 && dxy.r1m > 0
        ? ["DÓLAR FORTE", "bad"]
        : dxy.vsMa50 < 0 && dxy.r1m < 0
          ? ["DÓLAR FRACO", "good"]
          : ["LATERAL", "neutral"];
    out.dollar = { label: l, tone: t };
  }
  const t10 = get("US10Y");
  if (t10?.ok) {
    const diff = t10.price - t10.ma50;
    const [l, t] =
      diff > 0.1
        ? ["JUROS SUBINDO", "bad"]
        : diff < -0.1
          ? ["JUROS CAINDO", "good"]
          : ["ESTÁVEIS", "neutral"];
    out.rates = { label: l, tone: t };
  }
  if (dbc?.ok) {
    const [l, t] =
      dbc.vsMa50 > 0 && dbc.r1m > 0
        ? ["EM ALTA", "good"]
        : dbc.vsMa50 < 0 && dbc.r1m < 0
          ? ["EM BAIXA", "bad"]
          : ["LATERAL", "neutral"];
    out.commodities = { label: l, tone: t };
  }
  if (series.US10Y && series.US3M) {
    const curve = series.US10Y.at(-1) - series.US3M.at(-1);
    const [l, t] =
      curve > 0.5 ? ["INCLINADA", "good"] : curve < 0 ? ["INVERTIDA", "bad"] : ["PLANA", "neutral"];
    out.curve = { label: l, tone: t, value: curve };
  }
  return out;
}

// ───────────────────────── snapshot completo ─────────────────────────

/** Valida o formato do prices.json (2.1). Retorna lista de erros (vazia = ok). */
export function validatePrices(prices) {
  const errs = [];
  if (!prices || !Array.isArray(prices.dates) || !prices.series) return ["prices.json malformado"];
  const n = prices.dates.length;
  if (n < MIN_HISTORY) errs.push(`histórico curto: ${n} pregões (mínimo ${MIN_HISTORY})`);
  for (const [code, s] of Object.entries(prices.series)) {
    if (s.length !== n) errs.push(`${code}: tamanho ${s.length} ≠ ${n} datas`);
    else if (s.some((v) => !isNum(v))) errs.push(`${code}: contém valores nulos/inválidos`);
  }
  return errs;
}

/**
 * Calcula tudo a partir do prices.json.
 * @param prices   conteúdo do data/prices.json
 * @param previous snapshot anterior (compacto) para o quadro "O que mudou"
 * @param opts     { now?: Date }
 */
export function computeSnapshot(prices, previous = null, opts = {}) {
  const now = opts.now ?? new Date();
  const { dates, series: raw, last_real: lastReal = {}, meta = {} } = prices;
  const series = { ...raw };
  if (raw.US10Y && raw.US3M) series.CURVE = raw.US10Y.map((v, i) => v - raw.US3M[i]);
  const lastReal2 = { ...lastReal };
  if (lastReal.US10Y && lastReal.US3M) {
    lastReal2.CURVE = lastReal.US10Y < lastReal.US3M ? lastReal.US10Y : lastReal.US3M;
  }

  const assets = {};
  for (const code of Object.keys(series)) {
    const info =
      code === "CURVE"
        ? { name: "Curva (US10Y − US3M)", unit: "p.p.", group: "Macro" }
        : ASSETS[code];
    assets[code] = assetMetrics(code, series[code], dates, lastReal2, info);
  }

  const macro = MACRO_LIST.filter((c) => series[c]).map((c) =>
    macroBlock(c, series[c], assets[c].name),
  );
  const regime = computeRegime(assets, series);

  const staleCodes = Object.values(assets)
    .filter((a) => a.ok && a.stale && ASSETS[a.code])
    .map((a) => a.code);

  const snapshot = {
    meta,
    freshness: computeFreshness(meta, now),
    lastDate: dates[dates.length - 1],
    assets,
    macro,
    regime,
    staleCodes,
  };
  snapshot.changes = diffSnapshots(previous, compactSnapshot(snapshot));
  return snapshot;
}

// ───────────────────────── "O que mudou" (7.9) ─────────────────────────

/** Versão enxuta do snapshot, para guardar no localStorage. */
export function compactSnapshot(s) {
  return {
    lastDate: s.lastDate,
    updatedAt: s.meta?.updated_at_brt ?? null,
    flows: Object.fromEntries(
      [...REGION_LIST, ...SECTOR_LIST]
        .filter((c) => s.assets[c]?.ok)
        .map((c) => [c, s.assets[c].flow]),
    ),
  };
}

/** Compara dois snapshots compactos. Sem anterior → []. */
export function diffSnapshots(prev, curr) {
  if (!prev?.flows) return [];
  const out = [];
  for (const [code, flow] of Object.entries(curr.flows)) {
    const pf = prev.flows?.[code];
    if (pf && pf !== flow) {
      out.push({ type: "Fluxo mudou", text: `${ASSETS[code].name} (${code}): ${pf} → ${flow}.` });
    }
  }
  return out;
}

// ───────────────────────── atualização manual (2.2 C) ─────────────────────────

/**
 * Aplica linhas "TICKER;preço" (também "TICKER preço" ou CSV "TICKER,preço") sobre o prices.json em memória.
 * Sobrescreve a última posição de cada ticker e marca last_real = última data.
 * Retorna { prices, applied, ignored }.
 */
export function applyManualPrices(prices, text) {
  const out = structuredClone(prices);
  const last = out.dates[out.dates.length - 1];
  const applied = [];
  const ignored = [];
  for (const line of text.split(/\r?\n/)) {
    const t = line.trim();
    if (!t) continue;
    // "TICKER;preço" ou "TICKER preço" (vírgula decimal ok); CSV "TICKER,preço" usa ponto decimal.
    const [tk, val] = /[;\s]/.test(t) ? t.split(/[;\s]+/) : t.split(",");
    const price = Number(String(val ?? "").replace(",", "."));
    const code = tk?.toUpperCase();
    if (!out.series[code] || !isNum(price) || price <= 0) {
      ignored.push(t);
      continue;
    }
    out.series[code][out.series[code].length - 1] = price;
    out.last_real = { ...out.last_real, [code]: last };
    applied.push(code);
  }
  return { prices: out, applied, ignored };
}
