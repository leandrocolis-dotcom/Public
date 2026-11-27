// Painel inicial estilo terminal: quadros densos por tema (bolsas, juros, moedas, commodities, crédito,
// risco, cripto, setores) + leitura de regime. Só HTML (sem gráficos pesados): rápido de desenhar e de atualizar.
import { hq } from "./help.js";
import { esc, numLocale, onDecimalSep } from "./format.js";
import { valueCards } from "./fa.js";
import { tickAttr } from "./flash.js";
import { tapeHeld } from "./marquee.js";
import { Z_ALERT, moved, newsBadge, outlierBadge, zMove } from "./asset-news.js";
import { layoutPanels, panelId } from "./dash-layout.js";
import { ADDABLE, ADD_HINT, alignSeries, headlinesHtml } from "./dash-extra.js";
import { futMonth } from "./futures.js";
import { offQuote } from "./offmarket.js";
import {
  STRENGTH_NOTE,
  STRENGTH_W,
  STRENGTH_W_LIVE,
  regimeStrength,
  sdChange,
} from "./regime-strength.js";
import { flowBarItem, flowPanelHtml, flowSummary } from "./flow-summary.js";

let EXTRA = {};
let ADDING = null;

export const DASH_H = { "1d": 1, "5d": 5, "1m": 21, "3m": 63 };
/** Janelas de horas do pêndulo da Início (só a tela): humor do mercado nas últimas 1, 3 e 5 horas. */
export const PEND_HOURS = { "1h": 1, "3h": 3, "5h": 5 };

const NFS = new Map();
onDecimalSep(() => NFS.clear());
const nf = (d) =>
  NFS.get(d) ??
  NFS.set(d, new Intl.NumberFormat(numLocale(), { minimumFractionDigits: d, maximumFractionDigits: d })).get(d); // prettier-ignore

/** Casas decimais pelo tamanho do número (como num terminal). */
export function px(v, kind) {
  if (!Number.isFinite(v)) return "–";
  if (kind === "yld") return `${nf(2).format(v)}%`;
  const a = Math.abs(v);
  const d = a >= 1000 ? 0 : a >= 100 ? 2 : a >= 10 ? 2 : a >= 1 ? 3 : 4;
  return nf(d).format(v);
}
const sgn = (x) => (x > 0 ? "+" : x < 0 ? "−" : "");
// Convenção de terminal: verde = subiu, vermelho = caiu, para todo ativo (juros, VIX e USD/xxx inclusive).
// A leitura "bom/ruim para o risco" fica no quadro Regime e no Mapa de fluxo.
const tone = (x) => (Math.abs(x) < 1e-9 ? "" : x > 0 ? "up" : "dn");
export function chgCell(c, kind) {
  if (!Number.isFinite(c)) return `<td class="c">–</td>`;
  const txt =
    kind === "yld"
      ? `${sgn(c)}${nf(0).format(Math.abs(c))} bps`
      : `${sgn(c)}${nf(2).format(Math.abs(c) * 100)}%`;
  return `<td class="c ${tone(c)}">${txt}</td>`;
}

// Cotações ao vivo (horário de cada preço) e última data real da base; preenchidos a cada desenho do painel.
let Q = {};
let LAST = {};
let OFF = false;
let NEWS = {}; // manchetes do dia por ativo (asset-news.js)
/** "!" quando o ativo se moveu e há manchete do dia ligada a ele; guarda a variação para o popup. */
function badge(sym, c, kind, s, label) {
  let out = "";
  const z = s && h1 ? zMove(s, c, kind) : null;
  if (z != null && Math.abs(z) >= Z_ALERT && !OUT.some((o) => o.sym === sym)) {
    OUT.push({ sym, label, z, c, kind });
    out += outlierBadge(sym, z);
  } else if (z != null && Math.abs(z) >= Z_ALERT) out += outlierBadge(sym, z);
  if (NEWS[sym]?.length && moved(c, kind)) {
    BADGED[sym] = { c, kind };
    out += newsBadge(sym);
  }
  return out ? `<span class="abadges">${out}</span>` : "";
}
let h1 = false; // outliers só no horizonte de 1 dia
export let OUT = []; // ativos fora da curva no desenho atual (para o resumo do topo)
export const BADGED = {}; // modo Off market: mesmas tabelas, com preço e variação fora do pregão

const OFF_SRC = new Set(["fut", "fut~", "pre", "post"]);
const FUT_CASH = { "ES=F": "^GSPC", "NQ=F": "^NDX", "YM=F": "^DJI", "RTY=F": "^RUT" };
/** Variação a mostrar. Off (1D): desde o último fechamento regular, com o preço de pré/pós ou da proxy.
 *  Ativos cujo próprio mercado está aberto (Europa, Ásia, moedas, cripto) e futuros: variação normal. */
function rowChange(sym, s, h, kind) {
  if (OFF && h === 1) {
    if (sym === "CURVE") {
      const a = Q["^TNX"];
      const b = Q["^IRX"];
      if (a?.regP != null && b?.regP != null && (OFF_SRC.has(a.offSrc) || OFF_SRC.has(b.offSrc)))
        return (a.p - b.p - (a.regP - b.regP)) * 100;
    }
    // futuro de índice: mesma variação desde o fechamento do índice à vista (o ajuste da CME é o da véspera até 18:00)
    const cash = FUT_CASH[sym] && Q[FUT_CASH[sym]];
    if (cash && OFF_SRC.has(cash.offSrc) && cash.regP > 0) return cash.p / cash.regP - 1;
    const q = Q[sym];
    if (q && OFF_SRC.has(q.offSrc) && q.regP > 0)
      return kind === "yld" ? (q.p - q.regP) * 100 : q.p / q.regP - 1;
  }
  return change(s, h, kind);
}
const STAMP = new Intl.DateTimeFormat("pt-BR", {
  timeZone: "America/Sao_Paulo", weekday: "short", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit",
}); // prettier-ignore
const HHMM = new Intl.DateTimeFormat("pt-BR", {
  timeZone: "America/Sao_Paulo",
  hour: "2-digit",
  minute: "2-digit",
});
/** "ter. 06/10, 17:00" -> "ter 06/10 17:00" */
export const fmtStamp = (sec) => STAMP.format(new Date(sec * 1000)).replace(/\.|,/g, "");

