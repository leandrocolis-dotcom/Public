// Pêndulo: orquestra carga de dados, renderização e atualização automática. Os cálculos ficam nos motores (engine.js etc.).
import { initWatch } from "./watch-view.js";
import { speedNow } from "./home-view.js";
import { initJournal } from "./journal-view.js";
import { initFixedIncome } from "./fixed-income-view.js";
import { initPendTouch } from "./pend-touch.js";
import { watchTables } from "./table-scroll.js";
import { anyNotifOn } from "./notif-prefs.js";
import {
  applyManualPrices,
  compactSnapshot,
  computeFreshness,
  computeSnapshot,
  diffSnapshots,
  validatePrices,
} from "./engine.js";
import { ASSETS } from "./universe.js";
import { ago, esc, fmtDT, fmtTime, setDecimalSep } from "./format.js";
import { applyLiveToFlow, applyLiveToPrices, lateQuotes, nyDate } from "./live.js";
import { valuePortfolio, withNight } from "./portfolio.js";
import { afterEntry, initEntry } from "./ta-view.js";
import { initUi, reloadUi, renderNav, subNavHtml } from "./ui.js";
import { enhance, initSpotlight } from "./motion.js";
import { FLOW_ASSETS } from "./flow-universe.js";
import { STEPS, nextAuto, usSession } from "./refresh.js";
import { overnightOpen, symOpen } from "./sessions.js";
import { paintPendFloat } from "./pend-float.js";
import { liveReversal, paintRevBanner } from "./reversal-view.js";
import { betaProxies, effectiveMode, offQuotes } from "./offmarket.js";
import { flashTicks } from "./flash.js";
import { initPwa } from "./pwa.js";
import { REPLAY_DAYS, drawFlowDynamic, drawRotation, rotPlaying } from "./flow-view.js";
import {
  GROUPS,
  TABS,
  TAB_INFO,
  groupOf,
  hooks,
  isOnshore,
  marketOf,
  savePrefs,
  state,
  store,
} from "./state.js";
import { toast } from "./widgets.js";
import { openNewsPop } from "./news-view.js";
import { dismissible } from "./dismiss.js";
import { fetchJSON } from "./net.js";
import { barsKey, refreshBars } from "./bars-hub.js";
import { REGIME_SYMS } from "./regime-history.js";
import { closeDrawer, destroyCharts, refreshCharts } from "./charts.js";
import { startMarketRegimeWatch } from "./mkt-regime-watch.js";
import { openRegimeHistory, refreshRegimeHistory } from "./regime-history-view.js";
import { redrawAssetPanel } from "./asset-pop.js";
import {
  loadBrCal,
  loadCalendar,
  loadDashExtra,
  loadFundamentals,
  loadLocal,
  loadNews,
  loadYields,
} from "./feeds.js";
import { initHeadlines } from "./dash-extra.js";
import { holdRender, initDashLayout, initRail, initTabDrag } from "./dash-layout.js";
import { initAnalysis } from "./analysis-view.js";
import { initSearch } from "./search-view.js";
import { initHelp } from "./help.js";
import { initInfoTips } from "./info-tips.js";
import { initScreener } from "./screener-view.js";
import { initMesa } from "./mesa-view.js";
import { initRebalance } from "./rebalance.js";
import { openHolding } from "./portfolio-view.js";
import { openFlowAsset } from "./flow-view.js";
import { readLog } from "./notif-log.js";
import { showNote } from "./notif-center.js";
import { enhanceTables, initTableTools, reloadTables } from "./table-tools.js";
import { initSettingsSync, syncCloud, watchCloud } from "./cloud-sync.js";
import { FIELDS } from "./settings-sync.js";
import { pushStatus, refreshPush } from "./push.js";
import {
  computeSignals,
  computeStats,
  notifyLevel,
  notifyRegime,
  notifySignals,
} from "./signal-center.js";
import { watchLevels } from "./analysis-data.js";
import { notifyShifts } from "./regime-watch.js";
import { watchDeskMore } from "./desk.js";
import { canMorph, morphHtml } from "./morph.js";
import { VERIFY_EVERY, audit, auditMaybe, loadVerify, renderAuditPill } from "./checks-center.js";
import { checkVersion } from "./site-update.js";
import { makeContexts } from "./contexts.js";
import { makeViews } from "./views.js";
import { initEvents } from "./events.js";
import { initMarquee, wakeMarquee } from "./marquee.js";
import { initTelemetry } from "./telemetry.js";
import {
  feed,
  feedHealthy,
  feedSession,
  mergeLive,
  mergeQuotes,
  quoteTime,
  refreshOnReturn,
  staleHeld,
  startFeed,
} from "./live-feed.js";
import { fetchSnapshot, touchDemand } from "./cloud.js";
import { liveChanged, snapshotUsable } from "./live-feed.js";
import { demandSyms, setTouch } from "./quote-hub.js";
import { routineIssues, sealLabel } from "./status-issues.js";

// separador decimal escolhido em Configurações (padrão: ponto) antes do primeiro desenho
setDecimalSep(state.prefs.numSep ?? ".");
const heldSyms = () => (state.portfolio?.holdings ?? []).map((h) => h.sym);
// carteira fora do PROXY: futuro do S&P × beta (preço estimado à noite, quando não há pré/pós)
let proxyMemo = { key: "", val: {} };
function heldProxies() {
  const syms = heldSyms();
  const key = `${syms.join()}|${Object.keys(state.history ?? {}).length}|${state.history?.SPY?.dates?.at(-1) ?? ""}`;
  if (proxyMemo.key !== key) proxyMemo = { key, val: betaProxies(syms, state.history) };
  return proxyMemo.val;
}

const ALL_SYMBOLS = [
  ...new Set([...Object.values(ASSETS).map((a) => a.yahoo), ...FLOW_ASSETS.map((a) => a.sym)]),
];

/**
 * Contador âmbar no selo de frescor: ativos com preço defasado (pares suprimidos), atrasados (minoria) e sem
 * cotação ao vivo. A lista completa fica na dica (title) e no toque (toast). Ver routineIssues().
 */
function routineChip() {
  const r = routineIssues({
    staleCodes: state.snap?.staleCodes,
    late: state.late,
    liveCount: state.live?.count,
    missing: state.live?.missing,
  });
  if (!r.count) return "";
  return `<button type="button" class="pill warn" data-action="routine-info" title="${esc(r.text)}" aria-label="${esc(r.text)}">⏱ ${r.count} com atraso</button>`;
}

