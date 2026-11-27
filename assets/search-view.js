// Lupa do cabeçalho: busca de ativo com sugestões enquanto digita e página do ativo (estilo DES/GP da Bloomberg).
// Sugestões: primeiro o universo do app e a carteira (instantâneo), depois a api/search (Yahoo, aceita ISIN).
// Página: cabeçalho, estatísticas, faixas, liquidez, gráfico com janelas e contexto (empresa, analistas, financeiros, notícias).
import { esc, num, pct } from "./format.js";
import { TABS, hooks, marketOf, savePrefs, state, store } from "./state.js";
import { parseCommand, suggestCommands } from "./command.js";
import { ASSETS } from "./universe.js";
import { FLOW_ASSETS } from "./flow-universe.js";
import { closeDrawer, openDrawer } from "./charts.js";
import { assetPanelHtml, mountAssetPanel, quoteOf } from "./asset-pop.js";
import { load as loadProfile, mountContext } from "./analysis-context.js";
import { ensureAnalysis } from "./analysis-data.js";
import { openAnalysis } from "./analysis-view.js";
import { addToList, lists } from "./desk.js";
import { holdingForm } from "./portfolio-view.js";
import { toast } from "./widgets.js";
import { markMatch, mergeSuggestions, rankLocal } from "./search.js";
import { openInstrumentPage } from "./instrument-view.js";
import { loadMomentum, momLineHtml } from "./momentum-study.js";
import { champBadge, loadChampions } from "./champions.js";
import { hq } from "./help.js";

const RECENT_KEY = "pendulo.searchRecent";
const remote = new Map(); // q -> Promise<items>
let ctl = null;
let timer = 0;
let list = [];
let active = -1;

function universe() {
  const app = Object.values(ASSETS).map((a) => ({ symbol: a.yahoo, name: a.name }));
  const flow = FLOW_ASSETS.map((a) => ({ symbol: a.sym, name: a.name }));
  return [...recent(), ...app, ...flow].filter((x) => x.symbol);
}

const recent = () => store.get(RECENT_KEY, []).slice(0, 8);
function remember(it) {
  const r = recent().filter((x) => x.symbol !== it.symbol);
  store.set(RECENT_KEY, [{ symbol: it.symbol, name: it.name, exch: it.exch ?? null, type: it.type ?? null, isin: it.isin ?? null, cusip: it.cusip ?? null, figi: it.figi ?? null, ticker: it.ticker ?? null }, ...r].slice(0, 8)); // prettier-ignore
}

function rowsHtml(q) {
  if (!list.length)
    return `<li class="muted sr-empty">${q ? "Nenhum ativo encontrado. Tente o ticker (AAPL, PETR4.SA, ES=F), o ISIN (US912810TM09) ou o CUSIP." : "Digite ticker, nome ou ISIN."}</li>`;
  return list
    .map((it, i) =>
      it.cmd
        ? `<li role="option" id="sr-${i}" class="sr-row sr-cmd" data-sr="${i}" aria-selected="${i === active}"><b>${esc(it.cmd)}</b><span class="sr-name">${esc(it.label)}</span><span class="sr-meta"><span class="tag">comando</span></span></li>`
        : `<li role="option" id="sr-${i}" class="sr-row" data-sr="${i}" aria-selected="${i === active}">
        <b>${markMatch(it.symbol.startsWith("FIGI:") ? (it.ticker ?? it.isin ?? it.figi) : it.symbol, q, esc)}</b><span class="sr-name">${markMatch(it.name ?? "", q, esc)}</span>
        <span class="sr-meta">${it.mine ? '<span class="tag buy">carteira</span>' : ""}${it.type ? `<span class="tag">${esc(it.type)}</span>` : ""}${it.exch ? `<span class="muted">${esc(it.exch)}</span>` : ""}</span></li>`,
    )
    .join("");
}

function paint() {
  const ul = document.getElementById("srList");
  const q = document.getElementById("srInput")?.value.trim() ?? "";
  if (!ul) return;
  ul.innerHTML = rowsHtml(q);
  document.getElementById("srInput")?.setAttribute("aria-activedescendant", active >= 0 ? `sr-${active}` : ""); // prettier-ignore
  ul.querySelector('[aria-selected="true"]')?.scrollIntoView({ block: "nearest" });
}

