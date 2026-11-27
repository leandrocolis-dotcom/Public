// Vercel Function: cotações ao vivo do Yahoo Finance para o universo do site (gratuito, sem chave).
// GET /api/quotes?night=AAA,BBB -> { fetched_at, night: { SÍMBOLO: { xp, regP } } } (sessão noturna 20:00–4:00 de NY)
// GET /api/quotes[?extra=AAA,BBB][&only=1 (só os extras, até 180)] -> { fetched_at, version, market_state, quotes: { SÍMBOLO: {p, t, ms, v, av, pc, b?, a?, n?} }, missing, errors }
// Busca o universo do site + até 60 símbolos extras (os da carteira do usuário), validados por formato.
import { ASSETS } from "../assets/universe.js";
import { FLOW_ASSETS } from "../assets/flow-universe.js";
import { BR_SYMBOLS } from "../assets/br-universe.js";

import { deadlineIn, httpFetch, timeLeft } from "./_http.js";
import { nasdaq } from "./verify.js";
import { activeContract, rootOf } from "../assets/futures.js";

export const SYMBOLS = [
  ...new Set([
    ...Object.values(ASSETS).map((a) => a.yahoo),
    ...FLOW_ASSETS.map((a) => a.sym),
    ...BR_SYMBOLS, // Mercado › Local: a B3 também vai no canal de tempo real (quotes-feed, 15 s)
  ]),
];
const CHUNK = 60;
const MAX_EXTRA = 60;
const MAX_ONLY = 180; // ?only=1: só os extras, sem o universo (listas grandes da aba Oportunidades)
export const SYMBOL_RE = /^[A-Z0-9][A-Z0-9.\-=^]{0,14}$/;

/** Símbolos extras da URL (carteira): só formatos válidos, sem duplicar o universo, no máximo 60. */
export function parseExtra(raw, { only = false } = {}) {
  const set = new Set(only ? [] : SYMBOLS);
  return [
    ...new Set(
      String(raw ?? "")
        .toUpperCase()
        .split(",")
        .map((x) => x.trim())
        .filter((x) => SYMBOL_RE.test(x.replace(/^\^/, "")) && !set.has(x)), // índices (^BVSP) também
    ),
  ].slice(0, only ? MAX_ONLY : MAX_EXTRA);
}

let session = null; // { cookie, crumb, at }: reaproveitado enquanto a instância estiver quente

const get = (url, headers = {}, deadline = null) =>
  httpFetch(url, { headers, redirect: "manual", deadline });

export async function getSession(force = false, deadline = null) {
  if (!force && session && Date.now() - session.at < 30 * 60 * 1000) return session;
  const r1 = await get("https://fc.yahoo.com", {}, deadline);
  const cookie = (r1.headers.getSetCookie?.() ?? []).map((c) => c.split(";")[0]).join("; ");
  const r2 = await get(
    "https://query1.finance.yahoo.com/v1/test/getcrumb",
    { Cookie: cookie },
    deadline,
  );
  const crumb = (await r2.text()).trim();
  if (!r2.ok || !crumb || crumb.length > 40) throw new Error(`crumb HTTP ${r2.status}`);
  session = { cookie, crumb, at: Date.now() };
  return session;
}

async function quoteChunk(symbols, s, deadline = null) {
  const url =
    "https://query1.finance.yahoo.com/v7/finance/quote?symbols=" +
    encodeURIComponent(symbols.join(",")) +
    "&crumb=" +
    encodeURIComponent(s.crumb);
  const r = await get(url, { Cookie: s.cookie }, deadline);
  if (r.status === 401 || r.status === 403)
    throw Object.assign(new Error("crumb inválido"), { auth: true });
  if (!r.ok) throw new Error(`quote HTTP ${r.status}`);
  const j = await r.json();
  return j?.quoteResponse?.result ?? [];
}

// Reserva sem crumb: só preço e horário (sem volume), 20 símbolos por chamada.
async function sparkChunk(symbols, deadline = null) {
  const url =
    "https://query1.finance.yahoo.com/v7/finance/spark?range=1d&interval=1d&symbols=" +
    encodeURIComponent(symbols.join(","));
  const r = await get(url, {}, deadline);
  if (!r.ok) throw new Error(`spark HTTP ${r.status}`);
  const j = await r.json();
  return (j?.spark?.result ?? [])
    .map((x) => ({ symbol: x.symbol, meta: x.response?.[0]?.meta }))
    .filter((x) => x.meta?.regularMarketPrice);
}

const chunks = (arr, n) =>
  Array.from({ length: Math.ceil(arr.length / n) }, (_, i) => arr.slice(i * n, i * n + n));

/**
 * Pré ou pós-mercado (ações/ETFs dos EUA): o preço estendido mais recente, se for posterior ao fechamento
 * regular. xk: "pre" | "post"; xp: preço; xt: horário (s); xc: variação vs. o regular (fração).
 */
