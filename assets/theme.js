// Temas e preferências de aparência. As cores vivem em themes.css; aqui ficam a escolha do usuário,
// a aplicação no <html> e a leitura das cores para os gráficos em canvas (Chart.js).

/** `bg`, `surface`, `text`, `accent`, `buy`, `sell` só alimentam a miniatura no painel (as cores reais estão no CSS). */
export const THEMES = [
  { id: "midnight", name: "Meia-noite", note: "Azul-noite profundo", mode: "dark", bg: "#070a12", surface: "#151c2f", text: "#e8edf8", accent: "#8c9bff", buy: "#3ddc97", sell: "#ff7088" },
  { id: "graphite", name: "Grafite", note: "Preto neutro, sem azul", mode: "dark", bg: "#0a0a0b", surface: "#1b1b1f", text: "#ececef", accent: "#7dd3fc", buy: "#4ade80", sell: "#fb7185" },
  { id: "ember", name: "Âmbar", note: "Quente, poupa a vista à noite", mode: "dark", bg: "#120e09", surface: "#261e15", text: "#f1e7d5", accent: "#f2b04a", buy: "#9bd98a", sell: "#f29a83" },
  { id: "terminal", name: "Terminal", note: "Preto, laranja e âmbar, monoespaçado", mode: "dark", bg: "#000000", surface: "#141414", text: "#ffa028", accent: "#ff8a00", buy: "#2ee06f", sell: "#ff4a3d" },
  { id: "paper", name: "Papel", note: "Claro e quente, sem ofuscar", mode: "light", bg: "#f3f0e9", surface: "#ffffff", text: "#1b1e27", accent: "#4338ca", buy: "#0b7a58", sell: "#bf2e48" },
  { id: "mist", name: "Névoa", note: "Claro frio e suave", mode: "light", bg: "#e7ecf3", surface: "#f5f8fc", text: "#172033", accent: "#3249c9", buy: "#09775d", sell: "#b52b46" },
]; // prettier-ignore
export const FONT_SIZES = [
  ["0.9", "Pequeno"],
  ["1", "Normal"],
  ["1.12", "Grande"],
  ["1.25", "Extra"],
];
/** Zoom da tela inteira (botões − / + do cabeçalho e teclas − + 0). */
export const ZOOM_STEPS = [0.67, 0.75, 0.8, 0.9, 1, 1.1, 1.25, 1.5];
/** Próximo nível de zoom: dir = +1 (aumenta), -1 (diminui) ou 0 (volta a 100%). */
export function stepZoom(cur, dir) {
  if (!dir) return 1;
  const z = Number(cur) || 1;
  const i = ZOOM_STEPS.findIndex((s) => s >= z - 1e-6);
  const at = i < 0 ? ZOOM_STEPS.length - 1 : i;
  const idx = dir > 0 ? (ZOOM_STEPS[at] > z + 1e-6 ? at : at + 1) : at - 1;
  return ZOOM_STEPS[Math.max(0, Math.min(ZOOM_STEPS.length - 1, idx))];
}
export const DEFAULT_UI = {
  theme: "midnight",
  cb: false,
  fs: "1",
  density: "comfortable",
  motion: "auto",
  zoom: 1,
  // onde ficam as abas das seções: "auto" (lateral no computador, embaixo no celular), "top" ou "bottom"
  nav: "auto",
};
export const NAV_POS = ["auto", "top", "bottom"];

const KEY = "pendulo.ui";
const byId = Object.fromEntries(THEMES.map((t) => [t.id, t]));

export function loadUi() {
  try {
    return { ...DEFAULT_UI, ...JSON.parse(localStorage.getItem(KEY) ?? "{}") };
  } catch {
    return { ...DEFAULT_UI };
  }
}
export function saveUi(ui) {
  try {
    localStorage.setItem(KEY, JSON.stringify(ui));
  } catch {
    /* sem armazenamento: vale só nesta visita */
  }
}

/** "auto" segue o sistema: escuro vira Meia-noite, claro vira Papel. */
export function resolveTheme(id, prefersDark = matchMedia("(prefers-color-scheme: dark)").matches) {
  if (id === "auto") return prefersDark ? "midnight" : "paper";
  return byId[id] ? id : DEFAULT_UI.theme;
}

