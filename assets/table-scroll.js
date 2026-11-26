// Rede de segurança para telas estreitas: toda tabela fica dentro de um contêiner com rolagem horizontal,
// para nunca vazar do cartão (celular). Tabelas já dentro de .tw/.table-wrap ficam como estão.
const SCROLLERS = ".tw, .table-wrap, .tbl-scroll";

/** Envolve as tabelas sem contêiner rolável. Devolve quantas envolveu. */
export function wrapTables(root = document) {
  let n = 0;
  for (const t of root.querySelectorAll?.("table") ?? []) {
    if (t.closest(SCROLLERS)) continue;
    const w = document.createElement("div");
    w.className = "tbl-scroll";
    t.parentNode.insertBefore(w, t);
    w.appendChild(t);
    n++;
  }
  return n;
}

/** Observa o app e envolve as tabelas que forem aparecendo (telas, gavetas e conteúdo assíncrono). */
export function watchTables() {
  if (typeof MutationObserver === "undefined" || typeof document === "undefined") return;
  let queued = false;
  const run = () => {
    queued = false;
    wrapTables(document.body);
  };
  new MutationObserver((ms) => {
    if (!ms.some((m) => [...m.addedNodes].some((n) => n.nodeType === 1))) return;
    if (!queued) {
      queued = true;
      requestAnimationFrame(run);
    }
  }).observe(document.body, { childList: true, subtree: true });
  run();
}
