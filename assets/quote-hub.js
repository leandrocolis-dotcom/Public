// Central de cotações do app (docs/PLANO-OTIMIZACAO.md, Fase 2). Todas as telas pedem cotação aqui:
// - o que o canal de tempo real já entrega (state.live, pacote recente) não é buscado;
// - o resto vai em blocos estáveis de 60 (1 consulta ao Yahoo cada; mesma URL = cache da borda), um bloco por
//   vez, com validade por ativo (padrão 60 s) e sem repetir pedido em andamento;
// - erro fica registrado por ativo (idade e motivo), em vez de engolido;
// - os ativos pedidos pelas telas abertas vão na presença (pendulo_touch) e viram camada quente no servidor:
//   a tela aberta passa a receber pelo canal em vez de buscar.
// Variação do dia continua p / pc da MESMA cotação (docs/COERENCIA.md): a central só guarda o que o
// /api/quotes devolveu, sem recalcular nada.
import { fetchJSON, stableLots } from "./net.js";
import { state } from "./state.js";

export const LOT = 60;
export const TTL = 60_000;
/** Pacote do canal mais velho que isso não conta como "o canal cobre". */
export const LIVE_FRESH = 90_000;
const WANT_FOR = 5 * 60_000;

export const hub = { quotes: {}, at: {}, err: {}, inflight: new Set(), wants: new Map() };
let touchFn = null;
let touchTimer = null;
let touchedKey = "";

/** Cotação do canal de tempo real, se o pacote é recente. */
export function liveQuote(sym, now = Date.now(), live = state.live) {
  const q = live?.quotes?.[sym];
  if (!q) return null;
  const at = Date.parse(live.fetched_at ?? 0);
  return Number.isFinite(at) && now - at < LIVE_FRESH ? q : null;
}

/**
 * Quais ativos buscar agora (puro): fora do canal, sem cotação válida há `ttl` ms e sem pedido em andamento.
 * `force` ignora a validade (mas não o canal nem o pedido em andamento).
 */
export function needFetch(syms, { now, ttl = TTL, force = false, at = {}, inflight = new Set(), live = () => null }) {
  return [...new Set(syms)]
    .filter((s) => typeof s === "string" && s)
    .filter((s) => !live(s) && !inflight.has(s) && (force || !(now - (at[s] ?? 0) < ttl)));
} // prettier-ignore

/** Cotação da central (buscada por alguma tela), ou null. */
export const hubQuote = (sym) => hub.quotes[sym] ?? null;

/** Erros recentes por ativo (últimos 10 min). */
export const hubErrors = (now = Date.now()) =>
  Object.entries(hub.err).filter(([, e]) => now - e.at < 10 * 60_000);

/** A tela `id` está mostrando estes ativos (vai na presença para virar camada quente no servidor). */
export function want(id, syms, now = Date.now()) {
  hub.wants.set(id, { at: now, syms: [...new Set(syms)].slice(0, 120) });
  scheduleTouch();
}

/** Ativos para a presença, em ordem de prioridade: carteira, depois as telas (a mais recente primeiro). */
export function demandSyms(now = Date.now(), held = []) {
  const lists = [...hub.wants.values()]
    .filter((w) => now - w.at < WANT_FOR)
    .sort((a, b) => b.at - a.at)
    .flatMap((w) => w.syms);
  return [...new Set([...held, ...lists])].slice(0, 80);
}

/** O app registra como avisar presença (cloud.touchDemand). */
export function setTouch(fn) {
  touchFn = fn;
}
function scheduleTouch() {
  if (!touchFn || touchTimer) return;
  touchTimer = setTimeout(() => {
    touchTimer = null;
    const syms = demandSyms(Date.now(), heldSyms());
    const key = syms.join(",");
    if (key === touchedKey) return; // nada novo: a presença de 5 min do canal basta
    touchedKey = key;
    touchFn(syms).catch(() => (touchedKey = ""));
  }, 3000);
}
const heldSyms = () => (state.portfolio?.holdings ?? []).map((h) => h.sym);

/**
 * Busca (se preciso) e devolve { quotes, fetched (quantos foram buscados agora) } dos ativos pedidos, já com o que o canal e a central têm.
 * `id` registra o pedido para a presença; `bg` põe na fila de fundo; `ttl` validade por ativo.
 */
export async function fetchQuotes(
  syms,
  { id = null, ttl = TTL, force = false, bg = true, bidAsk = false } = {},
) {
  // prettier-ignore
  const now = Date.now();
  if (id) want(id, syms, now);
  // bidAsk: o canal só "cobre" o ativo se trouxer bid/ask (b/a); senão a central busca na API (Long & Short)
  const covers = (s) => {
    const q = liveQuote(s, now);
    return q && (!bidAsk || (q.b > 0 && q.a > 0)) ? q : null;
  };
  const need = needFetch(syms, {
    now,
    ttl,
    force,
    at: hub.at,
    inflight: hub.inflight,
    live: covers,
  });
  need.forEach((s) => hub.inflight.add(s));
  try {
    // um bloco por vez: em rajada, o Yahoo responde 429 e parte da lista fica sem preço
    for (const lot of stableLots(need, need, LOT)) {
      try {
        const j = await fetchJSON(`api/quotes?only=1&extra=${encodeURIComponent(lot.join(","))}`, { bg }); // prettier-ignore
        const got = j?.quotes ?? {};
        const t = Date.now();
        for (const s of lot) {
          if (got[s]) {
            hub.quotes[s] = got[s];
            delete hub.err[s];
          } else hub.err[s] = { at: t, msg: "sem cotação na fonte" };
          hub.at[s] = t;
        }
      } catch (e) {
        const t = Date.now();
        for (const s of lot) {
          hub.err[s] = { at: t, msg: String(e?.message ?? e) };
          hub.at[s] = t - ttl + 15_000; // tenta de novo em ~15 s, não na hora
        }
      }
    }
  } finally {
    need.forEach((s) => hub.inflight.delete(s));
  }
  const quotes = {};
  for (const s of syms) {
    const lq = liveQuote(s);
    const hq = hub.quotes[s];
    let q = lq ?? hq;
    // preço do canal (mais novo) + bid/ask da API quando o canal não traz
    if (bidAsk && lq && !(lq.b > 0) && hq?.b > 0) q = { ...lq, b: hq.b, a: hq.a, baT: hub.at[s] };
    if (q) quotes[s] = q;
  }
  return { quotes, fetched: need.length };
}
