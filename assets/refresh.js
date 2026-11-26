// Sessões dos EUA (horário de Nova York) e o ritmo da busca de RESERVA. O preço chega em tempo real pelo
// canal do servidor (assets/live-feed.js); a busca por intervalo só cobre o que o canal não traz:
// com o canal no ar = a cada 10 min (histórico publicado, extras); com o canal fora = 2 min no pregão e
// 5 min no pré/pós, até ele voltar. Fechado (noite, fins de semana e feriados da NYSE) = nenhuma busca:
// a próxima fica marcada para a abertura do pré-mercado do próximo dia útil.
import { usSession } from "./sessions.js";

export { usSession };

/** Minutos entre buscas de reserva: canal saudável (live) ou fora do ar (degraded). */
export const STEPS = {
  live: { open: 10, pre: 10, post: 10 },
  degraded: { open: 2, pre: 5, post: 5 },
};

/** Próximo instante em que o pré-mercado abre (4:00 em Nova York de um dia útil). */
export function nextPreOpen(ms = Date.now()) {
  // anda em passos de 15 min (no máximo ~5 dias) e acerta o minuto exato no fim
  let t = Math.ceil(ms / 60000) * 60000;
  for (let i = 0; i < 5 * 96 && usSession(t) === "closed"; i++) t += 15 * 60000;
  while (usSession(t - 60000) !== "closed" && t > ms) t -= 60000;
  return t;
}

/** Próxima atualização: intervalo da sessão atual, antecipada se a sessão mudar antes.
 *  Fechado: só na abertura do próximo pré-mercado (nada roda à noite, no fim de semana ou em feriado). */
export function nextAuto(ms = Date.now(), steps = STEPS.degraded) {
  const s = usSession(ms);
  if (s === "closed") return nextPreOpen(ms);
  const step = steps[s];
  for (let i = 1; i < step; i++) {
    const t = ms + i * 60000;
    if (usSession(t) !== s) return Math.ceil(t / 60000) * 60000;
  }
  return ms + step * 60000;
}
