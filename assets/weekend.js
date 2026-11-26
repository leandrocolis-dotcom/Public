// Fim de semana do mercado dos EUA (horário de Nova York). Funções puras: silenciar avisos e resumo do fds na aba Notícias.
import { marketScore } from "./news.js";

const NY = new Intl.DateTimeFormat("en-US", {
  timeZone: "America/New_York",
  weekday: "short",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
});
const DOW = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };

/** Data e hora de Nova York: { dow (0 = domingo), y, m, d, h, min }. */
export function nyParts(sec) {
  const p = Object.fromEntries(NY.formatToParts(new Date(sec * 1000)).map((x) => [x.type, x.value])); // prettier-ignore
  return { dow: DOW[p.weekday], y: +p.year, m: +p.month, d: +p.day, h: +p.hour, min: +p.minute };
}

/** Hora de parede de Nova York -> segundos Unix (respeita horário de verão). */
export function nyToSec(y, m, d, h = 0, min = 0) {
  const guess = Date.UTC(y, m - 1, d, h, min) / 1000;
  const p = nyParts(guess);
  return guess - (Date.UTC(p.y, p.m - 1, p.d, p.h, p.min) / 1000 - guess);
}

/** Sábado ou domingo em Nova York: bolsa fechada o dia todo. */
export const isWeekendNY = (sec = Date.now() / 1000) => [0, 6].includes(nyParts(sec).dow);

/** Silenciar avisos agora? Só com a escolha ligada (Configurações › Avisos) e no fim de semana. */
export const quietNow = (prefs, sec = Date.now() / 1000) =>
  prefs?.weekendQuiet === true && isWeekendNY(sec);

const FRI_CLOSE = 5 * 1440 + 16 * 60; // sexta 16:00 (fechamento)
const MON_OPEN = 1440 + 9 * 60 + 30; // segunda 09:30 (abertura)

/**
 * Janela do fim de semana, do fechamento de sexta (16:00 NY) à abertura de segunda (09:30 NY).
 * Durante a janela: a atual, até agora (live = true). Fora dela: a última que terminou.
 */
export function weekendWindow(sec = Date.now() / 1000) {
  const p = nyParts(sec);
  const w = p.dow * 1440 + p.h * 60 + p.min;
  const live = w >= FRI_CLOSE || w < MON_OPEN;
  const back = live || p.dow !== 5 ? (p.dow + 2) % 7 : 7; // dias até a sexta do fechamento
  const fri = new Date(Date.UTC(p.y, p.m - 1, p.d - back));
  const [y, m, d] = [fri.getUTCFullYear(), fri.getUTCMonth() + 1, fri.getUTCDate()];
  const from = nyToSec(y, m, d, 16, 0);
  const mon = new Date(Date.UTC(y, m - 1, d + 3));
  const open = nyToSec(mon.getUTCFullYear(), mon.getUTCMonth() + 1, mon.getUTCDate(), 9, 30);
  return { from, to: live ? Math.floor(sec) : open, live, key: `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}` }; // prettier-ignore
}

export const inWindow = (it, win) => !!it.t && it.t >= win.from && it.t <= win.to;

/** Peso de uma manchete no resumo: carteira (cita o ativo > tema) e depois assunto de mercado. */
export const digestScore = (it) =>
  (it.hits?.some((h) => h.direct) ? 20 : it.hits ? 10 : 0) +
  (it.impact ? 5 : 0) +
  marketScore(it.title ?? "");

/**
 * Resumo do fds: { pf: manchetes da carteira, top: principais do mercado (só EUA/internacional), total }.
 * Opinião e ruído (impact = false sem carteira) ficam de fora das principais.
 */
export function weekendDigest(items, win, { maxPf = 8, maxTop = 12 } = {}) {
  const list = (items ?? []).filter((x) => inWindow(x, win));
  const rank = (a, b) => digestScore(b) - digestScore(a) || (b.t ?? 0) - (a.t ?? 0);
  const pf = list
    .filter((x) => x.hits)
    .sort(rank)
    .slice(0, maxPf);
  const used = new Set(pf);
  const top = list
    .filter(
      (x) => !used.has(x) && x.region !== "br" && (x.impact || marketScore(x.title ?? "") > 0),
    )
    .sort(rank)
    .slice(0, maxTop);
  return { pf, top, total: list.length };
}
