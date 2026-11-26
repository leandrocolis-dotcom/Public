// Grupo "Carteira atual" no Fluxo Offshore (mapa de calor e rotação relativa): as posições do usuário contra o S&P 500.
// Puro (sem DOM/rede). Ativo que já está no universo reaproveita a série do flow.json (já com o preço ao vivo);
// os demais vêm do histórico da carteira (api/history?vol=1) + cotação ao vivo (variação do dia = p ÷ pc).
import { alignSeries } from "./dash-extra.js";
import { mergeLive } from "./br.js";
import { OFF_UNI } from "./flow-engine.js";

export const PORT_GROUP = { id: "port", label: "Carteira atual", bench: "SPY" };

function alignVol(dates, src) {
  if (!src?.vol?.length || src.vol.length !== src.dates.length) return null;
  const at = new Map(src.dates.map((d, i) => [d, src.vol[i]]));
  return dates.map((d) => at.get(d) ?? 0);
}

/**
 * Tabela e universo do fluxo com o grupo da carteira.
 * @param flow tabela do fluxo ({ dates, close, vol })
 * @param holdings [{ sym, qty }] posições (qty > 0)
 * @param hist { SÍMBOLO: { dates, close, vol?, name? } }
 * @param quotes { SÍMBOLO: { p, pc, t, v } }
 * @returns { flow, uni } — sem posição com série, devolve o fluxo e o universo originais
 */
export function withPortfolio(flow, holdings, hist = {}, quotes = {}, base = OFF_UNI) {
  const syms = [
    ...new Set((holdings ?? []).filter((h) => h?.sym && !(h.qty <= 0)).map((h) => h.sym)),
  ];
  if (!flow?.dates?.length || !syms.length) return { flow, uni: base };
  const close = { ...flow.close };
  const vol = { ...(flow.vol ?? {}) };
  const last = flow.dates.at(-1);
  const assets = [];
  for (const sym of syms) {
    const known = base.bySym[sym];
    if (!close[sym]) {
      const src = mergeLive(hist[sym], quotes[sym]);
      const s = alignSeries(flow.dates, src);
      if (!s) continue;
      close[sym] = s;
      const v = alignVol(flow.dates, src);
      if (v) {
        const q = quotes[sym];
        if (q?.v > 0 && src.dates.at(-1) === last) v[v.length - 1] = q.v;
        vol[sym] = v;
      }
    }
    assets.push({
      sym,
      label: sym,
      name: known?.name ?? hist[sym]?.name ?? sym,
      group: PORT_GROUP.id,
      inv: !!known?.inv,
      yld: !!known?.yld,
      risk: !!known?.risk,
    });
  }
  if (!assets.length) return { flow, uni: base };
  const bySym = { ...base.bySym };
  for (const a of assets) bySym[a.sym] ??= a;
  return {
    flow: { ...flow, close, vol },
    uni: {
      ...base,
      assets: [...assets, ...base.assets],
      groups: [PORT_GROUP, ...base.groups],
      byId: { ...base.byId, [PORT_GROUP.id]: PORT_GROUP },
      bySym,
    },
  };
}
