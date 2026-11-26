// Camadas de cadência do robô de cotações (Edge Function quotes-feed). Puro, sem rede.
// Quente (a cada rodada, 15 s): referências + o que alguém tem aberto (pendulo_demand). Morna (a cada 60 s):
// o resto do universo cujo mercado está negociando. Fria: mercado fechado não é buscado. Na 1ª rodada de uma
// instância nova (memória vazia) busca tudo, para o pacote completo não levar preço velho.
import { symOpen } from "./sessions.js";

export const CHUNK = 60; // símbolos por consulta ao Yahoo (o mesmo do api/quotes.js)
export const WARM_EVERY = 60_000;
/** Referências sempre quentes (quando o mercado delas está aberto). */
export const REFS = ["SPY", "QQQ", "^VIX", "^TNX", "DX-Y.NYB", "BRL=X", "ES=F", "NQ=F", "BTC-USD"];

/** Vagas que o símbolo ocupa numa consulta: futuro contínuo = 2 (contínuo + contrato vigente). */
export const slots = (sym) => (/=F$/.test(sym) ? 2 : 1);
/** Consultas ao Yahoo para buscar esta lista. */
export const yahooCalls = (syms) => Math.ceil(syms.reduce((n, s) => n + slots(s), 0) / CHUNK);

/**
 * Lista quente da rodada: referências + pedidos dos aparelhos (em ordem de prioridade: o aparelho manda a
 * carteira, depois a lista aberta, depois o painel), só o que está negociando agora, sem passar de 1
 * consulta ao Yahoo (`limit` vagas). O excedente fica na camada morna.
 */
export function hotList(demand, now, { refs = REFS, limit = CHUNK } = {}) {
  const out = [];
  const seen = new Set();
  let used = 0;
  for (const s of [...refs, ...(demand ?? []).flat()]) {
    if (typeof s !== "string" || !s || seen.has(s)) continue;
    seen.add(s);
    if (!symOpen(s, now)) continue;
    const c = slots(s);
    if (used + c > limit) continue;
    out.push(s);
    used += c;
  }
  return out;
}

/**
 * Símbolos da rodada. `universe` = SYMBOLS do api/quotes.js; `extra` = ativos das carteiras fora do universo;
 * `hot` = hotList(); `lastWarmAt` = hora da última rodada morna (0 = nunca: busca tudo); `session` = a do
 * canal (feedSession): à noite não há rodada quente.
 * Devolve { tier: "full" | "warm" | "hot" | null, syms (do universo), extra (fora dele) }.
 */
export function pickTier({ now, universe, extra = [], hot = [], lastWarmAt = 0, session = null }) {
  const uni = new Set(universe);
  const split = (list, tier) => {
    const all = [...new Set(list)];
    return {
      tier: all.length ? tier : null,
      syms: all.filter((s) => uni.has(s)),
      extra: all.filter((s) => !uni.has(s)),
    };
  };
  if (!lastWarmAt) return split([...universe, ...extra, ...hot], "full");
  // 5 s de folga: o cron dispara a cada 15 s e a rodada anterior pode ter começado um pouco depois
  if (now - lastWarmAt >= WARM_EVERY - 5_000) {
    const r = split(
      [...universe, ...extra, ...hot].filter((s) => symOpen(s, now)),
      "warm",
    );
    if (r.tier) return r;
  }
  // à noite (só futuros, moedas e cripto) não há rodada quente: tudo a cada 60 s, como na v1
  if (session === "night") return split([], "hot");
  return split(
    hot.filter((s) => symOpen(s, now)),
    "hot",
  );
}
