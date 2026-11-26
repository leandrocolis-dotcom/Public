import { usSession } from "./refresh.js";
import { newsByAsset } from "./asset-news.js";
// Montagem dos contextos de cada aba a partir do estado.
import { fmtDT } from "./format.js";
import { sessionFraction } from "./flow-engine.js";
import { withPortfolio } from "./flow-portfolio.js";
import { b3Session, freshestQuotes } from "./br.js";
import { BR_FLOW_PREFS, BR_UNI, brFlowTable, volShare } from "./br-flow.js";
import { studyLine } from "./br-views.js";
import { appearanceHtml } from "./ui.js";
import { savePrefs, state } from "./state.js";
import { toast } from "./widgets.js";
import { drawerChart, mkChart, openDrawer } from "./charts.js";
import * as cloud from "./cloud.js";
import { osNotify } from "./signal-center.js";
import { notifOn } from "./notif-prefs.js";
import { topicTitle } from "./notif-topics.js";
import { leaderAlertText } from "./leaders.js";

/** Aviso de candidato a liderança com o app aberto (quem já recebe push não ganha aviso em dobro). */
function notifyLeader(c) {
  if (state.pushState === "on" || !notifOn(state.prefs, "leaders")) return false;
  const t = leaderAlertText(c);
  osNotify(topicTitle("leaders", t.title), t.body, `./?tab=flow&rot=${encodeURIComponent(c.group)}&focus=${encodeURIComponent(c.sym)}`); // prettier-ignore
  return true;
}