function renderFreshness() {
  const f = state.snap?.freshness;
  if (!f) return; // dados ainda carregando (render pedido antes do load)
  const at = f.updatedAt;
  const sess = usSession();
  const src = state.live
    ? `${state.feedDeferred ? "tempo real" : "ao vivo"} · ${state.live.count}/${state.live.total} cotações`
    : `arquivo publicado${state.liveError ? " (ao vivo indisponível)" : ""}`;
  document.getElementById("freshness").innerHTML =
    `<span class="pill ${f.level}${f.level === "ok" && sess === "closed" ? " closed" : ""}">${esc(sealLabel(f, sess, { mode: state.mode, live: !!state.live }))}</span>${
      at
        ? `<span>Cotação de <b>${fmtDT(at)}</b><span class="fresh-tz"> (Brasília)</span> · ${ago(at)}</span>`
        : ""
    }<span class="muted">${esc(src)}</span>${routineChip()}${state.mode === "off" && sess === "open" ? `<span class="pill warn" title="Preços de pré/pós-mercado e futuros como proxy">Off market</span>` : ""}<span id="countdown" class="muted"></span>`;

  // Avisos sempre visíveis enquanto houver problema (o intradiário é sensível a atraso).
  const msgs = [];
  if (f.level === "bad")
    msgs.push([
      "bad",
      `Os preços são de ${at ? fmtDT(at) : "data desconhecida"}${at ? ` (${ago(at)})` : ""}. Atualize antes de tomar qualquer decisão.`,
    ]);
  else if (f.level === "warn")
    msgs.push([
      "warn",
      `Cotação com ${f.ageMin} min de atraso. Os sinais podem ter mudado desde então.`,
    ]);
  if (state.liveError)
    msgs.push([
      "bad",
      `Cotação ao vivo indisponível (${state.liveError}). Exibindo o arquivo publicado.`,
    ]);
  // preço defasado em poucos ativos, atraso pontual e ativo sem cotação: rotina, vão no contador âmbar do
  // selo (routineChip), não na faixa do topo (U3). Vermelho só para o que afeta decisão.
  if (state.late.length) {
    const total = state.live?.count ?? 1;
    if (state.late.length >= total / 2) {
      const med = state.late[Math.floor(state.late.length / 2)].lagMin;
      msgs.push([
        "warn",
        `A maioria das cotações (${state.late.length} de ${total}) está atrasada, em torno de ${med} min.`,
      ]);
    }
  }
  if (/sint|teste|sample/i.test(state.snap.meta?.source ?? "")) {
    msgs.push(["warn", "Dados de teste (não são preços reais)."]);
  }
  if (state.newVersion) {
    msgs.push([
      "warn",
      "Há uma versão nova do site publicada. Clique em Recarregar (ou ⟳) para atualizar.",
    ]);
  }
  const b = document.getElementById("banner");
  // cada aviso tem ✕ (assets/dismiss.js): fechado, só volta quando o texto mudar
  const shown = msgs
    .map(([lvl, t]) => [lvl, dismissible(`b-${lvl}`, `${lvl === "bad" ? "⚠" : "⏱"} ${esc(t)}`)])
    .filter(([, html]) => html);
  if (!shown.length) return void (b.hidden = true);
  b.className = `banner ${shown.some(([lvl]) => lvl === "bad") ? "bad" : "warn"}`;
  b.innerHTML = shown.map(([, html]) => html).join("");
  b.hidden = false;
}

let lastViewKey = null;
// último HTML desenhado na área principal: redesenho com o mesmo resultado não mexe no DOM (Fase 3)
let lastHtml = null;
// abas com <canvas> redesenhado depois do HTML (gráficos e mapa): sempre passam pelo caminho completo
const CANVAS_TABS = new Set(["entry", "flow", "brflow"]);
const FLOW_TABS = new Set(["flow", "brflow"]);

// Redesenho pedido pelas cargas em segundo plano (cotações, varredura, análises, matriz de retornos…): as rajadas
// viram UM redesenho por quadro, no máximo 1 a cada RENDER_GAP ms, e nada com o app escondido (ao voltar, o
// visibilitychange redesenha). Ação do usuário continua chamando render() direto, sem espera.
const RENDER_GAP = 350;
let rPending = false;
let lastRender = 0;
const USER_EVENTS = new Set(["click", "input", "change", "keydown", "submit", "pointerup", "touchend"]); // prettier-ignore
function scheduleRender() {
  // pedido de dentro de um toque/digitação do usuário: desenha na hora (sem atraso perceptível)
  const ev = globalThis.event;
  if (ev?.isTrusted && USER_EVENTS.has(ev.type)) return render();
  if (rPending) return;
  rPending = true;
  // temporizador simples (o requestAnimationFrame congela com o app em segundo plano e travaria a fila)
  const wait = Math.max(16, RENDER_GAP - (performance.now() - lastRender));
  setTimeout(() => {
    if (!rPending) return; // um render() direto já desenhou
    rPending = false;
    if (!document.hidden) render({ bg: true });
  }, wait);
}

/** Seletor estável de um elemento da tela (id ou 1º atributo data-*), para achá-lo de novo depois do redesenho. */
function keyOf(el) {
  if (el.id) return `#${CSS.escape(el.id)}`;
  const a = [...el.attributes].find((x) => x.name.startsWith("data-"));
  return a ? `${el.tagName.toLowerCase()}[${a.name}="${CSS.escape(a.value)}"]` : null;
}

/** Guarda o que o usuário está mexendo (campo com cursor, menus <details> abertos) e devolve quem restaura. */
function keepUi(view) {
  const el = document.activeElement;
  const typing = el && view.contains(el) && /^(INPUT|TEXTAREA)$/.test(el.tagName) && !/^(checkbox|radio|button|submit|range)$/.test(el.type); // prettier-ignore
  const focus = typing
    ? { key: keyOf(el), v: el.value, a: el.selectionStart, b: el.selectionEnd }
    : null;
  const open = [...view.querySelectorAll("details[open]")].map(keyOf).filter(Boolean);
  return () => {
    for (const k of open) view.querySelector(k)?.setAttribute("open", "");
    const f = focus?.key && view.querySelector(focus.key);
    if (!f) return;
    if (f.value !== focus.v) f.value = focus.v; // texto ainda não aplicado (busca com espera) não se perde
    f.focus({ preventScroll: true });
    try {
      f.setSelectionRange(focus.a, focus.b);
    } catch {
      /* campo sem cursor (number) */
    }
  };
}

