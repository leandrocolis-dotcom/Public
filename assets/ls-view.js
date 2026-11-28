// Carteira › Long & Short (aba `longshort`): "o que eu faço agora?". Junta os dados do app, chama o motor puro
// (ls-input.js → ls-engine.js → ls-alerts.js) e desenha os 6 blocos da seção 8 de docs/PLANO-LONG-SHORT.md, com
// os mockups aprovados (docs/design/LONG-SHORT.md): barra de status, métricas, ordens agora, pares, alertas e
// diário, + plano do dia, parâmetros, folhas Executei/Ignorar e tela de crítico. Toda ajuda vem de ls-tooltips.js.
// O app não envia ordens: o usuário executa na corretora e registra aqui (livro em ls-book.js, nuvem pendulo_ls).
import { computeLs } from "./ls-engine.js";
import { dedupeAlerts, evaluateAlerts, sideText } from "./ls-alerts.js";
import { buildInput, neededSyms, pairId, parseHistCsv } from "./ls-input.js";
import { ackCritical, answerRemainder, liveOrders, loadBook, mergeBooks, positionFrom, noteTrips, reconcile, recordExecution, recordIgnore, rollDay, setStop, trackHwm } from "./ls-book.js"; // prettier-ignore
import { clocks, leftText, nextMark, tradingDay } from "./ls-clock.js";
import { PARAMS } from "./ls-params.js";
import { ETF_CATALOG, assetInfo } from "./ls-etfs.js";
import { TIPS, tipText } from "./ls-tooltips.js";
import { DEMO_NOW, MANUAL, TOUR, demoInput } from "./ls-guide.js";
import { barsKey, useBars } from "./bars-hub.js";
import { fetchQuotes } from "./quote-hub.js";
import { manualActive, positionsAsOf, withManual } from "./btg.js";
import { detectPairs } from "./pairs.js";
import { decSep, esc, num } from "./format.js";
import { hooks, state, store } from "./state.js";
import { toast } from "./widgets.js";
import * as cloud from "./cloud.js";

const KEY = "pendulo.ls.book";
const PLAN = "pendulo.ls.plan";
const PARAMS_KEY = "pendulo.ls.params";
const ASSETS_KEY = "pendulo.ls.assets";
const fin = (x) => typeof x === "number" && Number.isFinite(x);
const sg = (x) => (x > 0 ? "+" : x < 0 ? "−" : "");
const usd = (x, d = 2) => (fin(x) ? `${sg(x)}US$ ${num(Math.abs(x), d)}` : "–");
const usdA = (x, d = 0) => (fin(x) ? `US$ ${num(x, d)}` : "–");
const rTxt = (x) => (fin(x) ? `${sg(x)}${num(Math.abs(x), 2)}R` : "–");
const xTxt = (x, d = 2) => (fin(x) ? `${sg(x)}${num(Math.abs(x), d)}x` : "–");
const px = (x) => (fin(x) ? num(x, 2) : "–");
const tone = (x) => (!fin(x) || Math.abs(x) < 1e-9 ? "" : x > 0 ? "up" : "down");
/** Número digitado no separador do usuário. Separador trocado (50,25 no modo ponto) = inválido (NaN), nunca ×100. */
export const parseNum = (s, sep = decSep()) => {
  const t = String(s ?? "")
    .trim()
    .replace(/\s/g, "")
    .replace("−", "-")
    .replace(/^US\$/, "");
  if (t === "") return null;
  const other = sep === "." ? "," : ".";
  const esc2 = (c) => (c === "." ? "\\." : c);
  const thousands = new RegExp(`^-?\\d{1,3}(${esc2(other)}\\d{3})+(${esc2(sep)}\\d+)?$`);
  if (t.includes(other) && !thousands.test(t)) return NaN;
  const v = Number(t.split(other).join("").replace(sep, "."));
  return Number.isFinite(v) ? v : NaN;
};

/** ⓘ acessível: botão que abre a dica (toque no celular, foco/hover no desktop). */
export const info = (id, vars) => {
  const t = tipText(id, vars);
  const v = vars ? ` data-ls-tipv="${esc(JSON.stringify(vars))}"` : "";
  return `<button type="button" class="ls-i" data-ls-tip="${id}"${v} aria-label="Ajuda: ${esc(t.que)}" title="${esc(`${t.que} · ${t.ler}${t.fazer ? ` · ${t.fazer}` : ""}`)}">ⓘ</button>`; // prettier-ignore
};
const TOUR_KEY = "pendulo.ls.tourSeen";
/** Âncora do tour: data-tour (+ data-tour-on no bloco do passo atual, que ganha o destaque). */
const T = (id) =>
  ` data-tour="${id}"${state.lsTour != null && TOUR[state.lsTour]?.anchor === id ? " data-tour-on" : ""}`;
const lab = (txt, id, vars) => `<span class="ls-lab">${txt} ${info(id, vars)}</span>`;

// ───────── estado do livro (aparelho + nuvem pendulo_ls) ─────────
function book() {
  if (!state.lsBook) {
    const r = loadBook(store.get(KEY, null));
    // versão mais nova que o app: só leitura (nunca trocar por um livro vazio e enviar à nuvem)
    state.lsReadOnly = !r.data;
    state.lsBook = r.data ?? loadBook(null).data;
    state.lsBookErr = r.errors ?? [];
  }
  return state.lsBook;
}
/** Grava o livro. Ação do usuário sobe para a nuvem; mudança só derivada (hwm, máximas, travas) fica aqui. */
function saveBook(d, { push = true } = {}) {
  if (state.lsReadOnly) return;
  state.lsBook = d;
  store.set(KEY, d);
  if (push) pushBook(d);
}
let pushT = null;
function pushBook(d) {
  if (!cloud.cloudUser()) return;
  clearTimeout(pushT);
  pushT = setTimeout(async () => {
    try {
      await cloud.pushLs(d);
      state.lsSync = { ok: true, at: Date.now() };
    } catch (e) {
      state.lsSync = { ok: false, msg: String(e?.message ?? e) };
      hooks.render();
    }
  }, 800);
}
/** Junta com a nuvem a cada sincronia (nada se perde: ver mergeBooks). Chamado por cloud-sync.js. */
export async function syncLs() {
  if (!cloud.cloudUser()) {
    state.lsLoaded = true;
    return false;
  }
  try {
    const r = await cloud.pullLs();
    const remote = r ? loadBook(r.data) : null;
    if (remote && !remote.data) {
      state.lsReadOnly = true; // a nuvem tem versão mais nova que este app
      state.lsBookErr = remote.errors;
    } else {
      const local = book();
      const merged = mergeBooks(local, remote?.data ?? null);
      const changed = JSON.stringify(merged) !== JSON.stringify(local);
      if (changed) saveBook(merged, { push: false });
      if (!remote || JSON.stringify(merged) !== JSON.stringify(remote.data)) pushBook(merged);
    }
    state.lsSync = { ok: true, at: Date.now() };
    state.lsLoaded = true;
    return true;
  } catch (e) {
    state.lsSync = { ok: false, msg: String(e?.message ?? e) };
    state.lsLoaded = false;
    return false;
  }
}

