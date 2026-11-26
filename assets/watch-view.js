// Mercados › Watchlist (Offshore e Onshore, as mesmas listas): abas de listas como no Investing.com, colagem de
// tickers ou da tabela do Investing, e uma tabela com preço, dia, decisão do trader, nota, confiança e a velocidade
// do fluxo (quadrante, intensidade, força e momento contra o benchmark). Contas puras em watchlist.js.
import { MAX_LISTS, SESS_LABEL, WATCH_DEFAULT_WIN, WATCH_LEVELS, WATCH_MAX, WATCH_MOMENTUM, WATCH_QUADS, WATCH_WINDOWS, activeList, currentSession, filterActive, normFilter, passFilter, toggleFilter, itemsOf, benchOf, dailyTail, deleteList, mergeItems, newList, parseWatchlist, removeItem, renameList, watchLists } from "./watchlist.js"; // prettier-ignore
import { rotationIntraday, speedBoard } from "./rot-intraday.js";
import { latestSessionSpeeds } from "./speed-learn.js";
import { quadrantOf } from "./flow-engine.js";
import { quadColor } from "./flow-view.js";
import { an, ensureAnalysis } from "./analysis-data.js";
import { traderDecision } from "./decision.js";
import { quantOf } from "./quant-view.js";
import { sessionInfo } from "./ta-signals.js";
import { quoteOf } from "./asset-pop.js";
import { fetchQuotes, want } from "./quote-hub.js";
import { mkt } from "./market.js";
import { barsKey, useBars } from "./bars-hub.js";
import { esc, num, signed } from "./format.js";
import { hooks, savePrefs, state } from "./state.js";
import { pushLists } from "./cloud-sync.js";

const TTL = 10 * 60_000;
let loadingAn = false;
let parsed = null; // prévia da colagem { items, ignored, aliased, cut }
let draft = ""; // texto colado (sobrevive ao redesenho automático)
let pasteOpen = null; // caixa "Colar ativos" aberta? (null = automático: aberta com a lista vazia)

// cotação dos ativos da lista que não estão no canal ao vivo nem no mercado inteiro: central de cotações
// (validade de 1 min por ativo); a lista aberta vai na presença e passa a chegar pelo canal
let watchLoading = false;
function loadQuotes(syms) {
  want("watch", syms);
  const miss = syms.filter((s) => !(state.live?.quotes?.[s] ?? mkt.quotes?.[s]));
  if (!miss.length || watchLoading) return;
  watchLoading = true;
  fetchQuotes(miss)
    .then((r) => r.fetched && hooks.render())
    .finally(() => (watchLoading = false));
}
const quoteFor = (s) => quoteOf(s);
// diário das ações da B3: o Ibovespa (^BVSP) não tem histórico na api/analyze; o BOVA11 replica o índice
const DAILY_BENCH = { "^BVSP": "BOVA11.SA" };

const winOf = (p) => (p.watchWin in WATCH_WINDOWS ? p.watchWin : WATCH_DEFAULT_WIN);

/** Pede a análise (preço, nota, decisão, séries diárias) do que falta; redesenha quando chega. */
function loadAnalysis(syms) {
  const need = syms.filter((s) => !an.at[s] || Date.now() - an.at[s] > TTL);
  if (!need.length || loadingAn) return;
  loadingAn = true;
  ensureAnalysis(syms, { parallel: 2, onLot: () => hooks.render() })
    .catch(() => {})
    .finally(() => {
      loadingAn = false;
      hooks.render();
    });
}

/** Barras intraday (com o benchmark) em lotes de até 39 ativos, pela central de barras (revalida na virada da barra). */
const rerender = () => hooks.render();
function loadIntra(syms, bench, src) {
  const out = [];
  for (let i = 0; i < syms.length; i += 39) {
    const key = barsKey({ symbols: [...syms.slice(i, i + 39), bench], win: src });
    out.push(useBars(key, { onUpdate: rerender }));
  }
  return out;
}

