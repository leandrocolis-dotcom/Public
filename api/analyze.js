// Vercel Function: dados para a aba "Análise" (análise integrada) de até 15 tickers quaisquer.
// GET /api/analyze?symbols=AAPL,VOO -> { fetched_at, items: { SÍMBOLO: { bars, fund, fundError? } }, missing, errors }
// bars: 2 anos diários { dates, o, h, l, c, v } (mesmo formato de data/ohlc.json). fund: fundamentos do Yahoo (quoteSummary).
// Não é proxy aberto: só os dois endpoints do Yahoo abaixo, símbolos validados, no máximo 15. Cache de 1 h na borda.
import { SYMBOL_RE, getSession } from "./quotes.js";
import { deadlineIn, httpFetch, memo, memoForget, timeLeft } from "./_http.js";
import { etfClass, leverageOf } from "../assets/etf-fund.js";
import { isEveningFutBar, isFutMeta } from "../assets/futures.js";
import { daysBetween, mergeBars, readHist, trimBars } from "./_hist.js";

const MAX = 15;
const MODULES =
  "price,summaryDetail,defaultKeyStatistics,financialData,quoteType,assetProfile,fundProfile,topHoldings";

export function parseSymbols(raw) {
  return [
    ...new Set(
      String(raw ?? "")
        .toUpperCase()
        .split(/[,;\s]+/)
        .map((x) => x.trim())
        .filter((x) => SYMBOL_RE.test(x)),
    ),
  ].slice(0, MAX);
}

/** v8/chart -> barras diárias sem buracos, datas no fuso da bolsa. */
export function parseDaily(json) {
  const r = json?.chart?.result?.[0];
  const q = r?.indicators?.quote?.[0];
  if (!r?.timestamp || !q) return null;
  const tz = r.meta?.exchangeTimezoneName ?? "America/New_York";
  const fmt = new Intl.DateTimeFormat("en-CA", { timeZone: tz });
  const b = { dates: [], o: [], h: [], l: [], c: [], v: [] };
  const fut = isFutMeta(r.meta);
  r.timestamp.forEach((t, i) => {
    if (i === r.timestamp.length - 1 && isEveningFutBar(t, tz, fut)) return; // sessão da noite = pregão de amanhã (ver assets/futures.js)
    const row = [q.open?.[i], q.high?.[i], q.low?.[i], q.close?.[i]];
    if (!row.every((x) => typeof x === "number" && Number.isFinite(x) && x > 0)) return;
    b.dates.push(fmt.format(new Date(t * 1000)));
    b.o.push(row[0]);
    b.h.push(row[1]);
    b.l.push(row[2]);
    b.c.push(row[3]);
    b.v.push(q.volume?.[i] ?? 0);
  });
  return b.c.length ? { ...b, currency: r.meta?.currency ?? null } : null;
}

const raw = (x) =>
  x && typeof x === "object" ? (x.raw ?? null) : typeof x === "number" ? x : null;

