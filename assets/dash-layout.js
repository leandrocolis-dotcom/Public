// Mercado › Visão geral: o usuário arrasta os quadros pelo título para reordenar, recolhe cada um
// no botão "–" e restaura o padrão. Também recolhe o menu lateral no PC (tela cheia).
const KEY = "dashLayout";
const RAIL_KEY = "railHidden";

const load = (k, def) => {
  try {
    return JSON.parse(localStorage.getItem(k)) ?? def;
  } catch {
    return def;
  }
};
const save = (k, v) => {
  try {
    localStorage.setItem(k, JSON.stringify(v));
  } catch {
    /* modo privado: vale só nesta sessão */
  }
};

/** Identificador estável de um quadro a partir do título. */
export const panelId = (title) =>
  String(title)
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");

/**
 * Ordena os quadros pela ordem salva. Quadros novos (fora da ordem salva) ficam na posição padrão.
 * @param {{id: string}[]} items na ordem padrão
 * @param {string[]} order ordem salva
 */
export function applyOrder(items, order = []) {
  const known = order.filter((id) => items.some((x) => x.id === id));
  const out = known.map((id) => items.find((x) => x.id === id));
  items.forEach((x, i) => {
    if (!known.includes(x.id)) out.splice(Math.min(i, out.length), 0, x);
  });
  return out;
}

export const dashLayout = (key = KEY) => {
  const l = load(key, {});
  return { order: Array.isArray(l.order) ? l.order : [], min: Array.isArray(l.min) ? l.min : [] };
};

/**
 * Recebe [{id, html}] na ordem padrão e devolve o HTML da grade com a ordem e os recolhidos do usuário.
 * `key`: onde guardar (cada tela tem a sua; a grade leva data-layout com a mesma chave).
 */
export function layoutPanels(items, key = KEY) {
  const { order, min } = dashLayout(key);
  return applyOrder(
    items.filter((x) => x.html),
    order,
  )
    .map((x) => {
      const m = min.includes(x.id);
      const btn = `<button class="dp-min" data-dp-min="${x.id}" title="${m ? "Expandir" : "Recolher"}" aria-label="${m ? "Expandir" : "Recolher"} quadro" aria-expanded="${!m}">${m ? "+" : "–"}</button>`; // prettier-ignore
      return x.html
        .replace(
          /^<section class="dp/,
          `<section data-dp="${x.id}" class="dp${m ? " dp-folded" : ""}`,
        )
        .replace("</h3>", `${btn}</h3>`);
    })
    .join("");
}

let dragging = false;
let afterDrag = null;
/** Enquanto arrasta, o render espera: os dados ao vivo não devolvem o quadro para o lugar antigo. */
export function holdRender(fn) {
  if (!dragging) return false;
  afterDrag = fn;
  return true;
}

/** Chave do layout da grade (Visão geral = "dashLayout"; Local = "localLayout"). */
const keyOf = (el) => el?.closest?.("[data-layout]")?.dataset.layout || KEY;

function saveOrder(grid) {
  const key = keyOf(grid);
  const order = [...grid.querySelectorAll(":scope > [data-dp]")].map((el) => el.dataset.dp);
  save(key, { ...dashLayout(key), order });
}

