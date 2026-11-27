// Carteira › Performance: retorno do exterior por janela, com curva, queda, barras diárias, mapa mensal e métricas
// (motor em assets/perf.js). BTG oficial onde existe; carteira do dia × fechamentos do Yahoo no resto; hoje ao vivo.
import {
  WINDOWS,
  WINDOW_LABEL,
  appPoints,
  btgPoints,
  buildSeries,
  livePoint,
  monthGrid,
  snapsFrom,
  windowStats,
} from "./perf.js";
import { withManual } from "./btg.js";
import { quoteOf } from "./asset-pop.js";
import { fetchJSON } from "./net.js";
import { esc, num } from "./format.js";
import { hooks, savePrefs, state } from "./state.js";

const fin = Number.isFinite;
const sgn = (x) => (x > 0 ? "+" : x < 0 ? "−" : "");
const sPct = (x, d = 1) => (fin(x) ? `${sgn(x)}${num(Math.abs(x) * 100, d)}%` : "–");
const tone = (x) => (!fin(x) || Math.abs(x) < 1e-9 ? "" : x > 0 ? "up" : "down");
const tip = (s) => `title="${esc(s)}"`;
const brDate = (d) => (d ? d.split("-").reverse().join("/") : "–");
const BENCH = "QQQ";

const T = {
  ret: "Retorno da carteira do exterior na janela, sem aportes e saques (retorno ponderado no tempo).",
  vs: "Diferença para a referência na mesma janela: Nasdaq nos dados do BTG, QQQ (Nasdaq-100) nos dias calculados pelo app.",
  ann: "Retorno da janela levado a 1 ano (só com 60 dias ou mais).",
  vol: "Volatilidade anualizada: desvio dos retornos diários × √252. Só dias com retorno diário.",
  mdd: "Queda máxima: a maior perda do topo ao fundo dentro da janela.",
  sharpe: "Retorno anualizado ÷ volatilidade anualizada, sem descontar juro livre de risco.",
  best: "Melhor e pior dia da janela.",
  up: "Fração dos dias com retorno positivo.",
  src: "BTG = rentabilidade oficial gravada da corretora. App = carteira de cada dia (fotos diárias do BTG + ajustes ✎) × fechamentos do Yahoo; compras e vendas no meio do dia não entram. Hoje = carteira atual a preço ao vivo contra o fechamento anterior. Onde as duas existem vale o BTG.",
  gap: "Dias sem dado: sem retorno do BTG e sem foto da carteira. Contam como zero na curva.",
}; // prettier-ignore

let loading = false;
/** Fechamentos diários (1 ano) dos ativos das fotos + a referência, uma vez por sessão. */
function ensureCloses(syms) {
  const need = [...new Set([...syms, BENCH])].sort().join(",");
  if (state.perfCloses?.key === need || loading) return state.perfCloses?.series ?? null;
  loading = true;
  fetchJSON(`api/history?symbols=${encodeURIComponent(need)}`, { bg: true })
    .then((r) => (state.perfCloses = { key: need, series: r?.series ?? {} }))
    .catch(() => (state.perfCloses = { key: need, series: {} }))
    .finally(() => {
      loading = false;
      hooks.render();
    });
  return null;
}

/** Curva base 100 (carteira cheia, referência fina) e a queda embaixo, em SVG. */
function curveSvg(curve, w = 640, h = 200) {
  if (curve.length < 2) return "";
  const vals = curve.flatMap((p) => [p.v, p.b]).filter(fin);
  const lo = Math.min(...vals, 100);
  const hi = Math.max(...vals, 100);
  const pad = 6;
  const x = (i) => pad + (i * (w - 2 * pad)) / (curve.length - 1);
  const y = (v) => pad + ((hi - v) * (h - 2 * pad)) / (hi - lo || 1);
  const line = (k) => curve.map((p, i) => (fin(p[k]) ? `${x(i).toFixed(1)},${y(p[k]).toFixed(1)}` : null)).filter(Boolean).join(" "); // prettier-ignore
  const ddLo = Math.min(...curve.map((p) => p.dd), -0.001);
  const dh = 64;
  const dy = (v) => (v / ddLo) * (dh - 4);
  const area = `0,0 ${curve.map((p, i) => `${x(i).toFixed(1)},${dy(p.dd).toFixed(1)}`).join(" ")} ${w - pad},0`;
  const last = curve.at(-1);
  return `<figure class="pp-fig"><svg viewBox="0 0 ${w} ${h}" preserveAspectRatio="none" role="img" aria-label="Curva base 100 de ${brDate(curve[0].day)} a ${brDate(last.day)}">
    <line class="pp-base" x1="${pad}" x2="${w - pad}" y1="${y(100).toFixed(1)}" y2="${y(100).toFixed(1)}"/>
    ${line("b") ? `<polyline class="pp-bench" points="${line("b")}"/>` : ""}
    <polyline class="pp-line" points="${line("v")}"/>
  </svg>
  <svg class="pp-dd" viewBox="0 0 ${w} ${dh}" preserveAspectRatio="none" role="img" aria-label="Queda desde o topo, mínima ${sPct(ddLo)}" ${tip(T.mdd)}><polygon points="${area}"/></svg>
  <figcaption><span>${brDate(curve[0].day)}</span><span class="pp-leg"><i class="pf"></i>Carteira <i class="bm"></i>Nasdaq/QQQ <i class="dd"></i>Queda</span><span>${brDate(last.day)}</span></figcaption></figure>`; // prettier-ignore
}