/** Linha pequena sob o nome: quando o preço foi negociado (Brasília) e, se houver, o pré/pós-mercado. */
function stamp(sym) {
  const q = Q[sym === "CURVE" ? "^TNX" : sym];
  if (OFF && q?.t) {
    const hh = HHMM.format(new Date(q.t * 1000));
    const src =
      q.offSrc === "fut" ? `${esc(q.offFut)} ${hh}`
      : q.offSrc === "fut~" ? `~${esc(q.offFut)} ${hh}`
      : q.offSrc === "pre" || q.offSrc === "post" ? `${q.offSrc === "pre" ? "pré" : "pós"} ${hh}`
      : q.offSrc === "live" || /=F$|=X$|-USD$/.test(sym) ? `aberto · ${hh}`
      : `fechado · ${fmtStamp(q.regT ?? q.t)}`; // prettier-ignore
    return `<small class="ts">${src}</small>`;
  }
  if (!q?.t) {
    const d = LAST[sym];
    return d ? `<small class="ts">fech. ${d.slice(8, 10)}/${d.slice(5, 7)}</small>` : "";
  }
  let ext = "";
  if (q.xk && q.xp > 0 && sym !== "CURVE") {
    const c = Number.isFinite(q.xc) ? ` ${sgn(q.xc)}${nf(2).format(Math.abs(q.xc) * 100)}%` : "";
    ext = `<small class="ts">${q.xk === "pre" ? "pré" : "pós"} <span class="${tone(q.xc ?? 0)}"${tickAttr(`${sym}:x`, q.xp)}>${px(q.xp)}${c}</span> · ${HHMM.format(new Date(q.xt * 1000))}</small>`;
  }
  // futuro: qual contrato está sendo acompanhado (o app rola sozinho para o seguinte perto do vencimento)
  const fut = q.fut ? ` · <span title="Contrato ${esc(q.fut)}; troca para o seguinte perto do vencimento">${futMonth(q.fut)}</span>` : ""; // prettier-ignore
  return `<small class="ts">${fmtStamp(q.t)}${fut}</small>${ext}`;
}

/** Mini-gráfico de 30 pregões em SVG (uma linha, sem eixos). A cor segue a variação mostrada na linha (c).
 *  Leva os valores (data-v) para o toque/clique mostrar data e valor de cada ponto (sparkPick). */
export function spark(s, c, kind = "px") {
  if (!s || s.length < 3) return "";
  const v = s.slice(-30);
  const min = Math.min(...v);
  const max = Math.max(...v);
  const pts = v
    .map(
      (y, i) =>
        `${((i / (v.length - 1)) * 56).toFixed(1)},${(15 - ((y - min) / (max - min || 1)) * 13).toFixed(1)}`,
    )
    .join(" ");
  const vals = v.map((y) => (Number.isFinite(y) ? +y.toPrecision(7) : "")).join(",");
  return `<svg class="sp ${tone(Number.isFinite(c) ? c : v.at(-1) - v[0])}" viewBox="0 0 56 16" data-v="${vals}" data-k="${kind}" role="img" aria-label="Últimos ${v.length} pregões: toque para ver cada ponto"><polyline points="${pts}"/></svg>`;
}

/** Datas dos últimos pregões do painel (as séries do quadro são alinhadas a elas). */
let DATES = [];
/** Outra tela com mini-gráficos (Mercado › Local) usa o próprio calendário nas dicas. */
export const setSparkDates = (d) => {
  DATES = d ?? [];
};
const dayBR = (d) => (typeof d === "string" && d.length >= 10 ? `${d.slice(8, 10)}/${d.slice(5, 7)}/${d.slice(2, 4)}` : ""); // prettier-ignore

/**
 * Ponto do mini-gráfico mais perto do x (clientX) do toque/clique: índice, data, valor e variação contra o ponto
 * anterior. Puro com relação ao DOM (recebe a lista de valores e a posição relativa 0–1). */
export function sparkPoint(vals, frac, kind = "px", dates = DATES) {
  const n = vals.length;
  if (n < 2) return null;
  const i = Math.max(0, Math.min(n - 1, Math.round(frac * (n - 1))));
  const v = vals[i];
  if (!Number.isFinite(v)) return null;
  const prev = i > 0 ? vals[i - 1] : null;
  let chg = "";
  if (Number.isFinite(prev)) {
    const d = kind === "yld" ? (v - prev) * 100 : prev ? v / prev - 1 : null;
    if (d != null)
      chg =
        kind === "yld"
          ? `${sgn(d)}${nf(0).format(Math.abs(d))} bps`
          : `${sgn(d)}${nf(2).format(Math.abs(d) * 100)}%`;
  }
  const date = dates.length ? dates[dates.length - n + i] : null;
  return { i, n, v, date: dayBR(date), value: px(v, kind), chg, up: chg.startsWith("+") };
}

let tip = null;
/** Mostra a dica do ponto (data · valor · variação no dia) e marca o ponto no mini-gráfico. */
export function sparkPick(svg, clientX) {
  const vals = (svg.dataset.v ?? "").split(",").map((x) => (x === "" ? NaN : +x));
  const m = svg.getScreenCTM?.();
  if (!m || vals.length < 2) return;
  const x = (clientX - m.e) / m.a; // coordenada no viewBox (0–56)
  const pt = sparkPoint(vals, x / 56, svg.dataset.k);
  if (!pt) return;
  const poly = svg.querySelector("polyline")?.getAttribute("points")?.split(" ")[pt.i]?.split(",");
  let dot = svg.querySelector(".sp-dot");
  if (!dot) {
    dot = document.createElementNS("http://www.w3.org/2000/svg", "circle");
    dot.setAttribute("class", "sp-dot");
    dot.setAttribute("r", "1.8");
    svg.appendChild(dot);
  }
  if (poly) {
    dot.setAttribute("cx", poly[0]);
    dot.setAttribute("cy", poly[1]);
  }
  tip ??= Object.assign(document.createElement("div"), { className: "sp-tip", role: "status" });
  if (!tip.isConnected) document.body.appendChild(tip);
  tip.innerHTML = `${pt.date ? `<span class="d">${pt.date}</span> ` : ""}<b>${pt.value}</b>${pt.chg ? ` <span class="${pt.up ? "up" : "dn"}">${pt.chg}</span>` : ""}`; // prettier-ignore
  tip.hidden = false;
  const r = (dot.getBoundingClientRect?.().width ? dot : svg).getBoundingClientRect();
  const w = tip.offsetWidth;
  tip.style.left = `${Math.max(6, Math.min(innerWidth - w - 6, r.left + r.width / 2 - w / 2))}px`;
  tip.style.top = `${Math.max(6, r.top - tip.offsetHeight - 6)}px`;
  svg.classList.add("picking");
}

export function sparkUnpick() {
  if (tip) tip.hidden = true;
  document.querySelectorAll(".sp.picking").forEach((s) => {
    s.classList.remove("picking");
    s.querySelector(".sp-dot")?.remove();
  });
}

/** Variação no horizonte h: % para preços, bps para taxas. */
export function change(s, h, kind) {
  if (!s || s.length <= h) return null;
  const a = s.at(-1);
  const b = s.at(-1 - h);
  if (!Number.isFinite(a) || !Number.isFinite(b)) return null;
  return kind === "yld" ? (a - b) * 100 : a / b - 1;
}