// ───────── dados de mercado: cotações (com bid/ask), barras de 5 min e diário ─────────
const daily = (state.lsDaily ??= {});
function loadDaily(syms) {
  for (const s of syms) {
    if (s in daily || /[\^=]/.test(s)) continue;
    daily[s] = null;
    fetch(`data/hist/${encodeURIComponent(s)}.csv`)
      .then((r) => (r.ok ? r.text() : Promise.reject(new Error(`HTTP ${r.status}`))))
      .then((t) => (daily[s] = parseHistCsv(t)))
      .catch(() => (daily[s] = []))
      .finally(rerender);
  }
}
let quoteBusy = false;
function loadQuotes(need, session) {
  if (quoteBusy || session === "FECHADO") return;
  quoteBusy = true;
  const rest = need.all.filter((s) => !need.etfs.includes(s));
  // ETFs: 5 s com bid/ask (o canal de 15 s não traz; idade máx. no pregão 10 s); subjacentes, SPY e VIX: normal
  Promise.all([
    fetchQuotes(need.etfs, { id: "longshort", ttl: 5000, bidAsk: true, bg: false }),
    fetchQuotes(rest, { id: "longshort-u", ttl: 15000, bg: false }),
  ])
    .then(([a, b]) => {
      state.lsQuotes = { ...b.quotes, ...a.quotes };
      rerender();
    })
    .catch((e) => (state.lsQuoteErr = String(e?.message ?? e)))
    .finally(() => (quoteBusy = false));
}
const rerender = () => hooks.render();
let ticker = null;
function tick() {
  if (ticker) return;
  ticker = setInterval(() => {
    if (state.prefs.tab === "longshort" && !document.hidden) hooks.render();
  }, 5000);
}

function pairsList(rows) {
  const held = rows.map((r) => r.sym);
  return (state.prefs.pairs ?? detectPairs(held)).filter((p) => Array.isArray(p) && p.length === 2);
}
function eventsToday(now) {
  const day = tradingDay(now);
  return (state.cal?.events ?? [])
    .filter((e) => e.impact === "high" && (e.cc === "US" || e.cc === "USA") && fin(e.t))
    .map((e) => ({ atMs: e.t * 1000, label: e.titlePT ?? e.title }))
    .filter((e) => tradingDay(e.atMs) === day);
}

// ───────── cálculo (puro) a partir do estado ─────────
function compute(now) {
  const rows = (state.valuation?.rows ?? []).filter((r) => r.qty > 0);
  const pairs = pairsList(rows);
  const assetsUser = store.get(ASSETS_KEY, {}) ?? {};
  const need = neededSyms(pairs, assetsUser);
  const bars = {};
  for (const s of [...need.etfs, ...need.unders]) {
    const e = useBars(barsKey({ symbol: s, prepost: true }), { bg: true, onUpdate: rerender });
    if (e?.data?.bars) bars[s] = e.data.bars;
  }
  loadDaily([...need.unders, "SPY"]);
  let b = book();
  const before = b;
  const broker = withManual(state.broker, state.portfolio?.holdings, state.portfolio?.manual);
  // horário em que as QUANTIDADES da Carteira valem: posições da última foto completa do BTG ou o ajuste ✎
  const manualMs = manualActive(state.broker, state.portfolio?.manual) ? Date.parse(state.portfolio?.manual?.at ?? "") : NaN; // prettier-ignore
  const photoMs = Math.max(Date.parse(positionsAsOf(state.broker) ?? "") || 0, manualMs || 0, state.broker ? 0 : Date.parse(state.portfolio?.updatedAt ?? state.portfolio?.importedAt ?? "") || 0) || null; // prettier-ignore
  const cash = broker?.summary?.offshore?.cashUsd ?? 0;
  const account = (state.valuation?.total ?? 0) + (fin(cash) ? cash : 0);
  const bySym = Object.fromEntries(rows.map((r) => [r.sym, r]));
  const syms = [...new Set([...rows.map((r) => r.sym), ...pairs.flat()])];
  const posOf = (s) => positionFrom(bySym[s], b, s, photoMs);
  b = rollDay(
    b,
    tradingDay(now),
    syms.filter((s) => posOf(s).qty > 0),
  );
  const quotes = state.lsQuotes ?? {};
  const maxValue = { ...(b.day.maxValue ?? {}) };
  for (const s of syms) {
    const pos = posOf(s);
    const price = quotes[s]?.p ?? bySym[s]?.price;
    if (!(pos.qty > 0) || !(price > 0)) continue;
    b = trackHwm(b, s, { avg: pos.avg, price: quotes[s]?.xp > 0 && quotes[s]?.xt > (quotes[s]?.t ?? 0) ? quotes[s].xp : price }); // prettier-ignore
    maxValue[s] = Math.max(maxValue[s] ?? 0, pos.qty * price);
  }
  b = { ...b, day: { ...b.day, maxValue } };
  const loaded = !cloud.cloudUser() || state.lsLoaded === true;
  const rec = reconcile({
    data: b,
    rows,
    photoMs,
    now,
    loaded,
    migrationErrors: state.lsBookErr ?? [],
  });
  if (!photoMs && rows.length) rec.issues.push({ id: "foto", msg: "sem horário da foto da Carteira: não dá para saber quais execuções já estão nela" }); // prettier-ignore
  if (state.lsReadOnly) rec.issues.push({ id: "versao", msg: "o livro foi gravado por uma versão mais nova do app: atualize a página (modo só leitura)" }); // prettier-ignore
  rec.ok = rec.issues.length === 0;
  const plan = store.get(PLAN, null);
  const { input, meta } = buildInput({ now, rows, pairs, quotes, bars, daily, book: b, plan, paramsUser: store.get(PARAMS_KEY, {}) ?? {}, assetsUser, account, photoMs, events: eventsToday(now), recIssues: rec.issues }); // prettier-ignore
  loadQuotes(need, input.session);
  const out = computeLs(input);
  // sem a 1ª cotação, nada de alerta (senão "preço não confiável" em tudo só por estar carregando)
  const ready = !!state.lsQuotes || input.session === "FECHADO";
  const alerts = out.ok && ready ? evaluateAlerts(input, out) : [];
  const ded = dedupeAlerts(alerts, state.lsAlertMem ?? {}, now, input.params);
  state.lsAlertMem = ded.mem;
  // lista = alertas ATIVOS agora (some quando a condição passa), com a hora em que apareceram
  const first = (state.lsFirst ??= {});
  const active = new Set();
  for (const a of alerts) {
    const k = `${a.id}|${a.sym ?? ""}`;
    active.add(k);
    first[k] ??= clocks(now).et;
  }
  for (const k of Object.keys(first)) if (!active.has(k)) delete first[k];
  state.lsFeed = alerts.slice(0, 20).map((a) => ({ ...a, t: first[`${a.id}|${a.sym ?? ""}`] }));
  if (out.ok)
    b = noteTrips(
      b,
      out.blockers.map((x) => x.id),
      input.date,
    );
  if (out.portfolio?.flags?.rsk01 && !b.day.rsk01Locked) b = { ...b, day: { ...b.day, rsk01Locked: true } }; // prettier-ignore
  // mudanças daqui são derivadas (virada do dia, máximas, travas): ficam no aparelho; a nuvem recebe nas ações
  if (b !== before && JSON.stringify(b) !== JSON.stringify(before)) saveBook(b, { push: b.day.date !== before.day?.date || (b.day.rsk01Locked && !before.day?.rsk01Locked) }); // prettier-ignore
  return { input, out, alerts, meta, rec, rows, pairs, plan, account, need };
}

