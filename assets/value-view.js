// Aba Valor: placar fundamentalista (Fase 1). Cálculos em fa.js; teoria em docs/ANALISE-FUNDAMENTALISTA.md.
import { dismissible } from "./dismiss.js";
import { etfValuation, valueCards } from "./fa.js";
import { dateBR, decSep, esc } from "./format.js";
import { FA_GLOSSARY } from "./fa-glossary.js";

const pct = (v, d = 2) =>
  v === null || v === undefined ? "–" : `${v.toFixed(d).replace(".", decSep())}%`;
const num = (v, d = 1) =>
  v === null || v === undefined ? "–" : v.toFixed(d).replace(".", decSep());
const yrs = (y) => `${Math.max(1, Math.round(y))} ${Math.round(y) > 1 ? "anos" : "ano"}`;

const TAG = { Barato: "buy", Caro: "sell" };

/** Texto de cada card: título, linhas de métrica e frase simples. */
function describe(c) {
  switch (c.id) {
    case "SPY":
      return {
        title: "Bolsa EUA (SPY)",
        rows: [["P/L", num(c.pe)], ["Rendimento do lucro", pct(c.ey)], ["Juro real 10a", pct(c.real)], ["Prêmio de risco", pct(c.erp)]], // prettier-ignore
        text: `Quanto a bolsa paga acima do Tesouro protegido da inflação. Abaixo de 2% o investidor recebe pouco para correr risco de ação.${c.method === "CAPE" ? " Placar vem do CAPE (card ao lado), que tem histórico desde 1881." : c.method === "faixas" ? " Avaliado por faixas de referência até o histórico próprio de P/L acumular 2 anos." : ""}`,
      };
    case "CAPE":
      return {
        title: "S&P 500: CAPE e retorno de 10 anos",
        rows: [["CAPE", num(c.cape)], ["Percentil do CAPE", c.capePct === undefined ? "–" : `${Math.round(c.capePct * 100)}`], ["Excess CAPE Yield", pct(c.ecy)], ["Retorno real esperado 10a", c.r10 === undefined ? "–" : `${pct(c.r10, 1)} ± 3 p.p. a.a.`]], // prettier-ignore
        text: `P/L sobre o lucro real médio de 10 anos (Shiller), histórico desde ${c.since ?? "1881"}. Excess CAPE Yield = rendimento cíclico (1/CAPE) menos o juro real; alto = bolsa barata frente aos títulos. O retorno esperado é estimativa grosseira (≈ 1/CAPE).`,
      };
    case "HYG":
    case "EMB":
      return {
        title: c.id === "HYG" ? "Crédito high yield (HYG)" : "Crédito emergente (EMB)",
        rows: [["Spread (OAS)", pct(c.oas)], ["Percentil", c.score === null ? "–" : `${Math.round(c.score)}`], ["Janela", c.years ? yrs(c.years) : "–"]], // prettier-ignore
        text: "Spread alto = o risco de calote já está bem pago (barato). Spread baixo = pouca folga se a economia piorar.",
      };
    case "TLT":
      return {
        title: "Treasuries longos (TLT)",
        rows: [["Juro real 10a", pct(c.real)], ["Curva 10a − 3m", c.slope === null ? "–" : `${num(c.slope, 2)} p.p.`], ["Janela", c.years ? yrs(c.years) : "–"]], // prettier-ignore
        text: "Juro real alto e curva positiva pagam bem quem alonga prazo. Peso: 70% juro real, 30% inclinação da curva.",
      };
    case "GLD":
      return {
        title: "Ouro (GLD)",
        rows: [["Juro real 10a", pct(c.real)], ["Desvio (z)", c.z === undefined ? "–" : num(c.z, 2)], ["Sensibilidade", c.beta === undefined ? "–" : num(c.beta, 2)]], // prettier-ignore
        text: c.broken
          ? "Na janela disponível o ouro subiu junto com o juro real, o contrário da teoria (compras de bancos centrais). O modelo não é usado até a relação voltar."
          : "Compara o preço do ouro com o que o juro real explica. Acima do explicado = caro.",
      };
    default:
      return { title: c.id, rows: [], text: "" };
  }
}

