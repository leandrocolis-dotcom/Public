// Aba News: notícias que afetam a carteira em destaque e as manchetes do dia (link para a fonte).
import { ptSum, ptTitle } from "./translate.js";
import { esc } from "./format.js";
import { DEFAULT_TAGS, NEWS_TAGS, TAG_LABEL, marketScore, passTags } from "./news.js";
import { weekendDigest, weekendWindow } from "./weekend.js";

const HM = new Intl.DateTimeFormat("pt-BR", {
  timeZone: "America/Sao_Paulo",
  hour: "2-digit",
  minute: "2-digit",
});
const DM = new Intl.DateTimeFormat("pt-BR", {
  timeZone: "America/Sao_Paulo",
  day: "2-digit",
  month: "2-digit",
});
const when = (t, now = Date.now() / 1000) => {
  if (!t) return "";
  const d = new Date(t * 1000);
  return DM.format(d) === DM.format(new Date(now * 1000))
    ? HM.format(d)
    : `${DM.format(d)} ${HM.format(d)}`;
};

const NEW_SECS = 20 * 60;

/** Código curto da fonte (coluna da direita, como o código de provedor do terminal). */
const CODES = { Bloomberg: "BBG", "Yahoo Finance": "YHF", "Wall Street Journal": "WSJ", "Business Insider": "BI", Forbes: "FBS", Fortune: "FTN", Nasdaq: "NDQ", "BBC Business": "BBC", "Financial Times": "FT", CNBC: "CNBC", MarketWatch: "MW", "Investing.com": "INV", "Seeking Alpha": "SA", "The Economist": "ECO", "Valor Econômico": "VLR", "Valor Investe": "VLI", InfoMoney: "IMN", "Money Times": "MT", Exame: "EXM", "Investing Brasil": "INVBR" }; // prettier-ignore
export const srcCode = (source) =>
  CODES[source] ??
  (String(source ?? "")
    .split(/\s+/)
    .map((w) => w[0])
    .join("")
    .toUpperCase()
    .slice(0, 4) ||
    "–");

/** Liga/desliga uma tag do filtro (a lista vazia volta ao padrão: nada some de vez por engano). */
export function toggleTag(cur, tag) {
  const set = new Set(cur ?? DEFAULT_TAGS);
  if (set.has(tag)) set.delete(tag);
  else set.add(tag);
  return set.size ? NEWS_TAGS.map(([k]) => k).filter((k) => set.has(k)) : [...DEFAULT_TAGS];
}

const tagChips = (it) =>
  (it.tags ?? [])
    .map((t) => `<span class="ntag ntag-${t}">${esc(TAG_LABEL[t] ?? t)}</span>`)
    .join("");

/** Uma linha do terminal: nº) manchete (tickers) · fonte · hora. */
function line(it, n, now, { hot = false } = {}) {
  const isNew = it.seen && now - it.seen < NEW_SECS;
  const chips = (it.hits ?? [])
    .map(
      (h) =>
        `<span class="nchip ${h.direct ? "direct" : ""}" title="${h.direct ? "Cita o ativo/empresa" : "Tema que afeta o ativo"}">${esc(h.sym)}${h.direct ? "" : ` · ${esc(h.why)}`}</span>`,
    )
    .join("");
  return `<li class="bb-row${hot || it.hits ? " hot" : ""}${isNew ? " nnew" : ""}"><button type="button" class="bb-btn" data-news-pop="${esc(it.link)}">
    <span class="bb-n">${n})</span><span class="bb-t">${isNew ? `<span class="nnew-tag">novo</span> ` : ""}${esc(ptTitle(it))}${chips ? ` <span class="nchips">${chips}</span>` : ""} ${tagChips(it)}</span>
    <span class="bb-src" title="${esc(it.source)}">${esc(srcCode(it.source))}</span><span class="bb-time">${when(it.t)}</span></button></li>`;
}

/**
 * Resumo do fim de semana (do fechamento de sexta à abertura de segunda): o que cita a carteira e as
 * principais do mercado. w: { items, win, loading } (feeds.loadWeekendNews).
 */
