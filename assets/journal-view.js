// Carteira › 📒 Diário: operações reais (entrada, tamanho, stop, motivo, saída) e o placar contra o SPY.
// Contas puras em journal.js. Fica neste aparelho e, com login, na nuvem (tabela pendulo_journal).
import { REASONS, closeAtr, closeEntry, evalEntry, makeEntry, reasonLabel, scoreboard, sizePosition, verdictText } from "./journal.js"; // prettier-ignore
import { esc, num } from "./format.js";
import { fetchJSON } from "./net.js";
import { fetchQuotes } from "./quote-hub.js";
import { quoteOf } from "./asset-pop.js";
import { hooks, savePrefs, state, store } from "./state.js";
import * as cloud from "./cloud.js";

const KEY = "pendulo.journal";
export const loadJournal = () => {
  const l = store.get(KEY, []);
  return Array.isArray(l) ? l : [];
};
function saveJournal(l, { push = true } = {}) {
  store.set(KEY, l);
  if (push) pushJournal(l);
}

const nyToday = () => new Date().toLocaleDateString("en-CA", { timeZone: "America/New_York" });

// ───────── séries (5 anos, para o SPY de operações antigas) e cotações ─────────
const series = {}; // sym -> { dates, close } | null
const pending = new Set();
function loadSeries(syms) {
  const need = syms.filter((s) => !(s in series) && !pending.has(s));
  if (!need.length) return;
  need.forEach((s) => pending.add(s));
  fetchJSON(`api/history?symbols=${encodeURIComponent(need.join(","))}&range=5y`, { bg: true })
    .then((j) => {
      for (const s of need) series[s] = j?.series?.[s] ?? null;
    })
    .catch(() => need.forEach((s) => (series[s] = null)))
    .finally(() => {
      need.forEach((s) => pending.delete(s));
      if (state.prefs.tab === "journal") hooks.render();
    });
}
function loadQuotes(syms) {
  fetchQuotes(syms, { id: "journal" }).then((r) => r.fetched && state.prefs.tab === "journal" && hooks.render()); // prettier-ignore
}
const lastOf = (sym) => {
  const q = quoteOf(sym);
  if (q?.p > 0) return q.p;
  return series[sym]?.close?.at(-1) ?? null;
};

/** Operações com o resultado de cada uma (mais novas primeiro). */
export function journalRows() {
  const spy = { series: series.SPY ?? null, last: lastOf("SPY") };
  const today = nyToday();
  return loadJournal()
    .map((e) => ({ e, ev: evalEntry(e, { last: e.closeDate ? null : lastOf(e.sym), spy, today }) }))
    .sort((a, b) => (b.e.openDate + b.e.at).localeCompare(a.e.openDate + a.e.at));
}

// ───────── nuvem: uma linha por usuário; vale a lista mais nova ─────────
async function pushJournal(list) {
  if (!cloud.cloudUser()) return;
  try {
    await cloud.pushJournal(list);
    store.set(`${KEY}.syncedAt`, new Date().toISOString());
  } catch {
    /* tenta de novo na próxima sincronização */
  }
}
export async function syncJournal() {
  if (!cloud.cloudUser()) return false;
  try {
    const r = await cloud.pullJournal();
    const localAt = store.get(`${KEY}.syncedAt`, null);
    const local = loadJournal();
    if (r && Date.parse(r.updatedAt) > Date.parse(localAt ?? 0)) {
      saveJournal(r.entries ?? [], { push: false });
      store.set(`${KEY}.syncedAt`, r.updatedAt);
      return JSON.stringify(r.entries) !== JSON.stringify(local);
    }
    if (local.length && (!r || JSON.stringify(r.entries) !== JSON.stringify(local))) await pushJournal(local); // prettier-ignore
  } catch {
    /* sem rede: fica a cópia local */
  }
  return false;
}

// ───────── tela ─────────
let draft = {
  sym: "",
  openDate: "",
  openPrice: "",
  qty: "",
  stop: "",
  fees: "",
  reason: "signals",
  note: "",
};
let formErr = null;

