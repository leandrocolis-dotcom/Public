// Movimento que ajuda a ler os números: entrada escalonada, contagem até o valor, pisca verde/vermelho
// quando um número muda numa atualização e foco de luz sob o ponteiro. Tudo respeita "Animações" do painel
// de aparência e prefers-reduced-motion. As partes sem DOM (parseNum, formatLike) são testadas.
import { decSep, numLocale, onDecimalSep } from "./format.js";

const RE_NUM = {
  ",": /^([+\-−]?)\s*(\d{1,3}(?:\.\d{3})*|\d+)(?:,(\d+))?\s*(%|σ|x|bps|pp)?$/,
  ".": /^([+\-−]?)\s*(\d{1,3}(?:,\d{3})*|\d+)(?:\.(\d+))?\s*(%|σ|x|bps|pp)?$/,
};
/** Lê um número no separador do usuário ("+1,234.56%" ou "+1.234,56%", "−2.1σ", "85"). Devolve { value, decimals, prefix, suffix } ou null. */
export function parseNum(text, sep = decSep()) {
  const m = RE_NUM[sep === "," ? "," : "."].exec(String(text).trim());
  if (!m) return null;
  const [, sign, int, dec = "", suffix = ""] = m;
  const value =
    Number(`${int.replace(/[.,]/g, "")}${dec ? `.${dec}` : ""}`) *
    (sign === "-" || sign === "−" ? -1 : 1);
  if (!Number.isFinite(value)) return null;
  return {
    value,
    decimals: dec.length,
    prefix: sign === "+" ? "+" : "",
    suffix,
    minus: sign === "−" ? "−" : "-",
  };
}

const NF = new Map();
onDecimalSep(() => NF.clear());
/** Formata `value` com as mesmas casas decimais, sinal explícito e sufixo do texto original. */
export function formatLike(value, meta) {
  const d = meta.decimals;
  if (!NF.has(d))
    NF.set(
      d,
      new Intl.NumberFormat(numLocale(), {
        minimumFractionDigits: d,
        maximumFractionDigits: d,
        useGrouping: true,
      }),
    );
  const rounded = Number(value.toFixed(d));
  const body = NF.get(d).format(Math.abs(rounded));
  const sign = rounded < 0 ? meta.minus : meta.prefix && rounded > 0 ? "+" : "";
  return `${sign}${body}${meta.suffix}`;
}
export const easeOut = (t) => 1 - (1 - t) ** 3;

function motionOn(root = document.documentElement) {
  const m = root.dataset.motion;
  // "auto" (padrão) = desligado: contagem e entrada escalonada pesam em celular. Só com "on".
  return m === "on";
}

// ───────────── contagem e pisca ─────────────

const KPI = ".lvl,.strength,.ta-px b,.ta-mt b,.kv b,.ring text";
const CELL = "td.num";
const memory = new Map(); // chave estável do número -> último valor visto

const rowOf = (el) =>
  el.closest("[data-asset],[data-sym],tr,.asset,.ta-row,.top-item,.macro,.regime,.kv");
function keyOf(el, tab, sel) {
  const row = rowOf(el);
  let rk = "";
  if (row) {
    rk =
      row.dataset.asset ??
      row.dataset.sym ??
      row.querySelector(".tk,th,td,.name,.nm,.lab")?.textContent.trim() ??
      "";
    if (row.matches(".macro,.regime,.kv")) rk += `#${[...row.parentElement.children].indexOf(row)}`;
  }
  const scope = row ?? el.parentElement;
  const idx = [...scope.querySelectorAll(sel)].indexOf(el);
  return `${tab}|${rk}|${sel === CELL ? "c" : "k"}${idx}`;
}

const raf =
  typeof requestAnimationFrame === "function" ? requestAnimationFrame : (f) => setTimeout(f, 16);
function tween(el, from, to, meta, ms) {
  const t0 = performance.now();
  const final = el.textContent;
  const step = (now) => {
    const t = Math.min(1, (now - t0) / ms);
    el.textContent = t >= 1 ? final : formatLike(from + (to - from) * easeOut(t), meta);
    if (t < 1 && el.isConnected) raf(step);
  };
  raf(step);
}

/** Ordem de cada bloco/linha para escalonar a animação de entrada. */
function stagger(root) {
  [...root.children].forEach((c, i) => c.style.setProperty("--i", Math.min(i, 12)));
  root
    .querySelectorAll("tbody")
    .forEach((tb) =>
      [...tb.children].forEach((r, i) => r.style.setProperty("--r", Math.min(i, 30))),
    );
  root
    .querySelectorAll(".assets,.ta-rows,.tm-wrap,.treemap")
    .forEach((g) => [...g.children].forEach((r, i) => r.style.setProperty("--r", Math.min(i, 40))));
  root.querySelectorAll(".top-item").forEach((r, i) => r.style.setProperty("--r", Math.min(i, 12)));
}

/**
 * Depois de cada render. `enter` = a aba (ou o ativo) acabou de abrir: escalona a entrada e conta os indicadores
 * principais de 0 até o valor. Sem `enter` (atualização de dados): só destaca o que mudou.
 */
export function enhance(root, { tab, enter }) {
  const on = motionOn();
  // atrasos da animação de entrada (--i/--r): só valem com .enter; gravar a cada atualização desfazia o morph
  if (enter) stagger(root);

  for (const sel of [KPI, CELL]) {
    for (const el of root.querySelectorAll(sel)) {
      if (el.children.length) continue;
      const meta = parseNum(el.textContent);
      if (!meta) continue;
      const key = keyOf(el, tab, sel);
      const prev = memory.get(key);
      memory.set(key, meta.value);
      if (!on) continue;
      if (enter && sel === KPI) {
        if (meta.value !== 0) tween(el, 0, meta.value, meta, 900);
      } else if (prev !== undefined && Math.abs(prev - meta.value) > 1e-9) {
        el.classList.add(meta.value > prev ? "tick-up" : "tick-down");
        if (sel === KPI) tween(el, prev, meta.value, meta, 600);
      }
    }
  }
  if (memory.size > 6000) memory.clear();
}

// ───────────── foco de luz sob o ponteiro ─────────────

let spotlightOn = false;
export function initSpotlight() {
  if (spotlightOn) return;
  spotlightOn = true;
  let last = null;
  let scheduled = false;
  document.addEventListener(
    "pointermove",
    (e) => {
      if (e.pointerType === "touch" || !motionOn()) return;
      const el = e.target.closest?.(".card,.asset,.ta-row,.top-item");
      if (!el) return;
      last = { el, x: e.clientX, y: e.clientY };
      if (scheduled) return;
      scheduled = true;
      raf(() => {
        scheduled = false;
        if (!last) return;
        const r = last.el.getBoundingClientRect();
        last.el.style.setProperty("--mx", `${last.x - r.left}px`);
        last.el.style.setProperty("--my", `${last.y - r.top}px`);
      });
    },
    { passive: true },
  );
}