export function weekendHtml(w, now = Date.now() / 1000) {
  const win = w?.win ?? weekendWindow(now);
  const span = `${DM.format(new Date(win.from * 1000))} ${HM.format(new Date(win.from * 1000))} → ${win.live ? "agora" : `${DM.format(new Date(win.to * 1000))} ${HM.format(new Date(win.to * 1000))}`} BRT`;
  const head = (t) =>
    `<div class="bb-bar"><b>🗓 ${t}</b><span>${span} · fechamento de sexta à abertura de segunda</span></div>`;
  if (w?.loading && !w.items?.length)
    return `<div class="bb-sec bb-wknd">${head("Resumo do fim de semana")}<p class="bb-empty">Juntando as manchetes do fim de semana…</p></div>`;
  const { pf, top, total } = weekendDigest(w?.items ?? [], win);
  let i = 0;
  const rows = (arr, o) => arr.map((x) => line(x, ++i, now, o)).join("");
  const body = total
    ? `${pf.length ? `<h4 class="bb-wknd-h">Sua carteira</h4><ul class="bb-list">${rows(pf, { hot: true })}</ul>` : ""}
       ${top.length ? `<h4 class="bb-wknd-h">Principais do mercado</h4><ul class="bb-list">${rows(top)}</ul>` : `<p class="bb-empty">Nenhuma manchete com assunto de mercado no período.</p>`}`
    : `<p class="bb-empty">Ainda não há manchetes guardadas deste fim de semana.</p>`;
  return `<div class="bb-sec bb-wknd">${head(`Resumo do fim de semana${win.live ? " (em andamento)" : ""}`)}${body}
    <p class="bb-empty">${total} manchetes no período; aqui só as que mais pesam. Toque para ler o resumo.</p></div>`;
}

/** Abre o popup da matéria (fecha o anterior). Usado pelo clique na lista e pelas notificações. */
export function openNewsPop(it) {
  document.querySelector(".npop-back")?.remove();
  document.body.insertAdjacentHTML("beforeend", newsPopHtml(it));
  document.querySelector(".npop-x")?.focus();
}

/** Popup com manchete e resumo completos; fecha ao clicar fora, no ✕ ou com Esc. */
export function newsPopHtml(it) {
  const chips = (it.hits ?? [])
    .map((h) => `<span class="nchip ${h.direct ? "direct" : ""}">${esc(h.sym)}${h.direct ? "" : ` · ${esc(h.why)}`}</span>`)
    .join(""); // prettier-ignore
  return `<div class="npop-back" data-npop-close><div class="npop" role="dialog" aria-modal="true" aria-labelledby="npopT">
    <button type="button" class="npop-x" data-npop-close aria-label="Fechar">✕</button>
    <span class="nmeta"><b>${esc(it.source)}</b> · ${when(it.t)}</span>
    <h3 id="npopT">${esc(ptTitle(it))}</h3>
    ${it.d ? `<p class="npop-sum">${esc(ptSum(it))}</p>` : `<p class="muted">A fonte não publica resumo desta matéria.</p>`}
    ${chips ? `<span class="nchips">${chips}</span>` : ""}
    ${it.tags?.length ? `<span class="nchips">${tagChips(it)}</span>` : ""}
    <a class="btn primary" href="${esc(it.link)}" target="_blank" rel="noopener noreferrer">Abrir matéria ↗</a>
  </div></div>`;
}

/**
 * Aba News em formato de terminal: faixa de comando, abas de região, "Sua carteira" e "Mais relevantes" no topo
 * e depois o fluxo por horário, tudo numerado em sequência. Só usa as variáveis do tema (cada tema mantém suas cores).
 * ctx: { news, filter, tags, hasPortfolio, open: { pf, all }, wknd } — seções recolhíveis, estado lembrado;
 * wknd (não nulo = botão "Resumo do fds" ligado) mostra o resumo do fim de semana no topo.
 * tags: assuntos ligados (padrão: tudo menos Outros, Opinião e Ruído = só o que mexe com mercado e ativos).
 * region: "int" (Mercados › Offshore) ou "br" (Mercados › Onshore) = só as manchetes daquele lado; sem região, todas.
 */
