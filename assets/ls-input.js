// Long & Short: monta a entrada do motor a partir dos dados do app (puro, sem rede): posições da Carteira,
// cotações (com bid/ask), barras de 5 min com pré/pós, diário de data/hist, livro do L&S, plano do dia,
// parâmetros e cadastro do usuário. A tela (ls-view.js) só junta os dados e chama buildInput → computeLs.
import { assetInfo } from "./ls-etfs.js";
import { checkPlan } from "./ls-data.js";
import { resolveParams, hhmm } from "./ls-params.js";
import { calendarStatus, lsSession, markMin, refPrice, tradingDay } from "./ls-clock.js";
import { atr, betaCorr, underlyingView } from "./ls-market.js";
import { dayForEngine, liveOrders, positionFrom } from "./ls-book.js";
import { nyClock } from "./sessions.js";

const fin = (x) => typeof x === "number" && Number.isFinite(x);

/** data/hist/<ATIVO>.csv ("date,o,h,l,c,v") → [{ date, o, h, l, c, v }] (linhas inválidas fora). */
export function parseHistCsv(text) {
  const out = [];
  for (const line of String(text ?? "")
    .split(/\r?\n/)
    .slice(1)) {
    const [date, o, h, l, c, v] = line.split(",");
    const r = { date, o: +o, h: +h, l: +l, c: +c, v: +v };
    if (/^\d{4}-\d{2}-\d{2}$/.test(date) && [r.o, r.h, r.l, r.c].every((x) => x > 0)) out.push(r);
  }
  return out;
}

/** Preço vigente da cotação: estendido (xp) se mais novo que o regular; { P, ts (ms) }. */
export function livePrice(q) {
  if (!q || !(q.p > 0)) return { P: null, ts: null };
  const ext = q.xk && q.xp > 0 && q.xt > (q.regT ?? q.t ?? 0);
  return ext ? { P: q.xp, ts: q.xt * 1000 } : { P: q.p, ts: fin(q.t) ? q.t * 1000 : null };
}

/** Percentil (0–100) do ATR(14) diário de hoje entre os ATRs do último ano (filtro de overnight). */
export function atrPercentile(rows, n = 14, look = 252) {
  if (!rows || rows.length < n + 30) return null;
  const vals = [];
  for (let i = Math.max(n + 1, rows.length - look); i <= rows.length; i++) vals.push(atr(rows.slice(0, i), n)); // prettier-ignore
  const cur = vals.at(-1);
  return (vals.filter((v) => v <= cur).length / vals.length) * 100;
}

/** Pares do L&S = duplas da Carteira (prefs.pairs: [ponta comprada, ponta vendida]). */
export const pairId = ([a, b]) => `${a}-${b}`;

/** Ativos que a tela precisa (ETFs, subjacentes, SPY e VIX) para pedir cotação/barras/diário. */
export function neededSyms(pairs, assetsUser = {}) {
  const etfs = [...new Set(pairs.flat())];
  const unders = etfs.map((s) => assetInfo(s, assetsUser)).filter((a) => a.ok).map((a) => a.under); // prettier-ignore
  return {
    etfs,
    unders: [...new Set(unders)],
    all: [...new Set([...etfs, ...unders, "SPY", "^VIX"])],
  };
}

/**
 * Entrada de computeLs. src = { now, rows, pairs, quotes, bars, daily, book, plan, paramsUser, assetsUser,
 * account, photoMs, events, recIssues }. Devolve { input, meta } (meta: avisos de dado faltando, capital usado).
 */
