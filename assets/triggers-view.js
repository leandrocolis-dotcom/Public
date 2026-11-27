// Gatilhos › Agora: proteção das posições, repique depois de queda muito rápida, filtro de alavancagem e o que NÃO
// fazer. Só o que passou no teste; cada bloco com o placar ao vivo (fora da amostra). Funções puras em triggers.js.
import { AVOID, PROTECT, leverFilter, protectRows, reboundRows, scoreOf } from "./triggers.js";
import { learn, loadModel } from "./model-status.js";
import { an, ensureAnalysis } from "./analysis-data.js";
import { traderDecision } from "./decision.js";
import { quantOf } from "./quant-view.js";
import { signalsFor } from "./signals.js";
import { isLeveraged } from "./portfolio.js";
import { quoteOf } from "./asset-pop.js";
import { fetchQuotes } from "./quote-hub.js";
import { itemsOf, watchLists } from "./watchlist.js";
import { nyDate } from "./live.js";
import { esc, num } from "./format.js";
import { hooks, state } from "./state.js";
import { pairsBlock } from "./pairs-view.js";

const MAX_SYMS = 40;
const pctTxt = (x, d = 1) =>
  x == null || !Number.isFinite(x) ? "–" : `<span class="${x >= 0 ? "up" : "down"}">${x >= 0 ? "+" : "−"}${num(Math.abs(x) * 100, d)}%</span>`; // prettier-ignore
const rTxt = (x) =>
  x == null || !Number.isFinite(x) ? "–" : `${x >= 0 ? "+" : "−"}${num(Math.abs(x), 2)}R`;
const STATUS = { approved: "aprovada", eval: "em avaliação", eliminated: "eliminada" };

/** Chip do placar ao vivo: operações, média em R (excesso sobre o universo) e faixa de 90%. */
function scoreChip(sc) {
  if (!sc) return `<span class="muted small">sem placar ao vivo</span>`;
  if (!sc.n) return `<span class="muted small">placar ao vivo: ainda sem operação fechada · ${esc(STATUS[sc.status] ?? sc.status ?? "")}</span>`; // prettier-ignore
  const tone = sc.lower > 0 ? "up" : sc.upper < 0 ? "down" : "";
  return `<span class="small">ao vivo: <b class="${tone}">${rTxt(sc.mean)}</b> <span class="muted">[${rTxt(sc.lower)}; ${rTxt(sc.upper)}] · ${sc.n} ${sc.n === 1 ? "dia" : "dias"} · ${esc(STATUS[sc.status] ?? sc.status)}</span></span>`; // prettier-ignore
}

const price = (sym) => {
  const q = quoteOf(sym);
  return q?.p > 0 ? q.p : (an.items[sym]?.price ?? null);
};

let fetching = false;
/** Ativos acompanhados: posições + watchlists (até 40). Busca análise e cotação em segundo plano. */
function universe() {
  const held = (state.portfolio?.holdings ?? []).map((h) => h.sym);
  const watch = watchLists(state.prefs).flatMap((l) => itemsOf(l).map((x) => x.sym));
  const syms = [...new Set([...held, ...watch])]
    .filter((s) => !s.startsWith("^"))
    .slice(0, MAX_SYMS);
  const miss = syms.filter((s) => !an.at[s]);
  const open = (learn.speed?.open ?? []).map((e) => e.s);
  if (!fetching && (miss.length || open.length)) {
    fetching = true;
    Promise.all([
      miss.length ? ensureAnalysis(miss, { parallel: 2 }) : null,
      fetchQuotes([...syms, ...open, "SPY"], { id: "trig" }),
    ])
      .catch(() => {})
      .finally(() => {
        fetching = false;
        if (state.prefs.tab === "trig") hooks.render();
      });
  }
  return { held: new Set(held), syms };
}

function protectBlock(u) {
  const codesOf = {};
  for (const s of state.signals ?? [])
    if (s.scope === "portfolio") (codesOf[s.sym] ??= []).push(s.code);
  const items = u.syms.map((sym) => {
    const r = an.items[sym];
    const p = price(sym);
    const dec = r ? traderDecision(p > 0 ? { ...r, price: p } : r, { regime: state.snap?.regime, spy: state.prices?.series?.SPY, quantOf }, { gate: true }) : null; // prettier-ignore
    const codes =
      codesOf[sym] ??
      (r?.series?.close ? signalsFor(r.series.close, { sym }).map((x) => x.code) : []);
    const name = state.valuation?.rows?.find((x) => x.sym === sym)?.name ?? r?.name ?? sym;
    return { sym, name, held: u.held.has(sym), lev: isLeveraged(sym, name), dec: dec?.final?.step?.key ?? null, codes, price: p }; // prettier-ignore
  });
  const rows = protectRows(items);
  const label = Object.fromEntries(PROTECT.map((p) => [p.id, p.label]));
  const body = rows.length
    ? `<div class="table-wrap"><table class="cal-table"><thead><tr><th>Ativo</th><th></th><th>Preço</th><th>Alerta</th></tr></thead><tbody>${rows
        .map((r) => `<tr data-sr-open="${esc(r.sym)}" tabindex="0"><td><b>${esc(r.sym)}</b> <span class="muted small">${esc(r.name)}</span></td><td class="small">${r.held ? "posição" : "watchlist"}${r.lev ? " · ⚡ alavancado" : ""}</td><td class="num">${num(r.price ?? NaN, 2)}</td><td class="small">${r.hits.map((h) => esc(label[h])).join(" · ")}</td></tr>`) // prettier-ignore
        .join("")}</tbody></table></div>`
    : `<p class="muted">${u.syms.length ? `Nenhum alerta de proteção nos ${u.syms.length} ativos acompanhados (posições e watchlists).` : "Importe a carteira ou crie uma watchlist para acompanhar."}${fetching && u.syms.length ? " Carregando a análise…" : ""}</p>`; // prettier-ignore
  const legend = PROTECT.map((p) => `<li><b>${esc(p.label)}</b>: ${esc(p.why)} ${scoreChip(scoreOf("model", p.logic, learn))}</li>`).join(""); // prettier-ignore
  return `<section class="card"><h2>🛡 Proteção: já estou alocado</h2>
    <p class="muted small">Não acertam a direção; cortam a queda máxima. Em posição alavancada isso pesa mais (a perda por volatilidade é maior). Posições e watchlists, alavancados primeiro.</p>
    ${body}<ul class="small">${legend}</ul></section>`;
}