function fetchRemote(q) {
  const k = q.toLowerCase();
  if (!remote.has(k)) {
    ctl?.abort();
    ctl = new AbortController();
    remote.set(
      k,
      fetch(`api/search?q=${encodeURIComponent(q)}`, { signal: ctl.signal })
        .then((r) => (r.ok ? r.json() : { items: [] }))
        .then((j) => j.items ?? [])
        .catch(() => {
          remote.delete(k);
          return [];
        }),
    );
  }
  return remote.get(k);
}

// Mercados tem as mesmas telas nos dois lados: "Macro" sozinho seria ambíguo na barra de comandos
const tabNames = () =>
  Object.fromEntries(
    TABS.map(([id, name]) => [id, marketOf(id) ? `${marketOf(id).label} › ${name}` : name]),
  );
const cmds = (q) => suggestCommands(q, tabNames());

/** Executa um comando da barra (aba ou função de ativo). */
export function runCommand(c) {
  if (!c) return false;
  if (c.type === "tab") {
    closeDrawer();
    state.prefs.tab = c.tab;
    savePrefs();
    hooks.render();
    return true;
  }
  const sym = c.sym;
  if (c.go === "analysis") {
    ensureAnalysis([sym]).then(() => openAnalysis(sym));
    return true;
  }
  openAssetPage(sym);
  return true;
}

function onInput() {
  const q = document.getElementById("srInput")?.value.trim() ?? "";
  list = q ? [...cmds(q), ...rankLocal(q, universe())] : recent();
  active = list.length ? 0 : -1;
  paint();
  clearTimeout(timer);
  if (q.length < 1) return;
  timer = setTimeout(async () => {
    const items = await fetchRemote(q);
    if ((document.getElementById("srInput")?.value.trim() ?? "") !== q) return; // o texto mudou
    list = [...cmds(q), ...mergeSuggestions(items, rankLocal(q, universe()), 15)]; // o que a busca acha vem primeiro
    if (active < 0 && list.length) active = 0;
    paint();
  }, 200);
}

/** Abre a caixa de busca (no painel lateral). */
export function openSearch() {
  list = recent();
  active = -1;
  openDrawer(
    `<h2 style="padding-right:30px">Buscar ativo ou comando</h2>
     <input id="srInput" class="sr-input" type="search" autocomplete="off" spellcheck="false" placeholder="Ticker, nome, ISIN ou comando (PORT, NEWS, SPY TA, AAPL AN)"
       role="combobox" aria-expanded="true" aria-controls="srList" aria-autocomplete="list" aria-label="Buscar ativo" />
     <ul id="srList" class="sr-list" role="listbox" aria-label="Sugestões"></ul>
     <p class="note">${recent().length ? "Buscas recentes acima. " : ""}↑ ↓ para escolher, Enter para abrir, Esc para fechar. Comandos: aba (PORT, NEWS, FLOW, VAL, CAL, RISK, SCR, MESA) ou ticker + função (DES, GP, TA, AN). Atalho: / ou Ctrl+K.</p>`,
  );
  paint();
  setTimeout(() => document.getElementById("srInput")?.focus(), 0);
}

/** Identificador para a página de instrumento (ISIN > CUSIP > FIGI): ISIN/CUSIP trazem os dados do Tesouro. */
const instrumentId = (it) => it.isin || it.cusip || it.figi || it.symbol.replace(/^FIGI:/, "");

function pick(i) {
  const it = list[i];
  if (!it) return;
  if (it.cmd) return runCommand(it);
  remember(it);
  openAny(it.symbol, it);
}

/** Cotado no Yahoo -> página do ativo; só identificado (FIGI) -> página de instrumento. */
function openAny(sym, hint = {}) {
  if (!sym.startsWith("FIGI:")) return openAssetPage(sym, hint);
  const id = instrumentId(hint);
  history.replaceState(null, "", `#/ativo/${encodeURIComponent(id)}`);
  openInstrumentPage(id, hint);
}

const big = (x) =>
  !Number.isFinite(x) ? "–" : x >= 1e12 ? `${num(x / 1e12, 2)} tri` : x >= 1e9 ? `${num(x / 1e9, 2)} bi` : x >= 1e6 ? `${num(x / 1e6, 1)} mi` : num(x, 0); // prettier-ignore

const TYPE_PT = { EQUITY: "Ação", ETF: "ETF", INDEX: "Índice", MUTUALFUND: "Fundo", CRYPTOCURRENCY: "Cripto", CURRENCY: "Moeda", FUTURE: "Futuro" }; // prettier-ignore
const STATE_PT = { REGULAR: "pregão aberto", PRE: "pré-mercado", PREPRE: "pré-mercado", POST: "pós-mercado", POSTPOST: "pós-mercado", CLOSED: "mercado fechado" }; // prettier-ignore

