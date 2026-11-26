// Aba "Decisões": painel de tomada de decisão por WATCHLIST. "Minha carteira" é fixa; as outras o usuário cria
// colando tickers. Cada linha junta, para o ativo: preço do dia, Decisão do trader (técnica, fundamentos, mercado,
// situações parecidas), médio prazo, nível de preço próximo (resistência/suporte/stop, com backtest) e os sinais de
// curto prazo das regras. É a mesma conta do detalhe do ativo: o que a linha diz, o detalhe confirma.
import { WATCH_MAX } from "./watchlist.js";
import { an, ensureAnalysis, parseList, portfolioSyms } from "./analysis-data.js";
import { SUB_LABEL, decisionFromScan, holdNow, traderDecision } from "./decision.js";
import { hq, hx } from "./help.js";
import { levelAlert, mediumTerm, noPosAlert } from "./level-alerts.js";
import { signalsFor } from "./signals.js";
import { recordDiary } from "./simulator.js";
import { finalBanner, loadModel } from "./model-status.js";
import { pushLists } from "./cloud-sync.js";
import { esc, num, pct } from "./format.js";
import { fetchQuotes } from "./quote-hub.js";
import { LENS_GROUPS, lensLabel, lenses } from "./opps-dash.js";
import { taxOf } from "./taxonomy.js";
import { shiftOf } from "./regime-watch.js";
import { corrOf, hedgeOf, loadReturns } from "./correl.js";
import { quantOf } from "./quant-view.js";
import { loadScan, mkt, scanSyms, watchMarket } from "./market.js";
import { hooks, savePrefs, state } from "./state.js";
import { SECTOR_BLOCKS, SECTOR_BY_ID, SECTORS, sectorKind } from "./sectors.js";
import {
  champ,
  champCardHtml,
  champFilterHtml,
  champListSyms,
  champTag,
  loadChampions,
} from "./champions.js";

export const PF = "pf"; // id da lista fixa (carteira)
export const ALL = "all"; // visão global: carteira + todas as watchlists, sem repetir ticker
export const CH = "champ"; // lista fixa dos campeões dos setores (docs/ROADMAP-CAMPEOES.md)
export const SEC = "sec:"; // prefixo das listas fixas por setor (taxonomia de assets/sectors.js)
const MAX_LISTS = 8;
const QUOTE_TTL = 60_000;
const A_TTL = 10 * 60_000;
const FAIL_TTL = 60_000; // ativo que falhou tenta de novo em 1 min, não em 10
const PAINT_MS = 250; // no máximo um redesenho a cada 250 ms enquanto os blocos chegam
export const desk = { quotes: {}, quotesAt: 0, loading: false, tried: {}, again: false };

export const lists = () => state.prefs.watchlists ?? [];

/** Lista ativa: { id, name, syms, fixed, global }. */
export function activeList() {
  // sem escolha salva e sem carteira, abre no mercado inteiro (antes abria num estado vazio)
  const id = state.prefs.deskList ?? (portfolioSyms().length ? PF : ALL);
  if (id === ALL) {
    // visão do mercado: carteira + watchlists (análise completa) + o universo inteiro da varredura diária
    loadScan();
    const own = [...new Set([...portfolioSyms(), ...lists().flatMap((x) => x.syms)])];
    const syms = [...new Set([...own, ...scanSyms()])];
    return { id: ALL, name: "Todas: mercado inteiro", syms, own, fixed: true, global: true };
  }
  if (id === CH) {
    if (!champ.data)
      loadChampions().then((d) => d && state.prefs.tab === "signals" && hooks.render());
    const f = state.prefs.champFilter ?? "all";
    return {
      id: CH,
      name: "Campeões: sua lista + modelo",
      syms: champListSyms(f),
      fixed: true,
      champ: true,
    };
  }
  if (id.startsWith(SEC)) {
    const s = SECTOR_BY_ID[id.slice(SEC.length)] ?? SECTORS[0];
    return { id: SEC + s.id, name: `${s.id} · ${s.name}`, syms: s.syms, fixed: true, sector: s.id };
  }
  if (id !== PF) {
    const l = lists().find((x) => x.id === id);
    if (l) return { ...l, fixed: false };
  }
  return { id: PF, name: "Minha carteira", syms: portfolioSyms(), fixed: true };
}

/** Cria (ou atualiza, se o nome já existe) uma lista a partir do texto colado. */
export function saveList(name, text) {
  const syms = parseList(text, WATCH_MAX);
  const nm =
    String(name ?? "")
      .trim()
      .slice(0, 30) || `Lista ${lists().length + 1}`;
  if (!syms.length) return null;
  const all = [...lists()];
  const i = all.findIndex((x) => x.name.toLowerCase() === nm.toLowerCase());
  if (i < 0 && all.length >= MAX_LISTS) return null;
  const l = i >= 0 ? { ...all[i], syms } : { id: `w${Date.now().toString(36)}`, name: nm, syms };
  if (i >= 0) all[i] = l;
  else all.push(l);
  state.prefs.watchlists = all;
  state.prefs.deskList = l.id;
  savePrefs();
  pushLists();
  return l;
}

