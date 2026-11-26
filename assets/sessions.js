// Regra de sessão ÚNICA (pura, sem rede): bolsa dos EUA com feriados, B3, futuros da CME, moedas, cripto e
// bolsas do mundo, e o que negocia em cada instante. Usada pelo app (assets/refresh.js, assets/live-feed.js,
// assets/ta-signals.js) e pela Edge Function quotes-feed (entra no quotes.bundle.js por `npm run build:feed`).
// Mudou aqui? Rode `npm run build:feed` e reimplante a função: o teste do pacote acusa se esquecer.

const ET = new Intl.DateTimeFormat("en-CA", {
  timeZone: "America/New_York",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  weekday: "short",
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
});
const SP = new Intl.DateTimeFormat("en-CA", {
  timeZone: "America/Sao_Paulo",
  weekday: "short",
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
});

export const PRE = 240; // 4:00
export const OPEN = 570; // 9:30
export const CLOSE = 960; // 16:00
export const POST_END = 1200; // 20:00
const FUT_OPEN = 1080; // 18:00 (domingo a quinta): reabertura da CME
const FUT_CLOSE = 1020; // 17:00 (segunda a sexta): pausa diária / fechamento de sexta

// Calendário da NYSE (atualizar todo ano): feriados com a bolsa fechada e pregões encerrados às 13:00.
const HOLIDAYS = {
  "2026-01-01": "Ano Novo", "2026-01-19": "Martin Luther King", "2026-02-16": "Dia dos Presidentes",
  "2026-04-03": "Sexta-feira Santa", "2026-05-25": "Memorial Day", "2026-06-19": "Juneteenth",
  "2026-07-03": "Independência (observado)", "2026-09-07": "Dia do Trabalho", "2026-11-26": "Ação de Graças",
  "2026-12-25": "Natal",
  "2027-01-01": "Ano Novo", "2027-01-18": "Martin Luther King", "2027-02-15": "Dia dos Presidentes",
  "2027-03-26": "Sexta-feira Santa", "2027-05-31": "Memorial Day", "2027-06-18": "Juneteenth (observado)",
  "2027-07-05": "Independência (observado)", "2027-09-06": "Dia do Trabalho", "2027-11-25": "Ação de Graças",
  "2027-12-24": "Natal (observado)",
}; // prettier-ignore
const EARLY_CLOSE = new Set(["2026-11-27", "2026-12-24", "2027-11-26"]);
/** Pós-mercado nos dias encurtados: 13:00–17:00 de NY (NYSE Arca/Nasdaq encerram o estendido às 17:00). */
const EARLY_POST_END = 17 * 60;
// Futuros da CME (índices de ações) nos feriados dos EUA: fechados o dia todo nestes (Sexta-feira Santa, Natal,
// Ano Novo); nos demais feriados da NYSE param às 13:00 e voltam às 18:00; nos dias encurtados fecham às 13:15.
const FUT_CLOSED = new Set(["2026-04-03", "2026-12-25", "2027-01-01", "2027-03-26", "2027-12-24"]);
const FUT_HALT = 13 * 60; // 13:00: parada nos feriados da NYSE em que a CME negocia
const FUT_EARLY = 13 * 60 + 15; // 13:15: fechamento nos dias encurtados

/** Data (AAAA-MM-DD), dia da semana ("Mon"…) e minuto do dia em Nova York. */
export function nyClock(ms) {
  const p = Object.fromEntries(ET.formatToParts(new Date(ms)).map((x) => [x.type, x.value]));
  return {
    date: `${p.year}-${p.month}-${p.day}`,
    wd: p.weekday,
    min: Number(p.hour) * 60 + Number(p.minute),
  };
}

/** Situação da bolsa dos EUA numa data (AAAA-MM-DD): { open, closeMin, reason }. */
export function sessionInfo(date) {
  const wd = new Date(`${date}T12:00:00Z`).getUTCDay();
  if (wd === 0 || wd === 6)
    return { open: false, closeMin: CLOSE, postEnd: POST_END, reason: "fim de semana" };
  if (HOLIDAYS[date])
    return { open: false, closeMin: CLOSE, postEnd: POST_END, reason: `feriado nos EUA (${HOLIDAYS[date]})` }; // prettier-ignore
  const early = EARLY_CLOSE.has(date);
  return {
    open: true,
    closeMin: early ? 13 * 60 : CLOSE,
    postEnd: early ? EARLY_POST_END : POST_END,
    early,
    reason: early ? "pregão encurtado (fecha às 13:00 e o pós às 17:00 em Nova York)" : null,
  };
}

/** "open" | "pre" | "post" | "closed" (fins de semana e feriados da NYSE contam como fechado). */
export function usSession(ms = Date.now()) {
  const { date, min } = nyClock(ms);
  const info = sessionInfo(date);
  if (!info.open) return "closed";
  if (min >= OPEN && min < info.closeMin) return "open";
  if (min >= PRE && min < OPEN) return "pre";
  if (min >= info.closeMin && min < info.postEnd) return "post";
  return "closed";
}

/**
 * Sessão noturna das ações/ETFs dos EUA (corretoras 24h, ex.: Blue Ocean): 20:00–4:00 de NY na véspera de um
 * pregão. O Yahoo não tem barras dela; só o último preço (fulldayPrice do gráfico), lido por api/quotes?night=.
 */
export function overnightOpen(ms = Date.now()) {
  const { date, min } = nyClock(ms);
  if (min < PRE) return sessionInfo(date).open;
  if (min < POST_END) return false;
  return sessionInfo(nyClock(ms + (1440 - min + 60) * 60000).date).open;
}

