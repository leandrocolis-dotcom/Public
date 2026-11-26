// Painel comum do detalhe de qualquer ativo, num balão só: cabeçalho (opcional) → gráfico → janelas com a
// rentabilidade de cada uma → faixa do dia e de 52 semanas → liquidez. Usado em Painel, Fluxo, Carteira, Análise e busca.
import { esc, num, pct } from "./format.js";
import { hq } from "./help.js";
import { drawerChart, sma } from "./charts.js";
import { fetchJSON } from "./net.js";
import { barsKey, getBars, peekBars } from "./bars-hub.js";
import { pal } from "./theme.js";
import { state } from "./state.js";
import { mkt } from "./market.js";
import { fetchQuotes, hubQuote } from "./quote-hub.js";

// 1D e 5D: barras de 5 min (intraday), com o último preço ao vivo; o resto: fechamentos diários
export const INTRA = { "1D": 1, "5D": 5 };
export const WINDOWS = [["1D", 1], ["5D", 5], ["1M", 21], ["3M", 63], ["6M", 126], ["1A", 252], ["2A", 504], ["5A", 1260]]; // prettier-ignore
let current = null; // painel aberto agora (ignora respostas de um painel já fechado)
let bound = false;
let tick = null; // atualização automática do 1D/5D enquanto o painel está aberto
const long = new Map(); // histórico de 5 anos buscado sob demanda: sym -> { dates, close } | Promise

/** Posição (0–1) de x entre lo e hi. */
export const rangePos = (lo, hi, x) =>
  [lo, hi, x].every(Number.isFinite) && hi > lo
    ? Math.min(1, Math.max(0, (x - lo) / (hi - lo)))
    : null;

/** Liquidez pelo volume financeiro médio diário (US$): alta ≥ 100 mi, média ≥ 10 mi, baixa abaixo. */
export function liquidityOf(price, avgVol) {
  if (!(price > 0) || !(avgVol > 0)) return null;
  const dollars = price * avgVol;
  return { dollars, label: dollars >= 1e8 ? "Alta" : dollars >= 1e7 ? "Média" : "Baixa" };
}

const big = (x) =>
  !Number.isFinite(x)
    ? "–"
    : x >= 1e12
      ? `${num(x / 1e12, 2)} tri`
      : x >= 1e9
        ? `${num(x / 1e9, 2)} bi`
        : x >= 1e6
          ? `${num(x / 1e6, 1)} mi`
          : x >= 1e3
            ? `${num(x / 1e3, 1)} mil`
            : num(x, 0);

function rangeBar(title, lo, hi, x, d) {
  const p = rangePos(lo, hi, x);
  if (p === null)
    return `<div class="ap-range"><div class="lab">${title}</div><div class="muted">sem dado</div></div>`;
  return `<div class="ap-range"><div class="lab">${title}</div>
    <div style="position:relative;height:8px;border-radius:4px;background:linear-gradient(90deg,var(--sell),var(--wait),var(--buy));opacity:.85;margin:10px 0 4px">
      <div title="atual" style="position:absolute;left:calc(${(p * 100).toFixed(1)}% - 2px);top:-5px;width:4px;height:18px;border-radius:2px;background:var(--text)"></div></div>
    <div style="display:flex;justify-content:space-between;font-family:var(--mono);font-size:.8rem"><span>${num(lo, d)}</span><b>${num(x, d)}</b><span>${num(hi, d)}</span></div>
    <div class="muted" style="font-size:.75rem;display:flex;justify-content:space-between"><span>${pct(x / lo - 1)} da mínima</span><span>${pct(x / hi - 1)} da máxima</span></div></div>`;
}

const mean = (a) => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : null);

/** Cotação de reserva a partir das barras diárias (ativo fora do universo ao vivo, ex.: ticker colado na Análise). */
export function quoteFromBars(bars, marketCap = null) {
  const n = bars?.c?.length ?? 0;
  if (n < 2) return null;
  const y = (a) => a.slice(-252).filter(Number.isFinite);
  const vol = (k) => mean(bars.v.slice(-k).filter((x) => x > 0));
  return {
    fb: true,
    dh: bars.h.at(-1),
    dl: bars.l.at(-1),
    h52: n > 200 ? Math.max(...y(bars.h)) : null,
    l52: n > 200 ? Math.min(...y(bars.l)) : null,
    v: bars.v.at(-1) > 0 ? bars.v.at(-1) : null,
    av: vol(10),
    av3: vol(63),
    mc: marketCap,
  };
}

