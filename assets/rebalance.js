// Aba "Rebalancear": valor total da carteira + tickers + pesos-alvo -> quanto comprar ou vender de cada ativo.
// A carteira atual (opcional) vem do mesmo texto colado do Investing (Holdings) ou da carteira salva no app.
// Preços: cotação ao vivo do app, depois api/quotes (extras) e, por último, o preço colado.
import { parseInvestingPortfolio, parseNumber } from "./portfolio.js";
import { parseList } from "./analysis-data.js";
import { decSep, esc, fmtDT, num } from "./format.js";
import { fetchQuotes } from "./quote-hub.js";
import {
  BAND_MODES,
  FREQS,
  MODEL_DEFAULTS,
  MODELS,
  modelLabel,
  modelTargets,
} from "./rebalance-models.js";
import { hooks, savePrefs, state } from "./state.js";

const MAX_ROWS = 60;
export const rb = { quotes: {}, loading: false, error: null, tried: {} };
const RETRY = 5 * 60_000;

const usd = (x, d = 2) => (Number.isFinite(x) ? `US$ ${num(x, d)}` : "–");
/** Valor digitado: aceita "50000", "50.000", "50.000,00", "50,000.00". */
export const money = (raw) => {
  const t = String(raw ?? "").trim();
  return parseNumber(/^\$?\s*\d{1,3}(\.\d{3})+$/.test(t) ? t.replace(/\./g, "") : t);
};
const pctTxt = (x, d = 1) => (Number.isFinite(x) ? `${num(x * 100, d)}%` : "–");

/**
 * Cálculo do rebalanceamento (puro).
 * targets: [{ sym, w }] com w em % · current: { SYM: { qty, price? } } · prices: { SYM: preço } · total: US$ (opcional).
 * Sem total, usa o valor atual da carteira. Ativos da carteira fora dos alvos têm alvo 0 (vender tudo).
 */
export function rebalance({ total = null, targets = [], current = {}, prices = {} } = {}) {
  const px = (s) => (prices[s] > 0 ? prices[s] : current[s]?.price > 0 ? current[s].price : null);
  const tw = {};
  for (const t of targets) if (t.sym) tw[t.sym] = (tw[t.sym] ?? 0) + (Number(t.w) || 0) / 100;
  const syms = [
    ...new Set([...targets.map((t) => t.sym).filter(Boolean), ...Object.keys(current)]),
  ];
  const curValue = (s) => {
    const q = current[s]?.qty ?? 0;
    const p = px(s);
    return q > 0 && p ? q * p : 0;
  };
  const curTotal = syms.reduce((a, s) => a + curValue(s), 0);
  const T = total > 0 ? total : curTotal;
  const sumW = Object.values(tw).reduce((a, b) => a + b, 0);
  const tol = Math.max(1, T * 0.001); // diferença menor que isso: manter
  const rows = syms.map((s) => {
    const price = px(s);
    const qty = current[s]?.qty ?? 0;
    const value = curValue(s);
    const targetW = tw[s] ?? 0;
    const targetValue = T * targetW;
    const diff = targetValue - value;
    const tradeQty = price ? diff / price : null;
    const action = !price && targetW > 0 ? "noprice" : Math.abs(diff) < tol ? "hold" : diff > 0 ? "buy" : "sell"; // prettier-ignore
    return {
      sym: s,
      price,
      qty,
      value,
      weight: curTotal > 0 ? value / curTotal : 0,
      targetW,
      targetValue,
      diff,
      tradeQty,
      newQty: price ? targetValue / price : null,
      action,
    };
  });
  const buy = rows.filter((r) => r.action === "buy").reduce((a, r) => a + r.diff, 0);
  const sell = rows.filter((r) => r.action === "sell").reduce((a, r) => a - r.diff, 0);
  return { rows, total: T, curTotal, sumW, buy, sell, cash: T - curTotal };
}