/** Sub-abas roláveis: a ativa vai para o centro e a borda mostra se há mais de um lado (U9). */
function centerSubtab(root, enter) {
  const nav = root.querySelector(".subtabs");
  const on = nav?.querySelector('[aria-selected="true"]');
  if (!nav || nav.scrollWidth <= nav.clientWidth) return;
  // centra ao entrar na aba e também quando a ativa está fora da área visível (ex.: aberta por link ?tab=)
  const hidden =
    on &&
    (on.offsetLeft < nav.scrollLeft ||
      on.offsetLeft + on.offsetWidth > nav.scrollLeft + nav.clientWidth);
  if (on && (enter || hidden))
    nav.scrollLeft = on.offsetLeft - (nav.clientWidth - on.offsetWidth) / 2;
  const edge = () => {
    nav.classList.toggle("more-r", nav.scrollLeft + nav.clientWidth < nav.scrollWidth - 4);
    nav.classList.toggle("more-l", nav.scrollLeft > 4);
  };
  edge();
  nav.onscroll = edge; // o redesenho parcial (morph) pode tirar as classes: refeitas a cada render
}

/** Desenha a aba aberta. `bg`: pedido em segundo plano (dados novos), que pode pular o DOM se nada mudou. */
function render(opts) {
  const bg = opts?.bg === true;
  const view = document.getElementById("view");
  rPending = false;
  // arrastando um quadro do Mercado: redesenha só ao soltar
  if (holdRender(render)) return;
  lastRender = performance.now();
  if (state.error) {
    destroyCharts();
    lastHtml = null;
    document.getElementById("freshness").innerHTML = `<span class="pill bad">Erro</span>`;
    view.innerHTML = `<div class="card"><h2>Não foi possível carregar os dados</h2><p>${esc(state.error)}</p><p class="muted">Confira se <code>data/prices.json</code> existe (rode <code>python scripts/update_prices.py</code>) e se a página está sendo servida por HTTP, não aberta como arquivo.</p></div>`;
    return;
  }
  const grp = groupOf(state.prefs.tab);
  const side = marketOf(state.prefs.tab);
  const sideKey = side ? `${grp.id}:${side.id}` : null;
  if (
    grp &&
    (state.prefs.groupLast?.[grp.id] !== state.prefs.tab ||
      (sideKey && state.prefs.groupLast?.[sideKey] !== state.prefs.tab))
  ) {
    state.prefs.groupLast = {
      ...state.prefs.groupLast,
      [grp.id]: state.prefs.tab,
      ...(sideKey ? { [sideKey]: state.prefs.tab } : {}),
    };
    savePrefs();
  }
  renderNav(GROUPS, TABS, state.prefs.tab, state.prefs);
  renderFreshness();
  renderModeSwitch();
  renderAuditPill();
  const bell = document.getElementById("bellCount");
  if (bell) {
    const n = state.signals.filter((x) => x.scope !== "universe").length;
    bell.textContent = String(n);
    bell.hidden = n === 0;
  }
  // "enter": a aba (ou o ativo aberto) mudou; só então a página anima a entrada. Atualização de dados só destaca o que mudou.
  const viewKey =
    state.prefs.tab + (state.prefs.tab === "entry" ? `:${state.prefs.taSel ?? ""}` : "");
  const enter = viewKey !== lastViewKey;
  // painel lateral e popup de notícia pertencem à aba anterior
  if (enter && lastViewKey && !document.getElementById("drawer")?.hidden) closeDrawer();
  lastViewKey = viewKey;
  view.classList.toggle("enter", enter);
  const restore = enter ? null : keepUi(view);
  const html =
    subNavHtml(GROUPS, TABS, TAB_INFO, state.prefs.tab, state.prefs) + VIEWS[state.prefs.tab]();
  // mesma aba e o mesmo HTML de antes (pacote que não muda nada visível nesta aba): o DOM fica como está,
  // com ordenação, rolagem e balões abertos intactos; só o pêndulo flutuante e o relógio seguem
  const same = bg && !enter && html === lastHtml && !CANVAS_TABS.has(state.prefs.tab);
  lastHtml = html;
  if (same) {
    restore?.();
    return afterRender();
  }
  // Fluxo com a mesma moldura: não troca a página inteira (4 mil nós); só as partes dinâmicas e o gráfico da
  // rotação, que espera o ▶ Play terminar para não recomeçar a animação no meio
  if (bg && !enter && html === lastHtml && FLOW_TABS.has(state.prefs.tab)) {
    restore?.();
    drawFlowTab({ rotation: !rotPlaying() });
    return afterRender();
  }
  destroyCharts();
  // mesma aba, dados novos: aplica só as diferenças (mesmo resultado, sem refazer a tabela inteira)
  if (!enter && canMorph(view, html)) morphHtml(view, html);
  else view.innerHTML = html;
  restore?.();
  centerSubtab(view, enter);
  if (state.prefs.tab === "entry") afterEntry(taCtx());
  drawFlowTab();
  // trocar de aba sempre abre no topo (a rolagem da aba anterior não vale para outro conteúdo)
  if (enter) window.scrollTo({ top: 0, behavior: "instant" });
  enhance(view, { tab: viewKey, enter });
  enhanceTables(view);
  watchDeskMore(view, render);
  flashTicks(view);
  afterRender();
}

/** Partes desenhadas depois do HTML no Fluxo (Offshore e Onshore): mapa/tabelas dinâmicos e o gráfico da rotação. */
function drawFlowTab({ rotation = true } = {}) {
  const tab = state.prefs.tab;
  const c = tab === "flow" && state.flow ? flowCtx() : tab === "brflow" ? brFlowCtx() : null;
  if (!c) return;
  state.fctx = c.flow ? c : null;
  if (!c.flow) return;
  drawFlowDynamic(c);
  if (!rotation) return;
  destroyCharts(); // no Fluxo o único gráfico da área principal é o da rotação
  drawRotation(c);
}

