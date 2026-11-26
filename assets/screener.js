// Screener (estilo Investing): filtra e ordena o universo pelas métricas do snapshot. Puro, para testar.

export const PRESETS = {
  all: { label: "Todos", test: () => true },
  uptrend: { label: "Tendência de alta", test: (a) => a.price > a.ma200 && a.ma50 > a.ma200 },
  downtrend: { label: "Tendência de baixa", test: (a) => a.price < a.ma200 && a.ma50 < a.ma200 },
  oversold: { label: "Sobrevendidos (RSI < 30)", test: (a) => a.rsi < 30 },
  overbought: { label: "Sobrecomprados (RSI > 70)", test: (a) => a.rsi > 70 },
  nearHigh: { label: "Perto da máxima de 52 sem.", test: (a) => a.fromHigh > -0.03 },
  pullback: { label: "Recuo em alta", test: (a) => a.price > a.ma200 && a.vsMa50 < 0 && a.rsi < 45 },
  crossDown: { label: "Abaixo da MM200", test: (a) => a.price < a.ma200 },
  // intraday (com o preço ao vivo; o volume do dia é parcial durante o pregão)
  breakout: { label: "⚡ Rompendo máxima de 52 sem.", test: (a) => a.h52 > 0 && a.price > a.h52 },
  volUp: { label: "⚡ Volume anormal em alta", test: (a) => a.relVol >= 2 && a.r1d > 0 },
  volDown: { label: "⚡ Volume anormal em queda", test: (a) => a.relVol >= 2 && a.r1d < 0 },
  crossUp: { label: "⚡ Cruzou a MM200 para cima hoje", test: (a) => a.prevAboveMa200 === false && a.price > a.ma200 },
  bigUp: { label: "⚡ Alta forte hoje (> 4%)", test: (a) => a.r1d > 0.04 },
  bigDown: { label: "⚡ Queda forte hoje (> 4%)", test: (a) => a.r1d < -0.04 },
}; // prettier-ignore

export const SORTS = {
  momentum: { label: "Momentum", key: (a) => a.momentum ?? -Infinity },
  r1d: { label: "Dia", key: (a) => a.r1d ?? -Infinity },
  r1m: { label: "1 mês", key: (a) => a.r1m ?? -Infinity },
  r3m: { label: "3 meses", key: (a) => a.r3m ?? -Infinity },
  ytd: { label: "No ano", key: (a) => a.ytd ?? -Infinity },
  rsi: { label: "RSI", key: (a) => a.rsi ?? -Infinity },
  relVol: { label: "Volume vs média", key: (a) => a.relVol ?? -Infinity },
  fromHigh: { label: "Dist. máxima", key: (a) => a.fromHigh ?? -Infinity },
}; // prettier-ignore

/**
 * assets: lista de assetMetrics (snapshot). f: { preset, group, rsiMin, rsiMax, sort, dir }.
 * Ativos sem histórico suficiente (ok=false) ficam de fora.
 */
export function screen(assets, f = {}) {
  const p = PRESETS[f.preset] ?? PRESETS.all;
  const lo = Number.isFinite(f.rsiMin) ? f.rsiMin : -Infinity;
  const hi = Number.isFinite(f.rsiMax) ? f.rsiMax : Infinity;
  const s = SORTS[f.sort] ?? SORTS.momentum;
  const dir = f.dir === "asc" ? 1 : -1;
  return (assets ?? [])
    .filter((a) => a?.ok && (!f.group || f.group === "Todos" || a.group === f.group))
    .filter((a) => a.rsi >= lo && a.rsi <= hi && p.test(a))
    .sort((a, b) => dir * (s.key(a) - s.key(b)) || a.code.localeCompare(b.code));
}

export const groupsOf = (assets) => ["Todos", ...new Set((assets ?? []).filter((a) => a?.ok).map((a) => a.group))]; // prettier-ignore

/** Contagem por preset (para mostrar quantos ativos cada filtro rápido encontra). */
export const presetCounts = (assets) =>
  Object.fromEntries(Object.keys(PRESETS).map((k) => [k, screen(assets, { preset: k }).length]));