function card(c) {
  const d = describe(c);
  const s = c.score === null || c.score === undefined ? null : Math.round(c.score);
  return `<div class="card kpi">
    <div class="lab">${esc(d.title)}</div>
    <div class="val">${s === null ? "–" : s}<span class="muted" style="font-size:.8rem"> /100</span>
      <span class="tag ${TAG[c.label] ?? "wait"}" style="margin-left:8px">${esc(c.label)}</span></div>
    <div style="height:6px;border-radius:3px;background:var(--line);margin:8px 0 10px;overflow:hidden">
      <div style="height:100%;width:${s ?? 0}%;background:var(--${s === null ? "line" : s >= 70 ? "buy" : s <= 30 ? "sell" : "wait"})"></div></div>
    <div class="kpi-row" style="cursor:default">${d.rows.map(([l, v]) => `<div><div class="lab">${esc(l)}</div><b>${esc(v)}</b></div>`).join("")}</div>
    <p class="sub">${esc(d.text)}</p></div>`;
}

const signedPct = (v) => (v === null ? "–" : `${v > 0 ? "+" : ""}${Math.round(v * 100)}%`);

/** Tabela "Valuation por ETF" (Fase 2). */
function etfTable(etf) {
  const rows = etfValuation(etf);
  if (!rows.length) return "";
  const body = rows
    .map((r) => {
      const s = r.score === null ? null : Math.round(r.score);
      return `<tr><td><b>${esc(r.sym)}</b> <span class="muted">${esc(r.name)}</span>${r.cyclical ? ' <span class="tag wait" title="Lucro cíclico: P/L engana no fundo e no topo do ciclo">cíclico</span>' : ""}</td>
        <td class="num"><b>${s ?? "–"}</b></td><td><span class="tag ${TAG[r.label] ?? "wait"}">${esc(r.label)}</span></td>
        <td class="num">${num(r.pe)}</td><td class="num">${pct(r.ey, 1)}</td><td class="num">${pct(r.dy, 1)}</td>
        <td class="num">${signedPct(r.vsSpy)}</td>
        <td class="muted">${r.base === "pares" ? `vs. pares ${r.group === "EUA" ? "EUA" : "globais"}` : r.base === "histórico" ? "próprio histórico" : "–"}</td></tr>`;
    })
    .join("");
  return `<h3 style="margin:calc(var(--gap)*1.5) 0 8px">Valuation por ETF de ações</h3>
    <div class="tw"><table data-sortable="val"><thead><tr><th>Ativo</th><th class="num">Placar</th><th>Leitura</th><th class="num">P/L</th><th class="num">Rend. lucro</th><th class="num">Div. yield</th><th class="num">P/L vs. SPY</th><th>Base</th></tr></thead><tbody>${body}</tbody></table></div>
    <p class="note">P/L passado (12 meses) do Yahoo, 1 ponto por dia acumulado. Até ter 1 ano de histórico próprio, o placar compara o ativo com os pares do mesmo grupo (EUA ou globais): 100 = mais barato do grupo, 0 = mais caro. Barato entre pares não quer dizer barato em absoluto. Setores cíclicos (energia, materiais, bancos, mineradoras) têm P/L enganoso.</p>`;
}

function learn() {
  return `<div class="card" style="margin-top:var(--gap)"><h3>Aprenda: o que cada métrica quer dizer</h3>${FA_GLOSSARY.map(
    (g) =>
      `<details><summary>${esc(g.name)}</summary><div><p>${esc(g.what)}</p><ul>${g.read.map((x) => `<li>${esc(x)}</li>`).join("")}</ul><p class="muted"><b>Limite:</b> ${esc(g.limit)}</p></div></details>`,
  ).join("")}</div>`;
}

/** ctx = { fund: data/fundamentals.json | null, prices: data/prices.json, error } */
export function viewValue({ fund, prices, error }) {
  if (!fund)
    return `<div class="card empty">${error ? `Fundamentos indisponíveis (${esc(error)}).` : "Carregando fundamentos…"}</div>`;
  const cards = valueCards(fund, prices);
  return `${dismissible("alert-box info card", `<p><b>Horizonte de 5 a 10 anos.</b> Valuation explica bem o retorno de longo prazo e quase nada do retorno de semanas. Use como filtro de fundo; o momento de entrada continua na aba "Quando entrar".</p>`)}
    <div class="grid g4" style="margin-top:var(--gap)">${cards.map(card).join("")}</div>
    ${etfTable(fund.etf)}
    ${learn()}
    <p class="note">Placar 0–100: ≥ 70 barato, ≤ 30 caro. Fontes: FRED (juro real, inflação implícita, spreads ICE BofA), Robert Shiller (CAPE), Yahoo (P/L do SPY) e o histórico de preços do app (curva de juros, GLD). Atualizado em ${dateBR(fund.meta?.updated_at)}, uma vez por dia no fechamento. Material educacional; não é recomendação de investimento.</p>`;
}
