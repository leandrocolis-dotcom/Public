// Carteira › Duplas L/S: painel de controle das duplas long × short (motor em assets/pair-desk.js).
// Desenho "Fiel da Balança" (docs/design/DUPLAS.md + duplas-canvas.png): faixa de comando no topo; por dupla,
// resultado → balança (a divisão comprado|vendido é a agulha; marca = alvo; moldura = folga) → próxima ação como
// ordem pronta → régua do alvo de saída → ordens na corretora → pontas. Parâmetros e "como ler" recolhidos.
import { DESK_DEFAULTS, deskState, guardLevels } from "./pair-desk.js";
import { DEFAULT_FEE, MAX_PAIRS, detectPairs, legFrom } from "./pairs.js";
import { btgButton, qtyCheck, withManual } from "./btg.js";
import { quoteOf } from "./asset-pop.js";
import { zoneOf } from "./regime-zones.js";
import { esc, num } from "./format.js";
import { hooks, savePrefs, state } from "./state.js";

const fin = Number.isFinite;
const clamp = (x, lo, hi) => Math.max(lo, Math.min(hi, x));
const usd = (x, d = 0) => (fin(x) ? `${x < 0 ? "−" : ""}US$ ${num(Math.abs(x), d)}` : "–");
const sgnUsd = (x, d = 0) => (fin(x) ? `${x > 0 ? "+" : x < 0 ? "−" : ""}US$ ${num(Math.abs(x), d)}` : "–"); // prettier-ignore
const tone = (x) => (!fin(x) || Math.abs(x) < 0.005 ? "" : x > 0 ? "up" : "down");
const pct = (x, d = 1) =>
  fin(x) ? `<span class="${x >= 0 ? "up" : "down"}">${x >= 0 ? "+" : "−"}${num(Math.abs(x) * 100, d)}%</span>` : "–"; // prettier-ignore
const plain = (x, d = 0) => (fin(x) ? `${num(x * 100, d)}%` : "–");
const keyOf = ([a, b]) => `${a}-${b}`;
const pctIn = (x) => (fin(x) ? String(Math.round(x * 1000) / 10).replace(".", ",") : "");
const z = (t) =>
  !fin(t) ? "–" : Math.abs(t) < 0.005 ? "0%" : `${t > 0 ? "+" : "−"}${num(Math.abs(t) * 100, 0)}%`;
const act = (m) =>
  m ? `${m.side === "buy" ? "Comprar" : "Vender"} ${num(m.shares, 0)} ${esc(m.sym)}` : "–";
const effect = (m) =>
  m.side === "sell" ? `realiza ${sgnUsd(m.realized)}` : `usa ${usd(-m.cashDelta)} do caixa${m.fits ? "" : " (sem caixa livre)"}`; // prettier-ignore
/** Posição na balança (0–100%): −100% (todo vendido) na esquerda, +100% (todo comprado) na direita. */
const pos = (v) => clamp(((1 + v) / 2) * 100, 0, 100);

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

/**
 * Balança: barra comprado (cheio, cresce da esquerda até a agulha) | vendido (esmaecido). A divisão = inclinação;
 * marca do alvo e moldura da folga na mesma escala (a fração comprada é exatamente a posição da agulha).
 */
function balance({ tilt, want, band, longPct, shortPct, label, small = false }) {
  const t = fin(tilt) ? tilt : 0;
  const has = fin(want);
  const b0 = has ? pos(want - band) : 0;
  const b1 = has ? pos(want + band) : 0;
  const aria = `Postura ${z(t)}${has ? `, alvo ${z(want)}` : ""}: ${plain(longPct, 0)} comprado, ${plain(shortPct, 0)} vendido`; // prettier-ignore
  return `<div class="pd-bal${small ? " sm" : ""}" role="img" aria-label="${esc(aria)}">
    <div class="pd-bal-track"><div class="pd-bal-long" style="width:${pos(t)}%"></div>${has ? `<div class="pd-bal-band" style="left:${b0}%;width:${b1 - b0}%"></div><div class="pd-bal-want" style="left:${pos(want)}%"></div>` : ""}<div class="pd-bal-zero"></div><div class="pd-bal-needle" style="left:${pos(t)}%"></div></div>
    <div class="pd-bal-lbl"><span>${plain(longPct, 0)} comprado</span><b>${label}</b><span class="muted">${plain(shortPct, 0)} vendido</span></div>
  </div>`; // prettier-ignore
}

