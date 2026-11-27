// Gatilhos › Agora › ⇅ Pares long × short: quanto cada par ganha em % da carteira e quanto vender para embolsar o alvo.
import {
  DEFAULT_FEE,
  DEFAULT_TARGETS,
  MAX_PAIRS,
  detectPairs,
  legFrom,
  pairState,
  pairVol,
  parseTargets,
  targetOdds,
  targetsFor,
} from "./pairs.js";
import { quoteOf } from "./asset-pop.js";
import { an } from "./analysis-data.js";
import { esc, num } from "./format.js";
import { hooks, savePrefs, state } from "./state.js";
import { refreshPush } from "./push.js";

const usd = (x) => `${x < 0 ? "−" : ""}US$ ${num(Math.abs(x), 0)}`;
const pct = (x, d = 2) =>
  x == null || !Number.isFinite(x) ? "–" : `<span class="${x >= 0 ? "up" : "down"}">${x >= 0 ? "+" : "−"}${num(Math.abs(x) * 100, d)}%</span>`; // prettier-ignore
const targetsTxt = (ts) => ts.map((t) => num(t * 100, t * 100 < 1 ? 1 : 0)).join(", ");

function prefs() {
  const p = state.prefs;
  const targets = parseTargets(p.pairTargets ?? "");
  return {
    targets: targets.length ? targets : DEFAULT_TARGETS,
    fee: Number.isFinite(p.pairFee) ? p.pairFee : DEFAULT_FEE,
    base: p.pairBase === "cost" ? "cost" : "day",
  };
}

/** Pares escolhidos pelo usuário; sem escolha, os conhecidos que estão na carteira. */
function pairsOf(held) {
  const mine = (state.prefs.pairs ?? []).filter(([a, b]) => held[a] && held[b]);
  return state.prefs.pairs ? mine : detectPairs(Object.keys(held));
}

const legOf = (r) => legFrom(r, quoteOf(r.sym));

function pairCard([a, b], held, equity, o, i) {
  const legs = [legOf(held[a]), legOf(held[b])];
  const st = pairState(legs, { equity, fee: o.fee, base: o.base });
  const sigma = pairVol(
    legs.map((l) => an.items[l.sym]?.series?.close),
    legs.map((l) => (l.qty * l.price) / equity),
  );
  const tgt = targetsFor(st, o.targets, { equity, fee: o.fee });
  const dir = Math.abs(st.tilt) < 0.15 ? "neutro" : st.tilt > 0 ? "inclinado para alta" : "inclinado para baixa"; // prettier-ignore
  const rows = st.rows
    .map(
      (r) =>
        `<tr data-hold="${esc(r.sym)}" tabindex="0"><td><b>${esc(r.sym)}</b> <span class="muted small">${r.lev > 0 ? "+" : "−"}${num(Math.abs(r.lev), r.lev % 1 ? 1 : 0)}x</span></td><td class="num">${num(r.qty, r.qty % 1 ? 2 : 0)}</td><td class="num">${num(r.price, 2)}</td><td class="num">${pct(r.move)}</td><td class="num">${pct(r.pl / equity)}<br><span class="muted small">${usd(r.pl)}</span></td><td class="num">${usd(r.expo)}</td></tr>`,
    ) // prettier-ignore
    .join("");
  const tRows = tgt
    .map((t) => {
      const odds = targetOdds(t.t, sigma);
      const oddsTxt = odds ? `<span class="muted small">${odds.every > 250 ? "raro" : `~1 dia em ${odds.every}`}</span>` : ""; // prettier-ignore
      if (!t.hit)
        return `<li class="pr-t"><span class="pr-chip">${num(t.t * 100, t.t < 0.01 ? 1 : 0)}%</span> <span>falta ${num((t.gap / equity) * 100, 2)}% (${usd(t.gap)})</span> ${oddsTxt}</li>`; // prettier-ignore
      const p = t.plan;
      if (!p)
        return `<li class="pr-t hit"><span class="pr-chip on">🎯 ${num(t.t * 100, 0)}%</span> batido, mas nenhuma ponta tem ganho por cota acima do custo.</li>`; // prettier-ignore
      const after = st.rows.find((r) => r.sym !== p.sym);
      return `<li class="pr-t hit"><span class="pr-chip on">🎯 ${num(t.t * 100, t.t < 0.01 ? 1 : 0)}%</span>
        Vender <b>${num(p.shares, 0)} ${esc(p.sym)}</b> (≈ ${usd(p.notional)}) embolsa <b>${usd(p.realized)}</b> líquido
        <span class="muted small">(custo ${usd(p.cost)}${p.ok ? "" : " · não há cotas para o alvo inteiro"})</span>.
        Fica ${num(p.left, 0)} ${esc(p.sym)} × ${num(after.qty, 0)} ${esc(after.sym)}: exposição ${usd(t.expoAfter)} ${oddsTxt}</li>`; // prettier-ignore
    })
    .join("");
  return `<article class="pr-card">
    <header class="pr-h"><b>${esc(a)} × ${esc(b)}</b>
      <span class="pr-net">${pct(st.grossPct)} <span class="muted small">${usd(st.gross)} · zerar tudo agora: ${usd(st.closeNet)}</span></span>
      <button class="linkish small" data-pair-del="${i}" aria-label="Tirar o par ${esc(a)} × ${esc(b)}">×</button></header>
    <div class="table-wrap"><table class="cal-table pr-t-legs"><thead><tr><th>Ponta</th><th>Cotas</th><th>Preço</th><th>${o.base === "day" ? "Hoje" : "Desde o médio"}</th><th>Resultado</th><th>Exposição</th></tr></thead><tbody>${rows}</tbody></table></div>
    <p class="small">Exposição líquida ${usd(st.expo)} no ativo-base (${dir}). ${sigma ? `Um dia típico do par mexe ±${num(sigma * 100, 2)}% da carteira (20 pregões).` : ""}</p>
    <ul class="pr-ts">${tRows}</ul>
  </article>`;
}

