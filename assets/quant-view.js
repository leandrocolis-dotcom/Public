// Quant Aberto na aba Análise: notas do S&P 500 (estilo Seeking Alpha), carteira Top 20 do mês (estilo ProPicks),
// diário fora da amostra e calibração. Dados de data/quant*.json (cron diário). Cálculo em assets/quant.js.
import { FACTORS, evalJournal, healthLabel, ratingOf } from "./quant.js";
import { esc, num, pct } from "./format.js";
import { fetchJSON } from "./net.js";
import { hooks, state } from "./state.js";

export const qv = { data: null, journal: null, calib: null, at: 0, loading: false, sector: "", rating: "", q: "", more: 0 }; // prettier-ignore

/** Carrega os arquivos do Quant Aberto (no máximo a cada 30 min). */
let qvP = null; // carga em andamento: quem chamar junto espera a mesma
export function ensureQuant(force = false) {
  if (qvP) return qvP;
  if (!force && Date.now() - qv.at < 30 * 60000) return Promise.resolve();
  qvP = loadQuantFiles().finally(() => (qvP = null));
  return qvP;
}

async function loadQuantFiles() {
  qv.loading = true;
  qv.at = Date.now();
  const [d, j, c] = await Promise.allSettled([
    fetchJSON("data/quant.json"),
    fetchJSON("data/quant-journal.json"),
    fetchJSON("data/quant-calib.json"),
  ]);
  const v = (x) => (x.status === "fulfilled" ? x.value : null);
  qv.data = v(d) ?? qv.data;
  qv.journal = v(j) ?? qv.journal;
  qv.calib = v(c) ?? qv.calib;
  qv.loading = false;
  if (["analysis", "signals", "screener"].includes(state.prefs.tab)) hooks.render();
}

const KEYS = Object.keys(FACTORS);
const gtone = (g) => (!g ? "neutral" : /^A/.test(g) ? "buy" : /^B/.test(g) ? "buy" : /^C/.test(g) ? "wait" : "sell"); // prettier-ignore
const gtag = (g) => `<span class="tag ${gtone(g)} q-grade">${esc(g ?? "–")}</span>`;
const rtag = (r) => {
  const x = ratingOf(r.score);
  return x
    ? `<span class="tag ${x.tone}">${esc(x.label)}</span>${r.capped ? ' <span class="muted" title="Algum fator fraco demais: teto em Manter">⛔</span>' : ""}`
    : `<span class="tag neutral">Sem nota</span>`;
};
const PT_SECTOR = {
  "Information Technology": "Tecnologia",
  "Health Care": "Saúde",
  Financials: "Financeiro",
  "Consumer Discretionary": "Consumo discricionário",
  "Consumer Staples": "Consumo básico",
  "Communication Services": "Comunicação",
  Industrials: "Indústria",
  Energy: "Energia",
  Materials: "Materiais",
  Utilities: "Utilidades públicas",
  "Real Estate": "Imobiliário",
};
const sec = (s) => PT_SECTOR[s] ?? s ?? "–";

function row(r) {
  return `<tr class="click" data-q-sym="${esc(r.sym)}" tabindex="0">
    <td><b>${esc(r.sym)}</b> <span class="muted">${esc((r.name ?? "").slice(0, 26))}</span></td>
    <td class="num"><b>${num(r.score, 2)}</b></td><td>${rtag(r)}</td>
    ${KEYS.map((k) => `<td title="${FACTORS[k].label}: percentil ${r.f?.[k] ?? "–"} no setor">${gtag(r.g?.[k])}</td>`).join("")}
    <td class="muted">${esc(healthLabel(r.health) ?? "–")}</td>
    <td class="muted">${esc(sec(r.sector))}</td></tr>`;
}

const head = `<thead><tr><th>Ação</th><th class="num">Nota</th><th>Classificação</th>${KEYS.map((k) => `<th>${FACTORS[k].label}</th>`).join("")}<th>Saúde</th><th>Setor</th></tr></thead>`; // prettier-ignore

function journalHtml() {
  const months = qv.journal?.months ?? [];
  if (!months.length) return `<p class="muted">O diário começa na primeira coleta do mês.</p>`;
  const { months: res, summary: s } = evalJournal(months);
  if (!res.length)
    return `<p class="muted">Primeira foto em <b>${esc(months[0].d)}</b> (carteira e notas guardadas). O primeiro resultado sai na foto do mês seguinte. Critério (registrado antes): depois de 12 meses, a Top 20 precisa ganhar do SPY, o IC da nota precisa ser positivo com t ≥ 2 e o quintil de cima precisa render mais que o de baixo.</p>`;
  const body = res
    .map(
      (m) =>
        `<tr><td>${esc(m.from)} → ${esc(m.to)}</td><td class="num">${pct(m.top, 1)}</td><td class="num">${pct(m.spy, 1)}</td><td class="num">${pct(m.excess, 1)}</td><td class="num">${num(m.ic, 2)}</td><td class="num">${pct(m.spread, 1)}</td></tr>`,
    )
    .join("");
  return `<div class="tw"><table><thead><tr><th>Mês</th><th class="num">Top 20</th><th class="num">SPY</th><th class="num">Excesso</th><th class="num">IC</th><th class="num">Q5 − Q1</th></tr></thead><tbody>${body}</tbody></table></div>
    <p class="muted">${s.months} mês(es): Top 20 ${pct(s.topCum, 1)} × SPY ${pct(s.spyCum, 1)} · IC médio ${num(s.icMean, 2)} (t ${num(s.icT, 1)}) · veredito: <b>${esc(s.verdict)}</b>.</p>`;
}

