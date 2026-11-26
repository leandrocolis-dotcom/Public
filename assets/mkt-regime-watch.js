// Aviso de mudança do regime do mercado (troca de faixa e radar de virada) com o app ABERTO (quem já tem o push ligado recebe pelo servidor, a cada
// minuto, e não ganha aviso em dobro). A cada minuto: barras de 5 min das razões (central de barras, a mesma URL
// do histórico do pêndulo) + preço ao vivo do canal → nota agora × 60 min atrás → mktRegimeAlerts.
import { barsKey, getBars } from "./bars-hub.js";
import { REGIME_SYMS, regimePair } from "./regime-history.js";
import { mktRegimeAlerts } from "./mkt-regime-alerts.js";
import { regimeReversal, reversalAlerts } from "./regime-reversal.js";
import { notifOn } from "./notif-prefs.js";
import { topicTitle } from "./notif-topics.js";
import { osNotify } from "./signal-center.js";
import { state, store } from "./state.js";

const KEY = "pendulo.mktSent";
const EVERY = 60_000;

/** Uma checagem: devolve os avisos novos que mostrou. */
export async function checkMarketRegime(now = Date.now()) {
  const onMkt = notifOn(state.prefs, "mktregime");
  const onRev = notifOn(state.prefs, "reversal");
  if (state.pushState === "on" || (!onMkt && !onRev)) return [];
  const flow = state.flow;
  if (!flow?.close) return [];
  const bars = await getBars(barsKey({ symbols: REGIME_SYMS, win: "short" }), { bg: true }).catch(() => null); // prettier-ignore
  if (!bars?.series) return [];
  const daily = { dates: flow.dates, close: flow.close };
  const quotes = state.live?.quotes ?? null;
  const nowSec = now / 1000;
  const all = [];
  if (onRev) {
    const r = regimeReversal({ daily, series: bars.series, quotes, nowSec });
    all.push(...reversalAlerts(r, { nowSec }).map((a) => ({ ...a, topic: "rev" })));
  }
  const pair = onMkt ? regimePair({ daily, series: bars.series, quotes, nowSec }) : null;
  if (pair) all.push(...mktRegimeAlerts(pair.now, pair.past, { nowSec }));
  const sent = new Set(store.get(KEY, []));
  const fresh = all.filter((a) => !sent.has(a.key));
  for (const a of fresh) {
    const urgent = a.kind === "rev-confirmed";
    osNotify(topicTitle(a.topic ?? "mkt", a.title), a.body, a.url, { tag: a.tag, urgent });
    sent.add(a.key);
  }
  if (fresh.length) store.set(KEY, [...sent].slice(-200));
  return fresh;
}

let timer = null;
/** Liga a checagem a cada minuto (uma vez). */
export function startMarketRegimeWatch() {
  if (timer) return;
  timer = setInterval(() => checkMarketRegime().catch(() => null), EVERY);
}
