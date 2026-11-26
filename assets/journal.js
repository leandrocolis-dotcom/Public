// 📒 Diário de operações reais: contas puras (sem rede, sem DOM).
// Pergunta que responde (docs/OBJETIVO.md, docs/ROADMAP-DINHEIRO.md D1): as SUAS decisões ganham do SPY?
// Cada operação guarda ativo, data, preço, quantidade, stop, motivo (qual tela/gatilho) e, ao sair, data e preço.
// O placar compara com o contrafactual "mesmo dinheiro, mesmas datas, no SPY". Material educacional.
import { intTxt } from "./format.js";

/** Motivos de entrada: de que parte do app (ou de fora dele) veio a decisão. A chave é gravada; o rótulo é da tela. */
export const REASONS = [
  ["signals", "Sinais de hoje"],
  ["entry", "Quando entrar"],
  ["flow", "Fluxo / rotação"],
  ["screener", "Screener"],
  ["analysis", "Análise / nota"],
  ["quant", "Quant / campeões"],
  ["value", "Valor (caro/barato)"],
  ["macro", "Macro / notícia"],
  ["rebal", "Rebalanceamento"],
  ["gut", "Intuição"],
  ["other", "Outro"],
];
export const reasonLabel = (k) => REASONS.find((r) => r[0] === k)?.[1] ?? "Outro";

/** Abaixo disso o placar avisa que a amostra é pequena (operações fechadas). */
export const MIN_SAMPLE = 20;

const isDay = (s) => typeof s === "string" && /^\d{4}-\d{2}-\d{2}$/.test(s);
const pos = (x) => Number.isFinite(x) && x > 0;
const numOr = (x, d = null) => {
  const n = typeof x === "string" ? Number(x.replace(",", ".")) : Number(x);
  return x === "" || x === null || x === undefined || !Number.isFinite(n) ? d : n;
};

/** Id estável: ativo + data + hora da criação (duas compras do mesmo ativo no mesmo dia são operações diferentes). */
export const entryId = (sym, day, at) => `${sym}|${day}|${at}`;

/**
 * Normaliza e valida uma operação nova (ou editada). Devolve { ok, entry, errors }. Puro.
 * Só compra (long): o app é para ETFs/ações dos EUA; para apostar contra, registre o ETF inverso comprado.
 */
export function makeEntry(f, { at = new Date().toISOString() } = {}) {
  const errors = [];
  const sym = String(f?.sym ?? "").trim().toUpperCase().replace(/\./g, "-"); // prettier-ignore
  if (!/^[A-Z^][A-Z0-9^=-]{0,11}$/.test(sym)) errors.push("ticker inválido");
  const openDate = String(f?.openDate ?? "");
  if (!isDay(openDate)) errors.push("data de entrada inválida");
  const openPrice = numOr(f?.openPrice);
  if (!pos(openPrice)) errors.push("preço de entrada deve ser maior que zero");
  const qty = numOr(f?.qty);
  if (!pos(qty)) errors.push("quantidade deve ser maior que zero");
  let stop = numOr(f?.stop);
  if (stop !== null && !(stop > 0 && stop < openPrice))
    errors.push("stop deve ficar abaixo do preço de entrada");
  const fees = numOr(f?.fees, 0);
  if (!(fees >= 0)) errors.push("custos não podem ser negativos");
  const reason = REASONS.some((r) => r[0] === f?.reason) ? f.reason : "other";
  const closeDate = f?.closeDate ? String(f.closeDate) : null;
  const closePrice = numOr(f?.closePrice);
  if (closeDate || closePrice !== null) {
    if (!isDay(closeDate)) errors.push("data de saída inválida");
    if (!pos(closePrice)) errors.push("preço de saída deve ser maior que zero");
    if (isDay(closeDate) && isDay(openDate) && closeDate < openDate)
      errors.push("saída antes da entrada");
  }
  if (errors.length) return { ok: false, errors, entry: null };
  const entry = {
    id: f.id ?? entryId(sym, openDate, at),
    sym,
    openDate,
    openPrice,
    qty,
    stop: stop ?? null,
    fees,
    reason,
    note: String(f?.note ?? "").slice(0, 280),
    closeDate: closeDate || null,
    closePrice: closeDate ? closePrice : null,
    at: f.at ?? at,
  };
  return { ok: true, errors: [], entry };
}

