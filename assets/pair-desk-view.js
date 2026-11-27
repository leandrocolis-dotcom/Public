// Carteira › Duplas L/S: painel das duplas long × short (motor em assets/pair-desk.js).
// Desenho "Instrumento Frio" (docs/design/DUPLAS.md + duplas-canvas.png): comandos no topo (base, custo e, por
// dupla, Vender % e Reter %) → regime só como leitura → total comprado/vendido/resultado → cartão por dupla com
// pontas, régua de preço (médio, trava, agora) e ordens prontas (venda parcial e stop da trava).
import { DESK_DEFAULTS, barScale, deskState } from "./pair-desk.js";
import { DEFAULT_FEE, MAX_PAIRS, detectPairs, legFrom } from "./pairs.js";
import { btgButton, withManual } from "./btg.js";
import { quoteOf } from "./asset-pop.js";
import { zoneOf } from "./regime-zones.js";
import { decSep, esc, num } from "./format.js";
import { hooks, savePrefs, state } from "./state.js";

const fin = Number.isFinite;
const sgn = (x) => (x > 0 ? "+" : x < 0 ? "−" : "");
const usd = (x, d = 0) => (fin(x) ? `${x < 0 ? "−" : ""}US$ ${num(Math.abs(x), d)}` : "–");
const sUsd = (x, d = 0) => (fin(x) ? `${sgn(x)}US$ ${num(Math.abs(x), d)}` : "–");
const sPct = (x, d = 1) => (fin(x) ? `${sgn(x)}${num(Math.abs(x) * 100, d)}%` : "–");
const tone = (x) => (!fin(x) || Math.abs(x) < 1e-9 ? "" : x > 0 ? "up" : "down");
const px = (x) => (fin(x) ? num(x, x < 10 ? 3 : 2) : "–");
const qtyTxt = (q) => num(q, q % 1 ? 2 : 0);
const keyOf = ([a, b]) => `${a}-${b}`;
const pctIn = (x) => (fin(x) ? String(Math.round(x * 1000) / 10).replace(".", decSep()) : "");
const levTxt = (l) => `${l < 0 ? "−" : ""}${num(Math.abs(l), l % 1 ? 1 : 0)}x`;

function cfg() {
  const p = state.prefs;
  return {
    fee: fin(p.pairFee) ? p.pairFee : DEFAULT_FEE,
    base: p.pairBase === "day" ? "day" : "cost",
  };
}

/** Régua de preço da ponta: médio (fio), trava (entalhe no acento), agora (agulha); lucro garantido × exposto. */
function priceBar(r) {
  const stop = r.orders.stop?.price ?? null;
  const sc = barScale(r.avg, r.price, stop);
  if (!sc) return "";
  const seg = (a, b, cls) =>
    `<i class="pd-seg ${cls}" style="left:${Math.min(a, b)}%;width:${Math.abs(b - a)}%"></i>`;
  const fill =
    r.price >= r.avg
      ? fin(sc.stop)
        ? seg(sc.avg, sc.stop, "keep") + seg(sc.stop, sc.price, "open")
        : seg(sc.avg, sc.price, "open")
      : seg(sc.price, sc.avg, "loss");
  const near = Math.abs(sc.avg - sc.price) < 16; // rótulos colados: o médio fica só na linha de texto
  const aria = `Médio ${px(r.avg)}, agora ${px(r.price)}${fin(stop) ? `, trava ${px(stop)}` : ""}`;
  return `<div class="pd-bar${fin(sc.stop) ? " has-stop" : ""}" role="img" aria-label="${esc(aria)}"><div class="pd-track">${fill}
    <i class="pd-avg" style="left:${sc.avg}%"></i>${near ? "" : `<span class="pd-tag avg" style="left:${sc.avg}%">médio ${px(r.avg)}</span>`}
    ${fin(sc.stop) ? `<i class="pd-stop" style="left:${sc.stop}%"></i><span class="pd-tag stop" style="left:${sc.stop}%">trava ${px(stop)}</span>` : ""}
    <i class="pd-now" style="left:${sc.price}%"></i><span class="pd-tag now" style="left:${sc.price}%">${px(r.price)}</span></div></div>`; // prettier-ignore
}

function legRow(r, base) {
  return `<div class="pd-leg" data-hold="${esc(r.sym)}">
    <div class="pd-leg-top"><span><b>${esc(r.sym)}</b> <span class="pd-meta">${levTxt(r.lev)} · ${r.side === "short" ? "vendido" : "comprado"}</span> <button class="pf-edit" data-action="hold-edit" data-hold-sym="${esc(r.sym)}" title="Editar quantidade e preço médio" aria-label="Editar posição de ${esc(r.sym)}">✎</button></span><b class="mono ${tone(r.pl)}">${sUsd(r.pl)}</b></div>
    <div class="pd-leg-sub"><span class="mono">${qtyTxt(r.qty)} cotas · ${usd(r.value)} · ${px(base === "day" ? r.ref : r.avg)} → <b>${px(r.price)}</b> · dia <span class="${tone(r.day)}">${sPct(r.day)}</span></span><span class="mono ${tone(r.plPct)}">${sPct(r.plPct)}</span></div>
    ${priceBar(r)}
  </div>`; // prettier-ignore
}