/** Cabeçalho e grade de estatísticas a partir do perfil (api/profile). Puro, para testar. */
export function pageHeadHtml(sym, p, hint = {}, opts = {}) {
  const q = p?.quote ?? {};
  // mesma cotação das tabelas e do painel do ativo (o perfil só entra quando o app não tem cotação)
  const live = quoteOf(sym) ?? {};
  const price = live.p ?? q.p ?? p?.price ?? null;
  const chgPct = live.p != null && live.pc ? live.p / live.pc - 1 : q.chgPct;
  const chg = live.p != null && live.pc ? live.p - live.pc : q.chg;
  const d = price !== null && price < 10 ? 4 : 2;
  const cur = q.currency ?? "";
  const k = (l, v, h = "") => `<div><span>${l}${h}</span><b>${v}</b></div>`;
  const f = (x, dd = 2) => (Number.isFinite(x) ? num(x, dd) : "–");
  const pc = (x) => (Number.isFinite(x) ? pct(x, 2) : "–");
  const type = TYPE_PT[q.type] ?? hint.type ?? null;
  const isEtf = q.type === "ETF" || q.type === "MUTUALFUND";
  const when = q.t ? new Date(q.t * 1000).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" }) : null; // prettier-ignore
  const up = Number.isFinite(chg) ? chg >= 0 : null;
  const ids = [sym, q.exch ?? hint.exch, cur, type, hint.isin ? `ISIN ${hint.isin}` : null].filter(Boolean); // prettier-ignore
  const stats = [
    k("Abertura", f(q.open, d)),
    k("Fech. anterior", f(q.prev, d)),
    k("Máx./mín. do dia", `${f(q.dh, d)} / ${f(q.dl, d)}`),
    k(
      "Máx./mín. 52 sem.",
      `${f(q.h52, d)} / ${f(q.l52, d)}`,
      hq("range52", { sym, price, h52: q.h52, l52: q.l52 }),
    ),
    k(
      "Compra / venda",
      `${f(q.bid, d)} / ${f(q.ask, d)}`,
      hq("spread", { bid: q.bid, ask: q.ask }),
    ),
    k("Volume", big(q.v), hq("vol", { v: q.v, av3: q.av3 })),
    k("Vol. médio 3 m", big(q.av3)),
    k(
      "Média 50 / 200 d",
      `${f(q.ma50, d)} / ${f(q.ma200, d)}`,
      hq("ma", { price, ma50: q.ma50, ma200: q.ma200 }),
    ),
    ...(isEtf
      ? [k("Patrimônio", q.aum ? `${big(q.aum)} ${esc(cur)}` : "–"), k("Taxa de adm.", pc(q.er), hq("er", { er: q.er })), k("Dividend yield", pc(q.dy), hq("dy", { dy: q.dy })), k("Beta", f(q.beta), hq("beta", { sym, beta: q.beta }))] // prettier-ignore
      : [
          k(
            "Valor de mercado",
            q.mc ? `${big(q.mc)} ${esc(cur)}` : "–",
            hq("mcap", { sym, mc: q.mc, mcTxt: q.mc ? `${big(q.mc)} ${cur}` : null }),
          ),
          k("P/L (12 m)", f(q.pe, 1), hq("pe", { sym, pe: q.pe, fpe: q.fpe })),
          k("P/L projetado", f(q.fpe, 1)),
          k("LPA (12 m)", f(q.eps), hq("eps", { sym, eps: q.eps })),
          k("Preço/valor patr.", f(q.pb), hq("pb", { pb: q.pb })),
          k("Dividend yield", pc(q.dy), hq("dy", { dy: q.dy })),
          k("Beta", f(q.beta), hq("beta", { sym, beta: q.beta })),
          k("Ações em circulação", big(q.shares)),
          k("Próximo resultado", esc(p?.earnings?.next ?? "–")),
        ]),
  ];
  const title = `<h2 style="padding-right:30px">${esc(sym)} <span class="muted" style="font-size:.9rem">${esc(q.name ?? hint.name ?? "")}</span></h2>`;
  const inner = `<div class="muted" style="font-size:.8rem">${ids.map(esc).join(" · ")}</div>
      <div style="display:flex;gap:12px;align-items:baseline;flex-wrap:wrap;margin-top:6px">
        <span style="font-size:2rem;font-weight:700;font-family:var(--mono)">${f(price, d)}</span>
        ${up === null ? "" : `<span class="${up ? "pos" : "neg"}" style="font-family:var(--mono)">${up ? "+" : ""}${f(chg, d)} (${pc(chgPct)})</span>`}
        <span class="muted" style="font-size:.8rem">${[STATE_PT[q.state], when].filter(Boolean).map(esc).join(" · ")}</span></div>
      <div class="kv" style="margin-top:10px">${stats.join("")}</div>
      <div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:10px"><button class="btn" data-sr-analyze="${esc(sym)}">Nota e plano (Análise)</button></div>`;
  if (opts.parts) return { title, inner, follow: followHtml(sym, price) };
  return `${title}<div class="card">${inner}</div>
    ${followHtml(sym, price)}`;
}