/** Põe um ativo numa watchlist existente (id) ou numa nova (name). Devolve a lista, ou { error }. */
export function addToList(sym, { id = null, name = "" } = {}) {
  const s = parseList(sym)[0];
  if (!s) return { error: "Símbolo inválido." };
  const all = [...lists()];
  const i = id ? all.findIndex((x) => x.id === id) : -1;
  if (i < 0) {
    if (!String(name).trim()) return { error: "Dê um nome à lista nova." };
    if (
      all.length >= MAX_LISTS &&
      !all.some((x) => x.name.toLowerCase() === String(name).trim().toLowerCase())
    )
      return { error: `Limite de ${MAX_LISTS} listas.` };
    const old = all.find((x) => x.name.toLowerCase() === String(name).trim().toLowerCase());
    return (
      saveList(name, [...(old?.syms ?? []), s].join(",")) ?? {
        error: "Não foi possível criar a lista.",
      }
    );
  }
  if (all[i].syms.includes(s)) return all[i];
  if (all[i].syms.length >= WATCH_MAX) return { error: `A lista já tem ${WATCH_MAX} ativos.` };
  all[i] = { ...all[i], syms: [...all[i].syms, s] };
  state.prefs.watchlists = all;
  savePrefs();
  pushLists();
  return all[i];
}

export function deleteList(id) {
  state.prefs.watchlists = lists().filter((x) => x.id !== id);
  if (state.prefs.deskList === id) state.prefs.deskList = PF;
  savePrefs();
  pushLists();
}

/** Linha do painel para um ativo (pura: recebe a análise, a cotação e a posição). */
export function deskRow(sym, { r, quote, hold, market }) {
  if (!r) return { sym, missing: true };
  const price = quote?.p > 0 ? quote.p : (hold?.price ?? r.price);
  const pc = quote?.pc > 0 ? quote.pc : null;
  const day = pc ? price / pc - 1 : (hold?.dayPLPct ?? null);
  const pos = hold?.qty > 0 ? hold : null;
  const dec0 = traderDecision({ ...r, price }, market, { gate: true });
  // com posição, a mesma decisão em verbos de quem tem o ativo (ampliar, manter, reduzir, vender)
  const dec = dec0 && pos ? { ...dec0, now: holdNow(dec0.now) } : dec0;
  // sem posição: o alerta de nível usa uma posição simbólica só para medir a proximidade; o texto vira compra/espera
  const alert = levelAlert(r, dec, { price, hold: pos ?? { qty: 1 } });
  const close = r.series?.close ? [...r.series.close] : [];
  if (close.length && quote?.p > 0) close[close.length - 1] = quote.p;
  const sigs = signalsFor(close, { sym, label: r.name ?? sym });
  return {
    sym,
    name: r.name ?? sym,
    price,
    day,
    dec,
    mt: dec ? mediumTerm(dec) : null,
    alert: alert && !pos ? { ...noPosAlert(alert), action: null } : alert,
    sigs,
    pos,
  };
}

/**
 * Linha a partir da varredura diária (data/market-scan.json): decisão do fechamento, ação de agora e níveis com o
 * preço ao vivo. Sem alerta de proximidade (precisa do histórico completo); sinais = os do fechamento.
 */
export function deskRowScan(sym, { row, quote, hold }) {
  const price = quote?.p > 0 ? quote.p : (hold?.price ?? row.p);
  const pc = quote?.pc > 0 ? quote.pc : null;
  const pos = hold?.qty > 0 ? hold : null;
  const dec0 = decisionFromScan(row, price);
  const dec = dec0 && pos ? { ...dec0, now: holdNow(dec0.now) } : dec0;
  const mt = Number.isFinite(row.mt) ? { dir: row.mt, label: row.mt >= 0.25 ? "médio prazo favorável" : row.mt <= -0.25 ? "médio prazo desfavorável" : "médio prazo neutro" } : null; // prettier-ignore
  return {
    sym,
    name: row.n ?? sym,
    price,
    day: pc ? price / pc - 1 : null,
    dec,
    mt,
    alert: null,
    sigs: (row.sig ?? []).map(([kind, title]) => ({ kind, title })),
    pos,
    scan: row.d,
  };
}

/** A decisão diz comprar mas o nível pede cautela: avisa na própria célula para não parecer contradição. */

/** Ação do nível em duas linhas: o que fazer agora e o gatilho (se fechar acima/abaixo de…). */
export const actionHtml = (a) =>
  `${a.action ? `<span class="tag ${a.tone}">${esc(a.action)}</span>` : ""}${a.trigger ? `<div class="small">${esc(a.trigger)}</div>` : ""}`;

/** Ordem: primeiro o que pede ação (alerta perto de nível, sinal), depois pela força da decisão. */
export function sortRows(rows) {
  const urg = (x) => (shiftOf(x.sym) ? 20 : 0) + (x.missing ? -9 : (x.alert ? (x.alert.tone === "wait" ? 2 : 4) : 0) + (x.sigs?.length ? 1 : 0)); // prettier-ignore
  return [...rows].sort((a, b) => urg(b) - urg(a) || Math.abs(b.dec?.final?.score ?? 0) - Math.abs(a.dec?.final?.score ?? 0)); // prettier-ignore
}

