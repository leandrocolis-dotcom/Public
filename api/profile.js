// Vercel Function: contexto de UM ativo para o detalhe da aba "Análise".
// GET /api/profile?symbol=AAPL -> { symbol, profile, analysts, earnings, financials, fund, news, errors }
// Fontes: Yahoo quoteSummary (perfil, analistas, resultados, ETF), Yahoo fundamentals-timeseries (DRE/caixa) e busca de notícias.
// Chamado sob demanda ao abrir um ativo; cache de 6 h na borda.
import { SYMBOL_RE, getSession } from "./quotes.js";
import { yahooSearch } from "./news.js";
import { deadlineIn, httpFetch, timeLeft } from "./_http.js";
import { translateItems, translateMany } from "../assets/translate.js";

const MODULES =
  "assetProfile,summaryProfile,recommendationTrend,upgradeDowngradeHistory,financialData,earnings,calendarEvents,fundProfile,topHoldings,price,summaryDetail,defaultKeyStatistics,quoteType";
const SERIES = ["TotalRevenue", "NetIncome", "DilutedEPS", "FreeCashFlow", "OperatingIncome"];

const raw = (x) =>
  x && typeof x === "object" ? (x.raw ?? null) : typeof x === "number" ? x : null;
const iso = (sec) => (sec ? new Date(sec * 1000).toISOString().slice(0, 10) : null);