// [símbolo, rótulo, tipo ("px" | "yld")]
const PANELS = [
  ["Bolsas EUA", [["^GSPC", "S&P 500"], ["^NDX", "Nasdaq 100"], ["^DJI", "Dow Jones"], ["^RUT", "Russell 2000"], ["ES=F", "S&P futuro"], ["NQ=F", "Nasdaq futuro"]]],
  ["Bolsas Europa", [["^STOXX50E", "Euro Stoxx 50"], ["^STOXX", "Stoxx 600"], ["^GDAXI", "DAX"], ["^FTSE", "FTSE 100"], ["^FCHI", "CAC 40"], ["FTSEMIB.MI", "FTSE MIB"], ["^IBEX", "IBEX 35"]]],
  ["Bolsas Ásia-Pacífico", [["^N225", "Nikkei 225"], ["^HSI", "Hang Seng"], ["000001.SS", "Xangai"], ["^KS11", "Kospi"], ["^TWII", "Taiex"], ["^NSEI", "Nifty 50"], ["^AXJO", "ASX 200"]]],
  ["Bolsas Américas", [["^BVSP", "Ibovespa"], ["EWZ", "Brasil (EWZ)"], ["^MXX", "IPC México"], ["^GSPTSE", "TSX Canadá"], ["^MERV", "Merval (ARS)"], ["ILF", "Latam (ILF)"]]],
  ["Juros EUA", [["^IRX", "3 meses", "yld"], ["^FVX", "5 anos", "yld"], ["^TNX", "10 anos", "yld"], ["^TYX", "30 anos", "yld"], ["CURVE", "Curva 10a − 3m", "yld"], ["ZN=F", "T-note 10a fut."], ["TLT", "Treasury 20+ (TLT)"]]],
  ["Moedas", [["DX-Y.NYB", "DXY"], ["EURUSD=X", "EUR/USD"], ["JPY=X", "USD/JPY"], ["GBPUSD=X", "GBP/USD"], ["BRL=X", "USD/BRL"], ["MXN=X", "USD/MXN"], ["CNY=X", "USD/CNY"], ["AUDJPY=X", "AUD/JPY (carry)"]]],
  ["Commodities", [["CL=F", "WTI"], ["BZ=F", "Brent"], ["NG=F", "Gás natural"], ["GC=F", "Ouro"], ["SI=F", "Prata"], ["HG=F", "Cobre"], ["ZS=F", "Soja"], ["ZC=F", "Milho"], ["KC=F", "Café"]]],
  ["Crédito e renda fixa", [["SHY", "Treasury 1-3a"], ["IEF", "Treasury 7-10a"], ["LQD", "Crédito IG"], ["HYG", "High yield"], ["EMB", "EM em US$"], ["EMLC", "EM moeda local"], ["TIP", "TIPS"]]],
  ["Risco e volatilidade", [["^VIX", "VIX"], ["^VIX3M", "VIX 3 meses"], ["^VVIX", "VVIX"], ["^MOVE", "MOVE (Treasuries)"], ["^SKEW", "SKEW (cauda)"], ["^OVX", "Vol. petróleo"]]],
  ["Cripto", [["BTC-USD", "Bitcoin"], ["ETH-USD", "Ether"], ["SOL-USD", "Solana"], ["XRP-USD", "XRP"], ["IBIT", "ETF Bitcoin (IBIT)"], ["BTC=F", "BTC futuro CME"]]],
]; // prettier-ignore

const SECTORS = [["XLK", "Tecnologia"], ["XLC", "Comunicação"], ["XLY", "Cons. discr."], ["XLF", "Financeiro"], ["XLI", "Industriais"], ["XLV", "Saúde"], ["XLE", "Energia"], ["XLB", "Materiais"], ["XLP", "Cons. básico"], ["XLU", "Utilities"], ["XLRE", "Imobiliário"]]; // prettier-ignore

// Leitura de regime: razões que sobem com apetite a risco.
/**
 * Pêndulo em 3 módulos (24/11/2026):
 *  • Bolsas por região (EUA, Europa, Ásia, Emergentes): variação do próprio índice; fora do pregão, futuros, pré/pós ou a bolsa
 *    de fora aberta (medida desde o fechamento de NY, sem dupla contagem).
 *  • Classes de ativos (risco × segurança): razões entre ativos de risco e de proteção (ações × Treasuries, crédito,
 *    cíclico × defensivo, cobre × ouro, AUD/JPY, dólar). Sobe = dinheiro saindo da segurança para o risco.
 *  • VIX e vol: nível e curva do VIX, rumo do VIX agora e MOVE (vol de Treasuries), em regime-strength.js.
 * [a, b, rótulo, grupo, sinal]: b = null mede a própria série; sinal −1 inverte (dólar forte = aversão).
 */
export const RATIOS = [
  ["SPY", null, "S&P 500", "us"],
  ["QQQ", null, "Nasdaq 100", "us"],
  ["IWM", null, "Russell 2000", "us"],
  ["^STOXX50E", null, "Europa (Euro Stoxx 50)", "eu"],
  ["^GDAXI", null, "Alemanha (DAX)", "eu"],
  ["^FTSE", null, "Reino Unido (FTSE 100)", "eu"],
  ["^N225", null, "Japão (Nikkei 225)", "asia"],
  ["^HSI", null, "Hong Kong (Hang Seng)", "asia"],
  ["^KS11", null, "Coreia (Kospi)", "asia"],
  ["^TWII", null, "Taiwan (Taiex)", "asia"],
  ["EEM", null, "Emergentes (EEM)", "em"],
  ["^NSEI", null, "Índia (Nifty 50)", "em"],
  ["EWZ", null, "Brasil (EWZ)", "em"],
  ["EWW", null, "México (EWW)", "em"],
  ["SPY", "TLT", "Ações × Treasuries", "bonds"],
  ["QQQ", "TLT", "Nasdaq × Treasuries", "bonds"],
  ["HYG", "IEF", "Crédito × governo", "credit"],
  ["EMB", "IEF", "Dívida emergente × Treasuries", "credit"],
  ["XLY", "XLP", "Cíclico × defensivo", "equity"],
  ["IWM", "SPY", "Small × large", "equity"],
  ["RSP", "SPY", "Amplitude (peso igual)", "equity"],
  ["EEM", "EFA", "Emergentes × desenvolvidos", "equity"],
  ["HG=F", "GC=F", "Cobre × ouro", "fx"],
  ["AUDJPY=X", null, "AUD/JPY (moeda de risco)", "fx"],
  ["DX-Y.NYB", null, "Dólar DXY (invertido)", "fx", -1],
];
/** Grupo → [módulo, rótulo]. Dentro do módulo cada grupo pesa igual; dentro do grupo cada razão pesa igual. */
export const REGIME_GROUPS = {
  us: ["eq", "EUA"],
  eu: ["eq", "Europa"],
  asia: ["eq", "Ásia"],
  em: ["eq", "Emergentes"],
  bonds: ["cls", "Ações × títulos"],
  credit: ["cls", "Crédito"],
  equity: ["cls", "Dentro das ações"],
  fx: ["cls", "Câmbio e commodities"],
};
/** Módulos do pêndulo (os dois de razões pesam igual; VIX e vol entra pelo peso da parte "vol"). */
export const REGIME_MODULES = [
  ["eq", "Bolsas"],
  ["cls", "Classes de ativos"],
  ["vol", "VIX e vol"],
];
/** Razão contra o contexto com força ≥ este número de desvios-padrão: "fora do padrão". */
export const OUTLIER_Z = 1.5;

function seriesOf(close, sym) {
  if (sym === "CURVE") {
    const a = close["^TNX"];
    const b = close["^IRX"];
    return a && b ? a.map((v, i) => v - b[i]) : null;
  }
  return close[sym] ?? null;
}

const ratioSeries = (close, a, b, sign = 1) => {
  const sa = close[a];
  if (!sa) return null;
  if (!b) return sign < 0 ? sa.map((v) => (v > 0 ? 1 / v : null)) : sa;
  return close[b] ? sa.map((v, i) => v / close[b][i]) : null;
};

