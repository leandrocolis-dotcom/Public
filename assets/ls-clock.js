// Long & Short: relógio do dia de trading (puro, sem relógio implícito: tudo recebe `ms`). Por cima da regra de
// sessão única (assets/sessions.js): sessão PRE/REGULAR/POS/FECHADO, marcos do dia com contagem regressiva
// (deslocados no pregão encurtado), dia de trading com reset às 4:00 ET, calendário especial (CAL-01) e preço
// de referência do dia (último preço do pós anterior). Fuso por nome (Intl), nunca soma fixa.
import { CLOSE, OPEN, POST_END, PRE, nyClock, sessionInfo, usSession } from "./sessions.js";
import { PARAMS, hhmm } from "./ls-params.js";

/** Anos com feriados e pregões encurtados cadastrados em assets/sessions.js (atualizar junto). */
export const CAL_YEARS = ["2026", "2027"];

const MAP = { pre: "PRE", open: "REGULAR", post: "POS", closed: "FECHADO" };
/** "PRE" | "REGULAR" | "POS" | "FECHADO" (feriados, fins de semana e pós encurtado de assets/sessions.js). */
export const lsSession = (ms) => MAP[usSession(ms)];

const fmt = (tz) =>
  new Intl.DateTimeFormat("en-GB", { timeZone: tz, hour: "2-digit", minute: "2-digit", hourCycle: "h23" }); // prettier-ignore
const ET_FMT = fmt("America/New_York");
const BR_FMT = fmt("America/Sao_Paulo");
/** { et: "10:15", br: "12:15" } para a barra de status. */
export const clocks = (ms) => ({ et: ET_FMT.format(ms), br: BR_FMT.format(ms) });

/** Dia de trading (AAAA-MM-DD, ET): os contadores zeram às 4:00 ET; antes disso ainda vale o dia anterior. */
export function tradingDay(ms) {
  const { date, min } = nyClock(ms);
  return min >= PRE ? date : nyClock(ms - (min + 1) * 60000).date;
}

/**
 * Marcos do dia (minutos ET). Horários do JSON valem para o pregão normal; no encurtado (fecha 13:00) eles
 * andam junto com o fechamento: corte de aumentos 15:00 → 12:00, checagem 15:45 → 12:45, checagem do pós
 * 19:45 → 16:45 (o pós termina às 17:00).
 */
export function dayMarks(date, params = PARAMS) {
  const info = sessionInfo(date);
  if (!info.open) return [];
  const shift = CLOSE - info.closeMin;
  const postShift = POST_END - info.postEnd;
  return [
    { id: "pre", min: PRE, label: "abertura do pré-mercado" },
    { id: "open", min: OPEN, label: "abertura do pregão" },
    { id: "or", min: OPEN + params.faixa_abertura_min, label: "fim da faixa de abertura" },
    { id: "cut", min: hhmm(params.pyramiding_corte_horario) - shift, label: "fim dos aumentos" },
    {
      id: "eod",
      min: hhmm(params.overnight_checagem_horario) - shift,
      label: "checagem de overnight",
    },
    { id: "close", min: info.closeMin, label: "fechamento do pregão" },
    { id: "posteod", min: hhmm(params.overnight_checagem_pos_horario) - postShift, label: "checagem do fim do pós" }, // prettier-ignore
    { id: "postEnd", min: info.postEnd, label: "fim do pós-mercado" },
  ];
}

/** Minuto ET de um marco hoje (ou null se o dia não tem pregão). */
export function markMin(ms, id, params = PARAMS) {
  return dayMarks(nyClock(ms).date, params).find((m) => m.id === id)?.min ?? null;
}

/** Próximo marco de hoje: { id, label, min (ET), left (minutos) } ou null (dia acabou / sem pregão). */
export function nextMark(ms, params = PARAMS) {
  const { date, min } = nyClock(ms);
  const m = dayMarks(date, params).find((x) => x.min > min);
  return m ? { ...m, left: m.min - min } : null;
}

/** "4h45" | "12 min". */
export function leftText(min) {
  if (min == null) return "";
  const h = Math.floor(min / 60);
  return h ? `${h}h${String(min % 60).padStart(2, "0")}` : `${min} min`;
}

/**
 * Calendário do dia (CAL-01): { special, reason, validated, blocks }. Especial = feriado ou pregão encurtado;
 * não validado = ano fora de CAL_YEARS. `confirmed` = data em que o usuário confirmou os novos horários.
 * Bloqueia compras se não validado, ou se especial e ainda não confirmado.
 */
export function calendarStatus(date, confirmed = null) {
  const info = sessionInfo(date);
  const validated = CAL_YEARS.includes(date.slice(0, 4));
  const weekend = info.reason === "fim de semana";
  const special = !weekend && (!info.open || !!info.early);
  const blocks = !validated || (special && confirmed !== date);
  return { special, validated, blocks, reason: validated ? (special ? info.reason : null) : "calendário da bolsa não cadastrado para este ano" }; // prettier-ignore
}

/**
 * Preço de referência do dia (pnl do dia): último preço do pós-mercado anterior às 4:00 ET de hoje, pelas
 * barras de 5 min com pré/pós ({ t (s), c }). Sem barras antes do reset, usa o fechamento anterior da cotação
 * (pc), e null se nada existir (o motor trata como dado ausente).
 */
export function refPrice(bars, ms, q = null) {
  const day = tradingDay(ms);
  let ref = null;
  for (let i = 0; i < (bars?.t?.length ?? 0); i++) {
    const t = bars.t[i] * 1000;
    if (tradingDay(t) < day && Number.isFinite(bars.c[i])) ref = bars.c[i];
  }
  if (ref !== null) return ref;
  return q?.pc > 0 ? q.pc : null;
}
