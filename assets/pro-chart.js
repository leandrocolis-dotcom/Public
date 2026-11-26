// Gráfico "pro" do ativo (aba Quando entrar) com a Lightweight Charts do TradingView (Apache 2.0, vendor/).
// Crosshair com OHLC, zoom/arrasto, escala de preço à direita, níveis do plano como linhas de preço.
// O zoom é preservado entre atualizações (a cada minuto) para o gráfico não "pular".
// proSeries é puro (testado); mountPro desenha. Sem a biblioteca, a aba usa o gráfico antigo (Chart.js).
import { esc, num } from "./format.js";
import { alpha, pal } from "./theme.js";
import { state } from "./state.js";
import * as S from "./ta-signals.js";
import { DAILY_VISIBLE } from "./ta-chart.js";

const SRC = "vendor/lightweight-charts.standalone.production.js";
let loading = null;

/** Carrega a biblioteca sob demanda (só quem abre um ativo paga os ~160 KB). */
export function ensurePro() {
  if (globalThis.LightweightCharts) return Promise.resolve(true);
  if (typeof document === "undefined") return Promise.resolve(false);
  loading ??= new Promise((res) => {
    const s = document.createElement("script");
    s.src = SRC;
    s.onload = () => res(!!globalThis.LightweightCharts);
    s.onerror = () => {
      loading = null;
      res(false);
    };
    document.head.appendChild(s);
  });
  return loading;
}

const pts = (times, vals) =>
  vals
    .map((v, i) => (v == null || !Number.isFinite(v) ? null : { time: times[i], value: v }))
    .filter(Boolean);

/**
 * Converte os dados da aba no formato da biblioteca. Puro.
 * Intradiário: tempo em segundos UNIX. Diário: "AAAA-MM-DD".
 */
/**
 * Barras de pré/pós-mercado em volta do pregão mostrado: o pré do mesmo dia (antes da 1ª barra), o pós do
 * mesmo dia (depois da última), o pós da véspera (a noite antes do pré) e, com a bolsa ainda fechada, o pré
 * da manhã seguinte, como no 1D do Investing.
 * ext = { t, o, h, l, c, v, s } · t0/t1 = 1ª e última barra regular mostrada (s).
 */
export function extBars(ext, t0, t1) {
  if (!ext?.t?.length || t0 == null) return [];
  const out = [];
  ext.t.forEach((t, i) => {
    const k = ext.s?.[i];
    // pré de hoje antes da abertura; antes do pregão abrir, o gráfico ainda é de ontem e o pré de hoje vem depois
    const pre = k === "pre" && ((t < t0 && t0 - t < 8 * 3600) || (t > t1 && t - t1 < 18 * 3600));
    const post = k === "post" && ((t > t1 && t - t1 < 11 * 3600) || (t < t0 && t0 - t < 18 * 3600 && t0 - t > 5.5 * 3600)); // prettier-ignore
    if (pre || post) out.push({ time: t, open: ext.o[i], high: ext.h[i], low: ext.l[i], close: ext.c[i], v: ext.v?.[i] ?? 0, ext: k }); // prettier-ignore
  });
  return out;
}