/** Carteira atual a partir do texto colado do Investing: { current, targets (pesos atuais), warnings }. */
export function fromPasted(text) {
  const parsed = parseInvestingPortfolio(text);
  const current = {};
  for (const h of parsed.holdings)
    current[h.sym] = { qty: h.qty, price: h.invPrice > 0 ? h.invPrice : h.avg };
  return { current, targets: currentWeights(current), warnings: parsed.warnings };
}

/** Pesos atuais (%, 1 casa) como ponto de partida dos alvos. */
export function currentWeights(current, prices = {}) {
  const v = Object.entries(current).map(([sym, c]) => [sym, c.qty * (prices[sym] > 0 ? prices[sym] : c.price || 0)]); // prettier-ignore
  const tot = v.reduce((a, [, x]) => a + x, 0);
  return v.map(([sym, x]) => ({ sym, w: tot > 0 ? Math.round((x / tot) * 1000) / 10 : 0 }));
}

// ───────────── estado (prefs: salvo na nuvem com login, assets/settings-sync.js) ─────────────

const MAX_HIST = 20;
const cfg = () => {
  const c = (state.prefs.rebal ??= { total: "", rows: [], current: {} });
  c.model ??= "constant";
  c.mp = { ...MODEL_DEFAULTS, ...(c.mp ?? {}) };
  c.hist ??= [];
  return c;
};
const save = () => savePrefs();

function pricesFor(syms) {
  const out = {};
  for (const s of syms) {
    const p = state.live?.quotes?.[s]?.p ?? rb.quotes[s]?.p;
    if (p > 0) out[s] = p;
  }
  return out;
}

/** Busca o último preço dos tickers que ainda não têm cotação. */
export async function loadPrices(force = false) {
  const c = cfg();
  const syms = [...new Set([...c.rows.map((r) => r.sym), ...Object.keys(c.current), c.mp.safe])].filter(Boolean); // prettier-ignore
  const now = Date.now();
  const have = (s) => state.live?.quotes?.[s]?.p > 0 || rb.quotes[s]?.p > 0;
  const need = syms.filter((s) => force || (!have(s) && now - (rb.tried[s] ?? 0) > RETRY));
  if (!need.length || rb.loading) return;
  need.forEach((s) => (rb.tried[s] = now));
  rb.loading = true;
  rb.error = null;
  hooks.render();
  try {
    const j = await fetchQuotes(need.slice(0, 60), { id: "rebal", force: true, bg: false });
    Object.assign(rb.quotes, j.quotes);
    const miss = need.filter((s) => !(j.quotes[s]?.p > 0));
    if (miss.length)
      rb.error = `Sem cotação para ${miss.join(", ")}: confira o ticker (ex.: PETR4.SA).`;
  } catch (e) {
    rb.error = `Não foi possível buscar as cotações agora (${e.message ?? e}).`;
  } finally {
    rb.loading = false;
  }
  hooks.render();
}

// ───────────── tela ─────────────

const ACT = {
  buy: ["buy", "Comprar"],
  sell: ["sell", "Vender"],
  hold: ["neutral", "Manter"],
  noprice: ["wait", "Sem preço"],
};

