import { fetchQuotes } from "./quote-hub.js";
import { ratesChange, ratesClick } from "./rates-view.js";
import { pairsChange, pairsClick } from "./pairs-view.js";
import { deskChange } from "./pair-desk-view.js";
import { perfClick } from "./perf-view.js";
import { notifOn, setNotif } from "./notif-prefs.js";
import { assetNewsPopHtml, newsByAsset, outliersPopHtml } from "./asset-news.js";
import { BADGED, OUT, sparkPick, sparkUnpick } from "./dash.js";
// Eventos globais: cliques por data-attributes, teclado, mouse e redimensionamento.
import { applyManualPrices } from "./engine.js";
import { nyDate } from "./live.js";
import { decSep, setDecimalSep } from "./format.js";
import { brokerView, nextManual, withManual } from "./btg.js";
import { addDays, brDay } from "./pf-history.js";
import {
  parseNumber,
  parseInvestingPortfolio,
  removeHolding,
  upsertHolding,
  valuePortfolio,
  withNight,
} from "./portfolio.js";
import {
  btgCashForm,
  btgItemForm,
  openAddHolding,
  openEditHolding,
  openHolding,
  previewHTML,
} from "./portfolio-view.js";
import { DASH_H, PEND_HOURS } from "./dash.js";
import { openNewsPop, toggleTag } from "./news-view.js";
import { installHelp, promptInstall } from "./pwa.js";
import {
  REPLAY_DAYS,
  drawFlowDynamic,
  drawRotation,
  flowFoldDefault,
  flowTooltip,
  openFlowAsset,
} from "./flow-view.js";
import { BR_FLOW_PREFS } from "./br-flow.js";
import { openAssetPage } from "./search-view.js";
import { openRegimeHistory, selectRegimeWindow } from "./regime-history-view.js";
import { GROUPS, TAB_ALIAS, hooks, savePrefs, state, store } from "./state.js";
import { toast } from "./widgets.js";
import { closeDrawer, openDrawer } from "./charts.js";
import { openAsset, openManual } from "./drawers.js";
import { setPortfolio, syncCloud } from "./cloud-sync.js";
import { refreshBtg } from "./btg-sync.js";
import { bellClick, computeSignals, openNotifCenter, osNotify } from "./signal-center.js";
import { clearLog } from "./notif-log.js";
import { showNote } from "./notif-center.js";
import {
  DESK_MORE,
  DESK_PAGE,
  colOrder,
  deleteList,
  loadDesk,
  moveCol,
  picked,
  saveList,
} from "./desk.js";
import { runSim } from "./sim-view.js";
import { loadVerify } from "./checks-center.js";
import { hardRefresh, manualReload } from "./site-update.js";
import { ta } from "./ta-data.js";
import { loadDashExtra, loadFundamentals, loadWeekendNews } from "./feeds.js";
import { ADDABLE, normalizeExtra } from "./dash-extra.js";
import * as cloud from "./cloud.js";
import { enablePush, disablePush, refreshPush, pushStatus } from "./push.js";

/** Liga cliques, teclado, mouse e redimensionamento. `h` traz as funções do app que os eventos disparam. */
/** Zera os prazos dos caches em memória para o Recarregar manual buscar tudo de novo. */
function resetCaches() {
  state.fundAt = 0;
  ta.ohlcAt = 0;
}

/** Fluxo aberto: Offshore ("flow") ou Onshore ("brflow", com preferências próprias). */
const onFlowTab = () => state.prefs.tab === "flow" || state.prefs.tab === "brflow";
const flowKey = (k) => (state.prefs.tab === "brflow" ? BR_FLOW_PREFS[k] : k);

