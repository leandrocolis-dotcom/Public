// Pesos dos pilares (estudo diário scripts/pillar-study.mjs → data/pillar-weights.json): a equação Y = … de cada
// universo, com o t de cada pilar e o teste fora da amostra. Só exibição (modo sombra); a nota não muda sozinha.
import { esc, num, pct } from "./format.js";
import { fetchJSON } from "./net.js";
import { hooks, state } from "./state.js";

export const pillars = { data: null, at: 0, loading: null };

export function loadPillars() {
  if (pillars.loading || Date.now() - pillars.at < 30 * 60e3) return pillars.loading;
  pillars.loading = fetchJSON(`data/pillar-weights.json?t=${Date.now()}`)
    .then((d) => (pillars.data = d))
    .catch(() => null)
    .finally(() => {
      pillars.at = Date.now();
      pillars.loading = null;
      if (state.prefs.tab === "sim") hooks.render();
    });
  return pillars.loading;
}

const U = {
  acoes: "Ações do S&P 500 (com fundamentos)",
  todos: "Todos os ativos (só preço)",
  etfs: "ETFs",
};
const bps = (b) => `${b >= 0 ? "+" : "−"}${num(Math.abs(b * 1e4), 0)}`;

function modelHtml(d, m) {
  const keys = Object.keys(m.coef);
  const eq = keys.map((k) => `<span class="${m.weight[k] ? (m.coef[k].b > 0 ? "pos" : "neg") : "muted"}">${bps(m.coef[k].b)}·z<sub>${esc(k)}</sub></span>`).join(" "); // prettier-ignore
  const rows = keys
    .map(
      (k) =>
        `<tr><td>${esc(d.pillars[k] ?? k)}</td><td class="num">${bps(m.coef[k].b)}</td><td class="num">${num(m.coef[k].t, 2)}</td><td class="num">${pct(m.coef[k].pos, 0).replace("+", "")}</td><td class="num"><b>${m.weight[k] ? pct(m.weight[k], 0) : "0"}</b></td></tr>`,
    )
    .join("");
  const o = m.oos;
  return `<h3>${esc(U[m.u] ?? m.u)} · ${m.h} pregões</h3>
    <p class="mono" style="font-size:.85rem">Y = ${eq}</p>
    <div class="tw" style="box-shadow:none"><table><thead><tr><th>Pilar</th><th class="num">Coef. (bps por 1σ)</th><th class="num">t</th><th class="num">Dias a favor</th><th class="num">Peso</th></tr></thead><tbody>${rows}</tbody></table></div>
    <p class="note">${m.days} pregões (${esc(m.from)} a ${esc(m.to)}), ~${m.avgN} ativos por dia. Fora da amostra (${o.days} pregões finais): correlação nota × retorno (IC) ${num(o.ic, 3)} (t ${num(o.icT, 2)}), IC positivo em ${pct(o.hitDays, 0).replace("+", "")} dos dias, 20% melhores − 20% piores ${pct(o.spreadTopBottom, 2)} em ${m.h} pregões. ${Math.abs(o.icT) < 2 ? "<b>Sem significância fora da amostra:</b> os pesos ainda não provam vantagem." : "Vantagem significativa fora da amostra."}</p>`;
}

export function pillarStudyHtml() {
  loadPillars();
  const d = pillars.data;
  if (!d) return `<section class="card" style="margin-top:12px"><h2>⚖️ Pesos dos pilares</h2><p class="muted">Carregando o estudo…</p></section>`; // prettier-ignore
  const pick = ["acoes|21", "todos|21", "etfs|21", "acoes|5", "todos|5", "etfs|5"].map((k) => d.models[k]).filter(Boolean); // prettier-ignore
  return `<section class="card" style="margin-top:12px"><h2>⚖️ Pesos dos pilares (teste múltiplo diário)</h2>
    <p>${num(d.tests, 0)} testes: uma regressão por pregão, horizonte e universo, em ${d.assets} ativos e ~2 anos. Cada pilar vira um z-score no dia (1σ = um desvio-padrão acima da média dos ativos); o coeficiente diz quantos pontos-base de retorno em excesso aquele pilar entregou em média. O <b>peso</b> só conta pilares com sinal estável (|t| ≥ 1,5), proporcional ao coeficiente; peso negativo = o pilar funcionou ao contrário.</p>
    ${pick
      .slice(0, 3)
      .map((m) => modelHtml(d, m))
      .join("")}
    <details><summary>Horizonte de 5 pregões</summary>${pick
      .slice(3)
      .map((m) => modelHtml(d, m))
      .join("")}</details>
    <p class="note">Ainda sem histórico por data: ${Object.entries(d.missing)
      .map(([k, v]) => `<b>${esc(k)}</b> (${esc(v)})`)
      .join(
        "; ",
      )}. Fundamentos por data: LPA trimestral/anual do Yahoo, válido 45/75 dias depois do fechamento do período. Recalculado todo pregão (${esc(new Date(d.updated_at).toLocaleString("pt-BR"))}). Modo sombra: não muda a nota da Análise sem sua ordem. Sem custos. Material educacional.</p></section>`;
}

// ───────── backtest do modelo novo (scripts/model-backtest.mjs → data/model-backtest.json) ─────────
export const mbt = { data: null, at: 0, loading: null };
function loadBt() {
  if (mbt.loading || Date.now() - mbt.at < 30 * 60e3) return;
  mbt.loading = fetchJSON(`data/model-backtest.json?t=${Date.now()}`)
    .then((d) => (mbt.data = d))
    .catch(() => null)
    .finally(() => {
      mbt.at = Date.now();
      mbt.loading = null;
      if (state.prefs.tab === "sim") hooks.render();
    });
}

