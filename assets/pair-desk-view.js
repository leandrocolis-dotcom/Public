// Carteira › Duplas L/S: painel das duplas long × short (motor em assets/pair-desk.js).
// Desenho "Leme e Escada" (docs/design/DUPLAS.md + duplas-canvas.png): carteira das duplas no topo (soma, rumo,
// garantido pelas travas, padrões globais) → pêndulo só leitura → cartão por dupla com os controles dela
// (realizar %, postura-alvo, travas em degraus), postura, réguas de preço e ordens prontas. Explicações em dica.
import { DESK_DEFAULTS, barScale, deskState, parseSteps } from "./pair-desk.js";
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
const stepsIn = (xs) => xs.map((x) => pctIn(x)).join(" ");
const levTxt = (l) => `${l < 0 ? "−" : ""}${num(Math.abs(l), l % 1 ? 1 : 0)}x`;
const tip = (s) => `title="${esc(s)}"`;
const lab = (s, t) => `<span class="pd-lab" ${t ? tip(t) : ""}>${s}${t ? ' <i class="pd-i" aria-hidden="true">ⓘ</i>' : ""}</span>`; // prettier-ignore

const T = {
  pl: "Resultado das pontas a preço ao vivo, desde o preço médio (ou desde o fechamento anterior, na base Hoje). % sobre o valor investido na mesma base.",
  long: "Valor de mercado das pontas que ganham com a ALTA do ativo-base (alavancagem positiva).",
  short: "Valor de mercado das pontas inversas (também compradas na corretora, mas ganham com a QUEDA do ativo-base).",
  net: "Exposição líquida no ativo-base: soma de valor × alavancagem das pontas (SOXL 3x, SOXS −3x). % sobre a conta (posições + caixa). Positivo = aposta na alta.",
  cash: "Caixa em dólar da foto do BTG (✎ na Carteira para ajustar). As compras do leme usam este caixa.",
  locked: "Quanto as duplas somam se todas as travas executarem: vendas e stops nas pontas no lucro, contra o médio e líquidos do custo, mais as pontas no prejuízo como estão agora.",
  rumo: "Postura somada das duplas: exposição líquida ÷ exposição bruta no ativo-base. Esquerda = vendido, direita = comprado, fio no meio = neutro.",
  stepsDef: "Travas padrão de toda dupla sem trava própria. Um número = um stop; até 3 degraus separados por espaço (ex.: 50 70). Cada degrau retém essa % do lucro da ponta desde o médio; as cotas se dividem igualmente.",
  fee: "Custo por operação, em % do valor negociado. Entra no que cada venda realiza e no que cada trava garante.",
  base: "Desde o médio: resultado desde o preço médio. Hoje: desde o fechamento anterior. As travas sempre contam desde o médio.",
  sell: "Fatia das cotas da ponta no lucro a vender agora, a preço de mercado. As travas cobrem o que sobra.",
  aim: "Postura-alvo da dupla, de −100 (todo vendido) a +100 (todo comprado). O painel mostra como chegar lá: vender a ponta contrária ou comprar a ponta a favor. Vazio = manter.",
  steps: "Travas desta dupla: % do lucro da ponta no lucro a reter, até 3 degraus (ex.: 50 70). Vazio = travas padrão. Stop = médio + % × (agora − médio).",
  posture: "Postura da dupla: exposição líquida ÷ bruta no ativo-base. Barra azul = agora; marca no acento = alvo.",
  ifLocked: "Resultado da dupla se a venda e todos os stops executarem (pontas no prejuízo como estão agora).",
  src: "Quantidades: foto do BTG + ajustes ✎. Preços ao vivo do app (pré, pregão, pós e noite). ETF alavancado reajusta todo dia: revise as ordens a cada pregão. Material educacional; não é recomendação de investimento.",
}; // prettier-ignore

function cfg() {
  const p = state.prefs;
  return {
    fee: fin(p.pairFee) ? p.pairFee : DEFAULT_FEE,
    base: p.pairBase === "day" ? "day" : "cost",
    steps: parseSteps(p.pairKeepDefault ?? DESK_DEFAULTS.keeps),
  };
}

/** Barra de postura (−100% a +100%): azul do zero até a postura de agora; marca do alvo no acento. */
function postureBar(now, want, t) {
  const at = (v) => ((Math.max(-1, Math.min(1, v)) + 1) / 2) * 100;
  const a = at(0);
  const b = at(fin(now) ? now : 0);
  return `<div class="pd-post" role="img" ${tip(t)} aria-label="Postura ${sPct(now, 0)}${fin(want) ? `, alvo ${sPct(want, 0)}` : ""}"><div class="pd-post-track"><i class="pd-post-fill" style="left:${Math.min(a, b)}%;width:${Math.abs(b - a)}%"></i><i class="pd-post-zero"></i>${fin(want) ? `<i class="pd-post-want" style="left:${at(want)}%"></i>` : ""}</div><div class="pd-post-lbl"><span>vendido</span><span>comprado</span></div></div>`; // prettier-ignore
}