/** Busca o que falta: análise (api/analyze, 10 min) e cotações ao vivo (1 min). Só redesenha se buscou algo. */
export async function loadDesk(force = false) {
  const l = activeList();
  // em 🌐 Todas, o universo vem da varredura diária e das cotações do mercado (market.js): aqui só a carteira e listas
  const syms = l.own ?? l.syms;
  if (!syms.length) return;
  if (desk.loading) {
    if (force) desk.again = true; // atualizar no meio da carga: roda de novo ao terminar
    return;
  }
  const now = Date.now();
  const ttl = (s) => (an.items[s] ? A_TTL : FAIL_TTL);
  const needA = syms.filter((s) => force || now - (desk.tried[s] ?? 0) > ttl(s));
  const needQ = syms.filter((s) => !state.live?.quotes?.[s]);
  const qStale = needQ.length && (force || now - desk.quotesAt > QUOTE_TTL);
  if (!needA.length && !qStale) return;
  desk.loading = true;
  try {
    // cotações pela central (blocos estáveis de 60, o que o canal traz não é buscado, validade QUOTE_TTL)
    const q = qStale
      ? fetchQuotes(needQ, { id: "signals", ttl: QUOTE_TTL, force }).then((r) => {
          Object.assign(desk.quotes, r.quotes);
          Object.assign(mkt.quotes, r.quotes);
        })
      : null;
    if (qStale) desk.quotesAt = now;
    needA.forEach((s) => (desk.tried[s] = now));
    if (force) needA.forEach((s) => delete an.at[s]);
    // redesenha a cada bloco que chega, para a lista grande aparecer aos poucos
    const paint = schedulePaint;
    await Promise.all([
      q,
      needA.length ? ensureAnalysis(needA, { onLot: paint, parallel: 3 }) : null,
    ]);
  } finally {
    desk.loading = false;
  }
  if (state.prefs.tab === "signals") hooks.render();
  if (desk.again) {
    desk.again = false;
    loadDesk(true);
  }
}

let paintTimer = null;
/** Junta os redesenhos dos blocos que chegam em rajada: um render a cada PAINT_MS no máximo. */
function schedulePaint() {
  if (paintTimer) return;
  paintTimer = setTimeout(() => {
    paintTimer = null;
    if (state.prefs.tab === "signals") hooks.render();
  }, PAINT_MS);
}

// Linha pronta por ativo: só recalcula (decisão, nível, sinais) quando a análise, a cotação, a posição ou o
// mercado mudaram. Com listas grandes, cada redesenho deixa de refazer centenas de decisões.
const ROWS = new Map();
const rowKey = ({ quote, hold }) =>
  `${quote?.p ?? ""}|${quote?.pc ?? ""}|${hold?.qty ?? ""}|${hold?.price ?? ""}|${hold?.dayPLPct ?? ""}`;
export function cachedRow(sym, ctx) {
  const hit = ROWS.get(sym);
  const k = rowKey(ctx);
  if (
    hit &&
    hit.r === ctx.r &&
    hit.k === k &&
    hit.reg === ctx.market.regime &&
    hit.spy === ctx.market.spy
  )
    return hit.row;
  const row = deskRow(sym, ctx);
  ROWS.set(sym, { r: ctx.r, k, reg: ctx.market.regime, spy: ctx.market.spy, row });
  if (ROWS.size > 2000) ROWS.delete(ROWS.keys().next().value);
  return row;
}

const SROWS = new Map();
function scanRow(sym, ctx) {
  const k = `${ctx.row.d}|${ctx.row.sc}|${rowKey(ctx)}`;
  const hit = SROWS.get(sym);
  if (hit?.k === k) return hit.row;
  const row = deskRowScan(sym, ctx);
  SROWS.set(sym, { k, row });
  return row;
}

export function deskRows() {
  const l = activeList();
  const holds = Object.fromEntries((state.valuation?.rows ?? []).map((r) => [r.sym, r]));
  const market = { regime: state.snap?.regime, spy: state.prices?.series?.SPY, quantOf };
  return sortRows(
    l.syms.map((s) => {
      const quote = state.live?.quotes?.[s] ?? desk.quotes[s] ?? mkt.quotes[s];
      if (!an.items[s] && mkt.scanBy[s]) return scanRow(s, { row: mkt.scanBy[s], quote, hold: holds[s] }); // prettier-ignore
      return cachedRow(s, { r: an.items[s], quote, hold: holds[s], market });
    }),
  );
}

/** Tom da ação de agora (decisão × zona do preço); sem ela, o da decisão. */
const nowTone = (r) => r.dec?.now?.tone ?? r.dec?.final?.step.tone;

/** Filtros dos balões de contagem: cada um diz quais linhas entram nele. */
export const FILTERS = {
  buy: (r) => nowTone(r) === "buy",
  wait: (r) => nowTone(r) === "wait",
  sell: (r) => nowTone(r) === "sell",
  near: (r) => !!r.alert,
  sig: (r) => r.sigs?.length > 0,
};

/** Aplica o filtro do balão (sem filtro ou filtro desconhecido: devolve tudo). */
export const filterRows = (rows, f) =>
  FILTERS[f] ? rows.filter((r) => !r.missing && FILTERS[f](r)) : rows;

// ───────────── tela ─────────────

/** Linhas desenhadas de cada vez (montar 150 linhas custava ~33 ms no computador; no celular, 3–5×). */
export const DESK_PAGE = 60;
export const DESK_MORE = 90;

