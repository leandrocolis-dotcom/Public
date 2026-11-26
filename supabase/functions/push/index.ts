// Supabase Edge Function "push": avisos push com o app fechado.
// GET ?key -> { publicKey } (chave VAPID pública para o app inscrever o aparelho)
// GET      -> envia os avisos pendentes e devolve { users, sent }; ?dry simula sem enviar.
// GET ?tick -> chamada do pg_cron (a cada minuto): tudo no pré/pregão/pós de NY; fora disso, tudo de 10 em 10 min
//   e, nos outros minutos, só o regime do mercado (?only=mkt, chamada leve) enquanto houver futuro negociando.
// POST ?release { sha } -> aviso "versão nova do app" a todos os aparelhos, uma vez por usuário e versão
//   (chave release:<sha12> em pendulo_push_sent). Sem segredo: só avisa se o sha for o que está no ar
//   (api/verify?version do app) e o commit mudar o app; o texto sai da mensagem do commit (mesma regra de
//   scripts/lib/release-notice.mjs). Disparo manual por scripts/release-push.mjs (o workflow foi removido em 26/11/2026).
//   Ao tocar, o sw.js limpa o cache e recarrega.
// Roda com a service key do próprio projeto (ambiente da função). As chaves VAPID são geradas no
// primeiro uso e ficam em pendulo_push_keys (sem acesso público). O QUE avisar é calculado AQUI, com o mesmo
// código do app empacotado (push.bundle.js = api/push-alerts.js + api/quotes, intraday, history e analyze;
// `npm run build:push`): desde 22/11/2026 a função não chama mais as funções da Vercel a cada minuto (cota de
// CPU do plano grátis). O pacote é um arquivo estático do site (CDN, sem CPU), baixado uma vez por instância e
// carregado na memória: atualiza sozinho a cada deploy do app, sem reimplantar a função (o Supabase não aceita
// import de URL fora da lista dele, e o pacote é grande demais para subir pelo conector). Se o pacote falhar,
// cai na rota antiga POST /api/push-alerts (reserva, para o push nunca parar). Da Vercel, fora isso, só lê
// data/*.json (estático) e, uma vez por deploy, api/verify?version para o aviso de versão nova.
import webpush from "npm:web-push@3.6.7";

const APP = "https://etf-portfolio-ten.vercel.app";
const KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const URL_ = Deno.env.get("SUPABASE_URL")!;
const CORS = { "Access-Control-Allow-Origin": "*", "Content-Type": "application/json" };
const json = (body: unknown, status = 200, extra: Record<string, string> = {}) =>
  new Response(JSON.stringify(body), { status, headers: { ...CORS, ...extra } });

// data/*.json do app (arquivo estático na CDN da Vercel: não usa CPU de função); api/* roda aqui dentro, com
// cache na memória da instância (o cron de 1 min a mantém quente)
const getStatic = (p: string) =>
  fetch(`${APP}/${p}`, { signal: AbortSignal.timeout(10000) })
    .then((r) => (r.ok ? r.json() : null))
    .catch(() => null);
const BUNDLE = `${APP}/supabase/functions/push/push.bundle.js`;
type Core = {
  computeAlerts: (body: unknown, get: unknown) => Promise<any>;
  localGet: (o: unknown) => unknown;
};
let core: Promise<{ m: Core; get: unknown }> | null = null;
/** Pacote do cálculo: baixado e carregado uma vez por instância (falhou: tenta de novo na próxima chamada). */
function loadCore() {
  core ??= fetch(BUNDLE, { signal: AbortSignal.timeout(15000) })
    .then((r) => {
      if (!r.ok) throw new Error(`push.bundle.js HTTP ${r.status}`);
      return r.text();
    })
    .then((code) => import(`data:text/javascript;charset=utf-8,${encodeURIComponent(code)}`))
    .then((m: Core) => ({ m, get: m.localGet({ getStatic }) }))
    .catch((e) => {
      core = null;
      throw e;
    });
  return core;
}
let warm = false; // 1ª chamada da instância: sem cache, pula a varredura de liderança (limite de 2 s de CPU)