export function initEvents(h) {
  const { render, load, applySnapshot, setAutoReload, setBack, toggleReplay, flowCtx, pfCtx } = h;
  // Mercados › Juros: curva, comparações por atalho e data livre
  document.addEventListener("click", (e) => ratesClick(e));
  document.addEventListener("change", (e) => ratesChange(e));
  // Gatilhos › Pares long × short: base, alvos, custo e escolha dos pares
  document.addEventListener("click", (e) => pairsClick(e));
  document.addEventListener("change", (e) => pairsChange(e));
  document.addEventListener("change", (e) => deskChange(e)); // Carteira › Duplas L/S
  document.addEventListener("click", (e) => perfClick(e)); // Carteira › Performance (janela)
  // Painel: "+" no cabeçalho do quadro abre o campo; × tira o ativo acrescentado (sem abrir a linha)
  document.addEventListener(
    "click",
    (e) => {
      const add = e.target.closest("[data-dash-add]");
      const del = e.target.closest("[data-dash-del]");
      if (!add && !del) return;
      e.stopPropagation();
      e.preventDefault();
      if (add)
        state.dashAdding = add.dataset.dashAdd && state.dashAdding !== add.dataset.dashAdd ? add.dataset.dashAdd : null; // prettier-ignore
      else {
        const t = del.dataset.dashDel;
        const list = (state.prefs.dashExtra?.[t] ?? []).filter((x) => x.sym !== del.dataset.dsym);
        state.prefs.dashExtra = { ...state.prefs.dashExtra, [t]: list };
        if (!list.length) delete state.prefs.dashExtra[t];
        savePrefs();
      }
      render();
      document.querySelector(".dp-form input")?.focus();
    },
    true,
  );
  document.addEventListener("submit", (e) => {
    const f = e.target.closest("[data-dash-form]");
    if (!f) return;
    e.preventDefault();
    const t = f.dataset.dashForm;
    const x = normalizeExtra(ADDABLE[t], f.elements.q.value);
    if (!x) return void toast("Símbolo inválido. Ex.: USD/CNY, EWJ, ^N225, ADA.", "warn");
    const list = state.prefs.dashExtra?.[t] ?? [];
    if (list.some((y) => y.sym === x.sym)) return void toast(`${x.label} já está em ${t}.`, "warn");
    if (list.length >= 12) return void toast("Até 12 ativos extras por quadro.", "warn");
    state.prefs.dashExtra = { ...state.prefs.dashExtra, [t]: [...list, x] };
    state.dashMiss?.delete(x.sym);
    state.dashAdding = null;
    savePrefs();
    render();
    loadDashExtra();
  });
  // Popup da notícia: abre ao tocar na manchete, fecha ao tocar fora, no ✕ ou com Esc
  function closeNewsPop() {
    document.querySelector(".npop-back")?.remove();
  }
  document.addEventListener("click", (e) => {
    const nc = e.target.closest("[data-ncat]");
    if (nc) return void openNotifCenter(nc.dataset.ncat);
    if (e.target.closest("[data-nnote-close]")) return void e.target.closest(".nnote")?.remove();
    const nl = e.target.closest("[data-notif-url]");
    if (nl) {
      hooks.openTarget?.(nl.dataset.notifUrl);
      showNote({ title: nl.dataset.nt, body: nl.dataset.nb, at: Number(nl.dataset.nat) || 0 });
    }
    if (e.target.closest(".out-tbl tr[data-sym], .out-tbl tr[data-sr-open]")) closeNewsPop(); // linha do popup abre o gráfico
    const pop = e.target.closest("[data-news-pop]");
    if (pop) {
      const it = [...(state.news?.items ?? []), ...(state.newsWknd?.items ?? [])].find((x) => x.link === pop.dataset.newsPop); // prettier-ignore
      if (!it) return;
      openNewsPop(it);
    } else if (e.target.matches("[data-npop-close]")) closeNewsPop();
  });
  // "!" na linha do ativo (Painel): abre as manchetes do dia que podem explicar a variação
  document.addEventListener(
    "click",
    (e) => {
      const o = e.target.closest("[data-outlier],[data-outlier-list]");
      if (o) {
        e.stopPropagation();
        e.preventDefault();
        closeNewsPop();
        document.body.insertAdjacentHTML(
          "beforeend",
          outliersPopHtml(OUT, o.dataset.outlier ?? null, state.prefs.tab === "local" ? "Brasil" : undefined), // prettier-ignore
        );
        document.querySelector(".npop-x")?.focus();
        return;
      }
      const rh = e.target.closest("[data-reg-hist],[data-reg-win]");
      if (rh) {
        e.preventDefault();
        if (rh.dataset.regWin) selectRegimeWindow(rh.dataset.regWin);
        else openRegimeHistory();
        return;
      }
      const hs = e.target.closest("[data-home-sym]");
      if (hs) {
        e.preventDefault();
        openAssetPage(hs.dataset.homeSym);
        return;
      }
      const b = e.target.closest("[data-asset-news]");
      if (!b) return;
      e.stopPropagation();
      e.preventDefault();
      const sym = b.dataset.assetNews;
      const items = newsByAsset(state.news?.items)[sym] ?? [];
      if (!items.length) return;
      const m = BADGED[sym] ?? {};
      const chgText = !Number.isFinite(m.c)
        ? ""
        : m.kind === "yld"
          ? `${m.c > 0 ? "+" : "−"}${Math.abs(m.c).toFixed(0)} bps`
          : `${m.c > 0 ? "+" : "−"}${(Math.abs(m.c) * 100).toFixed(2).replace(".", decSep())}%`;
      const label = b.closest("tr")?.querySelector(".nm")?.textContent?.trim() || sym;
      closeNewsPop();
      document.body.insertAdjacentHTML(
        "beforeend",
        assetNewsPopHtml({ label, chgText, up: m.c > 0, items }),
      );
      document.querySelector(".npop-x")?.focus();
    },
    true,
  );
  // Mini-gráficos do Painel: tocar/clicar na curva mostra data, valor e variação do ponto (não abre o ativo)
  const spOf = (e) => e.target.closest?.(".dp td.s")?.querySelector("svg.sp[data-v]");
  let spHover = null;
  document.addEventListener(
    "click",
    (e) => {
      const sp = spOf(e);
      sparkUnpick();
      if (!sp) return;
      e.stopPropagation();
      e.preventDefault();
      sparkPick(sp, e.clientX);
    },
    true,
  );
  document.addEventListener("pointermove", (e) => {
    if (e.pointerType !== "mouse") return;
    const sp = spOf(e);
    if (sp !== spHover) sparkUnpick();
    spHover = sp;
    if (sp) sparkPick(sp, e.clientX);
  });
  addEventListener("scroll", sparkUnpick, { passive: true, capture: true });
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") closeNewsPop();
    const nl = e.key === "Enter" && e.target.closest?.(".ncenter [data-notif-url]");
    if (nl) {
      closeNewsPop();
      hooks.openTarget?.(nl.dataset.notifUrl);
      showNote({ title: nl.dataset.nt, body: nl.dataset.nb, at: Number(nl.dataset.nat) || 0 });
    }
  });

  document.addEventListener("click", (e) => {
    // balão de sinais da Carteira: tocar fora (ou dentro do texto) fecha sem abrir o ativo
    if (
      state.pfSigOpen &&
      Object.keys(state.pfSigOpen).length &&
      !e.target.closest("[data-pf-sig]")
    ) {
      state.pfSigOpen = {};
      render();
      if (e.target.closest(".pf-sigpop, tr[data-hold]")) return;
    }
    const t = e.target.closest(
      "[data-set],[data-setpref],[data-notif],[data-pf-open],[data-pf-col],[data-pf-sig],[data-trim-pick],[data-quiet],[data-wknd],[data-news-f],[data-news-tag],[data-dash-h],[data-pend-h],[data-action],[data-tab],[data-asset],[data-fh],[data-fsize],[data-group],[data-sym],[data-hold]",
    );
    if (!t) return;
    const d = t.dataset;
    if (d.set) {
      state.prefs.setTab = d.set;
      savePrefs();
      render();
    } else if (d.pfCol) {
      // colunas da tabela de posições: guarda as escondidas
      const hide = new Set(state.prefs.pfHide ?? []);
      if (hide.has(d.pfCol)) hide.delete(d.pfCol);
      else hide.add(d.pfCol);
      state.prefs.pfHide = [...hide];
      savePrefs();
      render();
    } else if (d.pfSig) {
      // balão com o texto dos sinais daquele ativo (um aberto por vez; não fica salvo)
      state.pfSigOpen = state.pfSigOpen?.[d.pfSig] ? {} : { [d.pfSig]: true };
      render();
    } else if (d.notif) {
      state.prefs = Object.assign(
        state.prefs,
        setNotif(state.prefs, d.notif, !notifOn(state.prefs, d.notif)),
      );
      savePrefs();
      render();
      refreshPush(); // o servidor respeita a escolha
    } else if (d.pfOpen) {
      state.prefs.pfOpen = {
        ...(state.prefs.pfOpen ?? {}),
        [d.pfOpen]: !state.prefs.pfOpen?.[d.pfOpen],
      };
      savePrefs();
      render();
    } else if (d.trimPick) {
      const picks = { ...(state.prefs.trimPicks ?? {}) };
      const next = { undefined: "reduce", reduce: "add", add: undefined }[picks[d.trimPick]];
      if (d.trimSet) picks[d.trimPick] = picks[d.trimPick] === d.trimSet ? undefined : d.trimSet;
      else picks[d.trimPick] = next;
      if (!picks[d.trimPick]) delete picks[d.trimPick];
      state.prefs.trimPicks = picks;
      savePrefs();
      render();
      refreshPush(); // o servidor vigia as marcadas com o app fechado
    } else if (d.quiet) {
      state.prefs.weekendQuiet = !state.prefs.weekendQuiet;
      savePrefs();
      render();
      refreshPush(); // o servidor também silencia o push
    } else if (d.wknd) {
      state.prefs.newsWknd = !state.prefs.newsWknd;
      savePrefs();
      render();
      if (state.prefs.newsWknd) loadWeekendNews();
    } else if (d.setpref) {
      state.prefs[d.setpref] = d.val;
      if (d.setpref === "numSep") setDecimalSep(d.val);
      savePrefs();
      render();
      if (d.setpref === "sigAlerts" || d.setpref === "newsAlerts") refreshPush(); // o servidor respeita a escolha
    } else if (d.newsTag) {
      state.prefs.newsTags = toggleTag(state.prefs.newsTags, d.newsTag);
      savePrefs();
      render();
      refreshPush(); // o servidor usa as mesmas tags nos avisos
    } else if (d.newsF) {
      state.prefs.newsF = d.newsF;
      savePrefs();
      render();
    } else if (d.pendH && (DASH_H[d.pendH] || PEND_HOURS[d.pendH])) {
      // janela do pêndulo da Início (só a tela; avisos seguem no regime do dia)
      state.prefs.pendH = d.pendH;
      savePrefs();
      render();
    } else if (d.dashH && DASH_H[d.dashH]) {
      state.prefs.dashH = d.dashH;
      savePrefs();
      render();
    } else if (d.tab) {
      if (state.playing) toggleReplay();
      if (d.tab === "settings" && d.sub) state.prefs.setTab = d.sub;
      state.prefs.tab = TAB_ALIAS[d.tab] ?? d.tab;
      savePrefs();
      render();
    } else if (d.fh || d.fsize || d.group) {
      const k = flowKey;
      if (d.fh) state.prefs[k("flowHorizon")] = d.fh;
      if (d.fsize) state.prefs[k("flowSize")] = d.fsize;
      if (d.group)
        state.prefs[k("flowGroup")] = state.prefs[k("flowGroup")] === d.group ? "all" : d.group;
      savePrefs();
      if (!onFlowTab()) state.prefs.tab = "flow";
      render();
    } else if (d.hold) openHolding(pfCtx(), d.hold);
    else if (d.sym)
      state.prefs.tab === "brflow" ? openAssetPage(d.sym) : openFlowAsset(flowCtx(), d.sym);
    else if (d.action === "flow-strong") {
      state.prefs[flowKey("flowStrong")] = !state.prefs[flowKey("flowStrong")];
      savePrefs();
      render();
    } else if (d.action === "clear-notif-log") {
      clearLog();
      if (document.querySelector(".ncenter")) openNotifCenter();
      render();
    } else if (d.action === "hard-refresh") hardRefresh();
    else if (d.action === "pend-refresh") hooks.refreshPendulum?.();
    else if (d.action === "verify-now") loadVerify({ force: true });
    else if (d.action === "install")
      promptInstall().then((done) => {
        if (!done) openDrawer(installHelp());
      });
    else if (d.action === "bell") bellClick(render);
    else if (d.action === "push-on")
      enablePush()
        .then(() => {
          toast("Avisos ativados neste aparelho, mesmo com o app fechado.", "ok");
        })
        .catch((err) => toast(err.message, "warn", 12000))
        .then(() => pushStatus())
        .then((st) => {
          state.pushState = st;
          render();
        });
    else if (d.action === "push-off")
      disablePush()
        .then(() => pushStatus())
        .then((st) => {
          state.pushState = st;
          toast("Avisos com o app fechado desligados neste aparelho.", "ok");
          render();
        });
    else if (d.action === "notify-enable") {
      if (typeof Notification === "undefined")
        return toast("Este navegador não suporta notificações.", "warn");
      Notification.requestPermission().then((p) => {
        toast(
          p === "granted" ? "Notificações ativadas." : "Notificações não autorizadas no navegador.",
          p === "granted" ? "ok" : "warn",
        );
        if (p === "granted")
          osNotify(
            "Notificações ativas",
            "Você será avisado de novos sinais enquanto a página estiver aberta.",
            undefined,
            { log: false },
          );
        render();
      });
    } else if (d.action === "pf-preview") {
      const txt = document.getElementById("pfText").value;
      state.pfParsed = parseInvestingPortfolio(txt);
      document.getElementById("pfPreview").innerHTML = previewHTML(state.pfParsed);
      // Confere a ordem de grandeza com a cotação online e relê se o separador decimal mudar algo.
      const syms = state.pfParsed.holdings.map((h) => h.sym).slice(0, 60);
      if (syms.length)
        fetchQuotes(syms, { force: true, bg: false })
          .then((q) => {
            const refPrices = Object.fromEntries(
              Object.entries(q?.quotes ?? {})
                .filter(([, v]) => v?.p > 0)
                .map(([k, v]) => [k, v.p]),
            );
            if (!Object.keys(refPrices).length || document.getElementById("pfText")?.value !== txt)
              return;
            state.pfParsed = parseInvestingPortfolio(txt, { refPrices });
            document.getElementById("pfPreview").innerHTML = previewHTML(state.pfParsed);
          })
          .catch(() => {});
    } else if (d.action === "pf-cancel") {
      state.pfParsed = null;
      state.pfText = "";
      document.getElementById("pfText").value = "";
      document.getElementById("pfPreview").innerHTML = "";
    } else if (d.action === "pf-save" && state.pfParsed?.holdings.length) {
      const today = nyDate(Date.now() / 1000);
      state.portfolio = {
        importedAt: new Date().toISOString(),
        source: "Investing.com",
        // posição comprada hoje (detectada pelo parser) guarda a data para o cálculo do "dia"
        holdings: state.pfParsed.holdings.map(({ boughtToday, ...h }) =>
          boughtToday ? { ...h, openedOn: today } : h,
        ),
        // com conta BTG, a importação vira ajuste por cima da foto: vale até o BTG mandar posições mais novas
        // (leitura completa sobrescreve; leitura sem o exterior ativo a ativo mantém o importado)
        ...(state.broker?.summary ? { manual: nextManual(state.broker, null, {}) } : {}),
      };
      setPortfolio(state.portfolio);
      state.prefs.tab = "portfolio";
      savePrefs();
      toast(
        `Carteira salva${cloud.cloudUser() ? " (e na nuvem)" : ""}: ${state.portfolio.holdings.length} posições. Buscando cotações e histórico…`,
        "ok",
      );
      state.pfParsed = null;
      state.pfText = "";
      load({ notify: true });
    } else if (d.action === "pf-export" && state.portfolio) {
      const blob = new Blob([JSON.stringify(state.portfolio, null, 2)], {
        type: "application/json",
      });
      const a = Object.assign(document.createElement("a"), {
        href: URL.createObjectURL(blob),
        download: `carteira-${new Date().toISOString().slice(0, 10)}.json`,
      });
      a.click();
      URL.revokeObjectURL(a.href);
    } else if (d.action === "pf-clear") {
      if (
        !confirm(
          cloud.cloudUser()
            ? "Apagar a carteira deste aparelho E da nuvem?"
            : "Apagar a carteira salva neste navegador?",
        )
      )
        return;
      setPortfolio(null).then(() => load());
    } else if (d.action === "cloud-out") {
      cloud.signOut().then(() => {
        Object.assign(state.cloud, { syncedAt: null, error: null, info: null });
        toast("Você saiu da nuvem. A carteira continua neste aparelho.", "ok");
        render();
      });
    } else if (d.action === "replay") toggleReplay();
    else if (d.asset) openAsset(d.asset);
    else if (d.action === "close") closeDrawer();
    else if (d.action === "btg-refresh") refreshBtg(load);
    else if (d.action === "pf-day") {
      const step = +d.step;
      const today = brDay(Date.now());
      state.pfDay = !step ? null : addDays(state.pfDay ?? today, step);
      if (state.pfDay && state.pfDay > today) state.pfDay = today;
      render();
    } else if (d.action === "btg-item-add")
      openDrawer(`<h2 style="padding-right:30px">Incluir produto no Brasil</h2>${btgItemForm()}`); // prettier-ignore
    else if (d.action === "btg-item-edit") {
      const i = btgNow()?.items.find((x) => x.idx === +d.idx);
      if (i) openDrawer(`<h2 style="padding-right:30px">Editar produto</h2>${btgItemForm(i)}`);
    } else if (d.action === "btg-item-remove") {
      if (!confirm("Remover este produto da carteira Brasil (ajuste manual)?")) return;
      closeDrawer();
      saveBtgManual({ items: btgItems().filter((_, k) => k !== +d.idx) });
      toast("Produto removido (ajuste manual).", "ok");
    } else if (d.action === "btg-cash-edit")
      openDrawer(`<h2 style="padding-right:30px">Caixa da conta internacional</h2>${btgCashForm(btgNow()?.cashUsd)}`); // prettier-ignore
    else if (d.action === "btg-manual-clear" && state.portfolio) {
      if (!confirm("Descartar os ajustes manuais e voltar à foto do BTG? As posições internacionais voltam às da foto.")) return; // prettier-ignore
      const snap = state.broker?.summary?.offshore?.positions ?? [];
      const keep = new Map(state.portfolio.holdings.map((h) => [h.sym, h]));
      const holdings = snap.map((p) => ({ ...keep.get(p.sym), sym: p.sym, qty: p.qty, avg: p.avg, invPrice: p.price, invValue: p.value, manual: undefined })); // prettier-ignore
      state.portfolio = { ...state.portfolio, manual: null };
      editHoldings(holdings, { keepManual: true });
      toast("Ajustes descartados: carteira de volta à foto do BTG.", "ok");
    } else if (d.action === "hold-add") openAddHolding(pfCtx());
    else if (d.action === "hold-edit") openEditHolding(pfCtx(), d.holdSym);
    else if (d.action === "hold-remove" && state.portfolio) {
      if (!confirm(`Remover ${d.holdSym} da carteira?`)) return;
      closeDrawer();
      editHoldings(removeHolding(state.portfolio.holdings, d.holdSym));
      toast(`${d.holdSym} removido da carteira.`, "ok");
    } else if (d.action === "routine-info") toast(t.title, "warn");
    else if (d.action === "reload")
      manualReload(load, { resetCaches }).then(() => loadFundamentals());
    else if (d.action === "open-manual") openManual();
    else if (d.action === "apply-manual") {
      const text = document.getElementById("manualTxt").value;
      const { prices, applied, ignored } = applyManualPrices(state.prices, text);
      if (applied.length) {
        applySnapshot(prices);
        // Guarda o texto (não a tabela): reaplicado sobre as cotações ao vivo a cada atualização.
        store.set("pendulo.manual", { base: state.base.meta?.updated_at_brt, text });
        render();
      }
      document.getElementById("manualMsg").textContent =
        `${applied.length} aplicado(s)${ignored.length ? `; ignorado(s): ${ignored.join(" | ")}` : ""}.`;
    } else if (d.action === "reset-manual") {
      store.set("pendulo.manual", null);
      closeDrawer();
      load();
    } else if (d.action === "export-prices") {
      const blob = new Blob([JSON.stringify(state.prices)], { type: "application/json" });
      const a = Object.assign(document.createElement("a"), {
        href: URL.createObjectURL(blob),
        download: "prices.json",
      });
      a.click();
      URL.revokeObjectURL(a.href);
    }
  });

  document.addEventListener("change", async (e) => {
    if (e.target.id === "pfDay") {
      state.pfDay = /^\d{4}-\d{2}-\d{2}$/.test(e.target.value) ? e.target.value : null;
      render();
      return;
    }
    if (e.target.id === "pfFile" && e.target.files?.[0]) {
      try {
        const data = JSON.parse(await e.target.files[0].text());
        if (
          !Array.isArray(data?.holdings) ||
          !data.holdings.every((h) => h.sym && h.qty > 0 && h.avg > 0)
        )
          throw new Error("arquivo não é um backup de carteira");
        state.portfolio = { ...data, importedAt: data.importedAt ?? new Date().toISOString() };
        setPortfolio({ ...state.portfolio, updatedAt: new Date().toISOString() });
        toast(`Backup restaurado: ${data.holdings.length} posições.`, "ok");
        load({ notify: true });
      } catch (err) {
        toast(`Não consegui restaurar: ${err.message}`, "bad");
      }
      return;
    }
    const key = e.target.dataset?.pref;
    if (key) {
      const v = e.target.type === "checkbox" ? e.target.checked : e.target.value;
      state.prefs[key] = v;
      savePrefs();
      render();
    } else if (e.target.id === "autoReload") {
      state.prefs.autoReload = e.target.value === "auto" ? "auto" : Number(e.target.value);
      savePrefs();
      setAutoReload();
    }
  });

  document.addEventListener("input", (e) => {
    if (e.target.id === "pfText") {
      state.pfText = e.target.value;
      return;
    }
    if (e.target.id === "flowBack") {
      if (state.playing) toggleReplay();
      return setBack(REPLAY_DAYS - 1 - Number(e.target.value));
    }
  });

  // News: lembra quais seções ficaram abertas ou recolhidas ("toggle" não borbulha: captura)
  document.addEventListener(
    "toggle",
    (e) => {
      const sec = e.target.dataset?.newsSec;
      if (!sec) return;
      state.prefs.newsOpen = { ...(state.prefs.newsOpen ?? {}), [sec]: e.target.open };
      savePrefs();
    },
    true,
  );

  // Fluxo: cada bloco abre e recolhe; lembra a escolha e, ao abrir, redesenha o que mede a largura (mapa, gráfico)
  document.addEventListener(
    "toggle",
    (e) => {
      const key = e.target.dataset?.flowFold;
      if (!key) return;
      const open = e.target.open;
      const was = (state.prefs.flowOpen ?? {})[key] ?? flowFoldDefault(key); // padrão (celular: quase tudo fechado)
      if (was === open) return; // o próprio desenho reaplicou o estado: nada mudou
      state.prefs.flowOpen = { ...(state.prefs.flowOpen ?? {}), [key]: open };
      savePrefs();
      if (open && state.fctx) {
        drawFlowDynamic(state.fctx);
        drawRotation(state.fctx);
      }
      syncFoldAll();
    },
    true,
  );
  /** Rótulo do botão "Recolher tudo / Expandir tudo" conforme os blocos abertos. */
  function syncFoldAll() {
    const b = document.querySelector("[data-flow-fold-all]");
    if (!b) return;
    const any = [...document.querySelectorAll("[data-flow-fold]")].some((d) => d.open);
    b.dataset.flowFoldAll = any ? "close" : "open";
    b.textContent = any ? "⊟ Recolher tudo" : "⊞ Expandir tudo";
  }
  document.addEventListener("click", (e) => {
    const b = e.target.closest?.("[data-flow-fold-all]");
    if (!b) return;
    const open = b.dataset.flowFoldAll === "open";
    const all = [...document.querySelectorAll("[data-flow-fold]")];
    state.prefs.flowOpen = { ...(state.prefs.flowOpen ?? {}), ...Object.fromEntries(all.map((d) => [d.dataset.flowFold, open])) }; // prettier-ignore
    savePrefs();
    for (const d of all) d.open = open;
    if (open && state.fctx) {
      drawFlowDynamic(state.fctx);
      drawRotation(state.fctx);
    }
    syncFoldAll();
  });

  /** Aplica um ajuste manual nas posições: grava (local + nuvem) e recalcula valor e sinais na hora. */
  /** Foto do BTG com o ajuste manual atual, no formato da tela (null sem conta BTG). */
  function btgNow() {
    const pf = state.portfolio;
    return brokerView(withManual(state.broker, pf?.holdings, pf?.manual));
  }
  /** Produtos do Brasil como estão agora (foto ou ajuste), na ordem original. */
  function btgItems() {
    const pf = state.portfolio;
    return withManual(state.broker, pf?.holdings, pf?.manual)?.summary?.onshore?.items ?? [];
  }
  /** Grava um ajuste manual sobre a foto do BTG (Brasil e caixa); vale na nuvem até a próxima leitura boa. */
  function saveBtgManual(patch) {
    if (!state.broker?.summary) return;
    const pf = state.portfolio ?? {
      importedAt: new Date().toISOString(),
      source: "BTG",
      holdings: [],
    };
    const manual = nextManual(state.broker, pf.manual, patch);
    setPortfolio({ ...pf, manual, updatedAt: null });
    render();
  }

  function editHoldings(holdings, { keepManual = false } = {}) {
    if (!holdings.length) {
      setPortfolio(null);
      state.signals = computeSignals();
      return render();
    }
    // com conta BTG, mexer nas posições vira ajuste manual por cima da foto (cartões e pesos acompanham)
    const manual =
      state.broker?.summary && !keepManual
        ? nextManual(state.broker, state.portfolio?.manual, {})
        : state.portfolio?.manual;
    setPortfolio({ ...state.portfolio, holdings, manual, updatedAt: null });
    state.valuation = valuePortfolio(holdings, withNight(state.live?.quotes, state.night), {
      today: nyDate(Date.now() / 1000),
    });
    state.signals = computeSignals();
    render();
  }

  // Aba Decisões: watchlists (trocar, criar, editar, excluir, atualizar)
  document.addEventListener("click", (e) => {
    const t = e.target.closest("[data-desk-list],[data-desk-new],[data-desk-edit],[data-desk-del],[data-desk-refresh],[data-desk-filter]"); // prettier-ignore
    if (!t) return;
    const d = t.dataset;
    if (d.deskList !== undefined) {
      state.prefs.deskList = d.deskList;
      state.deskPage = null;
      state.deskForm = state.deskEdit = false;
      savePrefs();
    } else if (t.hasAttribute("data-desk-new")) {
      state.deskForm = !state.deskForm;
      state.deskEdit = false;
    } else if (t.hasAttribute("data-desk-edit")) {
      state.deskEdit = !state.deskEdit;
      state.deskForm = false;
    } else if (d.deskDel) {
      if (!confirm("Excluir esta watchlist?")) return;
      deleteList(d.deskDel);
      state.deskEdit = false;
    } else if (d.deskFilter) {
      state.deskFilter = state.deskFilter === d.deskFilter ? null : d.deskFilter;
      state.deskPage = null;
    } else if (t.hasAttribute("data-desk-refresh")) loadDesk(true);
    render();
  });
  // Sinais de hoje: filtros por coluna e colunas arrastáveis (mouse e toque, via pointer events)
  document.addEventListener("change", (e) => {
    const t = e.target.closest("[data-desk-cf]");
    if (!t) return;
    const k = t.dataset.deskCf;
    const f = { ...(state.prefs.deskF ?? {}) };
    if (t.type === "checkbox") {
      // seleção múltipla: marca/desmarca o valor e deixa o menu aberto para escolher outros
      const cur = picked(f[k]).filter((v) => v !== t.value);
      f[k] = t.checked ? [...cur, t.value] : cur;
      state.deskMsOpen = k;
    } else f[k] = t.value;
    state.prefs.deskF = f;
    state.deskPage = null;
    savePrefs();
    render();
  });
  document.addEventListener("click", (e) => {
    const ms = e.target.closest("[data-desk-ms]");
    // menu de seleção múltipla: lembra qual está aberto (sobrevive ao redesenho) e fecha os outros ao clicar fora
    if (e.target.closest("summary") && ms) state.deskMsOpen = ms.open ? null : ms.dataset.deskMs;
    else if (!ms && state.deskMsOpen) {
      state.deskMsOpen = null;
      document
        .querySelectorAll("details[data-desk-ms][open]")
        .forEach((d) => d.removeAttribute("open"));
    }
    const none = e.target.closest("[data-desk-ms-none]");
    if (none) {
      state.prefs.deskF = { ...(state.prefs.deskF ?? {}), [none.dataset.deskMsNone]: [] };
      state.deskPage = null;
    } else if (e.target.closest("[data-desk-cf-clear]")) state.prefs.deskF = {};
    else if (e.target.closest("[data-desk-cols-reset]")) state.prefs.deskCols = [];
    else return;
    savePrefs();
    render();
  });
  let dragCol = null;
  document.addEventListener("pointerdown", (e) => {
    const th = e.target.closest("[data-desk-col]");
    if (!th || e.target.closest(".hq, button, a")) return;
    dragCol = th.dataset.deskCol;
    th.classList.add("dragging");
  });
  document.addEventListener("pointermove", (e) => {
    if (!dragCol) return;
    document.querySelectorAll(".desk-th.drop").forEach((x) => x.classList.remove("drop"));
    document.elementFromPoint(e.clientX, e.clientY)?.closest("[data-desk-col]")?.classList.add("drop"); // prettier-ignore
  });
  document.addEventListener("pointerup", (e) => {
    if (!dragCol) return;
    const from = dragCol;
    dragCol = null;
    document.querySelectorAll(".desk-th.drop,.desk-th.dragging").forEach((x) => x.classList.remove("drop", "dragging")); // prettier-ignore
    const to = document.elementFromPoint(e.clientX, e.clientY)?.closest("[data-desk-col]")?.dataset.deskCol; // prettier-ignore
    if (!to || to === from) return;
    state.prefs.deskCols = moveCol(colOrder(), from, to);
    savePrefs();
    render();
  });
  let qTimer = null;
  document.addEventListener("input", (e) => {
    const t = e.target.closest?.("[data-desk-q]");
    if (!t) return;
    clearTimeout(qTimer);
    qTimer = setTimeout(() => {
      state.prefs.deskF = { ...(state.prefs.deskF ?? {}), q: t.value };
      state.deskPage = null;
      savePrefs();
      render();
      const el = document.querySelector("[data-desk-q]");
      el?.focus();
      el?.setSelectionRange(el.value.length, el.value.length);
    }, 250);
  });
  document.addEventListener("click", (e) => {
    if (!e.target.closest("[data-desk-more]")) return;
    state.deskPage = (state.deskPage ?? DESK_PAGE) + DESK_MORE;
    render();
  });
  // Lista 🏆: filtro por tipo de ativo
  document.addEventListener("click", (e) => {
    const t = e.target.closest("[data-champ-filter]");
    if (!t) return;
    state.prefs.champFilter = t.dataset.champFilter;
    state.deskFilter = null;
    savePrefs();
    render();
  });
  // Aba Simulador: origem, tipo, lista, filtro do balão e recalcular
  document.addEventListener("click", (e) => {
    const t = e.target.closest("[data-sim-set],[data-sim-out],[data-sim-refresh]");
    if (!t) return;
    const d = t.dataset;
    if (d.simSet) {
      state.prefs[d.simSet] = d.v;
      savePrefs();
    } else if (d.simOut) state.simOut = state.simOut === d.simOut ? null : d.simOut;
    else return runSim(true);
    render();
  });
  document.addEventListener("change", (e) => {
    const t = e.target.closest("select[data-setpref-sel]");
    if (!t) return;
    state.prefs[t.dataset.setprefSel] = t.value;
    savePrefs();
    render();
  });
  document.addEventListener("change", (e) => {
    const t = e.target.closest("[data-desk-sector]");
    if (!t) return;
    state.prefs.deskSector = t.value;
    state.prefs.deskList = `sec:${t.value}`;
    state.deskFilter = null;
    savePrefs();
    render();
  });
  document.addEventListener("change", (e) => {
    const t = e.target.closest("[data-sim-list]");
    if (!t) return;
    state.prefs.simList = t.value;
    state.simOut = null;
    savePrefs();
    render();
  });
  document.addEventListener("submit", (e) => {
    const f = e.target.closest("[data-desk-form]");
    if (!f) return;
    e.preventDefault();
    const fd = new FormData(f);
    const l = saveList(fd.get("name"), fd.get("syms"));
    if (!l) return toast("Cole ao menos um ticker válido (máximo de 8 listas).", "warn");
    state.deskForm = state.deskEdit = false;
    toast(`Watchlist "${l.name}" salva com ${l.syms.length} ativo(s).`, "ok");
    render();
  });

  document.addEventListener("submit", (e) => {
    const f = e.target.closest("[data-hold-form]");
    if (!f) return;
    e.preventDefault();
    const from = f.dataset.from || null;
    const r = upsertHolding(state.portfolio?.holdings ?? [], {
      from,
      sym: f.sym.value,
      qty: f.qty.value,
      avg: f.avg.value,
      dec: decSep(),
    });
    const msg = f.querySelector(".hf-msg");
    if (r.error) {
      msg.textContent = r.error;
      msg.hidden = false;
      return;
    }
    const sym = f.sym.value.trim().toUpperCase();
    const isNew = !state.portfolio;
    if (isNew)
      state.portfolio = { importedAt: new Date().toISOString(), source: "manual", holdings: [] };
    closeDrawer();
    editHoldings(r.holdings);
    toast(`${sym} ${from ? "atualizado" : "incluído"} na carteira.`, "ok");
    // ativo novo ainda sem cotação/histórico: busca na hora
    if (!state.live?.quotes?.[sym] || isNew) load();
  });

  // ajuste manual da conta BTG: produto do Brasil e caixa em dólar
  document.addEventListener("submit", (e) => {
    const f = e.target.closest("[data-btg-item-form],[data-btg-cash-form]");
    if (!f) return;
    e.preventDefault();
    const msg = f.querySelector(".hf-msg");
    const fail = (t) => {
      msg.textContent = t;
      msg.hidden = false;
    };
    if (f.matches("[data-btg-cash-form]")) {
      const cash = parseNumber(f.cash.value, decSep());
      if (!(cash >= 0)) return fail("Informe o caixa (zero ou mais).");
      closeDrawer();
      saveBtgManual({ cashUsd: cash });
      return toast("Caixa atualizado (ajuste manual).", "ok");
    }
    const name = f.name.value.trim();
    const value = parseNumber(f.value.value, decSep());
    const cost = f.cost.value.trim() ? parseNumber(f.cost.value, decSep()) : null;
    if (!name) return fail("Informe o nome do produto.");
    if (!(value >= 0)) return fail("Valor bruto inválido.");
    if (cost != null && !(cost >= 0)) return fail("Aplicado inválido.");
    const items = [...btgItems()];
    const idx = f.dataset.idx == null ? -1 : +f.dataset.idx;
    const row = { ...(items[idx] ?? {}), name, value, cost };
    if (idx >= 0 && items[idx]) items[idx] = row;
    else items.push(row);
    closeDrawer();
    saveBtgManual({ items });
    toast(`${idx >= 0 ? "Produto atualizado" : "Produto incluído"} (ajuste manual).`, "ok");
  });

  document.addEventListener("submit", async (e) => {
    const f = e.target.closest("[data-cloud-form]");
    if (!f) return;
    e.preventDefault();
    const signup = e.submitter?.dataset.signup === "1";
    const email = f.email.value.trim();
    const password = f.password.value;
    Object.assign(state.cloud, { busy: true, error: null, info: null });
    render();
    try {
      const r = signup ? await cloud.signUp(email, password) : await cloud.signIn(email, password);
      if (r?.pending) {
        state.cloud.info =
          "Conta criada. Confirme pelo link enviado ao seu e-mail e depois clique em Entrar.";
      } else {
        state.cloud.busy = false;
        const changed = await syncCloud({ force: true });
        toast(
          changed
            ? "Conectado. Carteira carregada da nuvem."
            : state.portfolio
              ? "Conectado. Carteira salva na nuvem."
              : "Conectado à nuvem.",
          "ok",
        );
        if (changed) load();
      }
    } catch (err) {
      state.cloud.error = cloud.authMessage(err);
    }
    state.cloud.busy = false;
    render();
  });

  document.addEventListener("keydown", (e) => {
    const typing = /^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName);
    if (e.key === "Escape") return closeDrawer();
    if (
      (e.key === "Enter" || e.key === " ") &&
      e.target.matches("[data-asset],[data-sym],[data-hold],[data-tab]") &&
      e.target.tagName !== "BUTTON"
    ) {
      e.preventDefault();
      return e.target.click();
    }
    if (typing || e.ctrlKey || e.metaKey || e.altKey) return;
    // 1 a 5: seções (volta à última sub-aba aberta em cada uma)
    const n = Number(e.key);
    if (n >= 1 && n <= GROUPS.length) {
      const g = GROUPS[n - 1];
      const last = state.prefs.groupLast?.[g.id];
      state.prefs.tab = g.tabs.includes(last) ? last : g.tabs[0];
      savePrefs();
      render();
    } else if (e.key.toLowerCase() === "r")
      manualReload(load, { resetCaches }).then(() => loadFundamentals());
  });

  // dica do mapa do Fluxo: no máximo 1 por quadro (cada uma reescreve a dica e mede o tamanho dela)
  let mv = null;
  document.addEventListener("mousemove", (e) => {
    if (!onFlowTab() || !state.fctx) return;
    if (mv) return void (mv = e);
    mv = e;
    requestAnimationFrame(() => {
      const ev = mv;
      mv = null;
      if (onFlowTab() && state.fctx) flowTooltip(state.fctx, ev);
    });
  });
  let resizeTimer = null;
  window.addEventListener("resize", () => {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(() => onFlowTab() && state.fctx && drawFlowDynamic(state.fctx), 200);
  });
}