/**
 * Rentabilidade de cada janela pelos fechamentos diários (último ÷ fechamento de n pregões atrás − 1).
 * live = cotação ao vivo { p, pc }: no 1D usa preço ÷ fechamento anterior. Janela sem histórico: null. Pura.
 */
export function windowReturns(close, live = null) {
  const c = (close ?? []).filter(Number.isFinite);
  const last = Number.isFinite(live?.p) && live.p > 0 ? live.p : c.at(-1);
  const out = {};
  for (const [l, n] of WINDOWS) {
    if (l === "1D" && live?.p > 0 && live?.pc > 0) out[l] = live.p / live.pc - 1;
    else {
      // "5 anos" da fonte costuma vir com alguns pregões a menos: aceita até 3% de falta (usa o 1º preço)
      const base = c.length > n ? c.at(-1 - n) : c.length >= n * 0.97 ? c[0] : null;
      out[l] = base > 0 && last > 0 ? last / base - 1 : null;
    }
  }
  return out;
}

/**
 * Preço ao vivo ou não. Ao vivo = pregão regular aberto e cotação com menos de 20 min. Senão, o horário do
 * último preço (da cotação ou do último ponto do gráfico). Pura.
 */
export function priceStatus(q, lastLabel = null, nowSec = Date.now() / 1000) {
  if (q?.ms === "REGULAR" && Number.isFinite(q.t) && nowSec - q.t < 20 * 60 && q.p > 0)
    return { live: true, text: "live" };
  if (Number.isFinite(q?.t) && q.t > 0) {
    const when = new Date(q.t * 1000).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }); // prettier-ignore
    return { live: false, text: `Último preço: ${when}` };
  }
  if (lastLabel) {
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(lastLabel);
    return { live: false, text: `Último preço: ${m ? `${m[3]}/${m[2]}/${m[1]}` : lastLabel}` };
  }
  return { live: false, text: "" };
}

const liveHtml = (st) =>
  st.live
    ? `<span class="ap-live on"><i></i>live</span>`
    : `<span class="ap-live">${esc(st.text)}</span>`;

const retHtml = (r) => (r === null || r === undefined ? "–" : pct(r, Math.abs(r) >= 1 ? 0 : 1));
const retCls = (r) => (r === null || r === undefined ? "" : r >= 0 ? "pos" : "neg");