function calibHtml() {
  const c = qv.calib;
  if (!c) return "";
  const rho = c.c3c4?.rho ?? {};
  return `<details class="q-calib"><summary><b>Como foi calibrado contra o Seeking Alpha</b></summary>
    <p class="muted">Foto pública do SA de ${esc(c.saDate)} (as mais novas são pagas), ${c.sample} ações: o site bloqueou o resto da coleta (proteção contra robôs), então a amostra é pequena. Concordância (Spearman) entre a nossa nota e a do SA por fator: ${KEYS.map((k) => `${FACTORS[k].label} ${num(rho[k], 2)}`).join(" · ")}; nota final ${num(c.c3c4?.rhoTotal, 2)}. Momentum é exato na data; os outros usam fundamentos de hoje (aproximação). Teto "Manter" confirmado: ${c.c2?.weakAbove35 ?? "–"} de ${c.c2?.weak ?? "–"} ações com fator fraco tinham nota ≥ 3,5. Regressão da nota do SA nos fatores: R² ${num(c.c1?.r2, 2)} (abaixo do critério de 0,6: os pesos a priori foram mantidos).</p></details>`;
}

/** Card do Quant Aberto no fim da aba Análise. */
export function quantCardHtml() {
  ensureQuant();
  const d = qv.data;
  if (!d)
    return `<div class="card" style="margin-top:var(--gap)"><h3>Quant Aberto (S&amp;P 500)</h3><p class="muted">${qv.loading ? "Carregando notas…" : "Notas ainda não publicadas."}</p></div>`;
  const by = Object.fromEntries(d.rows.map((r) => [r.sym, r]));
  const counts = {};
  for (const r of d.rows) {
    const l = ratingOf(r.score)?.label ?? "Sem nota";
    counts[l] = (counts[l] ?? 0) + 1;
  }
  const sectors = [...new Set(d.rows.map((r) => r.sector))].sort();
  const q = qv.q.trim().toUpperCase();
  const list = d.rows
    .filter(
      (r) =>
        (!qv.sector || r.sector === qv.sector) &&
        (!qv.rating || ratingOf(r.score)?.label === qv.rating) &&
        (!q || r.sym.startsWith(q) || (r.name ?? "").toUpperCase().includes(q)),
    ) // prettier-ignore
    .sort((a, b) => (b.score ?? -1) - (a.score ?? -1));
  const shown = list.slice(0, 30 + qv.more);
  const top = (d.top ?? []).map((s) => by[s]).filter(Boolean);
  const opt = (v, cur, l) =>
    `<option value="${esc(v)}"${v === cur ? " selected" : ""}>${esc(l)}</option>`;
  return `<div class="card q-card" style="margin-top:var(--gap)">
    <h3>Quant Aberto (S&amp;P 500)</h3>
    <p class="muted" style="margin:4px 0 8px">Réplica aberta das <b>notas quant do Seeking Alpha</b> (5 fatores comparados dentro do setor, notas A+ a F, nota 1–5) e da carteira <b>ProPicks</b> do InvestingPro (20 ações, pesos iguais, troca mensal), com dados públicos do Yahoo. Atualizado em ${esc(d.updated_at.slice(0, 10))} · ${d.n} ações.</p>
    <div style="display:flex;gap:6px;flex-wrap:wrap">${["Compra forte", "Compra", "Manter", "Venda", "Venda forte"].map((l) => `<span class="tag ${ratingOf(l === "Compra forte" ? 5 : l === "Compra" ? 4 : l === "Manter" ? 3 : l === "Venda" ? 2 : 1).tone}">${l}: ${counts[l] ?? 0}</span>`).join("")}</div>
    <h3 style="margin-top:14px">Carteira Top 20 do mês <span class="muted" style="font-size:.85rem">desde ${esc(d.topSince ?? "–")}</span></h3>
    <div class="tw"><table>${head}<tbody>${top.map(row).join("")}</tbody></table></div>
    <p class="note">Regra: nota ≥ 3,5, no máximo 4 por setor, uma classe de ação por empresa; quem já estava fica se seguir entre as 40 melhores. Troca na primeira coleta de cada mês.</p>
    <h3 style="margin-top:14px">Ranking</h3>
    <div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:8px">
      <input id="qSearch" placeholder="Ticker ou empresa" value="${esc(qv.q)}" style="flex:1;min-width:140px">
      <select id="qSector">${opt("", qv.sector, "Todos os setores")}${sectors.map((s) => opt(s, qv.sector, sec(s))).join("")}</select>
      <select id="qRating">${opt("", qv.rating, "Todas as classificações")}${["Compra forte", "Compra", "Manter", "Venda", "Venda forte"].map((l) => opt(l, qv.rating, l)).join("")}</select>
    </div>
    <div class="tw"><table>${head}<tbody>${shown.map(row).join("")}</tbody></table></div>
    ${list.length > shown.length ? `<button class="btn ghost" data-q-act="more" style="margin-top:8px">Mostrar mais (${list.length - shown.length})</button>` : ""}
    <h3 style="margin-top:14px">Diário fora da amostra</h3>
    ${journalHtml()}
    ${calibHtml()}
    <p class="note">Como a nota é feita: cada métrica vira percentil dentro do setor GICS; o fator é a média das métricas, de novo em percentil (letra A+ … F). Momentum = retorno de 3, 6, 9 e 12 meses (como o SA). Nota final = média ponderada (momentum 25%, revisões 25%, rentabilidade 20%, valor 15%, crescimento 15%) em percentil no universo, de 1 a 5; quem tem crescimento, momentum ou revisões ≤ D+, ou valor ou rentabilidade ≤ D−, fica no máximo em Manter. Saúde = média de valor, crescimento, rentabilidade, momentum e fluxo de caixa (aproximação do "Financial Health"). Clique numa ação para a análise completa. A nota entra na Decisão do trader como uma das partes (peso 15%); a carteira Top 20 e o diário seguem em observação. Material educacional; não é recomendação de investimento.</p>
  </div>`;
}

