// Painel (Mercado › Visão geral): ativos que o usuário acrescenta a cada quadro (botão "+") e a faixa
// de manchetes do dia (as 10 que mais mexem com o mercado, trocando a cada 5 s).
import { esc } from "./format.js";
import { marketScore } from "./news.js";
import { ptTitle } from "./translate.js";

/** Quadros que aceitam ativos novos e como o texto digitado vira símbolo do Yahoo. */
export const ADDABLE = {
  "Bolsas EUA": "eq",
  "Bolsas Europa": "eq",
  "Bolsas Ásia-Pacífico": "eq",
  "Bolsas Américas": "eq",
  Moedas: "fx",
  Commodities: "eq",
  "Crédito e renda fixa": "eq",
  "Risco e volatilidade": "eq",
  Cripto: "crypto",
  // Mercado › Local (Brasil)
  "Bolsa B3": "br",
  "Brasil em Nova York": "eq",
  "Juros e renda fixa": "br",
  Câmbio: "fx",
  "Commodities da B3": "eq",
};

export const ADD_HINT = {
  eq: "Símbolo do Yahoo (ex.: ^GSPC, EWJ, CL=F)",
  fx: "Par de moedas (ex.: USD/CNY, EUR/JPY)",
  crypto: "Cripto (ex.: ADA, DOGE, BTC-USD)",
  br: "Ação ou ETF da B3 (ex.: PETR4, BOVA11) ou símbolo do Yahoo",
};

const SYM_RE = /^[A-Z0-9^][A-Z0-9.\-=^]{0,14}$/;

/**
 * Converte o texto digitado em { sym, label } (ou null se inválido).
 * Moedas: "USD/CNY" → CNY=X; "EUR/JPY" → EURJPY=X. Cripto: "ADA" → ADA-USD.
 */
export function normalizeExtra(kind, raw) {
  const t = String(raw ?? "")
    .trim()
    .toUpperCase()
    .replace(/\s+/g, "");
  if (!t) return null;
  if (kind === "fx") {
    const m = t.match(/^([A-Z]{3})[/\-.]?([A-Z]{3})(=X)?$/);
    if (!m) return SYM_RE.test(t) && t.endsWith("=X") ? { sym: t, label: t } : null;
    const [, a, b] = m;
    if (a === b) return null;
    return { sym: a === "USD" ? `${b}=X` : `${a}${b}=X`, label: `${a}/${b}` };
  }
  if (kind === "br") {
    // código da B3 (4 letras + 1-2 números) ganha .SA; o resto vale como símbolo do Yahoo
    const s = /^[A-Z]{4}\d{1,2}$/.test(t) ? `${t}.SA` : t;
    return SYM_RE.test(s) ? { sym: s, label: s.replace(/\.SA$/, "") } : null;
  }
  if (kind === "crypto") {
    const s = /^[A-Z0-9]{2,10}$/.test(t) ? `${t}-USD` : t;
    return SYM_RE.test(s) ? { sym: s, label: s.replace(/-USD$/, "") } : null;
  }
  return SYM_RE.test(t) ? { sym: t, label: t } : null;
}

/** Série de outro calendário alinhada às datas do painel (repete o último fechamento conhecido). */
export function alignSeries(dates, src) {
  if (!dates?.length || !src?.dates?.length) return null;
  const out = new Array(dates.length);
  let j = 0;
  let last = null;
  for (let i = 0; i < dates.length; i++) {
    while (j < src.dates.length && src.dates[j] <= dates[i]) last = src.close[j++];
    out[i] = last;
  }
  // começo sem dado: usa o primeiro disponível, para a variação de longo prazo não quebrar
  const first = out.find((v) => v != null);
  if (first == null) return null;
  // fechamento mais novo que o painel (outro fuso): entra no último ponto
  if (j < src.dates.length) out[out.length - 1] = src.close.at(-1);
  return out.map((v) => v ?? first);
}

/** Lista plana de símbolos extras ainda sem série carregada. */
export function missingExtras(extra, series) {
  return [
    ...new Set(
      Object.values(extra ?? {})
        .flat()
        .map((x) => x.sym),
    ),
  ].filter((s) => !series?.[s]);
}

// ───────────── manchetes do dia ─────────────

/** Relevância de mercado da manchete: palavras de mercado + assuntos + bônus por ser de impacto. */
export function headlineScore(it) {
  const subj = (it.tags ?? []).filter((t) => !["other", "opinion", "noise"].includes(t)).length;
  return marketScore(it.title ?? "") + 2 * subj + (it.impact ? 3 : 0) + (it.hits?.length ? 1 : 0);
}

/** As n manchetes mais relevantes das últimas 24 h (empate: a mais nova), mostradas da mais nova à mais antiga. */
export function topHeadlines(items, nowSec = Date.now() / 1000, n = 10) {
  return (items ?? [])
    .filter((it) => it.title && (!it.t || nowSec - it.t <= 24 * 3600))
    .filter((it) => !(it.tags ?? []).some((t) => t === "opinion" || t === "noise"))
    .map((it) => ({ it, s: headlineScore(it) }))
    .filter((x) => x.s > 0)
    .sort((a, b) => b.s - a.s || (b.it.t ?? 0) - (a.it.t ?? 0))
    .slice(0, n)
    .map((x) => x.it)
    .sort((a, b) => (b.t ?? 0) - (a.t ?? 0));
}

const HHMM = new Intl.DateTimeFormat("pt-BR", { hour: "2-digit", minute: "2-digit" });
const hhmm = (t) => (t ? HHMM.format(new Date(t * 1000)) : "");

let hlIdx = 0;
let hlKey = "";

/** Faixa de manchetes (uma por vez; o timer de initHeadlines troca a cada 5 s). */
export function headlinesHtml(items) {
  const list = topHeadlines(items);
  if (!list.length) return "";
  const key = list.map((x) => x.id).join();
  if (key !== hlKey) {
    // chegou manchete nova: começa por ela
    hlKey = key;
    hlIdx = 0;
  }
  hlIdx %= list.length;
  const body = list
    .map(
      (it, i) =>
        `<button class="hl-item${i === hlIdx ? " on" : ""}" data-news-pop="${esc(it.link ?? "")}" title="${esc(it.source ?? "")}"><span class="hl-t">${esc(hhmm(it.t))}</span><span class="hl-x">${esc(ptTitle(it))}</span><span class="hl-s">${esc(it.source ?? "")}</span></button>`,
    )
    .join("");
  return `<div class="hl-tape" data-hl aria-live="polite"><span class="hl-tag">Manchetes</span><div class="hl-box">${body}</div><span class="hl-n" data-hl-n>${hlIdx + 1}/${list.length}</span></div>`;
}

let hlStarted = false;
/** Troca a manchete a cada 5 s (para com o mouse em cima ou com a aba escondida). */
export function initHeadlines(every = 5000) {
  if (hlStarted || typeof document === "undefined") return;
  hlStarted = true;
  setInterval(() => {
    const box = document.querySelector("[data-hl]");
    if (!box || document.hidden || box.matches(":hover, :focus-within")) return;
    const items = box.querySelectorAll(".hl-item");
    if (items.length < 2) return;
    items[hlIdx % items.length]?.classList.remove("on");
    hlIdx = (hlIdx + 1) % items.length;
    items[hlIdx].classList.add("on");
    const n = box.querySelector("[data-hl-n]");
    if (n) n.textContent = `${hlIdx + 1}/${items.length}`;
  }, every);
}