/** quoteSummary -> perfil, analistas, resultados e (ETF) composição. */
export function parseProfile(json) {
  const r = json?.quoteSummary?.result?.[0];
  if (!r) return null;
  const ap = r.assetProfile ?? r.summaryProfile ?? {};
  const fd = r.financialData ?? {};
  const t0 = r.recommendationTrend?.trend?.find((x) => x.period === "0m") ?? null;
  const ce = r.calendarEvents?.earnings ?? {};
  const th = r.topHoldings ?? null;
  const fp = r.fundProfile ?? null;
  const pr = r.price ?? {};
  const sd = r.summaryDetail ?? {};
  const ks = r.defaultKeyStatistics ?? {};
  const qt = r.quoteType ?? {};
  return {
    price: raw(fd.currentPrice) ?? raw(pr.regularMarketPrice),
    quote: {
      name: pr.longName || pr.shortName || qt.longName || null,
      exch: pr.exchangeName || qt.exchange || null,
      currency: pr.currency || sd.currency || null,
      type: pr.quoteType || qt.quoteType || null,
      state: pr.marketState || null,
      t: raw(pr.regularMarketTime),
      p: raw(pr.regularMarketPrice),
      chg: raw(pr.regularMarketChange),
      chgPct: raw(pr.regularMarketChangePercent),
      prev: raw(sd.previousClose) ?? raw(pr.regularMarketPreviousClose),
      open: raw(sd.open) ?? raw(pr.regularMarketOpen),
      dh: raw(sd.dayHigh) ?? raw(pr.regularMarketDayHigh),
      dl: raw(sd.dayLow) ?? raw(pr.regularMarketDayLow),
      h52: raw(sd.fiftyTwoWeekHigh),
      l52: raw(sd.fiftyTwoWeekLow),
      v: raw(sd.volume) ?? raw(pr.regularMarketVolume),
      av: raw(sd.averageVolume10days) ?? raw(pr.averageDailyVolume10Day),
      av3: raw(sd.averageVolume) ?? raw(pr.averageDailyVolume3Month),
      mc: raw(sd.marketCap) ?? raw(pr.marketCap),
      bid: raw(sd.bid),
      ask: raw(sd.ask),
      pe: raw(sd.trailingPE),
      fpe: raw(sd.forwardPE),
      eps: raw(ks.trailingEps),
      dy: raw(sd.dividendYield) ?? raw(sd.yield),
      beta: raw(sd.beta) ?? raw(ks.beta3Year),
      shares: raw(ks.sharesOutstanding),
      pb: raw(ks.priceToBook),
      aum: raw(sd.totalAssets),
      er: raw(ks.annualReportExpenseRatio) ?? raw(sd.expenseRatio),
      ma50: raw(sd.fiftyDayAverage),
      ma200: raw(sd.twoHundredDayAverage),
    },
    profile: {
      summary: ap.longBusinessSummary ?? null,
      sector: ap.sector ?? null,
      industry: ap.industry ?? null,
      country: ap.country ?? null,
      city: ap.city ?? null,
      employees: ap.fullTimeEmployees ?? null,
      website: /^https?:\/\//.test(ap.website ?? "") ? ap.website : null,
      officers: (ap.companyOfficers ?? []).slice(0, 3).map((o) => ({ name: o.name, title: o.title })),
    },
    analysts: {
      trend: t0
        ? { sb: t0.strongBuy ?? 0, b: t0.buy ?? 0, h: t0.hold ?? 0, s: t0.sell ?? 0, ss: t0.strongSell ?? 0 }
        : null,
      recKey: fd.recommendationKey ?? null,
      recMean: raw(fd.recommendationMean),
      n: raw(fd.numberOfAnalystOpinions),
      target: { mean: raw(fd.targetMeanPrice), median: raw(fd.targetMedianPrice), low: raw(fd.targetLowPrice), high: raw(fd.targetHighPrice) },
      changes: (r.upgradeDowngradeHistory?.history ?? []).slice(0, 8).map((h) => ({
        date: iso(h.epochGradeDate),
        firm: h.firm,
        from: h.fromGrade || null,
        to: h.toGrade || null,
        action: h.action,
        pt: h.currentPriceTarget || null,
        ptPrior: h.priorPriceTarget || null,
      })),
    },
    earnings: {
      next: iso(raw(ce.earningsDate?.[0])),
      epsEst: raw(ce.earningsAverage),
      revEst: raw(ce.revenueAverage),
      history: (r.earnings?.earningsChart?.quarterly ?? []).map((q) => ({
        q: q.date,
        actual: raw(q.actual),
        est: raw(q.estimate),
      })),
    },
    fund: th || fp
      ? {
          family: fp?.family ?? null,
          category: fp?.categoryName ?? null,
          holdings: (th?.holdings ?? []).slice(0, 10).map((h) => ({ sym: h.symbol, name: h.holdingName, w: raw(h.holdingPercent) })),
          sectors: (th?.sectorWeightings ?? [])
            .map((o) => Object.entries(o)[0])
            .map(([k, v]) => ({ k, w: raw(v) }))
            .filter((x) => x.w > 0)
            .sort((a, b) => b.w - a.w)
            .slice(0, 8),
          stock: raw(th?.stockPosition),
          bond: raw(th?.bondPosition),
          cash: raw(th?.cashPosition),
        }
      : null,
  }; // prettier-ignore
}

/** fundamentals-timeseries -> { quarterly: [{ date, TotalRevenue, ... }], annual: [...] } (mais antigo primeiro). */
export function parseSeries(json) {
  const out = { quarterly: {}, annual: {} };
  for (const r of json?.timeseries?.result ?? []) {
    const type = r.meta?.type?.[0] ?? "";
    const m = /^(quarterly|annual)(.+)$/.exec(type);
    if (!m) continue;
    for (const v of r[type] ?? []) {
      if (!v?.asOfDate || !Number.isFinite(v.reportedValue?.raw)) continue;
      (out[m[1]][v.asOfDate] ??= { date: v.asOfDate })[m[2]] = v.reportedValue.raw;
    }
  }
  const list = (o) => Object.values(o).sort((a, b) => (a.date < b.date ? -1 : 1));
  return { quarterly: list(out.quarterly).slice(-5), annual: list(out.annual).slice(-4) };
}