/** quoteSummary -> só os campos usados pela análise (números crus; null quando o Yahoo não informa). */
export function parseSummary(json) {
  const r = json?.quoteSummary?.result?.[0];
  if (!r) return null;
  const p = r.price ?? {};
  const sd = r.summaryDetail ?? {};
  const ks = r.defaultKeyStatistics ?? {};
  const fd = r.financialData ?? {};
  const qt = r.quoteType ?? {};
  const ap = r.assetProfile ?? {};
  const fp = r.fundProfile ?? {};
  const th = r.topHoldings ?? {};
  const eh = th.equityHoldings ?? {};
  const bh = th.bondHoldings ?? {};
  return {
    type: qt.quoteType ?? p.quoteType ?? null,
    name: p.longName ?? p.shortName ?? qt.longName ?? null,
    sector: ap.sector ?? null,
    industry: ap.industry ?? null,
    category: ks.category ?? null,
    currency: p.currency ?? null,
    price: raw(p.regularMarketPrice) ?? raw(fd.currentPrice),
    marketCap: raw(p.marketCap) ?? raw(sd.marketCap),
    pe: raw(sd.trailingPE),
    fpe: raw(sd.forwardPE) ?? raw(ks.forwardPE),
    peg: raw(ks.pegRatio),
    pb: raw(ks.priceToBook),
    evEbitda: raw(ks.enterpriseToEbitda),
    dy: raw(sd.dividendYield) ?? raw(sd.yield),
    beta: raw(sd.beta) ?? raw(ks.beta3Year) ?? raw(ks.beta),
    roe: raw(fd.returnOnEquity),
    margin: raw(fd.profitMargins) ?? raw(ks.profitMargins),
    opMargin: raw(fd.operatingMargins),
    revGrowth: raw(fd.revenueGrowth),
    epsGrowth: raw(fd.earningsGrowth),
    debtEq: raw(fd.debtToEquity),
    fcf: raw(fd.freeCashflow),
    target: raw(fd.targetMeanPrice),
    recMean: raw(fd.recommendationMean),
    analysts: raw(fd.numberOfAnalystOpinions),
    expense:
      raw(fp.feesExpensesInvestment?.annualReportExpenseRatio) ??
      raw(ks.annualReportExpenseRatio) ??
      raw(sd.expenseRatio) ??
      raw(ks.netExpenseRatio),
    // ETFs: carteira do fundo (look-through) e renda fixa
    eqPe: raw(eh.priceToEarnings),
    eqPcf: raw(eh.priceToCashflow),
    eqG3: raw(eh.threeYearEarningsGrowth),
    holdings: (th.holdings ?? [])
      .slice(0, 10)
      .map((h) => ({ sym: h.symbol, w: raw(h.holdingPercent) }))
      .filter((h) => h.sym && h.w > 0),
    stockPos: raw(th.stockPosition),
    bondPos: raw(th.bondPosition),
    duration: raw(bh.duration),
  };
}

/** Barras diárias do Yahoo num intervalo (2y = base inteira; 5d/1mo = só o trecho novo). */
export async function yahooBars(sym, range = "2y", deadline = null) {
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(sym)}?range=${range}&interval=1d`;
  return httpFetch(url, { deadline }, async (r) => {
    if (!r.ok) throw new Error(`gráfico HTTP ${r.status}`);
    const b = parseDaily(await r.json());
    if (!b) throw new Error("histórico vazio");
    return b;
  });
}

/**
 * Base do repositório (data/hist) + só os dias que faltam do Yahoo. Sem base, base velha (> 25 dias) ou
 * desdobramento detectado: baixa os 2 anos como antes. Se o Yahoo falhar, a base sozinha serve (dado de ontem).
 */
async function bars(sym, deadline = null, today = new Date().toISOString().slice(0, 10)) {
  const base = readHist(sym);
  const gap = base ? daysBetween(base.dates.at(-1), today) : Infinity;
  let b = null;
  if (gap <= 25) {
    try {
      b = mergeBars(base, await yahooBars(sym, gap <= 4 ? "5d" : "1mo", deadline));
    } catch {
      b = base; // Yahoo fora: segue com a base (fechamento do último pregão gravado)
    }
  }
  if (!b) b = await yahooBars(sym, "2y", deadline);
  b = trimBars(b);
  if (b.c.length < 60) throw new Error("histórico curto ou vazio");
  return b;
}

async function summary(sym, s, deadline = null) {
  const url = `https://query2.finance.yahoo.com/v10/finance/quoteSummary/${encodeURIComponent(sym)}?modules=${MODULES}&crumb=${encodeURIComponent(s.crumb)}`;
  return httpFetch(url, { headers: { Cookie: s.cookie }, deadline }, async (r) => {
    if (r.status === 401 || r.status === 403)
      throw Object.assign(new Error("crumb inválido"), { auth: true });
    if (!r.ok) throw new Error(`fundamentos HTTP ${r.status}`);
    const f = parseSummary(await r.json());
    if (!f) throw new Error("fundamentos vazios");
    return f;
  });
}

