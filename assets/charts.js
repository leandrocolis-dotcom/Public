// Gráficos (Chart.js) e painel lateral: criação, limpeza e tema.
import { applyChartTheme, pal } from "./theme.js";
import { watchDrawer } from "./fold.js";
import { state } from "./state.js";

/**
 * Destrói o gráfico e libera a memória do canvas. No iOS o Safari tem um teto de memória somado de todos os
 * canvas: canvases esquecidos (painel reaberto, janela trocada) fazem os gráficos seguintes saírem em branco.
 */
function kill(c) {
  try {
    const el = c.canvas;
    c.destroy();
    if (el) el.width = el.height = 0;
  } catch {
    /* já destruído */
  }
}

export const destroyCharts = () => {
  state.charts.forEach(kill);
  state.charts = [];
};

const reduced = () => matchMedia("(prefers-reduced-motion: reduce)").matches;
const coarse = () => matchMedia("(pointer: coarse)").matches;

/**
 * Ponto escolhido na curva: linha vertical na data tocada/clicada e um marcador em cada série, junto com a dica
 * (data e valores daquele ponto). Vale para todos os gráficos de linha e barra; o de dispersão já marca o ponto.
 */
const pickPlugin = {
  id: "pickLine",
  afterDatasetsDraw(chart) {
    const act = chart.tooltip?.getActiveElements?.() ?? [];
    if (!act.length || chart.config.type === "scatter") return;
    const { ctx, chartArea: a } = chart;
    const x = act[0].element?.x;
    if (!Number.isFinite(x) || x < a.left || x > a.right) return;
    const p = pal();
    ctx.save();
    ctx.strokeStyle = p.text3;
    ctx.lineWidth = 1;
    ctx.setLineDash([3, 3]);
    ctx.beginPath();
    ctx.moveTo(x, a.top);
    ctx.lineTo(x, a.bottom);
    ctx.stroke();
    ctx.setLineDash([]);
    for (const it of act) {
      const ds = chart.data.datasets[it.datasetIndex];
      const y = it.element?.y;
      if (!Number.isFinite(y) || (ds?.type ?? chart.config.type) === "bar") continue;
      ctx.beginPath();
      ctx.arc(it.element.x, y, 3.5, 0, Math.PI * 2);
      ctx.fillStyle = typeof ds?.borderColor === "string" ? ds.borderColor : p.text;
      ctx.strokeStyle = p.surface;
      ctx.lineWidth = 1.5;
      ctx.fill();
      ctx.stroke();
    }
    ctx.restore();
  },
};

export function mkChart(el, cfg) {
  if (typeof Chart === "undefined" || !el) return null;
  applyChartTheme(Chart);
  cfg.plugins = [...(cfg.plugins ?? []), pickPlugin];
  cfg.options = {
    responsive: true,
    maintainAspectRatio: false,
    animation: reduced() ? false : undefined,
    // tela 3x do iPhone: 2x já é nítido e gasta menos da metade da memória de canvas
    devicePixelRatio: Math.min(2, globalThis.devicePixelRatio || 1),
    // tocar/clicar em qualquer altura da curva escolhe a data mais próxima (não precisa acertar o ponto)
    ...(cfg.type === "scatter"
      ? {}
      : { interaction: { mode: "index", intersect: false, axis: "x" } }),
    // tela de toque: o navegador manda um "mouseout" ao levantar o dedo e a dica sumia na hora; fica até o próximo toque
    ...(coarse() ? { events: ["mousemove", "click", "touchstart", "touchmove"] } : {}),
    ...cfg.options,
  };
  const c = new Chart(el, cfg);
  state.charts.push(c);
  return c;
}

export const seriesOf = (code) => state.prices.series[code];

export const sma = (s, k) =>
  s.map((_, i) => (i < k - 1 ? null : s.slice(i - k + 1, i + 1).reduce((a, b) => a + b, 0) / k));

export function openDrawer(html, after) {
  watchDrawer();
  const d = document.getElementById("drawer");
  destroyDrawerCharts(); // o conteúdo antigo sai: seus canvases também
  document.getElementById("drawerBody").innerHTML = html;
  d.hidden = false;
  document.documentElement.classList.add("drawer-open"); // trava a rolagem da página por trás (iOS)
  d.querySelector(".drawer-box").scrollTop = 0;
  d.querySelector(".x").focus({ preventScroll: true });
  // gráficos só depois que a janela tem tamanho (no iOS o canvas criado antes do layout fica em branco)
  if (after) requestAnimationFrame(() => requestAnimationFrame(after));
}

export function closeDrawer() {
  document.getElementById("drawer").hidden = true;
  document.documentElement.classList.remove("drawer-open");
  destroyDrawerCharts();
}

let drawerCharts = [];

/** Redesenha todos os gráficos vivos (tela e painel), sem animação. */
export function refreshCharts() {
  drawerCharts = drawerCharts.filter((c) => c.canvas);
  for (const c of [...state.charts, ...drawerCharts]) {
    try {
      c.resize();
      c.update("none");
    } catch {
      /* gráfico já destruído */
    }
  }
}

function destroyDrawerCharts() {
  drawerCharts.forEach(kill);
  drawerCharts = [];
}

export function drawerChart(id, cfg) {
  const el = document.getElementById(id);
  // um gráfico por canvas: o anterior (troca de janela) sai e libera memória
  const old = el && typeof Chart !== "undefined" ? Chart.getChart?.(el) : null;
  if (old) {
    drawerCharts = drawerCharts.filter((x) => x !== old);
    old.destroy();
  }
  // sem animação no painel: ele entra deslizando e o iOS às vezes não termina o primeiro quadro
  cfg.options = { animation: false, ...cfg.options };
  const c = mkChart(el, cfg);
  if (c) {
    state.charts.pop();
    drawerCharts.push(c);
    // depois da animação de entrada do painel (0,4 s), mede de novo o tamanho real
    setTimeout(() => {
      if (c.canvas) {
        c.resize();
        c.update("none");
      }
    }, 450);
  }
  return c;
}