/** HTML do painel (um balão só). local = { dates, close } já no app (pode ser curto); fb = cotação de reserva; head = topo do balão. */
export function assetPanelHtml(sym, local, fb = null, head = "") {
  const live = quoteOf(sym) ?? {};
  // o ao vivo manda; a reserva só preenche o que o ao vivo não trouxe
  const q = { ...live };
  for (const [key, v] of Object.entries(fb ?? {}))
    if (q[key] === undefined || q[key] === null) q[key] = v;
  const c = local?.close ?? [];
  const price = q.p ?? c.at(-1) ?? null;
  const d = price !== null && price < 10 ? 4 : 2;
  const last252 = c.slice(-252);
  const h52 = q.h52 ?? (last252.length > 200 ? Math.max(...last252) : null);
  const l52 = q.l52 ?? (last252.length > 200 ? Math.min(...last252) : null);
  const avg = q.av3 ?? q.av ?? null;
  // índice (^), futuro/moeda (=): volume não é dinheiro negociado num papel, então sem giro nem nota de liquidez
  const tradable = !/^\^|=/.test(sym);
  const liq = tradable ? liquidityOf(price, avg) : null;
  const rel = q.v > 0 && q.av > 0 ? q.v / q.av : null;
  const k = (l, v) => `<div><span>${l}</span><b>${v}</b></div>`;
  const hasVol = avg > 0 || q.v > 0;
  const rets = windowReturns(c, live.p > 0 ? live : null);
  const st = priceStatus(live, local?.dates?.at(-1));
  const wins = WINDOWS.map(
    ([l]) =>
      `<button data-ap-win="${l}" aria-pressed="${l === "1A"}"><span>${l}</span><b class="${retCls(rets[l])}" data-ap-ret="${l}">${retHtml(rets[l])}</b></button>`,
  ).join("");
  return `<div class="card ap" data-ap="${esc(sym)}">
    ${head ? `<div class="ap-head">${head}</div>` : ""}
    <div class="ap-price" id="apPrice" data-sym="${esc(sym)}">${priceHtml(price, q.pc ?? (c.length > 1 ? c.at(-2) : null))}</div>
    <div class="ap-chart-h"><h3 style="margin:0">Histórico de preço</h3><span id="apLive">${liveHtml(st)}</span></div>
    <div class="ap-legend" id="apLegend"></div>
    <div class="chart-box" style="height:280px;margin-top:4px"><canvas id="apChart"></canvas></div>
    <div class="ap-wins" role="group" aria-label="Janela e rentabilidade">${wins}</div>
    <p class="note" id="apNote">Com médias de 50 e 200 dias.</p>
    <div class="ap-sec grid" style="grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:18px">
      ${rangeBar(live.dl == null && q.fb ? "Faixa do último pregão" : "Faixa do dia", q.dl, q.dh, price, d)}
      ${rangeBar(`Faixa de 52 semanas ${hq("range52", { sym, price, h52, l52 })}`, l52, h52, price, d)}
    </div>
    <div class="ap-sec"><h3>Liquidez</h3>
    ${
      hasVol
        ? `<div class="kv">${k("Volume hoje", big(q.v))}${k("Média 10 dias", big(q.av))}${k("Média 3 meses", big(q.av3))}${k("Volume hoje vs. média", rel === null ? "–" : `${num(rel, 2)}x`)}${tradable ? `${k("Giro médio diário", liq ? `US$ ${big(liq.dollars)}` : "–")}${k("Liquidez", liq ? `<span class="tag ${liq.label === "Alta" ? "buy" : liq.label === "Média" ? "wait" : "sell"}">${liq.label}</span>` : "–")}` : ""}${q.mc ? k("Valor de mercado", `US$ ${big(q.mc)}`) : ""}</div>
           <p class="note">${tradable ? "" : "Índice, futuro ou moeda: o volume mostrado é o agregado do mercado, não dá para comprar o índice em si. Para liquidez, veja o ETF correspondente. "}Giro = preço × volume médio de 3 meses. Alta ≥ US$ 100 mi/dia, média ≥ US$ 10 mi, baixa abaixo: pode ter spread largo e ordens grandes mexem no preço. Volume de hoje é parcial durante o pregão.</p>`
        : `<p class="muted">Sem volume negociado (índice, taxa ou moeda).</p>`
    }</div>
  </div>`;
}

/** Atualiza a rentabilidade de cada janela (depois de chegar o histórico longo). */
function paintReturns(sym, close) {
  const live = quoteOf(sym);
  const rets = windowReturns(close, live?.p > 0 ? live : null);
  for (const el of document.querySelectorAll("#drawerBody [data-ap-ret]")) {
    const r = rets[el.dataset.apRet];
    el.textContent = retHtml(r);
    el.className = retCls(r);
  }
}

/** Preço grande e variação do dia (sobre o fechamento anterior), no topo do painel. */
function priceHtml(p, pc) {
  if (!(p > 0)) return `<span class="ap-px muted">–</span>`;
  const ch = pc > 0 ? p / pc - 1 : null;
  const d = p < 10 ? 4 : 2;
  return `<span class="ap-px">${num(p, d)}</span>${ch === null ? "" : `<span class="ap-chg ${ch >= 0 ? "pos" : "neg"}">${ch >= 0 ? "▲" : "▼"} ${pct(ch, 2)}${pc > 0 ? ` <span class="muted">(${p - pc >= 0 ? "+" : "−"}${num(Math.abs(p - pc), d)})</span>` : ""}</span>`}`; // prettier-ignore
}

/**
 * Atualiza o preço grande. Com cotação, SEMPRE a cotação (o mesmo preço e variação das tabelas); o último ponto
 * do intradiário (p, pc) só entra quando o ativo não tem cotação nenhuma.
 */
function paintPrice(sym, p = null, pc = null) {
  const el = document.getElementById("apPrice");
  if (!el || el.dataset.sym !== sym) return;
  const q = quoteOf(sym);
  const price = q?.p > 0 ? q.p : p;
  const prev = q?.p > 0 ? (q.pc ?? null) : pc;
  if (price > 0) {
    el.innerHTML = priceHtml(price, prev);
    paintReturns1D(sym);
  }
}

