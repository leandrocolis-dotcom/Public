// Contexto macro (data/macro.json, gerado todo pregão por scripts/update-macro.mjs): nota geral, regime do
// "relógio do investimento", pilares e inclinação histórica de cada setor no regime. Entra na Decisão em modo sombra.
import { fetchJSON } from "./net.js";
import { hooks, state } from "./state.js";

export const macro = { data: null, rel: null, at: 0, loading: null };

export function loadMacro(force = false) {
  if (macro.loading || (!force && Date.now() - macro.at < 30 * 60e3)) return macro.loading;
  macro.loading = Promise.all([
    fetchJSON(`data/macro.json?t=${Date.now()}`).catch(() => macro.data),
    fetchJSON(`data/macro-releases.json?t=${Date.now()}`).catch(() => macro.rel),
  ])
    .then(([d, r]) => {
      macro.data = d;
      macro.rel = r;
    })
    .finally(() => {
      macro.at = Date.now();
      macro.loading = null;
      if (["macro", "home", "signals", "entry"].includes(state.prefs.tab)) hooks.render();
    });
  return macro.loading;
}

// ativo → setor/classe com histórico por regime
const PROXY = { QQQ: "XLK", SMH: "XLK", VGT: "XLK", SOXX: "XLK", XOP: "XLE", USO: "XLE", OIH: "XLE", KRE: "XLF", KBE: "XLF", IEF: "TLT", TLH: "TLT", GDX: "GLD", IAU: "GLD", SLV: "GLD", XHB: "XLY", ITB: "XLY", XRT: "XLY", IBB: "XLV", XBI: "XLV", ITA: "XLI", XAR: "XLI", COPX: "XLB", VNQ: "XLU", EWZ: "EEM", FXI: "EEM", MCHI: "EEM" }; // prettier-ignore

/** Inclinação macro do ativo (null se não há setor mapeado). Pura sobre os dados carregados. */
export function macroTilt(sym, d = macro.data) {
  if (!d?.tilts) return null;
  const key = PROXY[sym] ?? sym;
  const t = d.tilts.find((x) => x.sym === key);
  return t ? { ...t, regime: d.regime, overall: d.overall } : null;
}
