// Sinais da carteira e dos ativos: estatísticas, cálculo e avisos (notificação do sistema).
import { topicTitle } from "./notif-topics.js";
import { notifOn } from "./notif-prefs.js";
import { quietNow } from "./weekend.js";
import { nyDate } from "./live.js";
import { usSession } from "./refresh.js";
import { ruleStats, signalsFor } from "./signals.js";
import { FLOW_BY_SYM } from "./flow-universe.js";
import { hooks, savePrefs, state, store } from "./state.js";
import { linkFor, logNotif, readLog } from "./notif-log.js";
import { centerHtml } from "./notif-center.js";
import { toast } from "./widgets.js";
import { levelText } from "./level-alerts.js";
import { regimeOf, sectorRotation } from "./edge.js";
import { SECTOR_LIST } from "./universe.js";
import { macro, macroTilt } from "./macro.js";

// Grupos de risco (ações): o regime do S&P vale para eles. Juros, moedas e commodities seguem regra própria.
const EQUITY_GROUPS = new Set(["us_style", "us_sectors", "us_ind", "gl_sectors", "regions", "idx_us", "idx_gl", "dm", "em"]); // prettier-ignore

/** Regime do mercado (S&P vs. MM200) e rotação setorial (sistema-semente da lição 17): uma vez por pregão. */
let mktMemo = null;
export function marketEdge() {
  const ser = state.base?.series ?? state.prices?.series;
  const day = state.base?.dates?.at(-1) ?? state.prices?.dates?.at(-1);
  if (!ser?.SPY) return null;
  if (mktMemo?.day === day && mktMemo.ser === ser) return mktMemo;
  const sectors = Object.fromEntries(SECTOR_LIST.filter((c) => ser[c]).map((c) => [c, ser[c]]));
  mktMemo = { day, ser, regime: regimeOf(ser.SPY), rotation: sectorRotation(sectors, ser.SPY) };
  return mktMemo;
}

/**
 * Aplica as lições de vantagem às oportunidades: regra sem vantagem histórica, compra contra o regime e
 * momentum relativo (os mais fortes primeiro; comprar o mais fraco tem pior histórico).
 */
/**
 * Veto do modelo (docs/BACKTEST-MODELO.md, 26.964 simulações): um gatilho de entrada só vale se o preço está acima
 * da MM200, o S&P acima da MM200, o setor não é desfavorecido no regime macro e o crédito não está em estresse.
 * Os gatilhos vetados perderam 1,18% para o SPY em 21 pregões (t −3,1). Devolve os motivos (vazio = aprovado). Puro.
 */
export function modelVeto(sg, { bull = null, tilt = null, hy1m = null } = {}) {
  if (sg.kind !== "entry") return [];
  const why = [];
  const x = sg.ind ?? {};
  if (x.ma200 && x.price <= x.ma200) why.push("preço abaixo da MM200");
  if (bull === false) why.push("S&P abaixo da MM200");
  if (tilt !== null && tilt <= 0) why.push("setor desfavorecido no regime macro");
  if (hy1m !== null && hy1m > 0.3) why.push("crédito em estresse");
  return why;
}

function rankEntries(list, mom) {
  const reg = marketEdge()?.regime;
  const base = state.stats?.base?.avgFwd;
  for (const sg of list) {
    const st = state.stats?.rules?.[sg.code];
    sg.noEdge = st?.n >= 30 && base != null && st.avgFwd <= base;
    sg.againstRegime = !!reg && !reg.bull && EQUITY_GROUPS.has(sg.groupId);
    sg.mom = mom?.[sg.sym] ?? null;
    const t = macroTilt(sg.sym);
    const hy1m = macro.data?.indicators?.find((i) => i.id === "HY1M")?.value ?? null;
    sg.veto = modelVeto(sg, { bull: reg ? reg.bull : null, tilt: t ? t.score : null, hy1m });
  }
  const score = (sg) =>
    sg.strength +
    (sg.mom ? sg.mom.m12Pct - 0.5 : 0) -
    (sg.noEdge ? 1 : 0) -
    (sg.againstRegime ? 0.5 : 0) -
    (sg.veto?.length ? 2 : 0);
  return list.sort((a, b) => score(b) - score(a));
}