/** Fim de todo render: pílula do pêndulo e relógio (também quando a área principal não mudou). */
function afterRender() {
  wakeMarquee();
  paintPendFloat({
    flow: state.flow,
    quotes: state.live?.quotes,
    ses: usSession(),
    prefs: state.prefs,
    onOpen: () => {
      state.prefs.tab = "home";
      savePrefs();
      render();
    },
    onClose: () => {
      state.prefs.pendFloat = "off";
      savePrefs();
    },
    onMove: (pos) => {
      state.prefs.pendFloatPos = pos;
      savePrefs();
    },
  });
  // faixa de alerta do radar de virada (tendência ⚠ e confirmada ‼), em todas as abas
  let rev = null;
  try {
    rev = liveReversal(state.flow, state.live?.quotes);
  } catch {
    rev = null;
  }
  paintRevBanner(rev, {
    onOpen: () => {
      state.prefs.tab = "home";
      savePrefs();
      render();
    },
  });
  tick();
}

/** Calcula o snapshot e acumula no log do dia as mudanças desde a atualização anterior. */
function applySnapshot(prices, { log: keepLog = true } = {}) {
  const errs = validatePrices(prices);
  if (errs.length) throw new Error(`prices.json inválido: ${errs.slice(0, 3).join("; ")}`);
  const snap = computeSnapshot(prices, null);
  const curr = compactSnapshot(snap);
  if (!keepLog) {
    // modo Off: preços de pré/pós e futuros não entram no histórico de mudanças
    snap.changes = [];
    state.prices = prices;
    state.snap = snap;
    state.error = null;
    return [];
  }
  const stored = store.get("pendulo.snapshots", { curr: null, prev: null });
  let added = [];
  if (stored.curr && stored.curr.updatedAt !== curr.updatedAt) {
    stored.prev = stored.curr;
    added = diffSnapshots(stored.prev, curr);
  }
  stored.curr = curr;
  store.set("pendulo.snapshots", stored);
  const log = store.get("pendulo.changelog", { session: null, items: [] });
  if (log.session !== snap.lastDate) Object.assign(log, { session: snap.lastDate, items: [] });
  const time = fmtTime(new Date()).slice(0, 5);
  log.items = [...added.map((c) => ({ ...c, time })), ...log.items].slice(0, 100);
  store.set("pendulo.changelog", log);
  state.changeLog = log;
  snap.changes = added;
  state.prices = prices;
  state.snap = snap;
  state.error = null;
  return added;
}

/**
 * Atualiza tudo: histórico (data/prices.json e data/flow.json, que mudam pouco) + cotações ao vivo.
 * O momentum, o RSI, o z e a entrada de cada par são recalculados com o preço do momento.
 * `notify` (clique ou tecla R) confirma o horário da atualização ou detalha o problema.
 */
async function load({ notify = false } = {}) {
  if (state.loading) return;
  state.loading = true;
  const btn = document.querySelector("[data-action=reload]");
  if (btn) {
    btn.disabled = true;
    btn.querySelector(".lb").textContent = "Atualizando…";
    btn.classList.add("spin");
  }
  const problems = [];
  let fatal = null;
  if (await syncCloud()) toast("Carteira atualizada a partir da nuvem.", "ok");
  const held = (state.portfolio?.holdings ?? []).map((h) => h.sym);
  const qs = held.length ? `?extra=${encodeURIComponent(held.join(","))}` : "";
  // histórico publicado (~1 MB) muda no máximo a cada atualização do cron: rebaixa só a cada 10 min
  // ou num Recarregar manual; as cotações ao vivo vêm sempre
  const fresh =
    state.base && state.flowBase && !notify && Date.now() - (state.baseAt ?? 0) < 10 * 60000;
  // 1ª abertura: o mapa de fluxo (~770 KB) chega depois do primeiro desenho; as abas que não usam fluxo não
  // esperam por ele (docs/PLANO-OTIMIZACAO.md, 4.4). Nas cargas seguintes vai junto, como antes.
  if (!state.flowBase) loadFlowLater();
  const [baseR, flowR, liveR, histR] = await Promise.allSettled([
    fresh ? Promise.resolve(state.base) : fetchJSON("data/prices.json"),
    fresh || !state.flowBase ? Promise.resolve(state.flowBase) : fetchJSON("data/flow.json"),
    liveSnapshot(held, () => fetchJSON(`api/quotes${qs}`), notify),
    held.length
      ? fetchJSON(
          `api/history?vol=1&symbols=${encodeURIComponent([...new Set([...held, "SPY"])].join(","))}`,
        )
      : Promise.resolve(null),
  ]);
  if (histR.status === "fulfilled" && histR.value) {
    state.history = histR.value.series ?? {};
    if (histR.value.missing?.length)
      problems.push(`sem histórico para ${histR.value.missing.join(", ")}`);
  } else if (held.length)
    problems.push(`histórico da carteira: ${histR.reason?.message ?? "indisponível"}`);
  if (!fresh && baseR.status === "fulfilled" && flowR.status === "fulfilled")
    state.baseAt = Date.now();
  if (baseR.status === "fulfilled") state.base = baseR.value;
  else problems.push(`histórico: ${baseR.reason.message}`);
  if (flowR.status === "fulfilled") state.flowBase = flowR.value ?? state.flowBase;
  else problems.push(`mapa de fluxo: ${flowR.reason.message}`);
  if (liveR.status === "fulfilled" && liveR.value?.count > 0) {
    // a busca passa pelo cache da borda (até 60 s): se o canal já trouxe preço mais novo, ele prevalece
    state.liveRaw = mergeLive(liveR.value, state.liveRaw) ?? liveR.value;
    state.liveError = null;
  } else {
    state.liveRaw = null; // sem cotação nova: volta ao arquivo publicado, com o selo mostrando a idade real
    state.liveError =
      liveR.status === "rejected" ? liveR.reason.message : "nenhuma cotação recebida";
    problems.push(`cotação ao vivo: ${state.liveError}`);
  }
  if (state.liveRaw?.errors?.length) problems.push(`cotações parciais: ${state.liveRaw.errors[0]}`);
  try {
    rebuild();
    checkVersion();
  } catch (e) {
    fatal = e.message;
    if (!state.snap) state.error = e.message;
  }
  finishLoad({ notify, problems, fatal, btn });
}

