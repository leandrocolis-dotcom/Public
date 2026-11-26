// Coleta do Quant Aberto: lista do S&P 500 (Wikipédia) e dados do Yahoo. Usado por scripts/update-quant.mjs
// e scripts/quant-calib-study.mjs.
import { httpFetch } from "../../api/_http.js";
import { getSession } from "../../api/quotes.js";

const MODULES = "price,summaryDetail,defaultKeyStatistics,financialData,earningsTrend,assetProfile";
const WIKI = "https://en.wikipedia.org/wiki/List_of_S%26P_500_companies";

const strip = (h) =>
  h
    .replace(/<[^>]+>/g, "")
    .replace(/&amp;/g, "&")
    .replace(/&#39;/g, "'")
    .trim();

/** Tabela "constituents" da Wikipédia → [{ sym, name, sector, sub }]. */
export function parseSp500(html) {
  const i = html.indexOf('id="constituents"');
  if (i < 0) return [];
  const table = html.slice(i, html.indexOf("</table>", i));
  return table
    .split(/<tr[\s>]/)
    .map((tr) => [...tr.matchAll(/<td[^>]*>([\s\S]*?)<\/td>/g)].map((m) => strip(m[1])))
    .filter((td) => td.length >= 4 && /^[A-Z][A-Z.]{0,6}$/.test(td[0]))
    .map(([sym, name, sector, sub]) => ({ sym: sym.replace(".", "-"), name, sector, sub }));
}

export async function universe(prev) {
  try {
    const html = await httpFetch(
      WIKI,
      { timeout: 20000, ua: "pendulo-quant/1.0 (estudo educacional)" },
      (r) => r.text(),
    );
    const list = parseSp500(html);
    if (list.length >= 480) return { list, source: "wikipedia" };
    throw new Error(`lista curta (${list.length})`);
  } catch (e) {
    const old = (prev?.rows ?? []).map(({ sym, name, sector, sub }) => ({
      sym,
      name,
      sector,
      sub,
    }));
    if (old.length) return { list: old, source: `anterior (${e.message})` };
    throw e;
  }
}

const raw = (x) => (x && typeof x === "object" ? (x.raw ?? null) : (x ?? null));

/** Campos do resumo do Yahoo usados pelo modelo (ver deriveMetrics em assets/quant.js). */
export function compactSummary(q) {
  const fd = q.financialData ?? {};
  const ks = q.defaultKeyStatistics ?? {};
  const sd = q.summaryDetail ?? {};
  const pr = q.price ?? {};
  const tr = Object.fromEntries((q.earningsTrend?.trend ?? []).map((t) => [t.period, t]));
  const ep = (p, k) => raw(tr[p]?.epsTrend?.[k]);
  const rv = (p, k) => raw(tr[p]?.epsRevisions?.[k]);
  return {
    price: raw(pr.regularMarketPrice) ?? raw(fd.currentPrice),
    mcap: raw(pr.marketCap) ?? raw(sd.marketCap),
    trailingEps: raw(ks.trailingEps),
    forwardEps: raw(ks.forwardEps),
    evEbitda: raw(ks.enterpriseToEbitda),
    ps: raw(sd.priceToSalesTrailing12Months),
    pb: raw(ks.priceToBook),
    peg: raw(ks.pegRatio),
    fcf: raw(fd.freeCashflow),
    revenue: raw(fd.totalRevenue),
    revG: raw(fd.revenueGrowth),
    epsG: raw(fd.earningsGrowth),
    g0y: raw(tr["0y"]?.growth),
    g1y: raw(tr["+1y"]?.growth),
    rg0y: raw(tr["0y"]?.revenueEstimate?.growth),
    rg1y: raw(tr["+1y"]?.revenueEstimate?.growth),
    gm: raw(fd.grossMargins),
    om: raw(fd.operatingMargins),
    pm: raw(fd.profitMargins),
    roe: raw(fd.returnOnEquity),
    roa: raw(fd.returnOnAssets),
    ma200: raw(sd.twoHundredDayAverage),
    e0y: ep("0y", "current"),
    e0y30: ep("0y", "30daysAgo"),
    e0y90: ep("0y", "90daysAgo"),
    e1y: ep("+1y", "current"),
    e1y30: ep("+1y", "30daysAgo"),
    e1y90: ep("+1y", "90daysAgo"),
    up0y: rv("0y", "upLast30days"),
    down0y: rv("0y", "downLast30days"),
    up1y: rv("+1y", "upLast30days"),
    down1y: rv("+1y", "downLast30days"),
    analysts: raw(fd.numberOfAnalystOpinions),
    target: raw(fd.targetMeanPrice),
    beta: raw(ks.beta) ?? raw(sd.beta),
    ev: raw(ks.enterpriseValue),
    evRev: raw(ks.enterpriseToRevenue),
    ocf: raw(fd.operatingCashflow),
    ebitdaM: raw(fd.ebitdaMargins),
    ni: raw(ks.netIncomeToCommon),
    emp: raw(q.assetProfile?.fullTimeEmployees),
    dy: raw(sd.dividendYield),
    rev0yAvg: raw(tr["0y"]?.revenueEstimate?.avg),
  };
}

let sess = null;
export async function summary(sym) {
  for (let t = 0; t < 2; t++) {
    sess ??= await getSession(t > 0);
    const url = `https://query2.finance.yahoo.com/v10/finance/quoteSummary/${encodeURIComponent(sym)}?modules=${MODULES}&crumb=${encodeURIComponent(sess.crumb)}`;
    const r = await httpFetch(url, { timeout: 15000, headers: { Cookie: sess.cookie } });
    if (r.status === 401 || r.status === 403) {
      sess = null;
      continue;
    }
    if (!r.ok) throw new Error(`resumo HTTP ${r.status}`);
    const q = (await r.json())?.quoteSummary?.result?.[0];
    if (!q) throw new Error("resumo vazio");
    return compactSummary(q);
  }
  throw new Error("crumb recusado");
}

/** Fechamentos semanais ajustados de 2 anos (`withDates`: [{ d, c }]). */
export async function weekly(sym, withDates = false) {
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(sym)}?range=2y&interval=1wk`;
  return httpFetch(url, { timeout: 15000 }, async (r) => {
    if (!r.ok) throw new Error(`gráfico HTTP ${r.status}`);
    const res = (await r.json())?.chart?.result?.[0];
    const c = res?.indicators?.adjclose?.[0]?.adjclose ?? res?.indicators?.quote?.[0]?.close ?? [];
    if (withDates) {
      const ts = res?.timestamp ?? [];
      const pts = ts
        .map((t, i) => ({ d: new Date(t * 1000).toISOString().slice(0, 10), c: c[i] }))
        .filter((p) => Number.isFinite(p.c));
      if (pts.length < 30) throw new Error("histórico curto");
      return pts;
    }
    const w = c.filter((x) => Number.isFinite(x));
    if (w.length < 30) throw new Error("histórico curto");
    return w;
  });
}

export async function pool(items, n, fn) {
  const out = new Array(items.length);
  let next = 0;
  await Promise.all(
    Array.from({ length: n }, async () => {
      while (next < items.length) {
        const i = next++;
        out[i] = await fn(items[i]).catch((e) => ({ error: e.message }));
      }
    }),
  );
  return out;
}