function ordersOf(p) {
  const out = [];
  for (const r of p.rows) {
    const { sale, stop } = r.orders;
    if (sale)
      out.push(`<div class="pd-ord"><div><b class="mono">Vender ${num(sale.shares, 0)} ${esc(r.sym)}</b><span class="mono">${usd(sale.notional)} · realiza ${sUsd(sale.realized)} líquido</span></div><span class="pd-ord-k">venda ${num(p.sell * 100, 0)}%</span></div>`); // prettier-ignore
    if (stop)
      out.push(`<div class="pd-ord stop"><div><b class="mono">Stop ${esc(r.sym)} a ${px(stop.price)}</b><span class="mono">${num(stop.shares, 0)} cotas · ${sPct(stop.dist)} · garante ${sUsd(stop.keeps)}</span></div><span class="pd-ord-k">trava ${num(p.keep * 100, 0)}%</span></div>`); // prettier-ignore
  }
  return out.length
    ? `<div class="pd-ords">${out.join("")}</div>`
    : `<p class="pd-none">Nenhuma ponta no lucro desde o médio: sem venda nem trava.</p>`;
}

function pairCard(p, base) {
  return `<article class="pd-card">
    <header class="pd-ch"><b class="pd-name">${esc(p.key.replace("-", " × "))}</b><div class="pd-res"><b class="mono ${tone(p.pl)}">${sUsd(p.pl)}</b><span class="mono ${tone(p.plPct)}">${sPct(p.plPct)} sobre o investido${base === "day" ? " · hoje" : ""}</span></div></header>
    ${p.rows.map((r) => legRow(r, base)).join("")}
    ${ordersOf(p)}
  </article>`; // prettier-ignore
}

/** Comandos: base, custo, uma linha por dupla (Vender %, Reter %) e + dupla. Editar recalcula tudo abaixo. */
function commands(d, c, { add, list }) {
  const rows = d.pairs
    .map(
      (p, i) => `<div class="pd-cmd-row"><b class="pd-name">${esc(p.key.replace("-", " × "))}</b>
      <label class="pd-in"><span>Vender</span><input data-pd-sell="${esc(p.key)}" value="${pctIn(p.sell)}" placeholder="0" inputmode="decimal" aria-label="Vender % da ponta no lucro de ${esc(p.key)}"><i>%</i></label>
      <label class="pd-in"><span>Reter do lucro</span><input data-pd-keep="${esc(p.key)}" value="${pctIn(p.keep)}" inputmode="decimal" aria-label="Reter % do lucro com a trava em ${esc(p.key)}"><i>%</i></label>
      <button class="pd-del linkish" data-pair-del="${i}" title="Tirar a dupla do painel" aria-label="Tirar a dupla ${esc(p.key)}">×</button></div>`,
    ) // prettier-ignore
    .join("");
  return `<section class="card pd-cmd">
    <div class="pd-cmd-head"><span class="pd-lab acc">Comandos</span><span class="seg"><button data-pair-base="cost" aria-pressed="${c.base === "cost"}">Desde o médio</button><button data-pair-base="day" aria-pressed="${c.base === "day"}">Hoje</button></span></div>
    ${rows || (list.length ? "" : `<p class="pd-none">Nenhuma dupla com as duas pontas na carteira.</p>`)}
    <div class="pd-cmd-foot"><label class="pd-in wide"><span>Custo por operação</span><input id="pair-fee" value="${pctIn(c.fee)}" inputmode="decimal" aria-label="Custo por operação em %"><i>%</i></label>${add}</div>
  </section>`; // prettier-ignore
}

/** score = nota do pêndulo (1 dia); move = quanto andou em 1 h. Só leitura: não entra em nenhuma conta. */
function regimeLine(score, move) {
  if (!fin(score)) return `<div class="pd-reg"><span class="pd-lab">Pêndulo</span><span class="muted">sem leitura agora</span></div>`; // prettier-ignore
  const z = zoneOf(score);
  return `<div class="pd-reg"><span class="pd-lab">Pêndulo</span><b class="mono pd-score">${sgn(score)}${num(Math.abs(score), 0)}</b><span class="pd-zone">${esc(z?.label ?? "")}</span>${fin(move) ? `<span class="mono muted pd-move">1 h ${move >= 0 ? "▲" : "▼"} ${num(Math.abs(move), 0)}</span>` : ""}</div>`; // prettier-ignore
}

