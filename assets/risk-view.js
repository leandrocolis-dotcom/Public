// Aba Risco: painel de risco da carteira (estilo Bloomberg PORT).
import { esc, num } from "./format.js";
import { riskNotes } from "./risk.js";

const pc = (x, d = 1) => (x == null || !Number.isFinite(x) ? "–" : `${num(x * 100, d)}%`);
const fx = (x, d = 2) => (x == null || !Number.isFinite(x) ? "–" : num(x, d));
const usd = (x) => (x == null ? "–" : `US$ ${num(x, 0)}`);

function heat(c) {
  if (!Number.isFinite(c)) return "";
  const a = Math.min(1, Math.abs(c));
  return `background:color-mix(in srgb, var(${c >= 0 ? "--sell" : "--info"}) ${Math.round(a * 55)}%, transparent)`;
}

function structureHtml(s) {
  if (!s?.lines?.length) return "";
  const rows = s.lines
    .filter((x) => x.us)
    .slice(0, 12)
    .map((x) => `<tr><td>${esc(x.sym)}</td><td class="num">${usd(x.value)}</td><td class="num">${x.dy === null ? "–" : pc(x.dy, 2)}</td><td class="num">${x.divs === null ? "–" : usd(x.leak)}</td><td class="num">${x.divs === null ? "–" : usd(x.leakUcits)}</td><td class="num pos">${x.divs === null ? "–" : usd(x.saving)}</td></tr>`)
    .join(""); // prettier-ignore
  return `<section class="card"><h2>Custo de estrutura (não residente nos EUA)</h2>
    <div class="rk-tiles">
      <div class="rk-tile"><span class="l">Retido nos dividendos (30%)</span><b>${usd(s.leak)}/ano</b><span class="muted">sobre ${usd(s.divs)} de dividendos estimados</span></div>
      <div class="rk-tile"><span class="l">Num UCITS irlandês (~15%)</span><b>${usd(s.leakUcits)}/ano</b><span class="muted">economia ${usd(s.saving)}/ano ≈ ${pc(s.savingPct, 2)} da carteira</span></div>
      <div class="rk-tile"><span class="l">Ativos "US situs"</span><b>${usd(s.usValue)}</b><span class="muted">isenção de herança: US$ 60 mil</span></div>
      <div class="rk-tile"><span class="l">Herança: pior caso</span><b class="${s.estateWorst > 0 ? "neg" : ""}">${usd(s.estateWorst)}</b><span class="muted">até 40% do que passa de US$ 60 mil, se em nome da pessoa física</span></div>
    </div>
    ${rows ? `<div class="table-wrap"><table class="cal-table"><thead><tr><th>Ativo</th><th class="num">Valor</th><th class="num">Dividend yield</th><th class="num">Retido (30%)</th><th class="num">UCITS (15%)</th><th class="num">Economia/ano</th></tr></thead><tbody>${rows}</tbody></table></div>` : ""}
    ${s.loading ? `<p class="muted">Buscando o dividend yield das posições…</p>` : s.unknown.length ? `<p class="muted">Sem dividend yield: ${esc(s.unknown.join(", "))} (fora da conta).</p>` : ""}
    <p class="note">Conta aproximada e educacional, não é orientação tributária. Quem não é residente nos EUA e não tem tratado (caso do Brasil) sofre 30% de retenção nos dividendos de ETF americano; um UCITS irlandês do mesmo índice (ex.: CSPX/VUAA para o S&P 500) sofre ~15% dentro do fundo. ETF e ação americanos são "US situs": em nome da pessoa física, o que passa de US$ 60 mil pode pagar imposto sobre herança dos EUA (progressivo, até 40%). Detido por empresa offshore ou trust bem estruturado, em geral não se aplica. A escolha depende da sua estrutura: confirme com o seu tributarista.</p>
  </section>`;
}