/** Régua de preço da ponta: médio (fio), degraus da trava (entalhes no acento), agora (círculo). */
function priceBar(r) {
  const stops = r.orders.stops.map((s) => s.price);
  const sc = barScale(r.avg, r.price, stops);
  if (!sc) return "";
  const seg = (a, b, cls) =>
    `<i class="pd-seg ${cls}" style="left:${Math.min(a, b)}%;width:${Math.abs(b - a)}%"></i>`;
  const top = sc.stops.length ? Math.max(...sc.stops) : null;
  const fill =
    r.price >= r.avg
      ? fin(top)
        ? seg(sc.avg, top, "keep") + seg(top, sc.price, "open")
        : seg(sc.avg, sc.price, "open")
      : seg(sc.price, sc.avg, "loss");
  const near = Math.abs(sc.avg - sc.price) < 26; // rótulos colados: o médio fica só na linha de texto
  const aria = `Médio ${px(r.avg)}, agora ${px(r.price)}${stops.length ? `, travas ${stops.map(px).join(", ")}` : ""}`;
  const marks = sc.stops
    .map(
      (x, k) =>
        `<i class="pd-stop" style="left:${x}%"></i><span class="pd-tag stop" style="left:${x}%">${px(stops[k])}</span>`,
    ) // prettier-ignore
    .join("");
  return `<div class="pd-bar${stops.length ? " has-stop" : ""}" role="img" aria-label="${esc(aria)}"><div class="pd-track">${fill}
    <i class="pd-avg" style="left:${sc.avg}%"></i>${near ? "" : `<span class="pd-tag avg" style="left:${sc.avg}%">médio ${px(r.avg)}</span>`}
    ${marks}
    <i class="pd-now" style="left:${sc.price}%"></i><span class="pd-tag now${sc.price > 75 ? " end" : sc.price < 25 ? " start" : ""}" style="left:${sc.price}%">agora <b>${px(r.price)}</b></span></div></div>`; // prettier-ignore
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
  const tl = p.tilt;
  if (tl.options.length) {
    const [a, b] = tl.options;
    const txt = (m) =>
      m.side === "sell"
        ? `vender ${num(m.shares, 0)} ${esc(m.sym)}`
        : `comprar ${num(m.shares, 0)} ${esc(m.sym)}`;
    const sub = (m) =>
      m.side === "sell"
        ? `realiza ${sUsd(m.realized)}${m.full ? "" : " · não chega ao alvo"}`
        : `usa ${usd(m.cashUse)} do caixa${m.fits ? "" : " · falta caixa"}`;
    out.push(`<div class="pd-ord" ${tip("Leme: o primeiro jeito leva a dupla à postura-alvo; o segundo é a alternativa. Vender realiza contra o médio; comprar usa caixa.")}><div><b class="mono">${txt(a)[0].toUpperCase() + txt(a).slice(1)}</b><span class="mono">→ ${sPct(tl.want, 0)} · ${sub(a)}${b ? ` · ou ${txt(b)} (${sub(b)})` : ""}</span></div><span class="pd-ord-k">leme</span></div>`); // prettier-ignore
  }
  for (const r of p.rows) {
    const { sale, stops } = r.orders;
    if (sale)
      out.push(`<div class="pd-ord"><div><b class="mono">Vender ${num(sale.shares, 0)} ${esc(r.sym)}</b><span class="mono">${usd(sale.notional)} · realiza ${sUsd(sale.realized)}</span></div><span class="pd-ord-k">realizar ${num(p.sell * 100, 0)}%</span></div>`); // prettier-ignore
    for (const st of stops)
      out.push(`<div class="pd-ord stop"><div><b class="mono">Stop ${num(st.shares, 0)} ${esc(r.sym)} a ${px(st.price)}</b><span class="mono">${sPct(st.dist)} do preço · garante ${sUsd(st.keeps)}</span></div><span class="pd-ord-k">degrau ${num(st.keep * 100, 0)}%</span></div>`); // prettier-ignore
  }
  const lock = fin(p.locked)
    ? `<div class="pd-lock" ${tip(T.ifLocked)}>${lab("Travas executadas: fica com")}<b class="mono ${tone(p.locked)}">${sUsd(p.locked)}</b></div>` // prettier-ignore
    : "";
  return out.length
    ? `<div class="pd-ords">${lab("Ordens")}${out.join("")}${lock}</div>`
    : `<p class="pd-none" ${tip("Venda parcial e travas só valem para a ponta no lucro desde o médio.")}>Sem ponta no lucro: sem ordens.</p>`; // prettier-ignore
}

