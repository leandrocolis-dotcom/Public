// Componentes visuais puros (HTML em texto) e aviso na tela; não leem o estado do app.
import { hooks } from "./state.js";

/**
 * Para onde o aviso voa ao soltar o dedo (puro): null = volta ao centro. Sai além de 1/3 da largura, 80 px ou
 * 0,5 px/ms, para o lado do gesto (qualquer direção), com o vetor esticado até fora da tela.
 * Desenho do movimento: docs/design/MOVIMENTO.md.
 */
export function swipeFling(dx, dy, ms, width = 360) {
  const dist = Math.hypot(dx, dy);
  const speed = ms > 0 ? dist / ms : 0;
  if (dist < 8 || !(Math.abs(dx) > width / 3 || dist > 80 || speed > 0.5)) return null;
  const k = 700 / dist;
  return { x: dx * k, y: dy * k };
}

const TONE = { err: "bad", error: "bad" };
const reduced = () => typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches; // prettier-ignore

/** Tira o aviso com a saída pedida ("time" | "x" | { x, y } do deslizar) e remove do DOM no fim. */
function dismiss(el, how) {
  if (el.dataset.out) return;
  el.dataset.out = "1";
  clearTimeout(el._timer);
  if (how && typeof how === "object" && !reduced()) {
    el.style.transition = "transform 220ms cubic-bezier(.2,.7,.3,1), opacity 220ms linear";
    el.style.transform = `translate(${how.x}px, ${how.y}px) rotate(${Math.max(-6, Math.min(6, how.x / 60))}deg)`;
    el.style.opacity = "0";
  } else el.classList.add(how === "x" ? "out-x" : "out-time");
  setTimeout(() => el.remove(), 280);
}

/** Aviso na tela: entra pousando, × no canto superior direito, fecha sozinho (fio na base), pelo × ou deslizando
 * para qualquer lado. Com `url`, tocar no aviso leva ao item (mesmo destino da notificação). */
export function toast(msg, tone = "ok", ms = 9000, url = null) {
  const box = document.getElementById("toasts");
  if (!box) return;
  const small = matchMedia("(max-width: 860px)").matches;
  const life = small ? Math.min(ms, 6000) : ms;
  const el = document.createElement("div");
  el.className = `toast ${TONE[tone] ?? tone}${url ? " link" : ""}`;
  el.setAttribute("role", "status");
  const txt = document.createElement("span");
  txt.className = "toast-msg";
  txt.textContent = msg;
  const x = document.createElement("button");
  x.type = "button";
  x.className = "toast-x";
  x.setAttribute("aria-label", "Fechar aviso");
  x.textContent = "×";
  const bar = document.createElement("i");
  bar.className = "toast-bar";
  bar.style.animationDuration = `${life}ms`;
  el.append(txt, x, bar);

  // tempo de vida: pausa enquanto o dedo/mouse está no aviso
  let left = life;
  let started = Date.now();
  const arm = () => {
    started = Date.now();
    el._timer = setTimeout(() => dismiss(el, "time"), left);
    el.classList.remove("hold");
  };
  const hold = () => {
    clearTimeout(el._timer);
    left = Math.max(400, left - (Date.now() - started));
    el.classList.add("hold");
  };

  x.addEventListener("click", (e) => {
    e.stopPropagation();
    dismiss(el, "x");
  });

  // deslizar para qualquer lado
  let drag = null;
  el.addEventListener("pointerdown", (e) => {
    if (e.target === x || el.dataset.out) return;
    drag = { x0: e.clientX, y0: e.clientY, t0: Date.now(), dx: 0, dy: 0, id: e.pointerId };
    el.setPointerCapture?.(e.pointerId);
    el.style.transition = "none";
    hold();
  });
  el.addEventListener("pointermove", (e) => {
    if (!drag || e.pointerId !== drag.id) return;
    drag.dx = e.clientX - drag.x0;
    drag.dy = e.clientY - drag.y0;
    if (Math.hypot(drag.dx, drag.dy) > 4) el.classList.add("drag");
    const rot = Math.max(-6, Math.min(6, (drag.dx / el.offsetWidth) * 12));
    el.style.transform = `translate(${drag.dx}px, ${drag.dy}px) rotate(${rot}deg)`;
    el.style.opacity = String(Math.max(0.35, 1 - Math.hypot(drag.dx, drag.dy) / 400));
  });
  const release = (e) => {
    if (!drag || (e && e.pointerId !== drag.id)) return;
    const { dx, dy, t0 } = drag;
    drag = null;
    el.classList.remove("drag");
    const fling = swipeFling(dx, dy, Date.now() - t0, el.offsetWidth);
    if (fling) return dismiss(el, fling);
    if (Math.hypot(dx, dy) < 8) {
      // toque: abre o destino (com url) ou fecha, como antes
      if (url) {
        hooks.openTarget?.(url);
        hooks.showNote?.({ title: msg, at: Date.now() }); // o texto do aviso fica fixo na tela
      }
      return dismiss(el, "x");
    }
    el.style.transition = "transform 420ms cubic-bezier(.34,1.32,.64,1), opacity 200ms linear";
    el.style.transform = "";
    el.style.opacity = "";
    arm();
  };
  el.addEventListener("pointerup", release);
  el.addEventListener("pointercancel", release);
  el.addEventListener("mouseenter", () => !drag && hold());
  el.addEventListener("mouseleave", () => !drag && !el.dataset.out && arm());

  box.prepend(el);
  for (const old of [...box.children].slice(small ? 1 : 4)) dismiss(old, "time"); // celular: um aviso por vez
  arm();
}