/** Bloco de notas quant no detalhe de uma ação (vazio se ela não está no S&P 500). */
export function quantDetailHtml(sym) {
  ensureQuant();
  const r = qv.data?.rows?.find((x) => x.sym === sym);
  if (!r) return "";
  const inTop = (qv.data.top ?? []).includes(sym);
  return `<div class="card"><h3>Quant Aberto${inTop ? ' <span class="tag buy">Top 20 do mês</span>' : ""}</h3>
    <div style="display:flex;gap:10px;align-items:center;flex-wrap:wrap"><span style="font-size:1.6rem;font-weight:700;font-family:var(--mono)">${num(r.score, 2)}</span>${rtag(r)}<span class="muted">Saúde ${esc(healthLabel(r.health) ?? "–")} · ${esc(sec(r.sector))}</span></div>
    <div class="kv" style="margin-top:8px">${KEYS.map((k) => `<div><span>${FACTORS[k].label}</span><b>${gtag(r.g?.[k])} <span class="muted">p${r.f?.[k] ?? "–"}</span></b></div>`).join("")}</div>
    <p class="note">Percentil (p) dentro do setor. Estilo das notas quant do Seeking Alpha, com dados públicos. Material educacional.</p></div>`;
}

/** Filtros e cliques (ligados uma vez). `open(sym)` abre a análise completa. */
export function initQuant(open) {
  document.addEventListener("input", (e) => {
    if (e.target.id === "qSearch") {
      qv.q = e.target.value;
      qv.more = 0;
      hooks.render();
      const el = document.getElementById("qSearch");
      el?.focus();
      el?.setSelectionRange(el.value.length, el.value.length);
    }
  });
  document.addEventListener("change", (e) => {
    if (e.target.id === "qSector" || e.target.id === "qRating") {
      qv[e.target.id === "qSector" ? "sector" : "rating"] = e.target.value;
      qv.more = 0;
      hooks.render();
    }
  });
  document.addEventListener("click", (e) => {
    const t = e.target.closest("[data-q-sym],[data-q-act]");
    if (!t) return;
    if (t.dataset.qAct === "more") {
      qv.more += 50;
      return hooks.render();
    }
    if (t.dataset.qSym) open(t.dataset.qSym);
  });
  document.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && e.target.dataset?.qSym) open(e.target.dataset.qSym);
  });
}

/** Linha do Quant Aberto de um ticker e o rótulo da nota (para a Decisão do trader). [] se não houver. */
let qIndex = null;
export function quantOf(sym) {
  if (!qv.data?.rows) return [];
  if (qIndex?.d !== qv.data)
    qIndex = { d: qv.data, m: new Map(qv.data.rows.map((r) => [r.sym, r])) };
  const r = qIndex.m.get(sym);
  return r ? [r, ratingOf(r.score)?.label ?? null] : [];
}
