// Mercado › Local: monitor do mercado brasileiro com o mesmo kit do Visão geral — preço ao vivo pelo canal de
// tempo real (pisca ao mudar), faixa rolante, manchetes, quadros arrastáveis/recolhíveis, "+" para incluir ativos,
// "!" de fora da curva e de notícia, mini-gráficos com dica, prévia pelo EWZ fora do pregão, setores, altas/baixas,
// amplitude e volatilidade. A macro do Brasil fica em Mercados › Onshore › Macro (br-views.js).
import { esc, num } from "./format.js";
import { tickAttr } from "./flash.js";
import { tapeHeld } from "./marquee.js";
import {
  BADGED,
  DASH_H,
  OUT,
  chgCell,
  fmtStamp,
  px,
  setSparkDates,
  spark,
  strengthHtml,
} from "./dash.js";
import { ADDABLE, ADD_HINT, headlinesHtml } from "./dash-extra.js";
import { layoutPanels, panelId } from "./dash-layout.js";
import { Z_ALERT, moved, newsBadge, newsByAsset, outlierBadge, zMove } from "./asset-news.js";
import {
  BR_PANELS,
  BR_SYMBOLS,
  BR_TAPE,
  b3Session,
  brBreadth,
  brMovers,
  brRegime,
  brSectors,
  buildClose,
  change,
  brExtQuotes,
  freshestQuotes,
  realizedVol,
  tick,
} from "./br.js";

const BR_STRENGTH_NOTE =
  "Intensidade (0 a 100, no sentido do regime): amplitude das razões de risco (30%), força da variação em desvios-padrão (25%) e direcionais das médias de 20 e 50 pregões (30%); sem VIX no Brasil (peso redistribuído). Escala: 0–19 muito fraca, 20–39 fraca, 40–59 moderada, 60–79 forte, 80+ muito forte.";

export const LAYOUT_KEY = "localLayout";

const sgn = (x) => (x > 0 ? "+" : x < 0 ? "−" : "");
const tone = (x) => (!Number.isFinite(x) || Math.abs(x) < 1e-9 ? "" : x > 0 ? "up" : "dn");
const pctTxt = (c) => (Number.isFinite(c) ? `${sgn(c)}${num(Math.abs(c) * 100, 2)}%` : "–");
const HHMM = new Intl.DateTimeFormat("pt-BR", { timeZone: "America/Sao_Paulo", hour: "2-digit", minute: "2-digit" }); // prettier-ignore

let Q = {};
let LASTD = {};
let NEWS = {};
let H1 = false;
let EXTRA = {};
let ADDING = null;

/** Linha pequena sob o nome: horário do preço (Brasília) e o pré/pós-mercado (nos ativos da B3, pelo espelho em NY). */
function stamp(sym) {
  const q = Q[sym];
  if (!q?.t) {
    const d = LASTD[sym];
    return d ? `<small class="ts">fech. ${d.slice(8, 10)}/${d.slice(5, 7)}</small>` : "";
  }
  let ext = "";
  if (q.xk && q.xp > 0) {
    const c = Number.isFinite(q.xc) ? ` ${pctTxt(q.xc)}` : "";
    const via = q.xv ? ` ~${esc(q.xv)}` : "";
    ext = `<small class="ts">${q.xk === "pre" ? "pré" : "pós"}${via} <span class="${tone(q.xc ?? 0)}"${tickAttr(`${sym}:x`, q.xp)}>${px(q.xp)}${c}</span> · ${HHMM.format(new Date(q.xt * 1000))}</small>`;
  }
  return `<small class="ts">${fmtStamp(q.t)}</small>${ext}`;
}

/** "!" de fora da curva (só no 1D) e de notícia do dia ligada ao ativo. */
function badge(sym, c, kind, s, label) {
  let out = "";
  const z = s && H1 ? zMove(s, c, kind) : null;
  if (z != null && Math.abs(z) >= Z_ALERT) {
    if (!OUT.some((o) => o.sym === sym)) OUT.push({ sym, label, z, c, kind, page: true }); // prettier-ignore
    out += outlierBadge(sym, z);
  }
  if (NEWS[sym]?.length && moved(c, kind)) {
    BADGED[sym] = { c, kind };
    out += newsBadge(sym);
  }
  return out ? `<span class="abadges">${out}</span>` : "";
}