/** Mapa de fluxo da 1ª abertura, fora do caminho do primeiro desenho; ao chegar, recalcula e redesenha. */
let flowLoading = null;
function loadFlowLater() {
  flowLoading ??= fetchJSON("data/flow.json")
    .then((flow) => {
      state.flowBase = flow;
      state.flowError = null;
      if (!state.base || state.loading) return; // o load() em andamento já usa o flowBase novo
      rebuild();
      scheduleRender();
    })
    .catch((e) => {
      state.flowError = e.message;
      toast(`Mapa de fluxo indisponível: ${e.message}`, "warn");
    })
    .finally(() => (flowLoading = null));
}

/**
 * Cotações da abertura: a última foto do robô no Supabase (leitura barata, sem função da Vercel) quando ela tem
 * menos de 2 min e cobre a carteira; senão (ou num Recarregar manual) a busca de sempre, /api/quotes.
 * Foto indisponível (SQL ainda não aplicado, rede) desliga a tentativa nesta sessão do app.
 */
let snapshotOff = false;
async function liveSnapshot(held, fallback, manual) {
  if (!manual && !snapshotOff) {
    try {
      const snap = await fetchSnapshot();
      if (snapshotUsable(snap, Date.now(), held)) return { ...snap.data, via: "snapshot" };
    } catch {
      snapshotOff = true;
    }
  }
  return fallback();
}

/** Switch On/Off do topo. Tocar no modo que o automático escolheria volta ao automático. */
function renderModeSwitch() {
  const el = document.getElementById("mktSwitch");
  if (!el) return;
  const pref = state.prefs.mktMode ?? "auto";
  const mode = state.mode ?? marketMode();
  const sess = {
    open: "pregão aberto",
    pre: "pré-mercado",
    post: "pós-mercado",
    closed: "mercado fechado",
  }[usSession()];
  el.innerHTML = `<button data-mkt="on" aria-pressed="${mode === "on"}" title="On market: preços do pregão regular">On</button><button data-mkt="off" aria-pressed="${mode === "off"}" title="Off market: pré/pós-mercado e futuros como proxy">Off</button><span class="mkt-auto" title="${pref === "auto" ? `Automático (${sess})` : "Escolha manual: toque no outro modo para voltar ao automático"}">${pref === "auto" ? "auto" : "manual"}</span>`;
  el.classList.toggle("is-off", mode === "off");
}

document.addEventListener("click", (e) => {
  const b = e.target.closest("[data-mkt]");
  if (!b) return;
  const want = b.dataset.mkt;
  const autoMode = effectiveMode("auto", usSession());
  state.prefs.mktMode = want === autoMode ? "auto" : want;
  savePrefs();
  try {
    rebuild();
  } catch (err) {
    toast(`Falha ao trocar de modo: ${err.message}`, "bad");
  }
  render();
  toast(
    state.mode === "off"
      ? "Off market: preços de pré/pós-mercado e futuros (proxy) em todo o app."
      : "On market: preços do pregão regular.",
    "ok",
    4000,
  );
});

/** Modo de mercado efetivo agora ("on" no pregão, "off" fora; ou o que o switch forçou). */
export function marketMode() {
  return effectiveMode(state.prefs.mktMode ?? "auto", usSession());
}

/**
 * Recalcula tudo a partir dos dados já baixados (histórico + cotações), no modo On ou Off.
 * Chamado depois de cada busca e quando o switch On/Off muda (sem buscar de novo).
 */
function rebuild({ fromFeed = false } = {}) {
  state.mode = marketMode();
  state.live = state.liveRaw
    ? state.mode === "off"
      ? {
          ...state.liveRaw,
          quotes: offQuotes(state.liveRaw.quotes, Date.now() / 1000, heldProxies()),
          mode: "off",
        }
      : { ...state.liveRaw, mode: "on" }
    : null;
  let added = [];
  {
    if (!state.base) throw new Error("histórico de preços indisponível");
    const livePx = state.live ? applyLiveToPrices(state.base, state.live) : null;
    let prices = livePx ? livePx.table : state.base;
    const manual = store.get("pendulo.manual", null);
    if (manual?.text && manual.base === state.base.meta?.updated_at_brt) {
      prices = applyManualPrices(prices, manual.text).prices;
    } else if (manual) store.set("pendulo.manual", null); // histórico novo publicado: descarta ajustes
    added = applySnapshot(prices, { log: state.mode === "on" });
    const liveFlow =
      state.flowBase && state.live ? applyLiveToFlow(state.flowBase, state.live) : null;
    state.flow = liveFlow ? liveFlow.table : state.flowBase;
    // desdobramentos/grupamentos detectados e corrigidos nesta carga (aparecem na aba Verificação)
    state.splits = [...(livePx?.adjusted ?? []), ...(liveFlow?.adjusted ?? [])].filter(
      (x, i, a) => a.findIndex((y) => y.code === x.code) === i,
    );
    state.late = state.live ? lateQuotes(state.live, ALL_SYMBOLS) : [];
    if (!state.stats) state.stats = computeStats(state.base);
    state.valuation = state.portfolio
      ? valuePortfolio(state.portfolio.holdings, withNight(state.live?.quotes, state.night), {
          today: nyDate(Date.now() / 1000),
        })
      : null;
    state.signals = computeSignals();
    if (fromFeed) auditMaybe();
    else audit();
  }
  return added;
}

/** Fim da carga: próxima atualização, desenho e avisos. */
function finishLoad({ notify, problems, fatal, btn }) {
  state.nextAt = nextReloadAt();
  render();
  if (pendingTarget && state.snap) {
    const u = pendingTarget;
    pendingTarget = null;
    openTarget(u);
  }
  if (btn) {
    btn.disabled = false;
    btn.querySelector(".lb").textContent = "Recarregar";
    btn.classList.remove("spin");
  }
  state.loading = false;

  const f = state.snap?.freshness;
  if (notify) {
    if (fatal) toast(`Falha ao atualizar: ${fatal}`, "bad");
    else if (problems.length)
      toast(
        `Atualizado às ${fmtTime(new Date())}, com problema: ${problems.join(" · ")}`,
        state.live ? "warn" : "bad",
      );
    else
      toast(
        `Atualizado às ${fmtTime(new Date())} · ${state.live.count}/${state.live.total} cotações · ` +
          `S&P de ${f.updatedAt ? fmtDT(f.updatedAt) : "–"} (${f.label})${state.late.length ? ` · ${state.late.length} atrasada(s)` : ""}.`,
        f.level === "ok" ? "ok" : "warn",
      );
  } else if (problems.length && problems.join() !== state.lastProblems) {
    toast(
      `Problema na atualização automática: ${problems.join(" · ")}`,
      state.live ? "warn" : "bad",
    );
  }
  state.lastProblems = problems.join();
  if (state.snap) notifySignals(state.signals);
  watchLevels(notifyLevel).then(() => notifyShifts(notifyRegime));
  loadYields();
  loadNews();
  loadDashExtra();
  loadCalendar();
  loadFundamentals();
  if (Date.now() - state.verifyAt > VERIFY_EVERY || (state.prefs.tab === "checks" && !state.verify))
    loadVerify();
}

