// Vercel Function: barras de 5 min dos últimos 5 pregões de UM ativo do universo (Yahoo Finance, gratuito).
// GET /api/intraday?symbol=SPY -> { symbol, fetched_at, market_state, gmtoffset, bars: { t, o, h, l, c, v } }
// ?leaders=1 -> Candidatos a liderança (api/_leaders.js).
// ?prepost=1 inclui pré (4:00–9:30) e pós-mercado (16:00–20:00) com bars.s = "pre" | "reg" | "post".
// Aceita ticker válido (mesma regra de /api/history; não é um proxy aberto). t em segundos Unix.
// Futuro contínuo (XX=F): barras do contrato VIGENTE, o mesmo que /api/quotes usa (campo fut), para o gráfico
// ter o mesmo preço das tabelas. Pré/pós só existe em ações e ETFs: futuros, moedas, índices e cripto = "reg".
import { ASSETS } from "../assets/universe.js";
import { deadlineIn, httpFetch } from "./_http.js";
import { SYMBOL_RE } from "./quotes.js";
import { activeContract, rootOf } from "../assets/futures.js";
import { sessionInfo } from "../assets/sessions.js";

export const ALLOWED = new Set(Object.values(ASSETS).map((a) => a.yahoo));

/** Sessão da barra pelo horário local da bolsa: pré antes de 9:30, pós a partir de 16:00 (13:00 nos encurtados). */
export function sessionOf(t, gmt) {
  const local = t + (gmt ?? 0);
  const m = Math.floor((((local % 86400) + 86400) % 86400) / 60);
  const day = sessionInfo(new Date(local * 1000).toISOString().slice(0, 10));
  return m < 570 ? "pre" : m >= (day.open ? day.closeMin : 960) ? "post" : "reg";
}

/** Resposta do Yahoo (v8/chart) -> barras sem buracos (descarta barras sem preço). */
export function parseChart(json, prepost = false) {
  const r = json?.chart?.result?.[0];
  const q = r?.indicators?.quote?.[0];
  if (!r || !q || !r.timestamp) return null;
  const bars = { t: [], o: [], h: [], l: [], c: [], v: [] };
  // pré/pós só em ações e ETFs (sem tipo informado: decide pelo símbolo)
  const it = r.meta?.instrumentType;
  const ext = it ? ["EQUITY", "ETF", "MUTUALFUND"].includes(it) : !/[=^]|-USD$/.test(String(r.meta?.symbol ?? "")); // prettier-ignore
  r.timestamp.forEach((t, i) => {
    const o = q.open?.[i];
    const h = q.high?.[i];
    const l = q.low?.[i];
    const c = q.close?.[i];
    if (![o, h, l, c].every((x) => typeof x === "number" && Number.isFinite(x))) return;
    bars.t.push(t);
    bars.o.push(o);
    bars.h.push(h);
    bars.l.push(l);
    bars.c.push(c);
    bars.v.push(q.volume?.[i] ?? 0);
    if (prepost) (bars.s ??= []).push(ext ? sessionOf(t, r.meta?.gmtoffset) : "reg");
  });
  if (!bars.t.length) return null;
  return {
    symbol: r.meta?.symbol,
    market_state: r.meta?.marketState ?? null,
    gmtoffset: r.meta?.gmtoffset ?? null,
    prev_close: r.meta?.chartPreviousClose ?? null,
    bars,
  };
}

async function fetchSym(sym, prepost, range = "5d", interval = "5m", opts = {}) {
  const url =
    "https://query1.finance.yahoo.com/v8/finance/chart/" +
    encodeURIComponent(sym) +
    `?range=${range}&interval=${interval}&includePrePost=${prepost}`;
  return httpFetch(url, opts, async (r) => {
    if (!r.ok) throw new Error(`chart HTTP ${r.status}`);
    return parseChart(await r.json(), prepost);
  });
}