/** Barras dos retornos diários da janela (até 66), verde/vermelho. */
function barsSvg(curve, pts, w = 640, h = 90) {
  const d = pts.filter((p) => p.kind === "d").slice(-66);
  if (d.length < 2) return "";
  const m = Math.max(...d.map((p) => Math.abs(p.r)), 0.001);
  const bw = (w - 8) / d.length;
  const mid = h / 2;
  const bars = d
    .map((p, i) => {
      const bh = (Math.abs(p.r) / m) * (mid - 2);
      return `<rect class="${p.r >= 0 ? "up" : "dn"}" x="${(4 + i * bw + bw * 0.15).toFixed(1)}" y="${(p.r >= 0 ? mid - bh : mid).toFixed(1)}" width="${(bw * 0.7).toFixed(1)}" height="${Math.max(0.5, bh).toFixed(1)}"><title>${brDate(p.day)} ${sPct(p.r, 2)} · ${p.src === "btg" ? "BTG" : p.src === "live" ? "ao vivo" : "app"}</title></rect>`; // prettier-ignore
    })
    .join("");
  return `<figure class="pp-fig"><svg viewBox="0 0 ${w} ${h}" preserveAspectRatio="none" role="img" aria-label="Retorno diário dos últimos ${d.length} dias"><line class="pp-base" x1="4" x2="${w - 4}" y1="${mid}" y2="${mid}"/>${bars}</svg></figure>`; // prettier-ignore
}

function heat(grid) {
  if (!grid.length) return "";
  const M = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];
  const cell = (r) => {
    if (r == null) return `<td class="pp-h0"></td>`;
    const a = Math.min(1, Math.abs(r) / 0.15);
    return `<td class="num pp-hc ${r >= 0 ? "up" : "down"}" style="--a:${(0.12 + a * 0.55).toFixed(2)}">${sPct(r, 1)}</td>`; // prettier-ignore
  };
  const rows = grid
    .map(
      (g) =>
        `<tr><th scope="row">${g.year}</th>${g.months.map(cell).join("")}<td class="num pp-yr ${tone(g.year_r)}">${sPct(g.year_r, 1)}</td></tr>`,
    ) // prettier-ignore
    .join("");
  return `<div class="tw"><table class="pp-heat"><thead><tr><th></th>${M.map((m) => `<th>${m}</th>`).join("")}<th>Ano</th></tr></thead><tbody>${rows}</tbody></table></div>`; // prettier-ignore
}

const metric = (lab, val, t, cls = "") =>
  `<div class="pp-m" ${tip(t)}><span class="pd-lab">${lab}</span><b class="mono ${cls}">${val}</b></div>`;

