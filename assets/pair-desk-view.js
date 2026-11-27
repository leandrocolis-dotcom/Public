// Carteira › Duplas L/S: painel de controle das duplas long × short (motor em assets/pair-desk.js).
import { DESK_DEFAULTS, deskState } from "./pair-desk.js";
import { DEFAULT_FEE, MAX_PAIRS, detectPairs, legFrom } from "./pairs.js";
import { withManual } from "./btg.js";
import { quoteOf } from "./asset-pop.js";
import { zoneOf } from "./regime-zones.js";
import { esc, num } from "./format.js";
import { hooks, savePrefs, state } from "./state.js";

const fin = Number.isFinite;
const usd = (x, d = 0) => (fin(x) ? `${x < 0 ? "−" : ""}US$ ${num(Math.abs(x), d)}` : "–");
const pct = (x, d = 1) =>
  fin(x) ? `<span class="${x >= 0 ? "up" : "down"}">${x >= 0 ? "+" : "−"}${num(Math.abs(x) * 100, d)}%</span>` : "–"; // prettier-ignore
const plain = (x, d = 0) => (fin(x) ? `${num(x * 100, d)}%` : "–");
const keyOf = ([a, b]) => `${a}-${b}`;
const pctIn = (x) => (fin(x) ? String(Math.round(x * 1000) / 10).replace(".", ",") : "");

function cfg() {
  const p = state.prefs;
  return {
    reserve: fin(p.deskReserve) ? p.deskReserve : DESK_DEFAULTS.reserve,
    maxTilt: fin(p.deskMaxTilt) ? p.deskMaxTilt : DESK_DEFAULTS.maxTilt,
    fee: fin(p.pairFee) ? p.pairFee : DEFAULT_FEE,
    base: p.pairBase === "day" ? "day" : "cost",
  };
}

function moveRow(m, best) {
  return `<tr class="${m === best ? "pd-best" : ""}"><td>${m === best ? "★ " : ""}<b>${m.side === "buy" ? "Comprar" : "Vender"} ${num(m.shares, 0)} ${esc(m.sym)}</b></td><td class="num">${usd(m.notional)}</td><td class="num">${usd(m.cost)}</td><td class="num">${m.side === "sell" ? usd(m.realized) : "–"}</td><td class="num">${usd(m.cashDelta)}</td><td class="small">${m.side === "buy" && !m.fits ? '<span class="down">sem caixa livre</span>' : m.full === false ? "vende tudo e não basta" : ""}</td></tr>`; // prettier-ignore
}

