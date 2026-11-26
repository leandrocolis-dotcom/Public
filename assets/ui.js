// Casca do app: logo, navegação (barra lateral no computador, dock no celular) e painel de aparência.
// Só HTML e eventos; o estado das abas continua no app.js.
import { THEMES, FONT_SIZES, loadUi, saveUi, applyUi, stepZoom } from "./theme.js";
import { esc } from "./format.js";
import { it } from "./info-tips.js";
import { visibleTabs } from "./state.js";

const svg = (body, cls = "") =>
  `<svg class="${cls}" viewBox="0 0 24 24" aria-hidden="true">${body}</svg>`;
const ICONS = {
  dash: svg('<rect x="3" y="3" width="8" height="8" rx="1.5"/><rect x="13" y="3" width="8" height="5" rx="1.5"/><rect x="13" y="10" width="8" height="11" rx="1.5"/><rect x="3" y="13" width="8" height="8" rx="1.5"/>'),
  overview: svg('<rect x="3" y="3" width="7" height="9" rx="2"/><rect x="14" y="3" width="7" height="5" rx="2"/><rect x="14" y="12" width="7" height="9" rx="2"/><rect x="3" y="16" width="7" height="5" rx="2"/>'),
  sim: svg('<path d="M9 3h6M10 3v6l-5 9a2 2 0 0 0 1.7 3h10.6a2 2 0 0 0 1.7-3l-5-9V3"/><path d="M7.5 15h9"/>'),
  search: svg('<circle cx="10.5" cy="10.5" r="6.5"/><path d="M15.5 15.5L21 21"/>'),
  bell: svg('<path d="M6 17h12l-1.5-2V10a4.5 4.5 0 0 0-9 0v5zM10 20a2 2 0 0 0 4 0"/>'),
  portfolio: svg('<rect x="3" y="7" width="18" height="13" rx="2.5"/><path d="M8 7V5.5A1.5 1.5 0 0 1 9.5 4h5A1.5 1.5 0 0 1 16 5.5V7M3 13h18"/>'),
  entry: svg('<circle cx="12" cy="12" r="8"/><circle cx="12" cy="12" r="2.2"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3"/>'),
  gear: svg('<circle cx="12" cy="12" r="3.2"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/>'),
  reload: svg('<path d="M20 11a8 8 0 1 0-2.3 5.7M20 4v7h-7"/>'),
}; // prettier-ignore

/** Marca: um pêndulo (eixo, arco e duas pontas: a que sobe e a que cai). */
const BRAND = `<svg viewBox="0 0 32 32" aria-hidden="true"><rect x=".5" y=".5" width="31" height="31" rx="9" fill="var(--surface-2)" stroke="var(--line-2)"/><path d="M16 5.5v9" stroke="var(--text)" stroke-width="1.8" stroke-linecap="round"/><path d="M8.5 22.5a9.5 9.5 0 0 1 15 0" fill="none" stroke="var(--text-3)" stroke-width="1.2" stroke-dasharray="1.5 2.5" stroke-linecap="round"/><circle cx="8.5" cy="22.5" r="3.1" fill="var(--sell)"/><circle cx="23.5" cy="22.5" r="3.1" fill="var(--buy)"/><circle cx="16" cy="14.5" r="1.8" fill="var(--accent)"/></svg>`;

// ícone de cada seção (reaproveita os desenhos das abas)
const GROUP_ICON = {
  home: "overview",
  market: "dash",
  wallet: "portfolio",
  opps: "entry",
  lab: "sim",
};

/** Botão de seção: leva à última sub-aba aberta nela (ou à primeira). */
function groupButton(g, i, current, prefs, kbd) {
  const on = g.tabs.includes(current);
  const last = prefs.groupLast?.[g.id];
  const vis = visibleTabs(g.tabs);
  const tab = on ? current : vis.includes(last) ? last : vis[0];
  return `<button class="tab" role="tab" data-tab="${tab}" aria-selected="${on}" title="${esc(`${g.label}: ${g.q}`)}">${ICONS[GROUP_ICON[g.id]] ?? ""}<span class="lb">${esc(g.label)}</span>${kbd ? `<kbd>${i + 1}</kbd>` : ""}</button>`;
}

/** innerHTML só se o conteúdo mudou (guarda a última string no próprio elemento). */
export function setHtml(el, html) {
  if (el && el._html !== html) el.innerHTML = el._html = html;
}

