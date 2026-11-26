// Agenda econômica e de resultados (estilo Investing): normalização, tradução e risco de evento. Puro, para testar.

const IMPACT = { High: "high", Medium: "medium", Low: "low", Holiday: "holiday" };
export const IMPACT_PT = { high: "Alto", medium: "Médio", low: "Baixo", holiday: "Feriado" };
export const CC_PT = { USD: "EUA", EUR: "Zona do euro", GBP: "Reino Unido", JPY: "Japão", CNY: "China", CAD: "Canadá", AUD: "Austrália", NZD: "Nova Zelândia", CHF: "Suíça", BRL: "Brasil" }; // prettier-ignore

// Títulos mais comuns traduzidos (o resto fica no original).
const TITLE_PT = [
  [/^Non-Farm Employment Change/i, "Payroll (vagas fora do agro)"],
  [/^Unemployment Rate/i, "Taxa de desemprego"],
  [/^Unemployment Claims/i, "Pedidos de seguro-desemprego"],
  [/^Core CPI m\/m/i, "Inflação núcleo (CPI) m/m"],
  [/^CPI m\/m/i, "Inflação (CPI) m/m"],
  [/^CPI y\/y/i, "Inflação (CPI) a/a"],
  [/^Core CPI y\/y/i, "Inflação núcleo (CPI) a/a"],
  [/^Core PPI m\/m/i, "Preços ao produtor núcleo (PPI) m/m"],
  [/^PPI m\/m/i, "Preços ao produtor (PPI) m/m"],
  [/^Core PCE Price Index m\/m/i, "Inflação PCE núcleo m/m"],
  [/^Advance GDP q\/q|^GDP q\/q|^Prelim GDP q\/q|^Final GDP q\/q/i, "PIB t/t"],
  [/^Core Retail Sales m\/m/i, "Vendas no varejo núcleo m/m"],
  [/^Retail Sales m\/m/i, "Vendas no varejo m/m"],
  [/^ISM Manufacturing PMI/i, "ISM indústria"],
  [/^ISM Services PMI/i, "ISM serviços"],
  [/^Federal Funds Rate/i, "Decisão de juros do Fed"],
  [/^FOMC Statement/i, "Comunicado do FOMC"],
  [/^FOMC Press Conference/i, "Entrevista do presidente do Fed"],
  [/^FOMC Meeting Minutes/i, "Ata do FOMC"],
  [/^Fed Chair .* Speaks/i, "Fala do presidente do Fed"],
  [/^JOLTS Job Openings/i, "Vagas em aberto (JOLTS)"],
  [/^ADP Non-Farm Employment Change/i, "Emprego privado (ADP)"],
  [/^Prelim UoM Consumer Sentiment/i, "Confiança do consumidor (Michigan)"],
  [/^Crude Oil Inventories/i, "Estoques de petróleo"],
  [/^Main Refinancing Rate/i, "Decisão de juros do BCE"],
  [/^Official Bank Rate/i, "Decisão de juros do BoE"],
  [/^BOJ Policy Rate/i, "Decisão de juros do BoJ"],
  [/^Bank Holiday/i, "Feriado bancário"],
];

export const titlePT = (t) => TITLE_PT.find(([re]) => re.test(t))?.[1] ?? t;

/** Feed (formato faireconomy) -> eventos { t (s), cc, title, titlePT, impact, forecast, previous }. */
export function normalizeEvents(arr) {
  if (!Array.isArray(arr)) return [];
  return arr
    .map((e) => {
      const ms = Date.parse(e?.date);
      if (!Number.isFinite(ms) || !e.title) return null;
      return {
        t: Math.round(ms / 1000),
        cc: String(e.country ?? "").toUpperCase(),
        title: String(e.title),
        titlePT: titlePT(String(e.title)),
        impact: IMPACT[e.impact] ?? "low",
        forecast: e.forecast || null,
        previous: e.previous || null,
      };
    })
    .filter(Boolean)
    .sort((a, b) => a.t - b.t);
}

const RANK = { high: 3, medium: 2, low: 1, holiday: 0 };

/** Filtra por países e impacto mínimo ("high" | "medium" | "all"). */
export function filterEvents(events, { ccs = null, min = "all" } = {}) {
  const floor = min === "high" ? 3 : min === "medium" ? 2 : 0;
  return events.filter(
    (e) =>
      (!ccs || ccs.includes(e.cc)) &&
      (RANK[e.impact] >= floor || (floor === 0 && e.impact === "holiday")),
  );
}

/**
 * Eventos de alto impacto (EUA por padrão) que acontecem na janela [agora - depois, agora + antes].
 * Usado para avisar que sinais intradiários perdem confiabilidade perto da divulgação.
 */
export function eventRisk(events, now, { before = 2 * 3600, after = 30 * 60, ccs = ["USD"] } = {}) {
  return events
    .filter(
      (e) => e.impact === "high" && ccs.includes(e.cc) && e.t >= now - after && e.t <= now + before,
    )
    .map((e) => ({ ...e, inMin: Math.round((e.t - now) / 60) }));
}

const DAY_FMT = new Intl.DateTimeFormat("pt-BR", { timeZone: "America/Sao_Paulo", weekday: "long", day: "2-digit", month: "2-digit" }); // prettier-ignore
const KEY_FMT = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" });

/** Agrupa por dia no horário de Brasília. */
export function groupByDay(events) {
  const out = [];
  for (const e of events) {
    const key = KEY_FMT.format(new Date(e.t * 1000));
    let g = out.at(-1);
    if (!g || g.key !== key)
      out.push((g = { key, label: DAY_FMT.format(new Date(e.t * 1000)), items: [] }));
    g.items.push(e);
  }
  return out;
}

/** Resultados e dividendos (campos do Yahoo v7/quote) -> lista ordenada dos próximos 60 dias. */
export function corporateEvents(quotes, now, horizon = 60 * 86400) {
  const out = [];
  for (const q of quotes ?? []) {
    const t = q.earningsTimestampStart ?? q.earningsTimestamp;
    if (Number.isFinite(t) && t >= now - 86400 && t <= now + horizon)
      out.push({ sym: q.symbol, kind: "earnings", t, end: q.earningsTimestampEnd ?? null, estimated: !!q.isEarningsDateEstimate, name: q.shortName ?? null }); // prettier-ignore
    const d = q.dividendDate;
    if (Number.isFinite(d) && d >= now - 86400 && d <= now + horizon)
      out.push({ sym: q.symbol, kind: "dividend", t: d, name: q.shortName ?? null });
  }
  return out.sort((a, b) => a.t - b.t);
}