/** Dia seguinte (AAAA-MM-DD). */
const nextDay = (date) => new Date(Date.parse(`${date}T12:00:00Z`) + 86400000).toISOString().slice(0, 10); // prettier-ignore

/**
 * Futuros da CME (Globex): domingo 18:00 a sexta 17:00 de Nova York, com pausa diária 17:00–18:00. Feriados:
 * fechados o dia todo em FUT_CLOSED (e sem a reabertura da véspera à noite); nos outros feriados da NYSE param às
 * 13:00 e voltam às 18:00; nos dias encurtados fecham às 13:15 (sexta: até domingo).
 */
export function futuresOpen(ms) {
  const { date, wd, min } = nyClock(ms);
  if (wd === "Sat") return false;
  const tomorrowShut = FUT_CLOSED.has(nextDay(date)); // sem reabertura às 18:00 na véspera de dia fechado
  if (FUT_CLOSED.has(date)) return false;
  if (wd === "Sun") return min >= FUT_OPEN && !tomorrowShut;
  const evening = min >= FUT_OPEN && wd !== "Fri" && !tomorrowShut;
  if (HOLIDAYS[date]) return min < FUT_HALT || evening;
  if (EARLY_CLOSE.has(date)) return min < FUT_EARLY || evening;
  if (wd === "Fri") return min < FUT_CLOSE;
  return min < FUT_CLOSE || evening;
}

/** Moedas (e bolsas do mundo, que abrem com a Ásia): domingo 17:00 a sexta 17:00 de Nova York. */
export function fxOpen(ms) {
  const { wd, min } = nyClock(ms);
  if (wd === "Sat") return false;
  if (wd === "Sun") return min >= FUT_CLOSE;
  if (wd === "Fri") return min < FUT_CLOSE;
  return true;
}

/** B3 (São Paulo): dias úteis, 9:45 (leilão) a 18:30 (after). Feriados da B3 não entram: o preço só não muda. */
export function b3Open(ms) {
  const p = Object.fromEntries(SP.formatToParts(new Date(ms)).map((x) => [x.type, x.value]));
  if (p.weekday === "Sat" || p.weekday === "Sun") return false;
  const min = Number(p.hour) * 60 + Number(p.minute);
  return min >= 585 && min < 1110;
}

/**
 * Sessão do canal de tempo real: "open" | "pre" | "post" pela bolsa dos EUA (com feriados) e, com ela
 * fechada, "night" enquanto os futuros da CME negociam (o modo Off usa os futuros como proxy). null = nada.
 */
export function feedSession(ms = Date.now()) {
  const s = usSession(ms);
  if (s !== "closed") return s;
  return futuresOpen(ms) ? "night" : null;
}

/** Classe do símbolo: "us" | "b3" | "fut" | "fx" | "crypto" | "world". */
export function symClass(sym) {
  const s = String(sym ?? "");
  if (/\.SA$/.test(s) || s === "^BVSP") return "b3";
  if (/=F$|\.(NYM|CME|CBT|CMX|NYB)$/.test(s)) return "fut";
  if (/=X$/.test(s)) return "fx";
  if (/-USD$/.test(s)) return "crypto";
  if (/\.(MI|SS|SZ|L|PA|DE|T|HK|TO)$/.test(s)) return "world";
  if (/^\^(STOXX|GDAXI|FTSE|FCHI|IBEX|N225|HSI|KS11|TWII|NSEI|BSESN|AXJO|MXX|MERV|GSPTSE)/.test(s))
    return "world";
  return "us";
}

/** O mercado do símbolo está negociando (ou em pré/pós, para os EUA) neste instante? */
export function symOpen(sym, ms = Date.now()) {
  switch (symClass(sym)) {
    case "b3":
      return b3Open(ms);
    case "fut":
      return futuresOpen(ms);
    case "fx":
    case "world":
      return fxOpen(ms);
    case "crypto":
      return true;
    default:
      return usSession(ms) !== "closed";
  }
}

/**
 * Relógio do pregão regular dos EUA (9:30–16:00 de NY, com feriados e pregão encurtado):
 * { open, min } = aberto e minutos até fechar, ou fechado e minutos até a próxima abertura.
 */
export function marketClock(ms = Date.now()) {
  const { date, min } = nyClock(ms);
  const today = sessionInfo(date);
  if (today.open && min >= OPEN && min < today.closeMin)
    return { open: true, min: today.closeMin - min };
  for (let d = 0; d <= 10; d++) {
    const day = nyClock(ms + d * 86400000).date;
    if (!sessionInfo(day).open || (d === 0 && min >= OPEN)) continue;
    // alvo aproximado pelo relógio de hoje; corrige a troca de horário de verão pelo relógio do alvo
    let left = d === 0 ? OPEN - min : 1440 - min + (d - 1) * 1440 + OPEN;
    const at = nyClock(ms + left * 60000);
    if (at.date === day) left += OPEN - at.min;
    return { open: false, min: left };
  }
  return { open: false, min: null };
}

/** "fecha em 2h05" | "abre em 45 min" | "abre em 2d 17h30". */
export function marketClockText(ms = Date.now()) {
  const { open, min } = marketClock(ms);
  if (min == null) return open ? "pregão aberto" : "bolsa fechada";
  const d = Math.floor(min / 1440);
  const h = Math.floor((min % 1440) / 60);
  const m = min % 60;
  const t = d
    ? `${d}d ${h}h${m ? String(m).padStart(2, "0") : ""}`
    : h
      ? `${h}h${String(m).padStart(2, "0")}`
      : `${m} min`;
  return `${open ? "fecha em" : "abre em"} ${t}`;
}