let lastFreshTick = 0;
let lastTrailTick = 0;

/** Relógio: contagem até a próxima atualização e reavaliação do selo a cada 30 s. */
// Carteira aberta: posição com preço velho (mais de 60 s) e mercado dela negociando (pré, pregão ou pós) é
// buscada direto, no máximo a cada 30 s. Cobre o que o canal ainda não traz na camada rápida (sem login, ativo
// fora da presença) e o pré/pós ralo.
let heldAt = 0;
let heldBusy = false;
const heldTried = new Map(); // ativo -> última tentativa (o que não negocia no pré/pós não é pedido de novo a cada 30 s)
function refreshHeld(now = Date.now()) {
  if (heldBusy || now - heldAt < 30_000 || !state.liveRaw || state.loading) return;
  const syms = staleHeld(
    heldSyms().filter((x) => symOpen(x, now) && now - (heldTried.get(x) ?? 0) > 120_000),
    state.liveRaw.quotes,
    now / 1000,
  ).slice(0, 60);
  if (!syms.length) return;
  heldAt = now;
  heldBusy = true;
  for (const x of syms) heldTried.set(x, now);
  fetchJSON(`api/quotes?only=1&extra=${encodeURIComponent(syms.join(","))}`)
    .then((j) => {
      const next = mergeQuotes(state.liveRaw, j?.quotes);
      // trouxe preço novo: volta a valer o ritmo de 30 s; sem novidade, espera 2 min
      for (const x of syms)
        if (quoteTime(next.quotes[x]) > quoteTime(state.liveRaw.quotes[x])) heldTried.delete(x);
      if (next === state.liveRaw) return;
      state.liveRaw = next;
      rebuild({ fromFeed: true });
      const typing = document.activeElement?.closest?.("#view input, #view textarea, #view select");
      if (!document.hidden && !typing) scheduleRender();
    })
    .catch(() => {})
    .finally(() => (heldBusy = false));
}

function tick() {
  const cd = document.getElementById("countdown");
  if (cd) {
    if (state.loading) cd.textContent = "· atualizando…";
    else if (state.feedDeferred)
      cd.textContent = `· tempo real: último pacote há ${Math.round((Date.now() - feed.lastAt) / 1000)} s`;
    else if (state.nextAt) {
      const sLeft = Math.max(0, Math.round((state.nextAt - Date.now()) / 1000));
      cd.textContent =
        sLeft > 3600
          ? `· mercado fechado: próxima ${PAUSE_FMT.format(new Date(state.nextAt))}`
          : `· próxima em ${Math.floor(sLeft / 60)}:${String(sLeft % 60).padStart(2, "0")}`;
    } else cd.textContent = "· atualização automática desligada";
  }
  // trilha da velocidade do humor (minutos): grava a nota do dia a cada 10 s em qualquer aba, mesmo sem redesenhar
  if (!document.hidden && Date.now() - lastTrailTick >= 10_000) {
    lastTrailTick = Date.now();
    try {
      speedNow(state.flow, state.live?.quotes);
    } catch {
      /* sem barras ainda: tenta no próximo segundo de relógio */
    }
  }
  // canal ao vivo caiu ou ficou mudo: a busca por intervalo volta ao ritmo normal na hora
  if (state.feedDeferred && !feedOk()) state.nextAt = nextReloadAt();
  // aba Notícias ou Painel aberto: o feed (e a faixa de manchetes) continua chegando mesmo com o mercado fechado
  if (["news", "dash", "local", "brnews", "home"].includes(state.prefs.tab) && !document.hidden)
    loadNews();
  if (["dash", "local"].includes(state.prefs.tab) && !document.hidden) loadDashExtra();
  if (state.prefs.tab === "portfolio" && !document.hidden) refreshHeld();
  if (isOnshore(state.prefs.tab) && !document.hidden) loadLocal();
  if (["brcal", "brmacro", "brflow"].includes(state.prefs.tab) && !document.hidden) loadBrCal();
  if (state.snap && Date.now() - lastFreshTick > 30000) {
    lastFreshTick = Date.now();
    state.snap.freshness = computeFreshness(state.snap.meta);
    renderFreshness();
  }
  // Em segundo plano (janela minimizada, outra aba) continua vigiando quando há notificações ativas, para
  // avisar sinais e notícias da carteira fora da tela; sem notificações, dorme e atualiza ao voltar.
  if (
    state.nextAt &&
    Date.now() >= state.nextAt &&
    !state.loading &&
    (!document.hidden || watchInBackground())
  )
    load();
}

/** Vigiar com a janela fora da tela: notificações do sistema liberadas e algum aviso ligado. */
function watchInBackground() {
  if (typeof Notification === "undefined" || Notification.permission !== "granted") return false;
  return anyNotifOn(state.prefs);
}

const PAUSE_FMT = new Intl.DateTimeFormat("pt-BR", {
  timeZone: "America/Sao_Paulo",
  weekday: "short",
  hour: "2-digit",
  minute: "2-digit",
});

/** O sistema pode apagar os canvas com o app suspenso (iPhone, falta de memória): redesenha ao voltar. */
function redrawAll() {
  if (state.snap && !state.loading) render();
  refreshCharts();
  redrawAssetPanel();
}

document.addEventListener("visibilitychange", () => {
  if (document.hidden) return;
  const now = Date.now();
  // de volta ao app com o canal desligado (fica fechado em segundo plano): busca já, como o Recarregar faz
  const stale =
    !!state.snap &&
    refreshOnReturn({
      now,
      session: feedSession(now, usSession),
      healthy: feedOk(now),
      lastAt: feed.lastAt,
      autoReload: state.prefs.autoReload,
    });
  if (((state.nextAt && now >= state.nextAt) || stale) && !state.loading) load();
  else redrawAll();
});
// zoom por pinça liberado (acessibilidade, docs/PLANO-OTIMIZACAO.md U6)
window.addEventListener("pageshow", (e) => e.persisted && redrawAll());
document.addEventListener("contextrestored", redrawAll, true);