export function proSeries(d, ia, mode, planA, ext = null) {
  const plan = planA?.plan;
  const planLevels = plan
    ? [
        { price: plan.stop, label: "Stop", tone: "down", solid: true },
        { price: plan.t1, label: "Meta 1", tone: "up", solid: true },
        { price: plan.t2, label: "Meta 2", tone: "up", solid: false },
      ].filter((l) => Number.isFinite(l.price))
    : [];
  if (mode === "today" && ia) {
    const idx = ia.series.idx;
    const src = ia.src;
    const t = idx.map((i) => src.t[i]);
    const reg = idx.map((i, k) => ({ time: t[k], open: src.o[i], high: src.h[i], low: src.l[i], close: src.c[i] })); // prettier-ignore
    const xb = extBars(ext, t[0], t.at(-1));
    const candles = [
      ...reg,
      ...xb.map((b) => ({
        time: b.time,
        open: b.open,
        high: b.high,
        low: b.low,
        close: b.close,
        ext: b.ext,
      })),
    ].sort((a, b) => a.time - b.time);
    const vReg = src.v ? idx.map((i, k) => ({ time: t[k], value: src.v[i] ?? 0, up: src.c[i] >= src.o[i] })) : []; // prettier-ignore
    const volume = [...vReg, ...(src.v ? xb.map((b) => ({ time: b.time, value: b.v, up: b.close >= b.open, ext: b.ext })) : [])].sort((a, b) => a.time - b.time); // prettier-ignore
    const L = ia.levels;
    return {
      intraday: true,
      ext: xb.length > 0,
      candles,
      volume,
      lines: [
        { name: "VWAP", tone: "info", width: 2, data: pts(t, ia.series.vwap) },
        { name: "VWAP +1σ", tone: "info", width: 1, dash: true, data: pts(t, ia.series.vwapUp) },
        { name: "VWAP -1σ", tone: "info", width: 1, dash: true, data: pts(t, ia.series.vwapLo) },
        { name: "Média 21", tone: "wait", width: 1, data: pts(t, ia.series.ema21) },
      ],
      levels: [
        L.orH != null && { price: L.orH, label: "Abertura máx", tone: "violet" },
        L.orL != null && { price: L.orL, label: "Abertura mín", tone: "violet" },
        L.prevH != null && { price: L.prevH, label: "Máx ontem", tone: "grey" },
        L.prevL != null && { price: L.prevL, label: "Mín ontem", tone: "grey" },
        ...planLevels,
      ].filter(Boolean),
    };
  }
  const n = d.bars.c.length;
  const t = d.bars.dates;
  const candles = d.bars.c.map((c, i) => ({ time: t[i], open: d.bars.o[i], high: d.bars.h[i], low: d.bars.l[i], close: c })); // prettier-ignore
  const volume = d.bars.v ? d.bars.v.map((v, i) => ({ time: t[i], value: v ?? 0, up: d.bars.c[i] >= d.bars.o[i] })) : []; // prettier-ignore
  const P = d.P;
  const lv = d.a.struct.levels;
  return {
    intraday: false,
    closeOnly: !!d.bars.closeOnly,
    candles,
    volume,
    visible: Math.min(DAILY_VISIBLE, n),
    lines: [
      { name: "Média 50", tone: "info", width: 2, data: pts(t, P.sma50) },
      { name: "Média 200", tone: "wait", width: 2, data: pts(t, P.sma200) },
      { name: "Banda sup.", tone: "grey", width: 1, dash: true, data: pts(t, P.bb.up) },
      { name: "Banda inf.", tone: "grey", width: 1, dash: true, data: pts(t, P.bb.lo) },
    ],
    levels: [
      ...lv.resistances.slice(0, 2).map((z) => ({ price: z.price, label: "Teto", tone: "down" })),
      ...lv.supports.slice(0, 2).map((z) => ({ price: z.price, label: "Piso", tone: "up" })),
      ...planLevels,
    ],
  };
}

const TONE = () => {
  const p = pal();
  return { up: p.buy, down: p.sell, info: p.info, wait: p.wait, violet: p.violet, grey: p.text3, ink: p.text }; // prettier-ignore
};

const views = new Map(); // "SYM:modo" -> faixa lógica visível (zoom do usuário)

