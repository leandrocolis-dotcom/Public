// Campeões dos setores (docs/ROADMAP-CAMPEOES.md): lista fixa 🏆 da aba Sinais de hoje, revista todo mês por
// scripts/champions.mjs (qualidade + tendência, todas as bolsas dos EUA, com folga para entrar e sair).
// Aqui só lemos data/champions.json e mostramos quem está, quem entrou e quem saiu. Material educacional.
import { dateBR, esc, pct } from "./format.js";
import { fetchJSON } from "./net.js";
import { SECTORS } from "./sectors.js";
import { hq } from "./help.js";

const TTL = 30 * 60_000;
export const champ = { data: null, at: 0, loading: null };

export const SECTOR_PT = {
  "Basic Materials": "Materiais",
  "Communication Services": "Comunicação",
  "Consumer Cyclical": "Consumo discricionário",
  "Consumer Defensive": "Consumo básico",
  Energy: "Energia",
  "Financial Services": "Financeiro",
  Healthcare: "Saúde",
  Industrials: "Industrial",
  "Real Estate": "Imobiliário",
  Technology: "Tecnologia",
  Utilities: "Utilities",
};
const sec = (s) => SECTOR_PT[s] ?? s;

/** Busca o JSON (no máximo a cada 30 min). Devolve os dados ou null. */
export async function loadChampions(force = false) {
  if (champ.loading) return champ.loading;
  if (!force && champ.data && Date.now() - champ.at < TTL) return champ.data;
  champ.loading = fetchJSON(`data/champions.json?t=${Date.now()}`)
    .then((d) => (champ.data = d))
    .catch(() => champ.data)
    .finally(() => {
      champ.at = Date.now();
      champ.loading = null;
    });
  return champ.loading;
}

export const champSyms = (d = champ.data) => (d?.members ?? []).map((m) => m.s);

/** Tipo e rótulo de cada ticker da lista do usuário (assets/sectors.js; vale o primeiro rótulo em que aparece). */
export const KIND_OF = {};
for (const sct of SECTORS)
  for (const [k, l] of [
    ["SINGLE", sct.single],
    ["ETF", sct.etf],
    ["LEV", sct.lev],
    ["INV", sct.inv],
  ])
    for (const t of l) KIND_OF[t] ??= { kind: k, label: sct.id };
const USER_LIST = [...new Set(SECTORS.flatMap((sct) => sct.syms))];

export const CHAMP_FILTERS = [
  ["all", "Todos"],
  ["SINGLE", "Ações"],
  ["ETF", "ETFs"],
  ["LEV", "Alavancados"],
  ["INV", "Inversos"],
  ["model", "🏆 Do modelo"],
];

/** Tickers da lista 🏆: a lista inteira do usuário + campeões do modelo que não estão nela, com o filtro de tipo. */
export function champListSyms(filter = "all", d = champ.data) {
  const model = champSyms(d);
  const all = [...USER_LIST, ...model.filter((s) => !KIND_OF[s])];
  if (filter === "model") return model;
  if (KIND_OF_FILTER.has(filter))
    return all.filter((s) => (KIND_OF[s]?.kind ?? "SINGLE") === filter);
  return all;
}
const KIND_OF_FILTER = new Set(["SINGLE", "ETF", "LEV", "INV"]);

/** Contagem por filtro (para os botões). */
export function champCounts(d = champ.data) {
  return Object.fromEntries(CHAMP_FILTERS.map(([k]) => [k, champListSyms(k, d).length]));
}

/** Botões de tipo dentro da lista 🏆. */
export function champFilterHtml(cur = "all", d = champ.data) {
  const n = champCounts(d);
  return `<div class="seg desk-lists" role="tablist" aria-label="Tipo de ativo">${CHAMP_FILTERS.map(([k, l]) => `<button class="${k === cur ? "on" : ""}" data-champ-filter="${k}" aria-pressed="${k === cur}">${l} <span class="muted small">${n[k]}</span></button>`).join("")}</div>`; // prettier-ignore
}

/** Marca da linha: tipo (ETF/LEV/INV) e 🏆 se o modelo escolheu. */
export function champTag(sym, d = champ.data) {
  const k = KIND_OF[sym]?.kind;
  const kind = k && k !== "SINGLE" ? ` <span class="tag ${k === "LEV" ? "wait" : k === "INV" ? "sell" : ""} small">${k}</span>` : ""; // prettier-ignore
  const m = d?.members?.find((x) => x.s === sym);
  return `${kind}${m ? ` <span class="tag buy small" title="Campeão do modelo: ${esc(sec(m.sector))}, ${m.rank}º do setor">🏆</span>` : ""}`; // prettier-ignore
}

