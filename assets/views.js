// Mapa aba -> tela (cada aba chama a sua view com o contexto de contexts.js).
import { viewWatch } from "./watch-view.js";
import { viewRates } from "./rates-view.js";
import { marketAssets, marketProgress, watchMarket } from "./market.js";
import { esc } from "./format.js";
import { withManual } from "./btg.js";
import { viewPortfolio } from "./portfolio-view.js";
import { viewTriggers } from "./triggers-view.js";
import { viewPairDesk } from "./pair-desk-view.js";
import { viewSettings } from "./settings-view.js";
import { viewDash } from "./dash.js";
import { viewMacro } from "./macro-view.js";
import { viewLocal } from "./local-view.js";
import { viewBrCalendar, viewBrFlow, viewBrMacro } from "./br-views.js";
import { regimeMove, viewHome } from "./home-view.js";
import { sessionFraction } from "./flow-engine.js";
import { viewNews } from "./news-view.js";
import { viewCalendar } from "./calendar-view.js";
import { loadEarnings } from "./feeds.js";
import { viewRisk } from "./risk-view.js";
import { viewScreener } from "./screener-view.js";
import { portfolioRisk } from "./risk.js";
import { portfolioBias } from "./port-bias.js";
import { captureRatios, portfolioPendulum } from "./port-pendulum.js";
import { trimPlan, traction } from "./trim.js";
import { mergePoints, recordTick, speedOf, ticksOf } from "./speed-live.js";
import { barsKey, useBars } from "./bars-hub.js";
import { quoteOf } from "./asset-pop.js";
import { regime } from "./dash.js";
import { usSession } from "./sessions.js";
import { viewJournal } from "./journal-view.js";
import { viewFixedIncome } from "./fixed-income-view.js";
import { structureCost } from "./structure-cost.js";
import { an, ensureAnalysis } from "./analysis-data.js";
import { viewFlow } from "./flow-view.js";
import { viewSim } from "./sim-view.js";
import { ARCHIVE, TABS, TAB_INFO, hooks, marketOf, state } from "./state.js";
import { viewChecks } from "./checks-center.js";
import { viewRebalance } from "./rebalance.js";
import { viewPortfolioHistory } from "./pf-history.js";

let structLoading = false;
/** Custo de estrutura (não residente): dividend yield de cada posição pela análise (busca em segundo plano). */
function structureNow() {
  const rows = state.valuation?.rows ?? [];
  if (!rows.length) return null;
  const syms = rows.map((r) => r.sym);
  const miss = syms.filter((s) => !an.at[s]);
  if (miss.length && !structLoading) {
    structLoading = true;
    ensureAnalysis(miss, { parallel: 2 })
      .catch(() => {})
      .finally(() => {
        structLoading = false;
        if (state.prefs.tab === "risk") hooks.render();
      });
  }
  return { ...structureCost(rows.map((r) => ({ sym: r.sym, value: r.value, dy: an.items[r.sym]?.fund?.dy ?? null }))), loading: structLoading }; // prettier-ignore
}