/** Preço "fora do pregão" de um ativo (pré/pós, futuro ou mercado próprio aberto) e o do último fechamento. */
function offPair(q) {
  if (!q || !(q.p > 0)) return null;
  // futuros (=F) não passam pelo Off: já negociam quase 24 h e comparam com o ajuste anterior (pc)
  const moved = OFF_SRC.has(q.offSrc) || q.offSrc === "live" || (!q.offSrc && q.pc > 0);
  return { p: q.p, base: q.regP > 0 && OFF_SRC.has(q.offSrc) ? q.regP : (q.pc ?? q.regP ?? q.p), moved, src: q.offSrc, fut: q.offFut }; // prettier-ignore
}

/**
 * Variação de uma bolsa de fora desde o último fechamento de NY: preço atual (pregão local, ou futuro depois
 * dele) ÷ fechamento local ANTERIOR (pc), que é anterior ao fechamento de NY. Medir só desde o fechamento
 * de hoje (regP) perde a sessão inteira: Tóquio −5% seguido de futuro +2,7% virava "Japão subindo".
 * Cotação de mais de 18 h não conta (fim de semana, feriado local).
 */
export function localMove(q, nowMs = Date.now()) {
  if (!(q?.p > 0) || !(q.pc > 0) || !(q.t > 0)) return null;
  if (nowMs - q.t * 1000 > 18 * 3600e3) return null;
  return q.p / q.pc - 1;
}

/** ETF do país negociado em NY para cada bolsa de fora das razões (mede o que NY já andou depois do fechamento local). */
export const COUNTRY_ETF = { "^STOXX50E": "EZU", "^GDAXI": "EWG", "^FTSE": "EWU", "^N225": "EWJ", "^HSI": "EWH", "^KS11": "EWY", "^TWII": "EWT", "^NSEI": "INDA" }; // prettier-ignore

const near = (a, b) => a > 0 && b > 0 && Math.abs(a / b - 1) < 1e-6;

/** Valor anterior a v na série (v entre os 3 últimos pontos; pula repetidos de dia sem pregão), ou null. */
function priorTo(s, v) {
  for (let i = s.length - 1; i >= Math.max(0, s.length - 3); i--) {
    if (!near(s[i], v)) continue;
    for (let j = i - 1; j >= Math.max(0, i - 3); j--) if (s[j] > 0 && !near(s[j], v)) return s[j];
    return null;
  }
  return null;
}

/**
 * Variação local medida desde o último fechamento de NY. A sessão local de hoje compara com o fechamento local
 * anterior (pc), que veio ANTES do fechamento de NY: o que NY andou depois (ex.: queda forte na sexta) já está na
 * referência do regime e a bolsa de fora, ao reabrir, só alcança esse movimento. Sem ajuste, ele contava duas
 * vezes (Kospi −4,7% na segunda depois de NY −3,6% na sexta). Justo no fechamento de NY = fechamento local
 * anterior ao pc × variação do ETF do país no último pregão de NY (a mesma conta de impliedByCountryEtf). O
 * pregão de referência sai da cotação do ETF (etfQ): pregão de NY aberto → o de ontem (pc); fechado, pré ou pós →
 * o último regular (regP). Sem o histórico necessário, devolve a variação sem ajuste.
 */
export function sinceNyClose(move, close, sym, pc, etfQ = null) {
  const etf = COUNTRY_ETF[sym];
  const E = etf && close?.[etf];
  const L = close?.[sym];
  if (!Number.isFinite(move) || !(pc > 0) || !E || E.length < 2 || !L?.length) return move;
  const e1 = etfQ ? (etfQ.ms === "REGULAR" ? etfQ.pc : (etfQ.regP ?? etfQ.p)) : E.at(-1);
  let e0 = e1 > 0 ? priorTo(E, e1) : null;
  if (!e0 && etfQ && etfQ.ms !== "REGULAR" && etfQ.pc > 0 && !near(etfQ.pc, e1)) e0 = etfQ.pc;
  // fechamento local anterior ao pc: o anterior a ele na série ou, se a série ainda não tem o pc, o último dela
  const lPrev = priorTo(L, pc) ?? (near(L.at(-1), pc) ? null : L.at(-1));
  if (!(e1 > 0) || !(e0 > 0) || !(lPrev > 0)) return move;
  const surplus = e1 / e0 / (pc / lPrev);
  if (!(Math.abs(surplus - 1) < 0.15)) return move;
  return (1 + move) / surplus - 1;
}

/**
 * Movimento de um grupo de razões (peso igual): quantas sobem e a nota contínua 50·tanh(2z) + 50·tanh(z/2), a mesma
 * conta de amplitude e força da nota (regime-strength.js), sem degrau nem trava.
 */
function moveStats(xs) {
  const on = xs.filter((x) => x.c > 0).length;
  const zs = xs.map((x) => x.z).filter(Number.isFinite);
  const force = zs.length ? zs.reduce((t, z) => t + Math.tanh(z / 2), 0) / zs.length : 0;
  const wide = xs.reduce((t, x) => t + (Number.isFinite(x.z) ? Math.tanh(2 * x.z) : Math.sign(x.c)), 0) / xs.length; // prettier-ignore
  const raw = 50 * wide + 50 * force;
  return { on, n: xs.length, share: on / xs.length, raw, score: Math.round(raw) };
}

/** De onde veio o preço de cada razão no pêndulo ao vivo (rótulo curto). */
export const FEED_PT = {
  open: "pregão",
  fut: "futuros",
  "fut~": "futuros",
  pre: "pré-market",
  post: "pós-market",
  live: "bolsas de fora abertas",
  local: "bolsas de fora abertas",
  closed: "bolsas de fora (último pregão)",
  cty: "ETF do país em NY",
};

/**
 * Regime: quantas razões de risco subiram no horizonte + estrutura do VIX.
 * quotes (opcional, modo Off no 1D): variação de cada razão desde o último fechamento, com o preço de
 * pré/pós-mercado ou do futuro de cada ponta. É a PRÉVIA do regime antes da abertura.
 */