/** Cartão no topo da lista 🏆: revisão, entradas, saídas, próximos da fila e as regras em uma linha. */
export function champCardHtml(d = champ.data) {
  if (!d?.members)
    return `<div class="card"><p class="muted">Carregando a lista de campeões…</p></div>`;
  const first = (d.history ?? []).length <= 1;
  const chip = (x, cls) =>
    `<span class="tag ${cls}" title="${esc(x.why ?? "")}">${esc(x.s)}</span>`;
  const ins = d.entering ?? [];
  const outs = d.leaving ?? [];
  const bySec = {};
  d.members.forEach((m) => (bySec[m.sector] ||= []).push(m));
  const secRows = Object.entries(bySec)
    .map(
      ([s, l]) =>
        `<li><b>${esc(sec(s))}:</b> ${l.map((m) => `<span class="tk" title="${esc(`${m.name} · ${m.industry} · qualidade ${Math.round(m.Q)}, tendência ${Math.round(m.T)}`)}">${esc(m.s)}</span>`).join(" ")}</li>`,
    ) // prettier-ignore
    .join("");
  const outList = outs.length
    ? `<ul class="small">${outs.map((x) => `<li><span class="tk">${esc(x.s)}</span> ${esc(x.why)}${x.since ? ` <span class="muted">(desde ${esc(dateBR(x.since))})</span>` : ""}</li>`).join("")}</ul>` // prettier-ignore
    : `<span class="muted small">ninguém</span>`;
  return `<div class="card champ-card" id="champCard"><h3>🏆 Modelo de campeões${hq("champ")} <span class="muted small">revisão de ${esc(dateBR(d.asOf))} · ${d.members.length} escolhidos · próxima no fim do mês</span></h3>
    <p class="small">${first ? "Primeira lista (foto do meio do mês). " : ""}<b>Entraram (${ins.length}):</b> ${ins.length ? (first ? "todos abaixo" : ins.map((x) => chip(x, "buy")).join(" ")) : '<span class="muted">ninguém</span>'}</p>
    <div class="small"><b>Saíram (${outs.length}):</b> ${outList}</div>
    <details><summary class="small">Por setor e fila de espera</summary><ul class="small">${secRows}</ul>
      <p class="small"><b>Próximos da fila:</b> ${(d.next ?? []).map((x) => `<span class="tk" title="${esc(`${x.name} · ${sec(x.sector)} · nota ${Math.round(x.score)}`)}">${esc(x.s)}</span>`).join(" ") || "–"}</p></details>
    <p class="note">Varredura de ${d.funnel?.screener ?? "?"} ações das bolsas dos EUA → ${d.funnel?.liquid ?? "?"} líquidas (≥ US$ 2 bi, ≥ US$ 20 mi/dia) → ${d.funnel?.eligible ?? "?"} com tendência (acima da MM200, MM50 > MM200) e qualidade (margem e caixa livre positivos). Nota = 50% qualidade (ROE, margens, crescimento, caixa, dívida) + 50% tendência, ambas comparadas dentro do setor. Entra quem é top 3 do setor; só sai se perder a tendência, a qualidade ou cair abaixo do 8º. A lista diz <b>o que acompanhar</b>; o momento de entrar vem da Decisão do trader e dos níveis abaixo. A parte de tendência sozinha não deu vantagem no estudo F35; a lista será medida fora da amostra. Material educacional; não é recomendação de investimento.</p></div>`;
}

/** Linha curta para a página do ativo (vazio se não é campeão). */
export function champBadge(sym, d = champ.data) {
  const m = d?.members?.find((x) => x.s === sym);
  if (!m) return "";
  return `<span class="tag buy" title="Revisão de ${esc(dateBR(d.asOf))}: ${esc(sec(m.sector))}, ${m.rank}º do setor (qualidade ${Math.round(m.Q)}, tendência ${Math.round(m.T)}); ${pct(m.dist200, 1)} da MM200">🏆 Campeão · ${esc(sec(m.sector))}</span>${hq("champ", { sym, Q: m.Q, T: m.T, rank: m.rank })}`;
}
