// Nuvem (Supabase): login por e-mail e senha e a carteira do usuário sincronizada entre dispositivos.
// Cliente mínimo por fetch (Auth + REST), sem biblioteca. A chave é a publishable (pública por desenho):
// quem protege os dados é o RLS da tabela pendulo_portfolio (cada usuário só lê e grava a própria linha).
export const SUPABASE_URL = "https://iufliktjawnfawerwvtg.supabase.co";
export const SUPABASE_KEY = "sb_publishable_0e59J2_Geabcro8rF-AopA_ptM2NV73";
const SESSION_KEY = "pendulo.cloud.session";
const TABLE = "pendulo_portfolio";

const load = () => {
  try {
    return JSON.parse(localStorage.getItem(SESSION_KEY) ?? "null");
  } catch {
    return null;
  }
};
const save = (s) => {
  try {
    if (s) localStorage.setItem(SESSION_KEY, JSON.stringify(s));
    else localStorage.removeItem(SESSION_KEY);
  } catch {
    /* sem armazenamento */
  }
};

let session = load(); // { access_token, refresh_token, expires_at (s), user: { id, email } }

export const cloudUser = () => session?.user ?? null;

// Sessão que o servidor recusou renovar (senha trocada, token revogado ou vencido): o app volta a salvar só
// no aparelho. Guardamos o motivo para avisar em vez de falhar em silêncio.
let lost = false;
export const sessionLost = () => lost;

