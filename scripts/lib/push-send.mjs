// Envio de push (servidor): lê aparelhos e carteiras no Supabase, decide os avisos e envia pelo Web Push.
// Usado pela Edge Function do Supabase (supabase/functions/push) e pelo script local scripts/send-push.mjs.
// Sem import de web-push: quem chama passa a biblioteca (npm no Node, npm: no Deno).
import { alertsFor, userPrefs } from "./push-alerts.mjs";

export const SUPABASE_URL = "https://iufliktjawnfawerwvtg.supabase.co";

/** REST do Supabase com a service key. */
export function supa(key, url = SUPABASE_URL) {
  return async (path, { method = "GET", body, prefer } = {}) => {
    const r = await fetch(`${url}/rest/v1/${path}`, {
      method,
      headers: {
        apikey: key,
        Authorization: `Bearer ${key}`,
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
  };
}

/**
 * Par de chaves VAPID: gerado no primeiro uso e guardado no Supabase (tabela sem acesso público).
 * A privada nunca sai do servidor; o app só recebe a pública (Edge Function push).
 */
export async function vapidKeys(key, webpush, url = SUPABASE_URL) {
  const rest = supa(key, url);
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
  return { publicKey: k.public_key, privateKey: k.private_key };
}

/** Envia os avisos pendentes. Devolve { users, sent }. */
export async function sendPush({
  webpush,
  key,
  flow,
  news,
  dry = false,
  log = console.log,
  url: URL_ = SUPABASE_URL,
}) {
  const keys = await vapidKeys(key, webpush, URL_);
  webpush.setVapidDetails(
    "https://github.com/leandrocolis-dotcom/etf-portfolio",
    keys.publicKey,
    keys.privateKey,
  );
  const DRY = dry;
  const KEY = key;
  const rest = supa(KEY, URL_);

  const [subs, portfolios] = await Promise.all([
    rest("pendulo_push_subscriptions?select=endpoint,user_id,p256dh,auth,prefs,updated_at"),
    rest("pendulo_portfolio?select=user_id,holdings"),
  ]);
  const pfBy = new Map(portfolios.map((p) => [p.user_id, p.holdings ?? []]));
  const byUser = Map.groupBy(subs, (s) => s.user_id);
  const since = new Date(Date.now() - 3 * 864e5).toISOString();
  let sentN = 0;

  for (const [uid, devices] of byUser) {
    const holdings = pfBy.get(uid) ?? [];
    if (!holdings.length) continue;
    const sentRows = await rest(
      `pendulo_push_sent?user_id=eq.${uid}&sent_at=gte.${since}&select=key`,
    );
    const { send } = alertsFor({
      holdings,
      flow,
      news,
      prefs: userPrefs(devices),
      sent: new Set(sentRows.map((r) => r.key)),
    });
    if (!send.length) continue;
    const dead = [];
    for (const a of send) {
      const payload = JSON.stringify({ title: a.title, body: a.body, tag: a.tag, url: a.url });
      let delivered = 0;
      for (const d of devices) {
        if (DRY) {
          log(`[dry] ${uid.slice(0, 8)} → ${a.title} · ${a.body}`);
          delivered++;
          continue;
        }
        try {
          await webpush.sendNotification(
            { endpoint: d.endpoint, keys: { p256dh: d.p256dh, auth: d.auth } },
            payload,
            { TTL: 6 * 3600, urgency: "high" },
          );
          delivered++;
        } catch (e) {
          if (e.statusCode === 404 || e.statusCode === 410) dead.push(d.endpoint);
          else log(`falha ao enviar (${e.statusCode ?? e.message})`);
        }
      }
      if (delivered && !DRY) {
        sentN++;
        await rest("pendulo_push_sent?on_conflict=user_id,key", {
          method: "POST",
          prefer: "resolution=ignore-duplicates,return=minimal",
          body: [a.key, ...(a.covers ?? [])].map((key) => ({ user_id: uid, key })),
        });
      }
    }
    for (const ep of new Set(dead))
      await rest(`pendulo_push_subscriptions?endpoint=eq.${encodeURIComponent(ep)}`, {
        method: "DELETE",
      });
  }

  return { users: byUser.size, sent: sentN };
}