async function summary(sym, s, deadline) {
  const url = `https://query2.finance.yahoo.com/v10/finance/quoteSummary/${encodeURIComponent(sym)}?modules=${MODULES}&crumb=${encodeURIComponent(s.crumb)}`;
  return httpFetch(url, { headers: { Cookie: s.cookie }, deadline }, async (r) => {
    if (r.status === 401 || r.status === 403)
      throw Object.assign(new Error("crumb inválido"), { auth: true });
    if (!r.ok) throw new Error(`perfil HTTP ${r.status}`);
    const p = parseProfile(await r.json());
    if (!p) throw new Error("perfil vazio");
    return p;
  });
}

async function series(sym, deadline) {
  const types = SERIES.flatMap((x) => [`quarterly${x}`, `annual${x}`]).join(",");
  const now = Math.floor(Date.now() / 1000);
  const url = `https://query2.finance.yahoo.com/ws/fundamentals-timeseries/v1/finance/timeseries/${encodeURIComponent(sym)}?type=${types}&period1=${now - 6 * 365 * 86400}&period2=${now}`;
  return httpFetch(url, { deadline }, async (r) => {
    if (!r.ok) throw new Error(`financeiros HTTP ${r.status}`);
    return parseSeries(await r.json());
  });
}

export async function profileOf(sym, deadline = null) {
  const errors = [];
  let s = null;
  try {
    s = await getSession(false, deadline);
  } catch (e) {
    errors.push(`sessão Yahoo: ${e.message}`);
  }
  const run = (sess) =>
    Promise.allSettled([
      sess ? summary(sym, sess, deadline) : Promise.reject(new Error("sem sessão")),
      /^\^|=/.test(sym) ? Promise.resolve(null) : series(sym, deadline),
      yahooSearch([sym]),
    ]);
  let [p, f, n] = await run(s);
  if (p.status === "rejected" && p.reason?.auth && timeLeft(deadline) > 6000) {
    try {
      s = await getSession(true, deadline);
      p = (await Promise.allSettled([summary(sym, s, deadline)]))[0];
    } catch (e) {
      errors.push(`sessão Yahoo (renovação): ${e.message}`);
    }
  }
  for (const [lab, r] of [
    ["perfil", p],
    ["financeiros", f],
    ["notícias", n],
  ])
    if (r.status === "rejected") errors.push(`${lab}: ${r.reason?.message ?? r.reason}`);
  const seen = new Set();
  const news = (n.status === "fulfilled" ? n.value : [])
    .filter((x) => !seen.has(x.title) && seen.add(x.title))
    .sort((a, b) => (b.t ?? 0) - (a.t ?? 0))
    .slice(0, 8);
  // manchetes e descrição em português (o original fica no item)
  const [newsPt, [summaryPt]] = await Promise.all([
    translateItems(news, { deadline }),
    p.status === "fulfilled" && p.value.profile?.summary
      ? translateMany([p.value.profile.summary], { deadline })
      : Promise.resolve([null]),
  ]);
  if (summaryPt && p.status === "fulfilled") p.value.profile.summaryPt = summaryPt;
  return {
    symbol: sym,
    fetched_at: new Date().toISOString(),
    ...(p.status === "fulfilled" ? p.value : {}),
    financials: f.status === "fulfilled" ? f.value : null,
    news: newsPt,
    errors,
  };
}

export default async function handler(req, res) {
  const sym = String(new URL(req.url, "http://x").searchParams.get("symbol") ?? "").toUpperCase();
  if (!SYMBOL_RE.test(sym)) {
    res.setHeader("Cache-Control", "no-store");
    return res.status(400).json({ error: "informe ?symbol=AAPL" });
  }
  try {
    const out = await profileOf(sym, deadlineIn(20000));
    const ok = !!(out.profile || out.financials || out.news.length);
    res.setHeader(
      "Cache-Control",
      ok ? "public, s-maxage=21600, stale-while-revalidate=43200" : "no-store",
    );
    res.status(ok ? 200 : 502).json(out);
  } catch (e) {
    res.setHeader("Cache-Control", "no-store");
    res.status(502).json({ error: String(e?.message ?? e) });
  }
}