function pairCard(p, d, i, account) {
  const { st, exit, tilt, goal, key } = p;
  const legs = st.rows
    .map(
      (r) =>
        `<tr data-hold="${esc(r.sym)}" tabindex="0"><td><b>${esc(r.sym)}</b> <span class="muted small">${r.lev > 0 ? "+" : "−"}${num(Math.abs(r.lev), r.lev % 1 ? 1 : 0)}x</span></td><td class="num">${num(r.qty, r.qty % 1 ? 2 : 0)}</td><td class="num">${num(r.price, 2)}</td><td class="num">${num(r.avg, 2)}</td><td class="num">${pct(r.move)}</td><td class="num">${usd(r.pl)}</td><td class="num">${usd(r.expo)}</td></tr>`,
    ) // prettier-ignore
    .join("");
  const e = exit.plan;
  const after = e ? d.money.cash + e.notional - e.cost : null;
  const exitTxt = exit.hit
    ? `<div class="pd-hit">🎯 <b>Alvo batido.</b> Vender <b>${num(e.shares, 0)} ${esc(e.sym)}</b> (≈ ${usd(e.notional)}) embolsa <b>${usd(e.realized)}</b> líquido (custo ${usd(e.cost)}). Caixa vai a ${usd(after)}${after >= d.money.want ? " (reserva coberta)" : ` (reserva pede ${usd(d.money.want)})`}.</div>` // prettier-ignore
    : `<div class="pd-txt">Falta ${plain(account > 0 ? exit.gap / account : null, 2)} da conta para o alvo (${usd(exit.gap)}).</div>`;
  const z = (t) =>
    Math.abs(t) < 0.005 ? "0%" : `${t > 0 ? "+" : "−"}${num(Math.abs(t) * 100, 0)}%`;
  const tiltTxt = tilt.ok
    ? `<div class="pd-txt">Inclinação ${z(tilt.now)} · alvo pelo regime ${z(tilt.want)}: <b>dentro da folga</b>, nada a fazer.</div>`
    : `<div class="pd-txt">Inclinação <b>${z(tilt.now)}</b> · alvo pelo regime <b>${z(tilt.want)}</b> (${tilt.delta >= 0 ? "mais comprado" : "mais vendido"} em ${usd(Math.abs(tilt.delta))} de exposição).${tilt.pick ? ` ★ ${esc(tilt.why)}.` : ` ${esc(tilt.why)}.`}</div>
       <div class="table-wrap"><table class="cal-table pd-moves"><thead><tr><th>Ação</th><th>Valor</th><th>Custo</th><th>Realiza</th><th>Caixa</th><th></th></tr></thead><tbody>${tilt.options.map((m) => moveRow(m, tilt.pick)).join("")}</tbody></table></div>`; // prettier-ignore
  return `<article class="pr-card pd-card">
    <header class="pr-h"><b>${esc(key.replace("-", " × "))}</b>
      <span class="pr-net">${pct(st.grossPct, 2)} <span class="muted small">${usd(st.gross)} ${cfg().base === "day" ? "hoje" : "desde o médio"}</span></span>
      <button class="linkish small" data-pair-del="${i}" aria-label="Tirar a dupla">×</button></header>
    <div class="table-wrap"><table class="cal-table"><thead><tr><th>Ponta</th><th>Cotas</th><th>Preço</th><th>Médio</th><th>Andou</th><th>Resultado</th><th>Exposição</th></tr></thead><tbody>${legs}</tbody></table></div>
    <div class="pd-sec"><label class="small">Alvo de saída da dupla (% da conta) <input class="rfx-in pr-in" data-desk-goal="${esc(key)}" value="${pctIn(goal)}" inputmode="decimal"></label>${exitTxt}</div>
    <div class="pd-sec"><b class="small">Ajuste pelo regime</b>${tiltTxt}</div>
  </article>`;
}

