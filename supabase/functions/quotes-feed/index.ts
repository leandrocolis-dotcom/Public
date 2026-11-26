// Supabase Edge Function "quotes-feed": cotações em tempo real empurradas para o app (Realtime Broadcast).
// v2 (docs/PLANO-OTIMIZACAO.md, Fase 1). Versão anterior em index.v1.ts (voltar atrás = renomear e reimplantar).
// O pg_cron (job `pendulo-quotes-feed`) chama a função a cada 15 s, SÓ se algum aparelho avisou presença nos
// últimos 10 min (pendulo_demand, gravada pelo app via pendulo_touch). A cada chamada:
// - camada QUENTE (toda rodada): referências + ativos que os aparelhos têm na tela, até 1 consulta ao Yahoo;
// - camada MORNA (a cada 60 s): o resto do universo + carteiras, só dos mercados abertos agora;
// - mercado fechado não é buscado (regra única de sessão em assets/sessions.js, com feriados);
// - 1ª rodada da instância: busca tudo e manda o pacote completo.
// O canal leva só o que mudou (assets/feed-delta.js): completo a cada 5 min, `seq` crescente, pulso de 60 s.
// A foto completa vai para `pendulo_quotes` no máximo 1 vez por minuto, com os contadores do dia (`stats`).
// A busca roda AQUI, direto no Yahoo (→ spark → Nasdaq), com o mesmo código do app: quotes.bundle.js é o
// api/quotes.js (+ sessions/feed-tiers/feed-delta) empacotado por `npm run build:feed`.
import {
  addStats,
  feedSession,
  fetchAll,
  hotList,
  newMem,
  nyClock,
  pickTier,
  planPacket,
  SNAP_EVERY,
  SYMBOL_RE,
  SYMBOLS,
  yahooCalls,
  ZERO_STATS,
} from "./quotes.bundle.js";

const KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const URL_ = Deno.env.get("SUPABASE_URL")!;
// ?force (teste manual) só com o cabeçalho x-feed-secret igual a este segredo (sem segredo = force desligado)
const FORCE_SECRET = Deno.env.get("FEED_SECRET") ?? "";
const TOPIC = "pendulo-quotes";
const MAX_EXTRA = 60; // mesmo limite do /api/quotes
const EXTRAS_TTL = 5 * 60_000;
const DEMAND_WINDOW = 10 * 60_000;
const UNIVERSE = new Set<string>(SYMBOLS);
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });

// Memória da instância (some quando ela esfria: a próxima rodada busca tudo e manda o pacote completo).
let mem = newMem();
let full: Record<string, unknown> = {}; // última cotação completa (com 52 semanas etc.) de cada ativo
let lastWarmAt = 0;
let snapAt = 0;
let extrasCache = { at: 0, list: [] as string[] };
let pending = { ...ZERO_STATS };
let hasStats = true;

async function rest(path: string, init: { method?: string; body?: unknown; prefer?: string } = {}) {
  const r = await fetch(`${URL_}/rest/v1/${path}`, {
    method: init.method ?? "GET",
    headers: {
      apikey: KEY,
      Authorization: `Bearer ${KEY}`,
      "Content-Type": "application/json",
      ...(init.prefer ? { Prefer: init.prefer } : {}),
    },
    body: init.body ? JSON.stringify(init.body) : undefined,
  });
  if (!r.ok)
    throw new Error(`${path.split("?")[0]}: HTTP ${r.status} ${(await r.text()).slice(0, 200)}`);
  const txt = r.status === 204 ? "" : await r.text();
  return txt ? JSON.parse(txt) : null;
}

/** Tickers das carteiras da nuvem fora do universo; lidos no máximo a cada 5 min (memória). */
async function extras(now: number) {
  if (now - extrasCache.at < EXTRAS_TTL) return extrasCache.list;
  const rows = await rest("pendulo_portfolio?select=holdings");
  const count = new Map<string, number>();
  for (const r of rows ?? [])
    for (const h of r.holdings ?? []) {
      const s = String(h?.sym ?? "")
        .toUpperCase()
        .trim();
      if (SYMBOL_RE.test(s.replace(/^\^/, "")) && !UNIVERSE.has(s))
        count.set(s, (count.get(s) ?? 0) + 1);
    }
  // mais carteiras primeiro, para o corte de 60 não deixar de fora o que mais gente usa
  const list = [...count]
    .sort((a, b) => b[1] - a[1])
    .map(([s]) => s)
    .slice(0, MAX_EXTRA);
  extrasCache = { at: now, list };
  return list;
}

/** Ativos pedidos pelos aparelhos com presença recente (o mais recente primeiro). Falha = só referências. */
async function demand(now: number): Promise<string[][]> {
  try {
    const since = encodeURIComponent(new Date(now - DEMAND_WINDOW).toISOString());
    const rows = await rest(`pendulo_demand?select=syms&at=gt.${since}&order=at.desc&limit=50`);
    return (rows ?? []).map((r: { syms?: string[] }) => r.syms ?? []);
  } catch {
    return [];
  }
}