/** Botão 1D = a mesma variação do preço grande (cotação). */
function paintReturns1D(sym) {
  const q = quoteOf(sym);
  const el = document.querySelector('#drawerBody [data-ap-ret="1D"]');
  if (!el || !(q?.p > 0 && q?.pc > 0)) return;
  const r = q.p / q.pc - 1;
  el.textContent = retHtml(r);
  el.className = retCls(r);
}

/**
 * Cotação ÚNICA do painel: a mesma que as tabelas usam (canal ao vivo do app, depois mercado inteiro, depois a
 * central de cotações). Preço, variação do dia, janela 1D e linha "Fechamento anterior" saem todos dela.
 */
export const quoteOf = (sym) =>
  state.live?.quotes?.[sym] ?? mkt.quotes?.[sym] ?? hubQuote(sym) ?? null;

/** Selo live / horário do último preço. */
function paintLive(sym, lastLabel) {
  const el = document.getElementById("apLive");
  if (el) el.innerHTML = liveHtml(priceStatus(quoteOf(sym), lastLabel));
}

/** Legenda do gráfico com cor de cada linha e o "?" das médias. items = [label, cor, chaveDeAjuda?, ctx?]. */
function paintLegend(items) {
  const el = document.getElementById("apLegend");
  if (!el) return;
  el.innerHTML = items
    .map(
      ([l, color, key, ctx, dash]) =>
        `<span><i style="border-top:2px ${dash ? "dashed" : "solid"} ${color}"></i>${esc(l)}${key ? hq(key, ctx) : ""}</span>`,
    )
    .join("");
}

const HM = (gmt) => (t) => new Date((t + (gmt ?? 0)) * 1000).toISOString().slice(11, 16);
const DHM = (gmt) => (t) => {
  const iso = new Date((t + (gmt ?? 0)) * 1000).toISOString();
  return `${iso.slice(8, 10)}/${iso.slice(5, 7)} ${iso.slice(11, 16)}`;
};

/**
 * Série intraday da janela: últimos `days` pregões das barras de 5 min, com o preço ao vivo no fim
 * (se for mais novo que a última barra). Horário do pregão (fuso da bolsa). Função pura (testada).
 */
export function intradaySeries(j, days, live = null, nowSec = Date.now() / 1000) {
  const b = j?.bars;
  if (!b?.t?.length) return null;
  const gmt = j.gmtoffset ?? 0;
  const day = (t) => Math.floor((t + gmt) / 86400);
  const keep = [...new Set(b.t.map(day))].slice(-days);
  // 1D com pré/pós: como no Investing, entra também o pós-mercado da véspera (a noite antes do pré de hoje)
  const eve = days === 1 && b.s ? [...new Set(b.t.map(day))].at(-2) : null;
  const idx = b.t
    .map((t, i) => i)
    .filter((i) => keep.includes(day(b.t[i])) || (eve != null && day(b.t[i]) === eve && b.s[i] === "post")); // prettier-ignore
  const t = idx.map((i) => b.t[i]);
  const c = idx.map((i) => b.c[i]);
  const sess = b.s ? idx.map((i) => b.s[i]) : null;
  if (
    Number.isFinite(live?.p) &&
    live.p > 0 &&
    nowSec - t.at(-1) > 60 &&
    day(nowSec) === day(t.at(-1))
  ) {
    t.push(Math.floor(nowSec));
    c.push(live.p);
    sess?.push(sess.at(-1));
  }
  // referência: fechamento regular anterior ao 1º pregão mostrado (no 1D = fechamento de ontem)
  const first = b.t.findIndex((x) => day(x) === keep[0]);
  let prev = first - 1; // o pós da véspera mostrado não é referência: volta até o último fechamento regular
  while (prev >= 0 && b.s && b.s[prev] !== "reg") prev--;
  // 1D com cotação: a linha "Fechamento anterior" é o fechamento oficial da cotação (o mesmo das tabelas)
  const ref =
    days === 1 && live?.pc > 0
      ? live.pc
      : prev >= 0
        ? b.c[prev]
        : days === 1
          ? (j.prev_close ?? c[0])
          : c[0];
  const fmt = days === 1 ? HM(gmt) : DHM(gmt);
  return {
    labels: t.map(fmt),
    close: c,
    sess,
    ref,
    live: c.length > idx.length,
    days: keep.length,
  };
}