export function modelBacktestHtml() {
  loadBt();
  const d = mbt.data;
  if (!d) return "";
  const c = (s) =>
    s?.n >= 30
      ? `<td class="num ${s.avg >= 0 ? "pos" : "neg"}">${pct(s.avg, 2)}</td><td class="num">${pct(s.hit, 0).replace("+", "")}</td><td class="num">${num(s.t, 2)}</td><td class="num muted">${num(s.n, 0)}</td>`
      : `<td colspan="4" class="muted">amostra pequena</td>`;
  const rows = d.table.map((r) => `<tr><td>${esc(r.label)}</td>${c(r.all[21])}${c(r.oos[21])}</tr>`).join(""); // prettier-ignore
  return `<section class="card" style="margin-top:12px"><h2>🧪 Backtest do modelo novo (${num(d.sims, 0)} simulações)</h2>
    <p>Cada gatilho de entrada, em cada ativo (${d.assets}) e pregão de ${esc(d.from)} a ${esc(d.to)}, com o contexto que se sabia <b>naquele dia</b>: técnica, S&P × MM200, regime macro (dado do FRED com 1 mês de atraso), inclinação do setor no regime (só meses anteriores) e estresse de crédito. Retorno em 21 pregões <b>acima do SPY</b>.</p>
    <div class="tw" style="box-shadow:none"><table><thead><tr><th rowspan="2">Filtro</th><th colspan="4">Período todo</th><th colspan="4">Fora da amostra (desde ${esc(d.cut)})</th></tr><tr><th class="num">Média</th><th class="num">Acerto</th><th class="num">t</th><th class="num">n</th><th class="num">Média</th><th class="num">Acerto</th><th class="num">t</th><th class="num">n</th></tr></thead><tbody>${rows}</tbody></table></div>
    <p class="note">t por dia (gatilhos do mesmo dia andam juntos), sem sobreposição. Sem custos. O modelo não cria vantagem própria: o ganho está em <b>descartar</b> os gatilhos que historicamente perdem para o SPY. Material educacional.</p></section>`;
}

// ───────── backtest da nota Quant Aberto (scripts/quant-backtest.mjs → data/quant-backtest.json) ─────────
export const qbt = { data: null, at: 0, loading: null };
function loadQbt() {
  if (qbt.loading || Date.now() - qbt.at < 30 * 60e3) return;
  qbt.loading = fetchJSON(`data/quant-backtest.json?t=${Date.now()}`)
    .then((d) => (qbt.data = d))
    .catch(() => null)
    .finally(() => {
      qbt.at = Date.now();
      qbt.loading = null;
      if (state.prefs.tab === "sim") hooks.render();
    });
}

const FL = {
  value: "Valor",
  growth: "Crescimento",
  profit: "Rentabilidade",
  mom: "Momentum",
  rev: "Revisões",
};
export function quantBacktestHtml() {
  loadQbt();
  const d = qbt.data;
  if (!d) return "";
  const col = (e) => e;
  const row = (label, f) =>
    `<tr><td>${label}</td>${["all", "oos"].map((k) => f(col(d[k]))).join("")}</tr>`;
  const icCell = (x) => (x ? `<td class="num ${x.ic >= 0 ? "pos" : "neg"}">${num(x.ic, 3)}</td><td class="num">${num(x.t, 1)}</td>` : `<td colspan="2" class="muted">sem histórico</td>`); // prettier-ignore
  const exCell = (x) => (x?.exVsMedia != null ? `<td class="num ${x.exVsMedia >= 0 ? "pos" : "neg"}">${pct(x.exVsMedia, 2)}</td><td class="num">${num(x.t, 1)}</td>` : `<td colspan="2">–</td>`); // prettier-ignore
  const c = d.curve.at(-1);
  return `<section class="card" style="margin-top:12px"><h2>📊 Backtest da nota Quant (réplica Seeking Alpha)</h2>
    <p>${num(d.snapshots, 0)} fotos diárias × ~500 ações = <b>${num(d.stockDays, 0)} notas</b> reconstruídas de ${esc(d.from)} a ${esc(d.to)}, só com balanços já publicados (anual +75 dias, trimestral +45). Retorno nos 21 pregões seguintes. <b>Revisões de analistas (25% da nota) ficam fora</b>: sem histórico por data.</p>
    <div class="tw" style="box-shadow:none"><table><thead><tr><th></th><th colspan="2">Período todo</th><th colspan="2">Fora da amostra (desde ${esc(d.cut)})</th></tr><tr><th></th><th class="num">valor</th><th class="num">t</th><th class="num">valor</th><th class="num">t</th></tr></thead><tbody>
    ${row("<b>Nota final: correlação com o retorno (IC)</b>", (e) => icCell(e.ic ? { ic: e.ic.mean, t: e.ic.t } : null))}
    ${Object.keys(FL)
      .map((f) => row(`Fator ${FL[f]} (IC)`, (e) => icCell(e.factors[f])))
      .join("")}
    ${["Compra forte", "Compra", "Manter", "Venda", "Venda forte"].map((r) => row(`${r}: retorno vs. média das ações`, (e) => exCell(e.byRating[r]))).join("")}
    ${row("Top 20 (ProPicks) vs. SPY, por 21 pregões", (e) => exCell({ exVsMedia: e.top20.vsSpy, t: e.top20.t }))}
    </tbody></table></div>
    <p>Carteira Top 20 rebalanceada a cada 21 pregões: <b>${pct(c.top20 - 1, 1)}</b> · SPY ${pct(c.spy - 1, 1)} · média das ações ${pct(c.media - 1, 1)} (${d.curve.length} rebalanceamentos, sem custos).</p>
    <p class="note">IC = correlação de postos entre a nota e o retorno seguinte (0 = nada; 0,05 já é bom). t sem sobreposição. Material educacional.</p></section>`;
}
