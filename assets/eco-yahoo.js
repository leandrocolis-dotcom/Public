// Valor divulgado no mesmo minuto (D0) pelo calendário econômico do Yahoo Finance. A Nasdaq traz a projeção, mas
// publica o valor com atraso (medido em 25/11/2026: o PCE das 8h30 de NY seguia vazio na Nasdaq 40 min depois e o
// Yahoo já tinha). Puro, para testar: normaliza as linhas do Yahoo e preenche o "atual" dos eventos da Nasdaq.
import { classifyEvent, num } from "./macro-alerts.js";

/** Região do Yahoo -> [moeda, sub-região] da agenda. */
export const YAHOO_REGIONS = { US: ["USD", null], EU: ["EUR", null], DE: ["EUR", "DE"], GB: ["GBP", null], JP: ["JPY", null] }; // prettier-ignore

/** Indicadores divulgados em % (o Yahoo manda só o número). */
const PCT = new Set(["rate", "pce", "cpi", "ppi", "gdp", "retail", "unemp", "ip"]);

/** "Core PCE Price Index MM *" -> "Core PCE Price Index m/m" (o formato que classifyEvent entende). */
export const yahooName = (s) =>
  String(s ?? "")
    .replace(/\*/g, "")
    .replace(/\bMM\b/g, "m/m")
    .replace(/\bYY\b/g, "y/y")
    .replace(/\bQQ\b/g, "q/q")
    .replace(/\s+/g, " ")
    .trim();

/** Resposta do Yahoo (finance.result.economicEvents) -> [{ t, cc, sub, id, name, actual, previous }] com valor. */
export function normalizeYahooEco(json) {
  const out = [];
  for (const day of json?.finance?.result?.economicEvents ?? [])
    for (const r of day?.records ?? []) {
      const reg = YAHOO_REGIONS[r?.countryCode];
      if (!reg || r.actual == null || r.actual === "") continue;
      const [cc, sub] = reg;
      const name = yahooName(r.event);
      const k = classifyEvent(cc, name, sub);
      if (!k) continue;
      const t = Math.round(r.eventTime / 1000);
      const pct = (v) => (v == null || v === "" ? null : PCT.has(k.id.split(":")[1]) && !/%$/.test(String(v)) ? `${v}%` : String(v)); // prettier-ignore
      out.push({ t, date: new Date(t * 1000).toISOString().slice(0, 10), cc, sub, ...k, name, actual: pct(r.actual), consensus: null, previous: pct(r.revisedFrom ?? r.prior), prior: r.prior ?? null, src: "yahoo" }); // prettier-ignore
    }
  return out;
}

const stem = (id) => String(id).split(":").slice(0, 3).join(":"); // região:base:núcleo
const per = (id) => String(id).split(":")[3] ?? "";
const same = (a, b) => a != null && b != null && num(a) != null && num(a) === num(b);

/**
 * Eventos da Nasdaq sem valor ganham o do Yahoo: mesmo indicador (região, base e núcleo), até 15 min de diferença,
 * mesmo período quando os dois dizem, e o anterior igual quando sobra mais de um candidato. Ambíguo: fica sem.
 * O valor herda o "%" da projeção/anterior da Nasdaq. Marca `src: "yahoo"`.
 */
export function fillFromYahoo(events, yahoo) {
  if (!yahoo?.length) return events ?? [];
  const used = new Set();
  const filled = (events ?? []).map((e) => {
    // eventos da Nasdaq que já cobrem um dado do Yahoo (mesmo indicador e horário): o Yahoo não vira linha extra
    for (const y of yahoo) if (e.t != null && stem(y.id) === stem(e.id) && Math.abs(y.t - e.t) <= 900) used.add(y); // prettier-ignore
    if (e.actual || e.t == null) return e;
    let c = yahoo.filter((y) => stem(y.id) === stem(e.id) && Math.abs(y.t - e.t) <= 900);
    if (per(e.id)) c = c.filter((y) => !per(y.id) || per(y.id) === per(e.id));
    if (c.length > 1 && e.previous != null) {
      const p = c.filter((y) => same(y.prior, e.previous) || same(y.previous, e.previous));
      if (p.length) c = p;
    }
    const vals = [...new Set(c.map((y) => y.actual))];
    if (vals.length !== 1) return e;
    const pctRef = /%\s*$/.test(String(e.consensus ?? e.previous ?? ""));
    const actual = pctRef && !/%$/.test(vals[0]) ? `${vals[0]}%` : vals[0];
    return { ...e, actual, src: "yahoo" };
  });
  // a Nasdaq às vezes não devolve o dia ("No record found"): o dado do Yahoo entra sozinho
  return [
    ...filled,
    ...yahoo
      .filter((y) => !used.has(y))
      .map((y) => Object.fromEntries(Object.entries(y).filter(([k]) => k !== "prior"))),
  ];
}

/**
 * Projeção que falta (dado vindo só do Yahoo, ou linha da Nasdaq sem consenso) pela agenda Forex Factory
 * ({ t, cc, title, forecast, previous }): mesmo indicador, até 15 min, mesmo período ou o anterior igual.
 */
export function fillConsensus(events, ff) {
  if (!ff?.length) return events;
  const keyed = ff
    .filter((f) => f.forecast != null && f.forecast !== "")
    .map((f) => ({ f, k: classifyEvent(f.cc, f.title, /^german/i.test(f.title) ? "DE" : null) }))
    .filter((x) => x.k);
  return events.map((e) => {
    if (e.consensus != null || e.t == null) return e;
    // período diferente (m/m × a/a) nunca casa; sem período de um lado, vale o anterior igual ou o único candidato
    const c = keyed.filter(({ f, k }) => stem(k.id) === stem(e.id) && Math.abs(f.t - e.t) <= 900 && (!per(k.id) || !per(e.id) || per(k.id) === per(e.id))); // prettier-ignore
    const hit =
      (per(e.id) && c.find(({ k }) => per(k.id) === per(e.id))) ||
      c.find(({ f }) => same(f.previous, e.previous)) ||
      (c.length === 1 && per(e.id) && per(c[0].k.id) === per(e.id) ? c[0] : null);
    return hit ? { ...e, consensus: hit.f.forecast } : e;
  });
}