const usd = (x, d = 0) => (x === null || x === undefined || !Number.isFinite(x) ? "–" : `${x < 0 ? "−" : ""}US$ ${num(Math.abs(x), d)}`); // prettier-ignore
const pc = (x, d = 1) => (x === null || x === undefined || !Number.isFinite(x) ? "–" : `${x > 0 ? "+" : ""}${num(x * 100, d)}%`); // prettier-ignore
const fx = (x, d = 2) => (x === null || x === undefined || !Number.isFinite(x) ? "–" : num(x, d));
const cls = (x) => (x === null || x === undefined ? "" : x >= 0 ? "pos" : "neg");
const dBR = (d) => (d ? d.split("-").reverse().join("/") : "–");

function equityOf() {
  const p = state.prefs;
  return Number(p.jrEquity) > 0 ? Number(p.jrEquity) : (state.valuation?.total ?? null);
}

function sizingHtml() {
  const p = state.prefs;
  const entry = Number(String(draft.openPrice).replace(",", "."));
  const sym = draft.sym.trim().toUpperCase();
  const s = sym ? series[sym] : null;
  const atr = s?.close ? closeAtr(s.close) : null;
  const stop = Number(String(draft.stop).replace(",", ".")) || null;
  const r = sizePosition({ equity: equityOf(), riskPct: Number(p.jrRisk) || 1, entry, stop, atr, maxPct: Number(p.jrMax) || 20 }); // prettier-ignore
  const atrTxt = atr ? `ATR (14, fechamentos) de ${sym}: US$ ${fx(atr)} → stop de 2,5 ATR em US$ ${fx(entry - 2.5 * atr)}.` : sym && pending.has(sym) ? "Buscando o histórico para sugerir o stop…" : ""; // prettier-ignore
  if (r.error)
    return `<div class="jr-size muted">Tamanho pelo risco: ${esc(r.error)}. ${esc(atrTxt)}</div>`;
  return `<div class="jr-size"><b>Tamanho pelo risco:</b> ${r.qty} cotas = ${usd(r.value)} (${pc(r.pctEquity).replace("+", "")} do patrimônio).
    Se bater no stop (US$ ${fx(r.stop)}, ${pc(r.stopPct)}), perde ${usd(r.riskUsd)}.${r.capped ? ` <span class="warn-txt">Limitado ao teto de ${num(Number(p.jrMax) || 20, 0)}% por posição.</span>` : ""}
    <span class="muted">${esc(atrTxt)}</span>
    ${r.qty > 0 ? `<button type="button" class="btn small ghost" data-jr="useqty" data-qty="${r.qty}"${stop ? "" : ` data-stop="${fx(r.stop, 2).replace(",", ".")}"`}>Usar ${r.qty} cotas</button>` : ""}</div>`;
}

function formHtml() {
  const p = state.prefs;
  const v = (k) => esc(String(draft[k] ?? ""));
  const reasons = REASONS.map(([k, l]) => `<option value="${k}" ${draft.reason === k ? "selected" : ""}>${esc(l)}</option>`).join(""); // prettier-ignore
  return `<section class="card"><h2>Nova operação</h2>
    <div class="jr-form">
      <label>Ativo<input id="jrSym" data-jrf="sym" value="${v("sym")}" placeholder="SPY" autocomplete="off" autocapitalize="characters" /></label>
      <label>Data<input id="jrDate" data-jrf="openDate" type="date" value="${v("openDate") || nyToday()}" /></label>
      <label>Preço de entrada<input data-jrf="openPrice" inputmode="decimal" value="${v("openPrice")}" placeholder="0,00" /></label>
      <label>Stop (opcional)<input data-jrf="stop" inputmode="decimal" value="${v("stop")}" placeholder="abaixo da entrada" /></label>
      <label>Quantidade<input data-jrf="qty" inputmode="decimal" value="${v("qty")}" /></label>
      <label>Custos (US$)<input data-jrf="fees" inputmode="decimal" value="${v("fees")}" placeholder="0" /></label>
      <label>Motivo<select data-jrf="reason">${reasons}</select></label>
      <label class="jr-wide">Por que entrei<input data-jrf="note" value="${v("note")}" maxlength="280" placeholder="ex.: rompeu a máxima com fluxo forte" /></label>
    </div>
    <div class="jr-cfg muted small">Patrimônio <input data-jrp="jrEquity" inputmode="decimal" value="${esc(String(p.jrEquity ?? ""))}" placeholder="${state.valuation?.total ? num(state.valuation.total, 0) : "US$"}" /> · risco por operação <input data-jrp="jrRisk" inputmode="decimal" value="${esc(String(p.jrRisk ?? 1))}" />% · teto por posição <input data-jrp="jrMax" inputmode="decimal" value="${esc(String(p.jrMax ?? 20))}" />%</div>
    <div id="jrSize">${sizingHtml()}</div>
    ${formErr ? `<p class="neg">${esc(formErr)}</p>` : ""}
    <div class="row-btns"><button type="button" class="btn" data-jr="add">Registrar operação</button></div>
    <p class="note">Patrimônio em branco = valor da carteira importada. Risco de 1% por operação é a regra clássica de sobrevivência: 10 stops seguidos custam ~10% do patrimônio. O stop padrão do Simulador é 2,5 ATR (o que sobreviveu aos testes; ver docs/ESTUDO-CATRACA.md).</p>
  </section>`;
}