export function extendedHours(q) {
  const cands = [
    ["pre", q.preMarketPrice, q.preMarketTime],
    ["post", q.postMarketPrice, q.postMarketTime],
  ].filter(([, p, t]) => p > 0 && t > (q.regularMarketTime ?? 0));
  if (!cands.length) return {};
  const [k, p, t] = cands.sort((a, b) => b[2] - a[2])[0];
  return {
    xk: k,
    xp: p,
    xt: t,
    xc: q.regularMarketPrice > 0 ? p / q.regularMarketPrice - 1 : null,
  };
}

/**
 * Melhor oferta (Long & Short: spread e preço limite; docs/long-short/MAPEAMENTO.md). b: bid, a: ask. Só quando
 * os dois existem, são > 0 e b ≤ a: oferta ausente ou cruzada não entra (o app trata como preço não confiável).
 */
export function bidAsk(q) {
  const b = q?.bid;
  const a = q?.ask;
  return b > 0 && a > 0 && b <= a ? { b, a } : {};
}

/**
 * Futuros: o contínuo do Yahoo (XX=F) congela ou salta perto do vencimento. Para cada XX=F pedido, busca
 * também o contrato vigente pelo calendário (assets/futures.js) e devolve a cotação dele sob o mesmo nome,
 * com fut = código do contrato (ex.: "HEZ26"). Sem cotação do contrato, fica o contínuo.
 * Devolve { "HE=F": "HEZ26.CME", ... }.
 */
export function futContracts(symbols, now = new Date()) {
  const out = {};
  for (const s of symbols) {
    const c = rootOf(s) && activeContract(s, now);
    if (c) out[s] = c.sym;
  }
  return out;
}

/** Troca a cotação do contínuo pela do contrato vigente (mesmo nome, campo fut). Muta quotes. */
export function applyFutContracts(quotes, map, keep = new Set()) {
  for (const [cont, sym] of Object.entries(map)) {
    const k = quotes[sym];
    if (!keep.has(sym)) delete quotes[sym]; // contrato pedido só por causa do contínuo
    if (!k) continue;
    const c = quotes[cont];
    // sempre o contrato vigente: o histórico (scripts/fut-adjust.mjs) também está no nível dele
    quotes[cont] = { ...k, fut: sym.split(".")[0], ...(c && "n" in c ? { n: c.n } : {}) };
  }
  return quotes;
}

export async function fetchAll(symbols = SYMBOLS, extra = [], { deadline = null } = {}) {
  const extraSet = new Set(extra);
  symbols = [...symbols, ...extra];
  const fut = futContracts(symbols);
  const asked = symbols;
  symbols = [...new Set([...symbols, ...Object.values(fut)])];
  const quotes = {};
  const wanted = new Set(symbols); // o Yahoo às vezes devolve apelidos de símbolos: ficam de fora
  const errors = [];
  const calls = { quote: 0, spark: 0, nasdaq: 0 }; // consultas feitas (contadores do robô de cotações)
  let s = null;
  try {
    s = await getSession(false, deadline);
  } catch (e) {
    errors.push(`sessão Yahoo: ${e.message}`);
  }
  if (s) {
    const run = async (sess) => {
      const cs = chunks(symbols, CHUNK);
      calls.quote += cs.length;
      return Promise.allSettled(cs.map((c) => quoteChunk(c, sess, deadline)));
    };
    let results = await run(s);
    if (
      results.some((r) => r.status === "rejected" && r.reason?.auth) &&
      timeLeft(deadline) > 6000
    ) {
      try {
        results = await run(await getSession(true, deadline));
      } catch (e) {
        errors.push(`sessão Yahoo (renovação): ${e.message}`);
      }
    }
    for (const r of results) {
      if (r.status === "rejected") {
        errors.push(`cotação: ${r.reason?.message ?? r.reason}`);
        continue;
      }
      for (const q of r.value) {
        if (!wanted.has(q.symbol)) continue;
        if (typeof q.regularMarketPrice !== "number" || !q.regularMarketTime) continue;
        quotes[q.symbol] = {
          p: q.regularMarketPrice,
          t: q.regularMarketTime,
          ms: q.marketState ?? null,
          v: q.regularMarketVolume ?? null,
          dh: q.regularMarketDayHigh ?? null,
          dl: q.regularMarketDayLow ?? null,
          h52: q.fiftyTwoWeekHigh ?? null,
          l52: q.fiftyTwoWeekLow ?? null,
          av3: q.averageDailyVolume3Month ?? null,
          mc: q.marketCap ?? null,
          av: q.averageDailyVolume10Day ?? null,
          pc: q.regularMarketPreviousClose ?? null,
          ...extendedHours(q),
          ...bidAsk(q),
          ...(extraSet.has(q.symbol) ? { n: q.shortName ?? q.longName ?? null } : {}),
        };
      }
    }
  }
  const missing1 = symbols.filter((x) => !quotes[x]);
  if (missing1.length && timeLeft(deadline) > 1500) {
    const cs = chunks(missing1, 20);
    calls.spark += cs.length;
    const results = await Promise.allSettled(cs.map((c) => sparkChunk(c, deadline)));
    for (const r of results) {
      if (r.status === "rejected") {
        errors.push(`reserva (spark): ${r.reason?.message ?? r.reason}`);
        continue;
      }
      for (const { symbol, meta } of r.value) {
        if (!wanted.has(symbol)) continue;
        quotes[symbol] = {
          p: meta.regularMarketPrice,
          t: meta.regularMarketTime,
          ms: null,
          v: null,
          av: null,
          pc: meta.chartPreviousClose ?? null,
        };
      }
    }
  }
  // 3ª camada: Nasdaq (fonte independente, sem chave) para ações/ETFs dos EUA que o Yahoo não devolveu.
  const missing2 = symbols.filter((x) => !quotes[x] && /^[A-Z]{1,5}$/.test(x)).slice(0, 15);
  if (missing2.length && timeLeft(deadline) > 3000) {
    calls.nasdaq += missing2.length;
    const got = await Promise.all(missing2.map((x) => nasdaq(x, deadline).catch(() => null)));
    got.forEach((n, i) => {
      if (n?.price > 0)
        quotes[missing2[i]] = {
          p: n.price,
          t: Math.floor(Date.now() / 1000),
          ms: n.open ? "REGULAR" : null,
          v: null,
          av: null,
          pc: n.prevClose,
          src: "nasdaq",
        };
    });
  }
  applyFutContracts(quotes, fut, new Set(asked));
  symbols = asked;
  const viaNasdaq = Object.values(quotes).filter((q) => q.src === "nasdaq").length;
  return {
    fetched_at: new Date().toISOString(),
    version: (process.env.VERCEL_GIT_COMMIT_SHA ?? "dev").slice(0, 7),
    source: viaNasdaq ? `Yahoo Finance + Nasdaq (${viaNasdaq})` : "Yahoo Finance",
    market_state: quotes.SPY?.ms ?? null,
    count: Object.keys(quotes).length,
    total: symbols.length,
    quotes,
    missing: symbols.filter((x) => !quotes[x]),
    errors,
    calls,
  };
}

