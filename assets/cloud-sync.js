// Carteira: gravação local e sincronia com a nuvem.
import { hooks, state, store } from "./state.js";
import { toast } from "./widgets.js";
import { fmtTime } from "./format.js";
import * as cloud from "./cloud.js";
import { syncTrades } from "./trades.js";
import { syncJournal } from "./journal-view.js";
import {
  STAMPS_KEY,
  applyRemote,
  localBundle,
  mergeBundles,
  stampChanges,
  tracked,
} from "./settings-sync.js";

const hhmm = () => fmtTime(new Date()).slice(0, 5);
let warnedLocalOnly = false;

/** Grava a carteira (ou null) neste aparelho e, se conectado, na nuvem. */
export async function setPortfolio(pf, { push = true } = {}) {
  state.portfolio = pf ? { ...pf, updatedAt: pf.updatedAt ?? new Date().toISOString() } : null;
  if (!pf) state.valuation = null;
  store.set("pendulo.portfolio", state.portfolio);
  if (!push) return;
  if (!cloud.cloudUser()) {
    // Sem login a carteira fica só neste aparelho. Avisa (uma vez por sessão) em vez de falhar em silêncio.
    if (!warnedLocalOnly) {
      warnedLocalOnly = true;
      toast(
        cloud.sessionLost()
          ? "Sua sessão na nuvem expirou: a carteira foi salva só neste aparelho. Entre de novo em Configurações › Conta."
          : "Carteira salva só neste aparelho. Entre na nuvem (Configurações › Conta) para ela aparecer nos outros.",
        "warn",
        12000,
      );
    }
    return;
  }
  state.cloud.busy = true;
  try {
    if (pf) {
      state.portfolio.updatedAt = await cloud.pushPortfolio(state.portfolio);
      await cloud.verifyPortfolio(state.portfolio.updatedAt); // só diz "salvo" depois de reler da nuvem
    } else await cloud.deletePortfolio();
    store.set("pendulo.portfolio", state.portfolio);
    Object.assign(state.cloud, { error: null, syncedAt: hhmm() });
    pushLists();
  } catch (e) {
    state.cloud.error = cloud.authMessage(e);
    toast(
      `Carteira salva neste aparelho, mas não na nuvem: ${state.cloud.error} Tento de novo sozinho em instantes.`,
      "warn",
      12000,
    );
    retrySoon();
  }
  state.cloud.busy = false;
  if (state.prefs.tab === "portfolio") hooks.render();
}

let retryTimer = null;
/** Falha de rede/permissão: tenta sincronizar de novo em 30 s (a cópia local mais nova é enviada). */
function retrySoon() {
  clearTimeout(retryTimer);
  retryTimer = setTimeout(() => {
    syncCloud({ force: true }).then((changed) => {
      if (changed) watchHandler?.();
      else if (state.prefs.tab === "portfolio" || state.prefs.tab === "settings") hooks.render();
    });
  }, 30000);
}

let watchHandler = null;
/**
 * Mantém os aparelhos em dia: ao voltar para o app, ao recuperar a rede e a cada minuto com o app visível,
 * puxa a carteira da nuvem (independe da atualização de preços, que para com o mercado fechado).
 * onChanged() é chamado quando a carteira local mudou por causa de outro aparelho.
 */
export function watchCloud(onChanged) {
  watchHandler = onChanged;
  const tick = () => {
    if (document.hidden || !cloud.cloudUser()) return;
    syncCloud({ force: true }).then((changed) => changed && onChanged());
  };
  document.addEventListener("visibilitychange", tick);
  addEventListener("online", tick);
  addEventListener("focus", tick);
  setInterval(tick, 60000);
}

/** Puxa/empurra conforme o lado mais recente. Devolve true se a carteira local mudou. */
/** Envia as watchlists para a nuvem (melhor esforço: sem login ou sem rede, ficam só no aparelho). */
export async function pushLists() {
  if (!cloud.cloudUser()) return;
  try {
    await cloud.pushWatchlists(state.prefs.watchlists ?? []);
  } catch {
    /* tenta de novo na próxima sincronização */
  }
}

