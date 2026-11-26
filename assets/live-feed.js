// Cotações empurradas pelo servidor: o app assina o canal público `pendulo-quotes` do Supabase Realtime
// (Broadcast) e recebe o pacote da Edge Function `quotes-feed` assim que ele sai (15 s no pregão, 1 min no
// pré/pós). Cliente mínimo do protocolo Phoenix por WebSocket, sem biblioteca. Se o canal cair ou ficar
// mudo, o app volta sozinho à busca por intervalo de sempre (assets/refresh.js).
import { SUPABASE_KEY, SUPABASE_URL } from "./cloud.js";
import { feedSession as sessionFeed } from "./sessions.js";

export const TOPIC = "realtime:pendulo-quotes";
const HEARTBEAT = 25_000;
/** Sem pacote há mais que isso (com o canal "aberto"), o canal não conta como saudável. */
export const STALE_MS = { open: 90_000, pre: 90_000, post: 90_000, night: 4 * 60_000 };

/** Mensagens do protocolo (Phoenix v1: objetos JSON). */
export const joinMsg = (ref) => ({
  topic: TOPIC,
  event: "phx_join",
  payload: {
    config: { broadcast: { self: false, ack: false }, presence: { key: "" }, private: false },
  },
  ref: String(ref),
  join_ref: String(ref),
});
export const heartbeatMsg = (ref) => ({
  topic: "phoenix",
  event: "heartbeat",
  payload: {},
  ref: String(ref),
});

/** Quadro recebido -> { kind: "quotes", data } | { kind: "joined" } | { kind: "error" } | null. */
export function parseFrame(text) {
  let m;
  try {
    m = JSON.parse(text);
  } catch {
    return null;
  }
  if (m?.topic !== TOPIC) return null;
  if (m.event === "phx_reply" && m.payload?.status === "ok" && m.ref === m.join_ref)
    return { kind: "joined" };
  if (m.event === "phx_error" || m.event === "phx_close") return { kind: "error" };
  if (m.event === "phx_reply" && m.payload?.status === "error") return { kind: "error" };
  if (m.event === "broadcast" && m.payload?.event === "quotes" && m.payload.payload?.quotes)
    return { kind: "quotes", data: m.payload.payload };
  return null;
}

/** A cotação `q` é mais velha que `cur` (hora do pregão; empate = hora do pré/pós)? */
export function olderQuote(q, cur) {
  if (!cur || !Number.isFinite(q?.t) || !Number.isFinite(cur.t)) return false;
  if (q.t !== cur.t) return q.t < cur.t;
  return Number.isFinite(cur.xt) && Number.isFinite(q.xt) && q.xt < cur.xt;
}

/**
 * Junta o pacote recebido às cotações que o app já tem. Devolve o novo liveRaw ou null quando o pacote é
 * vazio ou mais velho que o atual (chegou fora de ordem). Mantém os extras que só a busca do app trouxe
 * (ativo recém-adicionado à carteira que o servidor ainda não conhece).
 */
export function mergeLive(prev, msg) {
  if (!msg?.quotes || !(msg.count > 0)) return null;
  if (
    prev?.fetched_at &&
    msg.fetched_at &&
    Date.parse(msg.fetched_at) <= Date.parse(prev.fetched_at)
  )
    return null;
  // por ativo: o pacote do canal vem enxuto (sem 52 semanas, médias de volume, nome), o resto fica
  // e nunca volta no tempo: pacote "só o que mudou" ou foto completa com um ativo mais velho que o que o app
  // já tem (busca própria mais recente) não sobrescreve aquele ativo
  const quotes = { ...(prev?.quotes ?? {}) };
  for (const [s, q] of Object.entries(msg.quotes))
    if (!olderQuote(q, quotes[s])) quotes[s] = { ...quotes[s], ...q };
  const missing = (msg.missing ?? []).filter((s) => !quotes[s]);
  return {
    ...msg,
    quotes,
    missing,
    count: Object.keys(quotes).length,
    total: Math.max(msg.total ?? 0, prev?.total ?? 0, Object.keys(quotes).length),
  };
}

