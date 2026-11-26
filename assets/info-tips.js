// Textos explicativos viram um "i" com balão: a tela mostra dados, a explicação fica a um passe de mouse (ou toque).
// Varre o DOM depois de cada desenho (MutationObserver): parágrafos .note/.dn-note/.small longos saem da tela e
// entram no balão do "i" ao lado do título do cartão. Avisos, erros, status e textos com controles ficam visíveis.

const MIN = 70; // abaixo disso o texto é curto o bastante para ficar na tela
const SEL = "p.note, p.dn-note, div.dn-note, p.small, p.muted.small";
const ALERT = /^\s*(avisos?|fonte com falha|erro|falha|atenção|⚠|sem dados|carregando)/i;
const HEAD = ":scope > h2, :scope > h3, :scope > h4, :scope > summary h2, :scope > summary h3, :scope > .card-h, :scope > header h2, :scope > header h3"; // prettier-ignore
const BOX = ".card, .ap-sec, .an-sec, section, details, .hm-card, .panel";

const tips = new WeakMap(); // "i" → [html]

const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]); // prettier-ignore

/** "i" estático com texto puro no balão (para usar direto no HTML das telas). */
export const it = (text) =>
  text ? `<span class="it" role="button" tabindex="0" aria-label="Explicação" aria-haspopup="dialog" data-tip="${esc(text)}">i</span>` : ""; // prettier-ignore

const CTRL = "button, input, select, textarea, label, a.btn";
/** Texto do parágrafo sem os controles (botões etc. ficam na tela). */
const textOf = (el) => {
  if (!el.querySelector(CTRL)) return el.textContent.trim();
  const c = el.cloneNode(true);
  for (const x of c.querySelectorAll(CTRL)) x.remove();
  return c.textContent.trim();
};

/** Texto que pode ir para o balão? (puro sobre o elemento; exportado para teste) */
export function isExplainer(el) {
  if (!el || el.dataset.keep != null || el.closest("[data-keep], .hq-pop, .it-pop")) return false;
  if (el.id || el.getAttribute("role") === "status" || el.getAttribute("aria-live")) return false;
  if (el.querySelector("canvas, svg, table")) return false;
  const t = textOf(el);
  return t.length >= MIN && !ALERT.test(t);
}

function headOf(el) {
  // título logo antes do parágrafo, no mesmo bloco (até 3 irmãos acima): evita o "i" sozinho numa linha
  let sib = el.previousElementSibling;
  for (let i = 0; sib && i < 3; i++, sib = sib.previousElementSibling)
    if (sib.matches("h2, h3, h4, summary")) return sib;
  // parágrafo solto logo depois de um cartão: o "i" vai para o título desse cartão
  const prev = el.previousElementSibling;
  if (prev?.matches(".card, section") && !el.parentElement?.closest(BOX)) {
    const h = prev.querySelector("h2, h3");
    if (h) return h;
  }
  for (let box = el.parentElement?.closest(BOX); box; box = box.parentElement?.closest(BOX)) {
    const h = box.querySelector(HEAD);
    if (h && !h.contains(el)) return h;
    if (box.matches(".card, .ap-sec, .an-sec")) break; // não sobe para o título de outro cartão
  }
  return null;
}

function makeIcon() {
  const b = document.createElement("span");
  b.className = "it";
  b.setAttribute("role", "button");
  b.tabIndex = 0;
  b.setAttribute("aria-label", "Explicação");
  b.setAttribute("aria-haspopup", "dialog");
  b.textContent = "i";
  tips.set(b, []);
  return b;
}

function convert(el) {
  el.dataset.it = "1";
  if (!isExplainer(el)) return;
  const h = headOf(el);
  let icon = h?.querySelector(":scope > .it");
  if (h && !icon) h.append((icon = makeIcon()));
  if (!icon) {
    // sem título por perto: o "i" fica no lugar do parágrafo
    icon = makeIcon();
    icon.classList.add("it-inline");
    el.before(icon);
  }
  const ctrls = [...el.querySelectorAll(CTRL)].filter((x) => !x.parentElement.closest(CTRL));
  let html = el.innerHTML;
  if (ctrls.length) {
    const c = el.cloneNode(true);
    for (const x of c.querySelectorAll(CTRL)) x.remove();
    html = c.innerHTML.trim();
  }
  const list = tips.get(icon) ?? [];
  if (!list.includes(html)) list.push(html);
  tips.set(icon, list);
  if (ctrls.length)
    el.replaceChildren(...ctrls); // os botões continuam onde estavam
  else el.remove();
}