/** Régua 0 → teto: preenchimento (frac) e marca (mark, 0–1). kind: "" | "hit" | "warn". */
const ruler = (frac, mark, kind = "") =>
  `<div class="pd-rule" aria-hidden="true"><div class="pd-rule-fill ${kind}" style="width:${clamp(frac, 0, 1) * 100}%"></div>${fin(mark) ? `<i class="pd-rule-mark" style="left:${clamp(mark, 0, 1) * 100}%"></i>` : ""}</div>`; // prettier-ignore

/** Faixa de comando: pêndulo · total das duplas · caixa × reserva · o que pede a mão. */
function command(d, { score, move, cash, account, pending }) {
  const zone = fin(score) ? zoneOf(score) : null;
  const pend = fin(score)
    ? `<div class="pd-big">${score >= 0 ? "+" : "−"}${num(Math.abs(score), 0)}</div><div class="pd-cell-sub">${esc(zone?.label ?? "")}${fin(move) ? `<br><span class="mono">1 h ${move >= 0 ? "▲" : "▼"} ${num(Math.abs(move), 0)}</span>` : ""}</div>` // prettier-ignore
    : `<div class="pd-cell-sub">sem leitura agora</div>`;
  const t = d.total;
  const regWant = fin(score) ? (score / 100) * d.cfg.maxTilt : null;
  const tot =
    t.gross > 0
      ? balance({ tilt: t.tilt, want: regWant, band: d.cfg.band, longPct: t.long / t.gross, shortPct: t.short / t.gross, label: `${z(t.tilt)}${fin(regWant) ? ` → ${z(regWant)}` : ""}`, small: true }) // prettier-ignore
      : `<div class="pd-cell-sub">sem exposição</div>`;
  const m = d.money;
  const top = Math.max(m.cash, m.want, 1);
  const cashCell = fin(cash)
    ? `<div class="pd-mid">${usd(cash)} <button class="pf-edit" data-action="btg-cash-edit" title="Editar caixa" aria-label="Editar caixa em dólar">✎</button></div>${ruler(m.cash / top, m.want / top, m.short > 0 ? "warn" : "")}<div class="pd-cell-sub">reserva ${usd(m.want)} · ${m.short > 0 ? `<b class="wait">faltam ${usd(m.short)}</b>` : `livre ${usd(m.free)}`}</div>` // prettier-ignore
    : `<div class="pd-cell-sub">sem foto do BTG: compras não são sugeridas</div>`;
  const status = pending
    ? `<div class="pd-status warn"><b>${pending} ${pending > 1 ? "duplas pedem" : "dupla pede"}</b><span>ação agora</span><span class="mono small">conta ${usd(account)}</span></div>` // prettier-ignore
    : `<div class="pd-status"><b>Tudo na folga</b><span>nada a fazer</span><span class="mono small">conta ${usd(account)}</span></div>`; // prettier-ignore
  return `<div class="pd-cmd">
    <div class="pd-cell"><span class="pd-lab">Pêndulo · 1 dia</span><div class="pd-pend">${pend}</div></div>
    <div class="pd-cell wide"><span class="pd-lab">Total das duplas · alvo do regime</span>${tot}</div>
    <div class="pd-cell"><span class="pd-lab">Caixa × reserva</span>${cashCell}</div>
    ${status}
  </div>`;
}

