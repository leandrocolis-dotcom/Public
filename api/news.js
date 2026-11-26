// Vercel Function: manchetes de mercado (só título, fonte, horário e link) dos feeds RSS públicos dos sites.
// GET /api/news[?symbols=AAA,BBB] -> { fetched_at, items: [{ id, title, link, source, region, t }], sources, errors }
// Com symbols, inclui também as manchetes do Yahoo Finance sobre esses tickers (carteira do usuário).
// A ligação de cada notícia com a carteira é feita no navegador (assets/news.js), que conhece as posições.
import { parseRss, mergeItems } from "../assets/news.js";
import { deadlineIn, httpFetch, timeLeft } from "./_http.js";
import { translateItems } from "../assets/translate.js";

export { parseRss, mergeItems };
const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Safari/605.1.15";
const TIMEOUT_MS = 7000;

export const FEEDS = [
  { source: "Bloomberg", region: "int", url: "https://feeds.bloomberg.com/markets/news.rss" },
  { source: "Yahoo Finance", region: "int", url: "https://feeds.finance.yahoo.com/rss/2.0/headline?s=%5EGSPC,%5EDJI,%5EIXIC&region=US&lang=en-US" },
  { source: "Wall Street Journal", region: "int", url: "https://feeds.content.dowjones.io/public/rss/RSSMarketsMain" },
  { source: "Wall Street Journal", region: "int", url: "https://feeds.a.dj.com/rss/WSJcomUSBusiness.xml" },
  { source: "Business Insider", region: "int", url: "https://markets.businessinsider.com/rss/news" },
  { source: "Forbes", region: "int", url: "https://www.forbes.com/business/feed/" },
  { source: "Fortune", region: "int", url: "https://fortune.com/feed/fortune-feeds/?id=3230629" },
  { source: "Nasdaq", region: "int", url: "https://www.nasdaq.com/feed/rssoutbound?category=Markets" },
  { source: "BBC Business", region: "int", url: "https://feeds.bbci.co.uk/news/business/rss.xml" },
  { source: "Financial Times", region: "int", url: "https://www.ft.com/markets?format=rss" },
  { source: "Financial Times", region: "int", url: "https://www.ft.com/rss/home" },
  { source: "CNBC", region: "int", url: "https://search.cnbc.com/rs/search/combinedcms/view.xml?partnerId=wrss01&id=100003114" },
  { source: "CNBC", region: "int", url: "https://search.cnbc.com/rs/search/combinedcms/view.xml?partnerId=wrss01&id=10000664" },
  { source: "MarketWatch", region: "int", url: "https://feeds.content.dowjones.io/public/rss/mw_topstories" },
  { source: "Investing.com", region: "int", url: "https://www.investing.com/rss/news_25.rss" },
  { source: "Seeking Alpha", region: "int", url: "https://seekingalpha.com/market_currents.xml" },
  { source: "The Economist", region: "int", url: "https://www.economist.com/finance-and-economics/rss.xml" },
  { source: "Valor Econômico", region: "br", url: "https://valor.globo.com/rss/valor", max: 15 },
  { source: "Valor Econômico", region: "br", url: "https://valor.globo.com/rss/valor/financas", max: 10 },
  { source: "Valor Econômico", region: "br", url: "https://valor.globo.com/rss/valor/empresas", max: 10 },
  { source: "Valor Investe", region: "br", url: "https://valor.globo.com/rss/valorinveste", max: 10 },
  { source: "InfoMoney", region: "br", url: "https://www.infomoney.com.br/feed/" },
  { source: "Money Times", region: "br", url: "https://www.moneytimes.com.br/feed/" },
  { source: "Exame", region: "br", url: "https://exame.com/feed/" },
  { source: "Investing Brasil", region: "br", url: "https://br.investing.com/rss/news.rss" },
]; // prettier-ignore

const UA_BOT = "Mozilla/5.0 (compatible; PenduloNews/1.0; +https://etf-portfolio-ten.vercel.app)";

/** Alguns sites (FT, Economist) recusam navegador simulado e aceitam leitor de RSS identificado; outros, o contrário. */
async function get(url) {
  try {
    return await get1(url, UA);
  } catch (e) {
    if (!/HTTP 40[13]/.test(e.message)) throw e;
    return get1(url, UA_BOT);
  }
}

const get1 = (url, ua) =>
  httpFetch(
    url,
    {
      timeout: TIMEOUT_MS,
      ua,
      headers: { Accept: "application/rss+xml, application/xml, text/xml" },
      redirect: "follow",
    },
    async (r) => {
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      return r.text();
    },
  );