/** Fecha uma operação (saída). Puro: devolve a operação nova ou { error }. */
export function closeEntry(e, { closeDate, closePrice, extraFees = 0 }) {
  const r = makeEntry({
    ...e,
    closeDate,
    closePrice,
    fees: (e.fees ?? 0) + (numOr(extraFees, 0) || 0),
  });
  return r.ok ? r.entry : { error: r.errors.join("; ") };
}

/**
 * Tamanho da posição pelo risco: quanto comprar para que bater no stop custe `riskPct` do patrimônio.
 * Limita a posição a `maxPct` do patrimônio (padrão 20%). stop ausente: usa entrada − atrMult × ATR, se houver ATR.
 * Devolve { qty, value, pctEquity, riskUsd, riskPerShare, stop, capped } ou { error }. Puro.
 */
export function sizePosition({
  equity,
  riskPct = 1,
  entry,
  stop = null,
  atr = null,
  atrMult = 2.5,
  maxPct = 20,
}) {
  if (!pos(equity)) return { error: "informe o patrimônio" };
  if (!pos(entry)) return { error: "informe o preço de entrada" };
  const st = pos(stop) ? stop : pos(atr) ? entry - atrMult * atr : null;
  if (!pos(st) || st >= entry) return { error: "informe um stop abaixo da entrada" };
  const riskPerShare = entry - st;
  const budget = (equity * riskPct) / 100;
  let qty = Math.floor(budget / riskPerShare);
  const maxQty = Math.floor((equity * maxPct) / 100 / entry);
  const capped = qty > maxQty;
  if (capped) qty = maxQty;
  return {
    qty,
    value: qty * entry,
    pctEquity: (qty * entry) / equity,
    riskUsd: qty * riskPerShare,
    riskPerShare,
    stopPct: st / entry - 1,
    stop: st,
    capped,
  };
}

/** ATR aproximado só com fechamentos: média do |variação diária| dos últimos n pregões (em US$). Puro. */
export function closeAtr(close, n = 14) {
  const c = (close ?? []).filter((x) => x > 0);
  if (c.length < n + 1) return null;
  let s = 0;
  for (let i = c.length - n; i < c.length; i++) s += Math.abs(c[i] - c[i - 1]);
  return s / n;
}

/** Fechamento do dia `day` ou do último pregão antes dele. series = { dates, close }. Puro. */
export function priceOn(series, day) {
  const d = series?.dates;
  if (!d?.length || !isDay(day)) return null;
  let lo = 0;
  let hi = d.length - 1;
  if (day < d[0]) return null;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (d[mid] <= day) lo = mid;
    else hi = mid - 1;
  }
  const v = series.close[lo];
  return v > 0 ? v : null;
}

const daysBetween = (a, b) => Math.round((Date.parse(b) - Date.parse(a)) / 86_400_000);

/**
 * Resultado de uma operação e o contrafactual no SPY (mesmo dinheiro, mesmas datas).
 * ctx: { last (preço atual do ativo), spy: { series, last }, today }. Puro.
 * SPY de entrada/saída = fechamento do dia (aproximação: a sua entrada pode ter sido no meio do pregão).
 */
export function evalEntry(e, { last = null, spy = null, today = null } = {}) {
  const open = !e.closeDate;
  const exitPx = open ? last : e.closePrice;
  const invested = e.qty * e.openPrice;
  const base = {
    open,
    invested,
    exitPx,
    days: daysBetween(e.openDate, (open ? today : e.closeDate) ?? e.openDate),
  };
  if (!pos(exitPx))
    return { ...base, pnl: null, ret: null, r: null, spyRet: null, spyPnl: null, alpha: null };
  const pnl = e.qty * (exitPx - e.openPrice) - (e.fees ?? 0);
  const ret = pnl / invested;
  const r = pos(e.stop) ? pnl / (e.qty * (e.openPrice - e.stop)) : null;
  const s0 = priceOn(spy?.series, e.openDate);
  const s1 = open
    ? (spy?.last ?? spy?.series?.close?.at(-1) ?? null)
    : priceOn(spy?.series, e.closeDate);
  const spyRet = pos(s0) && pos(s1) ? s1 / s0 - 1 : null;
  const spyPnl = spyRet === null ? null : invested * spyRet;
  return { ...base, pnl, ret, r, spyRet, spyPnl, alpha: spyPnl === null ? null : pnl - spyPnl };
}