export async function fetchIntraday(
  symbol,
  prepost = false,
  range = "5d",
  interval = "5m",
  opts = {},
) {
  const c = rootOf(symbol) && activeContract(symbol, new Date());
  let out = null;
  let fut = null;
  if (c) {
    // contrato vigente (o mesmo das cotações); sem barras dele, fica o contínuo do Yahoo
    out = await fetchSym(c.sym, prepost, range, interval, opts).catch(() => null);
    if (out) fut = c.sym.split(".")[0];
  }
  out ??= await fetchSym(symbol, prepost, range, interval, opts);
  if (!out) throw new Error("sem barras");
  return { ...out, symbol, ...(fut ? { fut } : {}), fetched_at: new Date().toISOString(), source: "Yahoo Finance" }; // prettier-ignore
}

/**
 * Lote para a Rotação relativa intraday: ?symbols=A,B,...&win=short|long (até MAX_BATCH símbolos, com pré/pós).
 * short = 2 pregões em barras de 5 min (janelas 1h, 2h e Hoje, com a véspera para aquecer as médias);
 * long = 5 pregões em barras de 30 min (2 e 5 dias). Só fechamento, horário e sessão (resposta enxuta).
 */
export const MAX_BATCH = 40;
export const BATCH_WIN = { short: ["2d", "5m"], long: ["5d", "30m"] };
export function parseSymbols(raw) {
  const out = [];
  for (const s of String(raw ?? "").split(",")) {
    const v = s.trim();
    if (v && (ALLOWED.has(v) || SYMBOL_RE.test(v.replace(/^\^/, ""))) && !out.includes(v))
      out.push(v);
  }
  return out.slice(0, MAX_BATCH);
}
const r6 = (x) => Number(x.toPrecision(7));
export async function fetchBatch(symbols, win = "short") {
  const [range, interval] = BATCH_WIN[win] ?? BATCH_WIN.short;
  const deadline = deadlineIn(8500);
  const series = {};
  const missing = [];
  await Promise.all(
    symbols.map(async (sym) => {
      try {
        const o = await fetchIntraday(sym, true, range, interval, { timeout: 6000, deadline });
        const b = o.bars;
        series[sym] = { t: b.t, c: b.c.map(r6), s: b.s, g: o.gmtoffset ?? 0 };
      } catch {
        missing.push(sym);
      }
    }),
  );
  return { win, interval, fetched_at: new Date().toISOString(), series, missing };
}

export default async function handler(req, res) {
  const params = new URL(req.url, "http://x").searchParams;
  // Candidatos a liderança (api/_leaders.js): mesma função, para não passar do limite de 12 funções do plano
  if (params.has("leaders")) return (await import("./_leaders.js")).default(req, res);
  if (params.has("symbols")) {
    const syms = parseSymbols(params.get("symbols"));
    if (!syms.length) {
      res.setHeader("Cache-Control", "no-store");
      return res.status(400).json({ error: "nenhum símbolo válido" });
    }
    const out = await fetchBatch(syms, params.get("win") === "long" ? "long" : "short");
    const ok = Object.keys(out.series).length > 0;
    res.setHeader("Cache-Control", ok ? "public, s-maxage=60, stale-while-revalidate=120" : "no-store"); // prettier-ignore
    return res.status(ok ? 200 : 502).json(out);
  }
  const symbol = params.get("symbol") ?? "";
  if (!ALLOWED.has(symbol) && !SYMBOL_RE.test(symbol.replace(/^\^/, ""))) {
    res.setHeader("Cache-Control", "no-store");
    return res.status(400).json({ error: "símbolo inválido" });
  }
  try {
    const out = await fetchIntraday(symbol, params.get("prepost") === "1");
    // Cache na borda: no máximo 1 consulta por minuto por ativo, qualquer que seja o número de acessos.
    res.setHeader("Cache-Control", "public, s-maxage=60, stale-while-revalidate=120");
    res.status(200).json(out);
  } catch (e) {
    res.setHeader("Cache-Control", "no-store");
    res.status(502).json({ error: String(e?.message ?? e), fetched_at: new Date().toISOString() });
  }
}