const SYMBOL_RE = /^[A-Z][A-Z0-9.-]{0,9}$/;
export function parseSymbols(raw) {
  return [...new Set(String(raw ?? "").toUpperCase().split(",").map((x) => x.trim()).filter((x) => SYMBOL_RE.test(x)))].slice(0, 30); // prettier-ignore
}

/** Reserva para o feed por ticker do Yahoo (que às vezes devolve 429 na Vercel): a busca de notícias, por ticker. */
export async function yahooSearch(symbols) {
  const lists = await Promise.allSettled(
    symbols.slice(0, 12).map(async (sym) => {
      const j = await httpFetch(
        `https://query2.finance.yahoo.com/v1/finance/search?q=${encodeURIComponent(sym)}&newsCount=6&quotesCount=0`,
        { timeout: TIMEOUT_MS, ua: "Mozilla/5.0", headers: { Accept: "application/json" } },
        async (r) => {
          if (!r.ok) throw new Error(`HTTP ${r.status}`);
          return r.json();
        },
      );
      return (j?.news ?? [])
        .filter((n) => n.title && /^https?:\/\//.test(n.link ?? ""))
        .map((n) => ({
          title: n.title,
          link: n.link,
          source: "Yahoo Finance",
          region: "int",
          t: n.providerPublishTime ?? null,
        }));
    }),
  );
  return lists.flatMap((r) => (r.status === "fulfilled" ? r.value : []));
}

export async function fetchNews(symbols = [], deadline = null) {
  const feeds = [...FEEDS];
  // Yahoo Finance: manchetes por ticker (até 10 tickers por chamada)
  for (let i = 0; i < symbols.length; i += 10)
    feeds.push({ source: "Yahoo Finance", region: "int", ticker: true, url: `https://feeds.finance.yahoo.com/rss/2.0/headline?s=${symbols.slice(i, i + 10).join(",")}&region=US&lang=en-US` }); // prettier-ignore
  // max: feeds muito volumosos (Valor publica ~100 itens/dia) ficam só com os mais recentes, para não tomar o lugar das outras fontes
  const cap = (l, n) => (n ? [...l].sort((a, b) => (b.t ?? 0) - (a.t ?? 0)).slice(0, n) : l);
  const res = await Promise.allSettled(
    feeds.map((f) => get(f.url).then((x) => cap(parseRss(x, f), f.max))),
  );
  const errors = [];
  const ok = new Set();
  res.forEach((r, i) => {
    if (r.status === "fulfilled" && r.value.length) ok.add(feeds[i].source);
    else
      errors.push(
        `${feeds[i].source}: ${r.status === "rejected" ? (r.reason?.message ?? r.reason) : "vazio"}`,
      );
  });
  const lists = res.map((r) => (r.status === "fulfilled" ? r.value : []));
  // feed por ticker do Yahoo falhou: usa a busca
  const yahooFailed = feeds.some(
    (f, i) => f.ticker && !(res[i].status === "fulfilled" && res[i].value.length),
  );
  if (symbols.length && yahooFailed) {
    // reserva só se ainda houver tempo (evita 504 quando os feeds já demoraram)
    const alt = timeLeft(deadline) > 8000 ? await yahooSearch(symbols).catch(() => []) : [];
    if (alt.length) {
      lists.push(alt);
      ok.add("Yahoo Finance");
      for (let i = errors.length - 1; i >= 0; i--)
        if (errors[i].startsWith("Yahoo Finance")) errors.splice(i, 1);
    }
  }
  // traduz para o português (o original fica em title/d para ligar com ativos e carteira)
  const items = await translateItems(mergeItems(lists).slice(0, 160), { deadline });
  return { fetched_at: new Date().toISOString(), items, sources: [...ok], errors };
}

export default async function handler(req, res) {
  try {
    const symbols = parseSymbols(new URL(req.url, "http://x").searchParams.get("symbols"));
    const out = await fetchNews(symbols, deadlineIn(20000));
    res.setHeader(
      "Cache-Control",
      out.items.length ? "public, s-maxage=120, stale-while-revalidate=600" : "no-store",
    );
    res.status(out.items.length ? 200 : 502).json(out);
  } catch (e) {
    res.setHeader("Cache-Control", "no-store");
    res.status(502).json({ error: String(e?.message ?? e), fetched_at: new Date().toISOString() });
  }
}
