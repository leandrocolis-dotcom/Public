// Vercel Function: histórico diário (1 ano) do Yahoo Finance para os ativos da carteira do usuário.
// GET /api/history?symbols=AAA,BBB[&range=1y|2y|5y|10y][&vol=1] -> { fetched_at, series: { SÍMBOLO: { dates, close, name[, vol] } }, missing, errors }
// vol=1 inclui o volume diário (Fluxo Onshore: volume relativo e liquidez dos blocos do mapa).
// Até 40 símbolos validados por formato. Cache de 1 h na borda (o preço do dia vem de /api/quotes).
import { SYMBOL_RE } from "./quotes.js";
import { httpFetch, memo } from "./_http.js";
import {
  activeContract,
  isEveningFutBar,
  isFutMeta,
  rollHistory,
  rootOf,
} from "../assets/futures.js";

const MAX = 40;

export function parseSymbols(raw) {
  return [
    ...new Set(
      String(raw ?? "")
        .toUpperCase()
        .split(",")
        .map((x) => x.trim())
        .filter((x) => SYMBOL_RE.test(x.replace(/^\^/, ""))), // índices (^GSPC) também
    ),
  ].slice(0, MAX);
}

/** Converte a resposta do endpoint chart do Yahoo em { dates, close, name[, vol] } (descarta pregões sem fechamento). */
export function parseChart(json, { vol: withVol = false } = {}) {
  const r = json?.chart?.result?.[0];
  const ts = r?.timestamp ?? [];
  const close = r?.indicators?.adjclose?.[0]?.adjclose ?? r?.indicators?.quote?.[0]?.close ?? [];
  const tz = r?.meta?.exchangeTimezoneName ?? "America/New_York";
  const fmt = new Intl.DateTimeFormat("en-CA", { timeZone: tz });
  const fut = isFutMeta(r?.meta);
  const volume = r?.indicators?.quote?.[0]?.volume ?? [];
  const dates = [];
  const out = [];
  const vol = [];
  ts.forEach((t, i) => {
    if (i === ts.length - 1 && isEveningFutBar(t, tz, fut)) return; // sessão da noite = pregão de amanhã (ver assets/futures.js)
    if (typeof close[i] === "number" && close[i] > 0) {
      dates.push(fmt.format(new Date(t * 1000)));
      out.push(Math.round(close[i] * 10000) / 10000);
      vol.push(volume[i] > 0 ? volume[i] : 0);
    }
  });
  const name = r?.meta?.longName ?? r?.meta?.shortName ?? null;
  return withVol ? { dates, close: out, name, vol } : { dates, close: out, name };
}

export const RANGES = new Set(["1y", "2y", "5y", "10y"]);

function fetchOne(sym, range = "1y") {
  return memo(`hist:${sym}:${range}`, 30 * 60_000, () => fetchOneRaw(sym, range));
}

async function fetchOneRaw(sym, range) {
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(sym)}?range=${range}&interval=1d`;
  return httpFetch(url, {}, async (r) => {
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    const parsed = parseChart(await r.json(), { vol: true });
    if (parsed.close.length < 20) throw new Error("histórico vazio");
    return parsed;
  });
}

/** Futuro contínuo (XX=F): histórico do contrato vigente, completado para trás pelo contínuo (assets/futures.js). */
export async function fetchSeries(sym, range = "1y") {
  const c = rootOf(sym) && activeContract(sym);
  if (!c) return fetchOne(sym, range);
  const [a, b] = await Promise.allSettled([fetchOne(sym, range), fetchOne(c.sym, range)]);
  const cont = a.status === "fulfilled" ? a.value : null;
  const k = b.status === "fulfilled" ? b.value : null;
  if (!k) {
    if (cont) return cont;
    throw a.reason;
  }
  return { ...rollHistory(cont, k, c), name: cont?.name ?? k.name };
}

export default async function handler(req, res) {
  const qs = new URL(req.url, "http://x").searchParams;
  const symbols = parseSymbols(qs.get("symbols"));
  const range = RANGES.has(qs.get("range")) ? qs.get("range") : "1y";
  const withVol = qs.get("vol") === "1";
  if (!symbols.length) {
    res.setHeader("Cache-Control", "no-store");
    return res.status(400).json({ error: "informe ?symbols=AAA,BBB" });
  }
  const results = await Promise.allSettled(symbols.map((s) => fetchSeries(s, range)));
  const series = {};
  const errors = [];
  results.forEach((r, i) => {
    if (r.status !== "fulfilled")
      return void errors.push(`${symbols[i]}: ${r.reason?.message ?? r.reason}`);
    const { vol, ...rest } = r.value;
    series[symbols[i]] = withVol && vol?.length === rest.close.length ? { ...rest, vol } : rest;
  });
  const ok = Object.keys(series).length > 0;
  res.setHeader(
    "Cache-Control",
    ok ? "public, s-maxage=3600, stale-while-revalidate=7200" : "no-store",
  );
  res.status(ok ? 200 : 502).json({
    fetched_at: new Date().toISOString(),
    series,
    missing: symbols.filter((s) => !series[s]),
    errors,
  });
}