// barras de 5 min pela central de barras (a mesma do radar técnico): revalida na virada da barra; o preço ao
// vivo entra no fim da série (intradaySeries). Erro: fica com as barras anteriores.
function loadIntra(sym, force = false) {
  const key = barsKey({ symbol: sym, prepost: true });
  return getBars(key, { force }).catch(() => peekBars(key)?.data ?? null);
}

const EXT_COLOR = (k) => (k === "pre" ? pal().info : k === "post" ? pal().violet : undefined);

function drawIntra(sym, j, win) {
  const s = intradaySeries(j, INTRA[win], quoteOf(sym));
  const note = document.getElementById("apNote");
  if (!s) {
    if (note) note.textContent = `Sem barras intraday de ${sym} agora. Tente de novo em instantes.`;
    return;
  }
  const up = s.close.at(-1) >= s.ref;
  drawerChart("apChart", {
    type: "line",
    data: { labels: s.labels, datasets: [
      { label: sym, data: s.close, borderColor: up ? pal().buy : pal().sell, borderWidth: 1.6, pointRadius: 0,
        // pré-mercado em azul, pós-mercado em violeta (tracejados); pregão regular na cor da variação
        segment: s.sess ? { borderColor: (x) => EXT_COLOR(s.sess[x.p1DataIndex]), borderDash: (x) => (s.sess[x.p1DataIndex] !== "reg" ? [3, 2] : undefined) } : undefined },
      { label: win === "1D" ? "Fechamento anterior" : "Início da janela", data: s.close.map(() => s.ref), borderColor: pal().text, borderWidth: 1, borderDash: [4, 4], pointRadius: 0 },
    ] }, // prettier-ignore
    options: {
      interaction: { mode: "index", intersect: false },
      plugins: { legend: { display: false } },
      scales: { x: { ticks: { maxTicksLimit: 6 } } },
    },
  });
  paintLegend([
    [sym, up ? pal().buy : pal().sell],
    [win === "1D" ? "Fechamento anterior" : "Início da janela", pal().text, null, null, true],
  ]);
  paintLive(sym, s.labels.at(-1));
  if (win === "1D" && s.close?.length) paintPrice(sym, s.close.at(-1), s.ref);
  if (note) {
    const open = state.live?.market_state === "REGULAR";
    note.textContent = `Barras de 5 min${s.sess?.some((k) => k !== "reg") ? ` · pré-mercado em azul, pós em violeta (tracejado)${win === "1D" ? ", desde o pós da véspera" : ""}` : ""}${win === "5D" ? ` (${s.days} pregões)` : ""}${s.live ? " + preço ao vivo" : ""}${open ? " · atualiza a cada minuto" : ""}. Horário da bolsa.`;
  }
}

function draw(sym, data, win, extra) {
  const n = WINDOWS.find(([l]) => l === win)[1];
  const c = data.close;
  const from = Math.max(0, c.length - n);
  const s50 = sma(c, 50).slice(from);
  const s200 = sma(c, 200).slice(from);
  drawerChart("apChart", {
    type: "line",
    data: { labels: data.dates.slice(from), datasets: [
      { label: sym, data: c.slice(from), borderColor: pal().text, borderWidth: 1.6, pointRadius: 0 },
      { label: "MM50", data: s50, borderColor: pal().info, borderWidth: 1.1, pointRadius: 0 },
      { label: "MM200", data: s200, borderColor: pal().wait, borderWidth: 1.1, pointRadius: 0 },
      ...(extra?.avg ? [{ label: "Preço médio", data: c.slice(from).map(() => extra.avg), borderColor: pal().sell, borderWidth: 1, borderDash: [4, 4], pointRadius: 0 }] : []),
    ] }, // prettier-ignore
    options: {
      interaction: { mode: "index", intersect: false },
      plugins: { legend: { display: false } },
      scales: { x: { ticks: { maxTicksLimit: 6 } } },
    },
  });
  const price = c.at(-1);
  const ma50 = s50.at(-1);
  const ma200 = s200.at(-1);
  paintLegend([
    [sym, pal().text],
    ["MM50", pal().info, "ma50", { sym, price, ma50, ma200 }],
    ["MM200", pal().wait, "ma200", { sym, price, ma50, ma200 }],
    ...(extra?.avg ? [["Preço médio", pal().sell, null, null, true]] : []),
  ]);
  paintLive(sym, data.dates.at(-1));
  const note = document.getElementById("apNote");
  if (note)
    note.textContent = `${c.length - from} pregões${c.length < n ? ` (histórico disponível: ${c.length})` : ""}. Rentabilidade de cada janela = último preço ÷ preço no início da janela.`;
}