// ───────── blocos ─────────
function statusBar(c, now) {
  const { input, out, meta, rec } = c;
  const ck = clocks(now);
  const nm = nextMark(now, input.params);
  const ses = { PRE: "PRÉ", REGULAR: "REGULAR", POS: "PÓS", FECHADO: "FECHADO" }[input.session];
  const f = out.portfolio?.flags ?? {};
  const trava =
    f.rsk01 || f.rsk02 || f.rsk03 || f.rsk04 || out.blockers?.some((b) => /^BEH/.test(b.id));
  const near = out.portfolio?.near?.length;
  const noData =
    !c.demo &&
    ((!state.lsQuotes && input.session !== "FECHADO") || out.legs?.some((m) => m.qty > 0 && !m.ok));
  const sem = noData
    ? `<span class="ls-sem">– sem dados</span>`
    : trava
      ? `<span class="ls-sem down">‼ trava ativa</span>`
      : near
        ? `<span class="ls-sem wait">⚠ perto do limite</span>`
        : `<span class="ls-sem">✓ ok</span>`;
  const planOk = input.plan.ok;
  const bands = [];
  if (input.session !== "FECHADO" && !planOk)
    bands.push(`<div class="ls-band down" role="alert">‼ Preencha o plano do dia para liberar compras ${info("plano_dia")} <button class="btn small" data-ls-open="plan">Preencher plano</button></div>`); // prettier-ignore
  if (input.session === "PRE") bands.push(`<div class="ls-band wait">⚠ Pré-mercado: só ordem limitada, tamanho 50%, sem aumentos ${info("sessao")}</div>`); // prettier-ignore
  if (input.session === "POS") bands.push(`<div class="ls-band wait">⚠ Pós-mercado: só reduzir ou zerar, com ordem limitada ${info("sessao")}</div>`); // prettier-ignore
  if (input.calendar.blocks && input.session !== "FECHADO")
    bands.push(`<div class="ls-band wait">⚠ ${esc(input.calendar.reason ?? "sessão especial")}: janelas recalculadas, compras bloqueadas até validar ${info("dia_especial")} ${input.calendar.validated ? `<button class="btn small" data-ls-calok>Conferi os horários</button>` : ""}</div>`); // prettier-ignore
  if (!rec.ok)
    bands.push(`<div class="ls-band wait">⚠ Reconciliação pendente: compras bloqueadas<ul>${rec.issues.map((i) => `<li>${esc(i.msg)}${i.orderId ? ` <button class="btn small ghost" data-ls-rem="${esc(i.orderId)}" data-ans="aberto">Está aberta</button> <button class="btn small ghost" data-ls-rem="${esc(i.orderId)}" data-ans="cancelado">Foi cancelada</button>` : ""}</li>`).join("")}</ul></div>`); // prettier-ignore
  if (state.lsSync && !state.lsSync.ok) bands.push(`<div class="ls-band wait">⚠ Nuvem do Long & Short indisponível (${esc(state.lsSync.msg)}): o registro fica neste aparelho até voltar.</div>`); // prettier-ignore
  if (meta.paramErrors.length) bands.push(`<div class="ls-band wait">⚠ Parâmetros ignorados: ${esc(meta.paramErrors.join("; "))}</div>`); // prettier-ignore
  return `<header class="ls-status"${T("status")}>
    <div class="ls-row"><span class="ls-pill ${input.session === "REGULAR" ? "on" : ""}">● ${ses}</span> ${info("sessao")}
      <span class="ls-clock">${ck.et} ET · ${ck.br} BRT</span> ${info("relogio")}</div>
    <div class="ls-row ls-sub">${nm ? `${esc(nm.label)} em ${leftText(nm.left)}` : "sem marcos até amanhã"} ${info("proximo_marco")}</div>
    <div class="ls-row ls-sub">Travas: ${sem} ${info("semaforo_travas")} · Plano: ${planOk ? "✓" : `<b class="down">✗</b>`} ${info("plano_dia")} <button class="btn small ghost" data-ls-open="plan">Plano do dia</button></div>
  </header>${bands.join("")}`; // prettier-ignore
}

function metrics(c) {
  const pf = c.out.portfolio;
  if (!pf) return "";
  const bad = c.out.legs.some((m) => m.qty > 0 && !m.ok);
  if (!c.demo && (bad || (!state.lsQuotes && c.input.session !== "FECHADO")))
    return `<section class="ls-metrics" aria-label="Métricas da carteira"><div class="ls-card wide">${lab("P&L do dia", "pnl_dia", { R: num(pf.R, 2) })}<b class="ls-big">–</b><span class="ls-sub">${bad ? "Falta preço de alguma ponta: métricas suspensas para não mostrar zero falso." : "Carregando cotações…"}</span></div></section>`; // prettier-ignore
  const lim = pf.lossLim > 0 ? Math.max(0, Math.min(1, pf.limiteRestante / pf.lossLim)) : 0;
  const lvl = (u) => (u >= 1 ? "down" : u > 0.8 ? "wait" : "");
  const bar = (frac, cls) => `<div class="ls-bar ${cls}"><i style="width:${Math.round(frac * 100)}%"></i></div>`; // prettier-ignore
  const p = c.input.params;
  const gauge = (() => {
    const at = (v) => ((Math.max(-1.5, Math.min(1.5, v)) + 1.5) / 3) * 100;
    return `<div class="ls-gauge ${lvl(pf.use.liquida)}"><i class="z"></i><i class="m" style="left:${at(pf.expLiqX)}%"></i></div>`; // prettier-ignore
  })();
  return `<section class="ls-metrics"${T("metrics")} aria-label="Métricas da carteira">
    <div class="ls-card ${lvl(pf.use.perda)}">${lab("P&L do dia", "pnl_dia", { R: num(pf.R, 2) })}<b class="ls-big ${tone(pf.pnlDay)}">${usd(pf.pnlDay)}</b><span class="ls-sub">${rTxt(pf.pnlDayR)} · ${sg(pf.pnlDayPct)}${num(Math.abs(pf.pnlDayPct), 2)}%</span></div>
    <div class="ls-card ${lvl(pf.use.perda)}">${lab("Limite restante", "limite_restante")}<b class="ls-big ${pf.limiteRestante < 0 ? "down" : ""}">${pf.limiteRestante < 0 ? `−US$ ${num(-pf.limiteRestante, 2)}` : usdA(pf.limiteRestante, 2)}</b>${bar(lim, lvl(pf.use.perda))}<span class="ls-sub">1R = ${usdA(pf.R, 2)} ${info("R")}</span></div>
    <div class="ls-card ${lvl(pf.use.bruta)}">${lab("Exposição bruta", "exp_bruta")}<b class="ls-big">${num(pf.expBrutaX, 2)}x</b><span class="ls-sub">limite ${num(p.exposicao_bruta_max_x_capital, 1)}x</span></div>
    <div class="ls-card ${lvl(pf.use.liquida)}">${lab("Exposição líquida", "exp_liquida")}<b class="ls-big">${xTxt(pf.expLiqX)}</b>${gauge}<span class="ls-sub">limite ±${num(p.exposicao_liquida_max_x_capital, 1)}x</span></div>
    <div class="ls-card wide ${lvl(pf.use.risco)}">${lab("Risco aberto", "risco_aberto_total")}<b class="ls-big">${num(pf.riskOpenR, 2)}R</b><span class="ls-sub">teto ${num(Math.max(0, pf.tetoR), 2)}R · queda do pico ${num(pf.drawdown, 1)}% ${info("drawdown")}</span></div>
  </section>`; // prettier-ignore
}