async function broadcast(payload: unknown) {
  const body = JSON.stringify({
    messages: [{ topic: TOPIC, event: "quotes", payload, private: false }],
  });
  const r = await fetch(`${URL_}/realtime/v1/api/broadcast`, {
    method: "POST",
    headers: { apikey: KEY, Authorization: `Bearer ${KEY}`, "Content-Type": "application/json" },
    body,
  });
  if (!r.ok) throw new Error(`broadcast HTTP ${r.status} ${(await r.text()).slice(0, 200)}`);
  return body.length;
}

async function run(force: boolean) {
  const now = Date.now();
  const s = feedSession(now);
  // coluna `stats` vem do SQL da Fase 1; sem ela (SQL ainda não aplicado) a função segue sem contadores
  let last: { claimed_at: string; stats?: Record<string, unknown> } | null = null;
  try {
    last = (await rest("pendulo_quotes?id=eq.1&select=claimed_at,stats"))?.[0] ?? null;
  } catch {
    hasStats = false;
    last = (await rest("pendulo_quotes?id=eq.1&select=claimed_at"))?.[0] ?? null;
  }
  // idade contada do INÍCIO da última busca (claimed_at): o cron a cada 15 s sempre passa da trava de 10 s
  const age = last ? now - new Date(last.claimed_at).getTime() : Infinity;
  if (age < 10_000 || (!force && s === null)) return { skipped: true, session: s, age };
  // trava atômica: duas chamadas sobrepostas (a busca leva até 25 s, o cron dispara a cada 15 s) não
  // buscam juntas; só segue quem conseguir marcar claimed_at
  const won = await rest(
    `pendulo_quotes?id=eq.1&claimed_at=lt.${encodeURIComponent(new Date(now - 10_000).toISOString())}`,
    {
      method: "PATCH",
      body: { claimed_at: new Date(now).toISOString() },
      prefer: "return=representation",
    },
  );
  if (!won?.length) return { skipped: true, session: s, busy: true };

  const [ex, dem] = await Promise.all([extras(now), demand(now)]);
  const hot = hotList(dem, now);
  const pick = pickTier({ now, universe: SYMBOLS, extra: ex, hot, lastWarmAt, session: s });
  if (!pick.tier) return { skipped: true, session: s, idle: true };

  // mesmo prazo do /api/quotes (22 s): responde com o que já tem antes do teto do pg_net (30 s)
  const data = await fetchAll(pick.syms, pick.extra, { deadline: Date.now() + 22_000 });
  if (!(data?.count > 0))
    throw new Error(`Yahoo: sem cotações (${data?.errors?.join(" | ") ?? "?"})`);
  if (pick.tier !== "hot") lastWarmAt = now;
  data.version = "supabase";
  data.feed = { session: s, at: new Date().toISOString(), tier: pick.tier };
  full = { ...full, ...data.quotes };

  const plan = planPacket(mem, data, now);
  mem = plan.mem;
  const bytes = plan.packet ? await broadcast(plan.packet) : 0;
  const calls =
    (data.calls?.quote ?? yahooCalls([...pick.syms, ...pick.extra])) +
    (data.calls?.spark ?? 0) +
    (data.calls?.nasdaq ?? 0);
  pending = {
    runs: pending.runs + 1,
    yahoo_calls: pending.yahoo_calls + calls,
    packets: pending.packets + (plan.packet ? 1 : 0),
    bytes_sent: pending.bytes_sent + bytes,
    symbols_sent: pending.symbols_sent + (plan.packet?.count ?? 0),
  };

  // foto completa + contadores: no máximo 1 gravação por minuto (antes: a cada 15 s)
  let saved = false;
  if (now - snapAt >= SNAP_EVERY - 5_000) {
    const quotes = full;
    const snap = {
      ...data,
      quotes,
      count: Object.keys(quotes).length,
      total: Math.max(SYMBOLS.length, Object.keys(quotes).length),
      missing: [],
      feed: { ...data.feed, seq: mem.seq, kind: "full" },
    };
    await rest("pendulo_quotes?id=eq.1", {
      method: "PATCH",
      prefer: "return=minimal",
      body: {
        data: snap,
        market_state: snap.market_state ?? (quotes.SPY as { ms?: string })?.ms ?? null,
        at: data.feed.at,
        ...(hasStats ? { stats: addStats(last?.stats, pending, nyClock(now).date) } : {}),
      },
    });
    pending = { ...ZERO_STATS };
    snapAt = now;
    saved = true;
  }
  return {
    sent: !!plan.packet,
    session: s,
    tier: pick.tier,
    kind: plan.packet?.feed?.kind ?? null,
    seq: mem.seq,
    count: plan.packet?.count ?? 0,
    fetched: data.count,
    yahoo_calls: calls,
    bytes_sent: bytes,
    hot: hot.length,
    extra: ex.length,
    saved,
  };
}

Deno.serve(async (req) => {
  try {
    const url = new URL(req.url);
    const force =
      url.searchParams.has("force") &&
      !!FORCE_SECRET &&
      req.headers.get("x-feed-secret") === FORCE_SECRET;
    return json({ ok: true, ...(await run(force)) });
  } catch (e) {
    return json({ error: String((e as Error)?.message ?? e) }, 500);
  }
});
