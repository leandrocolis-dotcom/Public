// Central de barras intraday do app (docs/PLANO-OTIMIZACAO.md, Fase 2, passo 2.6). Todas as telas que pedem
// api/intraday?symbol= ou ?symbols= passam por aqui (Fluxo, Watchlist, painel do ativo, radar técnico):
// - um cache só, por URL (a mesma URL = o mesmo cache da borda na Vercel);
// - validade = tamanho da barra, alinhada ao relógio: barras de 5 min revalidam na próxima virada :00/:05/:10…,
//   barras de 30 min na próxima :00/:30 (com uma folga para a barra fechar no Yahoo);
// - pedidos iguais ao mesmo tempo viram um só (fetchJSON de net.js; cargas de fundo com { bg: true });
// - erro mantém as barras anteriores e tenta de novo em 1 min.
// Entre uma busca e outra, a última barra é completada pelo preço ao vivo do canal nas telas que já faziam isso
// (rotação: rot-intraday.js usa completeLastBar; painel do ativo: intradaySeries). A central não recalcula nada.
import { fetchJSON } from "./net.js";
import { completeLastBar } from "./rot-intraday.js";

/** Tamanho da barra (min) por lote da API: short = 5 min (2 pregões), long = 30 min (5 pregões). */
export const BAR_MIN = { short: 5, long: 30 };
/** Folga depois da virada da barra, para o Yahoo fechar a barra anterior. */
export const GRACE = 20_000;
/** Intervalo mínimo entre duas buscas da mesma URL (a borda guarda por 60 s). */
export const MIN_GAP = 30_000;
/** Nova tentativa depois de um erro. */
export const ERR_RETRY = 60_000;
const MAX_ENTRIES = 60;
const IDLE = 30 * 60_000;

/**
 * URL canônica (= chave do cache). { symbol, prepost } = um ativo em barras de 5 min (5 pregões);
 * { symbols, win } = lote da rotação (símbolos sem repetição e em ordem, para a mesma URL entre telas).
 */
export function barsKey({ symbol, symbols, win = "short", prepost = false } = {}) {
  if (symbols) {
    const list = [...new Set(symbols)].sort();
    return `api/intraday?symbols=${list.map(encodeURIComponent).join(",")}&win=${win}`;
  }
  return `api/intraday?symbol=${encodeURIComponent(symbol)}${prepost ? "&prepost=1" : ""}`;
}

/** Tamanho da barra (min) de uma chave: lote long = 30; o resto (short e ?symbol=) = 5. */
export const barMinOf = (key) => (/[?&]win=long\b/.test(key) ? BAR_MIN.long : BAR_MIN.short);

/** Próxima virada da barra no relógio (ms) depois de `now`, mais a folga. */
export function validUntil(now, barMin, grace = GRACE) {
  const ms = barMin * 60_000;
  return Math.floor(now / ms) * ms + ms + grace;
}

/**
 * Até quando a resposta vale (ms). A base é a hora em que o servidor buscou (fetched_at): uma resposta antiga
 * do cache da borda vence logo. Nunca antes de MIN_GAP; com erro, ERR_RETRY.
 */
export function expiryOf({ now, fetchedAt = null, barMin, ok = true }) {
  if (!ok) return now + ERR_RETRY;
  const base = Number.isFinite(fetchedAt) && fetchedAt <= now ? fetchedAt : now;
  return Math.max(validUntil(base, barMin), now + MIN_GAP);
}

// completeLastBar mora em rot-intraday.js (puro, também usado pela função api/_leaders.js no servidor, que
// assim não carrega net.js); reexportado aqui para as telas.
export { completeLastBar };

// --- cache (estado do app) ---

/** key → { data, err, at, exp, loading, promise, used, listeners } */
export const barsCache = new Map();

function entryOf(key, now) {
  let e = barsCache.get(key);
  if (!e) {
    e = { data: null, err: null, at: 0, exp: 0, loading: false, promise: null, used: now, listeners: new Set() }; // prettier-ignore
    barsCache.set(key, e);
    prune(now);
  }
  e.used = now;
  return e;
}

function prune(now) {
  if (barsCache.size <= MAX_ENTRIES) return;
  for (const [k, e] of barsCache) if (!e.loading && now - e.used > IDLE) barsCache.delete(k);
}

function load(key, e, bg, url = key) {
  e.loading = true;
  e.promise = fetchJSON(url, bg ? { bg: true } : {})
    .then(
      (d) => {
        const now = Date.now();
        Object.assign(e, { data: d, err: null, at: now });
        e.exp = expiryOf({ now, fetchedAt: Date.parse(d?.fetched_at ?? ""), barMin: barMinOf(key) }); // prettier-ignore
        return d;
      },
      (err) => {
        const now = Date.now();
        Object.assign(e, { err: String(err?.message ?? err).slice(0, 80), at: now });
        e.exp = expiryOf({ now, ok: false });
        throw err;
      },
    )
    .finally(() => {
      e.loading = false;
      const ls = [...e.listeners];
      e.listeners.clear();
      for (const fn of ls) fn();
    });
  e.promise.catch(() => {}); // quem só lê a entrada (useBars) não precisa tratar o erro
  return e.promise;
}

/** Entrada atual da chave, sem buscar (ou null). */
export const peekBars = (key) => barsCache.get(key) ?? null;

/**
 * Para desenho síncrono: devolve a entrada { data, err, loading, at } e, se venceu, dispara a busca em segundo
 * plano (a entrada continua com as barras anteriores enquanto isso). onUpdate (função estável, sem repetição)
 * é chamado quando a busca em andamento termina.
 */
export function useBars(key, { bg = false, onUpdate = null, now = Date.now() } = {}) {
  const e = entryOf(key, now);
  if (!e.loading && now >= e.exp) load(key, e, bg);
  if (e.loading && onUpdate) e.listeners.add(onUpdate);
  return e;
}

/**
 * Para quem espera: promessa com as barras válidas (do cache, da busca em andamento ou de uma nova).
 * force = ignora a validade (não repete uma busca em andamento). Rejeita no erro; as barras anteriores
 * continuam em peekBars(key).data.
 */
export function getBars(key, { force = false, bg = false, now = Date.now() } = {}) {
  const e = entryOf(key, now);
  if (e.loading) return e.promise;
  if (!force && now < e.exp) return e.err ? Promise.reject(new Error(e.err)) : Promise.resolve(e.data); // prettier-ignore
  return load(key, e, bg);
}

/**
 * Atualização manual (botão ⟳ do pêndulo): busca agora, furando o cache de 60 s da borda com um parâmetro
 * extra, e grava na chave canônica (as telas que usam a mesma chave recebem as barras novas).
 */
export function refreshBars(key, { now = Date.now() } = {}) {
  const e = entryOf(key, now);
  if (e.loading) return e.promise;
  return load(key, e, false, `${key}&r=${now}`);
}