/** Avisos de cada usuário: calcula aqui; se o pacote não carregar, pede à rota antiga da Vercel (reserva). */
async function alertsOf(
  body: Record<string, unknown>,
): Promise<{ alerts: Record<string, any[]>; via: string }> {
  try {
    const { m, get } = await loadCore();
    const r = await m.computeAlerts(body.only ? body : { ...body, noLeaders: !warm }, get);
    warm = true;
    return { alerts: r.alerts ?? {}, via: "local" };
  } catch (e) {
    const r = await fetch(`${APP}/api/push-alerts`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(40000),
    });
    if (!r.ok)
      throw new Error(`pacote: ${(e as Error)?.message}; reserva push-alerts HTTP ${r.status}`);
    return { alerts: (await r.json()).alerts ?? {}, via: `vercel (${(e as Error)?.message})` };
  }
}

type Opts = { method?: string; body?: unknown; prefer?: string };
async function rest(path: string, { method = "GET", body, prefer }: Opts = {}) {
  const r = await fetch(`${URL_}/rest/v1/${path}`, {
    method,
    headers: {
      apikey: KEY,
      Authorization: `Bearer ${KEY}`,
      "Content-Type": "application/json",
      ...(prefer ? { Prefer: prefer } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!r.ok)
    throw new Error(
      `${method} ${path.split("?")[0]}: HTTP ${r.status} ${(await r.text()).slice(0, 200)}`,
    );
  const txt = r.status === 204 ? "" : await r.text();
  return txt ? JSON.parse(txt) : null;
}

async function vapidKeys() {
  const read = async () =>
    (await rest("pendulo_push_keys?id=eq.1&select=public_key,private_key"))[0];
  let k = await read();
  if (!k) {
    const g = webpush.generateVAPIDKeys();
    await rest("pendulo_push_keys?on_conflict=id", {
      method: "POST",
      prefer: "resolution=ignore-duplicates,return=minimal",
      body: [{ id: 1, public_key: g.publicKey, private_key: g.privateKey }],
    });
    k = await read();
  }
  return { publicKey: k.public_key as string, privateKey: k.private_key as string };
}

async function send(dry: boolean, only: string | null = null) {
  const keys = await vapidKeys();
  webpush.setVapidDetails(
    "https://github.com/leandrocolis-dotcom/etf-portfolio",
    keys.publicKey,
    keys.privateKey,
  );
  const [subs, portfolios] = await Promise.all([
    rest("pendulo_push_subscriptions?select=endpoint,user_id,p256dh,auth,prefs,updated_at"),
    rest("pendulo_portfolio?select=user_id,holdings"),
  ]);
  const byUser = new Map<string, any[]>();
  for (const s of subs) byUser.set(s.user_id, [...(byUser.get(s.user_id) ?? []), s]);
  const pfBy = new Map(portfolios.map((p: any) => [p.user_id, p.holdings ?? []]));
  const since = new Date(Date.now() - 3 * 864e5).toISOString();
  const users = [];
  for (const [id, devices] of byUser) {
    // sem carteira também recebe o que vale para todos (regime do mercado, dados macro)
    const holdings = pfBy.get(id) ?? [];
    const sent = await rest(`pendulo_push_sent?user_id=eq.${id}&sent_at=gte.${since}&select=key`);
    // preferências do aparelho atualizado por último (mesma regra de userPrefs em scripts/lib/push-alerts.mjs):
    // um aparelho antigo não desfaz o "silenciar no fim de semana" ligado em outro
    const last = [...devices].sort((a, b) => String(b.updated_at ?? "").localeCompare(String(a.updated_at ?? "")))[0]; // prettier-ignore
    users.push({ id, holdings, prefs: last?.prefs ?? {}, sent: sent.map((r: any) => r.key) });
  }
  if (!users.length) return { users: byUser.size, sent: 0, log: [] };
  const { alerts, via } = await alertsOf(only ? { users, only } : { users });
  let sentN = 0;
  const log: string[] = [];
  for (const u of users) {
    const devices = byUser.get(u.id)!;
    const dead = new Set<string>();
    for (const a of alerts[u.id] ?? []) {
      if (dry) {
        log.push(`${a.title} · ${a.body}`);
        continue;
      }
      const payload = JSON.stringify({ title: a.title, body: a.body, tag: a.tag, url: a.url });
      let delivered = 0;
      for (const d of devices) {
        try {
          await webpush.sendNotification(
            { endpoint: d.endpoint, keys: { p256dh: d.p256dh, auth: d.auth } },
            payload,
            { TTL: 6 * 3600, urgency: "high" },
          );
          delivered++;
        } catch (e: any) {
          if (e.statusCode === 404 || e.statusCode === 410) dead.add(d.endpoint);
          else log.push(`falha ao enviar (${e.statusCode ?? e.message})`);
        }
      }
      if (delivered) {
        sentN++;
        await rest("pendulo_push_sent?on_conflict=user_id,key", {
          method: "POST",
          prefer: "resolution=ignore-duplicates,return=minimal",
          body: [a.key, ...(a.covers ?? [])].map((key: string) => ({ user_id: u.id, key })),
        });
      }
    }
    for (const ep of dead)
      await rest(`pendulo_push_subscriptions?endpoint=eq.${encodeURIComponent(ep)}`, {
        method: "DELETE",
      });
  }
  return { users: byUser.size, sent: sentN, via, log };
}

const SILENT = new Set(["docs", "test", "tests", "chore", "ci", "build", "style"]);

/** Mesma regra de scripts/lib/release-notice.mjs (manter as duas iguais). */
function releaseNotice(message: string) {
  const title = "Pêndulo atualizado";
  if (/\[(skip push|no push|skip ci)\]/i.test(message)) return null;
  const first = message.split("\n")[0].trim();
  const m = first.match(/^(\w+)(\([^)]*\))?!?:\s*(.+)$/);
  const type = m?.[1].toLowerCase();
  if (type && SILENT.has(type)) return null;
  let summary = (m ? m[3] : first).replace(/\s*\(#\d+\)\s*$/, "").trim();
  if (!summary) return { title, body: "Uma versão nova já está disponível. Toque para abrir." };
  summary = summary.charAt(0).toUpperCase() + summary.slice(1);
  const prefix = type === "fix" ? "Correção" : type === "perf" ? "Mais rápido" : "Novidade";
  let body = `${prefix}: ${summary}`;
  if (body.length > 140) body = body.slice(0, 139).trimEnd() + "…";
  return { title, body };
}

/** Confere no app em produção (/api/verify?version) que o commit pedido é o que está no ar e monta o aviso. */
async function verifiedNotice(
  sha: string,
): Promise<{ notice?: { title: string; body: string }; skip?: string }> {
  if (!/^[0-9a-f]{40}$/.test(sha)) throw new Error("sha inválido");
  const r = await fetch(`${APP}/api/verify?version`, { signal: AbortSignal.timeout(15000) });
  if (!r.ok) throw new Error(`api/verify?version HTTP ${r.status}`);
  const live = await r.json();
  if (live?.env !== "production" || live?.sha !== sha) return { skip: "não é a versão no ar" };
  const n = releaseNotice(String(live?.message ?? ""));
  return n ? { notice: n } : { skip: "commit sem mudança visível" };
}

async function release(v: { sha?: string }) {
  const sha = String(v.sha ?? "").toLowerCase();
  const check = await verifiedNotice(sha);
  if (!check.notice) return { sent: 0, skipped: check.skip };
  const version = sha.slice(0, 12);
  const keys = await vapidKeys();
  webpush.setVapidDetails(
    "https://github.com/leandrocolis-dotcom/etf-portfolio",
    keys.publicKey,
    keys.privateKey,
  );
  const subs = await rest("pendulo_push_subscriptions?select=endpoint,user_id,p256dh,auth");
  const byUser = new Map<string, any[]>();
  for (const s of subs) byUser.set(s.user_id, [...(byUser.get(s.user_id) ?? []), s]);
  const payload = JSON.stringify({
    title: check.notice.title,
    body: check.notice.body,
    tag: "app-update",
    url: `./?app-update=${version}`,
    update: true,
    version,
  });
  let sent = 0;
  for (const [userId, devices] of byUser) {
    // reivindica o aviso deste usuário (insert que ignora duplicado devolve [] se já foi enviado)
    const claimed = await rest("pendulo_push_sent?on_conflict=user_id,key", {
      method: "POST",
      prefer: "resolution=ignore-duplicates,return=representation",
      body: [{ user_id: userId, key: `release:${version}` }],
    });
    if (!claimed?.length) continue;
    let delivered = 0;
    for (const d of devices) {
      try {
        await webpush.sendNotification(
          { endpoint: d.endpoint, keys: { p256dh: d.p256dh, auth: d.auth } },
          payload,
          { TTL: 24 * 3600, urgency: "normal" },
        );
        delivered++;
      } catch (e: any) {
        if (e.statusCode === 404 || e.statusCode === 410)
          await rest(`pendulo_push_subscriptions?endpoint=eq.${encodeURIComponent(d.endpoint)}`, {
            method: "DELETE",
          });
      }
    }
    if (delivered) sent++;
  }
  return { users: byUser.size, sent, version };
}

/** Futuros da CME negociando (domingo 18h a sexta 17h de NY, sem a pausa das 17h às 18h): há preço novo no mundo. */
function globexOpen(now = new Date()) {
  const p = Object.fromEntries(
    new Intl.DateTimeFormat("en-US", {
      timeZone: "America/New_York",
      weekday: "short",
      hour: "numeric",
      hourCycle: "h23",
    })
      .formatToParts(now)
      .map((x) => [x.type, x.value]),
  );
  const h = Number(p.hour);
  if (p.weekday === "Sat") return false;
  if (p.weekday === "Sun") return h >= 18;
  if (p.weekday === "Fri") return h < 17;
  return h !== 17;
}

/** Pré, pregão ou pós de NY (seg–sex, 4h–20h): o cron chama a cada minuto; fora disso só roda de 10 em 10 min. */
function fastWindow(now = new Date()) {
  const p = Object.fromEntries(
    new Intl.DateTimeFormat("en-US", {
      timeZone: "America/New_York",
      weekday: "short",
      hour: "numeric",
      hourCycle: "h23",
    })
      .formatToParts(now)
      .map((x) => [x.type, x.value]),
  );
  const h = Number(p.hour);
  return !["Sat", "Sun"].includes(p.weekday) && h >= 4 && h < 20;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS")
    return new Response(null, { headers: { ...CORS, "Access-Control-Allow-Headers": "*" } });
  const q = new URL(req.url).searchParams;
  try {
    if (q.has("key")) {
      const { publicKey } = await vapidKeys();
      return json({ publicKey }, 200, { "Cache-Control": "public, max-age=86400" });
    }
    if (q.has("release")) {
      if (req.method !== "POST") return json({ error: "use POST" }, 405);
      return json({ ok: true, ...(await release(await req.json().catch(() => ({})))) });
    }
    // ?tick = chamada do cron (a cada minuto). Pré/pregão/pós de NY: tudo, a cada minuto. Fora disso: tudo de
    // 10 em 10 min e, nos outros minutos, só o regime do mercado (chamada leve) enquanto houver futuro negociando
    let only: string | null = q.get("only");
    if (q.has("tick") && !fastWindow() && new Date().getUTCMinutes() % 10 !== 0) {
      if (!globexOpen()) return json({ ok: true, skipped: "fora do horário" });
      only = "mkt";
    }
    return json({
      ok: true,
      only,
      ...(await send(q.has("dry"), only)),
      at: new Date().toISOString(),
    });
  } catch (e) {
    return json({ error: String((e as Error)?.message ?? e) }, 500);
  }
});