let started = false;
/** Liga arrastar, recolher e restaurar (delegação no documento; vale para todo render). */
export function initDashLayout(rerender) {
  if (started || typeof document === "undefined") return;
  started = true;

  document.addEventListener("click", (e) => {
    const b = e.target.closest("[data-dp-min]");
    if (b) {
      const key = keyOf(b);
      const l = dashLayout(key);
      const id = b.dataset.dpMin;
      l.min = l.min.includes(id) ? l.min.filter((x) => x !== id) : [...l.min, id];
      save(key, l);
      rerender();
      return;
    }
    const r = e.target.closest("[data-dash-reset]");
    if (r) {
      save(r.dataset.dashReset || KEY, {});
      rerender();
    }
  });

  document.addEventListener("pointerdown", (e) => {
    if (e.button !== 0) return;
    // Mercado: pelo título do quadro; Início (e outras grades): pela alça [data-dp-grip]
    const grip = e.target.closest("[data-layout] > [data-dp] > [data-dp-grip]");
    const h = grip ?? e.target.closest(".dash-grid > [data-dp] > h3");
    if (!h || (!grip && e.target.closest("button, input, a, form"))) return;
    const card = h.parentElement;
    const grid = card.parentElement;
    const x0 = e.clientX;
    const y0 = e.clientY;
    let ghost = null;
    const move = (ev) => {
      if (!ghost) {
        if (Math.hypot(ev.clientX - x0, ev.clientY - y0) < 6) return;
        dragging = true;
        const r = card.getBoundingClientRect();
        ghost = card.cloneNode(true);
        ghost.className += " dp-ghost";
        ghost.style.width = `${r.width}px`;
        ghost.dataset.dx = String(x0 - r.left);
        ghost.dataset.dy = String(y0 - r.top);
        ghost.removeAttribute("data-dp");
        document.body.append(ghost);
        card.classList.add("dp-drag");
        document.body.classList.add("dp-dragging");
      }
      ev.preventDefault();
      ghost.style.transform = `translate(${ev.clientX - ghost.dataset.dx}px, ${ev.clientY - ghost.dataset.dy}px)`;
      // perto da borda da janela: rola a página para alcançar quadros fora da tela
      const edge = 60;
      if (ev.clientY < edge) window.scrollBy(0, -16);
      else if (ev.clientY > innerHeight - edge) window.scrollBy(0, 16);
      let over = document.elementFromPoint(ev.clientX, ev.clientY)?.closest("[data-dp]");
      while (over && over.parentElement !== grid) over = over.parentElement?.closest("[data-dp]");
      if (!over || over === card) return;
      const r = over.getBoundingClientRect();
      // metade de cima do quadro: entra antes; metade de baixo: depois
      if (ev.clientY < r.top + r.height / 2) over.before(card);
      else over.after(card);
    };
    const end = () => {
      document.removeEventListener("pointermove", move);
      document.removeEventListener("pointerup", end);
      document.removeEventListener("pointercancel", end);
      if (!ghost) return;
      ghost.remove();
      card.classList.remove("dp-drag");
      document.body.classList.remove("dp-dragging");
      saveOrder(grid);
      dragging = false;
      const fn = afterDrag;
      afterDrag = null;
      fn?.();
    };
    document.addEventListener("pointermove", move, { passive: false });
    document.addEventListener("pointerup", end);
    document.addEventListener("pointercancel", end);
  });
}

let tabsOn = false;
/**
 * Sub-abas (Carteira, Oportunidades…): arrastar uma aba muda a ordem. Mouse/caneta: arrasta direto;
 * dedo: segura ~0,35 s e arrasta (o toque rápido abre a aba e o arrasto curto rola a barra, como antes).
 * onSave(key, ids) grava a ordem; o render espera até soltar (holdRender).
 */