let moreObs = null;
/** Ao chegar perto do fim da tabela, desenha mais linhas sozinho (o botão "Mostrar mais" fica de reserva). */
export function watchDeskMore(view, render) {
  moreObs?.disconnect();
  const btn = view.querySelector("[data-desk-more]");
  if (!btn || typeof IntersectionObserver === "undefined") return;
  moreObs = new IntersectionObserver(
    (es) => {
      if (!es.some((e) => e.isIntersecting)) return;
      moreObs.disconnect();
      state.deskPage = (state.deskPage ?? DESK_PAGE) + DESK_MORE;
      render();
    },
    { rootMargin: "800px 0px" },
  );
  moreObs.observe(btn);
}

const TONE = (d) => (d >= 0.12 ? "buy" : d <= -0.12 ? "sell" : "wait");

function chips(cur) {
  const sec = SEC + (state.prefs.deskSector ?? SECTORS[0].id);
  const all = [
    { id: ALL, name: "Todas" },
    { id: PF, name: "Minha carteira" },
    { id: CH, name: "Campeões" },
    { id: sec, name: "Setores" },
    ...lists(),
  ];
  const ico = { [ALL]: "🌐 ", [PF]: "💼 ", [CH]: "🏆 ", [sec]: "🏷️ " };
  return `<div class="seg desk-lists" role="tablist">${all.map((l) => `<button class="${l.id === cur ? "on" : ""}" data-desk-list="${esc(l.id)}" aria-pressed="${l.id === cur}">${ico[l.id] ?? ""}${esc(l.name)}</button>`).join("")}<button data-desk-new aria-label="Nova watchlist">＋ Nova</button></div>`; // prettier-ignore
}

/** Seletor do rótulo da taxonomia (só na lista 🏷️ Setores). */
function sectorPicker(l) {
  if (!l.sector) return "";
  const groups = SECTOR_BLOCKS.map(([b, label]) => {
    const o = SECTORS.filter((s) => s.block === b).map((s) => `<option value="${esc(s.id)}" ${s.id === l.sector ? "selected" : ""}>${esc(s.id)} · ${esc(s.name)}</option>`).join(""); // prettier-ignore
    return `<optgroup label="${esc(label)}">${o}</optgroup>`;
  }).join("");
  return `<label class="desk-sec">Setor / rótulo<select data-desk-sector aria-label="Setor da taxonomia">${groups}</select></label>
    <p class="muted small">Ações = vencedores relativos do subsetor (líderes recentes, sem garantia de retorno). <span class="tag wait">LEV</span> alavancado e <span class="tag sell">INV</span> inverso replicam o retorno do dia e perdem valor em mercado lateral; uso tático.</p>`;
}

function form(l) {
  const edit = l && !l.fixed;
  return `<form class="card desk-form" data-desk-form ${state.deskForm || edit ? "" : "hidden"}>
    <h3>${edit && !state.deskForm ? `Editar "${esc(l.name)}"` : "Nova watchlist"}</h3>
    <div class="desk-form-row"><input name="name" placeholder="Nome (ex.: Tech, Dividendos)" maxlength="30" value="${edit && !state.deskForm ? esc(l.name) : ""}"/></div>
    <textarea name="syms" rows="2" placeholder="Cole os tickers: AAPL, MSFT NVDA; VOO…">${edit && !state.deskForm ? esc(l.syms.join(", ")) : ""}</textarea>
    <div class="desk-form-row"><button class="btn primary" type="submit">Salvar</button>${edit && !state.deskForm ? `<button class="btn" type="button" data-desk-del="${esc(l.id)}">Excluir lista</button>` : ""}<span class="muted small">Sem limite de tickers por lista; até ${MAX_LISTS} listas. Fica salvo na nuvem (com login) e vale em todos os aparelhos.</span></div></form>`;
}

function metrics(rows, cur) {
  const ok = rows.filter((r) => !r.missing && r.dec?.final);
  const c = { buy: 0, wait: 0, sell: 0 };
  ok.forEach((r) => c[r.dec.now?.tone ?? r.dec.final.step.tone]++);
  const near = rows.filter((r) => r.alert).length;
  const sig = rows.reduce((a, r) => a + (r.sigs?.length ?? 0), 0);
  const box = (f, v, l, cls = "") => `<button type="button" class="desk-m ${cls}${cur === f ? " on" : ""}" data-desk-filter="${f}" aria-pressed="${cur === f}" title="${cur === f ? "Toque de novo para tirar o filtro" : "Filtrar a lista"}"><b>${v}</b><span>${l}${f === "wait" ? hq("tone", c) : f === "near" ? hq("near", { n: near }) : ""}</span></button>`; // prettier-ignore
  return `<div class="desk-ms">${box("buy", c.buy, "Comprar / ampliar", "buy")}${box("wait", c.wait, "Esperar / manter", "wait")}${box("sell", c.sell, "Não comprar / reduzir", "sell")}${box("near", near, "Perto de um nível", near ? "hot" : "")}${box("sig", sig, "Sinais de curto prazo")}</div>`; // prettier-ignore
}

const KIND_TAG = { LEV: "wait", INV: "sell", ETF: "" };

/** Dados da decisão para o balão "?": rótulo, confiança e a direção de cada análise. */
const decCtx = (r) => ({
  sym: r.sym,
  label: r.dec.now?.label ?? r.dec.final.step.label,
  bias: r.dec.final.step.label,
  conf: r.dec.final.conf,
  conflict: !!r.dec.final.conflict,
  subs: ["tech", "fund", "market", "history", "quant"]
    .filter((k) => r.dec.subs?.[k])
    .map((k) => ({ name: SUB_LABEL[k], dir: +(r.dec.subs[k].dir ?? 0).toFixed(2) })),
});

