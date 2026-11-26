// Vercel Function: decide QUAIS avisos push cada usuário deve receber (regime, níveis, sinais e notícias da carteira).
// POST { users: [{ id, holdings, prefs, sent: [chaves já enviadas] }] } -> { alerts: { id: [aviso...] } }
// Só cálculo, sem banco e sem segredo. Quem lê o banco e envia é a Edge Function do Supabase (supabase/functions/push),
// que desde 22/11/2026 roda `computeAlerts` empacotado (push.bundle.js) em vez de chamar esta rota; ela fica para
// teste manual e reserva.
import { fetchNews } from "./news.js";
import { mergeItems } from "../assets/news.js";
import { alertsFor } from "../scripts/lib/push-alerts.mjs";
import { deadlineIn } from "./_http.js";
import { ruleStats } from "../assets/signals.js";
import { nyDate } from "../assets/live.js";
import { analyzeTicker } from "../assets/integrated.js";
import { fetchEco, lastDays } from "./_eco.js";
import { dedupeBR, normalizeNasdaqEco, normalizeNasdaqEcoBR } from "../assets/macro-alerts.js";
import { usSession } from "../assets/refresh.js";
import { REGIME_SYMS, regimePair } from "../assets/regime-history.js";
import { mktRegimeAlerts } from "../assets/mkt-regime-alerts.js";
import { regimeReversal, reversalAlerts } from "../assets/regime-reversal.js";
import { topicTitle } from "../assets/notif-topics.js";
import { quietNow } from "../assets/weekend.js";

/** Aviso do regime do mercado ligado nas preferências: troca de faixa (mktregime) ou radar de virada (reversal). */
export const mktOn = (a, prefs) => (a.topic === "rev" ? prefs.reversal !== false : prefs.mktregime !== false); // prettier-ignore

/** Só os avisos do regime do mercado de um usuário (chamada leve), com as mesmas regras de alertsFor. */
export function mktFor(mkt, prefs, sent, nowSec = Date.now() / 1000) {
  if (quietNow(prefs, nowSec)) return [];
  return mkt
    .filter((a) => mktOn(a, prefs) && !sent.has(a.key))
    .map((a) => ({ ...a, title: topicTitle(a.topic ?? "mkt", a.title) }));
}

/** Avisos do regime do mercado (os mesmos para todos): nota agora × 60 min atrás pelas barras de 5 min. */
export async function marketRegimeAlerts(get, flow, nowSec = Date.now() / 1000) {
  if (!flow?.close) return { alerts: [], pair: null };
  const list = [...REGIME_SYMS].sort().map(encodeURIComponent).join(",");
  const [bars, q] = await Promise.all([
    get(`api/intraday?symbols=${list}&win=short`),
    get(`api/quotes?only=1&extra=${list}`),
  ]);
  const daily = { dates: flow.dates, close: flow.close };
  const pair = regimePair({ daily, series: bars?.series, quotes: q?.quotes, nowSec });
  // radar de virada (trilha de 3 h a cada 5 min, mesma conta): vem primeiro, é o aviso mais urgente
  let rev = [];
  try {
    const r = regimeReversal({ daily, series: bars?.series, quotes: q?.quotes, nowSec });
    rev = reversalAlerts(r, { nowSec }).map((a) => ({ ...a, topic: "rev" }));
  } catch {
    rev = [];
  }
  return { alerts: [...rev, ...(pair ? mktRegimeAlerts(pair.now, pair.past, { nowSec }) : [])], pair }; // prettier-ignore
}

/** Agenda da Nasdaq de um dia: indicadores de fora + Brasil (só os de impacto alto/médio, sem o dia repetido). */
export const ecoAll = (rows, d) => [
  ...normalizeNasdaqEco(rows, d),
  ...normalizeNasdaqEcoBR(rows, d).filter((e) => e.impact === "high" || e.impact === "medium"),
];
/** A Nasdaq repete eventos do Brasil em dois dias seguidos: fica um só (senão o aviso sairia duas vezes). */
export const dedupeEco = (eco) => [...eco.filter((e) => e.cc !== "BRL"), ...dedupeBR(eco.filter((e) => e.cc === "BRL"))]; // prettier-ignore

/** Histórico de 2 anos + preço ao vivo (substitui ou acrescenta o pregão de hoje) para cada ativo. */
export function withLive(series, quotes) {
  const out = {};
  for (const [sym, h] of Object.entries(series ?? {})) {
    if (!h?.close?.length) continue;
    const close = [...h.close];
    const dates = [...h.dates];
    const q = quotes?.[sym];
    if (q?.p > 0 && q.t) {
      const d = nyDate(q.t);
      if (d === dates.at(-1)) close[close.length - 1] = q.p;
      else if (d > dates.at(-1)) {
        close.push(q.p);
        dates.push(d);
      }
    }
    out[sym] = { dates, close };
  }
  return out;
}