export function regime(close, h, quotes = null, { world = null, sdScale = 1 } = {}) {
  // bolsas de fora: sempre o melhor preço do momento (bolsa aberta, senão futuro ou ETF do país), também no
  // pregão de NY, quando a Europa já fechou e a Ásia ainda não abriu
  const wq = quotes ?? world;
  const items = RATIOS.map(([a, b, label, group, sign = 1]) => {
    const mod = REGIME_GROUPS[group][0];
    const s = ratioSeries(close, a, b, sign);
    let c = change(s, h, "px");
    let live = false;
    const qa = quotes && offPair(quotes[a]);
    const qb = quotes && b ? offPair(quotes[b]) : null;
    // as duas pontas estimadas pelo MESMO futuro (ex.: RSP e SPY pelo S&P): a razão não diz nada
    const sameProxy =
      !!b && qa?.fut && qa.fut === qb?.fut && /^fut/.test(qa.src ?? "") && /^fut/.test(qb.src ?? ""); // prettier-ignore
    // bolsa de fora (índice com ETF do país em NY): preço da própria bolsa, senão o ETF; ETFs de NY seguem o pré/pós
    const wa = h === 1 && wq && !b && COUNTRY_ETF[a] ? wq[a] : null;
    const wo = wa ? (wa.offSrc ? wa : offQuote(a, wa, wq)) : null;
    let local = wo ? localMove(wo) : null;
    const own = local != null && (wo.offSrc === "live" || wo.offSrc === "reg");
    // preço da própria bolsa (aberta agora ou recém-fechada): tira o que NY já andou depois do fechamento local
    if (own) local = sinceNyClose(local, close, a, wo.pc, wq[COUNTRY_ETF[a]]);
    let src = quotes ? null : "open";
    if (local != null) {
      // bolsa de fora: a sessão dela (que já fechou ou está aberta) veio DEPOIS do último fechamento de NY
      c = local;
      live = true;
      src = own ? (wo.offSrc === "live" ? "local" : "closed") : "cty";
    } else if (h === 1 && qa && !b && qa.moved) {
      c = (qa.p / qa.base) ** sign - 1;
      live = true;
      src = qa.src;
    } else if (h === 1 && qa && qb && (qa.moved || qb.moved) && !sameProxy) {
      c = qa.p / qb.p / (qa.base / qb.base) - 1;
      live = true;
      src = qa.moved && qa.src !== "live" ? qa.src : qb.src;
    }
    const sd0 = sdChange(s, h);
    const sd = sd0 ? sd0 * sdScale : sd0;
    const z = Number.isFinite(c) && sd ? c / sd : null;
    return { a, b, label, group, mod, c, s, z, live, sameProxy, src: live || !quotes ? src : null };
  }).filter((x) => x.c != null);
  // prévia: conta só as razões com preço fora do pregão (as demais ainda mostram o último pregão)
  const counted = quotes && items.some((x) => x.live) ? items.filter((x) => x.live) : items;
  // módulos de razões (Bolsas, Classes) pesam igual; dentro deles, cada grupo pesa igual; dentro do grupo, cada razão
  const groups = Object.entries(REGIME_GROUPS)
    .map(([id, [mod, label]]) => {
      const xs = counted.filter((x) => x.group === id);
      return xs.length ? { id, mod, label, ...moveStats(xs) } : null;
    })
    .filter(Boolean);
  const mods = REGIME_MODULES.map(([id, label]) => {
    const gs = groups.filter((g) => g.mod === id);
    if (!gs.length) return null;
    const avg = (k) => gs.reduce((t, g) => t + g[k], 0) / gs.length;
    const on = gs.reduce((t, g) => t + g.on, 0);
    const n = gs.reduce((t, g) => t + g.n, 0);
    return { id, label, on, n, share: avg("share"), raw: avg("raw"), groups: gs };
  }).filter(Boolean);
  for (const x of counted) {
    const gs = groups.filter((g) => g.mod === x.mod);
    const g = gs.find((y) => y.id === x.group);
    x.w = 1 / (mods.length * gs.length * g.n);
  }
  const on = counted.filter((x) => x.c > 0).length;
  const vix = (quotes && quotes["^VIX"]?.p) || close["^VIX"]?.at(-1);
  const vix3 = (quotes && quotes["^VIX3M"]?.p) || close["^VIX3M"]?.at(-1);
  const term = vix && vix3 ? vix / vix3 : null;
  const share = mods.length ? mods.reduce((t, b) => t + b.share, 0) / mods.length : 0.5;
  let verdict = share >= 0.7 ? "Risk-on" : share <= 0.3 ? "Risk-off" : "Misto";
  // Curva do VIX invertida (VIX > VIX 3m) é estresse, mas não apaga a amplitude: com as razões de risco
  // amplamente em alta (Risk-on) é repique sob estresse e o tipo segue Risk-on, com o alerta à parte (inverted).
  // Antes (até 23/11/2026) a curva sozinha virava "Estresse" mesmo num +5% amplo do S&P.
  const inverted = term > 1;
  const termPrev =
    quotes && close["^VIX"]?.length && close["^VIX3M"]?.length
      ? close["^VIX"].at(-1) / close["^VIX3M"].at(-1)
      : null;
  if (inverted)
    verdict = share >= 0.7 ? "Risk-on (VIX ainda invertido)" : "Estresse (VIX invertido)";
  // rumo do VIX agora (z da variação desde o último fechamento): pregão pela série ao vivo; fora dele, pelo VIX
  // estimado (VIXY no pré/pós, senão S&P) contra o último fechamento regular. VIX parado não conta.
  const vq = quotes?.["^VIX"];
  const vsd0 = h === 1 ? sdChange(close["^VIX"], 1) : null;
  const vsd = vsd0 ? vsd0 * sdScale : vsd0;
  let vixMove = null;
  let vixSrc = null;
  if (vsd && quotes) {
    if (vq?.regP > 0 && OFF_SRC.has(vq.offSrc)) {
      vixMove = (vq.p / vq.regP - 1) / vsd;
      vixSrc = vq.offFut === "VIXY" ? "VIX pelos futuros (VIXY)" : "VIX estimado pelo S&P";
    } else if (vq?.offSrc === "live" && vq.pc > 0) {
      vixMove = (vq.p / vq.pc - 1) / vsd;
      vixSrc = "VIX ao vivo";
    } else vixSrc = "VIX do último fechamento";
  } else if (vsd && close["^VIX"]?.length > 1) {
    vixMove = (close["^VIX"].at(-1) / close["^VIX"].at(-2) - 1) / vsd;
    vixSrc = "VIX ao vivo";
  }
  // MOVE (vol de Treasuries): só o nível, do pregão mais recente
  const bondVol = wq?.["^MOVE"]?.p || close["^MOVE"]?.at(-1) || null;
  const strength = regimeStrength(counted, h, {
    verdict,
    vix,
    term,
    vixMove,
    bondVol,
    sdScale,
    weights: h === 1 ? STRENGTH_W_LIVE : STRENGTH_W,
  });
  const feed = {
    live: quotes ? items.filter((x) => x.live).length : items.length,
    n: RATIOS.length,
    srcs: [...new Set(counted.map((x) => FEED_PT[x.src]).filter(Boolean))],
    vix: vixSrc,
  };
  // contexto geral = sinal da nota; fora do padrão = razão que anda forte (≥ 1,5 desvio) para o outro lado
  const dir = Math.sign(strength?.score ?? 0);
  const outliers = dir
    ? counted
        .filter(
          (x) => Number.isFinite(x.z) && Math.sign(x.z) === -dir && Math.abs(x.z) >= OUTLIER_Z,
        )
        .sort((p, q) => Math.abs(q.z) - Math.abs(p.z))
        .map((x) => ({ label: x.label, group: x.group, z: x.z, c: x.c }))
    : [];
  // blocos = os 3 módulos (Bolsas e Classes com os grupos dentro; VIX e vol pela parte "vol" da nota)
  const blocks = mods.map(({ raw, ...m }) => ({ ...m, score: Math.round(raw) }));
  const volP = strength?.parts?.vol;
  if (Number.isFinite(volP)) blocks.push({ id: "vol", label: "VIX e vol", score: Math.round(100 * volP) }); // prettier-ignore
  const agree = dir ? blocks.filter((b) => Math.sign(b.score) === dir).length : 0;
  return {
    items,
    on,
    n: counted.length,
    term,
    termPrev,
    inverted,
    verdict,
    strength,
    blocks,
    outliers,
    agree,
    live: items.filter((x) => x.live).length,
    feed,
    bondVol,
  };
}