/** Caudas da rotação de cada ativo da lista na janela escolhida (agrupado pelo benchmark). */
function tailsFor(items, wk) {
  const win = WATCH_WINDOWS[wk];
  const groups = {};
  for (const it of items) (groups[benchOf(it.sym)] ??= []).push(it);
  const tails = [];
  let pending = false;
  let err = null;
  for (const [bench, its] of Object.entries(groups)) {
    const syms = its.map((x) => x.sym).filter((s) => s !== bench);
    if (!syms.length) continue;
    if (win.intra) {
      const lots = loadIntra(syms, bench, wk === "today" ? "short" : "long");
      const us = bench === "SPY";
      for (const c of lots) {
        if (!c?.data) {
          pending ||= !c?.err;
          err ??= c?.err ?? null;
          continue;
        }
        const members = its.map((x) => ({ sym: x.sym, label: x.sym, name: x.name ?? x.sym }));
        const r = rotationIntraday(c.data, { bench }, members, wk === "today" ? "today" : "5d", state.live?.quotes ?? {}, quadrantOf, { ext: us && (state.mode ?? "on") === "off", sessions: us }); // prettier-ignore
        for (const t of r) if (!tails.some((x) => x.sym === t.sym)) tails.push(t);
      }
    } else {
      const b = an.items[bench]?.series ?? an.items[DAILY_BENCH[bench]]?.series;
      for (const it of its) {
        const a = an.items[it.sym]?.series;
        if (!a || !b) {
          pending ||= !an.fail?.[it.sym] && (!an.at[it.sym] || !(an.at[bench] || an.at[DAILY_BENCH[bench]])); // prettier-ignore
          continue;
        }
        const tail = dailyTail(a, b, win);
        if (tail.length >= 2) tails.push({ sym: it.sym, label: it.sym, tail, quadrant: quadrantOf(tail.at(-1)) }); // prettier-ignore
      }
    }
  }
  return { tails, pending, err };
}

/** Velocidade no fim do pré, no pregão (até agora) e no pós, de cada ativo (barras de 5 min com pré/pós). */
function sessionsFor(items) {
  const groups = {};
  for (const it of items) (groups[benchOf(it.sym)] ??= []).push(it.sym);
  const out = { pre: {}, reg: {}, post: {} };
  const iso = {};
  for (const [bench, syms0] of Object.entries(groups)) {
    const syms = syms0.filter((s) => s !== bench);
    if (!syms.length) continue;
    for (const c of loadIntra(syms, bench, "short")) {
      if (!c?.data) continue;
      const ls = latestSessionSpeeds(c.data, bench, syms);
      for (const [k, v] of Object.entries(ls)) {
        Object.assign(out[k], v.by);
        if (bench === "SPY" || !iso[k]) iso[k] = v.iso;
      }
    }
  }
  return { by: out, iso };
}
const sessCell = (sp) =>
  sp
    ? `<span class="wl-ss ${sp.vx >= 0 ? "wl-up" : "wl-dn"} lv-${sp.level.id}" title="${esc(`${sp.level.label} · força ${signed(sp.vx, 2)}/h`)}">${num(sp.rel, 1)}x ${sp.vx >= 0 ? "↑" : "↓"}</span>`
    : `<span class="dim">–</span>`;
const isoBR = (iso) => (iso ? `${iso.slice(8, 10)}/${iso.slice(5, 7)}` : "");

const pctTxt = (x) => (Number.isFinite(x) ? `${signed(x * 100, 2)}%` : "–");
const cls = (x) => (!Number.isFinite(x) || Math.abs(x) < 1e-9 ? "" : x > 0 ? "pos" : "neg");