export function pairsBlock() {
  const rows = state.valuation?.rows ?? [];
  const equity = state.valuation?.total ?? 0;
  const held = Object.fromEntries(rows.filter((r) => r.qty > 0).map((r) => [r.sym, r]));
  const o = prefs();
  const pairs = pairsOf(held);
  const syms = Object.keys(held).sort();
  const opts = (sel) => syms.map((s) => `<option${s === sel ? " selected" : ""}>${esc(s)}</option>`).join(""); // prettier-ignore
  const body = !(equity > 0)
    ? `<p class="muted">Importe a carteira para acompanhar os pares.</p>`
    : pairs.length
      ? pairs.map((p, i) => pairCard(p, held, equity, o, i)).join("")
      : `<p class="muted">Nenhum par na carteira. Monte as duas pontas (ex.: SOXL × SOXS, SNDU × SNDQ, UVIX × SVIX) ou escolha abaixo.</p>`; // prettier-ignore
  const add =
    equity > 0 && pairs.length < MAX_PAIRS && syms.length > 1
      ? `<span class="pr-add"><select id="pair-a" aria-label="Ponta comprada">${opts()}</select> × <select id="pair-b" aria-label="Ponta vendida">${opts(syms[1])}</select> <button class="btn ghost small" data-pair-add>+ par</button></span>` // prettier-ignore
      : "";
  return `<section class="card pr"><h2>⇅ Pares long × short</h2>
    <p class="muted small">Duas pontas do mesmo ativo-base: o resultado é medido em % da carteira (${usd(equity)}), contando a ponta que perde. Quando o par bate um alvo, mostra quantas cotas vender da ponta vencedora para embolsar o alvo <b>líquido do custo</b> (${num(o.fee * 100, 2)}% por venda) e como o par fica.</p>
    <div class="pr-cfg small">
      <span class="seg"><button data-pair-base="day" aria-pressed="${o.base === "day"}">Hoje</button><button data-pair-base="cost" aria-pressed="${o.base === "cost"}">Desde o médio</button></span>
      <label>Alvos (%) <input id="pair-targets" class="rfx-in pr-in" value="${esc(targetsTxt(o.targets))}" inputmode="decimal"></label>
      <label>Custo por venda (%) <input id="pair-fee" class="rfx-in pr-in" value="${num(o.fee * 100, 2)}" inputmode="decimal"></label>
      ${add}
    </div>
    ${body}
    <p class="muted small">O alvo vale sobre o patrimônio de agora, então o que é embolsado entra na base do próximo (juros compostos). ETF alavancado perde por volatilidade com o tempo: o par “neutro” não fica parado. Material educacional; não é recomendação de investimento.</p></section>`;
}

const pct2 = (s) => parseFloat(String(s).replace(",", "."));

export function pairsClick(e) {
  const base = e.target.closest("[data-pair-base]");
  const del = e.target.closest("[data-pair-del]");
  const add = e.target.closest("[data-pair-add]");
  if (!base && !del && !add) return;
  const held = (state.valuation?.rows ?? []).map((r) => r.sym);
  const cur = state.prefs.pairs ?? detectPairs(held);
  if (base) state.prefs.pairBase = base.dataset.pairBase;
  if (del) state.prefs.pairs = cur.filter((_, i) => i !== +del.dataset.pairDel);
  if (add) {
    const a = document.getElementById("pair-a")?.value;
    const b = document.getElementById("pair-b")?.value;
    if (!a || !b || a === b || cur.some((p) => p.includes(a) || p.includes(b))) return;
    state.prefs.pairs = [...cur, [a, b]].slice(0, MAX_PAIRS);
  }
  savePrefs();
  refreshPush(); // o servidor de avisos usa os mesmos pares, alvos e custo
  hooks.render();
}

export function pairsChange(e) {
  const id = e.target.id;
  if (id === "pair-targets") state.prefs.pairTargets = e.target.value;
  else if (id === "pair-fee") {
    const f = pct2(e.target.value);
    if (!(f >= 0 && f <= 10)) return;
    state.prefs.pairFee = f / 100;
  } else return;
  savePrefs();
  refreshPush();
  hooks.render();
}
