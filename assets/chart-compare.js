// Comparação no gráfico do ativo: o usuário pesquisa outros tickers e eles entram como linhas no mesmo gráfico.
// Com comparação ativa, a escala vira % desde a primeira barra visível (todas as linhas partem de 0%).
// compareLine é puro (testado); o resto é DOM.
import { esc } from "./format.js";
import { savePrefs, state } from "./state.js";

export const MAX_COMPARE = 5;
const SYM_RE = /^\^?[A-Z0-9][A-Z0-9.\-=^]{0,14}$/;

/** Normaliza o texto digitado em ticker (ou null). */
export const cleanSym = (s) => {
  const t = String(s ?? "")
    .trim()
    .toUpperCase()
    .split(/\s/)[0];
  return SYM_RE.test(t) ? t : null;
};

/** Pontos {time, value} do ativo comparado, só nas datas do gráfico principal. Puro. */
export function compareLine(mainTimes, hist) {
  if (!hist?.dates?.length) return [];
  const byDate = new Map(hist.dates.map((d, i) => [d, hist.close[i]]));
  return mainTimes
    .map((t) => ({ time: t, value: byDate.get(t) }))
    .filter((p) => p.value != null && Number.isFinite(p.value));
}

/** Adiciona/remove da lista salva (máx. 5, sem repetir nem o próprio ativo). Puro. */
export function toggleCompare(list, sym, self) {
  const cur = list ?? [];
  if (!sym || sym === self) return cur;
  if (cur.includes(sym)) return cur.filter((x) => x !== sym);
  return cur.length >= MAX_COMPARE ? cur : [...cur, sym];
}

const cache = new Map(); // SYM -> Promise<{dates, close, name}|null>
const loadHist = (sym) => {
  if (!cache.has(sym))
    cache.set(
      sym,
      fetch(`api/history?symbols=${encodeURIComponent(sym)}&range=2y`)
        .then((r) => (r.ok ? r.json() : null))
        .then((j) => j?.series?.[sym] ?? null)
        .catch(() => {
          cache.delete(sym);
          return null;
        }),
    );
  return cache.get(sym);
};

const COLORS = ["#e8a33d", "#3fa7d6", "#c86dd7", "#59c27a", "#e5677a"];
export const compareList = () => state.prefs.compare ?? [];

/**
 * Barra de comparação + linhas extras no gráfico pro (só no diário).
 * `handle` = retorno de mountPro; `data` = proSeries; `self` = ativo aberto.
 */
export function attachCompare(box, handle, data, self, remount) {
  const LW = globalThis.LightweightCharts;
  if (!LW || !handle || data.intraday) return;
  const bar = document.createElement("div");
  bar.className = "cmp-bar";
  const list = compareList().filter((s) => s !== self);
  bar.innerHTML = `<input class="cmp-input" list="cmpList" placeholder="Comparar com… (ex.: SPY)" aria-label="Pesquisar ativo para comparar" maxlength="24">
    <datalist id="cmpList"></datalist>
    <button class="btn" data-cmp-add>Adicionar</button>
    ${list.map((s, i) => `<span class="cmp-chip" style="--c:${COLORS[i % COLORS.length]}">${esc(s)} <button data-cmp-del="${esc(s)}" aria-label="Remover ${esc(s)}">×</button></span>`).join("")}
    ${list.length ? `<span class="cmp-note">Escala em % desde a 1ª barra visível</span>` : ""}`;
  const legend = box.previousElementSibling?.classList.contains("pro-legend") ? box.previousElementSibling : box; // prettier-ignore
  box.parentElement?.insertBefore(bar, legend);
  const input = bar.querySelector("input");
  const dl = bar.querySelector("datalist");
  let timer = null;
  input.addEventListener("input", () => {
    clearTimeout(timer);
    const q = input.value.trim();
    if (q.length < 1) return;
    timer = setTimeout(() => {
      fetch(`api/search?q=${encodeURIComponent(q)}`)
        .then((r) => (r.ok ? r.json() : { items: [] }))
        .then((j) => {
          dl.innerHTML = (j.items ?? [])
            .slice(0, 8)
            .map((x) => `<option value="${esc(x.symbol)}">${esc(x.name ?? "")}</option>`)
            .join("");
        })
        .catch(() => {});
    }, 250);
  });
  const save = (next) => {
    state.prefs.compare = next;
    savePrefs();
    bar.remove();
    remount();
  };
  const add = () => {
    const s = cleanSym(input.value);
    if (s) save(toggleCompare(compareList(), s, self));
  };
  bar.querySelector("[data-cmp-add]").addEventListener("click", add);
  input.addEventListener("keydown", (e) => e.key === "Enter" && add());
  bar
    .querySelectorAll("[data-cmp-del]")
    .forEach((b) =>
      b.addEventListener("click", () => save(compareList().filter((x) => x !== b.dataset.cmpDel))),
    );
  const prevDestroy = handle.destroy;
  handle.destroy = () => {
    bar.remove();
    prevDestroy();
  };
  if (!list.length) return;

  // % desde a 1ª barra visível: a própria escala da biblioteca faz o cálculo e acompanha o zoom.
  handle.chart.priceScale("right").applyOptions({ mode: LW.PriceScaleMode.Percentage });
  const times = data.candles.map((b) => b.time);
  list.forEach((sym, i) =>
    loadHist(sym).then((h) => {
      if (!box.isConnected) return;
      const pts = compareLine(times, h);
      const chip = bar.querySelector(`[data-cmp-del="${CSS.escape(sym)}"]`)?.parentElement;
      if (!pts.length) {
        chip?.classList.add("cmp-missing");
        chip?.setAttribute("title", "Sem histórico para este ticker");
        return;
      }
      const s = handle.chart.addLineSeries({
        color: COLORS[i % COLORS.length],
        lineWidth: 2,
        priceLineVisible: false,
        title: sym,
      });
      s.setData(pts);
      handle.extra?.push({ name: sym, color: COLORS[i % COLORS.length], at: new Map(pts.map((x) => [x.time, x.value])) }); // prettier-ignore
      handle.refreshLegend?.();
    }),
  );
}
