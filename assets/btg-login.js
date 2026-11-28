// Login do conector BTG (27/11/2026): o MCP do BTG desloga a cada 6 h (informação do criador do conector). A
// reconexão é um login OAuth do usuário no claude.ai (não dá para automatizar); aqui só se decide QUANDO avisar:
// (1) a rotina tentou ler e o conector recusou por login → push "🔑 Reconectar BTG";
// (2) o usuário tocou "Reconectei" (pendulo_broker.login_at) e faltam ≤ 20 min para as 6 h → push "⏳ BTG expira".
// Puro: usado pelo cálculo do push (api/push-alerts.js) e pelo cartão Contas BTG (assets/btg.js).
import { quietNow } from "./weekend.js";

export const BTG_SESSION_MS = 6 * 3600e3;
export const BTG_REMIND_MS = 20 * 60e3;
export const CONNECTORS_URL = "https://claude.ai/settings/connectors";
/** Motivos que a rotina anota (pendulo_btg_note) quando o conector BTG não está logado. */
export const BTG_LOGIN_RE =
  /refused|sign-?in|indispon|unauthori[sz]ed|expir|log ?in|login|reconect|desconect|not connected|disconnected/i;

const ms = (x) => {
  const t = Date.parse(x ?? "");
  return Number.isFinite(t) ? t : null;
};
/** Aceita a linha do banco (snake_case) ou a do app (camelCase). */
const pick = (r) => ({
  syncedAt: ms(r?.syncedAt ?? r?.synced_at),
  tryAt: ms(r?.tryAt ?? r?.try_at),
  tryDetail: String(r?.tryDetail ?? r?.try_detail ?? ""),
  loginAt: ms(r?.loginAt ?? r?.login_at),
});

/** A última tentativa (depois da última foto boa) falhou por login? Devolve a hora da falha (ms) ou null. */
export function loginLost(row) {
  const r = pick(row);
  if (r.tryAt == null || r.tryAt <= (r.syncedAt ?? 0)) return null;
  if (r.loginAt != null && r.loginAt > r.tryAt) return null; // reconectou depois da falha
  return BTG_LOGIN_RE.test(r.tryDetail) ? r.tryAt : null;
}

/** Validade do login marcado em "Reconectei": { loginAt, expiresAt, left } (left < 0 = já expirou) ou null. */
export function loginWindow(row, now = Date.now()) {
  const { loginAt } = pick(row);
  if (loginAt == null) return null;
  const expiresAt = loginAt + BTG_SESSION_MS;
  return { loginAt, expiresAt, left: expiresAt - now };
}

/** Hora de Brasília (0–23). */
const brHour = (now) =>
  Number(
    new Intl.DateTimeFormat("en-US", { timeZone: "America/Sao_Paulo", hour: "numeric", hourCycle: "h23" }).format(now), // prettier-ignore
  );
const hm = (t) =>
  new Date(t).toLocaleTimeString("pt-BR", { timeZone: "America/Sao_Paulo", hour: "2-digit", minute: "2-digit" }); // prettier-ignore
const dmHm = (t) =>
  new Date(t).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }); // prettier-ignore

/**
 * Avisos push do login do BTG de um usuário. `prefs.btglogin === false` desliga; respeita o "silenciar no fim de
 * semana". O lembrete de expiração só sai das 7h às 23h de Brasília (de madrugada, se expirar, a falha da próxima
 * leitura avisa).
 */
export function btgLoginAlerts(row, prefs = {}, sent = new Set(), now = Date.now()) {
  if (!row || prefs.btglogin === false || quietNow(prefs, now / 1000)) return [];
  const out = [];
  const url = "./?tab=portfolio";
  const lost = loginLost(row);
  const { syncedAt } = pick(row);
  if (lost != null && now - lost < 24 * 3600e3) {
    const key = `btg-login:${new Date(lost).toISOString()}`;
    if (!sent.has(key))
      out.push({
        key,
        tag: "btg-login",
        url,
        title: "🔑 Reconectar BTG",
        body: `O login do conector BTG caiu (dura 6 h). A Carteira está parada na foto de ${syncedAt ? dmHm(syncedAt) : "–"}. Reconecte em claude.ai › Conectores e toque em "Reconectei" na Carteira.`, // prettier-ignore
      });
    return out;
  }
  const w = loginWindow(row, now);
  const h = brHour(now);
  if (w && w.left > 0 && w.left <= BTG_REMIND_MS && h >= 7 && h < 23) {
    const key = `btg-exp:${new Date(w.loginAt).toISOString()}`;
    if (!sent.has(key))
      out.push({
        key,
        tag: "btg-login",
        url,
        title: `⏳ Login do BTG expira em ${Math.max(1, Math.round(w.left / 60e3))} min`,
        body: `O conector BTG desloga às ${hm(w.expiresAt)} (6 h depois do "Reconectei" das ${hm(w.loginAt)}). Reconecte em claude.ai › Conectores e toque em "Reconectei" para a Carteira seguir atualizando.`, // prettier-ignore
      });
  }
  return out;
}