let riskMemo = { key: "", val: null };
function riskNow() {
  const v = state.valuation;
  if (!v?.rows?.length || !Object.keys(state.history ?? {}).length) return null;
  const key =
    v.rows.map((r) => `${r.sym}:${r.weight.toFixed(4)}`).join() +
    "|" +
    Object.keys(state.history).length +
    "|" +
    (state.history.SPY?.dates?.at(-1) ?? "");
  if (riskMemo.key !== key)
    riskMemo = { key, val: portfolioRisk(v.rows, state.history, { total: v.total }) };
  return riskMemo.val;
}
let rgMemo = { flow: null, quotes: null, val: null };
/** Cenário ao vivo: intensidade do regime de 1 dia (fora do pregão, com futuros e pré/pós). */
function marketScore() {
  const flow = state.flow;
  const quotes = state.live?.quotes;
  if (!flow?.close) return null;
  if (rgMemo.flow !== flow || rgMemo.quotes !== quotes) {
    let val = null;
    try {
      val = regime(flow.close, 1, usSession() !== "open" ? quotes : null, { world: quotes })?.strength?.score ?? null; // prettier-ignore
    } catch {
      val = null;
    }
    rgMemo = { flow, quotes, val };
  }
  return rgMemo.val;
}
let capMemo = { key: "", val: null };
/** Pêndulo da carteira (separado do pêndulo do mercado): postura, alvo pelo regime, assimetria e alfa de hoje. */
function portPendNow() {
  const v = state.valuation;
  if (!v?.rows?.length) return null;
  const bias = portfolioBias(v.rows, riskNow(), null);
  const key = riskMemo.key;
  if (capMemo.key !== key) capMemo = { key, val: captureRatios(v.rows, state.history ?? {}) };
  const q = state.live?.quotes?.SPY;
  const spy = q?.p > 0 && q.pc > 0 ? q.p / q.pc - 1 : null;
  return portfolioPendulum({
    bias,
    market: marketScore(),
    capture: capMemo.val,
    day: Number.isFinite(v.dayPLPct) && spy != null ? { port: v.dayPLPct, spy } : null,
    total: v.total,
  });
}
function biasNow() {
  const rows = state.valuation?.rows;
  if (!rows?.length) return null;
  const b = portfolioBias(rows, riskNow(), marketScore());
  const picks = state.prefs.trimPicks ?? {};
  const watch = rows.map((r) => {
    const side = picks[r.sym] ?? null;
    const tr = side ? traction(side, quoteOf(r.sym), state.history?.[r.sym]?.close, r.avg) : null;
    return { sym: r.sym, side, tr };
  });
  const plan = trimPlan(b, rows);
  // velocidade só do que o termômetro sugere mexer e do que está marcado (barras de 5 min com pré/pós + ticks)
  const focus = new Set([...(plan?.legs ?? []).map((l) => l.sym), ...Object.keys(picks)]);
  const speed = {};
  const nowSec = Date.now() / 1000;
  for (const sym of focus) {
    const row = rows.find((r) => r.sym === sym);
    if (!row) continue;
    recordTick(sym, row.price, nowSec);
    const e = useBars(barsKey({ symbol: sym, prepost: true }), {
      bg: true,
      onUpdate: hooks.render,
    });
    speed[sym] = speedOf(mergePoints(e.data?.bars, ticksOf(sym)), nowSec);
  }
  return { ...b, plan, picks, watch, speed };
}

/** Laboratório › Arquivo: as telas congeladas, fora das sub-abas mas a um toque (puro, para testar). */
export function viewArchive() {
  const name = Object.fromEntries(TABS);
  const rows = ARCHIVE.map((id) => {
    const side = marketOf(id);
    const label = side ? `${side.flag} ${side.label} › ${name[id]}` : name[id];
    return `<li><button class="home-link" data-tab="${id}">${esc(label)}</button><span class="muted small">${esc(TAB_INFO[id].replace(/^(Offshore|Onshore) · /, ""))}</span></li>`;
  }).join("");
  return `<section class="card"><h2>Arquivo</h2><p class="muted">Telas congeladas desde 18/11/2026 (sem trabalho novo, ver docs/ROADMAP-DINHEIRO.md). Saíram das sub-abas para a navegação mostrar só o que serve ao objetivo; continuam funcionando e abrem por aqui, pela busca (<kbd>/</kbd>) ou pelos atalhos (ex.: JUROS, BRMACRO).</p><ul class="archive-list">${rows}</ul></section>`;
}