/**
 * Nível de preço da ação de agora, comparado ao preço atual: comprar → zona de compra; vender → onde vender
 * (repiques até a 1ª resistência); esperar → a faixa entre a zona de compra e a de realizar.
 */
export function levelsHtml(r) {
  const lad = r.dec?.ladder ?? [];
  const now = r.dec?.now;
  const p = r.price;
  if (!now || !lad.length || !(p > 0)) return `<span class="muted small">–</span>`;
  const n = (x) => (Number.isFinite(x) ? num(x, 2) : "–");
  const d = (x) => (Number.isFinite(x) ? pct(x / p - 1, 1) : "");
  const zone = lad.find((x) => x.zone);
  const res = lad.find((x) => x.kind === "sell" && x.to !== null);
  const stop = lad.find((x) => x.kind === "stop");
  const line = (t) => `<div class="small">${t}</div>`;
  const stopTxt = stop?.to ? ` · stop ${n(stop.to)} (${d(stop.to)})` : "";
  if (now.key === "buy")
    return `<span class="tag buy">${now.held ? "Ampliar" : "Comprar"} agora: ${n(p)}</span>${line(`alvo ${n(res?.from)} (${d(res?.from)})${stopTxt}`)}`;
  if (now.key === "buy-part")
    return `<span class="tag buy">Metade agora: ${n(p)}</span>${line(`resto em ${n(zone?.from)} – ${n(zone?.to)} (${d(zone?.to)})${stopTxt}`)}`;
  if (now.key === "wait-break")
    return `<span class="tag wait">Comprar acima de ${n(res?.from)}</span>${line(`preço ${n(p)} (${d(res?.from)} até romper) · ou em ${n(zone?.from)} – ${n(zone?.to)}`)}`;
  if (now.key === "no-buy")
    return `<span class="tag sell">${now.held ? `${now.label}: ${n(p)}` : "Fora: não comprar"}</span>${line(now.held ? `repiques até ${n(res?.from)} (${d(res?.from)})${stopTxt}` : `preço ${n(p)} · só reavaliar se a decisão mudar`)}`;
  return `<span class="tag wait">Esperar: ${n(zone?.to)} – ${n(res?.from)}</span>${line(`preço ${n(p)} · reavaliar abaixo de ${n(zone?.to)} (${d(zone?.to)}) ou acima de ${n(res?.from)} (${d(res?.from)})`)}`;
}

/** Colunas da tabela, na ordem padrão. Cada uma sabe desenhar o cabeçalho e a célula. */
export const COLS = [
  { id: "asset", th: () => "Ativo", td: (r, ctx) => `<td><span class="tk">${esc(r.sym)}</span>${ctx.sector === CH ? champTag(r.sym) : kindTag(ctx.sector, r.sym)}<div class="muted small nm">${esc(r.name)}</div><div class="small tax">${((t) => `${esc(t.theme)} · ${esc(t.sub)}`)(taxOf(r.sym, an.items[r.sym]))}</div></td>` },
  { id: "price", th: () => "Preço / dia", num: true, td: (r) => `<td class="num"><b>${num(r.price, 2)}</b><div class="${r.day > 0 ? "pos" : r.day < 0 ? "neg" : "muted"} small">${Number.isFinite(r.day) ? pct(r.day, 2) : ""}</div></td>` },
  { id: "dec", th: () => `Decisão do trader${hq("decision")}`, td: (r) => { const f = r.dec?.final; return `<td>${f ? `<span class="tag ${r.dec.now.tone}">${esc(r.dec.now.label)}</span>${hq("decision", decCtx(r))}<div class="muted small">${r.dec.now.label !== f.step.label ? `análises: ${esc(f.step.label)} · ` : ""}confiança ${esc(f.conf)}${hq("conf", { conf: f.conf })}${f.conflict ? " · análises discordam" : ""}${r.dec.now.note ? `<br/>${esc(r.dec.now.note)}` : ""}${r.scan ? `<br/><span class="muted" title="Análise do fechamento (varredura diária); ação e níveis com o preço de agora. Ao abrir o ativo, a análise é refeita com os dados de hoje e a linha passa a usar ela.">análise do fechamento ${esc(r.scan.slice(8, 10))}/${esc(r.scan.slice(5, 7))}</span>` : ""}</div>` : `<span class="muted">–</span>`}</td>`; } },
  { id: "mt", th: () => `Médio prazo${hq("mt")}`, td: (r) => `<td>${r.mt ? `<span class="tag ${TONE(r.mt.dir)}">${esc(mtLabel(r))}</span>${hq("mt", { sym: r.sym, label: r.mt.label })}` : "–"}</td>` },
  { id: "level", th: () => `Nível de preço${hq("near")}`, td: (r) => { const a = r.alert; return `<td>${levelsHtml(r)}${a ? `<div class="small" style="margin-top:4px"><b>${esc(a.headline)}</b>${hq(a.zone, { sym: r.sym, price: r.price, level: a.level, p: a.odds?.p, n: a.odds?.n })}<div class="small">${actionHtml(a)}</div></div>` : ""}</td>`; } },
  { id: "cor", th: () => "Correlação c/ carteira", num: true, td: (r) => { const c = corrOf(r.sym); return `<td class="num">${c ? `<span class="tag ${c.tone}" title="Escala 1–5: quintil do ρ (retornos diários, ~120 pregões) do ativo com a sua carteira entre todos os ativos (1 = menos correlacionado). ↓ = ρ abaixo do ρ médio da carteira (${num(c.avg, 2)}): diminui a correlação; ↑ = acima: aumenta.">${c.arrow ? `${c.arrow} ` : ""}${esc(c.label)}</span>${((h) => (h && !c.held && c.arrow === "↓" ? hx("hedge", { sym: r.sym, spy: h.spy }) : ""))(hedgeOf(r.sym, r.name))}<div class="muted small">ρ ${num(c.rho, 2)} · ${c.held ? "posição atual" : c.arrow === "↓" ? "diminui" : "aumenta"} (carteira ${num(c.avg, 2)})</div>` : `<span class="muted small">–</span>`}</td>`; } },
  { id: "sigs", th: () => `Sinais curto prazo${hq("sigs")}`, td: (r) => { const t = r.sigs.map((s) => `<span class="tag ${s.kind === "entry" ? "buy" : s.kind === "exit" ? "sell" : "wait"}">${s.kind === "entry" ? "▲" : s.kind === "exit" ? "▼" : "⚠"} ${esc(s.title)}</span>`).join(" "); return `<td>${t ? `${t}${hq("sigs", { sym: r.sym, list: r.sigs.map((x) => x.title) })}` : `<span class="muted small">–</span>`}</td>`; } },
]; // prettier-ignore
const COL_BY = Object.fromEntries(COLS.map((c) => [c.id, c]));
const COL_LABEL = { asset: "Ativo", price: "Preço", dec: "Decisão", mt: "Médio prazo", level: "Nível", cor: "Correlação", sigs: "Sinais" }; // prettier-ignore
const mtLabel = (r) => r.mt.label.replace("médio prazo ", "");

