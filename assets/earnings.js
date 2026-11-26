// Balanços das empresas de tecnologia por subtema (Mercados › Offshore › Agenda › 💻 Balanços tech).
// Puro, sem DOM: universo, leitura das respostas da Nasdaq, estatísticas de preço em volta do balanço,
// filtros e ordenação. Dados gravados em data/earnings.json por scripts/update-earnings.mjs.
import { FLOW_ASSETS } from "./flow-universe.js";
import { THEME_NAMES } from "./theme-names.js";

/** Big Techs que não aparecem nas linhas do grupo "IA: subtemas". */
const EXTRA_THEMES = [{ id: "BIGTECH", label: "Big Tech", syms: ["AAPL", "MSFT", "GOOGL", "AMZN", "META", "NFLX", "TSLA"] }]; // prettier-ignore

/** Subtemas: linhas do grupo "IA: subtemas" do Fluxo (fonte única) + Big Tech. */
export const EARN_THEMES = [
  ...FLOW_ASSETS.filter((a) => a.group === "ai").map((a) => ({ id: a.sym, label: a.label, syms: THEME_NAMES[a.sym] ?? [] })), // prettier-ignore
  ...EXTRA_THEMES,
];

/** Empresas do acompanhamento: { sym, themes: [rótulos] }. ETFs saem depois, por não terem balanço. */
export function earningsUniverse(themes = EARN_THEMES) {
  const map = new Map();
  for (const t of themes)
    for (const raw of t.syms) {
      const sym = raw.replace(/^-/, "");
      if (!map.has(sym)) map.set(sym, new Set());
      map.get(sym).add(t.label);
    }
  return [...map].map(([sym, set]) => ({ sym, themes: [...set] }));
}

const num = (v) => {
  if (v == null || v === "" || v === "N/A") return null;
  const n = Number(
    String(v)
      .replace(/[$,%\s]/g, "")
      .replace(/^\((.*)\)$/, "-$1"),
  );
  return Number.isFinite(n) ? n : null;
};

/** "8/26/2026" ou "08/26/2026" -> "2026-08-26". */
export function usDate(s) {
  const m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(String(s ?? "").trim());
  return m ? `${m[3]}-${m[1].padStart(2, "0")}-${m[2].padStart(2, "0")}` : null;
}

const TIME = { "time-pre-market": "pre", "time-after-hours": "post" };

/** Linhas do calendário de resultados da Nasdaq de um dia -> { sym, date, time, eps, ests, lastEps, lastDate, fiscal, name, mcap }. */
export function parseCalendarRows(rows, date) {
  return (rows ?? [])
    .filter((r) => r?.symbol)
    .map((r) => ({
      sym: String(r.symbol).toUpperCase().replace(/\//g, "-"),
      date,
      time: TIME[r.time] ?? "na",
      eps: num(r.epsForecast),
      ests: num(r.noOfEsts),
      lastEps: num(r.lastYearEPS),
      lastDate: usDate(r.lastYearRptDt),
      fiscal: r.fiscalQuarterEnding ? String(r.fiscalQuarterEnding).replace("/", " ") : null,
      name: r.name ?? null,
      mcap: num(r.marketCap),
    }));
}

/** earnings-surprise da Nasdaq -> resultados divulgados, do mais antigo ao mais recente. */
export function parseSurprise(json) {
  const rows = json?.data?.earningsSurpriseTable?.rows ?? [];
  return rows
    .map((r) => ({
      fiscal: r.fiscalQtrEnd ?? null,
      date: usDate(r.dateReported),
      eps: num(r.eps),
      consensus: num(r.consensusForecast),
      surprisePct: num(r.percentageSurprise),
    }))
    .filter((r) => r.date)
    .sort((a, b) => (a.date < b.date ? -1 : 1));
}

/** earnings-forecast da Nasdaq -> trimestres à frente [{ fiscal, eps, high, low, ests, up, down }] (o 1º é o próximo). */
export function parseForecast(json) {
  return (json?.data?.quarterlyForecast?.rows ?? []).map((r) => ({
    fiscal: r.fiscalEnd ?? null,
    eps: num(r.consensusEPSForecast),
    high: num(r.highEPSForecast),
    low: num(r.lowEPSForecast),
    ests: num(r.noOfEstimates),
    up: num(r.up) ?? 0,
    down: num(r.down) ?? 0,
  }));
}

/** "Sep/2026", "Sep 2026" -> "Sep 2026". */
const fiscalKey = (f) =>
  String(f ?? "")
    .replace("/", " ")
    .trim();

const DAY = 86400000;
const addDays = (iso, n) => new Date(Date.parse(`${iso}T12:00:00Z`) + n * DAY).toISOString().slice(0, 10); // prettier-ignore

/**
 * Preço em volta de um balanço (barras diárias { date, c } em ordem):
 * - run: variação nos `pre` pregões antes do último fechamento anterior à divulgação (a "corrida" de quem antecipa);
 * - react: do último fechamento antes da divulgação ao primeiro fechamento depois dela.
 * Divulgação "pre" (antes da abertura) reage no próprio dia; "post"/desconhecida, no pregão seguinte.
 */
export function priceAround(bars, date, time = "post", pre = 10) {
  if (!bars?.length || !date) return null;
  // índice do último fechamento ANTES de a notícia sair
  let i = -1;
  for (let k = 0; k < bars.length; k++) {
    const d = bars[k].date;
    if (time === "pre" ? d < date : d <= date) i = k;
    else break;
  }
  if (i < pre || i + 1 >= bars.length) return null;
  const base = bars[i].c;
  return { run: base / bars[i - pre].c - 1, react: bars[i + 1].c / base - 1 };
}

const avg = (xs) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);