/** Converte os explicativos dentro de root (idempotente). */
export function infoize(root = document) {
  for (const el of root.querySelectorAll(`${SEL}`)) if (!el.dataset.it) convert(el);
  // parágrafo de introdução logo abaixo do título ("Informe o valor…", "Cada item refaz…")
  for (const el of root.querySelectorAll("p.muted:not([data-it])")) {
    if (el.previousElementSibling?.matches("h2, h3, h4") && el.textContent.trim().length >= 90)
      convert(el);
  }
}

// ───────── balão (um por vez; hover no desktop, toque/Enter em qualquer tela) ─────────
let pop = null;
let from = null;
let pinned = false;
let hideT = 0;

function close() {
  clearTimeout(hideT);
  pop?.remove();
  pop = null;
  from?.setAttribute("aria-expanded", "false");
  from = null;
  pinned = false;
}

function open(icon, pin) {
  if (from === icon) {
    if (pin) pinned = true;
    return;
  }
  close();
  const list = tips.get(icon) ?? (icon.dataset.tip ? [esc(icon.dataset.tip)] : null);
  if (!list?.length) return;
  pop = document.createElement("div");
  pop.className = "hq-pop it-pop";
  pop.setAttribute("role", "dialog");
  pop.innerHTML = list.map((h) => `<p>${h}</p>`).join("");
  pop.addEventListener("mouseenter", () => clearTimeout(hideT));
  pop.addEventListener("mouseleave", () => !pinned && (hideT = setTimeout(close, 150)));
  document.body.appendChild(pop);
  const r = icon.getBoundingClientRect();
  const w = Math.min(340, window.innerWidth - 24);
  pop.style.width = `${w}px`;
  const left = Math.min(Math.max(12, r.left + r.width / 2 - w / 2), window.innerWidth - w - 12);
  const below = r.bottom + 8 + pop.offsetHeight < window.innerHeight;
  pop.style.left = `${left}px`;
  pop.style.top = `${below ? r.bottom + 8 : Math.max(12, r.top - pop.offsetHeight - 8)}px`;
  from = icon;
  pinned = !!pin;
  icon.setAttribute("aria-expanded", "true");
}

/** Liga o observador e os balões (uma vez). */
export function initInfoTips() {
  if (typeof document === "undefined" || initInfoTips.done) return;
  initInfoTips.done = true;
  let queued = false;
  const run = () => {
    queued = false;
    infoize(document.body);
  };
  new MutationObserver((ms) => {
    // só nós novos interessam (troca de texto das animações de número não varre o documento)
    if (!ms.some((m) => [...m.addedNodes].some((n) => n.nodeType === 1))) return;
    if (!queued) ((queued = true), setTimeout(run, 0)); // não rAF: pausa com a aba em segundo plano
  }).observe(document.body, { childList: true, subtree: true });
  run();

  const hover = window.matchMedia?.("(hover: hover)").matches;
  if (hover) {
    document.addEventListener("mouseover", (e) => {
      const i = e.target.closest?.(".it");
      if (i) (clearTimeout(hideT), open(i, false));
    });
    document.addEventListener("mouseout", (e) => {
      if (e.target.closest?.(".it") && !pinned) hideT = setTimeout(close, 150);
    });
  }
  // captura: o "i" dentro de um <summary> ou linha clicável não abre/fecha o que está por baixo
  document.addEventListener(
    "click",
    (e) => {
      const i = e.target.closest?.(".it");
      if (i) {
        e.preventDefault();
        e.stopPropagation();
        if (from === i && pinned) close();
        else open(i, true);
        return;
      }
      if (pop && !pop.contains(e.target)) close();
    },
    true,
  );
  document.addEventListener(
    "keydown",
    (e) => {
      if (e.key === "Escape") return close();
      const i = e.target.closest?.(".it");
      if (i && (e.key === "Enter" || e.key === " ")) {
        e.preventDefault();
        e.stopPropagation();
        if (from === i) close();
        else open(i, true);
      }
    },
    true,
  );
  window.addEventListener("scroll", close, { passive: true, capture: true });
  window.addEventListener("resize", close);
}