function pairCard(p, i, c) {
  const k = esc(p.key);
  const own = p.ownSteps;
  return `<article class="pd-card">
    <header class="pd-ch"><b class="pd-name">${esc(p.key.replace("-", " × "))}</b><div class="pd-res" ${tip(T.pl)}><b class="mono ${tone(p.pl)}">${sUsd(p.pl)}</b><span class="mono ${tone(p.plPct)}">${sPct(p.plPct)}</span></div><button class="pd-del linkish" data-pair-del="${i}" title="Tirar a dupla do painel" aria-label="Tirar a dupla ${k}">×</button></header>
    <div class="pd-ctl">
      <label class="pd-in" ${tip(T.sell)}><span>Realizar</span><input data-pd-sell="${k}" value="${p.sell ? pctIn(p.sell) : ""}" placeholder="0" inputmode="decimal"><i>%</i></label>
      <label class="pd-in" ${tip(T.aim)}><span>Postura-alvo</span><input data-pd-aim="${k}" value="${fin(p.tilt.want) ? (p.tilt.want > 0 ? "+" : "") + pctIn(p.tilt.want) : ""}" placeholder="manter" inputmode="text"><i>%</i></label>
      <label class="pd-in" ${tip(T.steps)}><span>Travas</span><input data-pd-keep="${k}" value="${own ? stepsIn(p.keeps) : ""}" placeholder="${stepsIn(c.steps)}" inputmode="text"><i>%</i></label>
    </div>
    <div class="pd-blk"><div class="pd-row">${lab("Postura", T.posture)}<b class="mono">${sPct(p.tilt.now, 0)}${fin(p.tilt.want) ? ` → ${sPct(p.tilt.want, 0)}` : ""}</b></div>${postureBar(p.tilt.now, p.tilt.want, T.posture)}</div>
    ${p.rows.map((r) => legRow(r, c.base)).join("")}
    ${ordersOf(p)}
  </article>`; // prettier-ignore
}

/** score = nota do pêndulo (1 dia); move = quanto andou em 1 h. Só leitura: não entra em nenhuma conta. */
function regimeLine(score, move) {
  if (!fin(score)) return `<div class="pd-reg">${lab("Pêndulo")}<span class="muted">sem leitura agora</span></div>`; // prettier-ignore
  const z = zoneOf(score);
  return `<div class="pd-reg" ${tip("Nota do regime de 1 dia (−100 a +100) e quanto andou em 1 h. Só leitura: não entra em nenhuma conta do painel.")}>${lab("Pêndulo")}<b class="mono pd-score">${sgn(score)}${num(Math.abs(score), 0)}</b><span class="pd-zone">${esc(z?.label ?? "")}</span>${fin(move) ? `<span class="mono muted pd-move">1 h ${move >= 0 ? "▲" : "▼"} ${num(Math.abs(move), 0)}</span>` : ""}</div>`; // prettier-ignore
}

/** Carteira das duplas: soma de todas, rumo, garantido pelas travas e os padrões globais. */
function book(t, c, add) {
  return `<section class="card pd-book">
    ${lab("Carteira das duplas")}
    <div class="pd-tot-res" ${tip(T.pl)}><b class="mono ${tone(t.pl)}">${sUsd(t.pl)}</b><span class="mono ${tone(t.plPct)}">${sPct(t.plPct)}</span></div>
    <div class="pd-tot-grid">
      <div ${tip(T.long)}>${lab("Comprado")}<b class="mono">${usd(t.long)}</b></div>
      <div ${tip(T.short)}>${lab("Vendido")}<b class="mono">${usd(t.short)}</b></div>
      <div ${tip(T.net)}>${lab("Líquido")}<b class="mono pd-net">${sUsd(t.expo)}</b><span class="mono pd-sub">${fin(t.expoPct) ? `${num(t.expoPct * 100, 0)}% da conta` : ""}</span></div>
      <div ${tip(T.cash)}>${lab("Caixa")}<b class="mono">${usd(t.cash)}</b></div>
    </div>
    ${postureBar(t.posture, null, T.rumo)}
    <div class="pd-row pd-locked" ${tip(T.locked)}>${lab("Garantido pelas travas")}<b class="mono ${tone(t.locked)}">${fin(t.locked) ? sUsd(t.locked) : "–"}</b></div>
    <div class="pd-glob">
      <div class="pd-in" ${tip(T.base)}><span>Base</span><span class="seg"><button data-pair-base="cost" aria-pressed="${c.base === "cost"}">Médio</button><button data-pair-base="day" aria-pressed="${c.base === "day"}">Hoje</button></span></div>
      <label class="pd-in" ${tip(T.stepsDef)}><span>Travas padrão</span><input data-pd-keepdef value="${stepsIn(c.steps)}" inputmode="text"><i>%</i></label>
      <label class="pd-in" ${tip(T.fee)}><span>Custo</span><input id="pair-fee" value="${pctIn(c.fee)}" inputmode="decimal"><i>%</i></label>
    </div>
    ${add}
  </section>`; // prettier-ignore
}