/**
 * Calcula os avisos de cada usuário. `get(caminho)` devolve o JSON de `api/...` ou `data/...` (ou null): na Vercel
 * é HTTP no próprio app; na Edge Function do Supabase é a chamada direta às mesmas funções (sem passar pela Vercel).
 */
export async function computeAlerts(body, get) {
  const users = (body.users ?? []).slice(0, 50);
  // only = "mkt" (chamada leve da madrugada, a cada minuto): só o regime do mercado
  if (body.only === "mkt") {
    const flow = await get("data/flow.json");
    const { alerts: mkt, pair } = await marketRegimeAlerts(get, flow);
    const alerts = {};
    for (const u of users) alerts[u.id] = mktFor(mkt, u.prefs ?? {}, new Set(u.sent ?? []));
    return { alerts, mkt: mkt.length, score: pair?.now?.score ?? null };
  }
  // ativos de todas as carteiras (sem repetir): histórico de 2 anos + cotação ao vivo, em lotes
  const syms = [...new Set(users.flatMap((u) => (u.holdings ?? []).map((h) => h.sym)))].slice(
    0,
    120,
  );
  const lots = [];
  for (let i = 0; i < syms.length; i += 40) lots.push(syms.slice(i, i + 40));
  const enc = (l) => encodeURIComponent(l.join(","));
  // candidatos a liderança: a mesma varredura do app (cache de 2 min); só com algo negociando. noLeaders: a 1ª
  // chamada de uma instância nova do Supabase pula a varredura (ainda sem cache; não passa do limite de 2 s de CPU)
  const leadersP =
    !body.noLeaders && usSession() !== "closed"
      ? get("api/intraday?leaders=1")
      : Promise.resolve(null);
  const [flow, cron, live, ref, quotes, scanJ, ecoRaw, ...hist] = await Promise.all([
    get("data/flow.json"),
    get("data/news.json"),
    fetchNews([], deadlineIn(15000)).catch(() => null),
    get("data/prices.json"),
    syms.length ? get(`api/quotes?extra=${enc(syms.slice(0, 60))}`) : null,
    get("data/market-scan.json"),
    fetchEco(lastDays(2), { deadline: deadlineIn(12000), normalize: ecoAll }).catch(() => []),
    ...lots.map((l) => get(`api/history?range=2y&symbols=${enc(l)}`)),
  ]);
  const eco = dedupeEco(ecoRaw);
  // análise integrada (técnico + fundamentos) para os avisos de nível: lotes de 15, cache de 1 h na borda
  const aLots = [];
  for (let i = 0; i < Math.min(syms.length, 60); i += 15) aLots.push(syms.slice(i, i + 15));
  const analyzed = await Promise.all(aLots.map((l) => get(`api/analyze?symbols=${enc(l)}`)));
  const analyses = {};
  for (const j of analyzed)
    for (const [s, item] of Object.entries(j?.items ?? {})) analyses[s] = analyzeTicker(s, item);
  const series = withLive(Object.assign({}, ...hist.map((h) => h?.series ?? {})), quotes?.quotes);
  const global = ref?.series ? ruleStats(Object.values(ref.series)) : null;
  const news = mergeItems([live?.items ?? [], cron?.items ?? []]);
  // vigia de regime: decisão e médio prazo do fechamento anterior, só dos ativos das carteiras
  const want = new Set(syms);
  const scan = Object.fromEntries((scanJ?.rows ?? []).filter((x) => want.has(x.s)).map((x) => [x.s, x])); // prettier-ignore
  const leaders = (await leadersP)?.candidates ?? [];
  const { alerts: mkt, pair } = await marketRegimeAlerts(get, flow).catch(() => ({ alerts: [], pair: null })); // prettier-ignore
  const alerts = {};
  for (const u of users)
    alerts[u.id] = alertsFor({
      holdings: u.holdings ?? [],
      flow,
      news,
      live: series,
      global,
      analyses,
      quotes: quotes?.quotes ?? {},
      market: { spy: ref?.series?.SPY },
      scan,
      eco,
      leaders,
      mkt,
      prefs: u.prefs ?? {},
      sent: new Set(u.sent ?? []),
    }).send;
  return {
    alerts,
    flow: !!flow,
    news: news.length,
    eco: eco.length,
    leaders: leaders.length,
    mkt: mkt.length,
    score: pair?.now?.score ?? null,
    series: Object.keys(series).length,
    analyses: Object.keys(analyses).length,
  };
}

export default async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");
  if (req.method !== "POST") return res.status(405).json({ error: "use POST" });
  try {
    const body = typeof req.body === "string" ? JSON.parse(req.body) : (req.body ?? {});
    const origin = `https://${req.headers.host}`;
    const get = (p) => fetch(`${origin}/${p}`, { signal: AbortSignal.timeout(10000) }).then((r) => (r.ok ? r.json() : null)).catch(() => null); // prettier-ignore
    res.status(200).json(await computeAlerts(body, get));
  } catch (e) {
    res.status(500).json({ error: String(e?.message ?? e) });
  }
}
