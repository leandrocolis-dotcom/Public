// Piscar estilo terminal: cada preço na tela leva data-tick (chave) e data-tv (valor).
// Depois de cada render, compara com o último valor mostrado: subiu pisca verde, caiu pisca vermelho.
import { esc } from "./format.js";

/** Atributos para marcar um preço. */
export const tickAttr = (key, v) =>
  Number.isFinite(v) ? ` data-tick="${esc(key)}" data-tv="${v}"` : "";

const last = new Map();

/** Aplica o piscar no que mudou e devolve quantos subiram/caíram. */
export function flashTicks(root, seen = last) {
  const now = new Map();
  let up = 0;
  let dn = 0;
  for (const el of root.querySelectorAll("[data-tick]")) {
    const k = el.dataset.tick;
    const v = Number(el.dataset.tv);
    if (!Number.isFinite(v)) continue;
    now.set(k, v);
    const p = seen.get(k);
    if (p == null || p === v) continue;
    el.classList.add(v > p ? "tick-up" : "tick-dn");
    if (v > p) up++;
    else dn++;
  }
  for (const [k, v] of now) seen.set(k, v);
  return { up, dn };
}