export async function syncCloud({ force = false } = {}) {
  if (!cloud.cloudUser()) return false;
  if (!force && Date.now() - state.cloud.pulledAt < 60000) return false;
  state.cloud.pulledAt = Date.now();
  state.cloud.busy = true;
  let changed = false;
  try {
    const remote = await cloud.pullPortfolio();
    const act = cloud.reconcile(state.portfolio, remote);
    if (act === "pull") {
      // carteira vazia na nuvem = apagada em outro aparelho
      state.portfolio = remote.holdings?.length ? remote : null;
      if (!state.portfolio) state.valuation = null;
      store.set("pendulo.portfolio", state.portfolio);
      changed = true;
    } else if (act === "push") {
      state.portfolio.updatedAt = await cloud.pushPortfolio(state.portfolio);
      store.set("pendulo.portfolio", state.portfolio);
    }
    Object.assign(state.cloud, { error: null, syncedAt: hhmm() });
    pushLists();
    if (await syncTrades()) changed = true;
    if (await syncJournal()) changed = true;
    await syncSettings(); // edições: redesenha pelo initSettingsSync, sem o aviso de carteira
    const broker = await cloud.pullBroker().catch(() => state.broker ?? null);
    if (broker?.syncedAt !== state.broker?.syncedAt) {
      changed = true;
      state.brokerHist = broker
        ? await cloud.pullBrokerHist().catch(() => state.brokerHist ?? [])
        : [];
      state.brokerDaily = broker
        ? await cloud.pullBrokerDaily().catch(() => state.brokerDaily ?? [])
        : [];
      state.offPerf = broker ? await cloud.pullOffshorePerf().catch(() => state.offPerf ?? []) : [];
    }
    state.broker = broker;
  } catch (e) {
    state.cloud.error = cloud.authMessage(e);
    if (!cloud.cloudUser())
      state.cloud.error = "Sessão expirada. Entre de novo em Configurações › Conta.";
  }
  state.cloud.busy = false;
  return changed;
}

// ───────────── edições do usuário na nuvem (assets/settings-sync.js) ─────────────
let rawSet = null;
let rawGet = null;
let rawDel = null;
let stamps = {};
let settingsTimer = null;
let settingsBusy = null;
let onSettingsApplied = null;

/**
 * Liga a sincronia das edições: toda gravação local das chaves acompanhadas ganha carimbo e sobe para a
 * nuvem em ~1,5 s; edições vindas de outro aparelho chamam onApplied(chaves de armazenamento).
 */
export function initSettingsSync(onApplied) {
  if (rawSet || typeof localStorage === "undefined") return;
  onSettingsApplied = onApplied;
  const P = Storage.prototype;
  rawSet = P.setItem;
  rawGet = P.getItem;
  rawDel = P.removeItem;
  try {
    stamps = JSON.parse(rawGet.call(localStorage, STAMPS_KEY) ?? "{}") ?? {};
  } catch {
    stamps = {};
  }
  const touch = (store, k, next) => {
    const old = rawGet.call(store, k);
    return () => {
      stampChanges(k, old, next, stamps);
      rawSet.call(localStorage, STAMPS_KEY, JSON.stringify(stamps));
      clearTimeout(settingsTimer);
      settingsTimer = setTimeout(() => syncSettings(), 1500);
    };
  };
  P.setItem = function (k, v) {
    if (this !== localStorage || !tracked(k)) return rawSet.call(this, k, v);
    const after = touch(this, k, String(v));
    rawSet.call(this, k, v);
    after();
  };
  P.removeItem = function (k) {
    if (this !== localStorage || !tracked(k)) return rawDel.call(this, k);
    const after = touch(this, k, null);
    rawDel.call(this, k);
    after();
  };
}

/** Puxa, mescla (a edição mais nova vence, chave a chave) e grava. Devolve true se algo local mudou. */
export async function syncSettings() {
  if (!rawSet || !cloud.cloudUser()) return false;
  if (settingsBusy) return settingsBusy;
  settingsBusy = (async () => {
    try {
      const remote = (await cloud.pullSettings())?.data ?? {};
      const get = (k) => rawGet.call(localStorage, k);
      const { merged, pull, push } = mergeBundles(localBundle(get, stamps), remote);
      let touched = [];
      if (pull.length) {
        touched = applyRemote(pull, merged, {
          get,
          set: (k, v) => rawSet.call(localStorage, k, v),
          del: (k) => rawDel.call(localStorage, k),
        });
        for (const k of pull) stamps[k] = merged[k].at;
        rawSet.call(localStorage, STAMPS_KEY, JSON.stringify(stamps));
      }
      if (push) await cloud.pushSettings(merged);
      if (touched.length) onSettingsApplied?.(touched);
      return touched.length > 0;
    } catch {
      return false; // sem rede: tenta de novo na próxima sincronia (a cada minuto ou ao voltar ao app)
    } finally {
      settingsBusy = null;
    }
  })();
  return settingsBusy;
}