export function viewWatch() {
  const p = state.prefs;
  const lists = watchLists(p);
  const L = activeList(p);
  const wk = winOf(p);
  const win = WATCH_WINDOWS[wk];
  const items = itemsOf(L);
  const syms = items.map((x) => x.sym);
  const benches = [...new Set(syms.map(benchOf))].flatMap((b) => (DAILY_BENCH[b] ? [b, DAILY_BENCH[b]] : [b])); // prettier-ignore
  loadAnalysis([...syms, ...benches]);
  loadQuotes(syms);
  const { tails, pending, err } = items.length ? tailsFor(items, wk) : { tails: [] };
  const ss = items.length ? sessionsFor(items) : { by: { pre: {}, reg: {}, post: {} }, iso: {} };
  const speed = Object.fromEntries(speedBoard(tails, tails, { step: win.intra ? 1 : win.step }).map((r) => [r.sym, r])); // prettier-ignore
  const quad = Object.fromEntries(tails.map((t) => [t.sym, t.quadrant]));
  const unit = win.intra ? "h" : "pregão";
  // coluna única da sessão que está acontecendo agora (fora do horário: o último pós)
  const cur = currentSession(Date.now() / 1000, sessionInfo);
  const SESS_TIP = { pre: "pré-mercado (4h–9h30 de NY)", reg: "pregão regular (9h30–16h de NY)", post: "pós-mercado (16h–20h de NY)" }; // prettier-ignore
  const sessHead = `<th class="num" title="Velocidade no ${SESS_TIP[cur.id]}${cur.live ? ", até agora" : ", última sessão encerrada"}, contra o benchmark">${cur.live ? "● " : ""}${SESS_LABEL[cur.id]} ${isoBR(ss.iso[cur.id])}</th>`; // prettier-ignore
  // filtros por coluna (quadrante, velocidade, momento)
  const flt = normFilter(p.watchFilter);
  const fOn = filterActive(flt);
  const shown = fOn
    ? items.filter((it) => passFilter({ quadrant: quad[it.sym], level: speed[it.sym]?.level?.id, vy: speed[it.sym]?.vy }, flt)) // prettier-ignore
    : items;
  const chip = (key, label, on, col) =>
    `<button class="wl-chip" data-w-f="${esc(key)}" aria-pressed="${on}"${col ? ` style="--q:${col}"` : ""}>${esc(label)}</button>`;
  const filterBar = items.length
    ? `<div class="wl-filters" role="group" aria-label="Filtrar a lista">
        <span class="wl-fgrp"><span class="dim">Quadrante</span>${WATCH_QUADS.map((q) => chip(`q:${q}`, q, flt.q.includes(q), quadColor(q))).join("")}</span>
        <span class="wl-fgrp"><span class="dim">Velocidade</span>${WATCH_LEVELS.map((l) => chip(`lv:${l.id}`, l.label, flt.lv.includes(l.id))).join("")}</span>
        <span class="wl-fgrp"><span class="dim">Momento</span>${WATCH_MOMENTUM.map((m) => chip(`mo:${m.id}`, m.label, flt.mo.includes(m.id))).join("")}</span>
        ${fOn ? `<span class="wl-fgrp"><b>${shown.length} de ${items.length}</b><button class="btn small ghost" data-w-f="clear">Limpar filtros</button></span>` : ""}
      </div>`
    : "";

  const tabs = lists
    .map(
      (l) =>
        `<button class="wl-tab" data-w-tab="${esc(l.id)}" aria-pressed="${l.id === L.id}">📋 ${esc(l.name)} <span class="dim">${l.syms.length}</span></button>`,
    ) // prettier-ignore
    .join("");
  const rows = shown
    .map((it) => {
      const r = an.items[it.sym];
      const q = quoteFor(it.sym);
      const price = q?.p > 0 ? q.p : (r?.price ?? null);
      const day = q?.p > 0 && q?.pc > 0 ? q.p / q.pc - 1 : null; // variação do dia = p / pc (igual em todas as telas)
      const dec = r ? traderDecision(price > 0 ? { ...r, price } : r, { regime: state.snap?.regime, spy: state.prices?.series?.SPY, quantOf }, { gate: true }) : null; // prettier-ignore
      const sp = speed[it.sym];
      const qd = quad[it.sym];
      const col = qd ? quadColor(qd) : "var(--text-3)";
      const max = 4;
      const fail = an.fail?.[it.sym];
      return `<tr class="click" data-an-sym="${esc(it.sym)}" tabindex="0">
        <td><b>${esc(it.sym)}</b> <span class="muted">${esc((it.name ?? r?.name ?? "").slice(0, 28))}</span>${it.note ? `<div class="dim wl-note">${esc(it.note)}</div>` : ""}</td>
        <td class="num">${price > 0 ? num(price, price < 10 ? 4 : 2) : "–"}</td>
        <td class="num ${cls(day)}">${pctTxt(day)}</td>
        <td>${qd ? `<span class="wl-q" style="--q:${col}">${esc(qd)}</span>` : `<span class="dim">${fail ? "sem dados" : "…"}</span>`}</td>
        <td class="wl-spd">${sp ? `<span class="rspd-bar"><span class="rspd-fill lv-${sp.level.id}" style="width:${Math.min(100, (sp.rel / max) * 100).toFixed(1)}%;--q:${col}"></span></span> <b>${num(sp.rel, 1)}x</b> <span class="rspd-lv lv-${sp.level.id}">${sp.level.label}</span>` : "–"}</td>
        <td class="num ${cls(sp?.vx)}">${sp ? signed(sp.vx, 2) : "–"}</td>
        <td class="num ${cls(sp?.vy)}">${sp ? signed(sp.vy, 2) : "–"}</td>
        <td class="num wl-sess">${sessCell(ss.by[cur.id][it.sym])}</td>
        <td>${dec?.now ? `<span class="tag ${dec.now.tone}">${esc(dec.now.label)}</span>` : r ? `<span class="dim">sem decisão</span>` : `<span class="dim">${fail ? esc(fail).slice(0, 30) : "carregando…"}</span>`}</td>
        <td class="num">${Number.isFinite(r?.score) ? Math.round(r.score) : "–"}</td>
        <td>${esc(dec?.final?.conf ?? r?.confidence ?? "–")}</td>
        <td class="muted">${esc((r?.sector ?? r?.type ?? "").slice(0, 22) || "–")}</td>
        <td class="muted">${esc(benchOf(it.sym) === "SPY" ? "S&P 500" : "Ibovespa")}</td>
        <td><button class="btn small ghost" data-w-act="del" data-w-sym="${esc(it.sym)}" title="Tirar ${esc(it.sym)} da lista" aria-label="Tirar ${esc(it.sym)} da lista">✕</button></td></tr>`;
    })
    .join("");
  const status = !items.length
    ? ""
    : loadingAn || pending
      ? `<span class="muted">Carregando dados… (análise em lotes de 15${win.intra ? "; barras intraday" : ""})</span>`
      : err
        ? `<span class="muted">Intraday indisponível agora (${esc(err)}); use 8 sem ou 3 meses.</span>`
        : "";
  const prev = parsed
    ? `<div class="wl-prev"><b>${parsed.items.length} ativo(s) reconhecido(s):</b> ${parsed.items.map((x) => esc(x.sym)).join(", ") || "nenhum"}
        ${parsed.aliased.length ? `<div class="dim">Convertidos para o código do Yahoo: ${parsed.aliased.map(([a, b]) => `${esc(a)} → ${esc(b)}`).join(", ")}</div>` : ""}
        ${parsed.ignored.length ? `<div class="dim">Linhas ignoradas: ${esc(parsed.ignored.slice(0, 5).join(" | "))}${parsed.ignored.length > 5 ? "…" : ""}</div>` : ""}
        ${parsed.cut ? `<div class="warn-txt">Limite de ${WATCH_MAX} por lista: ${parsed.cut} ficaram de fora.</div>` : ""}
        <div class="wl-acts"><button class="btn" data-w-act="add" ${parsed.items.length ? "" : "disabled"}>Adicionar a "${esc(L.name)}"</button><button class="btn ghost" data-w-act="replace" ${parsed.items.length ? "" : "disabled"}>Substituir a lista</button><button class="btn ghost" data-w-act="cancel">Cancelar</button></div></div>`
    : "";
  return `<div class="wl-tabs" role="tablist" aria-label="Watchlists">${tabs}<button class="wl-tab wl-new" data-w-act="new" title="Criar uma nova watchlist">＋ Nova lista</button></div>
    <div class="card wl-card">
      <div class="wl-head"><h2>${esc(L.name)}</h2>
        <span class="wl-head-acts"><button class="btn small ghost" data-w-act="rename">Renomear</button><button class="btn small ghost" data-w-act="drop">Excluir lista</button></span></div>
      <details class="wl-paste"${(pasteOpen ?? !items.length) ? " open" : ""}><summary>Colar ativos <span class="dim">(tickers ou a tabela da watchlist do Investing.com)</span></summary>
        <textarea id="wlInput" rows="4" placeholder="AAPL, MSFT, NVDA, VOO, PETR4&#10;ou copie a tabela da watchlist do Investing (Name, Symbol, Last…) e cole aqui">${esc(draft)}</textarea>
        <div class="wl-acts"><button class="btn" data-w-act="preview">Ler colagem</button><span class="dim">Códigos dos EUA como no Yahoo; ações da B3 sem sufixo viram .SA (PETR4 → PETR4.SA); VIX → ^VIX, SPX → ^GSPC. Sem limite de ativos por lista (listas grandes demoram mais a carregar); até ${MAX_LISTS} listas, as mesmas da aba Sinais de hoje.</span></div>
        ${prev}</details>
      <div class="toolbar wl-bar"><span class="seg" role="group" aria-label="Janela da velocidade">${Object.entries(
        WATCH_WINDOWS,
      )
        .map(
          ([k, w]) =>
            `<button data-setpref="watchWin" data-val="${k}" aria-pressed="${k === wk}">${w.label}</button>`,
        )
        .join("")}</span>${status}</div>
      ${filterBar}
      ${
        items.length && !shown.length
          ? `<div class="card empty">Nenhum ativo da lista passa nos filtros marcados. <button class="btn small ghost" data-w-f="clear">Limpar filtros</button></div>`
          : items.length
            ? `<div class="tw"><table data-sortable="watch"><thead><tr><th>Ativo</th><th class="num">Preço</th><th class="num">Dia %</th><th>Quadrante</th><th>Velocidade <span class="dim">(× ritmo da lista)</span></th><th class="num">Força /${unit}</th><th class="num">Momento /${unit}</th>${sessHead}<th>Decisão do trader</th><th class="num">Nota</th><th>Confiança</th><th>Setor / tipo</th><th>Contra</th><th></th></tr></thead><tbody>${rows}</tbody></table></div>`
            : `<div class="card empty">Lista vazia. Abra <b>Colar ativos</b> acima e cole os tickers ou a tabela do Investing.</div>`
      }
      <p class="note">Toque numa linha para ver a análise completa (decisão, escala de preço, motivos). <b>Quadrante e velocidade</b> usam a mesma conta da Rotação relativa da aba Fluxo, cada ativo contra o seu benchmark (S&P 500; ações da B3 contra o Ibovespa), na janela ${esc(win.label.toLowerCase())}: <b>força /${unit}</b> = pontos de força relativa ganhos (+) ou perdidos (−) por ${win.intra ? "hora" : "pregão"} (1 ponto ≈ 1% contra o benchmark); <b>momento</b> = acelerando (+) ou freando (−); <b>velocidade</b> = quanto o ativo andou no gráfico ÷ ritmo típico dos ativos da lista (lento &lt; 0,5x · normal · rápido ≥ 1,5x · muito rápido ≥ 3x). <b>Coluna da sessão</b> (Pré, Pregão ou Pós) = só a sessão que está acontecendo agora em Nova York (● = ao vivo; fora do horário, o último pós): velocidade (× ritmo típico da lista) em barras de 5 min, ↑ força subindo, ↓ caindo; "–" = o ativo não negociou nessa sessão (comum no pré e no pós de ETFs pequenos e nas ações da B3). <b>Filtros</b>: marque quadrante, velocidade ou momento (acelerando = momento positivo) para ver só quem se encaixa; dentro de um grupo vale qualquer um dos marcados, entre grupos valem todos; o clique no cabeçalho continua ordenando. Preço e dia % da cotação ao vivo (dia = preço ÷ fechamento anterior). Decisão e nota como na aba Análise (dados até 10 min). Material educacional; não é recomendação de investimento.</p>
    </div>`;
}