export function viewPerformance() {
  const broker = withManual(state.broker, state.portfolio?.holdings, state.portfolio?.manual);
  const btg = btgPoints(state.offPerf ?? []);
  const snaps = snapsFrom(state.brokerDaily ?? []);
  // foto mais nova com o exterior parado (BTG sem detalhe por ativo): vale a carteira atual (foto + ajustes ✎)
  const rows = (state.valuation?.rows ?? []).filter((r) => r.qty > 0);
  if (snaps.length && broker?.manual && rows.length)
    snaps[snaps.length - 1] = {
      ...snaps.at(-1),
      positions: rows.map((r) => ({ sym: r.sym, qty: r.qty })),
    };
  const syms = snaps.flatMap((s) => s.positions.map((p) => p.sym));
  const closes = snaps.length ? ensureCloses(syms) : {};
  const app = closes ? appPoints(snaps, closes, BENCH) : [];
  const cash = broker?.summary?.offshore?.cashUsd ?? 0;
  const today = new Date().toLocaleDateString("en-CA", { timeZone: "America/New_York" });
  const q = quoteOf(BENCH);
  const live = livePoint(
    today,
    rows.map((r) => ({ qty: r.qty, price: r.price, pc: fin(r.dayPL) && r.qty > 0 ? r.price - r.dayPL / r.qty : null })), // prettier-ignore
    cash,
    q ? { p: q.p, pc: q.pc } : null,
  );
  const { points, gaps } = buildSeries({ btg, app, live: live && Math.abs(live.r) > 1e-9 ? live : null }); // prettier-ignore
  if (!points.length)
    return `<section class="pd"><div class="pd-head"><h2>Performance</h2></div><p class="muted">${closes == null ? "Carregando os fechamentos…" : "Sem dados de rentabilidade ainda: conecte o BTG na Carteira."}</p></section>`; // prettier-ignore
  const key = WINDOWS.includes(state.prefs.perfWin) ? state.prefs.perfWin : "MTD";
  const st = windowStats(points, key);
  const ptsWin = st ? points.filter((p) => p.day > st.from) : [];
  const seg = WINDOWS.map((k) => `<button data-perf-win="${k}" aria-pressed="${k === key}">${WINDOW_LABEL[k]}</button>`).join(""); // prettier-ignore
  const srcTxt = { btg: "BTG", app: "app", live: "ao vivo" };
  const lastBtg = [...btg.daily, ...btg.monthly]
    .map((p) => p.day)
    .sort()
    .at(-1);
  const gapTxt = gaps.length
    ? gaps.map((g) => `${brDate(g.from)} → ${brDate(g.to)}`).join(", ")
    : "";
  const vs = st && fin(st.bench) ? st.ret - st.bench : null;
  const body = !st
    ? `<p class="muted">Janela sem dados.</p>`
    : `<div class="pp-top">
        <div class="pp-big" ${tip(T.ret)}><b class="mono ${tone(st.ret)}">${sPct(st.ret, 2)}</b><span class="mono">${brDate(st.curve[0].day)} → ${brDate(st.to)}${st.approx ? " ≈" : ""}</span></div>
        <div class="pp-big sm" ${tip(T.vs)}><span class="pd-lab">vs Nasdaq</span><b class="mono ${tone(vs)}">${fin(vs) ? `${sgn(vs)}${num(Math.abs(vs) * 100, 1)} p.p.` : "–"}</b></div>
      </div>
      ${curveSvg(st.curve)}
      <div class="pp-grid">
        ${metric("Anualizado", sPct(st.ann), T.ann, tone(st.ann))}
        ${metric("Volatilidade", fin(st.vol) ? `${num(st.vol * 100, 0)}%` : "–", T.vol)}
        ${metric("Queda máx.", sPct(st.mdd), T.mdd, tone(st.mdd))}
        ${metric("Sharpe", fin(st.sharpe) ? num(st.sharpe, 2) : "–", T.sharpe)}
        ${metric("Melhor dia", st.best ? `${sPct(st.best.r, 2)}` : "–", `${T.best} Melhor: ${st.best ? brDate(st.best.day) : "–"}.`, tone(st.best?.r))}
        ${metric("Pior dia", st.worst ? `${sPct(st.worst.r, 2)}` : "–", `${T.best} Pior: ${st.worst ? brDate(st.worst.day) : "–"}.`, tone(st.worst?.r))}
        ${metric("Dias positivos", fin(st.up) ? `${num(st.up * 100, 0)}%` : "–", `${T.up} ${st.days} dias.`)}
        ${metric("Fontes", st.srcs.map((s) => srcTxt[s]).join(" + "), T.src)}
      </div>
      ${barsSvg(st.curve, ptsWin)}`; // prettier-ignore
  return `<section class="pd pp">
    <div class="pd-head"><h2>Performance</h2><span class="pd-src" ${tip(T.src)}>Exterior · BTG até ${brDate(lastBtg)} + app <i class="pd-i" aria-hidden="true">ⓘ</i></span></div>
    <section class="card pp-card">
      <div class="seg pp-seg" role="group" aria-label="Janela">${seg}</div>
      ${gaps.length ? `<p class="pp-gap" ${tip(T.gap)}>Sem dado: ${gapTxt}</p>` : ""}
      ${body}
    </section>
    <section class="card pp-card"><span class="pd-lab" ${tip("Retorno de cada mês: BTG oficial ou diários encadeados do mês.")}>Mês a mês <i class="pd-i" aria-hidden="true">ⓘ</i></span>${heat(monthGrid(points))}</section>
  </section>`;
}

export function perfClick(e) {
  const b = e.target.closest?.("[data-perf-win]");
  if (!b) return;
  state.prefs.perfWin = b.dataset.perfWin;
  savePrefs();
  hooks.render();
}