/** ctx: { risk, structure, hasPortfolio } */
export function viewRisk({ risk, structure = null, hasPortfolio }) {
  if (!hasPortfolio)
    return `<div class="card empty"><p>Importe a carteira para ver o risco.</p><div class="empty-cta"><button class="btn" data-tab="portfolio">Ir para a Carteira</button></div></div>`;
  if (!risk)
    return `<div class="card empty">Calculando o risco… (precisa do histórico de 1 ano das posições)</div>`;
  if (!risk.ok) return `<div class="card empty">Risco indisponível: ${esc(risk.reason)}.</div>`;
  const tiles = [
    ["Volatilidade anual", pc(risk.vol), `S&P 500: ${pc(risk.benchVol)}`],
    ["Beta (vs S&P 500)", fx(risk.beta), "1,00 = anda igual ao índice"],
    ["VaR 95% (1 dia)", pc(risk.var95), usd(risk.var95Usd)],
    ["CVaR 95% (1 dia)", pc(risk.cvar95), "média dos 5% piores dias"],
    ["Queda máxima", pc(risk.mdd), `${risk.days} pregões`],
    ["Posições efetivas", fx(risk.effN, 1), `maior peso ${pc(risk.topWeight, 0)}`],
    ["Apostas independentes", fx(risk.effBets, 1), "descontada a correlação"],
    ["Exposição ao S&P 500", usd(risk.spyExposure), "beta × valor da carteira"],
  ]
    .map(([l, v, s]) => `<div class="rk-tile"><span class="l">${l}</span><b>${v}</b><span class="muted">${esc(s)}</span></div>`)
    .join(""); // prettier-ignore
  const notes = riskNotes(risk)
    .map((n) => `<li class="rk-note ${n.tone}">${esc(n.text)}</li>`)
    .join("");
  const rows = risk.positions
    .map(
      (p) => `<tr><td><button class="linklike" data-sym="${esc(p.sym)}">${esc(p.sym)}</button></td>
      <td class="num">${pc(p.weight)}</td>
      <td class="num"><span class="rk-bar"><i style="width:${Math.max(0, Math.min(100, p.riskShare * 100))}%"></i></span>${pc(p.riskShare)}</td>
      <td class="num">${pc(p.vol)}</td><td class="num">${fx(p.beta)}</td><td class="num">${fx(p.corrPort)}</td><td class="num">${pc(p.mdd)}</td></tr>`,
    )
    .join(""); // prettier-ignore
  const { syms, m } = risk.corr;
  const corrTbl = syms.length > 1
    ? `<div class="table-wrap"><table class="rk-corr"><thead><tr><th></th>${syms.map((s) => `<th>${esc(s)}</th>`).join("")}</tr></thead><tbody>${m
        .map((row, i) => `<tr><th>${esc(syms[i])}</th>${row.map((c, j) => `<td class="num" style="${i === j ? "" : heat(c)}">${i === j ? "" : fx(c)}</td>`).join("")}</tr>`)
        .join("")}</tbody></table></div>`
    : `<p class="muted">Precisa de 2 ou mais posições.</p>`; // prettier-ignore
  return `<section class="card"><h2>Risco da carteira</h2>
    <p class="muted">Últimos ${risk.days} pregões (${esc(risk.from)} a ${esc(risk.to)}), retornos diários, pesos atuais${risk.coverage < 0.999 ? `, cobrindo ${pc(risk.coverage, 0)} do valor` : ""}. Histórico não garante o futuro.</p>
    <div class="rk-tiles">${tiles}</div>
    ${notes ? `<ul class="rk-notes">${notes}</ul>` : ""}
  </section>
  <section class="card"><h2>De onde vem o risco</h2>
    <div class="table-wrap"><table class="cal-table"><thead><tr><th>Ativo</th><th>Peso</th><th>Parte do risco</th><th>Vol. anual</th><th>Beta</th><th>Correl. c/ carteira</th><th>Queda máx.</th></tr></thead><tbody>${rows}</tbody></table></div>
    <p class="note">"Parte do risco" soma 100%: uma posição pequena e volátil pode pesar mais no risco do que no valor.</p>
  </section>
  <section class="card"><h2>Correlação entre posições</h2>${corrTbl}
    <p class="note">Perto de 1: andam juntas (diversificam pouco). Perto de 0 ou negativa: protegem uma à outra.</p></section>${structureHtml(structure)}`;
}
