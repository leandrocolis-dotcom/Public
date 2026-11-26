// Pêndulo da Início que aceita a mão ("Repouso Perturbado", docs/design/TOQUE.md + toque-canvas.png).
// Mouse sobre o pêndulo: a haste segue o ponteiro com mola; ao sair, oscila amortecida e assenta na leitura.
// Dedo (celular): a haste segue o dedo enquanto ele arrasta sobre o pêndulo, como o mouse; ao soltar, oscila
// e assenta. Clique sem ponteiro (teclado): um empurrão e o mesmo assentar. Os dois pedem a leitura nova do pêndulo na hora
// (hooks.refreshPendulum, o mesmo do ⟳), então a haste assenta na nota ATUALIZADA, não na antiga.
// Física: θ'' = −k (θ − alvo) − c θ'. Solto: k = 49 (ω0 = 7 rad/s, período ≈ 0,9 s), c = 3,5 (ζ = 0,25).
// Na mão: k = 160, c = 17,7 (ζ ≈ 0,7), firme; ângulo sempre dentro de ±44°.
// O alvo solto é lido do próprio desenho a cada quadro (--a do .hm-pend): se a nota chega no meio do balanço,
// a haste muda de rumo sozinha. Com "reduzir movimento" no sistema, só atualiza (sem balanço).
import { hooks } from "./state.js";

export const PHYS = { k: 49, c: 3.5 };
/** Mola da mão (enquanto segura): firme e quase sem rebote (ζ ≈ 0,7), para a haste acompanhar o ponteiro. */
export const HAND = { k: 160, c: 17.7 };
/** Repouso: perto do alvo e quase parado (graus e graus/s). */
export const REST = { dist: 0.15, vel: 1.5 };
/** Limite do arrasto (graus para cada lado), um pouco além da escala (38°). */
export const REACH = 44;
/** Empurrão do toque (graus/s) e intervalo mínimo entre duas atualizações pedidas pela mão. */
export const KICK = 150;
export const REFRESH_GAP = 15_000;

/** Um passo de integração (semi-implícito, estável): { th, om } em graus e graus/s. Puro. */
export function step(s, target, dt, p = PHYS) {
  const om = s.om + (-p.k * (s.th - target) - p.c * s.om) * dt;
  return { th: s.th + om * dt, om };
}

/** Assentou? Puro. */
export const atRest = (s, target) =>
  Math.abs(s.th - target) < REST.dist && Math.abs(s.om) < REST.vel;

/** Ângulo (rotate do SVG, graus) que aponta o peso para (x, y) no viewBox; pivô em (120, 14). Puro. */
export function angleTo(x, y) {
  const a = (Math.atan2(120 - x, Math.max(1, y - 14)) * 180) / Math.PI;
  return Math.max(-REACH, Math.min(REACH, a));
}

let st = null; // { th, om, hand: bool, hold: graus do ponteiro }
let raf = 0;
let last = 0;
let refreshedAt = 0;
let finger = null; // { id, svg } do dedo que segura o peso
let fingerAt = 0; // quando o dedo soltou (o click que vem depois não empurra de novo)

const rod = () => document.querySelector(".hm-hero .hm-pend");
/** Leitura atual desenhada (o --a do .hm-pend, já com o sinal do SVG). */
function reading(el) {
  const v = parseFloat(getComputedStyle(el).getPropertyValue("--a"));
  return Number.isFinite(v) ? v : 0;
}
const reduced = () => matchMedia("(prefers-reduced-motion: reduce)").matches;

function askRefresh() {
  const now = Date.now();
  if (now - refreshedAt < REFRESH_GAP) return;
  refreshedAt = now;
  hooks.refreshPendulum?.({ silent: true }); // sem aviso: só o ⟳ avisa
}

function start(el) {
  if (!st) {
    const a = reading(el);
    st = { th: a, om: 0, hand: false, hold: a };
  }
  if (!raf) {
    last = performance.now();
    raf = requestAnimationFrame(frame);
  }
}

