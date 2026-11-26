// Aba Mesa (estilo Bloomberg Launchpad): até 4 painéis lado a lado, cada um com uma aba do app.
// Só abas sem gráfico próprio (canvas) entram, para não duplicar gráficos nem ids na mesma página.
import { esc } from "./format.js";

export const MESA_OPTIONS = [
  ["portfolio", "Carteira"],
  ["news", "Notícias Offshore"],
  ["calendar", "Agenda Offshore"],
  ["brnews", "Notícias Onshore"],
  ["brcal", "Agenda Onshore"],
  ["risk", "Risco"],
  ["screener", "Screener"],
  ["signals", "Sinais de hoje"],
  ["checks", "Verificação"],
];
export const MESA_DEFAULT = ["portfolio", "news", "calendar", "risk"];
const VALID = new Set(MESA_OPTIONS.map((o) => o[0]));

/** Normaliza a escolha salva: 1 a 4 painéis válidos (padrão quando vazio). */
export function mesaPanels(saved) {
  const p = (Array.isArray(saved) ? saved : []).filter((x) => VALID.has(x)).slice(0, 4);
  return p.length ? p : [...MESA_DEFAULT];
}

/** render(id) devolve o HTML da aba. */
export function viewMesa(saved, render) {
  const panels = mesaPanels(saved);
  const box = (id, i) => {
    const sel = MESA_OPTIONS.map(([v, l]) => `<option value="${v}" ${v === id ? "selected" : ""}>${esc(l)}</option>`).join(""); // prettier-ignore
    let body;
    try {
      body = render(id);
    } catch {
      body = `<div class="card empty">Painel indisponível agora.</div>`;
    }
    return `<section class="mesa-panel"><header class="mesa-head">
      <select data-mesa-i="${i}" aria-label="Conteúdo do painel ${i + 1}">${sel}</select>
      <button class="btn ghost small" data-tab="${id}" title="Abrir em tela cheia">⤢</button>
      ${panels.length > 1 ? `<button class="btn ghost small" data-mesa-del="${i}" title="Remover painel">✕</button>` : ""}
    </header><div class="mesa-body">${body}</div></section>`;
  };
  return `<div class="mesa-bar"><span class="muted">Mesa: ${panels.length} painéis. Troque o conteúdo de cada um no seletor; ⤢ abre em tela cheia.</span>
    ${panels.length < 4 ? `<button class="btn" data-mesa-add>＋ Painel</button>` : ""}
    <button class="btn ghost" data-mesa-reset>Padrão</button></div>
    <div class="mesa-grid n${panels.length}">${panels.map(box).join("")}</div>`;
}

export function initMesa({ state, savePrefs, render }) {
  const save = (p) => {
    state.prefs.mesa = p;
    savePrefs();
    render();
  };
  document.addEventListener("change", (e) => {
    const s = e.target.closest("[data-mesa-i]");
    if (!s) return;
    const p = mesaPanels(state.prefs.mesa);
    p[Number(s.dataset.mesaI)] = s.value;
    save(p);
  });
  document.addEventListener("click", (e) => {
    if (e.target.closest("[data-mesa-reset]")) return save([...MESA_DEFAULT]);
    if (e.target.closest("[data-mesa-add]")) {
      const p = mesaPanels(state.prefs.mesa);
      const next = MESA_OPTIONS.find(([v]) => !p.includes(v))?.[0] ?? "news";
      return save([...p, next].slice(0, 4));
    }
    const d = e.target.closest("[data-mesa-del]");
    if (d) {
      const p = mesaPanels(state.prefs.mesa);
      p.splice(Number(d.dataset.mesaDel), 1);
      save(p);
    }
  });
}