/** Próxima ação: alvo batido (verde) > ajuste fora da folga (★ acento) > na folga (calmo). */
function nextAction(p, d) {
  const { exit, tilt } = p;
  const e = exit.plan;
  const other = tilt.options.find((m) => m !== tilt.pick);
  const tiltLine = tilt.pick
    ? `${tilt.ok ? "Para o alvo exato" : "Ajuste"}: ${act(tilt.pick)} · ${effect(tilt.pick)}`
    : "";
  if (exit.hit && e) {
    const after = d.money.cash + e.notional - e.cost;
    return `<div class="pd-act hit"><div class="pd-act-row"><b>🎯 Alvo batido · Vender ${num(e.shares, 0)} ${esc(e.sym)}</b><span class="pd-act-val">${usd(e.notional)}</span></div><div class="pd-act-sub">embolsa ${sgnUsd(e.realized)} líquido (custo ${usd(e.cost)}) · caixa vai a ${usd(after)}${after >= d.money.want ? "" : ` · reserva pede ${usd(d.money.want)}`}</div></div>${tilt.ok ? "" : `<div class="pd-alt">★ ${tiltLine}</div>`}`; // prettier-ignore
  }
  if (!tilt.ok && tilt.pick) {
    return `<div class="pd-act go" title="${esc(tilt.why ?? "")}"><div class="pd-act-row"><b><span class="pd-star" aria-hidden="true">★</span> ${act(tilt.pick)}</b><span class="pd-act-val">${usd(tilt.pick.notional)}</span></div><div class="pd-act-sub">${effect(tilt.pick)} · leva a dupla a ${z(tilt.want)}</div></div>${other ? `<div class="pd-alt">ou ${act(other)} · ${effect(other)}</div>` : ""}`; // prettier-ignore
  }
  if (!tilt.ok)
    return `<div class="pd-act go"><div class="pd-act-row"><b>Fora da folga</b></div><div class="pd-act-sub">${esc(tilt.why ?? "sem ação possível")}</div></div>`; // prettier-ignore
  return `<div class="pd-act calm"><div class="pd-act-row"><b>Na folga · nada a fazer</b></div><div class="pd-act-sub">${exit.gap > 0 ? `faltam ${usd(exit.gap)} para o alvo de saída` : "postura dentro da faixa"}</div></div>${tiltLine ? `<div class="pd-alt">${tiltLine}</div>` : ""}`; // prettier-ignore
}

function orders(st, goal, account) {
  const c = cfg();
  const g = guardLevels(st, { goalUsd: goal * account, lock: c.lock, fee: c.fee });
  if (g.target.flat)
    return `<div class="pd-note">Dupla neutra: o preço não muda o resultado, então não há preço de alvo nem de trava. Incline a dupla primeiro.</div>`; // prettier-ignore
  const cell = (l) =>
    !l?.ok ? "–" : `<b class="pd-px">${num(l.at, 2)}</b><span class="pd-ot">${l.order === "limit" ? "limitada ↑" : "stop ↓"} ${pct(l.move, 1)}</span>`; // prettier-ignore
  const rows = g.target.legs
    .map(
      (l, k) =>
        `<tr><td><b>${esc(l.sym)}</b></td><td class="num muted pd-agora">${num(l.price, 2)}</td><td class="num">${cell(l)}</td><td class="num">${cell(g.guard.legs?.[k])}</td></tr>`,
    ) // prettier-ignore
    .join("");
  const armed = g.armed
    ? `🔒 Trava armada: a dupla já ganha ${usd(g.now)}; deixe as duas ordens da trava na corretora.`
    : `🔒 A trava arma quando a dupla passar de ${usd(g.lockUsd)} (hoje ${sgnUsd(g.now)} zerando tudo).`;
  const sums = `🎯 alvo fecha a dupla com ${usd(g.goalUsd)} · 🔒 trava garante ${usd(g.lockUsd)}.`;
  return `<div class="table-wrap"><table class="pd-ord"><thead><tr><th>Ponta</th><th class="num pd-agora">Agora</th><th class="num">🎯 Alvo</th><th class="num">🔒 Trava</th></tr></thead><tbody>${rows}</tbody></table></div>
    <div class="pd-note">${sums} ${armed} Preços para zerar as duas pontas com o custo; ETF alavancado reajusta todo dia, revise a cada pregão.</div>`; // prettier-ignore
}