function frame(t) {
  const el = rod();
  if (!el || !st) {
    stop(el);
    return;
  }
  // passos fixos de 1/240 s (aba que volta do fundo: no máximo 0,1 s de física por quadro)
  let dt = Math.min(0.1, (t - last) / 1000);
  last = t;
  const target = st.hand ? st.hold : reading(el);
  while (dt > 1e-6) {
    const h = Math.min(dt, 1 / 240);
    Object.assign(st, step(st, target, h, st.hand ? HAND : PHYS));
    // nunca além do alcance (um puxão rápido não joga a haste para fora da escala)
    if (Math.abs(st.th) > REACH) {
      st.th = Math.sign(st.th) * REACH;
      st.om = 0;
    }
    dt -= h;
  }
  if (!st.hand && atRest(st, target)) return stop(el);
  // o desenho pode ter sido refeito (dados novos): reaplica a cada quadro
  el.classList.add("hm-touch");
  el.classList.toggle("hm-hand", st.hand);
  el.style.transform = `rotate(${st.th.toFixed(3)}deg)`;
  raf = requestAnimationFrame(frame);
}

function stop(el) {
  cancelAnimationFrame(raf);
  raf = 0;
  st = null;
  if (el) {
    el.style.transform = "";
    el.classList.remove("hm-touch", "hm-hand");
  }
}

function svgPoint(svg, e) {
  const m = svg.getScreenCTM();
  if (!m) return null;
  const p = new DOMPoint(e.clientX, e.clientY).matrixTransform(m.inverse());
  return p;
}

const target = (e) => e.target.closest?.(".hm-hero .hm-pend-svg");

/** Liga a interação (uma vez, por delegação: sobrevive aos redesenhos da Início). */
export function initPendTouch() {
  // mouse: a mão pega o peso ao entrar, segue o ponteiro e solta ao sair
  document.addEventListener("pointerover", (e) => {
    const svg = target(e);
    if (!svg || e.pointerType !== "mouse" || st?.hand) return;
    askRefresh();
    if (reduced()) return;
    const el = rod();
    if (!el) return;
    start(el);
    st.hand = true;
    const p = svgPoint(svg, e);
    if (p) st.hold = angleTo(p.x, p.y);
  });
  document.addEventListener("pointermove", (e) => {
    if (!st?.hand || e.pointerType !== "mouse") return;
    const svg = target(e);
    if (!svg) return;
    const p = svgPoint(svg, e);
    if (p) st.hold = angleTo(p.x, p.y);
  });
  document.addEventListener("pointerout", (e) => {
    if (!st?.hand || e.pointerType !== "mouse") return;
    const svg = target(e);
    if (!svg || svg.contains(e.relatedTarget)) return;
    st.hand = false; // solta: oscila e assenta na leitura (nova, quando chegar)
  });
  // dedo (celular/caneta): pega o peso ao tocar, segue o arrasto e solta ao levantar
  document.addEventListener("pointerdown", (e) => {
    const svg = target(e);
    if (!svg || e.pointerType === "mouse" || finger) return;
    askRefresh();
    fingerAt = Date.now();
    if (reduced()) return;
    const el = rod();
    if (!el) return;
    start(el);
    st.hand = true;
    finger = { id: e.pointerId, svg };
    // o dedo pode sair do desenho e a haste continua seguindo
    if (svg.setPointerCapture) svg.setPointerCapture(e.pointerId);
    const p = svgPoint(svg, e);
    if (p) st.hold = angleTo(p.x, p.y);
  });
  document.addEventListener("pointermove", (e) => {
    if (!finger || e.pointerId !== finger.id || !st?.hand) return;
    const p = svgPoint(finger.svg, e);
    if (p) st.hold = angleTo(p.x, p.y);
  });
  const letGo = (e) => {
    if (!finger || e.pointerId !== finger.id) return;
    finger = null;
    fingerAt = Date.now();
    if (st) st.hand = false; // solta: a velocidade do arrasto vira o balanço
  };
  document.addEventListener("pointerup", letGo);
  document.addEventListener("pointercancel", letGo); // rolagem vertical tomou o gesto
  // clique sem ponteiro (teclado): empurrão; o click que segue um toque já foi tratado pelo dedo
  document.addEventListener("click", (e) => {
    const svg = target(e);
    if (!svg) return;
    if (Date.now() - fingerAt < 1500) return;
    if (e.pointerType === "mouse" || st?.hand) {
      askRefresh();
      return;
    }
    askRefresh();
    if (reduced()) return;
    const el = rod();
    if (!el) return;
    start(el);
    const p = svgPoint(svg, e);
    const side = p ? Math.sign(p.x - 120) || 1 : 1;
    st.om += side * KICK; // dedo à direita empurra o peso para a esquerda (rotate positivo)
  });
}