const ACT = (o) => {
  if (o.purpose === "ZERAR")
    return o.side === "COMPRAR_PARA_COBRIR" ? "ZERAR (COMPRAR PARA COBRIR)" : "ZERAR";
  return sideText(o.side);
};
function orderRow(o, anchors = {}) {
  const reduce = o.purpose === "REDUZIR" || o.purpose === "ZERAR";
  const arrow = reduce ? "▼" : "▲";
  const tag = `${o.reason}${o.alert ? ` · ${o.alert}` : ""}`;
  const meta = `limite ${px(o.limit)}${o.limitFrom === "último" ? " (sem bid/ask: último preço)" : ""} ${info("preco_limite")} · stop ${px(o.stop)} ${info("stop_proposto")} · ${esc(tag)} ${info("motivo")}`; // prettier-ignore
  if (o.blocked) {
    const why = o.blockers.map((b) => b.why).join("; ");
    return `<details class="ls-order blocked"${anchors.blocked ? T("blocked") : ""}${anchors.blocked && state.lsTour != null ? " open" : ""}><summary><span class="ls-act">⊘ BLOQUEADO · ${esc(ACT(o).toLowerCase())} ${o.qty} ${esc(o.sym)}</span> ${info("bloqueado")}<span class="ls-why">${esc(o.blockers[0]?.why ?? "")}</span></summary><p class="ls-sub">${esc(why)}</p><p class="ls-sub">${meta}</p>${o.checklist ? checklist(o.checklist) : ""}</details>`; // prettier-ignore
  }
  return `<article class="ls-order ${reduce ? "down" : "up"}"${anchors.first ? T("order1") : ""}>
    <div class="ls-act">${arrow} ${esc(ACT(o))} <span class="ls-q">${o.qty}</span> ${esc(o.sym)} ${info("acao")}</div>
    <div class="ls-sub">${meta}${o.note ? ` · ${esc(o.note)}` : ""}</div>
    <div class="ls-btns"${anchors.first ? T("buttons") : ""}><button class="btn" data-ls-exec="${esc(o.id)}">Executei</button> ${info("executei")}<button class="btn ghost" data-ls-ignore="${esc(o.id)}">Ignorar</button> ${info("ignorar")}</div>
  </article>`; // prettier-ignore
}
function stopRow(m, i) {
  return `<article class="ls-order stop"${i === 0 ? T("stop") : ""}><div class="ls-act">↥ SUBIR STOP ${esc(m.sym)} para <span class="ls-q">${px(m.to)}</span> ${info("stop_vigente")}</div><div class="ls-sub">de ${px(m.from)} · ${m.reason === "P3" ? "P3: vencedora protegida no preço médio" : "stop móvel: só se aproxima do preço"}</div><div class="ls-btns"><button class="btn" data-ls-stop="${esc(m.sym)}" data-to="${m.to}">Atualizei na corretora</button></div></article>`; // prettier-ignore
}
function ordersBlock(c) {
  const { out, input } = c;
  const list = out.orders ?? [];
  let body;
  const bad = out.legs.filter((m) => !m.ok || !m.quote?.ok).map((m) => m.sym);
  // ignorada há menos de 15 min sai da lista (volta se a prioridade subir: id novo)
  const ign = new Set((c.bookData.day.ignored ?? []).filter((x) => x.orderId && Date.now() - x.ts < input.params.dedupe_alerta_min * 60000).map((x) => x.orderId)); // prettier-ignore
  const shown = list.filter((o) => !ign.has(o.id));
  const hidden = list.length - shown.length;
  if (input.session === "FECHADO") {
    const nxt = shown.filter((o) => !o.blocked);
    body = `<p class="ls-none">Mercado fechado: modo revisão. Veja o diário e preencha o plano de amanhã.</p>${nxt.length ? `<p class="ls-sub">Para a próxima sessão (4:00 ET): ${nxt.map((o) => `${esc(ACT(o))} ${o.qty} ${esc(o.sym)} (${esc(o.alert ?? o.reason)})`).join(" · ")}</p>` : ""}`; // prettier-ignore
  } else if (bad.length && !shown.some((o) => o.purpose === "REDUZIR" || o.purpose === "ZERAR"))
    body = `<p class="ls-none wait">⚠ Sem preço confiável em ${esc(bad.join(", "))}: não dá para dizer o que fazer agora.</p>`; // prettier-ignore
  else if (!shown.length && !out.stopMoves.length)
    body = `<p class="ls-none">＝ Nada a fazer: manter.</p>`;
  else {
    const firstOk = shown.findIndex((o) => !o.blocked);
    const firstBlk = shown.findIndex((o) => o.blocked);
    body = out.stopMoves.map(stopRow).join("") + shown.map((o, i) => orderRow(o, { first: i === firstOk, blocked: i === firstBlk })).join(""); // prettier-ignore
  }
  if (hidden) body += `<p class="ls-sub">${hidden} ordem(ns) ignorada(s) há menos de 15 min.</p>`;
  const live = liveOrders(c.bookData).filter((o) => o.status === "PARCIAL");
  if (live.length)
    body = live.map((o) => `<article class="ls-order"><div class="ls-sub">Saldo aberto ${info("residual")}: <b>${(o.qtySug ?? 0) - (o.qtyExec ?? 0)}</b> de ${o.qtySug} ${esc(o.sym)} (${esc(o.purpose)} · ${esc(o.reason ?? "")})</div><div class="ls-btns"><button class="btn" data-ls-execlive="${esc(o.id)}">Executou o saldo</button><button class="btn ghost" data-ls-rem="${esc(o.id)}" data-ans="cancelado">Foi cancelado</button></div></article>`).join("") + body; // prettier-ignore
  const err = out.errors?.length ? `<p class="ls-sub wait">⚠ ${esc(out.errors.map((e) => `${e.sym ? `${e.sym}: ` : ""}${e.why}`).join(" · "))}</p>` : ""; // prettier-ignore
  return `<section class="ls-block"${T("orders")}><h3>Ordens agora ${info("ordens_agora")}</h3>${body}${err}</section>`;
}
function checklist(chk) {
  const L = { pnl: "P&L da ponta ≥ +1R", oposta: "ponta oposta já reduzida", rompimento: "rompimento com volume e VWAP a favor", lote: "lote ≤ 50% do anterior", risco: "risco da ponta ≤ 1R", janela: "≤ 2 aumentos, antes do corte, pregão regular", correlacao: "correlação ≥ mínimo" }; // prettier-ignore
  return `<div class="ls-chk"><b>Gatilhos do aumento (${chk.filter((x) => x.ok).length}/${chk.length})</b> ${info("checklist_pyramiding")}<ul>${chk.map((x) => `<li class="${x.ok ? "" : "no"}">${x.ok ? "✓" : "✗"} ${L[x.id] ?? x.id}</li>`).join("")}</ul></div>`; // prettier-ignore
}

