// Pacote "só o que mudou" do canal de tempo real (Edge Function quotes-feed). Puro, sem rede.
// Protocolo (compatível com o app antigo, cujo mergeLive junta por ativo):
// { fetched_at, market_state, feed: { session, at, seq, kind: "full" | "delta", tier, pulse? },
//   count (ativos no pacote), total (ativos conhecidos), quotes: { SYM: {p, t, v, ms, ...} }, missing }
// - "full" na 1ª rodada da instância e a cada 5 min; "delta" leva só os ativos com algum campo diferente.
// - Nada mudou: não envia; passado 1 min sem envio, manda um "pulso" de 1 ativo (o app trata silêncio
//   longo como canal fora do ar).
// - seq cresce de 1 em 1: o app que vê um salto sabe que perdeu pacote.

export const FULL_EVERY = 5 * 60_000;
export const PULSE_EVERY = 60_000;
export const SNAP_EVERY = 60_000;
/** Campos que o canal não leva (vêm da busca normal do app): 52 semanas, médias de volume, valor, nome. */
const HEAVY = ["h52", "l52", "av3", "mc", "av", "n"];

export function slimQuote(q) {
  const out = {};
  for (const [k, v] of Object.entries(q ?? {})) if (!HEAVY.includes(k)) out[k] = v;
  return out;
}

function same(a, b) {
  if (!a || !b) return false;
  const ka = Object.keys(a);
  if (ka.length !== Object.keys(b).length) return false;
  return ka.every((k) => a[k] === b[k]);
}

/** Ativos de `cur` que não existiam em `prev` ou têm algum campo diferente (já enxutos). */
export function diffQuotes(prev, cur) {
  const out = {};
  for (const [s, q] of Object.entries(cur ?? {})) if (!same(prev?.[s], q)) out[s] = q;
  return out;
}

export const newMem = () => ({ last: {}, seq: 0, fullAt: 0, sentAt: 0 });

/**
 * Decide o que transmitir. `mem` = memória da instância (newMem()); `data` = resposta do fetchAll da rodada
 * com `feed` = { session, at, tier }. Devolve { packet | null, mem } (mem novo; o antigo não é mutado).
 */
export function planPacket(mem, data, now, { pulseSym = "SPY" } = {}) {
  const cur = {};
  for (const [s, q] of Object.entries(data?.quotes ?? {})) cur[s] = slimQuote(q);
  const merged = { ...mem.last, ...cur };
  const full = !mem.seq || now - mem.fullAt >= FULL_EVERY;
  let quotes = full ? merged : diffQuotes(mem.last, cur);
  let pulse = false;
  if (!Object.keys(quotes).length) {
    const ps = merged[pulseSym] ? pulseSym : Object.keys(merged)[0];
    if (now - mem.sentAt < PULSE_EVERY || !ps)
      return { packet: null, mem: { ...mem, last: merged } };
    quotes = { [ps]: merged[ps] };
    pulse = true;
  }
  const seq = mem.seq + 1;
  const total = Object.keys(merged).length;
  const packet = {
    fetched_at: data.fetched_at,
    version: data.version,
    source: data.source,
    market_state: merged.SPY?.ms ?? data.market_state ?? null,
    count: Object.keys(quotes).length,
    total,
    quotes,
    missing: (data.missing ?? []).filter((s) => !merged[s]),
    errors: data.errors ?? [],
    feed: { ...(data.feed ?? {}), seq, kind: full ? "full" : "delta", ...(pulse ? { pulse } : {}) },
  };
  return {
    packet,
    mem: { last: merged, seq, fullAt: full ? now : mem.fullAt, sentAt: now },
  };
}

export const ZERO_STATS = Object.freeze({
  runs: 0,
  yahoo_calls: 0,
  packets: 0,
  bytes_sent: 0,
  symbols_sent: 0,
});

/** Soma os contadores da rodada aos do dia (AAAA-MM-DD, horário de NY); guarda os últimos `keep` dias. */
export function addStats(stats, delta, date, keep = 14) {
  const out = { ...(stats && typeof stats === "object" ? stats : {}) };
  const cur = { ...ZERO_STATS, ...(out[date] ?? {}) };
  for (const [k, v] of Object.entries(delta ?? {}))
    if (Number.isFinite(v)) cur[k] = (cur[k] ?? 0) + v;
  out[date] = cur;
  for (const d of Object.keys(out).sort().slice(0, -keep)) delete out[d];
  return out;
}