/** Rótulo da sessão para a prévia do regime (pré, pós ou mercado fechado). */
export const SESSION_PT = {
  pre: "pré-mercado",
  post: "pós-mercado",
  closed: "mercado fechado",
  open: "pregão",
};

function panel(title, rows, close, h) {
  const fixed = new Set(rows.map(([sym]) => sym));
  const extra = (EXTRA[title] ?? []).filter((x) => !fixed.has(x.sym));
  const body = rows
    .map(([sym, label, kind = "px"]) => {
      const s = seriesOf(close, sym);
      if (!s) return "";
      const c = rowChange(sym, s, h, kind);
      const click = sym === "CURVE" ? "" : ` data-sym="${esc(sym)}" tabindex="0"`;
      return `<tr${click}><td class="n"><span class="nline"><span class="nm">${esc(label)}</span>${badge(sym, c, kind, s, label)}</span>${stamp(sym)}</td><td class="v"${tickAttr(sym, s.at(-1))}>${px(s.at(-1), kind)}</td>${chgCell(c, kind)}<td class="s">${spark(s, c, kind)}</td></tr>`;
    })
    .join("");
  // ativos acrescentados pelo usuário: abrem a página do ativo; o × tira do quadro
  const del = (x) => `<button class="dp-del" data-dash-del="${esc(title)}" data-dsym="${esc(x.sym)}" title="Tirar ${esc(x.label)} do quadro" aria-label="Tirar ${esc(x.label)}">×</button>`; // prettier-ignore
  const mine = extra
    .map((x) => {
      const s = close[x.sym];
      if (!s) return `<tr class="dp-mine"><td class="n"><span class="nline"><span class="nm">${esc(x.label)}</span>${del(x)}</span></td><td class="v dim" colspan="3">${x.err ? "sem cotação" : "carregando…"}</td></tr>`; // prettier-ignore
      const c = rowChange(x.sym, s, h, "px");
      return `<tr class="dp-mine" data-sr-open="${esc(x.sym)}" tabindex="0"><td class="n"><span class="nline"><span class="nm">${esc(x.label)}</span>${del(x)}</span></td><td class="v"${tickAttr(x.sym, s.at(-1))}>${px(s.at(-1), "px")}</td>${chgCell(c, "px")}<td class="s">${spark(s, c)}</td></tr>`; // prettier-ignore
    })
    .join("");
  const kind = ADDABLE[title];
  const add = kind
    ? `<button class="dp-add" data-dash-add="${esc(title)}" title="Incluir ativo em ${esc(title)}" aria-label="Incluir ativo em ${esc(title)}">+</button>`
    : "";
  const form =
    kind && ADDING === title
      ? `<form class="dp-form" data-dash-form="${esc(title)}"><input name="q" autocomplete="off" autocapitalize="characters" placeholder="${esc(ADD_HINT[kind])}" aria-label="${esc(ADD_HINT[kind])}" autofocus><button class="btn sm" type="submit">Incluir</button><button class="btn sm ghost" type="button" data-dash-add="">Cancelar</button></form>`
      : "";
  return `<section class="dp"><h3>${esc(title)}${add}</h3>${form}<table>${body}${mine}</table></section>`;
}

function yieldsPanel(ctx, close, h) {
  const us = close["^TNX"];
  const list = ctx.yields?.rows ?? [];
  const rows = [
    us ? `<tr data-sym="^TNX" tabindex="0"><td class="n"><span class="nm">EUA 10 anos</span>${stamp("^TNX")}</td><td class="v"${tickAttr("^TNX", us.at(-1))}>${px(us.at(-1), "yld")}</td>${chgCell(rowChange("^TNX", us, h, "yld"), "yld")}<td class="s d">Yahoo</td></tr>` : "",
    ...list.map((r) => {
      const c = r.prev != null ? (r.value - r.prev) * 100 : null;
      return `<tr title="${esc(r.source)}"><td class="n">${esc(r.country)} ${esc(r.tenor)}</td><td class="v">${px(r.value, "yld")}</td>${chgCell(c, "yld")}<td class="s d">${r.date.slice(8, 10)}/${r.date.slice(5, 7)}</td></tr>`;
    }),
  ].join(""); // prettier-ignore
  const note = ctx.yields?.error
    ? `<p class="dn-note">Fontes oficiais indisponíveis agora: ${esc(ctx.yields.error)}</p>`
    : list.length
      ? `<p class="dn-note">Variação: último dado oficial × anterior. Fontes: BCE, MoF Japão, Banco da Inglaterra, BCB.</p>`
      : `<p class="dn-note">Carregando…</p>`;
  return `<section class="dp"><h3>Juros soberanos</h3><table>${rows}</table>${note}</section>`;
}

function sectorsPanel(close, h) {
  const rows = SECTORS.map(([sym, label]) => ({
    sym,
    label,
    c: rowChange(sym, close[sym], h, "px"),
  }))
    .filter((r) => r.c != null)
    .sort((a, b) => b.c - a.c);
  const max = Math.max(...rows.map((r) => Math.abs(r.c)), 1e-9);
  const body = rows
    .map(
      (r) =>
        `<tr data-sym="${r.sym}" tabindex="0"><td class="n"><span class="nline"><span class="nm">${esc(r.label)}</span>${badge(r.sym, r.c, "px", close[r.sym], r.label)}</span>${stamp(r.sym)}</td>${chgCell(r.c, "px")}<td class="bar"><i class="${tone(r.c)}" style="width:${((Math.abs(r.c) / max) * 100).toFixed(0)}%"></i></td></tr>`,
    )
    .join("");
  return `<section class="dp"><h3>Setores EUA</h3><table>${body}</table></section>`;
}