/** Mapa aba -> função que devolve o HTML. As funções de contexto vêm do app (evita dependência circular). */
export function makeViews({ settingsCtx, dashCtx, flowCtx, brFlowCtx, pfCtx }) {
  const views = {
    archive: viewArchive,
    home: () =>
      viewHome({
        hasPortfolio: !!state.portfolio?.holdings?.length,
        pushState: state.pushState,
        seenSignals: !!state.prefs.groupLast?.opps,
        signals: state.signals,
        valuation: state.valuation,
        quotes: state.live?.quotes,
        flow: state.flow,
        cal: state.cal,
        news: state.news?.items,
        sessionFrac: state.live?.market_state === "REGULAR" ? sessionFraction() : 1,
        portPend: portPendNow(),
        pendH: state.prefs.pendH,
      }),
    dash: () => viewDash(dashCtx()),
    local: () => {
      const d = dashCtx();
      return viewLocal({
        br: state.br,
        live: state.liveRaw?.quotes,
        horizon: d.horizon,
        news: d.news,
        valuation: d.valuation,
        extra: d.extra,
        extraSeries: d.extraSeries,
        extraLive: d.extraLive,
        adding: d.adding,
      });
    },
    macro: () => viewMacro(),
    rates: () => viewRates(),
    brrates: () => viewRates(),
    brmacro: () =>
      viewBrMacro({
        macro: state.br?.macro,
        error: state.br?.errors?.macro,
        cal: state.brCal,
        kind: state.prefs.brCalKind,
      }),
    brnews: () =>
      viewNews({
        news: state.news,
        region: "br",
        filter: state.prefs.newsF,
        tags: state.prefs.newsTags,
        hasPortfolio: !!state.portfolio?.holdings?.length,
        open: state.prefs.newsOpen ?? {},
        wknd: null,
      }),
    brcal: () =>
      viewBrCalendar({ cal: state.brCal, min: state.prefs.brCalMin, kind: state.prefs.brCalKind }),
    brflow: () => viewBrFlow(brFlowCtx()),
    portfolio: () =>
      viewPortfolio({
        ...pfCtx(),
        bias: biasNow(),
        broker: withManual(state.broker, state.portfolio?.holdings, state.portfolio?.manual),
        brokerHist: state.brokerHist,
        brokerFx: quoteOf("BRL=X"),
        btgSync: state.btgSync,
        open: state.prefs.pfOpen,
        hide: state.prefs.pfHide,
        sigOpen: state.pfSigOpen,
      }),
    rebal: viewRebalance,
    trig: viewTriggers,
    phist: () =>
      viewPortfolioHistory({
        daily: state.brokerDaily,
        hist: state.brokerHist,
        hasBroker: !!state.broker?.summary,
        day: state.pfDay,
        perf: state.offPerf,
      }),
    rfix: viewFixedIncome,
    pairdesk: () =>
      viewPairDesk({ score: marketScore(), move: regimeMove(state.flow, state.live?.quotes) }),
    sim: viewSim,
    news: () =>
      viewNews({
        news: state.news,
        region: "int",
        filter: state.prefs.newsF,
        tags: state.prefs.newsTags,
        hasPortfolio: !!state.portfolio?.holdings?.length,
        open: state.prefs.newsOpen ?? {},
        wknd: state.prefs.newsWknd ? (state.newsWknd ?? { loading: true }) : null,
      }),
    screener: () =>
      viewScreener({
        assets: marketAssets(),
        f: state.prefs.scr ?? {},
        progress: (watchMarket(), marketProgress()),
      }),
    journal: viewJournal,
    risk: () =>
      viewRisk({
        risk: riskNow(),
        structure: structureNow(),
        hasPortfolio: !!state.portfolio?.holdings?.length,
      }),
    calendar: () =>
      viewCalendar({
        cal: state.cal,
        min: state.prefs.calMin,
        ccs: state.prefs.calCc2,
        histCc: state.prefs.calHistCc,
        histKind: state.prefs.calHistKind,
        view: state.prefs.calView,
        earnings: {
          data: (loadEarnings(), state.earnings),
          prefs: state.prefs,
          held: new Set((state.portfolio?.holdings ?? []).map((h) => h.sym)),
        },
      }),
    flow: () =>
      state.flow
        ? viewFlow(flowCtx())
        : `<div class="card empty">${state.flowError ? `Dados do mapa de fluxo indisponíveis (${esc(state.flowError)}).` : "Carregando o mapa de fluxo…"}</div>`,
    watch: viewWatch,
    brwatch: viewWatch,
    checks: viewChecks,
    settings: () => viewSettings(settingsCtx()),
  };
  return views;
}
