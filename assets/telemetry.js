// Registro de erros do app no Supabase (tabela pendulo_client_errors, só inserção pública via RLS).
// Sem dados pessoais: mensagem, pilha curta, aba, versão e navegador. No máximo 5 por sessão, sem repetir.
import { SUPABASE_KEY, SUPABASE_URL } from "./cloud.js";
import { state } from "./state.js";

const sent = new Set();
const MAX = 5;

/** Linha a gravar (pura, testável). null = ignorar (ruído de extensão, script externo, repetido). */
export function errorRow(err, { tab = "", version = "", ua = "" } = {}) {
  const message = String(err?.message ?? err ?? "").slice(0, 500);
  if (!message || /ResizeObserver loop|Script error\.?$|extension:\/\//i.test(message)) return null;
  return {
    message,
    stack: String(err?.stack ?? "").slice(0, 2000) || null,
    tab: String(tab).slice(0, 40),
    version: String(version).slice(0, 40),
    ua: String(ua).slice(0, 300),
  };
}

function report(err) {
  try {
    const row = errorRow(err, {
      tab: state.prefs?.tab,
      version: state.liveRaw?.version ?? "",
      ua: navigator.userAgent,
    });
    if (!row || sent.has(row.message) || sent.size >= MAX) return;
    sent.add(row.message);
    fetch(`${SUPABASE_URL}/rest/v1/pendulo_client_errors`, {
      method: "POST",
      keepalive: true,
      headers: {
        apikey: SUPABASE_KEY,
        "Content-Type": "application/json",
        Prefer: "return=minimal",
      },
      body: JSON.stringify(row),
    }).catch(() => {});
  } catch {
    /* telemetria nunca derruba o app */
  }
}

export function initTelemetry() {
  if (location.hostname === "localhost" || location.hostname === "127.0.0.1") return;
  addEventListener("error", (e) => report(e.error ?? e.message));
  addEventListener("unhandledrejection", (e) => report(e.reason));
}