/** Crescimento do LPA esperado contra o mesmo trimestre do ano anterior; só com base positiva e não minúscula. */
export const epsGrowth = (eps, lastEps) => (eps != null && lastEps != null && lastEps >= 0.05 ? (eps - lastEps) / lastEps : null); // prettier-ignore

/**
 * Junta tudo por empresa. `cal` = próxima data no calendário da Nasdaq (confirmada); `recent` = divulgação das
 * últimas semanas no calendário (entra como "números a confirmar" enquanto o histórico de surpresas não traz).
 * Sem `cal`, a próxima data é a última divulgação + 91 dias (estimada). Estatísticas com preço na base.
 */
export function buildCompany({
  sym,
  themes,
  cal = null,
  recent = null,
  forecast: quarters = [],
  surprise = [],
  bars = null,
  name = null,
  today = null,
}) {
  const time = cal?.time ?? recent?.time ?? "post";
  const rows = [...surprise];
  if (recent && !rows.some((r) => Math.abs(daysUntil(r.date, recent.date)) <= 3))
    rows.push({ fiscal: recent.fiscal, date: recent.date, eps: null, consensus: recent.eps, surprisePct: null, pending: true }); // prettier-ignore
  rows.sort((a, b) => (a.date < b.date ? -1 : 1));
  const past = rows.map((s) => ({ ...s, ...(priceAround(bars, s.date, time) ?? {}) }));
  // a previsão da Nasdaq demora a virar o trimestre: pula o que já foi divulgado (ou o que o calendário confirma)
  const done = new Set(past.map((p) => fiscalKey(p.fiscal)));
  const forecast =
    (cal?.fiscal && (quarters ?? []).find((q) => fiscalKey(q.fiscal) === fiscalKey(cal.fiscal))) ||
    (quarters ?? []).find((q) => !done.has(fiscalKey(q.fiscal))) ||
    null;
  const last = past.at(-1) ?? null;
  let nextDate = cal?.date ?? (last ? addDays(last.date, 91) : null);
  if (!cal && nextDate && today) while (nextDate < today) nextDate = addDays(nextDate, 91);
  // depois de uma divulgação recente, a previsão da Nasdaq já é do trimestre seguinte; o consenso do calendário vale para a data confirmada
  const eps = cal?.eps ?? forecast?.eps ?? null;
  // LPA do mesmo trimestre um ano antes: do calendário ou do histórico de surpresas ("Dec 2026" -> "Dec 2025")
  const fq = fiscalKey(cal?.fiscal ?? forecast?.fiscal);
  const yearAgo = /^(\w{3}) (\d{4})$/.test(fq)
    ? fq.replace(/\d{4}$/, (y) => String(Number(y) - 1))
    : null;
  const lastEps =
    cal?.lastEps ?? past.find((p) => yearAgo && fiscalKey(p.fiscal) === yearAgo)?.eps ?? null;
  const yoy = epsGrowth(eps, lastEps);
  // "bateu" compara o LPA com o consenso direto: o % da Nasdaq inverte o sinal quando o consenso é prejuízo
  const surp = past.filter((p) => p.eps != null && p.consensus != null);
  const surpPct = past.filter(
    (p) => p.surprisePct != null && p.consensus != null && p.consensus >= 0.1,
  );
  const runs = past.filter((p) => p.run != null);
  return {
    sym,
    name: cal?.name ?? recent?.name ?? name ?? null,
    themes,
    next: nextDate
      ? {
          date: nextDate,
          estimated: !cal,
          time: cal?.time ?? (recent ? recent.time : "na"),
          fiscal: cal?.fiscal ?? forecast?.fiscal ?? null,
          eps,
          high: forecast?.high ?? null,
          low: forecast?.low ?? null,
          ests: cal?.ests ?? forecast?.ests ?? null,
          up: forecast?.up ?? 0,
          down: forecast?.down ?? 0,
          lastEps,
          yoy,
        }
      : null,
    mcap: cal?.mcap ?? recent?.mcap ?? null,
    past,
    stats: {
      beats: surp.filter((p) => p.eps > p.consensus).length,
      n: surp.length,
      avgSurprise: avg(surpPct.map((p) => Math.max(-100, Math.min(100, p.surprisePct)))), // cada trimestre limitado a ±100%
      avgRun: avg(runs.map((p) => p.run)),
      runUp: runs.filter((p) => p.run > 0).length,
      nRun: runs.length,
      avgReact: avg(runs.map((p) => p.react)),
    },
  };
}