export function viewRebalance() {
  const c = cfg();
  const syms = [...new Set([...c.rows.map((r) => r.sym), ...Object.keys(c.current), c.mp.safe])].filter(Boolean); // prettier-ignore
  const prices = pricesFor(syms);
  const total = money(c.total);
  if (syms.length) loadPrices();
  const plan = modelTargets({ model: c.model, params: c.mp, targets: c.rows, current: c.current, prices, total, lastAt: c.hist[0]?.at }); // prettier-ignore
  const res = rebalance({ total, targets: plan.targets, current: c.current, prices });
  const hasCur = Object.keys(c.current).length > 0;
  const sumW = c.rows.reduce((a, r) => a + (Number(r.w) || 0) / 100, 0);
  const sumOk = Math.abs(sumW - 1) < 0.0005;
  const trades = res.rows.filter((r) => r.action === "buy" || r.action === "sell");
  const canApply = trades.length > 0 && !res.rows.some((r) => r.action === "noprice");
  const editRows = c.rows
    .map(
      (r, i) => `<tr>
      <td><input class="rb-in rb-sym" data-rb-field="sym" data-i="${i}" value="${esc(r.sym)}" placeholder="VOO" aria-label="Ticker" /></td>
      <td class="num"><input class="rb-in rb-w" data-rb-field="w" data-i="${i}" value="${Number.isFinite(Number(r.w)) && r.w !== "" ? esc(String(r.w).replace(".", decSep())) : ""}" inputmode="decimal" placeholder="0" aria-label="Peso-alvo (%)" />%</td>
      <td class="num">${prices[r.sym] ? num(prices[r.sym], 2) : c.current[r.sym]?.price ? `${num(c.current[r.sym].price, 2)} <span class="muted" title="Preço colado (sem cotação ao vivo)">*</span>` : `<span class="muted">${rb.loading ? "…" : "–"}</span>`}</td>
      <td><button class="btn ghost" data-rb-act="del" data-i="${i}" aria-label="Remover ${esc(r.sym)}">✕</button></td></tr>`,
    )
    .join("");
  const resRows = res.rows
    .filter((r) => r.targetW > 0 || r.qty > 0)
    .sort((a, b) => Math.abs(b.diff) - Math.abs(a.diff))
    .map((r) => {
      const [tone, label] = ACT[r.action];
      const q = r.tradeQty;
      return `<tr>
        <td><span class="tk">${esc(r.sym)}</span>${r.targetW === 0 && r.qty > 0 ? ` <span class="muted small">zerar posição</span>` : ""}</td>
        <td class="num">${r.price ? num(r.price, 2) : "–"}</td>
        <td class="num">${hasCur ? `${num(r.qty, r.qty % 1 ? 4 : 0)}<div class="muted small">${usd(r.value)} · ${pctTxt(r.weight)}</div>` : "–"}</td>
        <td class="num">${pctTxt(r.targetW)}<div class="muted small">${usd(r.targetValue)}</div></td>
        <td><span class="tag ${tone}">${label}</span></td>
        <td class="num"><b class="${r.action === "buy" ? "pos" : r.action === "sell" ? "neg" : ""}">${r.action === "hold" || r.action === "noprice" ? "–" : usd(Math.abs(r.diff))}</b></td>
        <td class="num">${q === null || r.action === "hold" ? "–" : `${num(Math.abs(q), 2)}<div class="muted small">≈ ${num(Math.round(Math.abs(q)), 0)} cotas</div>`}</td>
        <td class="num">${r.newQty === null ? "–" : num(r.newQty, 2)}</td></tr>`;
    })
    .join("");
  return `<section class="rb">
    <div class="card">
      <h2>Rebalanceamento</h2>
      <p class="muted">Informe o valor total, os tickers e os pesos-alvo. O app busca o último preço e diz quanto comprar ou vender de cada ativo para enquadrar a carteira.</p>
      <div class="rb-top">
        <label>Valor total da carteira (US$)<input class="rb-in rb-total" data-rb-field="total" value="${esc(c.total ?? "")}" inputmode="decimal" placeholder="${hasCur ? `atual: ${num(res.curTotal, 2)}` : "ex.: 50000"}" /></label>
        <span class="muted small">${hasCur ? "Vazio = valor atual da carteira. Maior que o atual = aporte; menor = resgate." : "Sem carteira atual: o resultado é a compra de cada ativo do zero."}</span>
      </div>
    </div>

    <details class="card" ${hasCur ? "" : "open"}>
      <summary><b>Carteira atual</b> ${hasCur ? `<span class="muted">(${Object.keys(c.current).length} ativos)</span>` : `<span class="muted">(opcional)</span>`}</summary>
      <p class="muted small">Cole a tabela Holdings do Investing (o mesmo formato da aba Carteira) ou use a carteira já salva no app. Os pesos atuais viram o ponto de partida dos alvos.</p>
      <textarea id="rbText" rows="4" placeholder="Symbol&#9;Amount&#9;Avg Price&#9;Current Price…" aria-label="Carteira atual colada"></textarea>
      <p><button class="btn primary" data-rb-act="paste">Ler carteira colada</button> ${state.portfolio?.holdings?.length ? `<button class="btn" data-rb-act="use-pf">Usar minha carteira do app</button>` : ""} ${hasCur ? `<button class="btn ghost" data-rb-act="clear-cur">Limpar carteira atual</button>` : ""}</p>
    </details>

    <div class="card">
      <h3>Pesos-alvo</h3>
      <div class="rb-acts"><button class="btn" data-rb-act="add">+ Ativo</button><button class="btn" data-rb-act="equal" ${c.rows.length ? "" : "disabled"}>Pesos iguais</button>${hasCur ? `<button class="btn" data-rb-act="cur-w">Usar pesos atuais</button>` : ""}<button class="btn ghost" data-rb-act="clear-rows" ${c.rows.length ? "" : "disabled"}>Limpar alvos</button></div>
      <div class="rb-add"><input id="rbAdd" class="rb-in" placeholder="Cole tickers: VOO, QQQ; GLD…" aria-label="Adicionar tickers" /><button class="btn" data-rb-act="add-list">Adicionar</button></div>
      ${
        c.rows.length
          ? `<div class="tw"><table class="rb-tbl"><thead><tr><th>Ticker</th><th class="num">Peso-alvo</th><th class="num">Último preço</th><th></th></tr></thead><tbody>${editRows}</tbody>
      <tfoot><tr><td><b>Soma</b></td><td class="num"><b class="${sumOk ? "pos" : "neg"}">${num(sumW * 100, 1)}%</b></td><td colspan="2" class="muted small">${sumOk ? "fecha 100%" : sumW < 1 ? `faltam ${num((1 - sumW) * 100, 1)}% (fica em caixa)` : `passou ${num((sumW - 1) * 100, 1)}%: ajuste os pesos`}</td></tr></tfoot></table></div>`
          : `<p class="muted">Nenhum ativo ainda. Adicione tickers acima ou leia a carteira atual.</p>`
      }
      <p><button class="btn primary" data-rb-act="run" ${c.rows.length ? "" : "disabled"}>${rb.loading ? "Buscando preços…" : "Rebalancear"}</button></p>
      ${rb.error ? `<p class="amber small">${esc(rb.error)}</p>` : ""}
    </div>

    ${viewModel(c, plan, res)}

    ${
      res.rows.some((r) => r.targetW > 0 || r.qty > 0)
        ? `<div class="card">
      <h3>O que comprar e vender <span class="muted small">· ${esc(modelLabel(c.model))}</span></h3>
      <div class="grid g4 rb-kpis">
        <div class="card kpi"><div class="lab">Valor-alvo</div><div class="val">${usd(res.total)}</div><div class="sub muted">${hasCur ? `atual ${usd(res.curTotal)}` : "do zero"}</div></div>
        <div class="card kpi"><div class="lab">Comprar</div><div class="val pos">${usd(res.buy)}</div><div class="sub muted">${res.rows.filter((r) => r.action === "buy").length} ativos</div></div>
        <div class="card kpi"><div class="lab">Vender</div><div class="val neg">${usd(res.sell)}</div><div class="sub muted">${res.rows.filter((r) => r.action === "sell").length} ativos</div></div>
        <div class="card kpi"><div class="lab">${res.buy >= res.sell ? "Aporte necessário" : "Sobra em caixa"}</div><div class="val">${usd(Math.abs(res.buy - res.sell))}</div><div class="sub muted">compras − vendas</div></div>
      </div>
      <div class="tw"><table><thead><tr><th>Ativo</th><th class="num">Preço</th><th class="num">Atual (qtd · valor · peso)</th><th class="num">Alvo do modelo</th><th>Ação</th><th class="num">Valor</th><th class="num">Cotas a negociar</th><th class="num">Qtd. final</th></tr></thead><tbody>${resRows}</tbody></table></div>
      <p class="rb-apply"><button class="btn primary" data-rb-act="apply" ${canApply ? "" : "disabled"}>Aplicar rebalanceamento</button> <span class="muted small">${canApply ? `Registra as ${trades.length} operações e atualiza a carteira atual para as quantidades finais.` : trades.length ? "Faltam preços para aplicar." : "Nada a negociar agora."}</span></p>
      <p class="note">Valor-alvo × peso − valor atual = quanto comprar (positivo) ou vender (negativo); diferenças menores que 0,1% do total ficam como "manter". Cotas fracionadas exatas, com o arredondamento ao lado. Não considera custos, impostos nem lote mínimo. * = preço colado, sem cotação ao vivo. Material educacional; não é recomendação de investimento.</p>
    </div>`
        : ""
    }

    ${viewHistory(c)}
  </section>`;
}