/** Histórico de cada regra nos ativos do Pêndulo (47 × ~1.000 pregões). Calculado uma vez por sessão. */
export function computeStats(base) {
  const skip = new Set(["US10Y", "US3M", "VIX", "VIXY", "TBF"]);
  return ruleStats(
    Object.entries(base.series)
      .filter(([c]) => !skip.has(c))
      .map(([, s]) => s),
  );
}

/** Série diária de um ativo da carteira com o preço ao vivo no último pregão. */
function holdingSeries(sym) {
  const h = state.history[sym];
  if (!h?.close?.length) return null;
  const s = [...h.close];
  const q = state.live?.quotes?.[sym];
  if (q?.p > 0) {
    const d = nyDate(q.t);
    const last = h.dates[h.dates.length - 1];
    if (d === last) s[s.length - 1] = q.p;
    else if (d > last) s.push(q.p);
  }
  return s;
}

export function computeSignals() {
  const out = [];
  // pregão aberto: o último "dia" da série é o preço de agora, não um fechamento (o sinal pode sumir até o fim do dia)
  const provisional = usSession() === "open";
  const held = new Set();
  for (const h of state.portfolio?.holdings ?? []) {
    held.add(h.sym);
    const name =
      state.valuation?.rows.find((r) => r.sym === h.sym)?.name ??
      state.history[h.sym]?.name ??
      h.sym;
    for (const sg of signalsFor(holdingSeries(h.sym), { sym: h.sym, label: name }))
      out.push({ ...sg, scope: "portfolio", provisional, groupId: FLOW_BY_SYM[h.sym]?.group ?? "us_style" }); // prettier-ignore
  }
  const uni = [];
  // mesmas marcas de vantagem nos sinais de entrada da carteira (a ordem da carteira não muda)
  rankEntries(
    out.filter((x) => x.scope === "portfolio" && x.kind === "entry"),
    null,
  );
  return [...out, ...uni];
}

const KIND_TXT = {
  entry: ["▲ Entrada", "ok"],
  exit: ["▼ Saída", "bad"],
  risk: ["⚠ Risco", "warn"],
};

export function osNotify(
  title,
  body,
  url = "./?tab=signals",
  { log = true, always = false, tag = null, urgent = false } = {},
) {
  // prettier-ignore
  if (log) logNotif({ title, body, url });
  if (typeof Notification === "undefined" || Notification.permission !== "granted") return;
  if (!always && quietNow(state.prefs)) return; // fim de semana silenciado: fica só no histórico do sino
  const t = /^\p{Extended_Pictographic}/u.test(title) ? title : topicTitle("app", title);
  const opts = { body, tag: tag ?? title, icon: "icons/icon-192.png", badge: "icons/icon-192.png", data: { url } }; // prettier-ignore
  // aviso urgente (virada do regime confirmada): fica na tela até tocar e vibra forte
  if (urgent) Object.assign(opts, { requireInteraction: true, renotify: true, vibrate: [300, 120, 300, 120, 600] }); // prettier-ignore
  // Android/Chrome e iPhone (app instalado) só mostram pelo service worker; o construtor direto falha lá.
  const viaSw = navigator.serviceWorker?.getRegistration?.().then((r) => {
    if (!r) throw new Error("sem service worker");
    return r.showNotification(t, opts);
  });
  Promise.resolve(viaSw ?? Promise.reject(new Error("sem service worker"))).catch(() => {
    try {
      const n = new Notification(t, opts);
      n.onclick = () => {
        window.focus();
        n.close();
        hooks.openTarget?.(url);
        hooks.showNote?.({ title: t, body, at: Date.now() });
      };
    } catch {
      /* navegador sem suporte (ex.: iOS fora do app instalado) */
    }
  });
}

/** Estado das notificações do sistema: "granted" | "denied" | "default" | "unsupported". */
export const notifState = () =>
  typeof Notification === "undefined" ? "unsupported" : Notification.permission;