/** Canal ao vivo saudável agora (pacote recente para a sessão atual, inclusive a noite dos futuros). */
const feedOk = (now = Date.now()) => feedHealthy(feed, feedSession(now, usSession), now);

/**
 * Próxima busca de reserva. O preço chega pelo canal (tempo real); a busca só cobre o histórico publicado
 * e os extras: 10 min com o canal no ar, 2 min (pregão) / 5 min (pré/pós) se ele cair. Desligado = null.
 */
function nextReloadAt(now = Date.now()) {
  if (state.prefs.autoReload === 0) return null;
  const healthy = feedOk(now);
  state.feedDeferred = healthy;
  return nextAuto(now, healthy ? STEPS.live : STEPS.degraded);
}

/** Pacote empurrado pelo servidor: aplica o preço na hora, sem esperar a próxima busca. */
function applyFeed(data) {
  if (state.loading || !state.base) return;
  const next = mergeLive(state.liveRaw, data);
  if (!next) return;
  const changed = liveChanged(state.liveRaw, next, data);
  state.liveRaw = next;
  state.liveError = null;
  // nada mudou (mesmos preços, só hora do pacote nova) e o modo On/Off é o mesmo: não refaz tabelas, sinais
  // nem a tela; só o selo de frescor (Fase 3, R9)
  if (!changed && marketMode() === state.mode) {
    state.nextAt = nextReloadAt();
    if (!document.hidden) renderFreshness();
    return;
  }
  try {
    rebuild({ fromFeed: true });
  } catch {
    return; // pacote estranho: a próxima busca normal corrige
  }
  state.nextAt = nextReloadAt();
  // não redesenha com a tela escondida nem no meio de uma digitação (o dado já está aplicado). Desenho em
  // tarefa separada do cálculo (scheduleRender): o celular não trava os dois juntos a cada pacote (Fase 3).
  const typing = document.activeElement?.closest?.("#view input, #view textarea, #view select");
  if (!document.hidden && !typing) scheduleRender();
  if (!document.hidden) refreshRegimeHistory(); // gaveta "Como andou o regime" aberta: ponto de agora ao vivo
  if (state.snap) notifySignals(state.signals);
  watchLevels(notifyLevel).then(() => notifyShifts(notifyRegime));
}

/** Canal ao vivo só com o app na tela, algo negociando (pré, pregão, pós ou futuros à noite) e ligado. */
const feedWanted = () =>
  !document.hidden && state.prefs.autoReload !== 0 && feedSession(Date.now(), usSession) != null;

/**
 * Sessão noturna (20:00–4:00 de NY, corretoras 24h): o canal de cotações não tem esse preço (o Yahoo só o
 * expõe por ativo, no gráfico); a carteira pede a cada minuto em api/quotes?night= e aplica por cima do pós.
 */
let nightBusy = false;
async function refreshNight() {
  const held = (state.portfolio?.holdings ?? []).map((h) => h.sym).filter((x) => /^[A-Z]{1,5}(-[A-Z])?$/.test(x)); // prettier-ignore
  if (!overnightOpen() || !held.length) {
    if (state.night) {
      state.night = null;
      if (state.base) rebuild();
    }
    return;
  }
  if (nightBusy || document.hidden) return;
  nightBusy = true;
  try {
    const r = await fetchJSON(`api/quotes?night=${encodeURIComponent(held.join(","))}`);
    state.night = { at: Date.parse(r.fetched_at) || Date.now(), q: r.night ?? {} };
    if (state.base) {
      rebuild();
      scheduleRender();
    }
  } catch {
    // sem preço noturno: segue o pós da véspera
  } finally {
    nightBusy = false;
  }
}
setInterval(refreshNight, 60000);

function setAutoReload() {
  clearInterval(state.timer);
  state.nextAt = nextReloadAt();
  state.timer = setInterval(tick, 1000);
}

function setBack(v) {
  state.back = Math.max(0, Math.min(REPLAY_DAYS - 1, v));
  if (!["flow", "brflow"].includes(state.prefs.tab) || !state.fctx) return;
  state.fctx.back = state.back;
  drawFlowDynamic(state.fctx);
  const r = document.getElementById("flowBack");
  if (r) r.value = String(REPLAY_DAYS - 1 - state.back);
}

function toggleReplay() {
  if (state.playing) {
    clearInterval(state.playing);
    state.playing = null;
  } else {
    if (state.back === 0) setBack(REPLAY_DAYS - 1);
    state.playing = setInterval(() => {
      if (state.back <= 0) return toggleReplay();
      setBack(state.back - 1);
    }, 700);
  }
  const b = document.querySelector("[data-action=replay]");
  if (b) b.textContent = state.playing ? "⏸ Pausar" : "▶ Replay";
}

const { settingsCtx, dashCtx, taCtx, flowCtx, brFlowCtx, pfCtx } = makeContexts({ render });
const VIEWS = makeViews({ settingsCtx, dashCtx, taCtx, flowCtx, brFlowCtx, pfCtx });
/**
 * Botão ⟳ do pêndulo (Início): atualiza SÓ o pêndulo, na hora. Busca as cotações das razões de risco e as barras
 * de 5 min furando o cache de 60 s da borda; o resto do app segue no ciclo normal.
 * `silent`: pedido pelo gesto na haste (pend-touch.js), sem aviso na tela; o aviso fica só para o ⟳.
 */