function regimePanel(rg, h, preview) {
  const out = new Set((rg.outliers ?? []).map((o) => o.label));
  const row = (x) =>
    `<tr><td class="n">${esc(x.label)}${out.has(x.label) ? ` <small class="out-tag">fora do padrão ${x.z > 0 ? "+" : "−"}${nf(1).format(Math.abs(x.z))}σ</small>` : ""}${preview && x.live ? "" : preview && x.sameProxy ? `<small class="ts">mesmo futuro nas duas pontas: fora da conta</small>` : preview ? `<small class="ts">sem preço fora do pregão: fora da conta</small>` : ""}</td><td class="v dim">${esc(x.b ? `${x.a}/${x.b}` : x.a)}</td>${chgCell(x.c, "px")}<td class="s">${spark(x.s, x.c)}</td></tr>`;
  const sc = (b) => `${b.on}/${b.n} em alta · nota <b class="${b.score > 0 ? "up" : b.score < 0 ? "dn" : ""}">${b.score > 0 ? "+" : ""}${b.score}</b>`; // prettier-ignore
  const body = REGIME_MODULES.filter(([id]) => id !== "vol")
    .map(([id, label]) => {
      const m = (rg.blocks ?? []).find((y) => y.id === id);
      const gs = Object.entries(REGIME_GROUPS).filter(([, [mod]]) => mod === id);
      const rows = gs
        .map(([gid, [, glabel]]) => {
          const xs = rg.items.filter((x) => x.group === gid);
          if (!xs.length) return "";
          const g = m?.groups?.find((y) => y.id === gid);
          return `<tr class="rg-grp"><td colspan="4">${esc(glabel)} <span class="dim">${g ? sc(g) : "fora da conta"}</span></td></tr>${xs.map(row).join("")}`; // prettier-ignore
        })
        .join("");
      return rows ? `<tr class="rg-blk"><td colspan="4">${esc(label)} <span class="dim">${m ? sc(m) : "fora da conta"}</span></td></tr>${rows}` : ""; // prettier-ignore
    })
    .join("");
  const vb = (rg.blocks ?? []).find((y) => y.id === "vol");
  const volHead = vb ? `<tr class="rg-blk"><td colspan="4">VIX e vol <span class="dim">nota <b class="${vb.score > 0 ? "up" : vb.score < 0 ? "dn" : ""}">${vb.score > 0 ? "+" : ""}${vb.score}</b></span></td></tr>` : ""; // prettier-ignore
  const moveRow = Number.isFinite(rg.bondVol) ? `<tr><td class="n">MOVE (vol de Treasuries)</td><td class="v">${nf(0).format(rg.bondVol)}</td><td class="c ${rg.bondVol > 90 ? "dn" : "up"}">${rg.bondVol > 90 ? "acima de 90" : "abaixo de 90"}</td><td></td></tr>` : ""; // prettier-ignore
  const term = rg.term
    ? `<tr><td class="n">VIX ÷ VIX 3m</td><td class="v">${nf(2).format(rg.term)}</td><td class="c ${rg.term > 1 ? "dn" : "up"}">${rg.term > 1 ? "invertido" : "normal"}${Number.isFinite(rg.termPrev) && Math.abs(rg.term - rg.termPrev) >= 0.02 ? ` · ${rg.term < rg.termPrev ? "cedendo" : "piorando"} (fechamento ${nf(2).format(rg.termPrev)})` : ""}</td><td></td></tr>`
    : "";
  const nb = rg.blocks?.length ?? 0;
  const ctx = nb > 1 && rg.strength?.score ? `<p class="dn-note">${rg.agree} de ${nb} módulos no mesmo lado da nota${rg.agree === nb ? " (movimento amplo)" : rg.agree <= nb / 2 ? " (movimento isolado)" : ""}. ${rg.outliers?.length ? `Fora do padrão (≥ ${nf(1).format(OUTLIER_Z)} desvio contra o contexto): ${esc(rg.outliers.map((o) => o.label).join(", "))}.` : "Nenhuma razão anda forte contra o contexto."} Bolsas e Classes de ativos pesam igual no movimento (cada região ou grupo pesa igual dentro do módulo); VIX e vol completa a nota.</p>` : ""; // prettier-ignore
  const head = preview
    ? `<h3>Prévia do regime · ${esc(preview)}</h3><p class="dn-note"><b>${esc(rg.verdict)}</b>: ${rg.on}/${rg.n} razões de risco subindo desde o último fechamento, pelos futuros, pelo pré/pós-mercado e pelas bolsas de fora (só as ${rg.n} razões com preço fora do pregão entram na conta). Confirma-se só na abertura.</p>`
    : `<h3>Regime (${esc(h)})</h3>`;
  return `<section class="dp${preview ? " regime-preview" : ""}">${head}${ctx}<table>${body}${volHead}${term}${moveRow}</table>${strengthHtml(rg.strength)}</section>`;
}

const PART_PT = [["breadth", "Amplitude"], ["force", "Força (desvios)"], ["trend", "Direcionais (MM20/50)"], ["vol", "VIX e curva"]]; // prettier-ignore

/** Intensidade do regime: nota, barra de 0 a 100, as partes e a escala. Também usada no Onshore. */
export function strengthHtml(st, note = STRENGTH_NOTE) {
  if (!st) return "";
  const parts = PART_PT.filter(([k]) => Number.isFinite(st.parts[k]))
    .map(([k, l]) => {
      const v = Math.round(st.parts[k] * 100);
      return `<tr><td class="n">${esc(l)}</td><td class="v">${v > 0 ? "+" : ""}${v}</td><td class="c ${v > 0 ? "up" : v < 0 ? "dn" : ""}"></td><td></td></tr>`;
    })
    .join("");
  const tone = st.min >= 60 ? "up" : st.min >= 40 ? "mid" : "dn";
  return `<div class="rg-str"><div class="rg-str-h"><span>Intensidade <b>${esc(st.level)}</b> · ${st.intensity}/100${st.lean ? ` · ${esc(st.lean)}` : ""}${st.against ? " · contra a tendência" : ""}</span><span class="dim">nota ${st.score > 0 ? "+" : ""}${st.score}</span></div><div class="rg-bar" role="meter" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${st.intensity}" aria-label="Intensidade do regime"><i class="${tone}" style="width:${st.intensity}%"></i></div><p class="dn-note"><b>${esc(st.hint)}</b></p><table>${parts}</table><p class="dn-note">${esc(note)}</p></div>`;
}

const TAPE_KEYS = [["^GSPC", "S&P"], ["^NDX", "Nasdaq"], ["^TNX", "10a EUA", "yld"], ["DX-Y.NYB", "DXY"], ["EURUSD=X", "EUR"], ["BRL=X", "BRL"], ["CL=F", "WTI"], ["GC=F", "Ouro"], ["BTC-USD", "BTC"], ["^VIX", "VIX"]]; // prettier-ignore
function tape(close, h) {
  return TAPE_KEYS.map(([sym, label, kind = "px"]) => {
    const s = close[sym];
    if (!s) return "";
    const c = rowChange(sym, s, h, kind);
    const ct =
        c == null ? "–" : kind === "yld" ? `${sgn(c)}${nf(0).format(Math.abs(c))}bps` : `${sgn(c)}${nf(2).format(Math.abs(c) * 100)}%`; // prettier-ignore
    return `<button class="tk" data-sym="${esc(sym)}"><span class="l">${esc(label)}</span><span class="v"${tickAttr(sym, s.at(-1))}>${px(s.at(-1), kind)}</span><span class="${tone(c ?? 0)}">${ct}</span></button>`;
  }).join("");
}

/** Ativos da carteira na faixa (somam-se aos fixos, sem repetir). Variação no horizonte quando há série; senão, a do dia. */
function tapePortfolio(close, h, rows) {
  const fixed = new Set(TAPE_KEYS.map(([k]) => k));
  return (rows ?? [])
    .filter((r) => r.sym && !fixed.has(r.sym) && Number.isFinite(r.price))
    .map((r) => {
      const s = close?.[r.sym];
      const c = s?.length > 1 ? rowChange(r.sym, s, h, "px") : r.dayPLPct;
      const ct = Number.isFinite(c) ? `${sgn(c)}${nf(2).format(Math.abs(c) * 100)}%` : "–";
      return `<button class="tk pf" data-hold="${esc(r.sym)}" title="Na sua carteira"><span class="l">● ${esc(r.sym)}</span><span class="v"${tickAttr(r.sym, r.price)}>${px(r.price, "px")}</span><span class="${tone(c ?? 0)}">${ct}</span></button>`;
    })
    .join("");
}

