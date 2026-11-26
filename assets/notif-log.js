// Histórico de avisos: tudo o que já foi notificado (a central do sino separa por categoria; a aba Sinais
// mostra só os de trading). Duas origens: avisos gerados com o app aberto (localStorage) e push recebidos pelo
// service worker com o app fechado (cache "pendulo-notif", gravado no sw.js).
import { store } from "./state.js";

const KEY = "pendulo.notif.log";
const MAX = 300;
export const SW_LOG = { cache: "pendulo-notif", path: "./__notif-log" };

/** Notícia? (fica fora do histórico de trading da aba Sinais; entra na central do sino) */
export const isNews = (n) => /^📰|^news/.test(n?.title ?? "") || /tab=news/.test(n?.url ?? "");

/** Junta, tira repetidos (mesmo título e corpo em até 1 h) e ordena do mais novo para o mais antigo. */
export function mergeLog(...lists) {
  const out = [];
  for (const n of lists
    .flat()
    .filter((x) => x?.title)
    .sort((a, b) => b.at - a.at))
    if (
      !out.some((o) => o.title === n.title && o.body === n.body && Math.abs(o.at - n.at) < 3600e3)
    )
      out.push(n);
  return out.slice(0, MAX);
}

export function logNotif(n) {
  store.set(KEY, mergeLog(store.get(KEY, []), [{ at: Date.now(), ...n }]));
}

/** Lê o histórico local + o do service worker (push com o app fechado). */
export async function readLog() {
  let sw = [];
  try {
    const c = await caches.open(SW_LOG.cache);
    const r = await c.match(SW_LOG.path);
    if (r) sw = await r.json();
  } catch {
    /* sem cache */
  }
  const all = mergeLog(store.get(KEY, []), sw);
  store.set(KEY, all);
  return all;
}

export function clearLog() {
  store.set(KEY, []);
  caches
    ?.open(SW_LOG.cache)
    .then((c) => c.delete(SW_LOG.path))
    .catch(() => {});
}

/** Monta o link do item: &hold=SYM abre o ativo da carteira; &asset=SYM o do universo; &news=ID a matéria. */
export function linkFor({ tab = "signals", hold, asset, news } = {}) {
  const q = new URLSearchParams({ tab });
  if (hold) q.set("hold", hold);
  if (asset) q.set("asset", asset);
  if (news) q.set("news", news);
  return `./?${q}`;
}

/** Leitura síncrona (para a tela); readLog() traz os push do service worker para cá. */
export const logNow = () => store.get(KEY, []);

/** Só os avisos de trading (sem notícias), para o histórico da aba Sinais. */
export const tradeLog = () => logNow().filter((n) => !isNews(n));