/** score = nota do pêndulo (1 dia); move = quanto andou em 1h. */
export function viewPairDesk({ score = null, move = null } = {}) {
  const rows = state.valuation?.rows ?? [];
  const held = Object.fromEntries(rows.filter((r) => r.qty > 0).map((r) => [r.sym, r]));
  const broker = withManual(state.broker, state.portfolio?.holdings, state.portfolio?.manual);
  const cash = broker?.summary?.offshore?.cashUsd ?? null;
  const account = (state.valuation?.total ?? 0) + (fin(cash) ? cash : 0);
  const list = (state.prefs.pairs ?? detectPairs(Object.keys(held))).filter(([a, b]) => held[a] && held[b]); // prettier-ignore
  const c = cfg();
  const goals = state.prefs.pairGoals ?? {};
  const d = deskState(
    list.map((pr) => ({
      key: keyOf(pr),
      legs: pr.map((s) => legFrom(held[s], quoteOf(s))),
      goal: fin(goals[keyOf(pr)]) ? goals[keyOf(pr)] : undefined,
    })),
    { account, cash, score, move, cfg: c },
  );
  const zone = fin(score) ? zoneOf(score) : null;
  const regimeTxt = fin(score)
    ? `Pêndulo <b>${score >= 0 ? "+" : "−"}${num(Math.abs(score), 0)}</b> (${esc(zone?.label ?? "")})${fin(move) ? ` · 1h ${move >= 0 ? "▲" : "▼"} ${num(Math.abs(move), 0)}` : ""}` // prettier-ignore
    : "Pêndulo sem leitura agora";
  const turn = d.turning
    ? `<p class="pf-btg-warn">↻ O regime está virando ${d.turning > 0 ? "para alta" : "para baixa"} (${move >= 0 ? "+" : "−"}${num(Math.abs(move), 0)} pontos em 1h) contra a inclinação das duplas. Veja o ajuste de cada uma.</p>` // prettier-ignore
    : "";
  const m = d.money;
  const cashTxt = fin(cash)
    ? `Caixa <b>${usd(cash)}</b> (${plain(m.share, 1)} da conta) · reserva-alvo ${usd(m.want)} · ${m.short > 0 ? `<span class="down">faltam ${usd(m.short)}</span>` : `livre para comprar ${usd(m.free)}`}` // prettier-ignore
    : "Caixa: sem foto do BTG (compras não são sugeridas)";
  const syms = Object.keys(held).sort();
  const opts = (sel) => syms.map((s) => `<option${s === sel ? " selected" : ""}>${esc(s)}</option>`).join(""); // prettier-ignore
  const add =
    list.length < MAX_PAIRS && syms.length > 1
      ? `<span class="pr-add"><select id="pair-a" aria-label="Ponta comprada">${opts()}</select> × <select id="pair-b" aria-label="Ponta vendida">${opts(syms[1])}</select> <button class="btn ghost small" data-pair-add>+ dupla</button></span>` // prettier-ignore
      : "";
  const body = !(account > 0)
    ? `<p class="muted">Importe a carteira para usar o painel.</p>`
    : d.pairs.length
      ? d.pairs.map((p, i) => pairCard(p, d, i, account)).join("")
      : `<p class="muted">Nenhuma dupla na carteira. Monte as duas pontas (ex.: SOXL × SOXS, SNDU × SNDQ, UVIX × SVIX) ou escolha abaixo.</p>`; // prettier-ignore
  return `<section class="pd">
    <section class="card pr">
      <h2>⇅ Duplas long × short</h2>
      <div class="pd-txt">${regimeTxt} · ${cashTxt} · conta ${usd(account)}</div>
      ${turn}
      <div class="pr-cfg small">
        <span class="seg"><button data-pair-base="cost" aria-pressed="${c.base === "cost"}">Desde o médio</button><button data-pair-base="day" aria-pressed="${c.base === "day"}">Hoje</button></span>
        <label>Reserva de caixa (%) <input id="desk-reserve" class="rfx-in pr-in" value="${pctIn(c.reserve)}" inputmode="decimal"></label>
        <label>Inclinação máx. (%) <input id="desk-tilt" class="rfx-in pr-in" value="${pctIn(c.maxTilt)}" inputmode="decimal"></label>
        <label>Custo por operação (%) <input id="pair-fee" class="rfx-in pr-in" value="${pctIn(c.fee)}" inputmode="decimal"></label>
        ${add}
      </div>
      <p class="muted small">Alvo de saída: quanto vender da ponta vencedora para embolsar o alvo líquido do custo. Ajuste pelo regime: a nota do pêndulo (−100 a +100) vira a inclinação-alvo da dupla (nota ÷ 100 × inclinação máx.; folga de 10 p.p.); entre vender uma ponta ou comprar a outra, ★ é o de maior lucro / menor prejuízo que respeita a reserva de caixa. Vender realiza contra o preço médio.</p>
    </section>
    ${body}
    <p class="muted small">Exterior ativo a ativo vem da última foto completa do BTG mais os ajustes do ✎; preços ao vivo. ETF alavancado perde por volatilidade com o tempo. Material educacional; não é recomendação de investimento.</p>
  </section>`;
}

const num2 = (s) => parseFloat(String(s).replace(",", "."));

export function deskChange(e) {
  const t = e.target;
  if (t.id === "desk-reserve" || t.id === "desk-tilt") {
    const v = num2(t.value);
    if (!(v >= 0 && v <= 100)) return;
    state.prefs[t.id === "desk-reserve" ? "deskReserve" : "deskMaxTilt"] = v / 100;
  } else if (t.dataset?.deskGoal) {
    const v = num2(t.value);
    if (!(v > 0 && v <= 50)) return;
    state.prefs.pairGoals = { ...(state.prefs.pairGoals ?? {}), [t.dataset.deskGoal]: v / 100 };
  } else return;
  savePrefs();
  hooks.render();
}