const MAX_NIGHT = 25;

/**
 * Sessão noturna (20:00–4:00 de NY): o Yahoo só expõe o último negócio dela no fulldayPrice do gráfico
 * (o /v7/quote repete o regular). Um pedido por símbolo, por isso só a carteira (até 25).
 * Devolve { SYM: { xp, regP, postP } } só quando o preço noturno difere do último pós/regular.
 */
export function nightOf(meta) {
  const xp = meta?.fulldayPrice;
  const reg = meta?.regularMarketPrice;
  if (!(xp > 0) || !(reg > 0) || Math.abs(xp - reg) < 1e-9) return null;
  return { xp, regP: reg };
}

export async function nightQuotes(symbols, deadline = null) {
  const out = {};
  const got = await Promise.allSettled(
    symbols.map(async (sym) => {
      const r = await get(
        `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(sym)}?interval=1d&range=1d`,
        {},
        deadline,
      );
      if (!r.ok) throw new Error(`${sym} HTTP ${r.status}`);
      const j = await r.json();
      return [sym, nightOf(j?.chart?.result?.[0]?.meta)];
    }),
  );
  for (const g of got) if (g.status === "fulfilled" && g.value[1]) out[g.value[0]] = g.value[1];
  return out;
}

export default async function handler(req, res) {
  try {
    const qs = new URL(req.url, "http://x").searchParams;
    if (qs.get("night")) {
      const syms = parseExtra(qs.get("night"), { only: true })
        .filter((x) => /^[A-Z]{1,5}(-[A-Z])?$/.test(x))
        .slice(0, MAX_NIGHT);
      const night = await nightQuotes(syms, deadlineIn(9000));
      res.setHeader("Cache-Control", "public, s-maxage=60, stale-while-revalidate=60");
      return res.status(200).json({ fetched_at: new Date().toISOString(), night });
    }
    const only = qs.get("only") === "1";
    const extra = parseExtra(qs.get("extra"), { only });
    if (only && !extra.length) {
      res.setHeader("Cache-Control", "no-store");
      return res.status(400).json({ error: "informe ?extra=AAA,BBB com only=1" });
    }
    const out = await fetchAll(only ? [] : SYMBOLS, extra, { deadline: deadlineIn(22000) });
    const ok = out.count > 0;
    // Cache na borda: no máximo 1 consulta ao Yahoo por minuto, qualquer que seja o número de acessos.
    res.setHeader(
      "Cache-Control",
      ok ? "public, s-maxage=60, stale-while-revalidate=120" : "no-store",
    );
    res.status(ok ? 200 : 502).json(out);
  } catch (e) {
    res.setHeader("Cache-Control", "no-store");
    res.status(502).json({ error: String(e?.message ?? e), fetched_at: new Date().toISOString() });
  }
}