/** Desenha no elemento `box` (div). Devolve um objeto com destroy(), registrado em state.charts. */
export function mountPro(box, data, key) {
  const LW = globalThis.LightweightCharts;
  if (!LW || !box) return null;
  const p = pal();
  const c = TONE();
  box.innerHTML = "";
  box.classList.add("pro-chart");
  // legenda do ponto acima do gráfico (dentro dele cobria as velas do topo no celular)
  if (box.previousElementSibling?.classList.contains("pro-legend"))
    box.previousElementSibling.remove();
  const legend = document.createElement("div");
  legend.className = "pro-legend";
  legend.setAttribute("aria-live", "polite");
  box.before(legend);
  const chart = LW.createChart(box, {
    autoSize: true,
    layout: { background: { color: "transparent" }, textColor: p.text2 ?? p.text, fontFamily: p.mono, fontSize: 11 }, // prettier-ignore
    grid: { vertLines: { color: alpha(p.text, 0.05) }, horzLines: { color: alpha(p.text, 0.07) } },
    rightPriceScale: { borderVisible: false, scaleMargins: { top: 0.08, bottom: 0.22 } },
    timeScale: { borderVisible: false, timeVisible: data.intraday, secondsVisible: false, rightOffset: 4 }, // prettier-ignore
    crosshair: { mode: LW.CrosshairMode.Normal },
    localization: {
      locale: "pt-BR",
      priceFormatter: (v) => num(v, 2),
      timeFormatter: (t) => (typeof t === "number" ? S.brtClock(t) : fmtDay(t)),
    },
  });
  if (data.intraday)
    chart.timeScale().applyOptions({ tickMarkFormatter: (t) => (typeof t === "number" ? S.brtClock(t) : null) }); // prettier-ignore

  // faixa de fundo do pré (azul) e do pós-mercado (violeta), atrás das velas, como no Investing
  if (data.ext) {
    const band = chart.addHistogramSeries({ priceScaleId: "sess", lastValueVisible: false, priceLineVisible: false, base: 0 }); // prettier-ignore
    chart.priceScale("sess").applyOptions({ visible: false, scaleMargins: { top: 0, bottom: 0 } });
    band.setData(data.candles.map((b) => ({ time: b.time, value: 1, color: b.ext ? alpha(b.ext === "pre" ? c.info : c.violet, 0.1) : "rgba(0,0,0,0)" }))); // prettier-ignore
  }
  const main = data.closeOnly
    ? chart.addLineSeries({ color: c.ink, lineWidth: 2 })
    : chart.addCandlestickSeries({
        upColor: c.up, downColor: c.down, borderUpColor: c.up, borderDownColor: c.down,
        wickUpColor: c.up, wickDownColor: c.down,
      }); // prettier-ignore
  // pré/pós: velas mais claras (o preço do horário estendido tem pouco volume e menos peso)
  const dim = (b) => {
    if (!b.ext) return b;
    const col = alpha(b.close >= b.open ? c.up : c.down, 0.45);
    return { time: b.time, open: b.open, high: b.high, low: b.low, close: b.close, color: col, borderColor: col, wickColor: col }; // prettier-ignore
  };
  main.setData(data.closeOnly ? data.candles.map((b) => ({ time: b.time, value: b.close })) : data.candles.map(dim)); // prettier-ignore

  if (data.volume.length) {
    const vol = chart.addHistogramSeries({ priceScaleId: "vol", priceFormat: { type: "volume" }, lastValueVisible: false, priceLineVisible: false }); // prettier-ignore
    chart.priceScale("vol").applyOptions({ scaleMargins: { top: 0.82, bottom: 0 } });
    vol.setData(data.volume.map((v) => ({ time: v.time, value: v.value, color: alpha(v.up ? c.up : c.down, v.ext ? 0.18 : 0.35) }))); // prettier-ignore
  }
  const lineVals = []; // valores das linhas (VWAP, médias) por instante, para a legenda do ponto escolhido
  for (const l of data.lines) {
    if (!l.data.length) continue;
    lineVals.push({
      name: l.name,
      tone: l.tone,
      at: new Map(l.data.map((x) => [x.time, x.value])),
    });
    const s = chart.addLineSeries({
      color: l.dash ? alpha(c[l.tone], 0.6) : c[l.tone],
      lineWidth: l.width,
      lineStyle: l.dash ? LW.LineStyle.Dashed : LW.LineStyle.Solid,
      lastValueVisible: false,
      priceLineVisible: false,
      crosshairMarkerVisible: false,
    });
    s.setData(l.data);
  }
  for (const l of data.levels)
    main.createPriceLine({
      price: l.price,
      color: c[l.tone],
      lineWidth: l.solid ? 2 : 1,
      lineStyle: l.solid ? LW.LineStyle.Solid : LW.LineStyle.Dashed,
      axisLabelVisible: true,
      title: l.label,
    });
  for (const u of userLevels(key?.split(":")[0]))
    main.createPriceLine({ price: u, color: c.violet, lineWidth: 1, lineStyle: LW.LineStyle.LargeDashed, axisLabelVisible: true, title: "Minha linha" }); // prettier-ignore

  const byTime = new Map(data.candles.map((b) => [b.time, b]));
  const idxOf = new Map(data.candles.map((b, i) => [b.time, i]));
  const volAt = new Map(data.volume.map((v) => [v.time, v.value]));
  const last = data.candles.at(-1);
  const extra = []; // séries de comparação (chart-compare): { name, color, at: Map(time → preço) }
  // legenda do ponto: data/hora, OHLC, variação contra o fechamento anterior, volume e as linhas do gráfico
  const show = (b) => {
    if (!b) return (legend.textContent = "");
    const prev = data.candles[(idxOf.get(b.time) ?? 0) - 1];
    const ch = prev?.close
      ? (b.close / prev.close - 1) * 100
      : b.open
        ? (b.close / b.open - 1) * 100
        : 0;
    const when = typeof b.time === "number" ? S.brtClock(b.time) : fmtDay(b.time);
    const v = volAt.get(b.time);
    const lines = [...lineVals, ...extra]
      .map((l) => [l, l.at.get(b.time)])
      .filter(([, x]) => Number.isFinite(x))
      .map(
        ([l, x]) =>
          `<span class="pl" style="--c:${l.color ?? c[l.tone] ?? p.text2}">${esc(l.name)} <b>${num(x)}</b></span>`,
      ) // prettier-ignore
      .join(" ");
    const ohlc = data.closeOnly
      ? `F <b>${num(b.close)}</b>`
      : `A <b>${num(b.open)}</b> Máx <b>${num(b.high)}</b> Mín <b>${num(b.low)}</b> F <b>${num(b.close)}</b>`;
    const tag = b.ext ? ` <span class="pl" style="--c:${b.ext === "pre" ? c.info : c.violet}">${b.ext === "pre" ? "Pré-mercado" : "Pós-mercado"}</span>` : ""; // prettier-ignore
    legend.innerHTML = `<span class="pd">${when}</span>${tag} ${ohlc} <span class="${ch >= 0 ? "up" : "down"}">${ch >= 0 ? "+" : "−"}${num(Math.abs(ch), 2)}%</span>${v ? ` Vol <b>${volFmt(v)}</b>` : ""}${lines ? `<br>${lines}` : ""}`; // prettier-ignore
  };
  show(last);
  // tocar/clicar fixa a mira no pregão escolhido (no celular a mira não segue o dedo sem arrastar)
  let pinned = null;
  chart.subscribeCrosshairMove((e) => {
    if (e.time == null && pinned) return show(byTime.get(pinned));
    show(e.time != null ? byTime.get(e.time) : last);
  });
  chart.subscribeClick((e) => {
    if (e.time == null) return;
    pinned = pinned === e.time ? null : e.time;
    const b = byTime.get(e.time);
    if (pinned && b) chart.setCrosshairPosition?.(b.close, b.time, main);
    else chart.clearCrosshairPosition?.();
    show(b ?? last);
  });

  // zoom: restaura o do usuário; senão, mostra as últimas N barras
  const ts = chart.timeScale();
  const saved = key && views.get(key);
  if (saved) ts.setVisibleLogicalRange(saved);
  else if (data.visible)
    ts.setVisibleLogicalRange({ from: data.candles.length - data.visible, to: data.candles.length + 3 }); // prettier-ignore
  else ts.fitContent();
  const onRange = (r) => key && r && views.set(key, r);
  ts.subscribeVisibleLogicalRangeChange(onRange);

  // duplo clique: volta ao zoom padrão
  box.addEventListener("dblclick", () => {
    if (key) views.delete(key);
    if (data.visible)
      ts.setVisibleLogicalRange({ from: data.candles.length - data.visible, to: data.candles.length + 3 }); // prettier-ignore
    else ts.fitContent();
  });

  const handle = {
    chart,
    main,
    extra,
    refreshLegend: () => show(last),
    destroy() {
      try {
        ts.unsubscribeVisibleLogicalRangeChange(onRange);
        legend.remove();
        chart.remove();
      } catch {
        /* já removido */
      }
    },
  };
  state.charts.push(handle);
  return handle;
}

const volFmt = (v) =>
  v >= 1e9 ? `${num(v / 1e9, 2)} bi` : v >= 1e6 ? `${num(v / 1e6, 1)} mi` : v >= 1e3 ? `${num(v / 1e3, 0)} mil` : num(v, 0); // prettier-ignore

const fmtDay = (t) => {
  const s = typeof t === "string" ? t : `${t.year}-${String(t.month).padStart(2, "0")}-${String(t.day).padStart(2, "0")}`; // prettier-ignore
  return `${s.slice(8, 10)}/${s.slice(5, 7)}/${s.slice(2, 4)}`;
};

// ---- Linhas do usuário (desenho simples: nível horizontal por ativo) ----
const ULK = "pendulo.userLines";
const readUL = () => {
  try {
    return JSON.parse(localStorage.getItem(ULK) ?? "{}");
  } catch {
    return {};
  }
};
export const userLevels = (sym) => (sym ? (readUL()[sym] ?? []) : []);
export function setUserLevels(sym, levels) {
  const all = readUL();
  all[sym] = levels.filter(Number.isFinite).slice(0, 10);
  try {
    localStorage.setItem(ULK, JSON.stringify(all));
  } catch {
    /* sem armazenamento */
  }
  return all[sym];
}