const BELL_STATUS = {
  granted: "🔔 Notificações ativas neste aparelho.",
  denied: "🔕 Notificações bloqueadas: libere nas configurações do navegador (ou do iPhone) para este site.",
  unsupported: "🔕 Este navegador não mostra notificações. No iPhone: Compartilhar → Adicionar à Tela de Início e abra pelo ícone.",
  default: "🔕 Notificações ainda não autorizadas.",
}; // prettier-ignore

/** Abre (ou redesenha) a central de notificações na categoria pedida. */
export async function openNotifCenter(cat = state.prefs.notifCat ?? "all") {
  state.prefs.notifCat = cat;
  savePrefs();
  const log = await readLog();
  document.querySelector(".npop-back")?.remove();
  document.body.insertAdjacentHTML("beforeend", centerHtml(log, cat, BELL_STATUS[notifState()]));
  document.querySelector(".ncenter .chip.on")?.focus();
}

/**
 * Sino do topo: abre a central de notificações (histórico por categoria).
 * Se a permissão ainda não foi pedida, pede (o toque no sino conta como gesto do usuário, exigido no iPhone).
 */
export async function bellClick(render) {
  if (notifState() === "default") {
    const p = await Notification.requestPermission().catch(() => "default");
    if (p === "granted") {
      toast("🔔 Notificações ativadas.", "ok");
      osNotify("Notificações ativas", "Você será avisado de novos sinais enquanto o app estiver aberto.", undefined, { log: false, always: true }); // prettier-ignore
    }
    render();
  }
  await openNotifCenter();
}

/** Avisa (tela + navegador) cada sinal uma única vez por pregão. */
/** Aviso de nível de um ativo da carteira (perto de resistência/suporte/stop). */
export function notifyLevel(a) {
  if (!notifOn(state.prefs, "levels")) return;
  const t = levelText(a);
  toast(
    `${t.title}: ${a.action}.`,
    a.tone === "buy" ? "ok" : a.tone === "sell" ? "bad" : "warn",
    25000,
    linkFor({ tab: "portfolio", hold: a.sym }),
  );
  osNotify(topicTitle("level", t.title), t.body, linkFor({ tab: "portfolio", hold: a.sym }));
}

/** Aviso do vigia de regime da carteira (tela + celular). */
export function notifyRegime(title, body, url) {
  if (!notifOn(state.prefs, "regime")) return;
  toast(`${title}. ${body}`, "warn", 25000, url);
  osNotify(topicTitle("regime", title.replace(/^⚠\s*/, "")), body, url);
}

export function notifySignals(list) {
  const on = (sg) => notifOn(state.prefs, sg.scope === "portfolio" ? "portfolio" : "universe");
  list = list.filter(on);
  if (!list.length) return;
  const key = (sg) => `${sg.scope}:${sg.sym}:${sg.code}`;
  const seen = store.get("pendulo.signals.seen", { session: null, keys: [] });
  if (seen.session !== state.snap.lastDate)
    Object.assign(seen, { session: state.snap.lastDate, keys: [] });
  // entradas vetadas pelo modelo não viram aviso (continuam na tela, marcadas)
  const fresh = list.filter((sg) => !seen.keys.includes(key(sg)) && !sg.veto?.length);
  if (!fresh.length) return;
  seen.keys.push(...fresh.map(key));
  store.set("pendulo.signals.seen", seen);
  for (const sg of fresh.filter((x) => x.scope === "portfolio")) {
    const [lab, tone] = KIND_TXT[sg.kind];
    const edgeTxt = [sg.noEdge && "regra sem vantagem medida", sg.againstRegime && "S&P abaixo da MM200: metade do tamanho"].filter(Boolean).join("; "); // prettier-ignore
    const tail = `${sg.context ? ` ⚠ ${sg.context}` : ""}${edgeTxt ? ` ✗ ${edgeTxt}.` : ""}${sg.provisional ? " (Provisório até o fechamento.)" : ""}`;
    toast(`${lab} na carteira · ${sg.sym}: ${sg.title}.${tail}`, tone, 20000, linkFor({ tab: "portfolio", hold: sg.sym })); // prettier-ignore
    osNotify(topicTitle("signal", `${lab} · ${sg.sym}`), `${sg.title}. ${sg.desc}${tail}`, linkFor({ tab: "portfolio", hold: sg.sym })); // prettier-ignore
  }
}
