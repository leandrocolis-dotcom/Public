// Notificações push de verdade: o servidor avisa o aparelho mesmo com o app fechado (celular, Mac e, pelo
// iPhone, o Apple Watch). Aqui ficam só a inscrição deste aparelho e o envio dela para a nuvem.
import { anyNotifOn, pushKinds } from "./notif-prefs.js";
import { VAPID_PUBLIC_KEY } from "./push-config.js";
import * as cloud from "./cloud.js";
import { state } from "./state.js";

/** Chave VAPID (base64url) → Uint8Array, formato que o pushManager exige. */
export function b64ToBytes(b64) {
  const pad = "=".repeat((4 - (b64.length % 4)) % 4);
  const raw = atob((b64 + pad).replace(/-/g, "+").replace(/_/g, "/"));
  return Uint8Array.from(raw, (c) => c.charCodeAt(0));
}

/** Edge Function do Supabase que guarda as chaves e envia os avisos (supabase/functions/push). */
export const PUSH_FN = "https://iufliktjawnfawerwvtg.supabase.co/functions/v1/push";
let serverKey = null;
/** Chave pública: a do arquivo (se houver) ou a do servidor (Edge Function, gerada lá no primeiro uso). */
async function publicKey() {
  if (VAPID_PUBLIC_KEY) return VAPID_PUBLIC_KEY;
  if (!serverKey)
    serverKey = fetch(`${PUSH_FN}?key`)
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => j?.publicKey ?? "")
      .catch(() => "");
  const k = await serverKey;
  if (!k) serverKey = null; // tenta de novo na próxima
  return k;
}

// busca a chave já na abertura: o pedido de permissão precisa vir logo após o toque (iPhone)
if (typeof fetch === "function" && typeof window !== "undefined") publicKey();

const standalone = () =>
  matchMedia("(display-mode: standalone)").matches || navigator.standalone === true;
const isIOS = () =>
  /iPhone|iPad|iPod/.test(navigator.userAgent) ||
  (/Macintosh/.test(navigator.userAgent) && navigator.maxTouchPoints > 1);

/** Service worker pronto (o registro roda em paralelo à abertura do app); null se demorar demais. */
const readyReg = () =>
  Promise.race([
    navigator.serviceWorker.ready,
    new Promise((r) => setTimeout(() => r(null), 4000)),
  ]);

/**
 * Situação do push neste aparelho:
 * "unsupported" · "needs-install" (iPhone fora da tela inicial) · "not-configured" (sem chave VAPID) ·
 * "denied" · "off" · "on".
 */
export async function pushStatus() {
  if (!("serviceWorker" in navigator) || !("PushManager" in window) || !isSecureContext) {
    return isIOS() && !standalone() ? "needs-install" : "unsupported";
  }
  if (isIOS() && !standalone()) return "needs-install";
  if (!(await publicKey())) return "not-configured";
  if (Notification.permission === "denied") return "denied";
  const reg = await readyReg();
  const sub = await reg?.pushManager.getSubscription();
  return sub && Notification.permission === "granted" ? "on" : "off";
}

/** Preferências que o servidor respeita ao decidir o que enviar. */
export const pushPrefs = () => ({
  sig: anyNotifOn({ ...state.prefs, newsAlerts: "off" }),
  ...pushKinds(state.prefs),
  news: state.prefs.newsAlerts ?? "all",
  weekendQuiet: state.prefs.weekendQuiet === true,
  ...(state.prefs.trimPicks && Object.keys(state.prefs.trimPicks).length
    ? { trimPicks: state.prefs.trimPicks }
    : {}),
  ...(state.prefs.newsTags ? { newsTags: state.prefs.newsTags } : {}),
});

const label = () => {
  const ua = navigator.userAgent;
  const dev = /iPhone/.test(ua) ? "iPhone" : /iPad/.test(ua) ? "iPad" : /Android/.test(ua) ? "Android" : /Mac/.test(ua) ? "Mac" : "Navegador";
  return `${dev}${standalone() ? " (app)" : ""}`;
}; // prettier-ignore

/** Pede permissão (precisa ser num toque do usuário), inscreve o aparelho e registra na nuvem. */
export async function enablePush() {
  if (!cloud.cloudUser())
    throw new Error(
      "Entre na nuvem (Configurações › Conta) antes: é por ela que o aviso encontra seu aparelho.",
    );
  const st = await pushStatus();
  if (st === "needs-install")
    throw new Error(
      "No iPhone, instale o app: Compartilhar → Adicionar à Tela de Início, e abra pelo ícone.",
    );
  if (st === "unsupported") throw new Error("Este navegador não suporta notificações push.");
  if (st === "not-configured")
    throw new Error("Servidor de avisos indisponível agora. Tente de novo em instantes.");
  if ((await Notification.requestPermission()) !== "granted")
    throw new Error(
      "Notificações não autorizadas. Libere nas configurações do aparelho para este site.",
    );
  const reg = await navigator.serviceWorker.ready;
  const sub =
    (await reg.pushManager.getSubscription()) ??
    (await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: b64ToBytes(await publicKey()),
    }));
  await cloud.savePushSubscription(sub.toJSON(), label(), pushPrefs());
  return sub;
}

export async function disablePush() {
  const reg = await readyReg();
  const sub = await reg?.pushManager.getSubscription();
  if (!sub) return;
  const endpoint = sub.endpoint;
  await sub.unsubscribe();
  if (cloud.cloudUser()) await cloud.deletePushSubscription(endpoint).catch(() => {});
}

/** Reenvia a inscrição (mantém as preferências do servidor em dia). Silencioso se o push está desligado. */
export async function refreshPush() {
  try {
    if ((await pushStatus()) !== "on" || !cloud.cloudUser()) return;
    const reg = await readyReg();
    const sub = await reg?.pushManager.getSubscription();
    if (sub) await cloud.savePushSubscription(sub.toJSON(), label(), pushPrefs());
  } catch {
    /* tenta de novo na próxima abertura */
  }
}
