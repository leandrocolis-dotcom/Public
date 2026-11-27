// Central de notificações (sino do topo): histórico de tudo o que foi avisado, separado por categoria.
// Lê o mesmo histórico de notif-log.js (avisos com o app aberto + push recebidos com o app fechado).
import { TOPIC } from "./notif-topics.js";
import { esc } from "./format.js";

/** Categorias da central, na ordem das abas. */
export const CATS = [
  { id: "all", label: "Todas" },
  { id: "portfolio", label: "💼 Carteira" },
  { id: "trader", label: "💡 Trader" },
  { id: "news", label: "📰 Notícias" },
  { id: "macro", label: "📅 Macro" },
  { id: "other", label: "🔔 Outros" },
];

const starts = (t, k) => t.startsWith(TOPIC[k]);

/** Categoria de um aviso, pelo marcador de tema do título (TOPIC) ou, sem ele, pelo link. */
export function categoryOf(n) {
  const t = n?.title ?? "";
  const u = n?.url ?? "";
  if (starts(t, "news") || /^📰/.test(t) || /[?&](tab=news|news=)/.test(u)) return "news";
  if (starts(t, "macro") || /^📅/.test(t) || /tab=macro/.test(u)) return "macro";
  if (starts(t, "trader")) return "trader";
  if (starts(t, "signal") || starts(t, "level") || starts(t, "regime") || /[?&]hold=/.test(u))
    return "portfolio";
  if (/[?&]asset=/.test(u) || /^[▲▼⚠]/.test(t)) return "trader";
  return "other";
}

/** Conta por categoria (inclui "all"). */
export function countByCat(log) {
  const c = Object.fromEntries(CATS.map((x) => [x.id, 0]));
  for (const n of log) {
    c.all++;
    c[categoryOf(n)]++;
  }
  return c;
}

const WHEN = new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }); // prettier-ignore
const when = (t) => WHEN.format(new Date(t));

/** Popup da central. `status` é a linha sobre as notificações do aparelho. */
export function centerHtml(log, cat = "all", status = "") {
  const c = countByCat(log);
  if (!CATS.some((x) => x.id === cat)) cat = "all";
  const list = cat === "all" ? log : log.filter((n) => categoryOf(n) === cat);
  const chips = CATS.map(
    (x) =>
      `<button type="button" class="chip${x.id === cat ? " on" : ""}" data-ncat="${x.id}" aria-pressed="${x.id === cat}">${x.label} <span class="muted small">${c[x.id]}</span></button>`,
  ).join("");
  const rows = list.length
    ? `<ul class="ncenter-list">${list
        .map(
          (n) =>
            `<li data-notif-url="${esc(n.url ?? "./?tab=trig")}" data-nt="${esc(n.title)}" data-nb="${esc(n.body ?? "")}" data-nat="${n.at ?? ""}" data-npop-close tabindex="0"><span class="muted small nowrap">${when(n.at)}</span><b>${esc(n.title)}</b>${n.body ? `<span class="muted small">${esc(n.body)}</span>` : ""}</li>`,
        )
        .join("")}</ul>`
    : `<p class="muted">Nenhuma notificação nesta categoria ainda.</p>`;
  return `<div class="npop-back" data-npop-close><div class="npop ncenter" role="dialog" aria-modal="true" aria-labelledby="ncT">
    <button type="button" class="npop-x" data-npop-close aria-label="Fechar">✕</button>
    <h3 id="ncT">🔔 Central de notificações</h3>
    ${status ? `<p class="muted small">${status}</p>` : ""}
    <div class="ncenter-cats" role="group" aria-label="Categorias">${chips}</div>
    ${rows}
    <p class="note">Inclui os push recebidos com o app fechado. Toque num aviso para abrir o item; o texto dele fica fixo na tela até você fechar no ✕. ${log.length ? `<button class="btn" data-action="clear-notif-log">Limpar histórico</button>` : ""}</p>
  </div></div>`;
}

/** Cartão fixo com o texto da notificação tocada: fica na tela (sobre o item aberto) até o ✕. */
export function noteHtml({ title, body, at } = {}) {
  return `<aside class="nnote" role="status" aria-live="polite">
    <button type="button" class="npop-x" data-nnote-close aria-label="Fechar notificação">✕</button>
    <div class="muted small">🔔 Notificação${at ? ` · ${when(at)}` : ""}</div>
    <b>${esc(title ?? "")}</b>${body ? `<div class="small">${esc(body)}</div>` : ""}
  </aside>`;
}

export function showNote(n) {
  if (typeof document === "undefined" || !n?.title) return;
  document.querySelector(".nnote")?.remove();
  document.body.insertAdjacentHTML("beforeend", noteHtml(n));
}