export function viewNews(ctx) {
  const region = ctx.region ?? null;
  const n0 = ctx.news;
  if (!n0) return `<div class="card empty">Buscando manchetes…</div>`;
  const n = region ? { ...n0, items: (n0.items ?? []).filter((x) => x.region === region) } : n0;
  if (!n.items?.length)
    return `<div class="card empty">Sem manchetes ${region === "br" ? "do Brasil " : region === "int" ? "internacionais " : ""}agora${n0.error ? `: ${esc(n0.error)}` : ""}. Tente Recarregar.</div>`;
  const f = region && !["top", "all"].includes(ctx.filter) ? "top" : (ctx.filter ?? "top");
  const now = Date.now() / 1000;
  const on = ctx.tags ?? DEFAULT_TAGS;
  const items = n.items.filter((x) => passTags(x, on));
  const hidden = n.items.length - items.length;
  const mine = items.filter((x) => x.hits);
  const direct = mine.filter((x) => x.hits.some((h) => h.direct));
  const pfList = [...direct, ...mine.filter((x) => !direct.includes(x))].slice(0, 25);
  // Destaques: só manchetes com assunto de mercado (ou ligadas à carteira); "Todas" mostra tudo
  const relevant = items.filter((x) => x.hits || marketScore(x.title) > 0);
  const list = f === "all" ? items : relevant.filter((x) => (f === "top" ? true : x.region === f));
  const used = new Set(pfList);
  const top = (f === "all" ? [] : [...list].sort((a, b) => marketScore(b.title) - marketScore(a.title)))
    .filter((x) => !used.has(x))
    .slice(0, 5); // prettier-ignore
  top.forEach((x) => used.add(x));
  const rest = list.filter((x) => !used.has(x)).slice(0, 150);
  let i = 0;
  const rows = (arr, o) => arr.map((x) => line(x, ++i, now, o)).join("");
  const bar = (t, extra = "") =>
    `<div class="bb-bar"><b>${t}</b>${extra ? `<span>${extra}</span>` : ""}</div>`;
  const tabs = (region ? [["top", "Destaques"], ["all", "Todas"]] : [["top", "Destaques"], ["int", "Internacional"], ["br", "Brasil"], ["all", "Todas"]])
    .map(([k, l]) => `<button data-news-f="${k}" aria-pressed="${k === f}">${l}</button>`)
    .join(""); // prettier-ignore
  const count = Object.fromEntries(NEWS_TAGS.map(([k]) => [k, 0]));
  for (const x of n.items) for (const t of x.tags ?? []) count[t] = (count[t] ?? 0) + 1;
  const tagBar = `<div class="bb-tags" role="group" aria-label="Assuntos">${NEWS_TAGS.map(
    ([k, l]) =>
      `<button type="button" class="ntag-btn ntag-${k}" data-news-tag="${k}" aria-pressed="${on.includes(k)}">${esc(l)} <small>${count[k] ?? 0}</small></button>`,
  ).join(
    "",
  )}<span class="bb-tags-note">${hidden ? `${hidden} ocultas pelo filtro` : "nada oculto"}</span></div>`;
  const fresh = list.filter((x) => x.seen && now - x.seen < NEW_SECS).length;
  const pf = ctx.hasPortfolio
    ? `<details class="bb-sec news-sec" data-news-sec="pf" ${ctx.open?.pf !== false ? "open" : ""}><summary>${bar(`Sua carteira (${mine.length})`, "ticker em destaque = cita o ativo")}</summary>
        ${pfList.length ? `<ul class="bb-list">${rows(pfList, { hot: true })}</ul>` : `<p class="bb-empty">Nenhuma manchete de hoje cita seus ativos ou os temas que os movem.</p>`}</details>`
    : `<p class="bb-empty">Importe sua carteira para ver aqui, em destaque, as notícias que afetam suas posições.</p>`;
  return `<div class="bb">
    <div class="bb-cmd"><b class="bb-logo">${region === "br" ? "Notícias 🇧🇷" : region === "int" ? "Notícias 🌎" : "Notícias"}</b><span class="bb-seg seg" role="group" aria-label="Filtro">${tabs}</span>
      ${region === "br" ? "" : `<button type="button" class="btn ghost bb-wknd-btn" data-wknd="1" aria-pressed="${!!ctx.wknd}" title="Principais notícias do fechamento de sexta à abertura de segunda">🗓 Resumo do fds</button>`}
      <span class="bb-stat">${fresh ? `<span class="nnew-tag">+${fresh}</span> ` : ""}${list.length} manchetes · ${n.fetched_at ? HM.format(new Date(n.fetched_at)) : "–"} BRT</span></div>
    ${ctx.wknd ? weekendHtml(ctx.wknd, now) : ""}
    ${tagBar}
    ${pf}
    ${top.length ? `<div class="bb-sec">${bar("Mais relevantes")}<ul class="bb-list">${rows(top)}</ul></div>` : ""}
    <details class="bb-sec news-sec" data-news-sec="all" ${ctx.open?.all !== false ? "open" : ""}><summary>${bar(`Por horário (${rest.length})`, "mais novas primeiro")}</summary>
      ${rest.length ? `<ul class="bb-list">${rows(rest)}</ul>` : `<p class="bb-empty">Sem outras manchetes neste filtro.</p>`}</details>
    <div class="bb-foot"><span><b>Fontes</b> ${esc((n.sources ?? []).join(", "))}</span><span>Só a manchete e o link: a matéria abre no site de origem (alguns exigem assinatura). Renova a cada 2 min com a aba aberta; “novo” dura 20 min.</span></div>
  </div>`;
}