/** Dias corridos de `today` (AAAA-MM-DD) até `date`. */
export const daysUntil = (date, today) => Math.round((Date.parse(`${date}T12:00:00Z`) - Date.parse(`${today}T12:00:00Z`)) / DAY); // prettier-ignore

/** Leitura simples para quem quer antecipar (educacional): combina revisões, histórico de surpresa e corrida pré-balanço. */
export function setupOf(c) {
  const s = c.stats;
  const net = (c.next?.up ?? 0) - (c.next?.down ?? 0);
  let pts = 0;
  if (net > 0) pts++;
  if (net < 0) pts--;
  if (s.n >= 3 && s.beats === s.n) pts++;
  if (s.n >= 3 && s.beats <= s.n / 2) pts--;
  if (s.nRun >= 3 && s.runUp >= s.nRun - 1 && s.avgRun > 0) pts++;
  if (s.nRun >= 3 && s.avgRun != null && s.avgRun < 0) pts--;
  return pts >= 2 ? "forte" : pts <= -1 ? "fraco" : "neutro";
}

export const SORTS = {
  date: { label: "Data", key: (c) => c.next?.date ?? "9999" },
  run: { label: "Corrida pré", key: (c) => -(c.stats.avgRun ?? -9) },
  surprise: { label: "Surpresa média", key: (c) => -(c.stats.avgSurprise ?? -999) },
  revisions: { label: "Revisões", key: (c) => -((c.next?.up ?? 0) - (c.next?.down ?? 0)) },
  growth: { label: "Cresc. LPA", key: (c) => -(c.next?.yoy ?? -99) },
  mcap: { label: "Valor de mercado", key: (c) => -(c.mcap ?? 0) },
};

/**
 * Filtra e ordena para a tela. `win` = dias à frente ("7", "14", "30", "90", "all"); `theme` = rótulo ou "all";
 * `setup` = "all" | "forte"; `held` = Set de tickers da carteira (filtro "carteira").
 * Devolve { soon: próximos 7 dias (destaque), upcoming: o resto da janela, past: divulgações dos últimos `pastDays`, em ordem cronológica }.
 */
export function earningsView(
  companies,
  {
    today,
    theme = "all",
    win = "30",
    sort = "date",
    setup = "all",
    only = "all",
    held = new Set(),
    pastDays = 45,
  } = {},
) {
  const pass = (c) =>
    (theme === "all" || c.themes.includes(theme)) &&
    (setup === "all" || setupOf(c) === setup) &&
    (only === "all" || held.has(c.sym));
  const list = companies.filter(pass);
  const max = win === "all" ? Infinity : Number(win);
  const sorter = SORTS[sort] ?? SORTS.date;
  const cmp = (a, b) => {
    const ka = sorter.key(a);
    const kb = sorter.key(b);
    return ka < kb ? -1 : ka > kb ? 1 : (a.next?.date ?? "").localeCompare(b.next?.date ?? "");
  };
  const ahead = list
    .filter(
      (c) => c.next && daysUntil(c.next.date, today) >= 0 && daysUntil(c.next.date, today) <= max,
    )
    .sort(cmp);
  const past = list
    .flatMap((c) =>
      c.past
        .filter((p) => daysUntil(p.date, today) < 0 && daysUntil(p.date, today) >= -pastDays)
        .map((p) => ({ ...p, sym: c.sym, name: c.name, themes: c.themes })),
    ) // prettier-ignore
    .sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : a.sym.localeCompare(b.sym)));
  return {
    soon: ahead.filter((c) => daysUntil(c.next.date, today) <= 7),
    upcoming: ahead.filter((c) => daysUntil(c.next.date, today) > 7),
    past,
  };
}