/** Busca 5 anos (uma vez por ativo) quando a janela pedida é maior que o histórico local. */
async function longHistory(sym) {
  if (!long.has(sym))
    long.set(
      sym,
      fetchJSON(`api/history?symbols=${encodeURIComponent(sym)}&range=5y`)
        .then((j) => j.series?.[sym] ?? null)
        .catch(() => null),
    );
  return long.get(sym);
}

/** Redesenha o gráfico do painel aberto (o sistema pode apagar o canvas com o app em segundo plano). */
export function redrawAssetPanel() {
  if (current?.go && current.win && document.getElementById("apChart")) current.go(current.win);
}

/** Desenha o gráfico e liga os botões de janela. Chamar no `after` do openDrawer. */
let priceTick = null;
export function mountAssetPanel(sym, local, extra = {}) {
  let data = local?.close?.length ? local : null;
  const root = document.getElementById("drawerBody");
  const token = {};
  current = token;
  const go = async (win) => {
    token.win = win; // só a última janela pedida desenha (cliques rápidos não trocam a ordem)
    root
      ?.querySelectorAll("[data-ap-win]")
      .forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.apWin === win)));
    clearInterval(tick);
    tick = null;
    if (INTRA[win]) {
      const j = await loadIntra(sym);
      if (current !== token || token.win !== win || !document.getElementById("apChart")) return;
      drawIntra(sym, j, win);
      // dia ao vivo: redesenha a cada minuto com o preço ao vivo; as barras renovam na virada (central de barras)
      tick = setInterval(async () => {
        if (current !== token || token.win !== win || !document.getElementById("apChart"))
          return clearInterval(tick);
        if (document.hidden) return;
        drawIntra(sym, await loadIntra(sym), win);
      }, 60_000);
      return;
    }
    const need = WINDOWS.find(([l]) => l === win)[1];
    if (!data || data.close.length < need + 1) {
      const lh =
        long.get(sym) && !(long.get(sym) instanceof Promise)
          ? long.get(sym)
          : await longHistory(sym);
      if (lh?.close?.length > (data?.close.length ?? 0)) data = lh;
    }
    if (current !== token || token.win !== win || !document.getElementById("apChart")) return;
    if (data?.close?.length > 1) draw(sym, data, win, extra);
    else {
      const note = document.getElementById("apNote");
      if (note)
        note.textContent = `Sem histórico de preços disponível para ${sym} agora. Tente Recarregar em instantes.`;
    }
  };
  current = token;
  token.go = go;
  if (!bound) {
    bound = true;
    document.addEventListener("click", (e) => {
      const b = e.target.closest("[data-ap-win]");
      if (b) current?.go?.(b.dataset.apWin);
    });
  }
  go("1A");
  // preço grande ao vivo: a cada 15 s lê a cotação do app; quem não está em nenhuma lista busca a sua a cada minuto
  clearInterval(priceTick);
  let n = 0;
  const pt = async () => {
    if (current !== token || !document.getElementById("apPrice")) return clearInterval(priceTick);
    if (document.hidden) return;
    const has = state.live?.quotes?.[sym] ?? mkt.quotes[sym];
    if (!has && n++ % 4 === 0) await fetchQuotes([sym], { id: "panel", bg: false });
    paintPrice(sym);
  };
  pt();
  priceTick = setInterval(pt, 15_000);
  // rentabilidade de todas as janelas (até 5A): busca o histórico longo se o local for curto
  if (!data || data.close.length < 1261)
    longHistory(sym).then((lh) => {
      if (current !== token || !lh?.close?.length) return;
      if (lh.close.length > (data?.close.length ?? 0)) data = lh;
      paintReturns(sym, data.close);
    });
}