export function viewPairDesk({ score = null, move = null } = {}) {
  const rows = state.valuation?.rows ?? [];
  const held = Object.fromEntries(rows.filter((r) => r.qty > 0).map((r) => [r.sym, r]));
  const broker = withManual(state.broker, state.portfolio?.holdings, state.portfolio?.manual);
  const cash = broker?.summary?.offshore?.cashUsd ?? null;
  const account = (state.valuation?.total ?? 0) + (fin(cash) ? cash : 0);
  const list = (state.prefs.pairs ?? detectPairs(Object.keys(held))).filter(([a, b]) => held[a] && held[b]); // prettier-ignore
  const c = cfg();
  const sells = state.prefs.pairSell ?? {};
  const keeps = state.prefs.pairKeep ?? {};
  const aims = state.prefs.pairAim ?? {};
  const d = deskState(
    list.map((pr) => {
      const key = keyOf(pr);
      const own = parseSteps(keeps[key]);
      return {
        key,
        legs: pr.map((s) => legFrom(held[s], quoteOf(s))),
        sell: fin(sells[key]) ? sells[key] : DESK_DEFAULTS.sell,
        keeps: own.length ? own : c.steps,
        tilt: fin(aims[key]) ? aims[key] : null,
      };
    }),
    { fee: c.fee, base: c.base, cash, account },
  );
  for (const p of d.pairs) p.ownSteps = parseSteps(keeps[p.key]).length > 0;
  const fmt = (iso) => (iso ? new Date(iso).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }) : "–"); // prettier-ignore
  const photo = broker?.asOf ?? broker?.summary?.asOf ?? null;
  const src = broker
    ? `BTG ${fmt(photo)}${broker.manual ? " + ✎" : ""} · ao vivo`
    : "Carteira · ao vivo";
  const syms = Object.keys(held).sort();
  const opts = (sel) => syms.map((s) => `<option${s === sel ? " selected" : ""}>${esc(s)}</option>`).join(""); // prettier-ignore
  const add =
    list.length < MAX_PAIRS && syms.length > 1
      ? `<div class="pd-add" ${tip("Monte uma dupla: a ponta que ganha com a alta × a ponta inversa.")}><select id="pair-a" aria-label="Ponta comprada">${opts()}</select> × <select id="pair-b" aria-label="Ponta vendida">${opts(syms[1])}</select> <button class="btn ghost small" data-pair-add>+ dupla</button></div>` // prettier-ignore
      : "";
  const body = !rows.length
    ? `<p class="muted">Importe a carteira para usar o painel.</p>`
    : `${book(d.total, c, add)}${regimeLine(score, move)}${d.pairs.length ? `<div class="pd-grid">${d.pairs.map((p, i) => pairCard(p, i, c)).join("")}</div>` : `<p class="muted">Nenhuma dupla com as duas pontas na carteira.</p>`}`; // prettier-ignore
  return `<section class="pd">
    <div class="pd-head"><h2>Duplas L/S</h2><span class="pd-src" ${tip(T.src)}>${src} <i class="pd-i" aria-hidden="true">ⓘ</i></span>${btgButton(state.btgSync)}</div>
    ${body}
  </section>`; // prettier-ignore
}

const num2 = (s) => parseFloat(String(s).replace(",", ".").replace("−", "-"));

/** Controles da dupla e travas padrão (base, custo e +/× dupla são de assets/pairs-view.js). */
export function deskChange(e) {
  const t = e.target;
  const ds = t.dataset ?? {};
  const raw = String(t.value ?? "").trim();
  const setKey = (pref, key, v) => {
    const next = { ...(state.prefs[pref] ?? {}) };
    if (v == null) delete next[key];
    else next[key] = v;
    state.prefs[pref] = next;
  };
  if (ds.pdSell) {
    const v = raw ? num2(raw) : 0;
    if (!(v >= 0 && v <= 100)) return;
    setKey("pairSell", ds.pdSell, v / 100);
  } else if (ds.pdAim) {
    if (!raw) setKey("pairAim", ds.pdAim, null);
    else {
      const v = num2(raw.replace("+", ""));
      if (!(v >= -100 && v <= 100)) return;
      setKey("pairAim", ds.pdAim, v / 100);
    }
  } else if (ds.pdKeep) {
    const steps = parseSteps(raw);
    if (raw && !steps.length) return;
    setKey("pairKeep", ds.pdKeep, steps.length ? steps : null);
  } else if ("pdKeepdef" in ds) {
    const steps = parseSteps(raw);
    if (!steps.length) return;
    state.prefs.pairKeepDefault = steps;
  } else return;
  savePrefs();
  hooks.render();
}
