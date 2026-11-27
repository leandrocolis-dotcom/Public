// Scanner de volatilidade (Gatilhos › Scanner): filtra e ordena o universo pelas métricas de assets/market.js. Puro.
// σ = oscilação diária típica do próprio ativo (desvio de 20 pregões): "2σ" = movimento 2x maior que o normal dele.

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
  // volatilidade, em σ do próprio ativo
  moveZ: { label: "⚡ Movimento ≥ 2σ hoje", test: (a) => Math.abs(a.z1) >= 2 },
  upZ: { label: "⚡ Alta ≥ 2σ", test: (a) => a.z1 >= 2 },
  downZ: { label: "⚡ Queda ≥ 2σ", test: (a) => a.z1 <= -2 },
  rangeZ: { label: "⚡ Amplitude do dia ≥ 2σ", test: (a) => a.rangeZ >= 2 },
  stretchUp: { label: "Esticado acima da MM20 (≥ 2,5σ)", test: (a) => a.stretch >= 2.5 },
  stretchDown: { label: "Esticado abaixo da MM20 (≤ −2,5σ)", test: (a) => a.stretch <= -2.5 },
  hiVol: { label: "Mais voláteis (σ diário ≥ 3%)", test: (a) => a.vol20 >= 0.03 },
}; // prettier-ignore

/** Filtros rápidos mostrados no Scanner, na ordem (os outros seguem para o painel de oportunidades). */
export const SCAN = ["all", "moveZ", "upZ", "downZ", "rangeZ", "volUp", "volDown", "stretchUp", "stretchDown", "hiVol", "breakout", "crossUp", "crossDown", "oversold", "overbought"]; // prettier-ignore

export const SORTS = {
  absZ: { label: "Movimento em σ (|dia|)", key: (a) => (a.z1 == null ? -Infinity : Math.abs(a.z1)) },
  z1: { label: "Dia em σ", key: (a) => a.z1 ?? -Infinity },
  rangeZ: { label: "Amplitude do dia em σ", key: (a) => a.rangeZ ?? -Infinity },
  vol20: { label: "σ diário", key: (a) => a.vol20 ?? -Infinity },
  stretch: { label: "vs MM20 em σ", key: (a) => a.stretch ?? -Infinity },
  r5d: { label: "5 dias", key: (a) => a.r5d ?? -Infinity },
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
  const s = SORTS[f.sort] ?? SORTS.absZ;
  const dir = f.dir === "asc" ? 1 : -1;
  return (assets ?? [])
    .filter((a) => a?.ok && (!f.group || f.group === "Todos" || a.group === f.group))
    .filter((a) => a.rsi >= lo && a.rsi <= hi && p.test(a))
    .sort((a, b) => dir * (s.key(a) - s.key(b)) || a.code.localeCompare(b.code));
}

export const groupsOf = (assets) => ["Todos", ...new Set((assets ?? []).filter((a) => a?.ok).map((a) => a.group))]; // prettier-ignore

/** Contagem por preset (para mostrar quantos ativos cada filtro rápido encontra). */
export const presetCounts = (assets) =>
  Object.fromEntries(SCAN.map((k) => [k, screen(assets, { preset: k }).length]));
