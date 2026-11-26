// Vercel Function: agenda econômica da semana (faireconomy, gratuito, sem chave) + resultados e dividendos
// dos ativos pedidos (Yahoo v7/quote). GET /api/calendar?symbols=AAPL,MSFT
// -> { fetched_at, events: [...], corporate: [...], errors: [] }. Cache de 30 min na borda.
import { httpFetch, memo } from "./_http.js";
import { SYMBOL_RE, getSession } from "./quotes.js";
import { corporateEvents, normalizeEvents } from "../assets/calendar.js";
import { attachActuals, dedupeBR, fixT, normalizeNasdaqEcoBR, releasedHistory } from "../assets/macro-alerts.js"; // prettier-ignore
import { fetchEco, fetchFF, lastDays, nextDays } from "./_eco.js";

// semana atual: fetchFF (cache de 30 min e última boa se a fonte limitar); a próxima nem sempre existe (404)
const NEXT_WEEK = "https://nfs.faireconomy.media/ff_calendar_nextweek.json";

let ecoErr = null;
let ecoN = 0;
let released = [];

async function fetchEvents() {
  ecoErr = null;
  const [cur, next] = await Promise.allSettled([
    fetchFF(),
    memo("ffnext", 30 * 60000, () =>
      httpFetch(NEXT_WEEK, { timeout: 6000 }, async (r) => {
        if (!r.ok) throw new Error(`agenda HTTP ${r.status}`);
        return normalizeEvents(await r.json());
      }),
    ),
  ]);
  if (cur.status === "rejected") throw cur.reason;
  const seen = new Set();
  const ev = [...cur.value, ...(next.status === "fulfilled" ? next.value : [])].filter((e) => {
    const k = `${e.t}|${e.cc}|${e.title}`;
    return !seen.has(k) && seen.add(k);
  });
  // valor divulgado (Nasdaq) dos últimos 7 dias; se a fonte falhar, a agenda sai sem a coluna "Atual"
  let eco = [];
  try {
    eco = await fetchEco(lastDays(14), { ff: cur.value });
  } catch (e) {
    ecoErr = `valor divulgado (Nasdaq): ${e?.message ?? e}`;
  }
  ecoN = eco.length;
  released = releasedHistory(eco, 50);
  return attachActuals(ev, eco);
}

async function fetchCorporate(symbols) {
  if (!symbols.length) return [];
  const s = await getSession();
  const url =
    "https://query1.finance.yahoo.com/v7/finance/quote?symbols=" +
    encodeURIComponent(symbols.join(",")) +
    "&crumb=" +
    encodeURIComponent(s.crumb);
  const j = await httpFetch(url, { headers: { Cookie: s.cookie } }, async (r) => {
    if (!r.ok) throw new Error(`quote HTTP ${r.status}`);
    return r.json();
  });
  return corporateEvents(j?.quoteResponse?.result ?? [], Date.now() / 1000);
}

export function parseSymbols(raw) {
  return [
    ...new Set(
      String(raw ?? "")
        .toUpperCase()
        .split(",")
        .map((x) => x.trim())
        .filter((x) => SYMBOL_RE.test(x)),
    ),
  ].slice(0, 60);
}

/**
 * Agenda Onshore (Brasil): a Nasdaq traz o Brasil com projeção e valor divulgado; a Forex Factory não cobre o real.
 * Últimos 14 dias (divulgados) + próximos 10 (a divulgar).
 */
async function fetchBR() {
  const now = Date.now() / 1000;
  const raw = await fetchEco([...lastDays(14), ...nextDays(10)], {
    normalize: normalizeNasdaqEcoBR,
    yahoo: false, // o Yahoo não tem o Brasil; sem isso os dados dos EUA entrariam na agenda Onshore
  });
  const uniq = dedupeBR(raw.map((e) => (e.t != null ? { ...e, t: fixT(e, now) } : e)));
  return {
    events: uniq.filter((e) => e.t == null || e.t >= now - 36 * 3600).sort((a, b) => (a.t ?? Date.parse(`${a.date}T12:00:00Z`) / 1000) - (b.t ?? Date.parse(`${b.date}T12:00:00Z`) / 1000)), // prettier-ignore
    released: releasedHistory(uniq, 60),
  };
}

export default async function handler(req, res) {
  const params = new URL(req.url, "http://x").searchParams;
  const symbols = parseSymbols(params.get("symbols"));
  if (params.get("br") === "1") {
    const [br, co] = await Promise.allSettled([fetchBR(), fetchCorporate(symbols)]);
    const errors = [br, co].filter((r) => r.status === "rejected").map((r) => r.reason?.message ?? String(r.reason)); // prettier-ignore
    res.setHeader("Cache-Control", errors.length ? "s-maxage=120" : "s-maxage=1800, stale-while-revalidate=3600"); // prettier-ignore
    return res.status(br.status === "rejected" && co.status === "rejected" ? 502 : 200).json({
      fetched_at: new Date().toISOString(),
      events: br.status === "fulfilled" ? br.value.events : [],
      released: br.status === "fulfilled" ? br.value.released : [],
      corporate: co.status === "fulfilled" ? co.value : [],
      errors,
    });
  }
  const [ev, co] = await Promise.allSettled([fetchEvents(), fetchCorporate(symbols)]);
  const errors = [ev, co].filter((r) => r.status === "rejected").map((r) => r.reason?.message ?? String(r.reason)); // prettier-ignore
  const body = {
    fetched_at: new Date().toISOString(),
    events: ev.status === "fulfilled" ? ev.value : [],
    corporate: co.status === "fulfilled" ? co.value : [],
    errors,
    eco: { n: ecoN, error: ecoErr },
    released: ev.status === "fulfilled" ? released : [],
  };
  res.setHeader("Cache-Control", errors.length ? "s-maxage=120" : "s-maxage=1800, stale-while-revalidate=3600"); // prettier-ignore
  res.status(ev.status === "rejected" && co.status === "rejected" ? 502 : 200).json(body);
}
