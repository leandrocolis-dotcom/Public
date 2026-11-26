// Balões de aviso com ✕: fechou, some até aparecer um aviso diferente. A chave é o texto do aviso sem os
// números (preço, %, datas mudam o tempo todo e não fazem dele um aviso novo); fica salva na nuvem (assets/settings-sync.js).
import { store } from "./state.js";

const KEY = "pendulo.dismissed";
const MAX = 300;

/** Texto do aviso sem tags e sem números: o que define se é "o mesmo aviso". */
export function noticeKey(html) {
  const t = String(html ?? "")
    .replace(/<button[^>]*>.*?<\/button>/gs, " ")
    .replace(/<[^>]*>/g, " ")
    .replace(/[\d.,]+%?/g, "#")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
  let h = 5381;
  for (const ch of t) h = ((h * 33) ^ ch.codePointAt(0)) >>> 0;
  return h.toString(36);
}

export const isDismissed = (id) => store.get(KEY, []).includes(id);

export function dismiss(id) {
  const l = store.get(KEY, []).filter((x) => x !== id);
  l.push(id);
  store.set(KEY, l.slice(-MAX));
}

/** Cartão de aviso fechável. Já fechado (mesmo texto): não desenha nada. */
export function dismissible(cls, inner, attrs = "") {
  const id = noticeKey(inner);
  if (isDismissed(id)) return "";
  return `<div class="${cls} dismissible" data-dismiss-box="${id}"${attrs ? ` ${attrs}` : ""}><button class="x-close" type="button" data-dismiss="${id}" aria-label="Fechar aviso" title="Fechar (volta quando houver um aviso diferente)">✕</button>${inner}</div>`;
}

// fase de captura: o ✕ não deve abrir a linha/detalhe que estiver por baixo
if (typeof document !== "undefined")
  document.addEventListener(
    "click",
    (e) => {
      const b = e.target?.closest?.("[data-dismiss]");
      if (!b) return;
      e.preventDefault();
      e.stopPropagation();
      dismiss(b.dataset.dismiss);
      const box = b.closest("[data-dismiss-box]");
      const host = box?.parentElement;
      box?.remove();
      // faixa de avisos do topo: sem avisos restantes, esconde a faixa
      if (host?.id === "banner" && !host.querySelector("[data-dismiss-box]")) host.hidden = true;
    },
    true,
  );
