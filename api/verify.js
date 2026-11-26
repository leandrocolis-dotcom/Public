// Vercel Function: confere as cotações do Yahoo contra uma segunda fonte independente (Nasdaq), gratuita e sem chave.
// GET /api/verify[?symbols=AAA,BBB] -> { checked_at, market, rows: [...], summary }
// GET /api/verify?version -> { sha, message, env }: commit do deploy no ar (usado pela Edge Function push no aviso
// "Pêndulo atualizado"). Mora aqui porque o plano da Vercel limita o número de funções (12).
// Compara o preço e, principalmente, o fechamento anterior (que não muda durante o dia: deve bater quase exato).
// A Nasdaq só cobre ações e ETFs dos EUA: futuros, moedas e índices ficam de fora (status "sem referência").
import { fetchAll } from "./quotes.js";
import { deadlineIn, httpFetch } from "./_http.js";

export const DEFAULT_SAMPLE = [
  "SPY",
  "QQQ",
  "IWM",
  "EEM",
  "EWZ",
  "GLD",
  "TLT",
  "HYG",
  "XLF",
  "XLK",
];
const TICKER_RE = /^[A-Z]{1,5}$/;
const MAX = 25;
const TIMEOUT_MS = 7000;

/** Símbolos da URL: só tickers simples de ações/ETFs dos EUA (o que a Nasdaq cobre), no máximo 25. */
export function parseSymbols(raw) {
  const list = String(raw ?? "")
    .toUpperCase()
    .split(",")
    .map((x) => x.trim())
    .filter((x) => TICKER_RE.test(x));
  return [...new Set([...DEFAULT_SAMPLE, ...list])].slice(0, MAX);
}

/** "$1,234.56" -> 1234.56 ; "+4.31" -> 4.31 ; "" -> null */
export function money(s) {
  const n = Number(String(s ?? "").replace(/[$,+\s]/g, ""));
  return String(s ?? "").trim() && Number.isFinite(n) ? n : null;
}

/**
 * Extrai da resposta da Nasdaq o último preço do pregão regular e o fechamento anterior.
 * Fora do pregão, primaryData é o after-hours; o fechamento oficial está em secondaryData ("Closed at ...").
 */
export function parseNasdaq(data) {
  if (!data?.primaryData) return null;
  const open = /market open/i.test(data.marketStatus ?? "");
  const closed = /closed at/i.test(data.secondaryData?.lastTradeTimestamp ?? "");
  const src = !open && closed ? data.secondaryData : data.primaryData;
  const price = money(src.lastSalePrice);
  const chg = money(src.netChange);
  if (!(price > 0)) return null;
  return {
    price,
    prevClose: chg != null ? Math.round((price - chg) * 10000) / 10000 : null,
    status: data.marketStatus ?? null,
    open,
  };
}

export async function nasdaq(sym, deadline = null) {
  for (const cls of ["etf", "stocks"]) {
    const q = await httpFetch(
      `https://api.nasdaq.com/api/quote/${encodeURIComponent(sym)}/info?assetclass=${cls}`,
      { timeout: TIMEOUT_MS, deadline, headers: { Accept: "application/json" } },
      async (r) => (r.ok ? parseNasdaq((await r.json())?.data) : null),
    );
    if (q) return q;
  }
  return null;
}

const diff = (a, b) => (a > 0 && b > 0 ? Math.abs(a / b - 1) : null);

/**
 * Classifica a divergência. Fechamento anterior: tem de bater (≤ 0,15%); acima de 1% é erro.
 * Preço atual: com o mercado aberto as fontes têm defasagens de segundos a minutos, então a tolerância é maior.
 */
export function classify({ priceDiff, prevDiff, open }) {
  const lim = open ? [0.006, 0.02] : [0.0015, 0.01];
  let level = "ok";
  const why = [];
  if (prevDiff != null) {
    if (prevDiff > 0.01) ((level = "bad"), why.push("fechamento anterior diverge"));
    else if (prevDiff > 0.0015)
      ((level = "warn"), why.push("fechamento anterior com pequena diferença"));
  }
  if (priceDiff != null) {
    if (priceDiff > lim[1]) ((level = "bad"), why.push("preço diverge"));
    else if (priceDiff > lim[0]) {
      if (level === "ok") level = "warn";
      why.push(open ? "preço defasado entre as fontes" : "preço com pequena diferença");
    }
  }
  return { level, why };
}

export async function verify(symbols, deadline = null) {
  const [yahoo, ...nq] = await Promise.all([
    fetchAll(symbols, [], { deadline }),
    ...symbols.map((s) => nasdaq(s, deadline).catch(() => null)),
  ]);
  const rows = symbols.map((sym, i) => {
    const y = yahoo.quotes[sym];
    const n = nq[i];
    if (!y || !n)
      return { sym, level: "na", why: [!y ? "sem cotação do Yahoo" : "sem referência na Nasdaq"] };
    const priceDiff = diff(y.p, n.price);
    const prevDiff = diff(y.pc, n.prevClose);
    // A Nasdaq às vezes mostra o pregão anterior rotulado como o de hoje (ETFs com pouco volume):
    // o "último" dela bate com o fechamento anterior do Yahoo. Não é erro do Yahoo: fica sem comparação.
    if (priceDiff > 0.0015 && diff(n.price, y.pc) <= 0.0015)
      return {
        sym,
        yahoo: { price: y.p, prevClose: y.pc, t: y.t },
        nasdaq: { price: n.price, prevClose: n.prevClose },
        level: "na",
        why: ["referência da Nasdaq um pregão atrasada"],
      };
    return {
      sym,
      yahoo: { price: y.p, prevClose: y.pc, t: y.t },
      nasdaq: { price: n.price, prevClose: n.prevClose },
      priceDiff,
      prevDiff,
      ...classify({ priceDiff, prevDiff, open: n.open }),
    };
  });
  const count = (l) => rows.filter((r) => r.level === l).length;
  return {
    checked_at: new Date().toISOString(),
    sources: ["Yahoo Finance", "Nasdaq"],
    market: nq.find(Boolean)?.status ?? null,
    rows,
    summary: { ok: count("ok"), warn: count("warn"), bad: count("bad"), na: count("na") },
  };
}

/** Versão publicada (commit do deploy de produção). */
export function liveVersion(env = process.env) {
  return {
    sha: env.VERCEL_GIT_COMMIT_SHA ?? null,
    message: env.VERCEL_GIT_COMMIT_MESSAGE ?? null,
    env: env.VERCEL_ENV ?? null,
  };
}

export default async function handler(req, res) {
  if (new URL(req.url, "http://x").searchParams.has("version")) {
    res.setHeader("Cache-Control", "no-store");
    return res.status(200).json(liveVersion());
  }
  try {
    const symbols = parseSymbols(new URL(req.url, "http://x").searchParams.get("symbols"));
    const out = await verify(symbols, deadlineIn(22000));
    const compared = out.rows.length - out.summary.na;
    res.setHeader(
      "Cache-Control",
      compared ? "public, s-maxage=300, stale-while-revalidate=600" : "no-store",
    );
    res.status(compared ? 200 : 502).json(out);
  } catch (e) {
    res.setHeader("Cache-Control", "no-store");
    res.status(502).json({ error: String(e?.message ?? e), checked_at: new Date().toISOString() });
  }
}
