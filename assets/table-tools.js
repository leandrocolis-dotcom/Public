// Ordenação e filtro genéricos para tabelas marcadas com data-sortable="chave".
// Clique no cabeçalho ordena (maior primeiro; de novo, menor primeiro); a caixa acima filtra as linhas pelo texto.
// O estado fica por chave e é reaplicado a cada redesenho da página (a atualização automática refaz o HTML).
import { store } from "./state.js";

const KEY = "pendulo.tables";
const mem = store.get(KEY, {}); // { chave: { col, dir, q } }
const save = () => store.set(KEY, mem);
/** Filtros e ordenação vindos da nuvem (outro aparelho). */
export function reloadTables() {
  for (const k of Object.keys(mem)) delete mem[k];
  Object.assign(mem, store.get(KEY, {}));
}

/** Texto da célula -> número (pt-BR: "1.234,5%", "+3,2 p.p.", "US$ 1,2 bi", "−5") ou null. */
export function cellNumber(text) {
  const t = String(text ?? "")
    .replace(/−/g, "-")
    .trim();
  if (!t || /^[–—-]$/.test(t)) return null;
  const m = t.match(/[-+]?\d[\d.]*(?:,\d+)?/);
  if (!m) return null;
  let n = Number(m[0].replace(/\./g, "").replace(",", "."));
  if (!Number.isFinite(n)) return null;
  // sinal antes da moeda ("-US$ 96,42", "▾ −R$ 5"): o número em si vem sem sinal, mas é negativo
  if (!/^[-+]/.test(m[0]) && /-\s*(?:US\$|R\$|\$|€)\s*$/.test(t.slice(0, m.index))) n = -n;
  if (/\btri\b/.test(t)) n *= 1e12;
  else if (/\bbi\b/.test(t)) n *= 1e9;
  else if (/\bmi\b/.test(t)) n *= 1e6;
  else if (/\bmil\b/.test(t)) n *= 1e3;
  return n;
}

const fold = (s) =>
  String(s ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase();

/** Compara dois textos de célula: números primeiro, vazios ("–") sempre no fim. dir: 1 = maior primeiro. */
export function compareCells(a, b, dir = 1) {
  const x = cellNumber(a);
  const y = cellNumber(b);
  if (x !== null && y !== null) return dir * (y - x);
  if (x === null && y !== null && /^[–—-]?$/.test(String(a).trim())) return 1;
  if (y === null && x !== null && /^[–—-]?$/.test(String(b).trim())) return -1;
  return dir * fold(a).localeCompare(fold(b), "pt-BR");
}

/** Linha passa no filtro? (todas as palavras do filtro aparecem no texto da linha, sem acento e sem caixa) */
export const rowMatches = (text, q) =>
  !q ||
  fold(q)
    .split(/\s+/)
    .filter(Boolean)
    .every((w) => fold(text).includes(w));

function apply(table) {
  const k = table.dataset.sortable;
  const st = mem[k] ?? {};
  const body = table.tBodies[0];
  if (!body) return;
  const rows = [...body.rows];
  if (Number.isInteger(st.col)) {
    const txt = (r) => r.cells[st.col]?.innerText ?? r.cells[st.col]?.textContent ?? "";
    rows.sort((a, b) => compareCells(txt(a), txt(b), st.dir ?? 1));
    rows.forEach((r) => body.appendChild(r));
  }
  let shown = 0;
  for (const r of rows) {
    const ok = rowMatches(r.textContent, st.q);
    r.hidden = !ok;
    shown += ok;
  }
  [...(table.tHead?.rows[0]?.cells ?? [])].forEach((th, i) => {
    th.classList.add("sortable");
    th.setAttribute(
      "aria-sort",
      i === st.col ? (st.dir === -1 ? "ascending" : "descending") : "none",
    );
    th.classList.toggle("sorted", i === st.col);
    th.dataset.ttDir = i === st.col ? (st.dir === -1 ? "▲" : "▼") : "";
  });
  const info = table.closest(".tw")?.previousElementSibling?.querySelector?.(".tt-count");
  if (info) info.textContent = st.q ? `${shown} de ${rows.length}` : `${rows.length} linhas`;
}

/** Liga ordenação/filtro nas tabelas marcadas dentro de `root` (chamar depois de cada render). */
export function enhanceTables(root = document) {
  for (const table of root.querySelectorAll("table[data-sortable]")) {
    const wrap = table.closest(".tw") ?? table;
    const k = table.dataset.sortable;
    if (
      ((table.tBodies[0]?.rows.length ?? 0) >= 4 || "ttFilter" in table.dataset) &&
      !wrap.previousElementSibling?.classList?.contains("tt-bar")
    ) {
      wrap.insertAdjacentHTML(
        "beforebegin",
        `<div class="tt-bar" style="display:flex;gap:8px;align-items:center;margin:8px 0 6px"><input type="search" class="tt-filter" data-tt="${k}" placeholder="Filtrar…" aria-label="Filtrar tabela" value="${(mem[k]?.q ?? "").replace(/"/g, "&quot;")}" style="flex:1;max-width:260px"><span class="muted tt-count" style="font-size:.8rem"></span></div>`,
      );
    }
    apply(table);
  }
}

let bound = false;
/** Eventos (uma vez): clique no cabeçalho e digitação no filtro. */
export function initTableTools() {
  if (bound) return;
  bound = true;
  document.addEventListener("click", (e) => {
    const th = e.target.closest("table[data-sortable] thead th");
    if (!th) return;
    const table = th.closest("table");
    const k = table.dataset.sortable;
    const col = th.cellIndex;
    const st = (mem[k] ??= {});
    if (st.col === col && st.dir === -1) {
      delete st.col; // terceiro clique volta à ordem original
      delete st.dir;
    } else if (st.col === col) st.dir = -1;
    else Object.assign(st, { col, dir: 1 });
    save();
    apply(table);
    if (!Number.isInteger(st.col)) document.dispatchEvent(new CustomEvent("tt-reset"));
  });
  document.addEventListener("input", (e) => {
    const inp = e.target.closest?.(".tt-filter");
    if (!inp) return;
    (mem[inp.dataset.tt] ??= {}).q = inp.value;
    save();
    const table = document.querySelector(`table[data-sortable="${CSS.escape(inp.dataset.tt)}"]`);
    if (table) apply(table);
  });
}
