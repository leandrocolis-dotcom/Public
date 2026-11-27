// Carteira › Duplas L/S: painel de controle das duplas long × short (motor em assets/pair-desk.js).
import { DESK_DEFAULTS, deskState, guardLevels } from "./pair-desk.js";
import { DEFAULT_FEE, MAX_PAIRS, detectPairs, legFrom } from "./pairs.js";
import { btgButton, qtyCheck, withManual } from "./btg.js";
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
    lock: fin(p.pairLock) ? p.pairLock : 0.5,
  };
}

const z = (t) =>
  !fin(t) ? "–" : Math.abs(t) < 0.005 ? "0%" : `${t > 0 ? "+" : "−"}${num(Math.abs(t) * 100, 0)}%`;
const act = (m) =>
  m ? `${m.side === "buy" ? "Comprar" : "Vender"} ${num(m.shares, 0)} ${esc(m.sym)}` : "–";

/** Consolidado: uma linha por dupla (mistura comprado × vendido, inclinação agora → alvo e o melhor ajuste). */
function consolidated(d) {
  const rows = d.pairs
    .map((p) => {
      const t = p.tilt;
      const other = t.options.find((m) => m !== t.pick);
      const status = t.ok ? '<span class="muted">na folga</span>' : `<b class="${t.delta >= 0 ? "up" : "down"}">${t.delta >= 0 ? "comprar exposição" : "reduzir exposição"}</b>`; // prettier-ignore
      return `<tr><td><b>${esc(p.key.replace("-", " × "))}</b></td><td class="num">${plain(p.mix.longPct, 0)}<br><span class="muted small">${usd(p.mix.long)}</span></td><td class="num">${plain(p.mix.shortPct, 0)}<br><span class="muted small">${usd(p.mix.short)}</span></td><td class="num">${z(t.now)} → <b>${z(t.want)}</b><br><span class="muted small">${t.manual ? "alvo manual" : "pelo regime"} · ${status}</span></td><td>${t.pick ? `★ <b>${act(t.pick)}</b><br><span class="muted small">${usd(t.pick.notional)} · ${t.pick.side === "sell" ? `realiza ${usd(t.pick.realized)}` : `usa ${usd(-t.pick.cashDelta)} do caixa`}</span>` : '<span class="muted">nada a fazer</span>'}</td><td>${other ? `${act(other)}<br><span class="muted small">${other.side === "sell" ? `realiza ${usd(other.realized)}` : `usa ${usd(-other.cashDelta)} do caixa${other.fits ? "" : " (sem caixa livre)"}`}</span>` : "–"}</td></tr>`; // prettier-ignore
    })
    .join("");
  const t = d.total;
  const totalRow = `<tr class="pd-total"><td><b>Total das duplas</b></td><td class="num">${plain(t.gross > 0 ? t.long / t.gross : null, 0)}<br><span class="muted small">${usd(t.long)}</span></td><td class="num">${plain(t.gross > 0 ? t.short / t.gross : null, 0)}<br><span class="muted small">${usd(t.short)}</span></td><td class="num"><b>${z(t.tilt)}</b><br><span class="muted small">líquido ${usd(t.net)}</span></td><td colspan="2" class="small muted">${fin(d.score) ? `Alvo pelo regime agora: ${z((d.score / 100) * d.cfg.maxTilt)}` : ""}</td></tr>`; // prettier-ignore
  return `<section class="card pd-cons"><h3>Exposição consolidada</h3>
    <div class="table-wrap"><table class="cal-table"><thead><tr><th>Dupla</th><th>Comprado</th><th>Vendido</th><th>Inclinação → alvo</th><th>Melhor ajuste</th><th>Outra opção</th></tr></thead><tbody>${rows}${totalRow}</tbody></table></div>
    <div class="pd-txt">Exposição no ativo-base = valor × alavancagem (SOXL 3x, SOXS −3x…). Inclinação = líquido ÷ bruto: +100% todo comprado, −100% todo vendido. ★ = maior lucro realizado ou menor prejuízo; comprar só usa o caixa acima da reserva.</div></section>`; // prettier-ignore
}

function moveRow(m, best) {
  return `<tr class="${m === best ? "pd-best" : ""}"><td>${m === best ? "★ " : ""}<b>${m.side === "buy" ? "Comprar" : "Vender"} ${num(m.shares, 0)} ${esc(m.sym)}</b></td><td class="num">${usd(m.notional)}</td><td class="num">${usd(m.cost)}</td><td class="num">${m.side === "sell" ? usd(m.realized) : "–"}</td><td class="num">${usd(m.cashDelta)}</td><td class="small">${m.side === "buy" && !m.fits ? '<span class="down">sem caixa livre</span>' : m.full === false ? "vende tudo e não basta" : ""}</td></tr>`; // prettier-ignore
}