async function call(path, { method = "GET", body, token, headers = {} } = {}) {
  const r = await fetch(`${SUPABASE_URL}${path}`, {
    method,
    headers: {
      apikey: SUPABASE_KEY,
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...headers,
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await r.text();
  let data = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    /* corpo não-JSON */
  }
  if (!r.ok) {
    const msg =
      data?.why ??
      data?.msg ??
      data?.message ??
      data?.error_description ??
      data?.error ??
      `HTTP ${r.status}`;
    throw Object.assign(new Error(msg), { status: r.status });
  }
  return data;
}

// ───────────── Presença (robô de cotações sob demanda, docs/PLANO-OTIMIZACAO.md) ─────────────
// O app avisa que está aberto (e, a partir da Fase 2, quais ativos tem na tela). Sem ninguém avisando há
// 10 min, o pg_cron nem chama a função de cotações. `dev` é um id aleatório do aparelho, sem dado pessoal.
const DEVICE_KEY = "pendulo.device";
let deviceMem = null;
export function deviceId() {
  if (deviceMem) return deviceMem;
  try {
    deviceMem = localStorage.getItem(DEVICE_KEY);
  } catch {
    /* sem armazenamento */
  }
  if (!/^[A-Za-z0-9_-]{8,64}$/.test(deviceMem ?? "")) {
    const rnd = globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random()}`.slice(2);
    deviceMem = `d${String(rnd)
      .replace(/[^A-Za-z0-9]/g, "")
      .slice(0, 32)}`;
    try {
      localStorage.setItem(DEVICE_KEY, deviceMem);
    } catch {
      /* sem armazenamento: id só desta sessão */
    }
  }
  return deviceMem;
}

/** Última foto do robô de cotações ({ at, data }) pela função pública pendulo_snapshot. */
export const fetchSnapshot = () =>
  call("/rest/v1/rpc/pendulo_snapshot", { method: "POST", body: {} });

/** Grava a presença (pendulo_touch). Até 80 ativos, na ordem de prioridade. Falha sobe (quem chama registra). */
export async function touchDemand({ syms = [], tab = null } = {}) {
  await call("/rest/v1/rpc/pendulo_touch", {
    method: "POST",
    body: { dev: deviceId(), wanted: [...new Set(syms)].slice(0, 80), screen: tab },
  });
}

const keep = (d) => {
  session = {
    access_token: d.access_token,
    refresh_token: d.refresh_token,
    expires_at: d.expires_at ?? Math.floor(Date.now() / 1000) + (d.expires_in ?? 3600),
    user: { id: d.user?.id, email: d.user?.email },
  };
  save(session);
  return session.user;
};

/** Mensagens do Auth em português. */
export function authMessage(e) {
  const m = String(e?.message ?? e);
  if (/invalid login credentials/i.test(m)) return "E-mail ou senha incorretos.";
  if (/email not confirmed/i.test(m))
    return "Confirme o e-mail (link enviado na criação da conta) e tente de novo.";
  if (/already registered|already exists/i.test(m))
    return "Já existe conta com este e-mail. Use Entrar.";
  if (/password should be at least/i.test(m)) return "A senha precisa ter pelo menos 6 caracteres.";
  if (/rate limit|too many/i.test(m)) return "Muitas tentativas. Aguarde um minuto.";
  if (/failed to fetch|network/i.test(m)) return "Sem conexão com a nuvem.";
  if (/row-level security|violates|permission denied|42501/i.test(m))
    return "A nuvem recusou a gravação (permissão da tabela). Saia e entre de novo; se persistir, confira as regras RLS no Supabase.";
  if (/relation .* does not exist|PGRST205|schema cache/i.test(m))
    return "A tabela da carteira não existe no Supabase. Rode o SQL de supabase/schema.sql.";
  return m;
}

export async function signIn(email, password) {
  const u = keep(
    await call("/auth/v1/token?grant_type=password", { method: "POST", body: { email, password } }),
  );
  lost = false;
  return u;
}

/** Cria a conta. Se o projeto exigir confirmação por e-mail, devolve { pending: true }. */
export async function signUp(email, password) {
  const d = await call("/auth/v1/signup", { method: "POST", body: { email, password } });
  if (d?.access_token) return keep(d);
  return { pending: true };
}

export async function signOut() {
  const t = session?.access_token;
  session = null;
  save(null);
  if (t) await call("/auth/v1/logout", { method: "POST", token: t }).catch(() => {});
}

/** Token válido (renova 60 s antes de expirar). Sessão inválida = sai. */
async function token() {
  if (!session) throw new Error("não conectado");
  if (session.expires_at - 60 > Date.now() / 1000) return session.access_token;
  try {
    keep(
      await call("/auth/v1/token?grant_type=refresh_token", {
        method: "POST",
        body: { refresh_token: session.refresh_token },
      }),
    );
    return session.access_token;
  } catch (e) {
    if (e.status === 400 || e.status === 401) {
      session = null;
      lost = true;
      save(null);
    }
    throw e;
  }
}

/** Carteira na nuvem ou null. Formato igual ao do app: { holdings, source, importedAt, updatedAt, manual }. */
export async function pullPortfolio() {
  const rows = await call(
    `/rest/v1/${TABLE}?select=holdings,source,imported_at,updated_at,manual`,
    { token: await token() },
  );
  const r = rows?.[0];
  return r
    ? {
        holdings: r.holdings,
        source: r.source,
        importedAt: r.imported_at,
        updatedAt: r.updated_at,
        manual: r.manual ?? null,
      }
    : null;
}

/** Foto das contas BTG (só leitura: quem grava é a sincronização diária). */
export async function pullBroker() {
  const rows = await call(
    `/rest/v1/pendulo_broker?select=as_of,summary,status,status_detail,synced_at,try_at,try_detail,login_at`,
    {
      token: await token(),
    },
  );
  const r = rows?.[0];
  return r
    ? {
        asOf: r.as_of,
        summary: r.summary,
        status: r.status,
        statusDetail: r.status_detail,
        syncedAt: r.synced_at,
        tryAt: r.try_at ?? null,
        tryDetail: r.try_detail ?? null,
        loginAt: r.login_at ?? null,
      }
    : null;
}

/** Fotos guardadas das contas BTG (totais), da mais antiga à mais nova. Tabela ainda não criada = sem histórico. */
export async function pullBrokerHist() {
  try {
    return await call(
      `/rest/v1/pendulo_broker_hist?select=as_of,total_brl&order=as_of.asc&limit=1000`,
      {
        token: await token(),
      },
    );
  } catch (e) {
    if (e.status === 404) return [];
    throw e;
  }
}

/** Fotos diárias completas (posição histórica), da mais antiga à mais nova. Tabela ausente = sem histórico. */
export async function pullBrokerDaily() {
  try {
    return await call(
      `/rest/v1/pendulo_broker_daily?select=day,as_of,summary,carried&order=day.asc&limit=1000`,
      { token: await token() },
    );
  } catch (e) {
    if (e.status === 404) return [];
    throw e;
  }
}

/**
 * Botão Atualizar BTG pela nuvem: a função btg-fire dispara a tarefa agendada da leitura (sem o Mac).
 * Devolve { ok, since, syncedAt, fired, hasFallback } ou { ok: false, why } ("nuvem_off" = rotina sem endereço de API
 * configurado). { fallback: true } dispara só a rotina da 2ª conta do Claude (ver supabase/functions/btg-fire).
 */
export async function fireBtg({ fallback = false, reconnected = false } = {}) {
  const body = fallback ? { fallback: true } : reconnected ? { reconnected: true } : {};
  return call(`/functions/v1/btg-fire`, { method: "POST", token: await token(), body });
}

/** Pede uma leitura nova do BTG ao processo local. Devolve { ok, id } ou { ok: false, why }. */
export async function requestBtg() {
  return call(`/rest/v1/rpc/pendulo_btg_request`, {
    method: "POST",
    token: await token(),
    body: {},
  });
}

export async function btgRequest(id) {
  const rows = await call(`/rest/v1/pendulo_btg_req?id=eq.${Number(id)}&select=status,detail`, {
    token: await token(),
  });
  return rows?.[0] ?? null;
}

/** Confere de verdade se a gravação chegou: relê a linha e compara a data. Devolve a data do servidor. */
export async function verifyPortfolio(updatedAt) {
  const remote = await pullPortfolio();
  if (!remote) throw new Error("a carteira não apareceu na nuvem depois de gravar");
  if (updatedAt && Date.parse(remote.updatedAt) < Date.parse(updatedAt) - 1000)
    throw new Error("a nuvem manteve uma versão mais antiga da carteira");
  return remote.updatedAt;
}

// ───────────── Notificações push (aparelho → Supabase) ─────────────
const PUSH_TABLE = "pendulo_push_subscriptions";

/** Grava (ou atualiza) a inscrição push deste aparelho. sub = PushSubscription.toJSON(). */
export async function savePushSubscription(sub, label, prefs) {
  const t = await token();
  await call(`/rest/v1/${PUSH_TABLE}?on_conflict=endpoint`, {
    method: "POST",
    token: t,
    headers: { Prefer: "resolution=merge-duplicates,return=minimal" },
    body: {
      user_id: session.user.id,
      endpoint: sub.endpoint,
      p256dh: sub.keys?.p256dh,
      auth: sub.keys?.auth,
      label: label ?? null,
      ...(prefs ? { prefs } : {}),
      updated_at: new Date().toISOString(),
    },
  });
}

export async function deletePushSubscription(endpoint) {
  const t = await token();
  await call(`/rest/v1/${PUSH_TABLE}?endpoint=eq.${encodeURIComponent(endpoint)}`, {
    method: "DELETE",
    token: t,
  });
}

/** Grava (upsert) a carteira. Devolve updatedAt do servidor. */
export async function pushPortfolio(pf) {
  const t = await token();
  const rows = await call(`/rest/v1/${TABLE}?on_conflict=user_id`, {
    method: "POST",
    token: t,
    headers: { Prefer: "resolution=merge-duplicates,return=representation" },
    body: {
      user_id: session.user.id,
      holdings: pf.holdings,
      source: pf.source ?? null,
      imported_at: pf.importedAt ?? null,
      manual: pf.manual ?? null, // ajuste manual sobre a foto do BTG (assets/btg.js withManual)
      updated_at: new Date().toISOString(),
    },
  });
  return rows?.[0]?.updated_at ?? new Date().toISOString();
}

/** Desempenho do exterior gravado do BTG (assets/offshore-perf.js). Tabela ausente = sem dados. */
export async function pullOffshorePerf() {
  try {
    return await call(
      `/rest/v1/pendulo_offshore_perf?select=kind,day,bal,r,acc,pl,acc_pl,flow_in,flow_out,bench&order=day.asc&limit=5000`,
      { token: await token() },
    );
  } catch (e) {
    if (e.status === 404) return [];
    throw e;
  }
}

/** Edições do usuário (assets/settings-sync.js): { data, updatedAt } ou null. Tabela ausente = null. */
export async function pullSettings() {
  try {
    const rows = await call(`/rest/v1/pendulo_settings?select=data,updated_at`, {
      token: await token(),
    });
    const r = rows?.[0];
    return r ? { data: r.data ?? {}, updatedAt: r.updated_at } : null;
  } catch (e) {
    if (e.status === 404) return null;
    throw e;
  }
}

export async function pushSettings(data) {
  await call(`/rest/v1/pendulo_settings?on_conflict=user_id`, {
    method: "POST",
    token: await token(),
    headers: { Prefer: "resolution=merge-duplicates,return=minimal" },
    body: { user_id: session.user.id, data, updated_at: new Date().toISOString() },
  });
}

/** Grava (upsert) as watchlists da aba Sinais de hoje: o treino diário do Simulador também aprende com esses ativos. */
export async function pushWatchlists(lists) {
  const t = await token();
  await call(`/rest/v1/pendulo_watchlists?on_conflict=user_id`, {
    method: "POST",
    token: t,
    headers: { Prefer: "resolution=merge-duplicates,return=minimal" },
    body: { user_id: session.user.id, lists, updated_at: new Date().toISOString() },
  });
}

/** 👍 Meus trades (uma linha por usuário). O treino diário do Simulador lê os ativos daqui. */
export async function pushTrades(trades) {
  const t = await token();
  await call(`/rest/v1/pendulo_trades?on_conflict=user_id`, {
    method: "POST",
    token: t,
    headers: { Prefer: "resolution=merge-duplicates,return=minimal" },
    body: { user_id: session.user.id, trades, updated_at: new Date().toISOString() },
  });
}

export async function pullTrades() {
  const rows = await call(`/rest/v1/pendulo_trades?select=trades,updated_at`, {
    token: await token(),
  });
  const r = rows?.[0];
  return r ? { trades: r.trades, updatedAt: r.updated_at } : null;
}

/** 📒 Diário de operações reais (uma linha por usuário, como os 👍). */
export async function pushJournal(entries) {
  const t = await token();
  await call(`/rest/v1/pendulo_journal?on_conflict=user_id`, {
    method: "POST",
    token: t,
    headers: { Prefer: "resolution=merge-duplicates,return=minimal" },
    body: { user_id: session.user.id, entries, updated_at: new Date().toISOString() },
  });
}

export async function pullJournal() {
  const rows = await call(`/rest/v1/pendulo_journal?select=entries,updated_at`, {
    token: await token(),
  });
  const r = rows?.[0];
  return r ? { entries: r.entries, updatedAt: r.updated_at } : null;
}

/** Long & Short: estado do motor (pontas, ordens, execuções, contadores do dia, diário), 1 linha por usuário. */
export async function pushLs(data) {
  const t = await token();
  await call(`/rest/v1/pendulo_ls?on_conflict=user_id`, {
    method: "POST",
    token: t,
    headers: { Prefer: "resolution=merge-duplicates,return=minimal" },
    body: { user_id: session.user.id, data, updated_at: new Date().toISOString() },
  });
}

export async function pullLs() {
  const rows = await call(`/rest/v1/pendulo_ls?select=data,updated_at`, { token: await token() });
  const r = rows?.[0];
  return r ? { data: r.data, updatedAt: r.updated_at } : null;
}

/** Apaga a carteira em todos os aparelhos: grava uma carteira vazia com data (marca de exclusão), para que
 * outro aparelho com a cópia antiga entenda que ela foi apagada e não a envie de volta. */
export async function deletePortfolio() {
  return pushPortfolio({ holdings: [], source: null, importedAt: null });
}

/**
 * Decide o que fazer ao conectar/abrir: qual lado vale (último a ser alterado vence).
 * local/remote: { updatedAt? , importedAt? } | null. Devolve "pull" | "push" | "none".
 */
export function reconcile(local, remote) {
  const empty = (x) => !x || !x.holdings?.length;
  if (empty(local) && empty(remote)) return "none";
  if (!local) return "pull";
  if (!remote) return "push";
  const l = Date.parse(local.updatedAt ?? local.importedAt ?? 0) || 0;
  const r = Date.parse(remote.updatedAt ?? remote.importedAt ?? 0) || 0;
  if (r > l) return "pull";
  if (l > r) return "push";
  return "none";
}