/** Campos que, mudando, pedem recálculo (preço, fechamento anterior, hora e volume, no pregão e no pré/pós). */
const LIVE_FIELDS = ["p", "pc", "t", "v", "xp", "xt"];

/**
 * Quantos ativos do pacote `msg` mudaram de verdade entre `prev` e `next` (liveRaw antes e depois do mergeLive).
 * Pacote com hora nova e preços iguais (ativo parado, pós sem negócio) devolve 0: o app não precisa refazer tudo.
 */
export function liveChanged(prev, next, msg) {
  let n = 0;
  for (const s of Object.keys(msg?.quotes ?? {})) {
    const a = prev?.quotes?.[s];
    const b = next?.quotes?.[s];
    if (!a || !b || LIVE_FIELDS.some((k) => a[k] !== b[k])) n++;
  }
  return n;
}

/** Hora mais recente da cotação (pregão ou pré/pós), em segundos. */
export const quoteTime = (q) => Math.max(q?.t ?? 0, q?.xt ?? 0);

/** Ativos da carteira com cotação mais velha que `maxAge` s (ou sem cotação). */
export const staleHeld = (syms, quotes, nowSec, maxAge = 60) =>
  (syms ?? []).filter((s) => nowSec - quoteTime(quotes?.[s]) > maxAge);

/**
 * Junta cotações de uma busca própria (carteira) às do canal sem mexer no carimbo do pacote (fetched_at): um
 * pacote do canal que chegue depois continua valendo. Por ativo, nunca volta no tempo.
 */
export function mergeQuotes(prev, quotes) {
  if (!prev || !quotes) return prev;
  const out = { ...prev.quotes };
  let changed = false;
  for (const [s, q] of Object.entries(quotes))
    if (q?.p > 0 && !olderQuote(q, out[s])) {
      out[s] = { ...out[s], ...q };
      changed = true;
    }
  return changed ? { ...prev, quotes: out, count: Object.keys(out).length } : prev;
}

/** Foto do servidor serve para abrir o app: tem menos de `maxAge` e traz todos os ativos `need` (carteira). */
export function snapshotUsable(snap, now, need = [], maxAge = 2 * 60_000) {
  const at = Date.parse(snap?.at ?? "");
  const q = snap?.data?.quotes;
  if (!q || !(snap.data.count > 0) || !Number.isFinite(at) || now - at > maxAge) return false;
  return need.every((s) => q[s]);
}

/**
 * Ao voltar para o app (a aba ou o app instalado estavam em segundo plano), buscar as cotações JÁ? Em segundo
 * plano o canal fica fechado e o robô para depois de 10 min sem ninguém olhando: redesenhar com o dado antigo e
 * esperar o canal reconectar deixava o pêndulo parado até um Recarregar. Busca quando há algo negociando, a
 * atualização automática está ligada, o canal não está saudável e o último pacote tem mais de `maxAge` ms.
 */
export function refreshOnReturn({
  now,
  session,
  healthy,
  lastAt = 0,
  autoReload = 1,
  maxAge = 60_000,
}) {
  if (autoReload === 0 || session == null || healthy) return false;
  return now - (lastAt || 0) > maxAge;
}

/** Canal saudável: aberto e com pacote recente para a sessão atual. */
export function feedHealthy({ joined, lastAt }, session, now = Date.now()) {
  const lim = STALE_MS[session];
  return !!(joined && lim && lastAt && now - lastAt < lim);
}

/**
 * Sessão do canal (a mesma regra da Edge Function quotes-feed, em assets/sessions.js): "open" | "pre" |
 * "post" pela bolsa (com feriados) e, com ela fechada, "night" enquanto os futuros da CME negociam.
 * null = nada a receber. O 2º argumento (antigo `usSession`) é ignorado: a regra é uma só.
 */
export const feedSession = (ms) => sessionFeed(ms);