const opts = (list, cur) =>
  list.map(([v, l]) => `<option value="${esc(String(v))}" ${String(cur) === String(v) ? "selected" : ""}>${esc(l)}</option>`).join(""); // prettier-ignore
const field = (label, key, val, hint = "") =>
  `<label>${label}<input class="rb-in rb-p" data-rb-field="mp" data-k="${key}" value="${esc(String(val ?? ""))}" inputmode="decimal" />${hint ? `<span class="muted small">${hint}</span>` : ""}</label>`; // prettier-ignore

function modelParams(c, res) {
  const p = c.mp;
  if (c.model === "bands")
    return `${field("Banda absoluta (p.p.)", "band", p.band)}${field("Banda relativa (% do peso)", "rel", p.rel, "0 = desliga")}
      <label>Ao sair da banda<select class="rb-in" data-rb-field="mp" data-k="bandMode">${opts(BAND_MODES, p.bandMode)}</select></label>`;
  if (c.model === "calendar")
    return `<label>Frequência<select class="rb-in" data-rb-field="mp" data-k="freq">${opts(FREQS, p.freq)}</select></label>
      <span class="muted small">${c.hist[0] ? `Último aplicado: ${fmtDT(new Date(c.hist[0].at))}` : "Nenhum rebalanceamento aplicado ainda."}</span>`;
  if (c.model === "cppi" || c.model === "tipp") {
    const safeOpts = [
      ["", "Caixa (sem ativo)"],
      ...c.rows.filter((r) => r.sym).map((r) => [r.sym, r.sym]),
    ];
    const floor =
      c.model === "cppi"
        ? field(
            "Piso (US$)",
            "floor",
            p.floor,
            `vazio = ${num(Number(p.floorPct) || 80, 0)}% de ${num(res.total, 0)}`,
          )
        : `${field("Piso = % do pico", "lock", p.lock)}<span class="muted small">Pico registrado: ${p.peak > 0 ? `US$ ${num(p.peak, 0)}` : "nenhum"} <button class="btn ghost" data-rb-act="reset-peak" ${p.peak > 0 ? "" : "disabled"}>Zerar pico</button></span>`;
    return `${floor}${field("Multiplicador", "mult", p.mult)}${field("Exposição máxima (% do valor)", "maxExp", p.maxExp)}
      <label>Ativo seguro<select class="rb-in" data-rb-field="mp" data-k="safe">${opts(safeOpts, p.safe)}</select></label>`;
  }
  return "";
}