/** Desenha a navegação: as 5 seções na barra lateral (computador) e no dock (celular). */
export function renderNav(groups, tabs, current, prefs) {
  // só reescreve quando muda (a cada pacote ao vivo a navegação é a mesma; reescrever tirava o foco do teclado)
  setHtml(document.getElementById("tabs"), groups.map((g, i) => groupButton(g, i, current, prefs, true)).join("")); // prettier-ignore
  setHtml(document.getElementById("dock"), groups.map((g, i) => groupButton(g, i, current, prefs, false)).join("")); // prettier-ignore
  const g = groups.find((x) => x.tabs.includes(current));
  const label = tabs.find(([id]) => id === current)?.[1] ?? "Pêndulo";
  const seg = segOf(g, current);
  const title =
    g && g.tabs.length > 1 ? [g.label, seg?.label, label].filter(Boolean).join(" · ") : label;
  const h = document.getElementById("pageTitle");
  if (h) h.textContent = g ? (seg ? `${g.label} · ${seg.label}` : g.label) : label;
  document.title = `${title} · Pêndulo`;
}

/** Ordem das sub-abas escolhida pelo usuário (arrastando): ids conhecidos na ordem salva, novos no fim. */
export function orderTabs(list, order = []) {
  const pos = new Map((order ?? []).map((id, i) => [id, i]));
  return list
    .map((id, i) => ({ id, k: pos.has(id) ? pos.get(id) : 1000 + i }))
    .sort((a, b) => a.k - b.k)
    .map((x) => x.id);
}

/** Lado do mercado (Offshore/Onshore) da aba, quando a seção tem lados. */
const segOf = (g, tab) => g?.segs?.find((m) => m.tabs.includes(tab)) ?? null;

/**
 * Sub-abas da seção atual + a frase "para que serve" da aba aberta. Em Mercados há dois níveis: o lado
 * (🌎 Offshore · EUA e mundo | 🇧🇷 Onshore · Brasil) e, dentro dele, as mesmas cinco telas na mesma ordem.
 * prefs.groupLast["market:on"] lembra a última tela de cada lado.
 */
export function subNavHtml(groups, tabs, info, current, prefs = {}) {
  const g = groups.find((x) => x.tabs.includes(current));
  if (!g || g.tabs.length < 2) return "";
  const name = Object.fromEntries(tabs);
  const seg = segOf(g, current);
  const key = seg ? `${g.id}:${seg.id}` : g.id;
  const list = orderTabs(visibleTabs(seg ? seg.tabs : g.tabs, current), prefs.tabOrder?.[key]);
  const sides = seg
    ? `<nav class="mkt-sides" role="tablist" aria-label="${esc(g.label)}">${g.segs
        .map((m) => {
          const on = m === seg;
          const last = prefs.groupLast?.[`${g.id}:${m.id}`];
          const vis = visibleTabs(m.tabs);
          const to = on ? current : vis.includes(last) ? last : vis[0];
          return `<button title="${esc(m.hint)}" class="mkt-side" role="tab" data-tab="${to}" aria-selected="${on}"><span class="mkt-flag" aria-hidden="true">${m.flag}</span><b>${esc(m.label)}</b></button>`;
        })
        .join("")}</nav>`
    : "";
  return `<div class="subnav${seg ? ` mkt-${seg.id}` : ""}">${sides}<nav class="subtabs" role="tablist" data-order-key="${key}" title="Arraste uma aba para mudar a ordem" aria-label="${esc(seg ? `${g.label} ${seg.label}` : g.label)}">${list
    .map(
      (id) =>
        `<button class="subtab" role="tab" data-tab="${id}" aria-selected="${id === current}">${esc(name[id])}</button>`,
    )
    .join("")}</nav>${it(info[current])}</div>`;
}

// ───────────── painel de aparência ─────────────

function themeCard(t, current) {
  const bars = [14, 24, 18, 26, 20]
    .map((h, i) => `<i style="height:${h}px;background:${i % 2 ? t.sell : t.buy}"></i>`)
    .join("");
  return `<button class="theme-card" data-ui-theme="${t.id}" aria-pressed="${current === t.id}">
    <span class="pv" style="background:${t.bg}"><i style="background:${t.surface}"></i><span class="pv-main"><i class="pv-line" style="background:${t.text};opacity:.7"></i><span class="pv-bars">${bars}</span></span></span>
    <span><b>${esc(t.name)}</b><br><small>${esc(t.note)}</small></span></button>`;
}
const seg = (attr, cur, opts) =>
  `<span class="seg" role="group">${opts.map(([v, l]) => `<button data-${attr}="${v}" aria-pressed="${String(v) === String(cur)}">${esc(l)}</button>`).join("")}</span>`;

