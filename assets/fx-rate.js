// Dólar da Carteira (puro, testado): com o mercado de câmbio do Brasil aberto, o preço ao vivo; fechado, o
// fechamento. Antes da abertura vale o fechamento do dia útil anterior; depois das 18h, o do próprio dia; o valor
// novo entra só na abertura do dia seguinte. Evita usar um tique solto da noite (ex.: 26/11/2026, feriado nos EUA:
// o "ao vivo" do Yahoo ficou 3% abaixo do fechamento).

export const BR_FX_OPEN = 9 * 60; // 9:00 de Brasília
export const BR_FX_CLOSE = 18 * 60; // 18:00
export const STALE_MS = 30 * 60 * 1000; // cotação parada há mais que isso não conta como ao vivo

const SP = new Intl.DateTimeFormat("en-US", {
  timeZone: "America/Sao_Paulo",
  weekday: "short",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
});

/** Relógio de Brasília: { day: "yyyy-mm-dd", wd, min }. */
export function spClock(ms) {
  const p = Object.fromEntries(SP.formatToParts(new Date(ms)).map((x) => [x.type, x.value]));
  return {
    day: `${p.year}-${p.month}-${p.day}`,
    wd: p.weekday,
    min: Number(p.hour) * 60 + Number(p.minute),
  };
}

/** Câmbio do Brasil negociando: dias úteis, 9:00–18:00 de Brasília. */
export function brFxOpen(ms) {
  const { wd, min } = spClock(ms);
  if (wd === "Sat" || wd === "Sun") return false;
  return min >= BR_FX_OPEN && min < BR_FX_CLOSE;
}

/**
 * Dólar a usar agora. quote = cotação BRL=X ({ p, t } em segundos); daily = { dates, close } (fechamentos
 * diários). Devolve { rate, src: "live" | "close", at?: Date, date?: "yyyy-mm-dd" } ou null.
 */
export function usdBrl({ quote = null, daily = null, nowMs = Date.now() } = {}) {
  const t = Number(quote?.t) * 1000;
  if (brFxOpen(nowMs) && quote?.p > 0 && Number.isFinite(t) && nowMs - t <= STALE_MS)
    return { rate: quote.p, src: "live", at: new Date(t) };
  const { day, wd, min } = spClock(nowMs);
  // antes da abertura (ou no fim de semana): só fechamentos de dias anteriores; depois das 18h, vale o de hoje
  const upTo = wd !== "Sat" && wd !== "Sun" && min >= BR_FX_CLOSE ? day : null;
  const dates = daily?.dates ?? [];
  const close = daily?.close ?? [];
  for (let i = Math.min(dates.length, close.length) - 1; i >= 0; i--) {
    const d = String(dates[i]).slice(0, 10);
    if (!(close[i] > 0)) continue;
    if (upTo ? d <= upTo : d < day) return { rate: close[i], src: "close", date: d };
  }
  return null;
}