function viewModel(c, plan, res) {
  const m = MODELS.find((x) => x.id === c.model) ?? MODELS[0];
  return `<div class="card rb-model">
      <h3>Modelo de rebalanceamento</h3>
      <div class="rb-top">
        <label>Método<select class="rb-in rb-msel" data-rb-field="model" aria-label="Modelo de rebalanceamento">${opts(
          MODELS.map((x) => [x.id, x.label]),
          c.model,
        )}</select></label>
        <button type="button" class="rb-info" data-rb-act="info" aria-label="O que é o modelo ${esc(m.label)}?" title="O que é este modelo?">?</button>
        ${modelParams(c, res)}
      </div>
      <p class="muted small">${esc(m.desc)}</p>
      ${plan.lines.length ? `<ul class="rb-lines">${plan.lines.map((l) => `<li>${esc(l)}</li>`).join("")}</ul>` : ""}
      ${plan.warn ? `<p class="amber small">${esc(plan.warn)}</p>` : ""}
    </div>`;
}

function viewHistory(c) {
  if (!c.hist.length) return "";
  const rows = c.hist
    .map(
      (
        h,
        i,
      ) => `<tr><td>${fmtDT(new Date(h.at))}</td><td>${esc(modelLabel(h.model))}</td><td class="num">${usd(h.total)}</td><td class="num pos">${usd(h.buy)}</td><td class="num neg">${usd(h.sell)}</td>
      <td class="small">${h.trades.map((t) => `${t.qty > 0 ? "+" : "−"}${num(Math.abs(t.qty), 2)} ${esc(t.sym)}`).join(" · ")}</td>
      <td>${i === 0 ? `<button class="btn ghost" data-rb-act="undo">Desfazer</button>` : ""}</td></tr>`,
    )
    .join("");
  return `<details class="card"><summary><b>Rebalanceamentos aplicados</b> <span class="muted">(${c.hist.length})</span></summary>
    <div class="tw"><table><thead><tr><th>Quando</th><th>Modelo</th><th class="num">Valor</th><th class="num">Compras</th><th class="num">Vendas</th><th>Operações</th><th></th></tr></thead><tbody>${rows}</tbody></table></div>
    <p class="note">Simulação salva neste aparelho: aplicar atualiza a carteira atual desta aba, não a aba Carteira nem a corretora.</p></details>`;
}