function totals(t) {
  const lp = fin(t.longPct) ? t.longPct * 100 : 0;
  return `<section class="pd-tot">
    <span class="pd-lab">Total das duplas</span>
    <div class="pd-tot-res"><b class="mono ${tone(t.pl)}">${sUsd(t.pl)}</b><span class="mono ${tone(t.plPct)}">${sPct(t.plPct)}</span></div>
    <div class="pd-tot-grid"><div><span class="pd-lab">Comprado</span><b class="mono">${usd(t.long)}</b></div><div><span class="pd-lab">Vendido</span><b class="mono">${usd(t.short)}</b></div><div class="r"><span class="pd-lab">Investido</span><span class="mono">${usd(t.inv)}</span></div></div>
    <div class="pd-mix" role="img" aria-label="${num(lp, 0)}% comprado, ${num(100 - lp, 0)}% vendido"><i style="width:${lp}%"></i></div>
  </section>`; // prettier-ignore
}

export function viewPairDesk({ score = null, move = null } = {}) {
  const rows = state.valuation?.rows ?? [];
  const held = Object.fromEntries(rows.filter((r) => r.qty > 0).map((r) => [r.sym, r]));
  const broker = withManual(state.broker, state.portfolio?.holdings, state.portfolio?.manual);
  const list = (state.prefs.pairs ?? detectPairs(Object.keys(held))).filter(([a, b]) => held[a] && held[b]); // prettier-ignore
  const c = cfg();
  const sells = state.prefs.pairSell ?? {};
  const keeps = state.prefs.pairKeep ?? {};
  const d = deskState(
    list.map((pr) => ({
      key: keyOf(pr),
      legs: pr.map((s) => legFrom(held[s], quoteOf(s))),
      sell: fin(sells[keyOf(pr)]) ? sells[keyOf(pr)] : DESK_DEFAULTS.sell,
      keep: fin(keeps[keyOf(pr)]) ? keeps[keyOf(pr)] : DESK_DEFAULTS.keep,
    })),
    c,
  );
  const fmt = (iso) => (iso ? new Date(iso).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }) : "–"); // prettier-ignore
  const photo = broker?.asOf ?? broker?.summary?.asOf ?? null;
  const src = broker
    ? `BTG ${fmt(photo)}${broker.manual ? " + ajustes ✎" : ""} · preços ao vivo`
    : "Carteira · preços ao vivo";
  const syms = Object.keys(held).sort();
  const opts = (sel) => syms.map((s) => `<option${s === sel ? " selected" : ""}>${esc(s)}</option>`).join(""); // prettier-ignore
  const add =
    list.length < MAX_PAIRS && syms.length > 1
      ? `<span class="pd-add"><select id="pair-a" aria-label="Ponta comprada">${opts()}</select> × <select id="pair-b" aria-label="Ponta vendida">${opts(syms[1])}</select> <button class="btn ghost small" data-pair-add>+ dupla</button></span>` // prettier-ignore
      : "";
  const body = !rows.length
    ? `<p class="muted">Importe a carteira para usar o painel.</p>`
    : d.pairs.length
      ? `${totals(d.total)}<div class="pd-grid">${d.pairs.map((p) => pairCard(p, d.base)).join("")}</div>`
      : `<p class="muted">Monte as duas pontas na carteira (ex.: SOXL × SOXS, SNDU × SNDQ) ou escolha em “+ dupla”.</p>`; // prettier-ignore
  return `<section class="pd">
    <div class="pd-head"><h2>Duplas L/S</h2><span class="pd-src">${src}</span>${btgButton(state.btgSync)}</div>
    ${commands(d, c, { add, list })}
    ${regimeLine(score, move)}
    ${body}
    <p class="muted small">Trava = stop no preço que retém a % escolhida do lucro da ponta desde o médio; ordens em cotas inteiras, líquidas do custo. ETF alavancado reajusta todo dia: revise a cada pregão. Material educacional; não é recomendação de investimento.</p>
  </section>`; // prettier-ignore
}

const num2 = (s) => parseFloat(String(s).replace(",", ".").replace("−", "-"));

/** Vender % e Reter % por dupla (os demais comandos — base, custo, +/× dupla — são de assets/pairs-view.js). */
export function deskChange(e) {
  const t = e.target;
  const sellK = t.dataset?.pdSell;
  const keepK = t.dataset?.pdKeep;
  if (!sellK && !keepK) return;
  const raw = String(t.value).trim();
  const v = raw ? num2(raw) : sellK ? 0 : DESK_DEFAULTS.keep * 100;
  if (!(v >= 0 && v <= 100)) return;
  const pref = sellK ? "pairSell" : "pairKeep";
  state.prefs[pref] = { ...(state.prefs[pref] ?? {}), [sellK ?? keepK]: v / 100 };
  savePrefs();
  hooks.render();
}