/** Ordem das colunas salva pelo usuário (ids desconhecidos saem; colunas novas entram no fim). */
export function colOrder(saved = state.prefs.deskCols) {
  const ok = (Array.isArray(saved) ? saved : []).filter((id) => COL_BY[id]);
  return [...new Set([...ok, ...COLS.map((c) => c.id)])];
}

/** Move a coluna `from` para o lugar da coluna `to` (arrastar e soltar). */
export function moveCol(order, from, to) {
  if (from === to || !order.includes(from) || !order.includes(to)) return order;
  const out = order.filter((x) => x !== from);
  out.splice(order.indexOf(to), 0, from);
  return out;
}

/** Filtros de objetividade: decisão de agora, médio prazo, ação do nível e sinais. Valor vazio = todos. */
export const COL_FILTERS = {
  theme: { label: "Setor / tema", val: (r) => taxOf(r.sym, an.items[r.sym]).theme },
  sub: { label: "Subtema", val: (r) => taxOf(r.sym, an.items[r.sym]).sub, dep: "theme" },
  kind: { label: "Tipo", val: (r) => taxOf(r.sym, an.items[r.sym]).kind ?? null },
  conf: { label: "Confiança", val: (r) => r.dec?.final?.conf ?? null },
  dec: { label: "Decisão", val: (r) => r.dec?.now?.label ?? null },
  mt: { label: "Médio prazo", val: (r) => (r.mt ? mtLabel(r) : null) },
  lvl: { label: "Ação", val: (r) => ({ buy: "Comprar / ampliar", sell: "Não comprar / reduzir", wait: "Esperar / manter" })[r.dec?.now?.tone] ?? null },
  near: { label: "Perto de nível", val: (r) => (r.alert ? "Sim" : "Não") },
  sig: { label: "Sinais", val: (r) => (r.sigs?.length ? "Com sinal" : "Sem sinal") },
  cor: { label: "Correlação c/ carteira", val: (r) => corrOf(r.sym)?.label ?? null },
}; // prettier-ignore

/** Valores escolhidos de um filtro (seleção múltipla; aceita o formato antigo, de um valor só). */
export const picked = (v) => (Array.isArray(v) ? v : v ? [v] : []);

export function applyColFilters(rows, f = {}, L = null) {
  const act = Object.entries(f)
    .filter(([k, v]) => COL_FILTERS[k] && picked(v).length)
    .map(([k, v]) => [k, new Set(picked(v))]);
  const q = String(f.q ?? "")
    .trim()
    .toUpperCase();
  const lens = f.lens ? (L ?? lenses())[f.lens] : null;
  if (!act.length && !q && !lens) return rows;
  const out = rows.filter(
    (r) =>
      !r.missing &&
      act.every(([k, v]) => v.has(COL_FILTERS[k].val(r))) &&
      (!q ||
        r.sym.startsWith(q) ||
        String(r.name ?? "")
          .toUpperCase()
          .includes(q)) &&
      (!lens || lens.rank.has(r.sym)),
  );
  // com uma lente, a ordem é a da lente (maior momentum, melhor nota, maior alta…)
  return lens ? out.sort((a, b) => lens.rank.get(a.sym) - lens.rank.get(b.sym)) : out;
}