/** Último valor de um índice de juros do Yahoo (^IRX, ^TNX, ^TYX vêm em % ao ano). */
async function lastYahoo(sym, deadline) {
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(sym)}?range=5d&interval=1d`;
  return httpFetch(url, { deadline }, async (r) => {
    if (!r.ok) throw new Error(`${sym} HTTP ${r.status}`);
    const c = (await r.json())?.chart?.result?.[0]?.indicators?.quote?.[0]?.close ?? [];
    const v = c.filter((x) => Number.isFinite(x)).at(-1);
    if (!Number.isFinite(v)) throw new Error(`${sym} vazio`);
    return v;
  });
}

/** FRED, CSV sem chave: último valor numérico (linhas "DATE,VALOR"; "." = sem dado). */
export function parseFredLast(csv) {
  const vals = String(csv ?? "")
    .trim()
    .split(/\r?\n/)
    .slice(1)
    .map((l) => Number(l.split(",")[1]))
    .filter(Number.isFinite);
  return vals.length ? vals.at(-1) : null;
}

async function fredLast(id, deadline) {
  const since = new Date(Date.now() - 40 * 864e5).toISOString().slice(0, 10);
  const url = `https://fred.stlouisfed.org/graph/fredgraph.csv?id=${id}&cosd=${since}`;
  return httpFetch(url, { deadline }, async (r) => {
    if (!r.ok) throw new Error(`FRED ${id} HTTP ${r.status}`);
    const v = parseFredLast(await r.text());
    if (v === null) throw new Error(`FRED ${id} vazio`);
    return v;
  });
}

/** Juros para renda fixa e ouro: T-bill 3 meses, 10 e 30 anos (Yahoo) e juro real de 10 anos (FRED DFII10). */
async function macro(deadline) {
  const [cash, y10, y30, real10] = await Promise.allSettled([
    lastYahoo("^IRX", deadline),
    lastYahoo("^TNX", deadline),
    lastYahoo("^TYX", deadline),
    fredLast("DFII10", deadline),
  ]);
  const v = (x) => (x.status === "fulfilled" ? x.value : null);
  return { cash: v(cash), y10: v(y10), y30: v(y30), real10: v(real10) };
}

/** Quem precisa de juros (renda fixa, ouro) e de qual ativo de referência (alavancados). */
export function etfNeeds(items) {
  const under = new Set();
  let needMacro = false;
  for (const [sym, it] of Object.entries(items)) {
    const f = it.fund;
    // alavancado conhecido: o ativo de referência vale mesmo se o resumo do próprio ETF falhou
    const lv = leverageOf(sym, f?.name);
    if (lv) under.add(lv.under);
    else if (f && /bond|gold/.test(etfClass(f, sym) ?? "")) needMacro = true;
  }
  return { under: [...under], needMacro };
}

export async function analyzeAll(symbols, deadline = null) {
  const errors = [];
  let s = null;
  try {
    s = await getSession(false, deadline);
  } catch (e) {
    errors.push(`sessão Yahoo: ${e.message}`);
  }
  const one = (sym) =>
    memo(`an:${sym}`, 10 * 60_000, () => oneRaw(sym)).then((v) => {
      // fundamentos que falharam (crumb vencido) não ficam presos na memória: a próxima chamada tenta de novo
      if (v.fundError) memoForget(`an:${sym}`);
      return v;
    });
  const oneRaw = async (sym) => {
    const [b, f] = await Promise.allSettled([
      bars(sym, deadline),
      s ? summary(sym, s, deadline) : Promise.reject(new Error("sem sessão")),
    ]);
    if (b.status === "rejected") throw b.reason;
    return {
      bars: b.value,
      fund: f.status === "fulfilled" ? f.value : null,
      fundError: f.status === "rejected" ? String(f.reason?.message ?? f.reason) : undefined,
    };
  };
  let res = await Promise.allSettled(symbols.map(one));
  if (
    s &&
    timeLeft(deadline) > 8000 &&
    res.some((r) => r.status === "fulfilled" && /crumb/.test(r.value.fundError ?? ""))
  ) {
    try {
      s = await getSession(true, deadline);
      res = await Promise.allSettled(symbols.map(one));
    } catch (e) {
      errors.push(`sessão Yahoo (renovação): ${e.message}`);
    }
  }
  const items = {};
  res.forEach((r, i) => {
    if (r.status === "fulfilled") items[symbols[i]] = r.value;
    else errors.push(`${symbols[i]}: ${r.reason?.message ?? r.reason}`);
  });
  if (s && timeLeft(deadline) > 4000) await enrichEtfs(items, s, deadline, errors);
  return {
    fetched_at: new Date().toISOString(),
    items,
    missing: symbols.filter((x) => !items[x]),
    errors,
  };
}