/** Grava as listas (as mesmas da aba Sinais de hoje), envia para a nuvem e redesenha. */
function setLists(lists, active) {
  state.prefs.watchlists = lists;
  if (active) state.prefs.watchActive = active;
  savePrefs();
  pushLists();
  hooks.render();
}

export function initWatch() {
  document.addEventListener("input", (e) => {
    if (e.target.id === "wlInput") draft = e.target.value;
  });
  document.addEventListener(
    "toggle",
    (e) => {
      if (e.target.classList?.contains("wl-paste")) pasteOpen = e.target.open;
    },
    true,
  );
  // captura: o ✕ da linha não abre a análise (a linha inteira abre)
  document.addEventListener(
    "click",
    (e) => {
      const t = e.target.closest("[data-w-act],[data-w-tab],[data-w-f]");
      if (!t) return;
      const p = state.prefs;
      if (t.dataset.wF) {
        e.stopPropagation();
        p.watchFilter = t.dataset.wF === "clear" ? normFilter(null) : toggleFilter(p.watchFilter, t.dataset.wF); // prettier-ignore
        savePrefs();
        return hooks.render();
      }
      const lists = watchLists(p);
      const L = activeList(p);
      if (t.dataset.wTab) {
        parsed = null;
        pasteOpen = null;
        return setLists(lists, t.dataset.wTab);
      }
      const act = t.dataset.wAct;
      e.stopPropagation(); // só este controle reage (nem a linha, nem outros atalhos)
      if (act === "del") {
        return setLists(lists.map((l) => (l.id === L.id ? removeItem(l, t.dataset.wSym) : l)));
      }
      if (act === "new") {
        const name = globalThis.prompt?.("Nome da nova watchlist:", `Lista ${lists.length + 1}`);
        if (name == null) return;
        const next = newList(lists, name);
        if (!next) return globalThis.alert?.(`Limite de ${MAX_LISTS} listas: exclua uma antes de criar outra.`); // prettier-ignore
        parsed = null;
        pasteOpen = null; // lista nova (vazia): a caixa de colar abre sozinha
        return setLists(next, next.at(-1).id);
      }
      if (act === "rename") {
        const name = globalThis.prompt?.("Novo nome da lista:", L.name);
        if (name == null) return;
        return setLists(renameList(lists, L.id, name));
      }
      if (act === "drop") {
        if (!globalThis.confirm?.(`Excluir a watchlist "${L.name}" (${L.syms.length} ativos)?`)) return; // prettier-ignore
        const next = deleteList(lists, L.id);
        return setLists(next, next[0].id);
      }
      if (act === "preview") {
        draft = document.getElementById("wlInput")?.value ?? draft;
        parsed = parseWatchlist(draft);
        return hooks.render();
      }
      if (act === "cancel") {
        parsed = null;
        return hooks.render();
      }
      if ((act === "add" || act === "replace") && parsed?.items.length) {
        const items = parsed.items;
        parsed = null;
        draft = "";
        pasteOpen = false;
        return setLists(lists.map((l) => (l.id === L.id ? mergeItems(l, items, { replace: act === "replace" }) : l))); // prettier-ignore
      }
    },
    true,
  );
}
