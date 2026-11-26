// Caminho do Fed implícito nos futuros de Fed Funds (puro, sem DOM). Mercados › Offshore › Juros › 🏦 Fed.
// Cada contrato ZQ liquida em 100 − média da taxa efetiva (EFFR) do mês. Do preço sai o juro médio esperado de cada
// mês e, com as datas do FOMC, o juro esperado depois de cada reunião (método do CME FedWatch, sem probabilidade
// de dois movimentos). Dados: GET /api/yields?fed=1 (api/_fed.js). Ver docs/FED.md.

export const MONTH_CODES = "FGHJKMNQUVXZ";
const DAY = 86400000;

/** "2026-12" -> "ZQZ26.CBT". */
export const zqSymbol = (ym) => {
  const [y, m] = ym.split("-").map(Number);
  return `ZQ${MONTH_CODES[m - 1]}${String(y % 100).padStart(2, "0")}.CBT`;
};

/** Meses (AAAA-MM) do mês de `today` até `n` meses à frente. */
export function monthsAhead(today, n = 18) {
  const [y, m] = today.slice(0, 7).split("-").map(Number);
  return Array.from({ length: n }, (_, k) => {
    const d = new Date(Date.UTC(y, m - 1 + k, 1));
    return d.toISOString().slice(0, 7);
  });
}

const daysIn = (ym) => {
  const [y, m] = ym.split("-").map(Number);
  return new Date(Date.UTC(y, m, 0)).getUTCDate();
};

/** Preço do contrato na data (último fechamento ≤ data); sem data = preço atual. */
export function priceAt(c, date = null) {
  if (!date) return c?.p > 0 ? c.p : null;
  const h = (c?.h ?? []).filter(([d]) => d <= date);
  return h.length ? h.at(-1)[1] : null;
}

/**
 * Juro implícito por mês: [{ ym, t (anos desde o mês de `today`), y (% a.a.) }].
 * Na data passada, só os meses a partir do mês daquela data (os anteriores já tinham taxa conhecida).
 */
export function monthlyPath(contracts, today, date = null) {
  const base = today.slice(0, 7);
  const [by, bm] = base.split("-").map(Number);
  const from = (date ?? today).slice(0, 7);
  return (contracts ?? [])
    .filter((c) => c.ym >= from)
    .map((c) => {
      const px = priceAt(c, date);
      const [y, m] = c.ym.split("-").map(Number);
      return px ? { ym: c.ym, t: ((y - by) * 12 + (m - bm)) / 12, y: Math.round((100 - px) * 1000) / 1000 } : null; // prettier-ignore
    })
    .filter(Boolean)
    .sort((a, b) => (a.ym < b.ym ? -1 : 1));
}

/**
 * Juro esperado depois de cada reunião do FOMC (decisão no dia `d`, AAAA-MM-DD).
 * Antes da reunião: o juro que vem da reunião anterior (na primeira: EFFR atual). Depois: o mês seguinte sem reunião,
 * se houver (mais limpo); senão, sai da média do mês: média = (dia/N)·antes + (1 − dia/N)·depois.
 * -> [{ date, before, after, move (bp), cum (bp desde a EFFR), cuts (n.º de cortes de 25 bp acumulados), prob }].
 */
export function meetingPath(path, meetings, effr, from = null) {
  const byYm = Object.fromEntries((path ?? []).map((p) => [p.ym, p.y]));
  const mtgYm = new Set((meetings ?? []).map((d) => d.slice(0, 7)));
  const out = [];
  let before = effr;
  for (const d of [...(meetings ?? [])].sort()) {
    if (from && d < from) continue;
    const ym = d.slice(0, 7);
    if (byYm[ym] == null || !Number.isFinite(before)) break;
    const [y, m] = ym.split("-").map(Number);
    const next = new Date(Date.UTC(y, m, 1)).toISOString().slice(0, 7);
    const N = daysIn(ym);
    const day = Number(d.slice(8, 10));
    const w = day / N; // fração do mês com a taxa antiga (a nova vale do dia seguinte à decisão)
    const after =
      !mtgYm.has(next) && byYm[next] != null
        ? byYm[next]
        : w < 0.97
          ? (byYm[ym] - w * before) / (1 - w)
          : (byYm[next] ?? byYm[ym]);
    const move = Math.round((after - before) * 100) || 0;
    const cum = Math.round((after - effr) * 100) || 0;
    const step = Math.abs(after - before) / 0.25;
    out.push({
      date: d,
      before: Math.round(before * 1000) / 1000,
      after: Math.round(after * 1000) / 1000,
      move,
      cum,
      cuts: Math.round((-cum / 25) * 10) / 10 || 0,
      // chance de um movimento de 25 bp na direção do preço (o resto = manter); acima de 100% = parte de um de 50 bp
      prob: Math.round(Math.min(step, 2) * 100),
      dir: move < -0.5 ? "corte" : move > 0.5 ? "alta" : "manter",
    });
    before = after;
  }
  return out;
}

/** Leitura curta para a métrica do topo: cortes acumulados até o fim do próximo ano. */
export function pathSummary(mp, today) {
  if (!mp?.length) return null;
  const y = Number(today.slice(0, 4));
  const pick = (yr) => [...mp].reverse().find((x) => Number(x.date.slice(0, 4)) <= yr) ?? null;
  return { next: mp[0], endYear: pick(y), endNext: pick(y + 1), last: mp.at(-1) };
}

/** Dias até a data (para "em 21 dias"). */
export const daysUntil = (d, today) =>
  Math.round((Date.parse(`${d}T12:00:00Z`) - Date.parse(`${today}T12:00:00Z`)) / DAY);

const MONTHS = ["january", "february", "march", "april", "may", "june", "july", "august", "september", "october", "november", "december"]; // prettier-ignore

/**
 * Página de calendário do FOMC (federalreserve.gov) -> datas de decisão (AAAA-MM-DD), ignorando votos por notação.
 * Cada ano vem num bloco "AAAA FOMC Meetings"; mês "Apr/May" com dia "30-1" decide no mês seguinte.
 */
export function parseFomc(html) {
  const s = String(html);
  const out = [];
  const blocks = s.split(/(\d{4}) FOMC Meetings/);
  for (let i = 1; i + 1 < blocks.length; i += 2) {
    const year = Number(blocks[i]);
    const body = blocks[i + 1];
    const re = /fomc-meeting__month[^>]*>\s*(?:<[^>]+>\s*)*([A-Za-z/]+)\s*(?:<[^>]+>\s*)*<\/div>\s*<div[^>]*fomc-meeting__date[^>]*>\s*([^<]*)/g; // prettier-ignore
    for (let m = re.exec(body); m; m = re.exec(body)) {
      const txt = m[2].trim();
      if (/notation|unscheduled|conference call/i.test(txt)) continue;
      const days = txt.match(/\d{1,2}/g);
      if (!days) continue;
      const mons = m[1].toLowerCase().split("/");
      const last = mons.at(-1);
      const mi = MONTHS.findIndex((x) => x.startsWith(last.slice(0, 3)));
      if (mi < 0) continue;
      out.push(`${year}-${String(mi + 1).padStart(2, "0")}-${days.at(-1).padStart(2, "0")}`);
    }
  }
  return [...new Set(out)].sort();
}

/** Datas de decisão do FOMC conhecidas (reserva quando o site do Fed não responde). */
export const FOMC_FALLBACK = ["2026-01-28", "2026-03-18", "2026-04-29", "2026-06-17", "2026-07-29", "2026-09-16", "2026-10-28", "2026-12-09"]; // prettier-ignore