export const feed = {
  joined: false,
  lastAt: 0,
  ws: null,
  seq: 0,
  gaps: 0,
  touchAt: 0,
  touchError: null,
};
/** Presença repetida a cada 5 min com o canal aberto (a janela do servidor é de 10 min). */
export const TOUCH_EVERY = 5 * 60_000;

/**
 * Abre (e mantém) o canal. onQuotes(data) a cada pacote. `wanted()` diz se vale ficar conectado agora
 * (mercado fechado ou app em segundo plano: fecha e economiza conexão e mensagens).
 */
export function startFeed({ onQuotes, wanted, onState = () => {}, touch = null }) {
  if (typeof WebSocket === "undefined") return () => {};
  let ref = 0;
  let hb = null;
  let retry = 1000;
  let timer = null;
  let stopped = false;
  let touchTimer = null;

  /** Avisa presença (sob demanda no servidor). Erro fica registrado em feed.touchError, não é engolido. */
  const presence = () => {
    if (!touch || stopped) return;
    touch().then(
      () => {
        feed.touchAt = Date.now();
        feed.touchError = null;
      },
      (e) => {
        feed.touchError = String(e?.message ?? e);
      },
    );
  };

  const close = () => {
    clearInterval(hb);
    clearInterval(touchTimer);
    touchTimer = null;
    hb = null;
    const ws = feed.ws;
    feed.ws = null;
    feed.joined = false;
    if (ws) {
      ws.onclose = ws.onmessage = ws.onerror = null;
      try {
        ws.close();
      } catch {
        /* já fechado */
      }
    }
    onState(feed);
  };

  const later = () => {
    clearTimeout(timer);
    if (stopped) return;
    timer = setTimeout(sync, retry);
    retry = Math.min(retry * 2, 60_000);
  };

  function open() {
    const url =
      `${SUPABASE_URL.replace(/^http/, "ws")}/realtime/v1/websocket` +
      `?apikey=${encodeURIComponent(SUPABASE_KEY)}&vsn=1.0.0`;
    let ws;
    try {
      ws = new WebSocket(url);
    } catch {
      return later();
    }
    feed.ws = ws;
    ws.onopen = () => {
      ws.send(JSON.stringify(joinMsg(++ref)));
      hb = setInterval(() => ws.send(JSON.stringify(heartbeatMsg(++ref))), HEARTBEAT);
    };
    ws.onmessage = (e) => {
      const f = parseFrame(e.data);
      if (!f) return;
      if (f.kind === "joined") {
        feed.joined = true;
        retry = 1000;
        presence();
        clearInterval(touchTimer);
        touchTimer = setInterval(presence, TOUCH_EVERY);
        onState(feed);
      } else if (f.kind === "error") {
        close();
        later();
      } else {
        feed.lastAt = Date.now();
        const seq = f.data.feed?.seq;
        if (Number.isFinite(seq)) {
          if (feed.seq && seq > feed.seq + 1) feed.gaps++; // pacote perdido: o completo de 5 min corrige
          feed.seq = seq;
        }
        onQuotes(f.data);
      }
    };
    ws.onerror = () => ws.close();
    ws.onclose = () => {
      close();
      later();
    };
  }

  /** Liga ou desliga conforme `wanted()`; chamado no início, ao voltar ao app e a cada minuto. */
  function sync() {
    if (stopped) return;
    if (!wanted()) return void (feed.ws && close());
    if (!feed.ws) open();
    // presença não depende do canal: sem ela o robô (sob demanda) nem roda e o canal fica mudo.
    // Canal no ar avisa a cada 5 min (touchTimer); aqui cobre o canal que não conectou.
    if (!feed.joined && Date.now() - feed.touchAt >= TOUCH_EVERY) presence();
  }

  const onVis = () => sync();
  document.addEventListener("visibilitychange", onVis);
  window.addEventListener("online", onVis);
  const every = setInterval(sync, 60_000);
  sync();
  return () => {
    stopped = true;
    clearTimeout(timer);
    clearInterval(every);
    document.removeEventListener("visibilitychange", onVis);
    window.removeEventListener("online", onVis);
    close();
  };
}