/** Linhas que servem de base para um filtro dependente (subtema: só os temas escolhidos). */
function depBase(rows, c, f) {
  const dep = new Set(picked(f[c.dep]));
  return rows.filter((r) => !r.missing && dep.has(COL_FILTERS[c.dep].val(r)));
}

/** Tira do subtema os valores que não pertencem mais aos temas escolhidos. */
export function pruneDeps(rows, f) {
  const out = { ...f };
  for (const [k, c] of Object.entries(COL_FILTERS)) {
    if (!c.dep || !picked(out[k]).length) continue;
    const ok = new Set(depBase(rows, c, out).map(c.val));
    out[k] = picked(out[k]).filter((v) => ok.has(v));
  }
  return out;
}

function filterBar(rows, f) {
  const sel = Object.entries(COL_FILTERS)
    .map(([k, c]) => {
      if (c.dep && !picked(f[c.dep]).length) return ""; // subtema só aparece depois de escolher o tema
      const base = c.dep ? depBase(rows, c, f) : rows.filter((r) => !r.missing);
      const cnt = new Map();
      for (const r of base) {
        const v = c.val(r);
        if (v) cnt.set(v, (cnt.get(v) ?? 0) + 1);
      }
      const on = picked(f[k]);
      const vals = [...new Set([...cnt.keys(), ...on])].sort();
      const sum = !on.length ? "Todos" : on.length === 1 ? esc(on[0]) : `${on.length} escolhidos`;
      const open = state.deskMsOpen === k ? "open" : "";
      return `<div class="desk-f">${c.label}<details class="desk-ms${on.length ? " on" : ""}" data-desk-ms="${k}" ${open}><summary>${sum}</summary><div class="desk-ms-pop">${on.length ? `<button type="button" class="desk-ms-none" data-desk-ms-none="${k}">Limpar este filtro</button>` : ""}${vals.map((v) => `<label><input type="checkbox" data-desk-cf="${k}" value="${esc(v)}" ${on.includes(v) ? "checked" : ""}> ${esc(v)} <span class="muted">${cnt.get(v) ?? 0}</span></label>`).join("")}</div></details></div>`; // prettier-ignore
    })
    .join("");
  const L = lenses();
  const n = (id) => rows.filter((r) => L[id]?.rank.has(r.sym)).length;
  const lens = `<label class="desk-f desk-f-lens">Lente${f.lens && L[f.lens] ? ` <span class="muted">· ${esc(L[f.lens].src)}</span>` : ""}<select data-desk-cf="lens"><option value="">Todos os ativos</option>${LENS_GROUPS.map(([g, ids]) => `<optgroup label="${esc(g)}">${ids.map((id) => `<option value="${id}" ${f.lens === id ? "selected" : ""}>${esc(lensLabel(id))} (${n(id)})</option>`).join("")}</optgroup>`).join("")}</select></label>`; // prettier-ignore
  const search = `<label class="desk-f">Buscar<input type="search" data-desk-q placeholder="Ticker ou nome" value="${esc(f.q ?? "")}"></label>`;
  const any = Object.values(f).some((v) => picked(v).length);
  const moved = (state.prefs.deskCols ?? []).length > 0;
  return `<div class="desk-fbar">${lens}${search}${sel}${any ? `<button class="btn" data-desk-cf-clear>Limpar filtros</button>` : ""}${moved ? `<button class="btn" data-desk-cols-reset>Colunas na ordem padrão</button>` : ""}<span class="muted small">Arraste o título de uma coluna para trocá-la de lugar.</span></div>
    <div class="desk-colbar" aria-label="Ordem das colunas (arraste)">${colOrder()
      .map(
        (id) =>
          `<span class="desk-th tag neutral" data-desk-col="${id}">⠿ ${esc(COL_LABEL[id])}</span>`,
      )
      .join("")}</div>`;
}

function row(r, fixed, sector, order) {
  if (r.missing)
    return `<tr><td><span class="tk">${esc(r.sym)}</span></td><td colspan="5" class="muted">${desk.tried[r.sym] && !desk.loading ? "sem dados para este ticker (confira o código; ex.: PETR4.SA)" : "carregando…"}</td></tr>`;
  const open = fixed && r.pos ? `data-hold="${esc(r.sym)}"` : `data-an-sym="${esc(r.sym)}"`;
  const sh = shiftOf(r.sym); // só ativos da carteira entram no vigia
  return `<tr class="desk-row${sh ? " regime-shift" : ""}" ${open} tabindex="0" ${sh ? `title="Regime piorou: ${esc(sh.why.join("; "))}"` : ""}>${order.map((id) => COL_BY[id].td(r, { sector })).join("")}</tr>`;
}

function kindTag(sector, sym) {
  const k = sector ? sectorKind(sector, sym) : null;
  return k && k !== "SINGLE" ? ` <span class="tag ${KIND_TAG[k]} small">${k}</span>` : "";
}