/** Contextos que as abas recebem (estado atual + funções de gráfico/painel). `render` vem do app. */
export function makeContexts({ render }) {
  const settingsCtx = () => {
    return {
      sub: state.prefs.setTab,
      cloud: { ...state.cloud, user: cloud.cloudUser(), expired: cloud.sessionLost() },
      portfolio: state.portfolio,
      importedAt: state.portfolio?.importedAt ? fmtDT(new Date(state.portfolio.importedAt)) : null,
      pfText: state.pfText,
      pfParsed: state.pfParsed,
      appearanceHtml: appearanceHtml(),
      autoReload: state.prefs.autoReload,
      version: state.live?.version ?? null,
      notifPerm: typeof Notification === "undefined" ? "unsupported" : Notification.permission,
      newsAlerts: state.prefs.newsAlerts,
      sigAlerts: state.prefs.sigAlerts,
      notifPrefs: state.prefs,
      proChart: state.prefs.proChart,
      pendFloat: state.prefs.pendFloat,
      numSep: state.prefs.numSep ?? ".",
      pushState: state.pushState,
    };
  };

  const dashCtx = () => {
    return {
      flow: state.flow,
      quotes: state.live?.quotes,
      newsHits: (state.news?.items ?? []).filter((x) => x.hits).length,
      assetNews: newsByAsset(state.news?.items),
      horizon: state.prefs.dashH,
      yields: state.yields,
      valuation: state.valuation,
      signals: state.signals,
      fund: state.fund,
      prices: state.prices,
      mode: state.mode,
      session: usSession(),
      sessionFrac: state.live?.market_state === "REGULAR" ? sessionFraction() : 1,
      held: (state.portfolio?.holdings ?? []).map((h) => h.sym),
      news: state.news?.items,
      extra: Object.fromEntries(
        Object.entries(state.prefs.dashExtra ?? {}).map(([k, v]) => [
          k,
          v.map((x) => ({ ...x, err: !!state.dashMiss?.has(x.sym) })),
        ]),
      ),
      extraSeries: state.dashSeries,
      extraLive: state.dashLive,
      adding: state.dashAdding,
    };
  };

  const taCtx = () => {
    return {
      prefs: state.prefs,
      savePrefs,
      render,
      mkChart,
      toast,
      prices: state.prices,
      live: state.live,
    };
  };

  /** Contexto da aba de fluxo (reaproveitado pelo tooltip e pelo replay). */
  // carteira atual como grupo do fluxo: refeito só quando a tabela, a carteira ou o histórico mudam
  let portMemo = { flow: null, port: null, hist: null, out: null };
  const flowCtx = () => {
    const quotes = state.live?.quotes ?? {};
    if (
      portMemo.flow !== state.flow ||
      portMemo.port !== state.portfolio ||
      portMemo.hist !== state.history
    )
      portMemo = {
        flow: state.flow,
        port: state.portfolio,
        hist: state.history,
        out: withPortfolio(state.flow, state.portfolio?.holdings, state.history ?? {}, quotes),
      };
    const { flow, uni } = portMemo.out;
    return {
      flow,
      uni,
      quotes,
      mode: state.mode,
      notifyLeader,
      setPrefs: (o) => {
        Object.assign(state.prefs, o);
        savePrefs();
        render();
      },
      takeRotFocus: () => {
        const f = state.rotFocus;
        state.rotFocus = null;
        return f;
      },
      prefs: state.prefs,
      back: state.back,
      playing: !!state.playing,
      live: !!state.live,
      session: usSession(),
      sessionFrac: state.live?.market_state === "REGULAR" ? sessionFraction() : 1,
      late: new Set(state.late.map((l) => l.sym)),
      lateMap: Object.fromEntries(state.late.map((l) => [l.sym, l.lagMin])),
      mkChart,
      openDrawer,
      drawerChart,
    };
  };

  // Fluxo Onshore: mesma tabela/visão do Fluxo Offshore com a B3; a tabela só é refeita quando chega dado novo
  let brMemo = { key: null, flow: null };
  const brFlowCtx = () => {
    const br = state.br ?? {};
    const quotes = freshestQuotes(br.quotes, state.liveRaw?.quotes);
    const key = `${br.histAt ?? 0}:${Object.keys(br.hist ?? {}).length}:${Object.values(quotes).reduce((a, q) => Math.max(a, q.t ?? 0), 0)}`; // prettier-ignore
    if (brMemo.key !== key) brMemo = { key, flow: brFlowTable(br.hist, quotes) };
    const ses = b3Session();
    const prefs = { ...state.prefs };
    for (const [k, v] of Object.entries(BR_FLOW_PREFS)) prefs[k] = state.prefs[v];
    return {
      flow: brMemo.flow,
      uni: BR_UNI,
      quotes,
      br,
      cal: state.brCal,
      study: state.brFlowStudy,
      prefs,
      rotKey: BR_FLOW_PREFS.rotGroup,
      rotWinKey: BR_FLOW_PREFS.rotWin,
      back: state.back,
      playing: !!state.playing,
      live: ses.open && !!quotes["^BVSP"],
      session: ses.id,
      // volume relativo: parcela do volume do dia que costuma sair até agora (curva do estudo); fase: hora do pregão
      sessionFrac: ses.open ? volShare(ses.frac, state.brFlowStudy?.volCurve) : 1,
      phaseFrac: ses.open ? ses.frac : 1,
      late: new Set(),
      lateMap: {},
      storyExtra: studyLine(state.brFlowStudy, ses.frac, ses.open),
      confirmNote:
        "confirme no gráfico do ativo (toque no nome) e use stop. Leitura da B3 com cerca de 15 min de atraso.",
      mkChart,
      openDrawer,
      drawerChart,
    };
  };

  const pfCtx = () => {
    return {
      portfolio: state.portfolio,
      valuation: state.valuation,
      signals: state.signals,
      stats: state.stats,
      openLog: state.openLog,
      history: state.history,
      pfText: state.pfText,
      pfParsed: state.pfParsed,
      cloud: { ...state.cloud, user: cloud.cloudUser(), expired: cloud.sessionLost() },
      openDrawer,
      drawerChart,
    };
  };
  return { settingsCtx, dashCtx, taCtx, flowCtx, brFlowCtx, pfCtx };
}