export function appearanceHtml(ui = state.ui) {
  return `<h2>Aparência</h2>
    <h3>Tema</h3>
    <div class="themes">${THEMES.map((t) => themeCard(t, ui.theme)).join("")}
      <button class="theme-card" data-ui-theme="auto" aria-pressed="${ui.theme === "auto"}"><span class="pv" style="background:linear-gradient(115deg,#070a12 50%,#f3f0e9 50%)"></span><span><b>Automático</b><br><small>Segue o seu sistema</small></span></button></div>
    <h3>Leitura</h3>
    <div class="opt-row"><span>Daltonismo<small>Azul = alta, laranja = baixa (sem verde/vermelho)</small></span><button class="switch" role="switch" aria-checked="${ui.cb}" data-ui="cb" aria-label="Modo para daltonismo"></button></div>
    <div class="opt-row"><span>Tamanho do texto</span>${seg("ui-fs", ui.fs, FONT_SIZES)}</div>
    <h3>Navegação</h3>
    <div class="opt-row"><span>Abas das seções<small>Automático = lateral no computador e embaixo no celular</small></span>${seg(
      "ui-nav",
      ui.nav ?? "auto",
      [
        ["auto", "Automático"],
        ["top", "Topo"],
        ["bottom", "Embaixo"],
      ],
    )}</div>
    <h3>Densidade</h3>
    <div class="opt-row"><span>Espaçamento</span>${seg("ui-density", ui.density, [
      ["comfortable", "Confortável"],
      ["compact", "Compacto"],
    ])}</div>
    <div class="opt-row"><span>Animações<small>Contagem dos números e destaque do que mudou</small></span>${seg(
      "ui-motion",
      ui.motion,
      [
        ["auto", "Leve (padrão)"],
        ["on", "Ligadas"],
      ],
    )}</div>
    <p class="note">Suas escolhas ficam salvas na nuvem (com login) e valem em todos os aparelhos; o zoom é de cada aparelho.</p>`;
}

let state = { ui: loadUi(), onChange: () => {} };
const $ = (id) => document.getElementById(id);

function change(patch) {
  state.ui = { ...state.ui, ...patch };
  saveUi(state.ui);
  applyUi(state.ui);
  showZoom();
  state.onChange();
}

/** Aparência vinda da nuvem (outro aparelho): relê e aplica. */
export function reloadUi() {
  state.ui = loadUi();
  applyUi(state.ui);
  state.onChange();
}

/** Mostra o nível de zoom atual no botão do meio (− 100% +). */
function showZoom() {
  const el = $("zoomVal");
  if (el) el.textContent = `${Math.round((Number(state.ui.zoom) || 1) * 100)}%`;
}
const zoomBy = (dir) => change({ zoom: stepZoom(state.ui.zoom, dir) });

/** Aplica o tema salvo, desenha a marca e liga os eventos. `onChange` é chamado quando a aparência muda (redesenhar gráficos). */
export function initUi({ onChange }) {
  state.onChange = onChange;
  applyUi(state.ui);
  showZoom();
  $("brand").innerHTML = `${BRAND}<span>Pêndulo</span>`;
  $("brandM").innerHTML = BRAND;
  document.querySelector("[data-action=reload]")?.insertAdjacentHTML("afterbegin", ICONS.reload);
  document
    .querySelector(".icon-btn[data-action=search]")
    ?.insertAdjacentHTML("afterbegin", ICONS.search);
  document
    .querySelector(".icon-btn[data-action=bell]")
    ?.insertAdjacentHTML("afterbegin", ICONS.bell);
  for (const b of document.querySelectorAll("[data-gear]"))
    b.insertAdjacentHTML("afterbegin", ICONS.gear);
  matchMedia("(prefers-color-scheme: dark)").addEventListener(
    "change",
    () => state.ui.theme === "auto" && change({}),
  );

  // zoom: − / + / 0 no teclado (fora de campos de texto, sem Ctrl/Cmd, que seguem com o zoom do navegador)
  document.addEventListener("keydown", (e) => {
    if (/^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName) || e.target.isContentEditable) return;
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    const dir = { "+": 1, "=": 1, "-": -1, _: -1, 0: 0 }[e.key];
    if (dir === undefined) return;
    e.preventDefault();
    zoomBy(dir);
  });

  document.addEventListener("click", (e) => {
    const z = e.target.closest("[data-zoom]");
    if (z) return zoomBy(Number(z.dataset.zoom));
    const t = e.target.closest(
      "[data-ui],[data-ui-theme],[data-ui-fs],[data-ui-density],[data-ui-motion],[data-ui-nav]",
    );
    if (!t) return;
    const d = t.dataset;
    if (d.uiTheme) change({ theme: d.uiTheme });
    else if (d.uiFs) change({ fs: d.uiFs });
    else if (d.uiDensity) change({ density: d.uiDensity });
    else if (d.uiMotion) change({ motion: d.uiMotion });
    else if (d.uiNav) change({ nav: d.uiNav });
    else if (d.ui === "cb") change({ cb: !state.ui.cb });
  });
}