function reboundBlock(f) {
  const open = learn.speed?.open;
  const sc = scoreOf("speed", "spd:rev-pf:buy", learn);
  const rows = reboundRows(open, price);
  const body = !open
    ? `<p class="muted">Carregando o diário da velocidade…</p>`
    : rows.length
      ? `<div class="table-wrap"><table class="cal-table"><thead><tr><th>Ativo</th><th>Gatilho</th><th>Preço no gatilho</th><th>Agora</th><th>Desde então</th><th>Regime</th></tr></thead><tbody>${rows
          .map(
            (r) =>
              `<tr data-sr-open="${esc(r.sym)}" tabindex="0"><td><b>${esc(r.sym)}</b></td><td>${esc(r.date.split("-").reverse().join("/"))} <span class="muted small">${num(r.rel, 1)}x</span></td><td class="num">${num(r.entry, 2)}</td><td class="num">${num(r.price ?? NaN, 2)}</td><td class="num">${pctTxt(r.move)}</td><td class="small ${r.bull ? "" : "down"}">${r.bull ? "SPY > MM200" : "baixa: no estudo perdeu"}</td></tr>`,
          ) // prettier-ignore
          .join("")}</tbody></table></div>`
      : `<p class="muted">Nenhum repique aberto (o gatilho vale por 10 pregões).</p>`;
  return `<section class="card"><h2>↩ Repique depois de queda muito rápida</h2>
    <p class="muted small">Ativo em “Perdendo força” que cai ≥ 3x o ritmo típico do universo. No estudo de 2 anos (928 ativos): +0,09R em 10 pregões, aprovado no BH, mas <b>só no regime de alta</b> (−0,19R com o SPY abaixo da MM200). Medido no fechamento; saída em 10 pregões ou no stop de 2,5 ATR.</p>
    ${f && !f.up ? `<p class="small down"><b>Hoje o SPY está abaixo da MM200:</b> é o regime em que o repique perdeu no estudo. Os gatilhos abertos ficam só como registro.</p>` : ""}
    ${body}<p>${scoreChip(sc)}</p></section>`;
}

function spyFilter() {
  const c = [...(state.prices?.series?.SPY ?? [])];
  const q = quoteOf("SPY");
  const last = state.prices?.dates?.at(-1);
  if (q?.p > 0 && c.length) {
    const d = nyDate(q.t);
    if (d === last) c[c.length - 1] = q.p;
    else if (d > last) c.push(q.p);
  }
  return leverFilter(c);
}

function leverBlock(f) {
  const txt = !f
    ? `<p class="muted">Sem histórico do SPY ainda.</p>`
    : `<div class="trig-lever"><b class="${f.level === 2 ? "up" : f.level === 0 ? "down" : ""}">${f.level === 2 ? "2x liberado" : f.level === 1 ? "Só 1x (vol. alta)" : "Caixa (abaixo da MM200)"}</b>
       <span class="small muted">SPY ${num(f.price, 2)} × MM200 ${num(f.ma200, 2)} (${pctTxt(f.price / f.ma200 - 1)}) · vol. 21 pregões ${num(f.vol * 100, 1)}% ao ano (limite 20%)</span></div>`; // prettier-ignore
  return `<section class="card"><h2>⚖ Filtro de alavancagem</h2>
    ${txt}
    <p class="muted small">H10 (20 anos, 2007–2026): SSO 2x só com SPY acima da MM200 e vol. abaixo de 20%; acima da MM200 com vol. alta, 1x; abaixo, caixa. 13,9% ao ano × queda máx. −38%. Passou no critério, mas não no BH: <b>em observação</b>. Vale como teto de alavancagem, não como sinal de entrada.</p></section>`;
}

function avoidBlock() {
  return `<section class="card"><h2>⛔ O que NÃO fazer (medido e perdeu)</h2>
    <ul>${AVOID.map((a) => `<li><b>${esc(a.label)}</b>: ${esc(a.why)} ${a.logic ? scoreChip(scoreOf(a.src, a.logic, learn)) : ""}</li>`).join("")}</ul>
    <p class="muted small">Entrada “no dia certo” não ganhou de um dia qualquer em 10 anos (docs/ESTUDO-GATILHOS.md). Use o Scanner para achar volatilidade e o Fluxo para o contexto; o gatilho de entrada ainda é seu.</p></section>`;
}

export function viewTriggers() {
  loadModel();
  const u = universe();
  const f = spyFilter();
  return `<section class="trig">
    <p class="muted small">Placar ao vivo = resultado em R (risco até o stop de 2,5 ATR) acima da média do universo, com faixa de 90%, no diário fora da amostra. Material educacional; não é recomendação de investimento.</p>
    ${pairsBlock()}
    <div class="trig-grid">${leverBlock(f)}${protectBlock(u)}${reboundBlock(f)}${avoidBlock()}</div>
  </section>`;
}