const sum = (l) => l.reduce((a, b) => a + b, 0);
const avg = (l) => (l.length ? sum(l) / l.length : null);

function block(rows) {
  const v = rows.filter((x) => x.ev.pnl !== null);
  const withSpy = v.filter((x) => x.ev.spyPnl !== null);
  const wins = v.filter((x) => x.ev.pnl > 0);
  const losses = v.filter((x) => x.ev.pnl <= 0);
  const rs = v.map((x) => x.ev.r).filter((x) => x !== null);
  const avgWin = avg(wins.map((x) => x.ev.ret));
  const avgLoss = avg(losses.map((x) => x.ev.ret));
  const invested = sum(v.map((x) => x.ev.invested));
  return {
    n: v.length,
    pnl: sum(v.map((x) => x.ev.pnl)),
    invested,
    ret: invested > 0 ? sum(v.map((x) => x.ev.pnl)) / invested : null,
    spyPnl: withSpy.length ? sum(withSpy.map((x) => x.ev.spyPnl)) : null,
    alpha: withSpy.length ? sum(withSpy.map((x) => x.ev.alpha)) : null,
    beatSpy: withSpy.filter((x) => x.ev.alpha > 0).length,
    nSpy: withSpy.length,
    winRate: v.length ? wins.length / v.length : null,
    avgWin,
    avgLoss,
    payoff: avgWin !== null && avgLoss ? Math.abs(avgWin / avgLoss) : null,
    expR: rs.length ? avg(rs) : null,
    nR: rs.length,
  };
}

/**
 * Placar: total (fechadas + abertas marcadas a mercado), só fechadas, por motivo e por mês de saída.
 * rows = [{ e, ev }]. Puro.
 */
export function scoreboard(rows) {
  const closed = rows.filter((x) => !x.ev.open);
  const openRows = rows.filter((x) => x.ev.open);
  const byReason = REASONS.map(([k, label]) => ({
    k,
    label,
    ...block(closed.filter((x) => x.e.reason === k)),
  }))
    .filter((g) => g.n)
    .sort((a, b) => (b.alpha ?? -Infinity) - (a.alpha ?? -Infinity));
  const months = [...new Set(closed.map((x) => x.e.closeDate.slice(0, 7)))].sort().reverse();
  const byMonth = months.map((m) => ({
    m,
    ...block(closed.filter((x) => x.e.closeDate.startsWith(m))),
  }));
  const all = block(rows);
  const cl = block(closed);
  const op = block(openRows);
  return {
    all,
    closed: cl,
    open: op,
    nOpen: openRows.length,
    byReason,
    byMonth,
    small: cl.n < MIN_SAMPLE,
  };
}

/** Leitura em uma frase do placar (honesta com a amostra). Puro. */
export function verdictText(sb) {
  const c = sb.closed;
  if (!c.n) return "Nenhuma operação fechada ainda: o placar começa a valer na primeira saída.";
  const a = c.alpha;
  const head =
    a === null
      ? "Sem SPY para comparar no período."
      : a >= 0
        ? `Suas decisões fechadas renderam US$ ${intTxt(a)} a mais do que o mesmo dinheiro no SPY nas mesmas datas.`
        : `Suas decisões fechadas renderam US$ ${intTxt(-a)} a menos do que o mesmo dinheiro no SPY nas mesmas datas.`;
  const tail = sb.small
    ? ` Amostra pequena (${c.n} de ${MIN_SAMPLE} operações): ainda não dá para separar habilidade de sorte.`
    : a !== null && a < 0
      ? " Com essa amostra, segurar o índice teria sido melhor: reveja os motivos que mais perdem."
      : "";
  return head + tail;
}