function tile(label, value, sub = "", tone = "") {
  return `<div class="rk-tile"><span class="l">${label}</span><b class="${tone}">${value}</b><span class="muted">${sub}</span></div>`;
}

function blockRow(label, g) {
  return `<tr><td>${esc(label)}</td><td class="num">${g.n}</td><td class="num ${cls(g.pnl)}">${usd(g.pnl)}</td><td class="num ${cls(g.alpha)}">${usd(g.alpha)}</td>
    <td class="num">${g.nSpy ? `${g.beatSpy}/${g.nSpy}` : "–"}</td><td class="num">${g.winRate === null ? "–" : pc(g.winRate, 0).replace("+", "")}</td>
    <td class="num">${fx(g.payoff)}</td><td class="num ${cls(g.expR)}">${g.expR === null ? "–" : `${fx(g.expR)}R`}</td></tr>`;
}
const BLOCK_HEAD = `<tr><th></th><th class="num">Oper.</th><th class="num">Resultado</th><th class="num">× SPY</th><th class="num">Bateu o SPY</th><th class="num">Acerto</th><th class="num">Ganho/perda</th><th class="num">Expect.</th></tr>`; // prettier-ignore

export function viewJournal() {
  const list = loadJournal();
  const syms = [...new Set([...list.map((e) => e.sym), "SPY"])];
  loadSeries(syms);
  loadQuotes(syms);
  const sym = draft.sym.trim().toUpperCase();
  if (sym && /^[A-Z^][A-Z0-9^=-]{0,11}$/.test(sym)) loadSeries([sym]);
  const rows = journalRows();
  const sb = scoreboard(rows);
  const c = sb.closed;
  const head = `<section class="card"><h2>📒 Diário de operações <span class="muted small">(${rows.length})</span></h2>
    <p>${esc(verdictText(sb))}</p>
    <div class="rk-tiles">
      ${tile("Resultado fechado", usd(c.pnl), `${c.n} operações · ${pc(c.ret)} sobre o investido`, cls(c.pnl))}
      ${tile("× SPY (fechadas)", usd(c.alpha), c.spyPnl === null ? "sem SPY" : `SPY teria feito ${usd(c.spyPnl)}`, cls(c.alpha))}
      ${tile("Acerto", c.winRate === null ? "–" : pc(c.winRate, 0).replace("+", ""), `ganho médio ${pc(c.avgWin)} · perda média ${pc(c.avgLoss)}`)}
      ${tile("Expectativa", c.expR === null ? "–" : `${fx(c.expR)}R`, c.nR ? `por operação, em ${c.nR} com stop` : "registre o stop para medir em R", cls(c.expR))}
      ${tile("Abertas (a mercado)", usd(sb.open.pnl), `${sb.nOpen} · × SPY ${usd(sb.open.alpha)}`, cls(sb.open.pnl))}
    </div>
    <div class="row-btns"><button type="button" class="btn small ghost" data-jr="export">Exportar (JSON)</button>
      <label class="btn small ghost">Importar<input type="file" id="jrImport" accept="application/json,.json" hidden /></label></div>
  </section>`;
  const reasonTbl = sb.byReason.length
    ? `<section class="card"><h2>Qual motivo ganha dinheiro?</h2>
      <div class="table-wrap"><table class="cal-table"><thead>${BLOCK_HEAD}</thead><tbody>${sb.byReason.map((g) => blockRow(g.label, g)).join("")}</tbody></table></div>
      <p class="note">Só operações fechadas. "× SPY" = resultado menos o que o mesmo dinheiro teria feito no SPY entre as mesmas datas (fechamento do dia). Expectativa = resultado médio em múltiplos do risco (1R = distância até o stop). Motivo com "× SPY" negativo depois de ${20} operações é candidato a ser abandonado.</p></section>`
    : "";
  const monthTbl = sb.byMonth.length
    ? `<section class="card"><h2>Mês a mês (pela data de saída)</h2>
      <div class="table-wrap"><table class="cal-table"><thead>${BLOCK_HEAD.replace("<th></th>", "<th>Mês</th>")}</thead><tbody>${sb.byMonth.map((g) => blockRow(g.m.split("-").reverse().join("/"), g)).join("")}</tbody></table></div></section>`
    : "";
  const lines = rows
    .map(({ e, ev }) => {
      const act = e.closeDate
        ? `<button type="button" class="btn small ghost" data-jr="reopen" data-id="${esc(e.id)}" title="Desfazer a saída">↺</button>`
        : `<button type="button" class="btn small" data-jr="close" data-id="${esc(e.id)}">Sair</button>`;
      return `<tr><td><button class="linklike" data-sym="${esc(e.sym)}">${esc(e.sym)}</button><div class="muted small">${esc(reasonLabel(e.reason))}${e.note ? ` · ${esc(e.note)}` : ""}</div></td>
        <td class="nowrap">${dBR(e.openDate)}<div class="muted small">${fx(e.openPrice)} × ${num(e.qty, e.qty % 1 ? 2 : 0)}</div></td>
        <td class="nowrap">${e.closeDate ? `${dBR(e.closeDate)}<div class="muted small">${fx(e.closePrice)}</div>` : `<span class="tag neutral">aberta</span><div class="muted small">${fx(ev.exitPx)}</div>`}</td>
        <td class="num">${e.stop ? fx(e.stop) : "–"}</td>
        <td class="num ${cls(ev.pnl)}">${usd(ev.pnl)}<div class="small">${pc(ev.ret)}</div></td>
        <td class="num">${ev.r === null ? "–" : `${fx(ev.r)}R`}</td>
        <td class="num ${cls(ev.alpha)}">${usd(ev.alpha)}<div class="small muted">SPY ${pc(ev.spyRet)}</div></td>
        <td class="nowrap">${act} <button type="button" class="btn small ghost" data-jr="del" data-id="${esc(e.id)}" title="Apagar">✕</button></td></tr>`;
    })
    .join("");
  const listCard = rows.length
    ? `<section class="card"><h2>Operações</h2><div class="tw" style="box-shadow:none"><table><thead><tr><th>Ativo / motivo</th><th>Entrada</th><th>Saída</th><th class="num">Stop</th><th class="num">Resultado</th><th class="num">R</th><th class="num">× SPY</th><th></th></tr></thead><tbody>${lines}</tbody></table></div>
      <p class="note">Abertas marcadas pelo preço ao vivo. Resultado líquido dos custos informados; sem imposto e sem dividendos (o SPY de comparação também sem dividendos). Material educacional; não é recomendação de investimento.</p></section>`
    : `<section class="card empty"><p>Registre cada compra real abaixo, com o motivo. Ao vender, toque em <b>Sair</b>. Em 20 operações o placar mostra se as suas decisões ganham do SPY e qual tela do app ajuda (ou atrapalha).</p></section>`;
  return head + formHtml() + reasonTbl + monthTbl + listCard;
}