/** Aplica o resultado: carteira atual passa às quantidades finais e o rebalanceamento entra no histórico. */
export function applyResult(c, res, plan, at = new Date().toISOString()) {
  const next = {};
  for (const r of res.rows) {
    const qty = r.action === "buy" || r.action === "sell" ? r.newQty : r.qty;
    if (qty > 1e-9) next[r.sym] = { qty, price: r.price ?? c.current[r.sym]?.price ?? 0 };
  }
  const trades = res.rows
    .filter((r) => r.action === "buy" || r.action === "sell")
    .map((r) => ({ sym: r.sym, qty: r.tradeQty, value: r.diff }));
  c.hist.unshift({ at, model: c.model, total: res.total, buy: res.buy, sell: res.sell, trades, prev: c.current, prevMp: { ...c.mp } }); // prettier-ignore
  c.hist.length = Math.min(c.hist.length, MAX_HIST);
  if (c.model === "cppi" && !(Number(c.mp.floor) > 0) && plan.floor > 0) c.mp.floor = Math.round(plan.floor); // prettier-ignore
  if (c.model === "tipp" && plan.peak > 0) c.mp.peak = Math.max(Number(c.mp.peak) || 0, plan.peak);
  c.current = next;
  c.total = "";
}

// ───────────── eventos ─────────────

function setCurrent(current) {
  const c = cfg();
  c.current = current;
  c.rows = currentWeights(current, pricesFor(Object.keys(current)));
  save();
  loadPrices();
}

/** Popup "?" do modelo: fecha ao clicar fora, no ✕ ou com Esc (mesmo mecanismo das notícias). */
function openModelInfo(id) {
  const m = MODELS.find((x) => x.id === id) ?? MODELS[0];
  document.querySelector(".npop-back")?.remove();
  document.body.insertAdjacentHTML(
    "beforeend",
    `<div class="npop-back" data-npop-close><div class="npop" role="dialog" aria-modal="true" aria-labelledby="rbInfoT">
    <button type="button" class="npop-x" data-npop-close aria-label="Fechar">✕</button>
    <h3 id="rbInfoT">${esc(m.label)}</h3>
    <p class="npop-sum">${esc(m.desc)}</p>
    <p class="npop-sum">${esc(m.how)}</p>
    <p class="muted small">Material educacional; não é recomendação de investimento.</p>
  </div></div>`,
  );
  document.querySelector(".npop-x")?.focus();
}

