// Gatilhos › Scanner de volatilidade: filtros rápidos em σ, grupo, faixa de RSI e ordenação sobre o universo do app.
import { esc, num } from "./format.js";
import { PRESETS, SCAN, SORTS, groupsOf, presetCounts, screen } from "./screener.js";

const zc = (x) =>
  x == null || !Number.isFinite(x)
    ? "–"
    : `<span class="${Math.abs(x) >= 2 ? (x > 0 ? "up" : "down") : ""}">${x >= 0 ? "+" : "−"}${num(Math.abs(x), 1)}σ</span>`;
const pc = (x) =>
  x == null || !Number.isFinite(x)
    ? "–"
    : `<span class="${x >= 0 ? "up" : "down"}">${x >= 0 ? "+" : "−"}${num(Math.abs(x) * 100, 1)}%</span>`;

/** ctx: { assets, f } com f = { preset, group, rsiMin, rsiMax, sort, dir } */
export function viewScreener({ assets, f, progress }) {
  if (!assets?.some((a) => a.ok))
    return `<div class="card empty">Carregando o universo de mercado (${progress?.have ?? 0} de ${progress?.n ?? "…"} ativos)…</div>`;
  const counts = presetCounts(assets);
  const list = screen(assets, f);
  const presets = SCAN.map((k) => [k, PRESETS[k]])
    .map(([k, p]) => `<button data-scr="preset" data-val="${k}" aria-pressed="${(f.preset ?? "all") === k}">${esc(p.label)} <span class="muted">${counts[k]}</span></button>`)
    .join(""); // prettier-ignore
  const groups = groupsOf(assets)
    .map((g) => `<option ${g === (f.group ?? "Todos") ? "selected" : ""}>${esc(g)}</option>`)
    .join("");
  const sorts = Object.entries(SORTS)
    .map(([k, s]) => `<option value="${k}" ${k === (f.sort ?? "absZ") ? "selected" : ""}>${esc(s.label)}</option>`)
    .join(""); // prettier-ignore
  const rows = list
    .map(
      (a) => `<tr><td><button class="linklike" data-sr-open="${esc(a.code)}">${esc(a.code)}</button></td><td>${esc(a.name)}</td><td class="muted">${esc(a.group)}</td>
      <td class="num">${num(a.price, 2)}</td><td class="num">${pc(a.r1d)}</td><td class="num">${zc(a.z1)}</td><td class="num">${a.vol20 ? `${num(a.vol20 * 100, 1)}%` : "–"}</td><td class="num">${zc(a.rangeZ)}</td>
      <td class="num">${zc(a.stretch)}</td><td class="num">${a.relVol ? `${num(a.relVol, 1)}x` : "–"}</td><td class="num">${pc(a.r5d)}</td><td class="num">${num(a.rsi, 0)}</td><td class="num">${pc(a.price / a.ma200 - 1)}</td></tr>`,
    )
    .join(""); // prettier-ignore
  return `<section class="card"><h2>Scanner de volatilidade</h2>
    <div class="scr-presets seg" role="group" aria-label="Filtro rápido">${presets}</div>
    <div class="scr-controls">
      <label>Grupo <select data-scr-in="group">${groups}</select></label>
      <label>RSI de <input data-scr-in="rsiMin" type="number" min="0" max="100" step="1" value="${f.rsiMin ?? ""}" placeholder="0"/></label>
      <label>até <input data-scr-in="rsiMax" type="number" min="0" max="100" step="1" value="${f.rsiMax ?? ""}" placeholder="100"/></label>
      <label>Ordenar <select data-scr-in="sort">${sorts}</select></label>
      <button class="btn ghost" data-scr="dir" data-val="${f.dir === "asc" ? "desc" : "asc"}">${f.dir === "asc" ? "↑ crescente" : "↓ decrescente"}</button>
      <button class="btn ghost" data-scr="reset">Limpar</button>
    </div>
    <p class="muted">${list.length} de ${assets.filter((a) => a.ok).length} ativos${progress?.loading ? ` (carregando: ${progress.have} de ${progress.n})` : ""}. σ = oscilação diária típica do próprio ativo (20 pregões): “+2,5σ” é um dia 2,5 vezes maior que o normal dele, o que compara ações calmas com alavancados. Amplitude = máxima − mínima do dia. Universo: S&P 500, rótulos de setores e campeões, com preço ao vivo. Filtros ⚡ = intraday. Isto acha volatilidade; não é gatilho de entrada (veja Agora). Comando: SCAN (Ctrl+K).</p>
    <div class="table-wrap"><table class="cal-table scr-table"><thead><tr><th>Código</th><th>Nome</th><th>Grupo</th><th>Preço</th><th>Dia</th><th>Dia σ</th><th>σ diário</th><th>Amplitude σ</th><th>vs MM20 σ</th><th>Vol./média</th><th>5D</th><th>RSI</th><th>vs MM200</th></tr></thead>
    <tbody>${rows || `<tr><td colspan="13" class="muted">Nenhum ativo passa nesse filtro.</td></tr>`}</tbody></table></div>
  </section>`;
}

/** Eventos da aba (instalados uma vez): grava o filtro nas preferências e redesenha. */
export function initScreener({ state, savePrefs, render }) {
  const set = (patch) => {
    state.prefs.scr = { ...(state.prefs.scr ?? {}), ...patch };
    savePrefs();
    render();
  };
  document.addEventListener("click", (e) => {
    const b = e.target.closest("[data-scr]");
    if (!b) return;
    const k = b.dataset.scr;
    if (k === "reset") {
      state.prefs.scr = {};
      savePrefs();
      return render();
    }
    set({ [k]: b.dataset.val });
  });
  document.addEventListener("change", (e) => {
    const el = e.target.closest("[data-scr-in]");
    if (!el) return;
    const k = el.dataset.scrIn;
    const v =
      k === "rsiMin" || k === "rsiMax" ? (el.value === "" ? null : Number(el.value)) : el.value;
    set({ [k]: v });
  });
}