/**
 * ctx: { flow (com cotações ao vivo), horizon, yields, valuation, signals, audit, fresh }
 */
export function viewDash(ctx) {
  if (tip) tip.hidden = true; // o quadro é redesenhado: a dica do mini-gráfico apontaria para o nada
  OFF = ctx.mode === "off";
  EXTRA = ctx.extra ?? {};
  ADDING = ctx.adding ?? null;
  let close = ctx.flow?.close;
  if (close && ctx.extraSeries) {
    const add = {};
    for (const [sym, src] of Object.entries(ctx.extraSeries)) {
      const a = !close[sym] && alignSeries(ctx.flow.dates, src);
      const lp = ctx.extraLive?.[sym]?.p;
      // preço ao vivo no último ponto (o histórico diário vem com até 1 h de cache)
      if (a && lp > 0) a[a.length - 1] = lp;
      if (a) add[sym] = a;
    }
    close = { ...close, ...add };
  }
  Q = ctx.quotes ?? {};
  LAST = ctx.flow?.last_real ?? {};
  DATES = ctx.flow?.dates ?? [];
  NEWS = ctx.assetNews ?? {};
  for (const k of Object.keys(BADGED)) delete BADGED[k];
  OUT = [];
  if (!close) return `<div class="card empty">Dados de mercado indisponíveis.</div>`;
  const hk = ctx.horizon in DASH_H ? ctx.horizon : "1d";
  const h = DASH_H[hk];
  // Fora do pregão, no 1D: prévia do regime com futuros e pré/pós-mercado (variação desde o último fechamento)
  const preview = OFF && h === 1 ? (SESSION_PT[ctx.session] ?? "fora do pregão") : null;
  const rg = regime(close, h, preview ? Q : null, { world: h === 1 ? Q : null });
  const v = ctx.valuation;
  const pf = v
    ? `<button class="sb-item" data-tab="portfolio"><span class="l">Carteira</span><b>US$ ${nf(0).format(v.total)}</b><span class="${tone(v.dayPL ?? 0)}">${v.dayPLPct == null ? "" : `${sgn(v.dayPLPct)}${nf(2).format(Math.abs(v.dayPLPct) * 100)}% hoje`}</span></button>`
    : `<button class="sb-item" data-tab="portfolio"><span class="l">Carteira</span><b>Importar</b><span class="dim">cole do Investing</span></button>`;
  const vc = ctx.fund ? valueCards(ctx.fund, ctx.prices) : [];
  const vby = Object.fromEntries(vc.map((c) => [c.id, c.label]));
  const valueItem = vc.length
    ? `<div class="sb-item"><span class="l">Valor</span><b>SPY ${esc((vby.SPY ?? "–").toLowerCase())}</b><span class="dim">Treasuries ${esc((vby.TLT ?? "–").toLowerCase())} · HY ${esc((vby.HYG ?? "–").toLowerCase())}</span></div>`
    : "";
  const hBtns = Object.keys(DASH_H)
    .map((k) => `<button data-dash-h="${k}" aria-pressed="${k === hk}">${k.toUpperCase()}</button>`)
    .join("");
  h1 = h === 1;
  const tapeItems = tape(close, h) + tapePortfolio(close, h, ctx.valuation?.rows);
  // grade antes do topo: os "!" de fora da curva são coletados ao desenhar as linhas
  const P = (i) => ({
    id: panelId(PANELS[i][0]),
    html: panel(PANELS[i][0], PANELS[i][1], close, h),
  });
  const reg = { id: "regime", html: regimePanel(rg, hk.toUpperCase(), preview) };
  // resumo do fluxo (mesmo motor da aba Fluxo, no horizonte do painel)
  const fsum = flowSummary(ctx.flow, { horizon: hk, session: ctx.session, sessionFrac: ctx.sessionFrac }); // prettier-ignore
  const flowP = { id: "fluxo", html: flowPanelHtml(fsum) };
  const items = [
    ...(preview ? [reg] : []),
    P(0),
    P(4),
    { id: "juros-soberanos", html: yieldsPanel(ctx, close, h) },
    ...(preview ? [] : [reg]),
    flowP,
    P(1),
    P(2),
    P(3),
    P(5),
    P(6),
    P(7),
    { id: "setores-eua", html: sectorsPanel(close, h) },
    P(8),
    P(9),
  ];
  const grid = `
    <div class="dash-grid">${layoutPanels(items)}</div>
`;
  OUT.sort((a, b) => Math.abs(b.z) - Math.abs(a.z));
  const outItem = h1
    ? `<button class="sb-item${OUT.length ? " out-alert" : ""}" data-outlier-list><span class="l">Fora da curva ${hq("outlier")}</span><b>${OUT.length ? `${OUT.length} ativo${OUT.length > 1 ? "s" : ""}` : "Nenhum"}</b><span class="dim">${
        OUT.length
          ? esc(
              OUT.slice(0, 3)
                .map((o) => o.label)
                .join(" · "),
            )
          : "variações dentro do normal"
      }</span></button>`
    : "";
  const vtone = /on/i.test(rg.verdict) ? "up" : /off|Estresse/.test(rg.verdict) ? "dn" : "mid";
  return `
  <div class="dash">
    <div class="dash-bar">
      <div class="sb-item verdict ${vtone}"><span class="l">${preview ? `Prévia do regime · ${esc(preview)}` : `Regime ${hk.toUpperCase()}`} ${hq("regime", { on: rg.on, n: rg.n, intensity: rg.strength?.intensity })}</span><b>${esc(rg.verdict)}${rg.strength ? ` · ${esc(rg.strength.level)}` : ""}</b><span class="dim">${rg.strength ? `intensidade ${rg.strength.intensity}/100 · ` : ""}${rg.on}/${rg.n} razões de risco em alta${preview ? " · futuros e pré/pós" : ""}</span></div>
      ${pf}
      ${flowBarItem(fsum)}
      ${valueItem}
      ${outItem}
      <button class="sb-item" data-tab="news"><span class="l">Notícias</span><b>${ctx.newsHits ?? 0}</b><span class="dim">sobre a carteira</span></button>
      <span class="seg dash-h" role="group" aria-label="Horizonte">${hBtns}</span>
    </div>
    <div class="tape${tapeHeld() ? " held" : ""}" data-tape title="Clique para pausar ou retomar"><div class="tape-track"><div class="tape-grp">${tapeItems}</div><div class="tape-grp" aria-hidden="true" inert>${tapeItems}</div></div></div>
    ${headlinesHtml(ctx.news)}
${grid}    <p class="dn-note">Clique em qualquer linha para o gráfico. Preços do Yahoo (ao vivo, ~15 min de atraso em algumas bolsas); juros fora dos EUA de fontes oficiais com 1-2 dias de defasagem. Arraste um quadro pelo título para mudar de lugar; "–" recolhe. <button class="linkish" data-dash-reset>Restaurar layout</button> Material educacional.</p>
  </div>`;
}