/** ETFs: anexa o ativo de referência dos alavancados (item.under) e os juros (item.macro) a quem precisa. */
async function enrichEtfs(items, s, deadline, errors) {
  const { under, needMacro } = etfNeeds(items);
  const fetchU = under.filter((u) => !items[u]?.fund).slice(0, 10);
  const [uRes, mRes] = await Promise.all([
    Promise.allSettled(fetchU.map((u) => summary(u, s, deadline))),
    needMacro || under.length ? macro(deadline).catch(() => null) : null,
  ]);
  const uf = Object.fromEntries(under.map((u) => [u, items[u]?.fund ?? null]));
  uRes.forEach((r, i) => {
    if (r.status === "fulfilled") uf[fetchU[i]] = r.value;
    else errors.push(`fundamentos de ${fetchU[i]} (referência): ${r.reason?.message ?? r.reason}`);
  });
  // o ativo de referência pode ser ETF de renda fixa/ouro (TMV -> TLT): também precisa de juros
  for (const [sym, it] of Object.entries(items)) {
    const f = it.fund;
    const lv = leverageOf(sym, f?.name);
    if (lv && uf[lv.under]) it.under = { sym: lv.under, fund: uf[lv.under] };
    if (mRes && (lv || (f && etfClass(f, sym)))) it.macro = mRes;
  }
  await enrichBaskets(items, s, deadline, errors);
}

const BASKET_TOP = 8;
const BASKET_MAX = 16;

/**
 * Cestas de ações (ETF temático ou o ativo de referência de um alavancado, ex.: UCYB -> CIBR): busca os fundamentos
 * das maiores posições para a média ponderada (item.basket / item.under.basket = [{ sym, w, fund }]).
 */
async function enrichBaskets(items, s, deadline, errors) {
  if (timeLeft(deadline) < 4000) return;
  const owners = []; // { holder: objeto que recebe .basket, fund }
  for (const [sym, it] of Object.entries(items)) {
    if (it.under?.fund && etfClass(it.under.fund, it.under.sym) === "equity")
      owners.push({ holder: it.under, fund: it.under.fund });
    else if (!it.under && it.fund && etfClass(it.fund, sym) === "equity")
      owners.push({ holder: it, fund: it.fund });
  }
  const want = [];
  for (const o of owners)
    for (const h of (o.fund.holdings ?? []).slice(0, BASKET_TOP))
      if (SYMBOL_RE.test(h.sym) && !want.includes(h.sym)) want.push(h.sym);
  const syms = want.slice(0, BASKET_MAX);
  const got = {};
  const res = await Promise.allSettled(syms.map((h) => items[h]?.fund ?? summary(h, s, deadline)));
  res.forEach((r, i) => {
    if (r.status === "fulfilled") got[syms[i]] = r.value;
    else errors.push(`cesta, ${syms[i]}: ${r.reason?.message ?? r.reason}`);
  });
  for (const o of owners) {
    const b = (o.fund.holdings ?? [])
      .slice(0, BASKET_TOP)
      .filter((h) => got[h.sym])
      .map((h) => ({ sym: h.sym, w: h.w, fund: got[h.sym] }));
    if (b.length) o.holder.basket = b;
  }
}

/**
 * Bloco completo fica 1 h na borda; bloco parcial (ativo faltando ou fundamentos que falharam) só 2 min, para um
 * soluço do Yahoo não esconder o ativo de todo mundo por uma hora. Sem nada: não guarda.
 */
export function cacheFor(out) {
  if (!Object.keys(out.items ?? {}).length) return "no-store";
  const partial =
    out.missing?.length || Object.values(out.items).some((it) => it.fundError || !it.fund);
  return partial
    ? "public, s-maxage=120, stale-while-revalidate=60"
    : "public, s-maxage=3600, stale-while-revalidate=7200";
}

export default async function handler(req, res) {
  const symbols = parseSymbols(new URL(req.url, "http://x").searchParams.get("symbols"));
  if (!symbols.length) {
    res.setHeader("Cache-Control", "no-store");
    return res.status(400).json({ error: "informe ?symbols=AAA,BBB (até 15)" });
  }
  try {
    const out = await analyzeAll(symbols, deadlineIn(24000));
    const ok = Object.keys(out.items).length > 0;
    res.setHeader("Cache-Control", cacheFor(out));
    res.status(ok ? 200 : 502).json(out);
  } catch (e) {
    res.setHeader("Cache-Control", "no-store");
    res.status(502).json({ error: String(e?.message ?? e), fetched_at: new Date().toISOString() });
  }
}