function pairCard(p, d, i, account) {
  const { st, exit, tilt, goal, key, mix } = p;
  const c = cfg();
  const off = !tilt.ok;
  const badge =
    (exit.hit ? '<span class="pd-badge hit">ALVO BATIDO</span>' : "") +
    (off ? '<span class="pd-badge warn">FORA DA FOLGA</span>' : "");
  const label = `${z(tilt.now)} → ${tilt.manual ? "manual " : "alvo "}${z(tilt.want)}${off ? "" : " · na folga"}`; // prettier-ignore
  const amount = exit.amount;
  const frac = amount > 0 ? st.gross / amount : 0;
  const legs = st.rows
    .map(
      (r) =>
        `<tr data-hold="${esc(r.sym)}" tabindex="0" title="Exposição no ativo-base ${usd(r.expo)}"><td><b>${esc(r.sym)}</b> <span class="pd-lev">${r.lev > 0 ? "+" : "−"}${num(Math.abs(r.lev), r.lev % 1 ? 1 : 0)}x</span> <button class="pf-edit" data-action="hold-edit" data-hold-sym="${esc(r.sym)}" title="Editar quantidade e preço médio" aria-label="Editar posição de ${esc(r.sym)}">✎</button></td><td class="num">${num(r.qty, r.qty % 1 ? 2 : 0)}</td><td class="num muted">${num(r.avg, 2)} → <b class="pd-now">${num(r.price, 2)}</b></td><td class="num pd-andou">${pct(r.move)}</td><td class="num"><b class="${tone(r.pl)}">${sgnUsd(r.pl)}</b></td></tr>`,
    ) // prettier-ignore
    .join("");
  return `<article class="pd-card${off || exit.hit ? " needs" : ""}">
    <header class="pd-ch"><div class="pd-name"><b>${esc(key.replace("-", " × "))}</b>${badge}</div>
      <div class="pd-res"><b class="${tone(st.gross)}">${sgnUsd(st.gross)}</b><span>${pct(st.grossPct, 2)} da conta · ${c.base === "day" ? "hoje" : "desde o médio"}</span></div>
      <button class="pd-del linkish" data-pair-del="${i}" title="Tirar a dupla do painel" aria-label="Tirar a dupla ${esc(key)}">×</button></header>
    <section class="pd-blk"><span class="pd-lab">Postura</span>${balance({ tilt: tilt.now, want: tilt.want, band: d.cfg.band, longPct: mix.longPct, shortPct: mix.shortPct, label })}</section>
    <section class="pd-blk"><span class="pd-lab">Próxima ação</span>${nextAction(p, d)}</section>
    <section class="pd-blk"><div class="pd-lab-row"><span class="pd-lab">Alvo de saída · ${plain(goal, 1)} da conta</span><span class="mono small">${sgnUsd(st.gross)} de ${usd(amount)}${exit.hit ? " · batido" : ""}</span></div>${ruler(frac, c.lock, exit.hit ? "hit" : "")}<div class="pd-rule-lbl"><span>0</span><span style="left:${clamp(c.lock, 0, 1) * 100}%">trava</span><span>alvo</span></div></section>
    <section class="pd-blk"><span class="pd-lab">Ordens na corretora</span>${orders(st, goal, account)}</section>
    <section class="pd-blk"><span class="pd-lab">Pontas</span><div class="table-wrap"><table class="pd-legs"><thead><tr><th>Ponta</th><th class="num">Cotas</th><th class="num">Médio → agora</th><th class="num pd-andou">Andou</th><th class="num">Resultado</th></tr></thead><tbody>${legs}</tbody></table></div></section>
    <footer class="pd-cf">
      <label>Alvo de saída (% da conta) <input class="rfx-in pr-in" data-desk-goal="${esc(key)}" value="${pctIn(goal)}" inputmode="decimal"></label>
      <label>Inclinação-alvo (%) <input class="rfx-in pr-in" data-desk-tilt="${esc(key)}" value="${tilt.manual ? pctIn(tilt.want) : ""}" placeholder="regime" inputmode="decimal" title="Vazio = pelo regime. Ex.: 30 = 30% mais comprado; −20 = 20% mais vendido."></label>
    </footer>
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
      ? " · ✓ quantidades conferem com o BTG"
      : ` <span class="wait">⚠ Quantidades não batem com o BTG (investido US$ ${num(qc.btg, 0)} × quantidades US$ ${num(qc.mine, 0)}): comprou ou vendeu? Corrija no ✎ da ponta.</span>`; // prettier-ignore
  const srcTxt = broker
    ? `BTG ${fmt(photo)}${broker.manual ? " + ajustes ✎" : ""} · preços ao vivo${qcTxt}`
    : "Quantidades da Carteira · preços ao vivo";
  const turn = d.turning
    ? `<p class="pd-turn">↻ O regime está virando ${d.turning > 0 ? "para alta" : "para baixa"} (${move >= 0 ? "+" : "−"}${num(Math.abs(move), 0)} pontos em 1 h) contra a postura das duplas.</p>` // prettier-ignore
    : "";
  const pending = d.pairs.filter((p) => !p.tilt.ok || p.exit.hit).length;
  const syms = Object.keys(held).sort();
  const opts = (sel) => syms.map((s) => `<option${s === sel ? " selected" : ""}>${esc(s)}</option>`).join(""); // prettier-ignore
  const add =
    list.length < MAX_PAIRS && syms.length > 1
      ? `<span class="pr-add"><select id="pair-a" aria-label="Ponta comprada">${opts()}</select> × <select id="pair-b" aria-label="Ponta vendida">${opts(syms[1])}</select> <button class="btn ghost small" data-pair-add>+ dupla</button></span>` // prettier-ignore
      : "";
  const body = !(account > 0)
    ? `<p class="muted">Importe a carteira para usar o painel.</p>`
    : d.pairs.length
      ? `<div class="pd-grid">${d.pairs.map((p, i) => pairCard(p, d, i, account)).join("")}</div>`
      : `<p class="muted">Nenhuma dupla na carteira. Monte as duas pontas (ex.: SOXL × SOXS, SNDU × SNDQ, UVIX × SVIX) ou escolha em Parâmetros.</p>`; // prettier-ignore
  const open = state.pdOpen ?? {};
  return `<section class="pd">
    <section class="card pd-top">
      <div class="pd-head"><h2>⇅ Duplas L/S</h2><span class="pd-src">${srcTxt}</span>${btgButton(state.btgSync)}</div>
      ${account > 0 ? command(d, { score, move, cash, account, pending }) : ""}
      ${turn}
      <details class="pd-more" data-pd-open="cfg"${open.cfg ? " open" : ""}><summary>Parâmetros e duplas</summary>
        <div class="pr-cfg small">
          <span class="seg"><button data-pair-base="cost" aria-pressed="${c.base === "cost"}">Desde o médio</button><button data-pair-base="day" aria-pressed="${c.base === "day"}">Hoje</button></span>
          <label>Reserva de caixa (%) <input id="desk-reserve" class="rfx-in pr-in" value="${pctIn(c.reserve)}" inputmode="decimal"></label>
          <label>Inclinação máx. (%) <input id="desk-tilt" class="rfx-in pr-in" value="${pctIn(c.maxTilt)}" inputmode="decimal"></label>
          <label>Trava (% do alvo) <input id="desk-lock" class="rfx-in pr-in" value="${pctIn(c.lock)}" inputmode="decimal" title="Quanto do alvo garantir com ordens de saída se o regime virar. Ex.: alvo 10% e trava 50% = garantir 5%."></label>
          <label>Custo por operação (%) <input id="pair-fee" class="rfx-in pr-in" value="${pctIn(c.fee)}" inputmode="decimal"></label>
          ${add}
        </div>
      </details>
      <details class="pd-more" data-pd-open="how"${open.how ? " open" : ""}><summary>Como ler</summary>
        <ul class="pd-how small">
          <li><b>Balança</b>: a barra cheia é o comprado e a esmaecida o vendido, ambos no ativo-base (valor × alavancagem: SOXL 3x, SOXS −3x). A divisão é a agulha: −100% = todo vendido, +100% = todo comprado. A marca fina é o alvo; a moldura, a folga de ${num(d.cfg.band * 100, 0)} p.p.</li>
          <li><b>Alvo pelo regime</b> = nota do pêndulo ÷ 100 × inclinação máx. (${plain(c.maxTilt, 0)}). Alvo manual da dupla vence o regime.</li>
          <li><b>Próxima ação</b>: ★ = maior lucro realizado ou menor prejuízo; vender realiza contra o preço médio; comprar só usa o caixa acima da reserva.</li>
          <li><b>Alvo de saída</b>: quando batido, vender a ponta vencedora embolsa o alvo líquido do custo. <b>Trava</b>: parte do alvo garantida com stops se o regime virar.</li>
        </ul>
      </details>
    </section>
    ${body}
    <p class="muted small">ETF alavancado perde por volatilidade com o tempo. Material educacional; não é recomendação de investimento.</p>
  </section>`;
}

const num2 = (s) => parseFloat(String(s).replace(",", "."));

/** Lembra quais blocos recolhíveis estão abertos (o re-render refaz o HTML). */
export function deskClick(e) {
  const sum = e.target.closest?.(".pd-more > summary");
  if (!sum) return;
  const det = sum.parentElement;
  state.pdOpen = { ...(state.pdOpen ?? {}), [det.dataset.pdOpen]: !det.open };
}

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