const SCEN = { 0: "manter", 1: "long certo, short errado", 2: "short certo, long errado", 3: "as duas ganham", 4: "as duas perdem", 5: "dia lateral", 6: "movimento esticado", 7: "devolvendo", 8: "ponta no stop", 9: "evento em ≤ 30 min" }; // prettier-ignore
function legRow(l, m, kind, desktop) {
  if (!l) return "";
  const a = l.asset;
  const u = l.under ?? {};
  const typ = a.ok ? `${a.L}x ${a.type === 1 ? "bull" : "bear"}` : "sem cadastro";
  const age = m?.quote?.age;
  return `<div class="ls-leg">
    <div class="ls-leg-top"><span class="ls-kind">${kind === "long" ? "LONG" : "SHORT"}</span> ${info("perna")} <b>${esc(l.sym)}</b> <span class="ls-sub">${typ}</span> ${info("alavancagem_tipo")}
      <span class="ls-num">${l.qty} ${info("quantidade_pos")}</span> <span class="ls-num ${tone(m?.pnlR)}">${rTxt(m?.pnlR)}</span> ${info("pnl_r_ponta")}</div>
    <div class="ls-leg-stop">Stop ${l.qty > 0 ? `<input class="ls-in" data-ls-setstop="${esc(l.sym)}" inputmode="decimal" value="${fin(l.stop) ? px(l.stop) : ""}" placeholder="${fin(m?.stopSug) ? px(m.stopSug) : "definir"}" aria-label="Stop de ${esc(l.sym)}">` : "–"} ${info("stop_vigente")} · VWAP ${m?.vwapSide ?? "–"} ${info("lado_vwap")}</div>
    <details class="ls-more"${desktop ? " open" : ""}><summary>Detalhes da ponta e do subjacente</summary>
      <dl class="ls-dl">
        <dt>Preço médio ${info("preco_medio")}</dt><dd>${px(l.avg)}</dd>
        <dt>Preço</dt><dd>${px(l.quote?.P)}</dd>
        <dt>Melhor preço ${info("hwm")}</dt><dd>${px(l.hwm)}</dd>
        <dt>Devolução ${info("devolucao")}</dt><dd>${fin(m?.devolucao) ? `${num(m.devolucao, 0)}%` : "–"}</dd>
        <dt>Concentração ${info("concentracao")}</dt><dd>${fin(m?.concPct) ? `${num(m.concPct, 1)}%` : "–"}</dd>
        <dt>Decaimento ${info("decaimento")}</dt><dd>${fin(m?.decayPp) ? `${num(m.decayPp, 1)} p.p.` : "–"}</dd>
        <dt>Pregões carregados ${info("pregoes_carregados")}</dt><dd>${l.sessions ?? 0}</dd>
        <dt>Spread ${info("spread")}</dt><dd>${fin(m?.spreadPct) ? `${num(m.spreadPct, 2)}%` : "sem bid/ask"}</dd>
        <dt>Idade da cotação ${info("idade_cotacao")}</dt><dd>${fin(age) ? `${Math.round(age)} s` : "–"}</dd>
        <dt>${esc(a.ok ? a.under : "Subjacente")} agora</dt><dd>${px(u.S)}</dd>
        <dt>VWAP ${info(u.vwap?.approx ? "vwap_aproximada" : "vwap")}</dt><dd>${px(u.vwap?.value)}${u.vwap?.approx ? " ⚠ aprox." : ""}</dd>
        <dt>VWAP estendida ${info("vwap_estendida")}</dt><dd>${px(u.vwapExt?.value)}${u.vwapExt?.approx ? " ⚠ aprox." : ""}</dd>
        <dt>Faixa de abertura ${info("faixa_abertura")}</dt><dd>${u.or ? `${px(u.or.lo)}–${px(u.or.hi)}${u.or.done ? "" : " (formando)"}` : "–"}</dd>
        <dt>Máx./mín. do pré ${info("pmh_pml")}</dt><dd>${u.pre ? `${px(u.pre.lo)}–${px(u.pre.hi)}` : "–"}</dd>
        <dt>Gap ${info("gap")}</dt><dd>${u.gap ? `${num(u.gap.pct, 2)}% · ${fin(u.gap.atr) ? `${num(u.gap.atr, 2)} ATR` : "–"}` : "–"}</dd>
        <dt>Cruzamentos da VWAP ${info("cruzamentos_vwap")}</dt><dd>${u.crosses ?? "–"}</dd>
        <dt>Rompimento · vol. relativo ${info("volume_relativo")}</dt><dd>${u.breakout?.dir ?? "nenhum"} · ${fin(u.breakout?.volRel) ? `${num(u.breakout.volRel, 1)}x` : "–"}</dd>
        <dt>ATR 15 min ${info("atr_intra")}</dt><dd>${px(u.atrIntra)}</dd>
        <dt>ATR diário ${info("atr_d")}</dt><dd>${px(u.atrD)}</dd>
        <dt>Viés ${info("vies")}</dt><dd>${u.bias ?? "–"}</dd>
      </dl>
    </details>
  </div>`; // prettier-ignore
}
function pairCard(c, pr, idx, desktop) {
  const info0 = c.out.pairs[idx];
  const iL = c.out.legs.findIndex((m) => m.pairId === pr.id && m.legKind === "long");
  const iS = c.out.legs.findIndex((m) => m.pairId === pr.id && m.legKind === "short");
  const plan = c.plan?.pairs?.[pr.id];
  const corr = info0?.corr;
  const beta = Object.entries(pr.betas ?? {}).map(([u, b]) => `${u} ${fin(b) ? num(b, 2) : "–"}`).join(" · "); // prettier-ignore
  return `<article class="ls-pair">
    <header><b>${esc(pr.name)}</b> · Cenário ${info0?.scenario ?? 0}: ${SCEN[info0?.scenario ?? 0]} ${info("cenario")}</header>
    <div class="ls-row"><span>P&L do par <b class="${tone(info0?.pnlR)}">${rTxt(info0?.pnlR)}</b> ${info("pnl_par")}</span>
      <span>Direcional ${info0?.desvio ? xTxt(info0.desvio.efetivo) : "–"} ${info("direcional_efetiva")} / plano ${xTxt(plan?.dirPlan ?? 0)} ${info("direcional_planejada")}</span>
      <span>Correlação ${fin(corr) ? num(corr, 2) : "–"} ${info("correlacao")}</span></div>
    ${info0?.sameUnder ? `<p class="ls-sub wait">⚠ Mesmo subjacente bull × bear: exposição perto de zero e decaimento em dobro ${info("mesmo_subjacente")}</p>` : ""}
    ${legRow(pr.long, c.out.legs[iL], "long", desktop)}${legRow(pr.short, c.out.legs[iS], "short", desktop)}
    <p class="ls-sub">Beta 60d ${info("beta")}: ${esc(beta || "–")}</p>
  </article>`; // prettier-ignore
}
function alertsBlock(c) {
  const feed = c.feed ?? state.lsFeed ?? [];
  const cls = { critico: "down", acao: "acc", atencao: "wait", info: "" };
  const ico = { critico: "‼", acao: "→", atencao: "⚠", info: "·" };
  return `<section class="ls-block"${T("alerts")}><h3>Alertas (${feed.length}) ${info("alertas")}</h3>${feed.length ? `<ul class="ls-feed">${feed.map((a) => `<li class="${cls[a.prio]}"><span class="ls-num">${a.t}</span> <b>${ico[a.prio]} ${a.id}</b>${a.sym ? ` ${esc(a.sym)}` : ""} ${esc(a.msg)}</li>`).join("")}</ul>` : `<p class="ls-sub">Nenhum alerta.</p>`}</section>`; // prettier-ignore
}
function planBlock(c) {
  const plan = c.plan ?? {};
  const open =
    state.lsOpen === "plan" ||
    (state.lsTour != null && TOUR[state.lsTour]?.anchor === "plan") ||
    (!c.input.plan.ok && c.input.session !== "FECHADO");
  const rows = c.pairs.map((p) => {
    const id = pairId(p);
    const v = plan.date === c.input.date ? (plan.pairs?.[id] ?? {}) : {};
    return `<fieldset class="ls-plan-pair"><legend>${esc(p[0])} × ${esc(p[1])}</legend>
      <label>Viés ${info("plano_vies")}<select data-ls-plan="${esc(id)}" data-f="bias">${["", "alta", "baixa", "neutro"].map((x) => `<option${v.bias === x ? " selected" : ""} value="${x}">${x || "—"}</option>`).join("")}</select></label>
      <label>Gatilho ${info("plano_gatilho")}<input data-ls-plan="${esc(id)}" data-f="trigger" value="${esc(v.trigger ?? "")}" placeholder="ex.: SOXX acima de 250"></label>
      <label>Direcional (x capital) ${info("plano_direcional")}<input data-ls-plan="${esc(id)}" data-f="dirPlan" inputmode="decimal" value="${fin(v.dirPlan) ? num(v.dirPlan, 2) : ""}" placeholder="0"></label>
    </fieldset>`; // prettier-ignore
  });
  if (fin(c.account) && !fin(state.lsPlanCap)) state.lsPlanCap = Math.round(c.account); // congelado: o campo não anda com os preços
  const cap = plan.date === c.input.date && fin(plan.capital) ? num(plan.capital, 0) : fin(state.lsPlanCap) ? num(state.lsPlanCap, 0) : ""; // prettier-ignore
  return `<details class="ls-block ls-plan"${T("plan")}${open ? " open" : ""} id="ls-plan"><summary><h3>Plano do dia ${info("plano_dia")}</h3> ${c.input.plan.ok ? "✓ preenchido" : "✗ falta"}</summary>
    <label>Capital do dia (US$) <input data-ls-plancap inputmode="decimal" value="${cap}"></label>
    ${rows.join("") || `<p class="ls-sub">Monte as duplas em Carteira › Duplas L/S: elas viram os pares daqui.</p>`}
    <button class="btn" data-ls-plansave>Salvar plano de hoje</button>
    ${c.meta.planErrors.length && plan.date === c.input.date ? `<p class="ls-sub wait">⚠ ${esc(c.meta.planErrors.join("; "))}</p>` : ""}
  </details>`; // prettier-ignore
}
function setupBlock(c) {
  const user = store.get(PARAMS_KEY, {}) ?? {};
  const unknown = [...new Set(c.pairs.flat())].filter((s) => !assetInfo(s, store.get(ASSETS_KEY, {}) ?? {}).ok); // prettier-ignore
  const show = ["risco_por_ponta_pct_capital", "perda_diaria_max_pct_capital", "stop_inicial_atr_intraday", "spread_max_pct", "desvio_direcional_max_x_capital", "aluguel_base_dias"]; // prettier-ignore
  const tipOf = { risco_por_ponta_pct_capital: "param_r", perda_diaria_max_pct_capital: "param_perda_diaria", stop_inicial_atr_intraday: "param_stop_atr", spread_max_pct: "param_spread", desvio_direcional_max_x_capital: "param_desvio_direcional", aluguel_base_dias: "param_aluguel_base" }; // prettier-ignore
  return `<details class="ls-block"${unknown.length ? " open" : ""}><summary><h3>Cadastro e parâmetros</h3></summary>
    ${unknown.map((s) => `<fieldset class="ls-plan-pair"><legend>${esc(s)}: sem cadastro (sem quantidade até preencher)</legend>
      <label>Alavancagem <select data-ls-asset="${esc(s)}" data-f="L"><option value="">—</option><option>2</option><option>3</option><option>1</option></select></label>
      <label>Tipo <select data-ls-asset="${esc(s)}" data-f="type"><option value="">—</option><option value="1">bull</option><option value="-1">bear</option></select></label>
      <label>Subjacente <input data-ls-asset="${esc(s)}" data-f="under" placeholder="ex.: QQQ"></label></fieldset>`).join("")}
    <div class="ls-params">${show.map((k) => `<label>${esc(k.replace(/_/g, " "))} ${info(tipOf[k])}<input data-ls-param="${k}" inputmode="decimal" value="${fin(user[k]) ? num(user[k], 2) : ""}" placeholder="${num(PARAMS[k], 2)}"></label>`).join("")}</div>
    <p class="ls-sub">Vazio = padrão do arquivo de regras (schema v4). ${Object.keys(ETF_CATALOG).length} ETFs alavancados já cadastrados.</p>
  </details>`; // prettier-ignore
}

