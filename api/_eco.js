// Calendário econômico da Nasdaq (gratuito, sem chave): valor divulgado ("actual") e projeção dos indicadores.
// Arquivo com "_" não vira rota. Usado pela agenda (api/calendar) e pelos avisos push (api/push-alerts).
import { httpFetch, memo } from "./_http.js";
import { normalizeNasdaqEco } from "../assets/macro-alerts.js";
import {
  YAHOO_REGIONS,
  fillConsensus,
  fillFromYahoo,
  normalizeYahooEco,
} from "../assets/eco-yahoo.js";
import { normalizeEvents } from "../assets/calendar.js";

const URL_ = "https://api.nasdaq.com/api/calendar/economicevents?date=";

/**
 * A Nasdaq publica os eventos de um dia na data SEGUINTE (medido em 25/11/2026: `date=2026-11-26` trazia o PCE e
 * o PIB dos EUA de 25/11 às 8h30; `date=2026-11-25` trazia a confiança do consumidor de 24/11). Para ler o dia D,
 * pede D + 1 e marca os eventos com D.
 */
export const NASDAQ_SHIFT_DAYS = 1;
export const nasdaqDate = (d) =>
  new Date(Date.parse(`${d}T12:00:00Z`) + NASDAQ_SHIFT_DAYS * 864e5).toISOString().slice(0, 10);

const YURL = "https://query1.finance.yahoo.com/ws/screeners/v1/finance/calendar-events?countPerDay=99&economicEventsHighImportanceOnly=false&modules=economicEvents"; // prettier-ignore

/** Valores do Yahoo de ontem e hoje (uma chamada por região, cache de 50 s na instância). Falha = lista vazia. */
export async function fetchYahooEco({ deadline = null, now = Date.now() } = {}) {
  const day = Math.floor(now / 864e5) * 864e5;
  const [s, e] = [day - 864e5, day + 864e5];
  const res = await Promise.allSettled(
    Object.keys(YAHOO_REGIONS).map((r) =>
      memo(`yeco:${r}:${day}:${Math.floor(now / 50000)}`, 50000, () =>
        httpFetch(
          `${YURL}&economicEventsRegionFilter=${r}&startDate=${s}&endDate=${e}`,
          { timeout: 5000, deadline, headers: { Accept: "application/json" } },
          async (x) => {
            // prettier-ignore
            if (!x.ok) throw new Error(`yahoo agenda HTTP ${x.status}`);
            return normalizeYahooEco(await x.json());
          },
        ),
      ),
    ),
  );
  return res.flatMap((r) => (r.status === "fulfilled" ? r.value : []));
}

/**
 * Agenda da semana (Forex Factory), normalizada. Cache de 30 min na instância e, se a fonte recusar (429: ela limita
 * pedidos por IP), devolve a última boa. Usada pela agenda (api/calendar) e para a projeção do que vem do Yahoo.
 */
let lastFF = null;
export const fetchFF = ({ deadline = null } = {}) =>
  memo("ffweek", 30 * 60000, () =>
    httpFetch(
      "https://nfs.faireconomy.media/ff_calendar_thisweek.json",
      { timeout: 6000, deadline },
      async (r) => {
        // prettier-ignore
        if (!r.ok) throw new Error(`agenda HTTP ${r.status}`);
        lastFF = normalizeEvents(await r.json());
        return lastFF;
      },
    ),
  ).catch((e) => {
    if (lastFF) return lastFF;
    throw e;
  });

/**
 * Datas UTC "AAAA-MM-DD" -> indicadores reconhecidos de todos os dias (os que falharem ficam de fora). Com
 * `yahoo` (padrão), o valor de ontem e hoje que a Nasdaq ainda não publicou vem do Yahoo.
 */
export async function fetchEco(
  dates,
  { deadline = null, normalize = normalizeNasdaqEco, yahoo = true, ff = null } = {},
) {
  const yP = yahoo ? fetchYahooEco({ deadline }).catch(() => []) : Promise.resolve([]);
  const fP = !yahoo ? Promise.resolve([]) : ff ? Promise.resolve(ff) : fetchFF({ deadline }).catch(() => []); // prettier-ignore
  const res = await Promise.allSettled(
    dates.map((d) =>
      httpFetch(
        URL_ + nasdaqDate(d),
        { timeout: 6000, deadline, headers: { Accept: "application/json" } },
        async (r) => {
          if (!r.ok) throw new Error(`nasdaq agenda HTTP ${r.status}`);
          return normalize((await r.json())?.data?.rows, d);
        },
      ),
    ),
  );
  const y = await yP;
  if (res.length && res.every((r) => r.status === "rejected") && !y.length) throw res[0].reason;
  const nas = res.flatMap((r) => (r.status === "fulfilled" ? r.value : []));
  // só os dias pedidos (o Yahoo traz ontem e hoje)
  const want = new Set(dates);
  return fillConsensus(
    fillFromYahoo(
      nas,
      y.filter((e) => want.has(e.date)),
    ),
    await fP,
  );
}

/** Próximos `n` dias UTC a partir de amanhã. */
export const nextDays = (n, now = Date.now()) =>
  Array.from({ length: n }, (_, i) => new Date(now + (i + 1) * 864e5).toISOString().slice(0, 10)); // prettier-ignore

/** Últimos `n` dias UTC terminando hoje. */
export const lastDays = (n, now = Date.now()) =>
  Array.from({ length: n }, (_, i) => new Date(now - (n - 1 - i) * 864e5).toISOString().slice(0, 10)); // prettier-ignore
