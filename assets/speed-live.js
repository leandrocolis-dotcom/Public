// Velocidade de variação dos ativos que o termômetro sugere mexer (e dos marcados para vigiar), ao vivo,
// também no pré e no pós. Base: barras de 5 min com pré/pós (central de barras) + os preços que chegam pelo
// canal entre uma barra e outra (memória da sessão). speedOf é puro e testado.
// Leitura: %/h dos últimos 15 min, variação em 15 min e em 1 h, e se está acelerando, freando ou virando.

/** Memória de ticks por ativo: [{ t (s), p }], só as últimas 2 h. */
const TICKS = new Map();
const KEEP = 2 * 3600;

export function recordTick(sym, p, t = Date.now() / 1000) {
  if (!(p > 0)) return;
  const a = TICKS.get(sym) ?? [];
  const last = a.at(-1);
  if (last && last.p === p && t - last.t < 30) return;
  a.push({ t, p });
  while (a.length && t - a[0].t > KEEP) a.shift();
  TICKS.set(sym, a);
}
export const ticksOf = (sym) => TICKS.get(sym) ?? [];

/** Junta barras ({ t, c }) e ticks posteriores à última barra numa série de pontos { t, p }. */
export function mergePoints(bars, ticks = []) {
  const pts = [];
  for (let i = 0; i < (bars?.t?.length ?? 0); i++) if (bars.c[i] > 0) pts.push({ t: bars.t[i], p: bars.c[i] }); // prettier-ignore
  const lastT = pts.at(-1)?.t ?? -Infinity;
  for (const k of ticks) if (k.t > lastT) pts.push(k);
  return pts;
}

/** Preço no instante t (último ponto até t). */
function at(pts, t) {
  let v = null;
  for (const x of pts) {
    if (x.t > t) break;
    v = x;
  }
  return v;
}

/**
 * pts: [{ t, p }] em ordem; now (s). Devolve { rate (fração por hora, nos últimos 15 min), v15, v60, trend } ou
 * null sem pontos suficientes. trend: "acel" | "freia" | "vira" | "firme" | "parado".
 */
export function speedOf(pts, now = Date.now() / 1000) {
  const last = pts?.at(-1);
  if (!last || now - last.t > 3 * 3600) return null;
  const p15 = at(pts, now - 15 * 60);
  const p60 = at(pts, now - 60 * 60);
  if (!p15) return null;
  const v15 = last.p / p15.p - 1;
  const v60 = p60 ? last.p / p60.p - 1 : null;
  const rate = v15 * 4;
  let trend = "firme";
  if (Math.abs(rate) < 0.001) trend = "parado";
  else if (v60 != null && Math.abs(v60) >= 0.001 && Math.sign(v60) !== Math.sign(rate))
    trend = "vira";
  else if (v60 != null && Math.abs(rate) > Math.abs(v60) * 1.3) trend = "acel";
  else if (v60 != null && Math.abs(rate) < Math.abs(v60) * 0.7) trend = "freia";
  return { rate, v15, v60, trend, at: last.t };
}

export const TREND_PT = { acel: "acelerando", freia: "freando", vira: "virando", firme: "ritmo firme", parado: "parado" }; // prettier-ignore