export function initTabDrag(onSave) {
  if (tabsOn || typeof document === "undefined") return;
  tabsOn = true;
  let live = false; // arrasto em curso: bloqueia a rolagem por toque
  let active = null; // { move, up } do arrasto em curso (o dedo segue por touchmove se o ponteiro cair)
  document.addEventListener(
    "touchmove",
    (e) => {
      if (!live) return;
      e.preventDefault();
      const t = e.touches[0];
      if (t) active?.move({ clientX: t.clientX, clientY: t.clientY, preventDefault() {} });
    },
    { passive: false },
  );
  document.addEventListener("touchend", () => live && active?.up());
  document.addEventListener("contextmenu", (e) => {
    if (live || e.target.closest?.(".subtabs[data-order-key] .subtab")) e.preventDefault();
  });
  document.addEventListener("pointerdown", (e) => {
    if (e.button !== 0) return;
    const tab = e.target.closest(".subtabs[data-order-key] > .subtab");
    if (!tab) return;
    const nav = tab.parentElement;
    const x0 = e.clientX;
    const y0 = e.clientY;
    const touch = e.pointerType === "touch";
    let armed = !touch; // mouse: pronto; dedo: só depois de segurar
    let moved = false;
    const timer = touch
      ? setTimeout(() => {
          armed = true;
          live = true;
          dragging = true;
          tab.classList.add("st-drag");
          navigator.vibrate?.(15);
        }, 350)
      : null;
    const move = (ev) => {
      if (!armed) {
        // dedo andou antes de segurar: é rolagem, não arrasto
        if (Math.hypot(ev.clientX - x0, ev.clientY - y0) > 8) cleanup(false);
        return;
      }
      if (!moved) {
        if (Math.hypot(ev.clientX - x0, ev.clientY - y0) < 6) return;
        moved = true;
        live = true;
        dragging = true;
        tab.classList.add("st-drag");
        nav.classList.add("st-dragging");
      }
      ev.preventDefault();
      const r0 = nav.getBoundingClientRect();
      if (ev.clientX < r0.left + 30) nav.scrollLeft -= 12;
      else if (ev.clientX > r0.right - 30) nav.scrollLeft += 12;
      const over = [...nav.children].find((b) => {
        const r = b.getBoundingClientRect();
        return b !== tab && ev.clientX >= r.left && ev.clientX <= r.right;
      });
      if (!over) return;
      const r = over.getBoundingClientRect();
      if (ev.clientX < r.left + r.width / 2) over.before(tab);
      else over.after(tab);
    };
    const cleanup = (done) => {
      active = null;
      clearTimeout(timer);
      document.removeEventListener("pointermove", move);
      document.removeEventListener("pointerup", up);
      document.removeEventListener("pointercancel", cancel);
      tab.classList.remove("st-drag");
      nav.classList.remove("st-dragging");
      const was = live;
      live = false;
      if (!dragging) return;
      dragging = false;
      if (done && moved) {
        // o clique que vem depois de soltar não abre a aba
        const stop = (c) => {
          c.stopPropagation();
          c.preventDefault();
        };
        document.addEventListener("click", stop, { capture: true, once: true });
        setTimeout(() => document.removeEventListener("click", stop, { capture: true }), 400);
        onSave(
          nav.dataset.orderKey,
          [...nav.children].map((b) => b.dataset.tab),
        );
      }
      const fn = afterDrag;
      afterDrag = null;
      if (was) fn?.();
    };
    const up = () => cleanup(true);
    // navegador cancelou o ponteiro para rolar: com o arrasto armado, o dedo segue pelo touchmove
    const cancel = () => (live ? null : cleanup(false));
    active = { move, up };
    document.addEventListener("pointermove", move, { passive: false });
    document.addEventListener("pointerup", up);
    document.addEventListener("pointercancel", cancel);
  });
}

/** Menu lateral recolhido (PC): o conteúdo ocupa a largura toda. */
export function initRail() {
  if (typeof document === "undefined") return;
  const apply = (on) => {
    document.documentElement.classList.toggle("rail-hidden", on);
    const b = document.querySelector("[data-rail-toggle]");
    if (b) {
      b.title = on ? "Mostrar menu ( [ )" : "Recolher menu ( [ )";
      b.setAttribute("aria-label", on ? "Mostrar menu" : "Recolher menu");
      b.setAttribute("aria-expanded", String(!on));
    }
  };
  const toggle = () => {
    const on = !document.documentElement.classList.contains("rail-hidden");
    save(RAIL_KEY, on);
    apply(on);
  };
  apply(load(RAIL_KEY, false) === true);
  document.addEventListener("click", (e) => {
    if (e.target.closest("[data-rail-toggle]")) toggle();
  });
  document.addEventListener("keydown", (e) => {
    if (e.key !== "[" || e.ctrlKey || e.metaKey || e.altKey) return;
    if (e.target.closest?.("input, textarea, select, [contenteditable]")) return;
    toggle();
  });
}