export function initRebalance() {
  document.addEventListener("click", (e) => {
    const t = e.target.closest("[data-rb-act]");
    if (!t) return;
    if (t.dataset.rbAct === "info") return openModelInfo(cfg().model);
    const c = cfg();
    const act = t.dataset.rbAct;
    const i = Number(t.dataset.i);
    if (act === "add") c.rows.length < MAX_ROWS && c.rows.push({ sym: "", w: "" });
    else if (act === "del") c.rows.splice(i, 1);
    else if (act === "add-list") {
      const have = new Set(c.rows.map((r) => r.sym));
      for (const s of parseList(document.getElementById("rbAdd")?.value))
        if (!have.has(s) && c.rows.length < MAX_ROWS) c.rows.push({ sym: s, w: "" });
      loadPrices();
    } else if (act === "equal") {
      const w = Math.round((100 / c.rows.length) * 100) / 100;
      c.rows.forEach((r) => (r.w = w));
    } else if (act === "cur-w")
      c.rows = currentWeights(c.current, pricesFor(Object.keys(c.current)));
    else if (act === "clear-rows") c.rows = [];
    else if (act === "clear-cur") c.current = {};
    else if (act === "paste") {
      const r = fromPasted(document.getElementById("rbText")?.value);
      if (!Object.keys(r.current).length) {
        rb.error = r.warnings[0] ?? "Nenhuma posição reconhecida.";
        return hooks.render();
      }
      rb.error = r.warnings.length ? r.warnings.join(" ") : null;
      setCurrent(r.current);
    } else if (act === "use-pf") {
      const cur = {};
      for (const h of state.portfolio?.holdings ?? [])
        cur[h.sym] = { qty: h.qty, price: h.invPrice > 0 ? h.invPrice : h.avg };
      setCurrent(cur);
    } else if (act === "apply") {
      const prices = pricesFor([...new Set([...c.rows.map((r) => r.sym), ...Object.keys(c.current), c.mp.safe])].filter(Boolean)); // prettier-ignore
      const total = money(c.total);
      const plan = modelTargets({ model: c.model, params: c.mp, targets: c.rows, current: c.current, prices, total, lastAt: c.hist[0]?.at }); // prettier-ignore
      applyResult(c, rebalance({ total, targets: plan.targets, current: c.current, prices }), plan);
    } else if (act === "undo") {
      const h = c.hist.shift();
      if (h) {
        c.current = h.prev ?? {};
        if (h.prevMp) c.mp = { ...c.mp, floor: h.prevMp.floor, peak: h.prevMp.peak };
      }
    } else if (act === "reset-peak") c.mp.peak = 0;
    else if (act === "run") {
      save();
      return loadPrices(true);
    }
    save();
    hooks.render();
  });
  document.addEventListener("change", (e) => {
    const t = e.target.closest("[data-rb-field]");
    if (!t) return;
    const c = cfg();
    const f = t.dataset.rbField;
    const i = Number(t.dataset.i);
    if (f === "total") c.total = t.value.trim();
    else if (f === "model") c.model = t.value;
    else if (f === "mp") {
      const k = t.dataset.k;
      c.mp[k] = t.tagName === "SELECT" ? (k === "freq" ? Number(t.value) : t.value) : k === "floor" ? (money(t.value) ?? "") : (parseNumber(t.value) ?? MODEL_DEFAULTS[k]); // prettier-ignore
      if (k === "safe") loadPrices();
    } else if (f === "sym") {
      c.rows[i].sym = parseList(t.value)[0] ?? "";
      loadPrices();
    } else if (f === "w") c.rows[i].w = parseNumber(t.value) ?? "";
    save();
    hooks.render();
  });
}