function pairCard(p, d, i, account) {
  const { st, exit, tilt, goal, key } = p;
  const legs = st.rows
    .map(
      (r) =>
        `<tr data-hold="${esc(r.sym)}" tabindex="0"><td><b>${esc(r.sym)}</b> <button class="pf-edit" data-action="hold-edit" data-hold-sym="${esc(r.sym)}" title="Editar quantidade e preço médio" aria-label="Editar posição de ${esc(r.sym)}">✎</button> <span class="muted small">${r.lev > 0 ? "+" : "−"}${num(Math.abs(r.lev), r.lev % 1 ? 1 : 0)}x</span></td><td class="num">${num(r.qty, r.qty % 1 ? 2 : 0)}</td><td class="num">${num(r.price, 2)}</td><td class="num">${num(r.avg, 2)}</td><td class="num">${pct(r.move)}</td><td class="num">${usd(r.pl)}</td><td class="num">${usd(r.expo)}</td></tr>`,
    ) // prettier-ignore
    .join("");
  const e = exit.plan;
  const after = e ? d.money.cash + e.notional - e.cost : null;
  const exitTxt = exit.hit
    ? `<div class="pd-hit">🎯 <b>Alvo batido.</b> Vender <b>${num(e.shares, 0)} ${esc(e.sym)}</b> (≈ ${usd(e.notional)}) embolsa <b>${usd(e.realized)}</b> líquido (custo ${usd(e.cost)}). Caixa vai a ${usd(after)}${after >= d.money.want ? " (reserva coberta)" : ` (reserva pede ${usd(d.money.want)})`}.</div>` // prettier-ignore
    : `<div class="pd-txt">Falta ${plain(account > 0 ? exit.gap / account : null, 2)} da conta para o alvo (${usd(exit.gap)}).</div>`;
  const src = tilt.manual ? "alvo manual" : "alvo pelo regime";
  const mixTxt = `Comprado <b>${plain(p.mix.longPct, 0)}</b> (${usd(p.mix.long)}) × vendido <b>${plain(p.mix.shortPct, 0)}</b> (${usd(p.mix.short)}) no ativo-base.`; // prettier-ignore
  const opts = tilt.options.length
    ? `<div class="table-wrap"><table class="cal-table pd-moves"><thead><tr><th>Ação</th><th>Valor</th><th>Custo</th><th>Realiza</th><th>Caixa</th><th></th></tr></thead><tbody>${tilt.options.map((m) => moveRow(m, tilt.pick)).join("")}</tbody></table></div>` // prettier-ignore
    : "";
  const tiltTxt = `<div class="pd-txt">${mixTxt} Inclinação <b>${z(tilt.now)}</b> · ${src} <b>${z(tilt.want)}</b>${tilt.ok ? ": <b>dentro da folga</b>" : ` (${tilt.delta >= 0 ? "mais comprado" : "mais vendido"} em ${usd(Math.abs(tilt.delta))} de exposição)`}.${tilt.pick ? ` ${tilt.ok ? "Para chegar ao alvo exato" : "★"} ${esc(tilt.why)}.` : ""}</div>${opts}`; // prettier-ignore
  // ordens de saída da dupla inteira: alvo (meta) e trava (parte da meta garantida se o regime virar)
  const g = guardLevels(st, { goalUsd: goal * account, lock: cfg().lock, fee: cfg().fee });
  const ord = (l) =>
    !l?.ok ? "–" : `<b>${num(l.at, 2)}</b> <span class="muted small">${l.order === "limit" ? "venda limitada (se subir)" : "stop de venda (se cair)"} · ${pct(l.move, 1)}</span>`; // prettier-ignore
  const pairPct = (usdAmt) =>
    st.value > 0 ? ` · ${plain(usdAmt / st.value, 1)} do capital da dupla` : "";
  const guardTxt = g.target.flat
    ? `<div class="pd-txt">Dupla neutra: o preço do ativo-base não muda o resultado, então não há preço de alvo nem de trava. Incline a dupla para um lado primeiro.</div>` // prettier-ignore
    : `<div class="table-wrap"><table class="cal-table pd-moves"><thead><tr><th>Ponta</th><th>Agora</th><th>🎯 Alvo ${plain(goal, 1)} da conta (${usd(g.goalUsd)})</th><th>🔒 Trava ${plain(g.lockUsd / (account || 1), 2)} (${usd(g.lockUsd)})</th></tr></thead><tbody>${g.target.legs
        .map((l, k) => `<tr><td><b>${esc(l.sym)}</b></td><td class="num">${num(l.price, 2)}</td><td>${ord(l)}</td><td>${ord(g.guard.legs?.[k])}</td></tr>`)
        .join("")}</tbody></table></div>
       <div class="pd-txt">Zerando as duas pontas nesses preços (com o custo), a dupla fecha com o resultado da coluna.${pairPct(g.goalUsd)} Hoje, zerando tudo: ${usd(g.now)}. ${g.armed ? "🔒 Trava armada: o par já ganha mais que ela; deixe as duas ordens da trava na corretora." : `🔒 Trava ainda não armada: o par ganha ${usd(g.now)}, menos que a trava (${usd(g.lockUsd)}); ela passa a valer quando o resultado passar disso.`} Preços estimados por um movimento do ativo-base (ETF alavancado reajusta todo dia; revise a cada pregão).</div>`; // prettier-ignore
  return `<article class="pr-card pd-card">
    <header class="pr-h"><b>${esc(key.replace("-", " × "))}</b>
      <span class="pr-net">${pct(st.grossPct, 2)} <span class="muted small">${usd(st.gross)} ${cfg().base === "day" ? "hoje" : "desde o médio"}</span></span>
      <button class="linkish small" data-pair-del="${i}" aria-label="Tirar a dupla">×</button></header>
    <div class="table-wrap"><table class="cal-table"><thead><tr><th>Ponta</th><th>Cotas</th><th>Preço</th><th>Médio</th><th>Andou</th><th>Resultado</th><th>Exposição</th></tr></thead><tbody>${legs}</tbody></table></div>
    <div class="pd-sec"><label class="small">Alvo de saída da dupla (% da conta) <input class="rfx-in pr-in" data-desk-goal="${esc(key)}" value="${pctIn(goal)}" inputmode="decimal"></label>${exitTxt}</div>
    <div class="pd-sec"><b class="small">Ordens de saída (alvo e trava)</b>${guardTxt}</div>
    <div class="pd-sec"><label class="small">Ajuste da exposição · alvo de inclinação (%) <input class="rfx-in pr-in" data-desk-tilt="${esc(key)}" value="${tilt.manual ? pctIn(tilt.want) : ""}" placeholder="regime" inputmode="decimal" title="Vazio = pelo regime. Ex.: 30 = 30% mais comprado; −20 = 20% mais vendido."></label>${tiltTxt}</div>
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
  const tilts = state.prefs.pairTilts ?? {};
  const d = deskState(
    list.map((pr) => ({
      key: keyOf(pr),
      legs: pr.map((s) => legFrom(held[s], quoteOf(s))),
      goal: fin(goals[keyOf(pr)]) ? goals[keyOf(pr)] : undefined,
      tilt: fin(tilts[keyOf(pr)]) ? tilts[keyOf(pr)] : null,
    })),
    { account, cash, score, move, cfg: c },
  );
  // quantidades = foto do BTG + ajustes do ✎; preço = cotação ao vivo do app (não o da foto)
  const fmt = (iso) => (iso ? new Date(iso).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }) : "–"); // prettier-ignore
  const photo = broker?.asOf ?? broker?.summary?.asOf ?? null;
  const qc =
    broker?.summary?.offshore?.positionsStale && !broker.manual
      ? qtyCheck(
          broker.summary.offshore.investedUsd,
          state.valuation?.total,
          Date.parse(photo ?? ""),
        )
      : null;
  const qcTxt = !qc
    ? ""
    : qc.ok
      ? " ✓ Quantidades conferem com o total investido do BTG."
      : ` <span class="down">⚠ Quantidades não batem com o BTG (investido US$ ${num(qc.btg, 0)} × quantidades US$ ${num(qc.mine, 0)}): comprou ou vendeu? Corrija no ✎ da ponta.</span>`; // prettier-ignore
  const srcTxt = broker
    ? `Leitura do BTG de ${fmt(photo)}${broker.manual ? " + ajustes do ✎" : ""}: quantidades e caixa. Preços ao vivo.${qcTxt}` // prettier-ignore
    : "Quantidades da Carteira; preços ao vivo.";
  const zone = fin(score) ? zoneOf(score) : null;
  const regimeTxt = fin(score)
    ? `Pêndulo <b>${score >= 0 ? "+" : "−"}${num(Math.abs(score), 0)}</b> (${esc(zone?.label ?? "")})${fin(move) ? ` · 1h ${move >= 0 ? "▲" : "▼"} ${num(Math.abs(move), 0)}` : ""}` // prettier-ignore
    : "Pêndulo sem leitura agora";
  const turn = d.turning
    ? `<p class="pf-btg-warn">↻ O regime está virando ${d.turning > 0 ? "para alta" : "para baixa"} (${move >= 0 ? "+" : "−"}${num(Math.abs(move), 0)} pontos em 1h) contra a inclinação das duplas. Veja o ajuste de cada uma.</p>` // prettier-ignore
    : "";
  const m = d.money;
  const cashTxt = fin(cash)
    ? `Caixa <b>${usd(cash)}</b> <button class="pf-edit" data-action="btg-cash-edit" title="Editar caixa" aria-label="Editar caixa em dólar">✎</button> (${plain(m.share, 1)} da conta) · reserva-alvo ${usd(m.want)} · ${m.short > 0 ? `<span class="down">faltam ${usd(m.short)}</span>` : `livre para comprar ${usd(m.free)}`}` // prettier-ignore
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
      ? consolidated(d) + d.pairs.map((p, i) => pairCard(p, d, i, account)).join("")
      : `<p class="muted">Nenhuma dupla na carteira. Monte as duas pontas (ex.: SOXL × SOXS, SNDU × SNDQ, UVIX × SVIX) ou escolha abaixo.</p>`; // prettier-ignore
  return `<section class="pd">
    <section class="card pr">
      <div class="pd-head"><h2>⇅ Duplas long × short</h2>${btgButton(state.btgSync)}</div>
      <div class="pd-txt">${srcTxt}</div>
      <div class="pd-txt">${regimeTxt} · ${cashTxt} · conta ${usd(account)}</div>
      ${turn}
      <div class="pr-cfg small">
        <span class="seg"><button data-pair-base="cost" aria-pressed="${c.base === "cost"}">Desde o médio</button><button data-pair-base="day" aria-pressed="${c.base === "day"}">Hoje</button></span>
        <label>Reserva de caixa (%) <input id="desk-reserve" class="rfx-in pr-in" value="${pctIn(c.reserve)}" inputmode="decimal"></label>
        <label>Inclinação máx. (%) <input id="desk-tilt" class="rfx-in pr-in" value="${pctIn(c.maxTilt)}" inputmode="decimal"></label>
        <label>Trava (% do alvo) <input id="desk-lock" class="rfx-in pr-in" value="${pctIn(c.lock)}" inputmode="decimal" title="Quanto do alvo garantir com ordens de saída se o regime virar. Ex.: alvo 10% e trava 50% = garantir 5%."></label>
        <label>Custo por operação (%) <input id="pair-fee" class="rfx-in pr-in" value="${pctIn(c.fee)}" inputmode="decimal"></label>
        ${add}
      </div>
      <p class="muted small">Alvo de saída: quanto vender da ponta vencedora para embolsar o alvo líquido do custo. Ajuste pelo regime: a nota do pêndulo (−100 a +100) vira a inclinação-alvo da dupla (nota ÷ 100 × inclinação máx.; folga de 10 p.p.); entre vender uma ponta ou comprar a outra, ★ é o de maior lucro / menor prejuízo que respeita a reserva de caixa. Vender realiza contra o preço médio.</p>
    </section>
    ${body}
    <p class="muted small">ETF alavancado perde por volatilidade com o tempo. Material educacional; não é recomendação de investimento.</p>
  </section>`;
}

const num2 = (s) => parseFloat(String(s).replace(",", "."));

export function deskChange(e) {
  const t = e.target;
  if (t.id === "desk-reserve" || t.id === "desk-tilt" || t.id === "desk-lock") {
    const v = num2(t.value);
    if (!(v >= 0 && v <= 100)) return;
    state.prefs[{ "desk-reserve": "deskReserve", "desk-tilt": "deskMaxTilt", "desk-lock": "pairLock" }[t.id]] = v / 100; // prettier-ignore
  } else if (t.dataset?.deskTilt) {
    const k = t.dataset.deskTilt;
    const next = { ...(state.prefs.pairTilts ?? {}) };
    const raw = String(t.value).trim();
    if (!raw)
      delete next[k]; // vazio = volta ao regime
    else {
      const v = num2(raw.replace("−", "-"));
      if (!(v >= -100 && v <= 100)) return;
      next[k] = v / 100;
    }
    state.prefs.pairTilts = next;
  } else if (t.dataset?.deskGoal) {
    const v = num2(t.value);
    if (!(v > 0 && v <= 50)) return;
    state.prefs.pairGoals = { ...(state.prefs.pairGoals ?? {}), [t.dataset.deskGoal]: v / 100 };
  } else return;
  savePrefs();
  hooks.render();
}