/** Cartão "Acompanhar": incluir na carteira e numa watchlist (aba Sinais de hoje). Puro, para testar. */
export function followHtml(sym, price = null) {
  const held = (state.portfolio?.holdings ?? []).some((h) => h.sym === sym);
  const ls = lists();
  const inLists = ls.filter((l) => l.syms.includes(sym));
  const opts = ls.filter((l) => !l.syms.includes(sym)).map((l) => `<option value="${esc(l.id)}">${esc(l.name)} (${l.syms.length})</option>`).join(""); // prettier-ignore
  return `<div class="card" id="srFollow" data-sr-sym="${esc(sym)}"><h3>Acompanhar</h3>
    <div style="display:flex;gap:8px;flex-wrap:wrap;align-items:center">
      ${held ? '<span class="tag buy">Na carteira</span>' : `<button class="btn" data-sr-hold="${esc(sym)}" data-price="${Number.isFinite(price) ? price : ""}">+ Adicionar à carteira</button>`}
      ${inLists.map((l) => `<span class="tag">${esc(l.name)}</span>`).join("")}
    </div>
    <div style="display:flex;gap:8px;flex-wrap:wrap;align-items:center;margin-top:10px">
      <select id="srListSel" aria-label="Watchlist">${opts}<option value="">Nova lista…</option></select>
      <input id="srListName" placeholder="Nome da lista nova" maxlength="30" ${opts ? "hidden" : ""} style="padding:6px 8px" />
      <button class="btn" data-sr-list="${esc(sym)}">+ Adicionar à lista</button>
    </div>
    <p class="note">As listas aparecem em Sinais de hoje e na Watchlist, com decisão e níveis para cada ativo.</p></div>`;
}

/** Página do ativo. hint = sugestão escolhida ({ name, exch, type, isin }) para preencher antes do perfil chegar. */
export async function openAssetPage(sym, hint = {}) {
  const token = (openAssetPage.token = {});
  if (location.hash !== `#/ativo/${sym}`)
    history.replaceState(null, "", `#/ativo/${encodeURIComponent(sym)}`);
  openDrawer(`${pageHeadHtml(sym, null, hint)}<div class="card"><p class="muted">Carregando cotação, estatísticas e perfil de ${esc(sym)}…</p></div>`); // prettier-ignore
  const [p] = await Promise.all([
    loadProfile(sym).catch(() => null),
    loadMomentum(),
    loadChampions(),
  ]);
  if (openAssetPage.token !== token || document.getElementById("drawer").hidden) return;
  const q = p?.quote ?? {};
  const fb = { dh: q.dh, dl: q.dl, h52: q.h52, l52: q.l52, v: q.v, av: q.av, av3: q.av3, mc: q.mc, p: q.p, fb: true }; // prettier-ignore
  const price = quoteOf(sym)?.p ?? q.p ?? p?.price ?? null;
  const head = pageHeadHtml(sym, p, hint, { parts: true });
  openDrawer(
    `${head.title}
     ${p ? "" : `<div class="card"><p class="muted">Perfil indisponível agora; mostrando só o histórico de preço.</p></div>`}
     ${assetPanelHtml(sym, null, fb, head.inner)}
     ${champBadge(sym) ? `<div class="card">${champBadge(sym)} <span class="muted small">na lista 🏆 da aba Sinais de hoje</span></div>` : ""}
     ${momLineHtml(sym)}
     ${head.follow}
     <div id="anCtx" data-sym="${esc(sym)}"><div class="card"><p class="muted">Carregando resumo, analistas, financeiros e manchetes…</p></div></div>
     <p class="note">Fonte: Yahoo Finance (pode ter atraso). Material educacional; não é recomendação de investimento.</p>`,
    () => {
      mountAssetPanel(sym, null);
      mountContext(sym, price, q.name ?? hint.name ?? "");
    },
  );
}