// ───────── ações ─────────
function updateList(fn) {
  saveJournal(fn(loadJournal()));
  hooks.render();
}

function download(name, text) {
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob([text], { type: "application/json" }));
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

export function initJournal() {
  document.addEventListener("input", (e) => {
    const f = e.target.dataset?.jrf;
    const pk = e.target.dataset?.jrp;
    if (f) {
      draft[f] = e.target.value;
      const box = document.getElementById("jrSize");
      if (box) box.innerHTML = sizingHtml(); // só a caixa do tamanho: o campo em edição não perde o foco
    } else if (pk) {
      state.prefs[pk] = e.target.value;
      savePrefs();
      const box = document.getElementById("jrSize");
      if (box) box.innerHTML = sizingHtml();
    }
  });
  document.addEventListener("change", (e) => {
    if (e.target.dataset?.jrf === "sym") {
      draft.sym = e.target.value.trim().toUpperCase();
      const s = draft.sym;
      if (s && !draft.openPrice) {
        const last = lastOf(s);
        if (last) draft.openPrice = String(Math.round(last * 100) / 100);
      }
      loadSeries([draft.sym]);
      loadQuotes([draft.sym]);
      hooks.render();
    }
    if (e.target.dataset?.jrf === "reason") draft.reason = e.target.value;
    if (e.target.id === "jrImport" && e.target.files?.[0]) {
      e.target.files[0].text().then((t) => {
        try {
          const arr = JSON.parse(t);
          const ok = (Array.isArray(arr) ? arr : []).map((x) => makeEntry(x)).filter((r) => r.ok).map((r) => r.entry); // prettier-ignore
          const have = new Set(loadJournal().map((x) => x.id));
          updateList((l) => [...l, ...ok.filter((x) => !have.has(x.id))]);
          globalThis.alert?.(`${ok.length} operação(ões) lida(s) do arquivo.`);
        } catch {
          globalThis.alert?.("Arquivo inválido (esperado o JSON exportado pelo Diário).");
        }
      });
    }
  });
  document.addEventListener("click", (e) => {
    const b = e.target.closest("[data-jr]");
    if (!b) return;
    const act = b.dataset.jr;
    if (act === "useqty") {
      draft.qty = b.dataset.qty;
      if (b.dataset.stop) draft.stop = b.dataset.stop;
      return hooks.render();
    }
    if (act === "add") {
      const r = makeEntry({ ...draft, openDate: draft.openDate || nyToday() });
      if (!r.ok) {
        formErr = r.errors.join("; ");
        return hooks.render();
      }
      formErr = null;
      draft = {
        sym: "",
        openDate: "",
        openPrice: "",
        qty: "",
        stop: "",
        fees: "",
        reason: draft.reason,
        note: "",
      };
      return updateList((l) => [...l, r.entry]);
    }
    if (act === "export") return download(`diario-pendulo-${nyToday()}.json`, JSON.stringify(loadJournal(), null, 2)); // prettier-ignore
    const id = b.dataset.id;
    const cur = loadJournal().find((x) => x.id === id);
    if (!cur) return;
    if (act === "del") {
      if (!globalThis.confirm?.(`Apagar a operação de ${cur.sym} de ${dBR(cur.openDate)}?`)) return;
      return updateList((l) => l.filter((x) => x.id !== id));
    }
    if (act === "reopen") return updateList((l) => l.map((x) => (x.id === id ? { ...x, closeDate: null, closePrice: null } : x))); // prettier-ignore
    if (act === "close") {
      const last = lastOf(cur.sym);
      const px = globalThis.prompt?.(`Preço de saída de ${cur.sym}:`, last ? String(Math.round(last * 100) / 100) : ""); // prettier-ignore
      if (px == null) return;
      const day = globalThis.prompt?.("Data da saída (AAAA-MM-DD):", nyToday());
      if (day == null) return;
      const fees = globalThis.prompt?.("Custos da venda (US$):", "0") ?? "0";
      const next = closeEntry(cur, { closeDate: day.trim(), closePrice: px, extraFees: fees });
      if (next.error) return globalThis.alert?.(`Não registrei: ${next.error}.`);
      return updateList((l) => l.map((x) => (x.id === id ? next : x)));
    }
  });
}