// ───────── folhas e crítico ─────────
function sheet(c) {
  const s = state.lsSheet;
  if (!s) return "";
  // cópia CONGELADA da ordem ao abrir: a lista muda a cada preço e os campos não podem voltar sozinhos
  const o = s.order;
  const gone = !s.live && !c.out.orders?.some((x) => x.id === o.id);
  const warn = gone ? `<p class="ls-sub wait">⚠ Com o preço novo essa ordem saiu da lista. Registre só se executou de fato.</p>` : ""; // prettier-ignore
  if (s.kind === "exec") {
    return `<div class="ls-sheet" role="dialog" aria-modal="true" aria-label="Registrar execução"><div class="ls-sheet-in">
      <h3>Executei: ${esc(ACT(o))} ${esc(o.sym)}</h3>${warn}
      <label>Quantidade executada ${info("exec_quantidade")}<input id="ls-x-q" inputmode="numeric" value="${s.init.qty}"></label>
      <label>Preço médio executado ${info("exec_preco")}<input id="ls-x-p" inputmode="decimal" value="${px(s.init.price)}"></label>
      <label>Custos (US$) ${info("exec_custos")}<input id="ls-x-f" inputmode="decimal" value="0"></label>
      <fieldset><legend>Se executou menos que ${s.init.qty}: o saldo ${info("saldo_status")}</legend>
        <label><input type="radio" name="ls-x-rem" value="aberto" checked> continua aberto na corretora</label>
        <label><input type="radio" name="ls-x-rem" value="cancelado"> foi cancelado</label></fieldset>
      <div class="ls-btns"><button class="btn" data-ls-confirm>Confirmar</button><button class="btn ghost" data-ls-close>Cancelar</button></div>
    </div></div>`; // prettier-ignore
  }
  return "";
}
const CRIT = ["RSK-01", "RSK-02", "BEH-01"];
function critical(c) {
  if (c.demo) return "";
  const b = c.bookData;
  const hit = c.alerts.find((a) => CRIT.includes(a.id) && !b.day.ack?.[a.id]);
  const allBad = c.out.legs?.length > 0 && c.out.legs.every((m) => !m.ok || !m.quote?.ok) && c.input.session !== "FECHADO"; // prettier-ignore
  const a = hit ?? (allBad && !b.day.ack?.["EXE-01"] ? { id: "EXE-01", msg: "Preço não confiável em todas as pontas: entradas bloqueadas." } : null); // prettier-ignore
  if (!a) return "";
  return `<div class="ls-crit" role="alertdialog" aria-modal="true" aria-label="Alerta crítico"><div class="ls-crit-in">
    <p class="ls-crit-id">‼ ${a.id} ${info("prioridade_critico")}</p><p class="ls-crit-msg">${esc(a.msg)}</p>
    <p class="ls-sub">As ordens de zerar continuam na lista: zere na corretora.</p>
    <button class="btn" data-ls-ack="${a.id}">Li e entendi</button></div></div>`; // prettier-ignore
}
function tipPop() {
  const id = state.lsTip;
  if (!id || !TIPS[id]) return "";
  const t = tipText(id, state.lsTipVars ?? {});
  return `<div class="ls-tip" role="tooltip" id="ls-tip-pop"><b>O que é</b> ${esc(t.que)}<br><b>Como ler</b> ${esc(t.ler)}${t.fazer ? `<br><b>O que fazer</b> ${esc(t.fazer)}` : ""} <button class="ls-tip-x" data-ls-tip-close aria-label="Fechar ajuda">×</button></div>`; // prettier-ignore
}