/** HTML da aba. extra = seções antigas de Sinais (pares, universo, histórico, estatística). */
export function viewDesk(extra = "") {
  const l = activeList();
  if (l.syms.length) loadDesk();
  const rows = l.syms.length ? deskRows() : [];
  recordDiary(rows.filter((r) => !r.scan)); // diário do Simulador: o que a tela mostrou hoje, avaliado depois de 5 pregões
  loadModel(); // aviso de modelo final (Simulador → Aprendizado)
  const flt = FILTERS[state.deskFilter] ? state.deskFilter : null;
  const cf = pruneDeps(rows, state.prefs.deskF ?? {});
  if ((state.portfolio?.holdings ?? []).some((h) => h.qty > 0)) loadReturns(); // matriz de retornos: 1x, em segundo plano
  const shown = applyColFilters(filterRows(rows, flt), cf);
  // filtro de correlação: do que mais diminui a correlação da carteira para o que menos diminui
  if (picked(cf.cor).length && !cf.lens)
    shown.sort((a, b) => (corrOf(a.sym)?.rho ?? 9) - (corrOf(b.sym)?.rho ?? 9));
  const order = colOrder();
  const page = state.deskPage ?? DESK_PAGE; // listas grandes (🌐 Todas: ~900): desenha aos poucos
  const filtering = flt || Object.values(cf).some((v) => picked(v).length);
  const none = `<tr><td colspan="6" class="muted">Nenhum ativo desta lista neste filtro. Toque no balão de novo ou limpe os filtros para ver todos.</td></tr>`; // prettier-ignore
  const empty = l.champ
    ? ""
    : l.fixed
      ? `<div class="card empty"><p>Sua carteira está vazia. Importe ou adicione ativos na aba Carteira, ou crie uma watchlist em <b>＋ Nova</b>.</p><div class="empty-cta"><button class="btn" data-tab="portfolio">Ir para a Carteira</button></div></div>`
      : `<div class="card empty">Lista vazia.</div>`;
  watchMarket(); // universo de mercado do painel: histórico 1x/hora e cotação ao vivo 1x/min, só com a aba aberta
  return `<section class="desk">
    ${finalBanner()}
    ${chips(l.id)}
    ${sectorPicker(l)}
    ${l.champ ? `${champCardHtml()}${champFilterHtml(state.prefs.champFilter ?? "all")}` : ""}
    ${form(state.deskEdit ? l : null)}
    <div class="desk-head"><h2>${esc(l.name)} <span class="muted small">(${filtering ? `${shown.length} de ${l.syms.length}` : l.syms.length})</span></h2>
      <span class="desk-acts">${l.fixed ? "" : `<button class="btn" data-desk-edit>Editar</button>`}<button class="btn" data-desk-refresh>${desk.loading ? "Atualizando…" : "Atualizar"}</button><button class="btn" data-tab="entry">Radar técnico do universo</button></span></div>
    ${
      l.syms.length
        ? `${metrics(rows, flt)}${filterBar(rows, cf)}<div class="tw"><table class="desk-tbl"><thead><tr>${order.map((id) => `<th class="desk-th${COL_BY[id].num ? " num" : ""}" data-desk-col="${id}" title="Arraste para trocar a coluna de lugar">⠿ ${COL_BY[id].th()}</th>`).join("")}</tr></thead><tbody>${
            shown.length
              ? shown
                  .slice(0, page)
                  .map((r) => row(r, l.fixed, l.champ ? CH : l.sector, order))
                  .join("")
              : none
          }</tbody></table></div>${shown.length > page ? `<div style="margin:8px 0"><button class="btn" data-desk-more>Mostrar mais ${Math.min(DESK_MORE, shown.length - page)} (de ${shown.length - page} restantes)</button> <span class="muted small">Use os filtros e balões para chegar direto ao que interessa.</span></div>` : ""}${l.global && mkt.scan ? `<p class="note">🌐 Mercado inteiro: carteira e watchlists com análise completa; os demais ${mkt.scan.n} ativos vêm da varredura de ${esc(mkt.scan.date ?? "")} (mesma Decisão do trader, feita no fechamento), com a ação de agora e os níveis recalculados pelo preço ao vivo. Nessas linhas não há aviso de proximidade de nível; os sinais de curto prazo são os do fechamento.</p>` : ""}
    <p class="note">Ordenado pelo que pede ação primeiro (ativo da carteira cujo regime piorou, em laranja; perto de um nível, sinal ativo), depois pela força da decisão. Correlação c/ carteira = ρ dos retornos diários do ativo com os da sua carteira (~120 pregões), numa escala de 1 (20% menos correlacionados do mercado) a 5 (20% mais); ↓ diminui a correlação da carteira (ρ abaixo do ρ médio dela), ↑ aumenta e concentra o risco. Ao filtrar por ela, a lista vai do menor ρ ao maior. Toque num balão para filtrar a lista (de novo, tira o filtro); em 🌐 Todas os números somam a carteira e todas as watchlists, sem repetir ticker. Toque numa linha para abrir a análise completa (na carteira, com a posição). Decisão = técnica 35%, fundamentos 25%, mercado 20%, situações parecidas 20% e Quant Aberto 15% (só S&P 500; pesos relativos), ponderadas pela confiança (em ETFs, "comprar em partes" vira aguardar: foi a pior decisão no estudo de 10 anos; em ações segue valendo); médio prazo = fundamentos + mercado. Nível = preço a até 0,5 ATR de resistência, suporte ou stop, com a chance histórica de romper/segurar neste ativo. Ações possíveis sem posição: Comprar, Comprar em partes (metade agora, o resto na zona de compra), Esperar rompimento, Ficar de fora ou Não comprar; com posição: Ampliar, Manter, Reduzir ou Vender. Material educacional; não é recomendação de investimento.</p>`
        : empty
    }
  </section>${extra}`;
}