export function buildInput(src) {
  const { now, rows = [], pairs = [], quotes = {}, bars = {}, daily = {}, book, plan = null } = src;
  const { params, errors: paramErrors } = resolveParams(src.paramsUser ?? {});
  const today = tradingDay(now);
  const held = Object.fromEntries(rows.map((r) => [r.sym, r]));
  const planCheck = checkPlan(plan, today);
  const capital = planCheck.ok ? plan.capital : src.account > 0 ? src.account : null;
  const missing = [];
  const hist = (s) => (daily[s] ?? []).filter((r) => r.date < today);
  const betas = {};
  const corrOf = (u1, u2) => (u1 === u2 ? 1 : betaCorr(hist(u1), hist(u2), params.janela_beta_corr_pregoes).corr); // prettier-ignore
  const leg = (sym) => {
    const asset = assetInfo(sym, src.assetsUser ?? {});
    const q = quotes[sym];
    const r = held[sym];
    const lp = livePrice(q);
    // preço e horário da MESMA fonte (cotação com bid/ask); a Carteira só como reserva, com o horário dela
    const P = lp.P ?? (r?.live && r.price > 0 ? r.price : null);
    const pTs = lp.P ? lp.ts : fin(r?.quoteTime) ? r.quoteTime * 1000 : null;
    const ts = fin(q?.baT) && fin(pTs) ? Math.min(pTs, q.baT) : pTs; // bid/ask velho conta como cotação velha
    const link = book.links?.[sym] ?? {};
    const pos = positionFrom(r, book, sym, src.photoMs);
    const qty = pos.qty;
    if (pos.short) missing.push(`${sym}: execuções somam mais vendas do que a posição`);
    const u = asset.ok ? asset.under : null;
    const uq = u ? quotes[u] : null;
    const S = livePrice(uq).P;
    if (!q) missing.push(`${sym}: sem cotação`);
    if (u && !bars[u]) missing.push(`${u}: sem barras de 5 min`);
    if (u && !(daily[u]?.length > 20)) missing.push(`${u}: sem histórico diário`);
    if (u && !(u in betas)) betas[u] = betaCorr(hist(u), hist("SPY"), params.janela_beta_corr_pregoes).beta; // prettier-ignore
    const openedToday = fin(link.entryTs) && tradingDay(link.entryTs) === today;
    return {
      sym,
      dir: 1, // a Carteira só tem posição comprada (ETF inverso = tipo bear); ver MAPEAMENTO.md
      qty,
      avg: pos.avg,
      stop: fin(link.stop) ? link.stop : null,
      hwm: fin(link.hwm) && link.hwmAvg === pos.avg ? link.hwm : pos.avg,
      partialDone: !!link.partialDone,
      entryUnder: link.entryUnder ?? null,
      entryPrice: link.entryPrice ?? pos.avg,
      sessions: link.sessions ?? 0,
      lastLot: link.lastLot ?? (qty || null),
      pRef: openedToday ? link.entryPrice : refPrice(bars[sym], now, q),
      asset,
      quote: { P, bid: q?.b ?? null, ask: q?.a ?? null, ts },
      under: u ? underlyingView({ bars: bars[u] ?? null, daily: hist(u), S, ms: now, params }) : {},
      retDay: { etf: P > 0 && q?.pc > 0 ? P / q.pc - 1 : null, under: S > 0 && uq?.pc > 0 ? S / uq.pc - 1 : null }, // prettier-ignore
      borrow: null,
      recall: false,
    };
  };
  const ps = pairs.map(([a, b]) => {
    const L = leg(a);
    const S = leg(b);
    const uL = L.asset.ok ? L.asset.under : null;
    const uS = S.asset.ok ? S.asset.under : null;
    return { id: pairId([a, b]), name: `${a} × ${b}`, long: L, short: S, corr: uL && uS ? corrOf(uL, uS) : null, betas }; // prettier-ignore
  });
  const eodCtx = {};
  for (const p of ps) for (const l of [p.long, p.short]) if (l.asset.ok) eodCtx[l.sym] = { atrPct: atrPercentile(hist(l.asset.under)), maxValueToday: book.day?.maxValue?.[l.sym] ?? null }; // prettier-ignore
  const marks = {
    eod: markMin(now, "eod", params) ?? hhmm(params.overnight_checagem_horario),
    posteod: markMin(now, "posteod", params) ?? hhmm(params.overnight_checagem_pos_horario),
    close: markMin(now, "close", params) ?? 960,
  };
  const input = {
    now,
    session: lsSession(now),
    minET: nyClock(now).min,
    cutMin: markMin(now, "cut", params) ?? hhmm(params.pyramiding_corte_horario),
    marks,
    date: today,
    capital,
    params,
    plan: { ok: planCheck.ok, pairs: plan?.pairs ?? {} },
    calendar: calendarStatus(today, plan?.calOk ?? null),
    day: dayForEngine(book, now),
    pairs: ps,
    events: src.events ?? [],
    liveOrders: liveOrders(book),
    extraBlockers: (src.recIssues ?? []).map((i) => ({ id: "REC", why: i.msg })),
    vix: livePrice(quotes["^VIX"]).P,
    eodCtx,
  };
  return { input, meta: { missing, paramErrors, planErrors: planCheck.errors, capitalFrom: planCheck.ok ? "plano" : "conta" } }; // prettier-ignore
}