/** Exemplo do tour: mesmo motor e mesma tela, com a carteira da especificação (nada é registrado). */
function demoCompute() {
  const input = demoInput();
  const out = computeLs(input);
  const alerts = evaluateAlerts(input, out);
  return {
    demo: true,
    input,
    out,
    alerts,
    feed: alerts.map((a) => ({ ...a, t: "10:15" })),
    meta: { missing: [], paramErrors: [], planErrors: [], capitalFrom: "plano" },
    rec: { ok: true, issues: [] },
    rows: [],
    pairs: [["SOXL", "SQQQ"]],
    plan: { date: input.date, capital: input.capital, pairs: input.plan.pairs },
    account: input.capital,
    bookData: loadBook(null).data,
  };
}
function guideBlock() {
  const on = state.lsTour != null && TOUR[state.lsTour]?.anchor === "guide";
  const li = (xs) => xs.map(([a, b]) => `<li><b>${esc(a)}</b> ${esc(b)}</li>`).join("");
  return `<details class="ls-block ls-guide"${T("guide")}${on || state.lsOpen === "guide" ? " open" : ""}><summary><h3>Como usar</h3> rotina, cores e regras</summary>
    <p><button class="btn" data-ls-tour-start>Fazer o tour guiado (2 min)</button></p>
    <h4>Rotina do dia</h4><ol class="ls-man">${li(MANUAL.routine)}</ol>
    <h4>O que cada cor quer dizer</h4><ul class="ls-man">${li(MANUAL.colors)}</ul>
    <h4>Regras que o app aplica sozinho</h4><ul class="ls-man">${MANUAL.rules.map((r) => `<li>${esc(r)}</li>`).join("")}</ul>
  </details>`; // prettier-ignore
}
function tourCard() {
  const i = state.lsTour;
  if (i == null) return "";
  const s = TOUR[i];
  const last = i === TOUR.length - 1;
  return `<div class="ls-tour" role="dialog" aria-label="Tour guiado"><div class="ls-tour-in">
    <p class="ls-tour-n">Tour · passo ${i + 1} de ${TOUR.length} · exemplo, nada é registrado</p>
    <h3>${esc(s.title)}</h3><p>${esc(s.text)}</p><p class="ls-tour-ex"><b>Exemplo:</b> ${esc(s.example)}</p>
    <div class="ls-btns">${i > 0 ? `<button class="btn ghost" data-ls-tour-prev>Voltar</button>` : ""}${last ? `<button class="btn" data-ls-tour-exit>Sair do tour</button>` : `<button class="btn" data-ls-tour-next>Próximo</button><button class="btn ghost" data-ls-tour-exit>Sair</button>`}</div>
  </div></div>`; // prettier-ignore
}
export function viewLongShort() {
  tick();
  const demo = state.lsTour != null;
  const now = demo ? DEMO_NOW : Date.now();
  const rows = state.valuation?.rows ?? [];
  if (!demo && !rows.length) return `<section class="ls"><h2>Long & Short</h2><p class="muted">Importe a carteira (ou aguarde a foto do BTG) para usar o painel.</p><p><button class="btn" data-ls-tour-start>Ver o tour guiado com um exemplo</button></p></section>`; // prettier-ignore
  const c = demo ? demoCompute() : { ...compute(now), bookData: book() };
  state.lsLast = c;
  const desktop = typeof window !== "undefined" && window.innerWidth >= 1100;
  const loading = !demo && !state.lsQuotes && c.input.session !== "FECHADO";
  const pairs = c.input.pairs.map((pr, i) => pairCard(c, pr, i, desktop)).join("");
  const left = `${metrics(c)}${loading ? `<p class="ls-sub">Carregando cotações com bid/ask…</p>` : ordersBlock(c)}${alertsBlock(c)}`; // prettier-ignore
  const right = `<section class="ls-block"${T("pairs")}><h3>Pares</h3>${pairs || `<p class="ls-sub">Nenhuma dupla com as duas pontas na carteira. Monte em Carteira › Duplas L/S.</p>`}</section>${planBlock(c)}${guideBlock()}${demo ? "" : setupBlock(c)}`; // prettier-ignore
  const invite = !demo && !store.get(TOUR_KEY, false) ? `<div class="ls-band acc">Primeira vez aqui? <button class="btn small" data-ls-tour-start>Fazer o tour (2 min)</button> <button class="btn small ghost" data-ls-tour-skip>Agora não</button></div>` : ""; // prettier-ignore
  const demoBand = demo ? `<div class="ls-band acc">◆ EXEMPLO do tour: não são as suas posições e nenhum botão registra nada.</div>` : ""; // prettier-ignore
  return `<section class="ls${demo ? " touring" : ""}">${demoBand}${invite}${statusBar(c, now)}<div class="ls-cols"><div class="ls-col">${left}</div><div class="ls-col">${right}</div></div>
    <p class="ls-sub">O app não envia ordens: execute na corretora. Material educacional; não é recomendação de investimento.</p>
    ${demo ? "" : sheet(c)}${critical(c)}${tipPop()}${tourCard()}</section>`; // prettier-ignore
}

