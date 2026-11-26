// Supabase Edge Function "btg-fire": botão "Atualizar BTG" sem o Mac.
// POST (com o token de login do app) -> dispara a tarefa agendada "BTG carteira na nuvem" pelo endereço de API
// da rotina (claude.ai/code/routines › API). A sessão disparada lê o BTG, confere e grava por pendulo_btg_apply;
// o app acompanha pela data de pendulo_broker.synced_at. Segredos da função: BTG_ROUTINE_URL (Fire URL) e
// BTG_ROUTINE_TOKEN (token da rotina). Sem eles: { ok: false, why: "nuvem_off" }.
// Duas contas do Claude (25/11/2026): o conector do BTG só fica ativo numa conta por vez (conectar numa derruba a
// outra). A conta principal (BTG_ROUTINE_URL/TOKEN) tem prioridade: o botão dispara só ela. A 2ª conta
// (BTG_ROUTINE_URL_2/TOKEN_2, rotina igual) entra (a) na hora, se a principal recusar o disparo, ou (b) quando o app
// pede { fallback: true } porque a principal não gravou a foto em ~90 s (sessão sem o conector termina sem gravar).
// O fallback só vale de 60 s a 6 min depois do disparo e uma vez por disparo.
// Só o dono da conta BTG (linha em pendulo_broker) dispara; no máximo 1 disparo a cada 3 min (limite da rotina:
// 30 por hora). Nada do BTG passa por aqui.
const URL_ = Deno.env.get("SUPABASE_URL")!;
const KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const ROUTINES = [
  ["1", Deno.env.get("BTG_ROUTINE_URL") ?? "", Deno.env.get("BTG_ROUTINE_TOKEN") ?? ""],
  ["2", Deno.env.get("BTG_ROUTINE_URL_2") ?? "", Deno.env.get("BTG_ROUTINE_TOKEN_2") ?? ""],
].filter(([, url, token]) => url && token);
const COOLDOWN_MS = 3 * 60 * 1000;
const FALLBACK_MIN_MS = 60 * 1000;
const FALLBACK_MAX_MS = 6 * 60 * 1000;
const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Content-Type": "application/json",
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: CORS });
const rest = (path: string, init: RequestInit = {}) =>
  fetch(`${URL_}/rest/v1/${path}`, {
    ...init,
    headers: {
      apikey: KEY,
      Authorization: `Bearer ${KEY}`,
      "Content-Type": "application/json",
      ...(init.headers ?? {}),
    },
    signal: AbortSignal.timeout(10000),
  });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: CORS });
  if (req.method !== "POST") return json({ ok: false, why: "método" }, 405);
  if (!ROUTINES.length) return json({ ok: false, why: "nuvem_off" });

  // quem pediu: o token de login do app
  const auth = req.headers.get("Authorization") ?? "";
  const u = await fetch(`${URL_}/auth/v1/user`, { headers: { apikey: KEY, Authorization: auth }, signal: AbortSignal.timeout(10000) }); // prettier-ignore
  if (!u.ok) return json({ ok: false, why: "sem login" }, 401);
  const uid = (await u.json())?.id;
  const own = await rest(`pendulo_broker?user_id=eq.${uid}&select=synced_at`).then((r) => r.json());
  if (!Array.isArray(own) || !own.length) return json({ ok: false, why: "sem permissão" }, 403);

  // um disparo por vez: a última hora de disparo fica em pendulo_btg_fire
  const readFire = () =>
    rest(`pendulo_btg_fire?user_id=eq.${uid}&select=fired_at`).then((r) => r.json());
  const last = await readFire();
  const prev: string | null = last?.[0]?.fired_at ?? null;
  const at = Date.parse(prev ?? "");
  const body = await req.json().catch(() => ({}));
  const fallback = body?.fallback === true;
  const second = ROUTINES.find(([name]) => name === "2");
  const already = (since: string) =>
    json({ ok: true, already: true, since, syncedAt: own[0].synced_at, hasFallback: !!second });
  const age = Date.now() - at;
  if (fallback) {
    if (!second) return json({ ok: false, why: "sem_conta2" });
    if (!Number.isFinite(at) || age < FALLBACK_MIN_MS || age > FALLBACK_MAX_MS)
      return json({ ok: false, why: "fallback_fora_do_prazo" });
  } else if (Number.isFinite(at) && age < COOLDOWN_MS) return already(prev!);

  // reserva atômica antes de disparar: dois cliques simultâneos não geram duas leituras
  const now = new Date().toISOString();
  const mine = `user_id=eq.${uid}&fired_at=eq.${encodeURIComponent(now)}`;
  const claim = prev
    ? await rest(`pendulo_btg_fire?user_id=eq.${uid}&fired_at=eq.${encodeURIComponent(prev)}`, {
        method: "PATCH",
        headers: { Prefer: "return=representation" },
        body: JSON.stringify({ fired_at: now }),
      })
    : await rest("pendulo_btg_fire?on_conflict=user_id", {
        method: "POST",
        headers: { Prefer: "resolution=ignore-duplicates,return=representation" },
        body: JSON.stringify({ user_id: uid, fired_at: now }),
      });
  const won = claim.ok ? await claim.json() : null;
  if (!Array.isArray(won)) return json({ ok: false, why: "falha ao reservar o disparo" }, 500);
  if (!won.length) return already((await readFire())?.[0]?.fired_at ?? now);

  // disparo falhou: devolve a reserva para o próximo clique não cair na espera de 3 min
  const release = () =>
    prev
      ? rest(`pendulo_btg_fire?${mine}`, {
          method: "PATCH",
          body: JSON.stringify({ fired_at: prev }),
        })
      : rest(`pendulo_btg_fire?${mine}`, { method: "DELETE" });

  // prioridade: a conta principal; a 2ª só se a principal recusar (ou no fallback pedido pelo app)
  const order = fallback ? [second!] : ROUTINES;
  const tried: string[] = [];
  for (const [name, url, token] of order) {
    const r = await fireOne(name, url, token);
    if (r === "ok")
      return json({ ok: true, since: now, syncedAt: own[0].synced_at, fired: name, hasFallback: !!second && name !== "2" }); // prettier-ignore
    tried.push(order.length === 1 ? r : `conta ${name}: ${r}`);
  }
  await release().catch(() => {});
  return json({ ok: false, why: tried.join("; ") }, 502);
});

/** Dispara uma rotina; devolve "ok" ou o motivo da recusa (log sem URL nem token). */
async function fireOne(name: string, url: string, token: string): Promise<string> {
  let f: Response;
  try {
    f = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "anthropic-beta": "experimental-cc-routine-2026-04-01",
        "anthropic-version": "2023-06-01",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ text: "Leitura pedida pelo botão Atualizar BTG do app." }),
      signal: AbortSignal.timeout(20000),
    });
  } catch (e) {
    console.error("btg-fire: rotina sem resposta", { name, err: (e as Error)?.name });
    return "rotina não respondeu";
  }
  if (f.ok) return "ok";
  const err = await f.json().then((b) => b?.error ?? {}).catch(() => ({})); // prettier-ignore
  const urlOk = /^https:\/\/api\.anthropic\.com\/v1\/claude_code\/routines\/trig_\w+\/fire$/.test(url); // prettier-ignore
  const detail = String(err.message ?? "")
    .replaceAll(token, "***")
    .slice(0, 160);
  console.error("btg-fire: rotina recusou", {
    name,
    status: f.status,
    type: err.type,
    detail,
    urlOk,
  });
  return `rotina recusou (HTTP ${f.status}${err.type ? `, ${err.type}` : ""})`;
}
