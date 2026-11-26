// VERSÃO ANTERIOR (v1), guardada para voltar atrás em minutos: renomeie para index.ts e reimplante.
// Busca o universo inteiro a cada 15 s com ou sem alguém olhando. Substituída pelo index.ts (camadas + delta).
// Supabase Edge Function "quotes-feed": cotações em tempo real empurradas para o app (Realtime Broadcast).
// O pg_cron (job `pendulo-quotes-feed`) chama a função a cada 15 s. Ela decide se é hora de buscar:
// pregão 9:30–16:00, pré 4:00–9:30 e pós 16:00–20:00 (Nova York) = toda chamada (15 s) · noite com os
// futuros da CME negociando (domingo 18:00 a sexta 17:00) = a cada 1 min, para o modo Off · fim de semana
// = nada. Feriado da NYSE (o Yahoo devolve CLOSED no horário do pregão) = no máximo a cada 10 min.
// A busca roda AQUI, direto no Yahoo (→ spark → Nasdaq), com o mesmo código do app: quotes.bundle.js é o
// api/quotes.js empacotado por `npm run build:feed`. Antes ela chamava GET /api/quotes da Vercel a cada 15 s,
// o que estourava a cota de CPU do plano grátis. Universo + ativos das carteiras da nuvem; o resultado vai
// num pacote único pelo canal público `pendulo-quotes` (evento `quotes`) e fica gravado em `pendulo_quotes`
// (última foto e trava contra chamadas repetidas).
// A regra de sessão é a mesma de feedSession() em assets/live-feed.js: mudou aqui, mude lá.
import { fetchAll, SYMBOL_RE, SYMBOLS } from "./quotes.bundle.js";

const KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const URL_ = Deno.env.get("SUPABASE_URL")!;
const TOPIC = "pendulo-quotes";
const MAX_EXTRA = 60; // mesmo limite do /api/quotes
const UNIVERSE = new Set<string>(SYMBOLS);
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });

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

const NY = new Intl.DateTimeFormat("en-US", {
  timeZone: "America/New_York",
  weekday: "short",
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
});

/** "open" | "pre" | "post" | "night" (só futuros) | "closed" pelo relógio de Nova York. */
function session(ms: number) {
  const p = Object.fromEntries(NY.formatToParts(new Date(ms)).map((x) => [x.type, x.value]));
  const min = Number(p.hour) * 60 + Number(p.minute);
  const d = p.weekday;
  if (d === "Sat") return "closed";
  if (d === "Sun") return min >= 1080 ? "night" : "closed";
  if (min >= 570 && min < 960) return "open";
  if (min >= 240 && min < 570) return "pre";
  if (min >= 960 && min < 1200) return "post";
  if (d === "Fri" && min >= 1200) return "closed"; // futuros fecham sexta 17:00
  return "night";
}

/** Intervalo mínimo entre buscas (ms) ou null quando não há o que buscar. */
function minGap(s: string, lastState: string | null) {
  if (s === "closed") return null;
  if (s === "night") return 55_000;
  if (s === "open" && lastState === "CLOSED") return 10 * 60_000; // feriado da NYSE: o preço não muda
  return 10_000;
}

/** Tickers das carteiras da nuvem que ficam fora do universo (como o parseExtra do /api/quotes). */
async function extras() {
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
  return [...count]
    .sort((a, b) => b[1] - a[1])
    .map(([s]) => s)
    .slice(0, MAX_EXTRA);
}

async function broadcast(payload: unknown) {
  const r = await fetch(`${URL_}/realtime/v1/api/broadcast`, {
    method: "POST",
    headers: { apikey: KEY, Authorization: `Bearer ${KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      messages: [{ topic: TOPIC, event: "quotes", payload, private: false }],
    }),
  });
  if (!r.ok) throw new Error(`broadcast HTTP ${r.status} ${(await r.text()).slice(0, 200)}`);
}

async function run(force: boolean) {
  const now = Date.now();
  const s = session(now);
  const last = (await rest("pendulo_quotes?id=eq.1&select=claimed_at,market_state"))?.[0] ?? null;
  const gap = minGap(s, last?.market_state ?? null);
  // idade contada do INÍCIO da última busca (claimed_at): o cron a cada 15 s sempre passa da trava de 10 s
  const age = last ? now - new Date(last.claimed_at).getTime() : Infinity;
  // ?force (teste manual) ignora o horário, mas nunca a trava de 10 s: a URL é pública
  if (age < 10_000 || (!force && (gap === null || age < gap)))
    return { skipped: true, session: s, age };
  // trava atômica: duas chamadas sobrepostas (a busca leva até 25 s, o cron dispara a cada 15 s) não
  // buscam juntas; só segue quem conseguir marcar claimed_at
  const iso = new Date(now).toISOString();
  const won = await rest(
    `pendulo_quotes?id=eq.1&claimed_at=lt.${encodeURIComponent(new Date(now - 10_000).toISOString())}`,
    { method: "PATCH", body: { claimed_at: iso }, prefer: "return=representation" },
  );
  if (!won?.length) return { skipped: true, session: s, busy: true };

  const ex = await extras();
  // mesmo prazo do /api/quotes (22 s): responde com o que já tem antes do teto do pg_net (30 s)
  const data = await fetchAll(SYMBOLS, ex, { deadline: Date.now() + 22_000 });
  if (!(data?.count > 0))
    throw new Error(`Yahoo: sem cotações (${data?.errors?.join(" | ") ?? "?"})`);
  data.version = "supabase";
  data.feed = { session: s, at: new Date().toISOString() };
  // o canal leva só o que muda no dia; máximas/mínimas de 52 semanas, médias de volume, valor de mercado e
  // nome ficam com o app (vêm da busca normal) — o pacote cai quase pela metade
  const slim = { ...data, quotes: {} as Record<string, unknown> };
  for (const [sym, q] of Object.entries(data.quotes ?? {})) {
    const { h52, l52, av3, mc, av, n, ...rest } = q as Record<string, unknown>;
    slim.quotes[sym] = rest;
  }
  await broadcast(slim);
  await rest("pendulo_quotes?id=eq.1", {
    method: "PATCH",
    prefer: "return=minimal",
    body: { data, market_state: data.market_state, at: data.feed.at },
  });
  return { sent: true, session: s, count: data.count, total: data.total, extra: ex.length };
}

Deno.serve(async (req) => {
  try {
    return json({ ok: true, ...(await run(new URL(req.url).searchParams.has("force"))) });
  } catch (e) {
    return json({ error: String((e as Error)?.message ?? e) }, 500);
  }
});