/** Aplica as preferências no <html>. Devolve o tema resolvido. */
export function applyUi(ui, root = document.documentElement) {
  const theme = resolveTheme(ui.theme);
  root.dataset.theme = theme;
  root.dataset.mode = byId[theme].mode;
  root.dataset.cb = ui.cb ? "1" : "0";
  root.dataset.density = ui.density;
  root.dataset.motion = ui.motion;
  root.dataset.nav = NAV_POS.includes(ui.nav) ? ui.nav : "auto";
  root.style.setProperty("--fs", ui.fs);
  const z = ZOOM_STEPS.includes(Number(ui.zoom)) ? Number(ui.zoom) : 1;
  root.style.zoom = z === 1 ? "" : String(z);
  root.style.setProperty("--zoom", String(z));
  cache.clear();
  const bg = getComputedStyle(root).getPropertyValue("--bg").trim();
  document.querySelector('meta[name="theme-color"]')?.setAttribute("content", bg || byId[theme].bg);
  return theme;
}

// ───────────── cores para canvas ─────────────

const cache = new Map();
/** Valor de uma variável CSS do tema atual (ex.: "--buy"). */
export function cssVar(name) {
  if (!cache.has(name))
    cache.set(name, getComputedStyle(document.documentElement).getPropertyValue(name).trim());
  return cache.get(name);
}
/** Paleta do tema atual para gráficos. */
export function pal() {
  const v = cssVar;
  return {
    buy: v("--buy"), sell: v("--sell"), wait: v("--wait"), info: v("--info"), accent: v("--accent"), violet: v("--violet"),
    text: v("--text"), text2: v("--text-2"), text3: v("--text-3"), surface: v("--surface"), surface2: v("--surface-2"),
    surface3: v("--surface-3"), line: v("--line"), line2: v("--line-2"), bg: v("--bg"),
    ui: v("--ui"), mono: v("--mono"),
  }; // prettier-ignore
}
/** "#rrggbb" + alfa (0 a 1) -> "#rrggbbaa". */
export const alpha = (hex, a) =>
  `${hex}${Math.round(Math.max(0, Math.min(1, a)) * 255)
    .toString(16)
    .padStart(2, "0")}`;
export function hexToRgb(hex) {
  const h = hex.replace("#", "");
  return [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16));
}
const lin = (c) => ((c /= 255) <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
export const luminance = ([r, g, b]) => 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
/** Cor de texto (escura ou clara) com maior contraste sobre um fundo [r,g,b]. */
export function readableOn(rgb, dark = "#0b1022", light = "#ffffff") {
  const L = luminance(rgb);
  const cd = (L + 0.05) / (luminance(hexToRgb(dark)) + 0.05);
  const cl = (luminance(hexToRgb(light)) + 0.05) / (L + 0.05);
  return cd >= cl ? dark : light;
}

const brTitled = new WeakSet();
/** Aplica o tema nos padrões do Chart.js (chamar antes de criar os gráficos). */
export function applyChartTheme(Chart) {
  if (!Chart) return;
  const p = pal();
  const d = Chart.defaults;
  d.color = p.text2;
  d.borderColor = p.line;
  d.font.family = p.ui;
  d.font.size = 11;
  d.locale = "pt-BR"; // números da dica do ponto no padrão brasileiro (1.234,56)
  // sem animação: os dados chegam ao vivo e a tela é redesenhada; animar só atrasava e quebrava gráfico destruído
  // no meio do quadro ("this._fn is not a function", visto nos aparelhos)
  d.animation = false;
  Object.assign(d.plugins.tooltip, {
    backgroundColor: p.surface3, titleColor: p.text, bodyColor: p.text, borderColor: p.line2, borderWidth: 1,
    cornerRadius: 10, padding: 10, boxPadding: 4, titleFont: { family: p.ui, weight: "600" }, bodyFont: { family: p.mono, size: 11 },
  }); // prettier-ignore
  d.plugins.legend.labels.color = p.text2;
  // título da dica do ponto: data AAAA-MM-DD vira DD/MM/AA
  const cb = d.plugins.tooltip.callbacks;
  if (!brTitled.has(cb)) {
    const base = cb.title;
    cb.title = function (items) {
      const br = (t) => (typeof t === "string" && /^\d{4}-\d{2}-\d{2}$/.test(t) ? `${t.slice(8)}/${t.slice(5, 7)}/${t.slice(2, 4)}` : t); // prettier-ignore
      const t = base.call(this, items);
      return Array.isArray(t) ? t.map(br) : br(t);
    };
    brTitled.add(cb);
  }
}