function fromHash() {
  const m = /^#\/ativo\/(.+)$/.exec(location.hash);
  if (!m) return;
  const id = decodeURIComponent(m[1])
    .toUpperCase()
    .replace(/^FIGI:/, "");
  if (/^BBG[A-Z0-9]{9}$|^[A-Z]{2}[A-Z0-9]{9}\d$|^[0-9]{3}[A-Z0-9]{5}\d$/.test(id))
    openInstrumentPage(id);
  else openAssetPage(id);
}

/** Liga a lupa, o atalho "/" e a rota #/ativo/SYM (uma vez). */
export function initSearch() {
  document.addEventListener("click", (e) => {
    if (e.target.closest("[data-action=search]")) return openSearch();
    const row = e.target.closest("[data-sr]");
    if (row) return pick(Number(row.dataset.sr));
    const op = e.target.closest("[data-sr-open]");
    if (op) return openAssetPage(op.dataset.srOpen);
    const an = e.target.closest("[data-sr-analyze]");
    if (an) {
      const sym = an.dataset.srAnalyze;
      an.disabled = true;
      an.textContent = "Analisando…";
      ensureAnalysis([sym]).then(() => {
        openAnalysis(sym);
        if (an.isConnected) an.textContent = "Análise indisponível para este ativo";
      });
    }
  });
  document.addEventListener("click", (e) => {
    const h = e.target.closest("[data-sr-hold]");
    if (h) {
      openDrawer(holdingForm(null));
      const f = document.querySelector("[data-hold-form]");
      if (f) {
        f.sym.value = h.dataset.srHold;
        if (h.dataset.price) f.avg.value = h.dataset.price;
        setTimeout(() => f.qty.focus(), 0);
      }
      return;
    }
    const b = e.target.closest("[data-sr-list]");
    if (!b) return;
    const sym = b.dataset.srList;
    const id = document.getElementById("srListSel")?.value || null;
    const name = document.getElementById("srListName")?.value ?? "";
    const r = addToList(sym, { id, name });
    if (r.error) return toast(r.error, "warn");
    toast(`${sym} adicionado à lista "${r.name}".`, "ok");
    const box = document.getElementById("srFollow");
    if (box) box.outerHTML = followHtml(sym, quoteOf(sym)?.p ?? null);
  });
  document.addEventListener("change", (e) => {
    if (e.target.id === "srListSel") {
      const n = document.getElementById("srListName");
      if (n) n.hidden = !!e.target.value;
    }
  });
  document.addEventListener("input", (e) => e.target.id === "srInput" && onInput());
  document.addEventListener("keydown", (e) => {
    if (e.target.id === "srInput") {
      if (e.key === "ArrowDown" || e.key === "ArrowUp") {
        e.preventDefault();
        if (!list.length) return;
        active = (active + (e.key === "ArrowDown" ? 1 : -1) + list.length) % list.length;
        paint();
      } else if (e.key === "Enter") {
        e.preventDefault();
        const q = e.target.value.trim().toUpperCase();
        const c = parseCommand(
          q,
          TABS.map((t) => t[0]),
        );
        if (c && !(active >= 0 && list[active]?.cmd)) runCommand(c);
        else if (active >= 0) pick(active);
        else if (/^BBG[A-Z0-9]{9}$|^[A-Z]{2}[A-Z0-9]{9}\d$|^[0-9]{3}[A-Z0-9]{5}\d$/.test(q))
          openInstrumentPage(q);
        else if (/^[A-Z0-9][A-Z0-9.\-=^]{0,14}$/.test(q)) openAssetPage(q);
      }
      return;
    }
    const typing = /^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName) || e.target.isContentEditable;
    if ((e.ctrlKey || e.metaKey) && !e.altKey && e.key.toLowerCase() === "k") {
      e.preventDefault();
      return openSearch();
    }
    if (e.key === "/" && !typing && !e.ctrlKey && !e.metaKey && !e.altKey) {
      e.preventDefault();
      openSearch();
    }
  });
  window.addEventListener("hashchange", fromHash);
  // fechar o painel tira a rota do endereço (voltar não reabre a página)
  const drawer = document.getElementById("drawer");
  if (drawer)
    new MutationObserver(() => {
      if (drawer.hidden && location.hash.startsWith("#/ativo/"))
        history.replaceState(null, "", location.pathname + location.search);
    }).observe(drawer, { attributes: true, attributeFilter: ["hidden"] });
  fromHash();
}