// ───────── eventos ─────────
const flash = (msg, tone = "ok") => {
  toast(msg, tone);
  hooks.render();
};
export function lsClick(e) {
  if (state.prefs.tab !== "longshort") return;
  const t = e.target;
  const tip = t.closest("[data-ls-tip]");
  if (tip) {
    state.lsTip = state.lsTip === tip.dataset.lsTip ? null : tip.dataset.lsTip;
    try {
      state.lsTipVars = tip.dataset.lsTipv ? JSON.parse(tip.dataset.lsTipv) : {};
    } catch {
      state.lsTipVars = {}; // dado da própria tela: sem valores, a dica sai com a chave visível
    }
    e.preventDefault();
    return hooks.render();
  }
  if (state.lsTip && !t.closest("#ls-tip-pop")) state.lsTip = null;
  if (t.closest("[data-ls-tip-close]")) return hooks.render();
  const q = (sel) => t.closest(sel);
  const go = (i) => {
    state.lsTour = i;
    state.lsTip = null;
    hooks.render();
    requestAnimationFrame(() => document.querySelector("[data-tour-on]")?.scrollIntoView({ block: "center", behavior: "smooth" })); // prettier-ignore
  };
  if (q("[data-ls-tour-start]")) return go(0);
  if (q("[data-ls-tour-next]")) return go(Math.min(TOUR.length - 1, (state.lsTour ?? 0) + 1));
  if (q("[data-ls-tour-prev]")) return go(Math.max(0, (state.lsTour ?? 0) - 1));
  if (q("[data-ls-tour-exit]") || q("[data-ls-tour-skip]")) {
    store.set(TOUR_KEY, true);
    state.lsTour = null;
    return hooks.render();
  }
  const c = state.lsLast;
  if (!c) return;
  if (
    c.demo &&
    q(
      "[data-ls-exec],[data-ls-ignore],[data-ls-stop],[data-ls-rem],[data-ls-execlive],[data-ls-plansave],[data-ls-calok],[data-ls-ack],[data-ls-confirm]",
    )
  )
    // prettier-ignore
    return flash("No tour é só exemplo: nada é registrado. Saia do tour para usar na sua carteira.");
  const now = Date.now();
  if (q("[data-ls-open]")) {
    state.lsOpen = q("[data-ls-open]").dataset.lsOpen;
    hooks.render();
    return document.getElementById("ls-plan")?.scrollIntoView({ block: "start" });
  }
  const open = (kind, o, live = false) => {
    const leg = c.input.pairs.flatMap((p) => [p.long, p.short]).find((l) => l?.sym === o.sym);
    state.lsSheet = { kind, live, order: { ...o }, init: { qty: o.qty, price: o.limit ?? leg?.quote?.P ?? null }, leg: leg ? { avg: leg.avg, dir: leg.dir, S: leg.under?.S, P: leg.quote?.P } : null }; // prettier-ignore
    hooks.render();
  };
  if (q("[data-ls-exec]")) {
    const o = c.out.orders.find((x) => x.id === q("[data-ls-exec]").dataset.lsExec);
    return o ? open("exec", o) : flash("A ordem mudou com o preço novo: confira a lista.", "warn");
  }
  if (q("[data-ls-ignore]")) {
    // um toque, sem motivo obrigatório: some da lista por 15 min (risco ignorado conta no BEH-01)
    const o = c.out.orders.find((x) => x.id === q("[data-ls-ignore]").dataset.lsIgnore);
    if (!o) return flash("A ordem mudou com o preço novo: confira a lista.", "warn");
    saveBook(recordIgnore(book(), { id: o.alert ?? o.reason, sym: o.sym, ts: now, orderId: o.id }));
    return flash(`Ignorada por 15 min: ${ACT(o)} ${o.qty} ${o.sym}.`);
  }
  if (q("[data-ls-execlive]")) {
    const bo = book().orders.find((x) => x.id === q("[data-ls-execlive]").dataset.lsExeclive);
    if (!bo) return;
    return open("exec", { id: bo.id, pairId: bo.pairId, sym: bo.sym, purpose: bo.purpose, side: bo.side, qty: (bo.qtySug ?? 0) - (bo.qtyExec ?? 0), limit: bo.limit, stop: bo.stop, reason: bo.reason, alert: bo.alert, episode: bo.episode }, true); // prettier-ignore
  }
  if (q("[data-ls-close]")) return ((state.lsSheet = null), hooks.render());
  if (q("[data-ls-confirm]")) {
    const sh = state.lsSheet;
    if (!sh?.order) return;
    const o = sh.order;
    const qty = parseNum(document.getElementById("ls-x-q")?.value);
    const price = parseNum(document.getElementById("ls-x-p")?.value);
    const fees = parseNum(document.getElementById("ls-x-f")?.value) ?? 0;
    const rem = document.querySelector('input[name="ls-x-rem"]:checked')?.value ?? "aberto";
    if (!(qty > 0) || !Number.isInteger(qty) || !(price > 0) || !(fees >= 0)) return flash(`Quantidade inteira > 0, preço > 0 e custos ≥ 0 (separador decimal: "${decSep()}").`, "warn"); // prettier-ignore
    const ref = sh.init.price ?? sh.leg?.P;
    if (ref > 0 && Math.abs(price / ref - 1) > 0.2) return flash(`Preço ${px(price)} está a mais de 20% do limite ${px(ref)}: confira o número (e o separador decimal).`, "warn"); // prettier-ignore
    if (qty > o.qty) return flash(`Executou mais que a ordem (${o.qty})? Registre só a ordem sugerida e corrija a Carteira.`, "warn"); // prettier-ignore
    try {
      const r = recordExecution(book(), o, { uid: `${o.id}|${now}`, qty, price, fees, ts: now, remainder: qty < o.qty ? rem : null, avg: sh.leg?.avg, dir: sh.leg?.dir, S: sh.leg?.S, R: c.out.portfolio?.R }); // prettier-ignore
      saveBook(r.data);
      state.lsSheet = null;
      return flash(`Registrado: ${ACT(o)} ${qty} ${o.sym} @ ${px(price)}.${o.purpose === "ENTRAR" || o.purpose === "AUMENTAR" ? ` Coloque o stop ${px(o.stop)} na corretora.` : ""}`); // prettier-ignore
    } catch (err) {
      return flash(`Não registrado: ${err.message}`, "warn");
    }
  }
  if (q("[data-ls-stop]")) {
    const el = q("[data-ls-stop]");
    try {
      saveBook(setStop(book(), el.dataset.lsStop, Number(el.dataset.to), { ts: Date.now() }));
      return flash(`Stop de ${el.dataset.lsStop} = ${px(Number(el.dataset.to))}.`);
    } catch (err) {
      return flash(err.message);
    }
  }
  if (q("[data-ls-rem]")) {
    const el = q("[data-ls-rem]");
    saveBook(answerRemainder(book(), el.dataset.lsRem, el.dataset.ans, now));
    return hooks.render();
  }
  if (q("[data-ls-ack]")) {
    saveBook(ackCritical(book(), q("[data-ls-ack]").dataset.lsAck));
    return hooks.render();
  }
  if (q("[data-ls-calok]")) {
    const plan = { ...(store.get(PLAN, null) ?? {}), calOk: c.input.date };
    store.set(PLAN, plan);
    return hooks.render();
  }
  if (q("[data-ls-plansave]")) {
    const plan = { date: c.input.date, capital: parseNum(document.querySelector("[data-ls-plancap]")?.value), pairs: {}, filledAt: now, calOk: store.get(PLAN, null)?.calOk ?? null }; // prettier-ignore
    for (const el of document.querySelectorAll("[data-ls-plan]")) {
      const id = el.dataset.lsPlan;
      const p = (plan.pairs[id] ??= {});
      p[el.dataset.f] = el.dataset.f === "dirPlan" ? (parseNum(el.value) ?? 0) : el.value.trim();
    }
    store.set(PLAN, plan);
    state.lsOpen = null;
    return flash("Plano de hoje salvo.");
  }
}
export function lsChange(e) {
  if (state.prefs.tab !== "longshort" || state.lsTour != null) return;
  const t = e.target;
  const ds = t.dataset ?? {};
  if (ds.lsSetstop) {
    const v = parseNum(t.value);
    if (v === null) return;
    const leg = state.lsLast?.input.pairs.flatMap((p) => [p.long, p.short]).find((l) => l?.sym === ds.lsSetstop); // prettier-ignore
    const P = leg?.quote?.P;
    const back = () => (t.value = fin(leg?.stop) ? px(leg.stop) : ""); // recusado: o campo volta ao stop gravado
    if (!(v > 0))
      return (back(), flash(`Stop inválido (separador decimal: "${decSep()}").`, "warn"));
    if (P > 0 && (leg.dir === 1 ? v >= P : v <= P)) return back(), flash(`Stop ${px(v)} do lado errado do preço ${px(P)}: zere em vez de pôr stop acima do preço.`, "warn"); // prettier-ignore
    try {
      saveBook(setStop(book(), ds.lsSetstop, v, { dir: leg?.dir ?? 1, ts: Date.now() }));
      flash(`Stop de ${ds.lsSetstop} = ${px(v)}.`);
    } catch (err) {
      back();
      flash(err.message, "warn");
    }
  } else if (ds.lsParam) {
    const cur = { ...(store.get(PARAMS_KEY, {}) ?? {}) };
    const v = parseNum(t.value);
    if (Number.isNaN(v))
      return flash(`Número inválido (separador decimal: "${decSep()}").`, "warn");
    if (v === null) delete cur[ds.lsParam];
    else cur[ds.lsParam] = v;
    store.set(PARAMS_KEY, cur);
    hooks.render();
  } else if (ds.lsAsset) {
    const cur = { ...(store.get(ASSETS_KEY, {}) ?? {}) };
    const a = { ...(cur[ds.lsAsset] ?? {}) };
    a[ds.f] = ds.f === "under" ? t.value.trim().toUpperCase() : Number(t.value);
    cur[ds.lsAsset] = a;
    store.set(ASSETS_KEY, cur);
    hooks.render();
  }
}