const SYNTH = new Set(["IBOV_USD"]);
function row(close, h, sym, label, kind = "px") {
  const s = close[sym];
  if (!s) return "";
  const c = change(s, h, kind);
  const open = SYNTH.has(sym) ? "" : ` data-sr-open="${esc(sym)}" tabindex="0"`;
  const ts = SYNTH.has(sym) ? `<small class="ts">Ibovespa ÷ USD/BRL</small>` : stamp(sym);
  return `<tr${open}><td class="n"><span class="nline"><span class="nm">${esc(label)}</span>${badge(sym, c, kind, s, label)}</span>${ts}</td><td class="v"${tickAttr(sym, s.at(-1))}>${px(s.at(-1), kind)}</td>${chgCell(c, kind)}<td class="s">${spark(s, c, kind)}</td></tr>`;
}

/** Quadro com os ativos fixos + os que o usuário acrescentou ("+" no título, × para tirar). */
function quotePanel(title, rows, close, h) {
  const fixed = new Set(rows.map(([sym]) => sym));
  const body = rows.map(([s, l, k]) => row(close, h, s, l, k)).join("");
  const del = (x) => `<button class="dp-del" data-dash-del="${esc(title)}" data-dsym="${esc(x.sym)}" title="Tirar ${esc(x.label)} do quadro" aria-label="Tirar ${esc(x.label)}">×</button>`; // prettier-ignore
  const mine = (EXTRA[title] ?? [])
    .filter((x) => !fixed.has(x.sym))
    .map((x) => {
      const s = close[x.sym];
      if (!s) return `<tr class="dp-mine"><td class="n"><span class="nline"><span class="nm">${esc(x.label)}</span>${del(x)}</span></td><td class="v dim" colspan="3">${x.err ? "sem cotação" : "carregando…"}</td></tr>`; // prettier-ignore
      const c = change(s, h);
      return `<tr class="dp-mine" data-sr-open="${esc(x.sym)}" tabindex="0"><td class="n"><span class="nline"><span class="nm">${esc(x.label)}</span>${badge(x.sym, c, "px", s, x.label)}${del(x)}</span>${stamp(x.sym)}</td><td class="v"${tickAttr(x.sym, s.at(-1))}>${px(s.at(-1))}</td>${chgCell(c, "px")}<td class="s">${spark(s, c)}</td></tr>`; // prettier-ignore
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
  if (!body && !mine && !form) return "";
  return `<section class="dp"><h3>${esc(title)}${add}</h3>${form}<table>${body}${mine}</table></section>`;
}

function regimePanel(rg, close, hk) {
  const body = rg.items
    .map(
      (x) =>
        `<tr><td class="n">${esc(x.label)}</td><td class="v dim">${esc(x.b ? `${tick(x.a).replace(/^B:/, "")}/${tick(x.b).replace(/^B:/, "")}` : "1 ÷ USD/BRL")}</td>${chgCell(x.c, "px")}<td class="s">${spark(x.s, x.c)}</td></tr>`,
    )
    .join("");
  const vol = (sym, label) => {
    const v = realizedVol(close[sym]);
    if (!v) return "";
    const hi = v.pct >= 0.8;
    return `<tr><td class="n">${esc(label)}<small class="ts">percentil ${Math.round(v.pct * 100)} no último ano</small></td><td class="v">${num(v.v * 100, 1)}%</td><td class="c ${hi ? "dn" : v.pct <= 0.3 ? "up" : ""}">${hi ? "alta" : v.pct <= 0.3 ? "baixa" : "normal"}</td><td></td></tr>`;
  };
  const stress = rg.stress
    ? `<p class="dn-note"><b>Estresse:</b> dólar ${pctTxt(rg.usd)} e prefixados ${pctTxt(rg.jur)} contra o Tesouro Selic no mesmo horizonte (fuga de risco local).</p>`
    : "";
  return `<section class="dp"><h3>Regime Brasil (${esc(hk)})</h3><table>${body}${vol("^BVSP", "Vol. 20d do Ibovespa")}${vol("BRL=X", "Vol. 20d do dólar")}</table>${stress}${strengthHtml(rg.strength, BR_STRENGTH_NOTE)}</section>`;
}

function sectorsPanel(close, h) {
  const rows = brSectors(close, h);
  if (!rows.length) return "";
  const max = Math.max(...rows.map((r) => Math.abs(r.c)), 1e-9);
  const body = rows
    .map((r) => {
      const tip = r.members.map((m) => `${tick(m.sym)} ${pctTxt(m.c)}`).join(" · ");
      const top = r.members.slice(0, 3).map((m) => `${tick(m.sym)} ${pctTxt(m.c)}`).join(" · "); // prettier-ignore
      return `<tr title="${esc(tip)}"><td class="n"><span class="nm">${esc(r.label)}</span><small class="ts">${esc(top)}</small></td>${chgCell(r.c, "px")}<td class="bar"><i class="${tone(r.c)}" style="width:${((Math.abs(r.c) / max) * 100).toFixed(0)}%"></i></td></tr>`;
    })
    .join("");
  return `<section class="dp"><h3>Setores B3</h3><table>${body}</table><p class="dn-note">Cestas de peso igual com as maiores ações de cada setor; passe o mouse para ver todas.</p></section>`; // prettier-ignore
}

function moversPanel(close, h) {
  const m = brMovers(close, h);
  if (!m.n) return "";
  const line = (x) =>
    `<tr data-sr-open="${esc(x.sym)}" tabindex="0"><td class="n"><span class="nline"><span class="nm">${esc(tick(x.sym))}</span>${badge(x.sym, x.c, "px", close[x.sym], tick(x.sym))}</span>${stamp(x.sym)}</td><td class="v"${tickAttr(x.sym, x.p)}>${px(x.p)}</td>${chgCell(x.c, "px")}<td class="s">${spark(close[x.sym], x.c)}</td></tr>`;
  return `<section class="dp"><h3>Maiores altas e baixas</h3><table>${m.up.map(line).join("")}<tr><td colspan="4" class="dim" style="text-align:center">···</td></tr>${m.dn.map(line).join("")}</table><p class="dn-note">Entre ${m.n} ações acompanhadas (as maiores de cada setor).</p></section>`; // prettier-ignore
}

const hhmm = (t) => (t ? HHMM.format(new Date(t * 1000)) : "");
function newsPanel(items) {
  const now = Date.now() / 1000;
  const list = (items ?? [])
    .filter((it) => it.title && (!it.t || now - it.t <= 36 * 3600))
    .slice(0, 10);
  const body = list.length
    ? list
        .map(
          (it) =>
            `<tr data-news-pop="${esc(it.link ?? "")}" tabindex="0"><td class="n"><span class="nm" style="white-space:normal">${esc(it.title)}</span><small class="ts">${esc(hhmm(it.t))} · ${esc(it.source ?? "")}</small></td></tr>`,
        )
        .join("")
    : `<tr><td class="n dim">Carregando manchetes do Valor, InfoMoney, Money Times, Exame…</td></tr>`;
  return `<section class="dp"><h3>Notícias do Brasil</h3><table>${body}</table></section>`;
}

/** Faixa rolante: os ativos-chave + as posições brasileiras da carteira (EWZ, .SA ou do universo Local). */
function tape(close, h, rows) {
  const keys = BR_TAPE.map(([sym, label, kind = "px"]) => {
    const s = close[sym];
    if (!s) return "";
    const c = change(s, h, kind);
    return `<button class="tk" data-sr-open="${esc(sym)}"><span class="l">${esc(label)}</span><span class="v"${tickAttr(sym, s.at(-1))}>${px(s.at(-1), kind)}</span><span class="${tone(c ?? 0)}">${pctTxt(c)}</span></button>`;
  }).join("");
  const fixed = new Set(BR_TAPE.map(([s]) => s));
  const mine = brHoldings(rows)
    .filter((r) => !fixed.has(r.sym) && Number.isFinite(r.price))
    .map((r) => {
      const s = close[r.sym];
      const c = s?.length > 1 ? change(s, h) : r.dayPLPct;
      return `<button class="tk pf" data-sr-open="${esc(r.sym)}" title="Na sua carteira"><span class="l">● ${esc(tick(r.sym))}</span><span class="v"${tickAttr(r.sym, r.price)}>${px(r.price)}</span><span class="${tone(c ?? 0)}">${pctTxt(c)}</span></button>`;
    })
    .join("");
  return keys + mine;
}

const BR_SET = new Set(BR_SYMBOLS);
/** Posições da carteira ligadas ao Brasil. */
export const brHoldings = (rows) =>
  (rows ?? []).filter((r) => r.sym && (BR_SET.has(r.sym) || /\.SA$/.test(r.sym) || /^(EWZ|EWZS|BRF|FLBR|BRAZ)$/.test(r.sym))); // prettier-ignore

/**
 * ctx: { br: { hist, quotes, macro, errors }, live (cotações do canal de tempo real), horizon, news,
 *        valuation, extra, extraSeries, extraLive, adding }
 */
export function viewLocal(ctx) {
  const br = ctx.br ?? {};
  // o preço mais novo de cada ativo: canal de tempo real (15 s), busca própria ou a dos ativos acrescentados
  Q = freshestQuotes(br.quotes, ctx.live, ctx.extraLive);
  const ses = b3Session();
  Q = brExtQuotes(Q, ses.open);
  EXTRA = ctx.extra ?? {};
  ADDING = ctx.adding ?? null;
  const hist = { ...(ctx.extraSeries ?? {}), ...(br.hist ?? {}) };
  const built = buildClose(hist, Q);
  if (!built) {
    const err = br.errors?.hist;
    return `<div class="card empty">${err ? `Mercado brasileiro indisponível agora: ${esc(err)}.` : "Carregando o mercado brasileiro (B3, câmbio, juros e macro)…"}</div>`; // prettier-ignore
  }
  const { close, dates } = built;
  setSparkDates(dates);
  LASTD = Object.fromEntries(Object.entries(hist).map(([k, v]) => [k, v?.dates?.at(-1)]));
  const brNews = (ctx.news ?? []).filter((it) => it.region === "br");
  NEWS = newsByAsset(ctx.news);
  for (const k of Object.keys(BADGED)) delete BADGED[k];
  OUT.length = 0;
  const hk = ctx.horizon in DASH_H ? ctx.horizon : "1d";
  const h = DASH_H[hk];
  H1 = h === 1;
  const rg = brRegime(close, h);
  const bd = brBreadth(close, h);
  const m = br.macro;
  // grade antes do topo: os "!" de fora da curva são coletados ao desenhar as linhas
  const P = (i) => {
    const [title, rows] = BR_PANELS[i];
    return { id: panelId(title), html: quotePanel(title, rows, close, h) };
  };
  const items = [
    { id: "regime-brasil", html: regimePanel(rg, close, hk.toUpperCase()) },
    P(0),
    { id: "setores-b3", html: sectorsPanel(close, h) },
    { id: "altas-baixas", html: moversPanel(close, h) },
    P(2),
    P(3),
    P(1),
    P(4),
    { id: "noticias-brasil", html: newsPanel(brNews) },
  ];
  const grid = layoutPanels(items, LAYOUT_KEY);
  OUT.sort((a, b) => Math.abs(b.z) - Math.abs(a.z));

  const vtone = /on/i.test(rg.verdict) ? "up" : /off|Estresse/.test(rg.verdict) ? "dn" : "mid";
  const item = (sym, label, sub) => {
    const s = close[sym];
    if (!s) return "";
    const c = change(s, h);
    return `<button class="sb-item" data-sr-open="${esc(sym)}"><span class="l">${esc(label)}</span><b${tickAttr(`sb:${sym}`, s.at(-1))}>${px(s.at(-1))}</b><span class="${tone(c)}">${pctTxt(c)}${sub ? ` <span class="dim">${esc(sub)}</span>` : ""}</span></button>`;
  };
  const irf = change(close["IRFM11.SA"], h);
  // fora do pregão da B3: o EWZ no pré/pós de Nova York antecipa a abertura
  const ewz = Q.EWZ;
  const preview =
    !ses.open && H1 && ewz?.xk && Number.isFinite(ewz.xc)
      ? `<button class="sb-item" data-sr-open="EWZ"><span class="l">Prévia · EWZ ${ewz.xk === "pre" ? "pré" : "pós"}</span><b class="${tone(ewz.xc)}"${tickAttr("EWZ:x", ewz.xp)}>${pctTxt(ewz.xc)}</b><span class="dim">US$ ${px(ewz.xp)} · ${HHMM.format(new Date(ewz.xt * 1000))}</span></button>`
      : "";
  const mineBR = brHoldings(ctx.valuation?.rows);
  const wBR = mineBR.reduce((a, r) => a + (r.weight ?? 0), 0);
  const vBR = mineBR.reduce((a, r) => a + (r.value ?? 0), 0);
  const dayBR = mineBR.reduce((a, r) => a + (r.dayPL ?? 0), 0);
  const pf = mineBR.length
    ? `<button class="sb-item" data-tab="portfolio"><span class="l">Exposição Brasil</span><b>US$ ${num(vBR, 0)}</b><span class="${tone(dayBR)}">${num(wBR * 100, 1)}% da carteira${dayBR ? ` · ${dayBR > 0 ? "+" : "−"}US$ ${num(Math.abs(dayBR), 0)} hoje` : ""}</span></button>`
    : `<button class="sb-item" data-tab="portfolio"><span class="l">Exposição Brasil</span><b>–</b><span class="dim">sem EWZ ou ação da B3 na carteira</span></button>`;
  const outItem = H1
    ? `<button class="sb-item${OUT.length ? " out-alert" : ""}" data-outlier-list><span class="l">Fora da curva</span><b>${OUT.length ? `${OUT.length} ativo${OUT.length > 1 ? "s" : ""}` : "Nenhum"}</b><span class="dim">${OUT.length ? esc(OUT.slice(0, 3).map((o) => o.label).join(" · ")) : "variações dentro do normal"}</span></button>` // prettier-ignore
    : "";
  const hBtns = Object.keys(DASH_H)
    .map((k) => `<button data-dash-h="${k}" aria-pressed="${k === hk}">${k.toUpperCase()}</button>`)
    .join("");
  const bar = `<div class="dash-bar">
      <div class="sb-item verdict ${vtone}"><span class="l">Regime Brasil ${hk.toUpperCase()}</span><b>${esc(rg.verdict)}${rg.strength ? ` · ${esc(rg.strength.level)}` : ""}</b><span class="dim">${rg.strength ? `intensidade ${rg.strength.intensity}/100 · ` : ""}${rg.on}/${rg.n} razões de risco em alta</span></div>
      ${item("^BVSP", "Ibovespa")}
      ${item("BRL=X", "Dólar", "USD/BRL")}
      ${preview}
      ${irf == null ? "" : `<div class="sb-item"><span class="l">Juros (prefixados)</span><b class="${tone(irf)}">${irf > 0 ? "Caindo" : irf < 0 ? "Subindo" : "Estáveis"}</b><span class="dim">IRFM11 ${pctTxt(irf)}</span></div>`}
      <div class="sb-item"><span class="l">B3</span><b class="${ses.open ? "up" : ""}">${esc(ses.label)}</b><span class="dim">${esc(ses.hhmm)} Brasília · fecha ${esc(ses.close)}</span></div>
      ${pf}
      ${outItem}
      ${bd.up == null ? "" : `<div class="sb-item"><span class="l">Amplitude</span><b>${Math.round(bd.up * 100)}% em alta</b><span class="dim">${bd.above == null ? "" : `${Math.round(bd.above * 100)}% acima da MM50`}</span></div>`}
      ${m?.overall == null ? "" : `<button class="sb-item" data-tab="brmacro"><span class="l">Macro BR</span><b class="${m.overall > 15 ? "up" : m.overall < -15 ? "dn" : ""}">${m.overall > 0 ? "+" : ""}${num(m.overall, 0)}</b><span class="dim">nota de −100 a +100 · abrir</span></button>`}
      <span class="seg dash-h" role="group" aria-label="Horizonte">${hBtns}</span>
    </div>`;
  const tapeItems = tape(close, h, ctx.valuation?.rows);
  const errs = [br.errors?.quotes].filter(Boolean);
  return `<div class="dash">
    ${bar}
    <div class="tape${tapeHeld() ? " held" : ""}" data-tape title="Clique para pausar ou retomar"><div class="tape-track"><div class="tape-grp">${tapeItems}</div><div class="tape-grp" aria-hidden="true" inert>${tapeItems}</div></div></div>
    ${headlinesHtml(brNews)}
    <div class="dash-grid" data-layout="${LAYOUT_KEY}">${grid}</div>
    <p class="dn-note">Macro do Brasil (BCB e Focus), notícias, agenda e fluxo da B3: sub-abas Macro, Notícias, Agenda e Fluxo deste lado (Onshore). <button class="linkish" data-tab="brmacro">Abrir a Macro Onshore</button></p>
    <p class="dn-note">Clique numa linha para abrir o ativo. Preços do Yahoo pelo canal de tempo real (a cada 15 s, piscam ao mudar; B3 com ~15 min de atraso na fonte; ADRs e ETFs de NY com pré/pós-mercado; fora do pregão da B3, o Ibovespa e as ações com ADR mostram o pré/pós aproximado pelo espelho em NY, marcado com ~ e o ticker usado). Arraste um quadro pelo título para mudar de lugar; "–" recolhe; "+" inclui ativo. <button class="linkish" data-dash-reset="${LAYOUT_KEY}">Restaurar layout</button> Regime: razões que sobem com apetite a risco no Brasil (bolsa × Tesouro Selic, small × large, real, prefixados, Brasil × emergentes, doméstico × exportadoras, cíclico × defensivo); Risk-on com 70% ou mais em alta, Risk-off com 30% ou menos. Horário da B3 sem feriados. ${errs.length ? `Falhas: ${esc(errs.join("; "))}. ` : ""}Material educacional; não é recomendação de investimento.</p>
  </div>`;
}