async function refreshPendulum({ silent = false } = {}) {
  if (state.pendBusy) return;
  state.pendBusy = true;
  render();
  const r = Date.now();
  const [qR, bR] = await Promise.allSettled([
    fetchJSON(`api/quotes?only=1&extra=${encodeURIComponent(REGIME_SYMS.join(","))}&r=${r}`),
    refreshBars(barsKey({ symbols: REGIME_SYMS, win: "short" })),
  ]);
  if (qR.status === "fulfilled" && state.liveRaw) {
    const next = mergeQuotes(state.liveRaw, qR.value?.quotes);
    if (next !== state.liveRaw) {
      state.liveRaw = next;
      rebuild({ fromFeed: true });
    }
  }
  state.pendBusy = false;
  const fail = [qR.status === "rejected" && "cotações", bR.status === "rejected" && "barras de 5 min"].filter(Boolean); // prettier-ignore
  if (fail.length < 2) state.pendAt = Date.now();
  render();
  if (silent) return;
  if (fail.length === 2)
    toast("Pêndulo: falha ao atualizar (cotações e barras). Tente de novo em instantes.", "bad"); // prettier-ignore
  else if (fail.length)
    toast(`Pêndulo atualizado às ${fmtTime(new Date())}, sem ${fail[0]}.`, "warn");
  else toast(`Pêndulo atualizado às ${fmtTime(new Date())}.`, "ok", 2500);
}
hooks.refreshPendulum = refreshPendulum;
hooks.render = scheduleRender;
hooks.applyFeed = applyFeed; // medição do caminho do pacote (scripts/perf-probe.mjs --feed)
hooks.renderNow = render;
initTelemetry();
initEvents({
  render,
  load,
  applySnapshot,
  setAutoReload,
  setBack,
  toggleReplay,
  settingsCtx,
  dashCtx,
  taCtx,
  flowCtx,
  pfCtx,
});

// Atalhos do app instalado (manifest "shortcuts") e links diretos: ?tab=portfolio etc.
// Notificações levam ao item: &hold=SYM abre o ativo da carteira, &asset=SYM o ativo do universo, &log=1 o histórico.
let pendingTarget = null;
function openTarget(url) {
  let q;
  try {
    q = new URL(url, location.href).searchParams;
  } catch {
    return;
  }
  const t = q.get("tab");
  if (t && TABS.some(([id]) => id === t)) state.prefs.tab = t;
  // aviso de liderança: abre a Rotação relativa no grupo, na janela Hoje, com o tema em foco
  const rot = q.get("rot");
  if (rot) {
    state.prefs.rotGroup = rot;
    state.prefs.rotWin = "today";
    state.rotFocus = q.get("focus") ?? null;
  }
  if (!state.snap) {
    pendingTarget = url; // dados ainda carregando: abre ao fim do load()
    return;
  }
  state.openLog = q.get("log") === "1";
  render();
  window.scrollTo(0, 0);
  const hold = q.get("hold");
  const asset = q.get("asset");
  const news = q.get("news");
  try {
    if (hold) openHolding(pfCtx(), hold);
    else if (asset) openFlowAsset(flowCtx(), asset);
    else if (news) openNewsById(news);
    else if (q.get("reghist")) openRegimeHistory();
    else if (state.openLog) document.getElementById("notifLog")?.scrollIntoView({ block: "start" });
  } catch {
    /* ativo fora dos dados: fica na aba */
  }
}
hooks.openTarget = openTarget;
hooks.showNote = showNote;

/** Notificação que abriu o app (push com o app fechado): &nt= título, &nb= texto. */
function noteFromUrl(url) {
  try {
    const q = new URL(url, location.href).searchParams;
    if (q.get("nt")) showNote({ title: q.get("nt"), body: q.get("nb") ?? "", at: Date.now() });
  } catch {
    /* url inválida */
  }
}

// Notícia da notificação: abre o popup da matéria. Se o feed ainda não chegou, abre quando chegar.
let pendingNews = null;
function openNewsById(id) {
  const it = state.news?.items?.find((x) => x.id === id);
  if (it) {
    pendingNews = null;
    return openNewsPop(it);
  }
  if (!state.news) {
    pendingNews = id;
    return;
  }
  pendingNews = null;
  toast("Essa matéria já saiu do feed de hoje. As manchetes atuais estão nesta aba.", "warn");
}
hooks.afterNews = () => pendingNews && openNewsById(pendingNews);
if (location.search) {
  if (new URLSearchParams(location.search).has("app-update"))
    toast("Pêndulo atualizado para a versão mais recente.", "ok");
  openTarget(location.href);
  noteFromUrl(location.href);
  history.replaceState(null, "", location.pathname); // não reabre o item ao recarregar
}
navigator.serviceWorker?.addEventListener("message", (e) => {
  if (e.data?.type !== "open") return;
  openTarget(e.data.url);
  showNote({ title: e.data.title, body: e.data.body, at: Date.now() });
});
const syncLog = () => readLog().then(() => state.prefs.tab === "signals" && state.snap && render());
syncLog();
document.addEventListener("visibilitychange", () => !document.hidden && syncLog());
initAnalysis();
initWatch();
initJournal();
initFixedIncome();
initPendTouch();
initSearch();
initHelp();
initInfoTips();
initScreener({ state, savePrefs, render });
initMesa({ state, savePrefs, render });
initRebalance();
initTableTools();
watchTables();
initPwa();
initUi({ onChange: () => state.snap && render() });
initSpotlight();
initMarquee();
initHeadlines();
// edições salvas na nuvem: o que outro aparelho mudou entra aqui (preferências, tema, tabelas, quadros…)
initSettingsSync((keys) => {
  if (keys.includes("pendulo.prefs")) {
    const skip = FIELDS["pendulo.prefs"];
    for (const [k, v] of Object.entries(store.get("pendulo.prefs", {})))
      if (!skip.has(k)) state.prefs[k] = v;
  }
  if (keys.includes("pendulo.ui")) reloadUi();
  if (keys.includes("pendulo.tables")) reloadTables();
  render();
});
initDashLayout(() => render());
initTabDrag((key, ids) => {
  state.prefs.tabOrder = { ...state.prefs.tabOrder, [key]: ids };
  savePrefs();
});
initRail();
watchCloud(() => {
  toast("Carteira atualizada a partir de outro aparelho.", "ok");
  state.signals = [];
  load();
});
pushStatus().then((st) => {
  state.pushState = st;
  refreshPush();
});
startMarketRegimeWatch();
initEntry(taCtx);
setAutoReload();
setTimeout(refreshNight, 3000);
load();
startFeed({
  onQuotes: applyFeed,
  wanted: feedWanted,
  touch: () => touchDemand({ syms: demandSyms(Date.now(), heldSyms()), tab: state.prefs.tab }),
});
// telas que pedem cotação à central avisam presença com os ativos visíveis (viram camada quente no servidor)
setTouch((syms) => touchDemand({ syms, tab: state.prefs.tab }));
