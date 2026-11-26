// Dados do caminho do Fed (Mercados › Offshore › Juros › 🏦 Fed). Arquivo com "_" não vira rota: servido por
// GET /api/yields?fed=1[&debug=1]. Fontes gratuitas, sem chave:
// - futuros de Fed Funds (ZQ, CBOT) no Yahoo, um contrato por mês, 18 meses, fechamentos de 6 meses;
// - EFFR (taxa efetiva) e banda-alvo: Fed de Nova York;
// - datas do FOMC: página de calendário do Fed (reserva: FOMC_FALLBACK).
// Contas em assets/fed.js (puro).
import { httpFetch, memo } from "./_http.js";
import { FOMC_FALLBACK, monthsAhead, parseFomc, zqSymbol } from "../assets/fed.js";

const EFFR_URL = "https://markets.newyorkfed.org/api/rates/unsecured/effr/last/1.json";
export const FOMC_URL = "https://www.federalreserve.gov/monetarypolicy/fomccalendars.htm";
const chartUrl = (sym) =>
  `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(sym)}?range=6mo&interval=1d`;

const get = (url, deadline, kind = "json") =>
  httpFetch(
    url,
    {
      timeout: 10000,
      deadline,
      headers: { Accept: kind === "json" ? "application/json" : "text/html" },
    },
    async (r) => {
      // prettier-ignore
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      return kind === "json" ? r.json() : r.text();
    },
  );

const isoNy = (sec) => new Date(sec * 1000 - 5 * 3600e3).toISOString().slice(0, 10);

/** Resposta do chart do Yahoo -> { p, pc, at, h: [[data, fechamento]] } ou null. */
export function parseZq(j) {
  const r = j?.chart?.result?.[0];
  if (!r) return null;
  const ts = r.timestamp ?? [];
  const cl = r.indicators?.quote?.[0]?.close ?? [];
  const h = ts.map((t, i) => [isoNy(t), cl[i]]).filter(([, c]) => c > 50 && c <= 100);
  const p = Number(r.meta?.regularMarketPrice);
  if (!(p > 50 && p <= 100) && !h.length) return null;
  const last = h.at(-1);
  const pc = last && last[0] === isoNy(r.meta?.regularMarketTime ?? 0) ? h.at(-2)?.[1] : last?.[1];
  return { p: p > 50 ? p : last[1], pc: pc ?? null, at: r.meta?.regularMarketTime ?? null, h };
}

/** EFFR do Fed de NY -> { rate, date, lo, hi }. */
export function parseEffr(j) {
  const r = j?.refRates?.[0];
  const rate = Number(r?.percentRate);
  return Number.isFinite(rate)
    ? {
        rate,
        date: r.effectiveDate,
        lo: Number(r.targetRateFrom) || null,
        hi: Number(r.targetRateTo) || null,
      }
    : null;
}

export async function fetchFed(deadline = null) {
  const today = new Date(Date.now() - 5 * 3600e3).toISOString().slice(0, 10);
  const yms = monthsAhead(today, 18);
  const errors = [];
  const [effr, fomc, ...zq] = await Promise.all([
    memo("effr", 3600e3, () => get(EFFR_URL, deadline).then(parseEffr)).catch((e) => (errors.push(`EFFR: ${e.message}`), null)), // prettier-ignore
    memo("fomc", 86400e3, () => get(FOMC_URL, deadline, "text").then(parseFomc)).catch((e) => (errors.push(`FOMC: ${e.message}`), [])), // prettier-ignore
    ...yms.map(
      (ym) =>
      memo(`zq:${ym}`, 5 * 60e3, () => get(chartUrl(zqSymbol(ym)), deadline).then(parseZq)).catch(() => null), // prettier-ignore
    ),
  ]);
  const contracts = yms
    .map((ym, i) => (zq[i] ? { ym, sym: zqSymbol(ym), ...zq[i] } : null))
    .filter(Boolean);
  if (contracts.length < 3) throw new Error("Yahoo sem futuros de Fed Funds");
  const meetings = fomc?.length >= 4 ? fomc : FOMC_FALLBACK;
  if (!(fomc?.length >= 4))
    errors.push("FOMC: calendário do Fed indisponível, usando a lista guardada");
  return {
    fetched_at: new Date().toISOString(),
    today,
    effr,
    meetings,
    contracts,
    missing: yms.filter((ym) => !contracts.some((c) => c.ym === ym)),
    source: "CME/CBOT futuros de Fed Funds (Yahoo) + EFFR do Fed de NY + calendário do FOMC",
    errors,
  };
}

/** Diagnóstico (?fed=1&debug=1): começo das respostas brutas. */
export async function peekFed(deadline = null) {
  const today = new Date().toISOString().slice(0, 10);
  const sym = zqSymbol(monthsAhead(today, 2)[1]);
  const [a, b, c] = await Promise.allSettled([
    get(EFFR_URL, deadline, "text"),
    get(FOMC_URL, deadline, "text"),
    httpFetch(
      chartUrl(sym),
      { timeout: 10000, deadline, headers: { Accept: "application/json" } },
      (r) => r.text(),
    ),
  ]);
  const show = (r) =>
    r.status === "fulfilled" ? r.value.slice(0, 1500) : `erro: ${r.reason?.message}`;
  const fomcIdx = b.status === "fulfilled" ? b.value.indexOf("fomc-meeting__month") : -1;
  return {
    effr: show(a),
    fomc:
      b.status === "fulfilled"
        ? b.value.slice(Math.max(0, fomcIdx - 300), fomcIdx + 1500)
        : show(b),
    fomcParsed: b.status === "fulfilled" ? parseFomc(b.value) : [],
    zq: { sym, head: show(c) },
  };
}
