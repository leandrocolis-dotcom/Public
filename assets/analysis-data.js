// Aba "Análise": carga dos tickers pela api/analyze (lotes de 15), cache de 1 h em memória e análise integrada.
import { notifOn } from "./notif-prefs.js";
import { analyzeTicker } from "./integrated.js";
import { traderDecision } from "./decision.js";
import { quantOf } from "./quant-view.js";
import { livePrice } from "./market.js";
import { levelAlert } from "./level-alerts.js";
import { hooks, savePrefs, state, store } from "./state.js";
import { fetchJSON, stableLots } from "./net.js";

const TTL = 10 * 60_000; // 10 min: o preço e o plano não ficam uma hora atrás do resto do app
const LOT = 15;
export const an = { items: {}, at: {}, loading: false, errors: [], missing: [], fail: {} };
const WAITS = [0, 1500, 4000]; // 3 tentativas por bloco, com espera crescente

/** "aapl, msft petr4.sa" -> ["AAPL","MSFT","PETR4.SA"] (sem repetir, no máximo `max`: 45 na aba Análise). */
export function parseList(text, max = 45) {
  return [
    ...new Set(
      String(text ?? "")
        .toUpperCase()
        .split(/[,;\s]+/)
        .map((x) => x.trim())
        .filter((x) => /^[A-Z0-9][A-Z0-9.\-=^]{0,14}$/.test(x)),
    ),
  ].slice(0, max);
}

export const portfolioSyms = () =>
  (state.portfolio?.holdings ?? []).map((h) => h.sym).filter(Boolean);

const spyPe = () => state.fund?.etf?.SPY?.pe?.filter((x) => x > 0).at(-1) ?? 25;

/** Busca o que falta (ou passou de 1 h) e recalcula a análise. */
export async function runAnalysis(list, { force = false } = {}) {
  state.prefs.anList = list.join(", ");
  savePrefs();
  const need = list.filter((s) => force || !an.at[s] || Date.now() - an.at[s] > TTL);
  if (!need.length) return hooks.render();
  an.loading = true;
  an.errors = [];
  hooks.render();
  for (const lot of stableLots(list, need, LOT)) {
    try {
      const j = await fetchJSON(`api/analyze?symbols=${encodeURIComponent(lot.join(","))}`);
      for (const [sym, item] of Object.entries(j.items ?? {})) {
        an.items[sym] = analyzeTicker(sym, item, { spyPe: spyPe() });
        an.at[sym] = Date.now();
      }
      an.errors.push(...(j.errors ?? []).filter((e) => !/fundamentos/.test(e)));
      if (j.error) an.errors.push(j.error);
    } catch (e) {
      an.errors.push(`${lot.join(", ")}: ${e.message}`);
    }
  }
  an.missing = list.filter((s) => !an.items[s]);
  an.loading = false;
  hooks.render();
}

/** Busca um bloco na api/analyze (3 tentativas) e guarda o que veio; devolve os símbolos que ficaram sem análise. */
async function fetchLot(lot) {
  let last = "sem resposta";
  for (const wait of WAITS) {
    if (wait) await new Promise((ok) => setTimeout(ok, wait));
    try {
      const j = await fetchJSON(`api/analyze?symbols=${encodeURIComponent(lot.join(","))}`);
      for (const [sym, item] of Object.entries(j.items ?? {})) {
        // um ativo com dado estranho não derruba os outros do bloco
        try {
          an.items[sym] = analyzeTicker(sym, item, { spyPe: spyPe() });
          an.at[sym] = Date.now();
          delete an.fail[sym];
        } catch (e) {
          an.fail[sym] = `dado inválido: ${e.message}`;
          console.error(`análise de ${sym}:`, e);
        }
      }
      for (const e of j.errors ?? []) {
        const m = /^([A-Z0-9.\-=^]+): (.*)$/.exec(e);
        if (m && lot.includes(m[1]) && !an.items[m[1]]) an.fail[m[1]] = m[2];
      }
      return lot.filter((s) => !an.items[s] || an.at[s] < Date.now() - TTL);
    } catch (e) {
      last = e.message;
    }
  }
  lot.forEach((s) => (an.fail[s] = an.fail[s] ?? last));
  return lot;
}

/** Carrega a análise de ativos sem mexer na lista da aba (detalhe da Carteira e vigia de níveis). */
export async function ensureAnalysis(syms, { onLot = null, parallel = 1, force = false } = {}) {
  const need = syms.filter((s) => force || !an.at[s] || Date.now() - an.at[s] > TTL);
  const lots = stableLots(syms, need, LOT);
  let k = 0;
  const worker = async () => {
    while (k < lots.length) {
      const lot = lots[k++];
      const left = await fetchLot(lot);
      // bloco falhou: cada ativo que faltou vai sozinho (um ativo lento ou com erro não derruba os outros)
      if (lot.length > 1) for (const s of left) await fetchLot([s]);
      onLot?.();
    }
  };
  await Promise.all(Array.from({ length: Math.max(1, parallel) }, worker));
  return syms.map((s) => an.items[s]).filter(Boolean);
}

/** Decisão + alerta de nível de um ativo da carteira, com o preço ao vivo da Carteira. */
export function holdingDecision(sym) {
  const r = an.items[sym];
  if (!r) return null;
  const row = state.valuation?.rows?.find((x) => x.sym === sym);
  const price = row?.price ?? livePrice(sym, state) ?? r.price;
  const dec = traderDecision({ ...r, price }, { regime: state.snap?.regime, spy: state.prices?.series?.SPY, quantOf }, { gate: true }); // prettier-ignore
  const alert = levelAlert(r, dec, { price, hold: row });
  return { r, dec, alert };
}

/**
 * Vigia de níveis (piloto): para cada ativo da carteira, avisa quando o preço chega perto da resistência, do
 * suporte ou do stop. Um aviso por ativo + zona por dia. Devolve os alertas novos (para a notificação).
 */
export async function watchLevels(notify) {
  if (!notifOn(state.prefs, "levels")) return [];
  const syms = portfolioSyms();
  if (!syms.length) return [];
  await ensureAnalysis(syms);
  const day = new Date().toISOString().slice(0, 10);
  const seen = store.get("pendulo.levels.seen", { day, keys: [] });
  if (seen.day !== day) Object.assign(seen, { day, keys: [] });
  const fresh = [];
  for (const s of syms) {
    const a = holdingDecision(s)?.alert;
    if (!a) continue;
    const k = `${s}:${a.zone}:${a.tone}`;
    if (seen.keys.includes(k)) continue;
    seen.keys.push(k);
    fresh.push(a);
  }
  store.set("pendulo.levels.seen", seen);
  fresh.forEach((a) => notify?.(a));
  return fresh;
}
