// "Quando entrar": configuração dos gráficos (candles, VWAP, níveis, subpainéis) no formato do Chart.js.
import { num } from "./format.js";
import { alpha, pal } from "./theme.js";
import * as S from "./ta-signals.js";

export const DAILY_VISIBLE = 120;

// Cores lidas do tema no momento do desenho (os getters seguem o tema ativo).
const COLORS = {
  get up() { return pal().buy; },
  get down() { return pal().sell; },
  get ink() { return pal().text; },
  get cobalt() { return pal().info; },
  get amber() { return pal().wait; },
  get grey() { return pal().text3; },
  get violet() { return pal().violet; },
}; // prettier-ignore

const candlePlugin = {
  id: "candles",
  afterDatasetsDraw(chart, _a, o) {
    if (!o?.bars) return;
    const { ctx, chartArea, scales } = chart;
    const { x, y } = scales;
    const b = o.bars;
    const n = b.c.length;
    const w = Math.max(1.5, Math.min(14, (chartArea.width / n) * 0.62));
    ctx.save();
    ctx.beginPath();
    ctx.rect(chartArea.left, chartArea.top, chartArea.width, chartArea.height);
    ctx.clip();
    for (let i = 0; i < n; i++) {
      const px = x.getPixelForValue(i);
      const up = b.c[i] >= b.o[i];
      ctx.strokeStyle = ctx.fillStyle = up ? COLORS.up : COLORS.down;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(px, y.getPixelForValue(b.h[i]));
      ctx.lineTo(px, y.getPixelForValue(b.l[i]));
      ctx.stroke();
      const yo = y.getPixelForValue(b.o[i]);
      const yc = y.getPixelForValue(b.c[i]);
      ctx.fillRect(px - w / 2, Math.min(yo, yc), w, Math.max(1, Math.abs(yo - yc)));
    }
    ctx.restore();
  },
};

const levelsPlugin = {
  id: "tlevels",
  afterDatasetsDraw(chart, _a, o) {
    if (!o?.levels?.length) return;
    const { ctx, chartArea, scales } = chart;
    const y = scales.y;
    const items = o.levels
      .filter((l) => l.y >= y.min && l.y <= y.max)
      .map((l) => ({ ...l, py: y.getPixelForValue(l.y) }))
      .sort((p, q) => p.py - q.py);
    let prev = -99;
    ctx.save();
    ctx.font = `600 11px ${pal().mono}`;
    ctx.textBaseline = "middle";
    for (const l of items) {
      ctx.strokeStyle = l.color;
      ctx.lineWidth = l.solid ? 1.4 : 1;
      ctx.setLineDash(l.solid ? [] : [5, 4]);
      ctx.beginPath();
      ctx.moveTo(chartArea.left, l.py);
      ctx.lineTo(chartArea.right, l.py);
      ctx.stroke();
      ctx.setLineDash([]);
      const ty = Math.max(l.py, prev + 13);
      prev = ty;
      const tw = ctx.measureText(l.label).width + 8;
      ctx.fillStyle = alpha(pal().surface, 0.88);
      ctx.fillRect(chartArea.right - tw - 2, ty - 7, tw, 14);
      ctx.fillStyle = l.color;
      ctx.textAlign = "right";
      ctx.fillText(l.label, chartArea.right - 6, ty);
    }
    ctx.restore();
  },
};

const baseScales = (showX) => ({
  x: {
    grid: { color: alpha(pal().text, 0.06) },
    ticks: { display: showX, maxTicksLimit: 8, maxRotation: 0 },
  },
  y: {
    position: "right",
    grid: { color: alpha(pal().text, 0.08) },
    afterFit: (s) => (s.width = 62),
    ticks: { callback: (v) => num(v, 2) },
  },
});

const line = (label, data, color, extra = {}) => ({
  label,
  data,
  borderColor: color,
  backgroundColor: color,
  borderWidth: 1.4,
  pointRadius: 0,
  pointHoverRadius: 0,
  tension: 0,
  spanGaps: true,
  ...extra,
});

const hidden = (label, data) => line(label, data, "transparent", { borderWidth: 0 });

const ddmm = (iso) => iso.slice(8, 10) + "/" + iso.slice(5, 7);

export function mainConfig(d, ia, mode, planA) {
  let labels, bars, ds, levels;
  const plan = planA?.plan;
  const planLevels = plan
    ? [
        { y: plan.stop, label: `Stop ${num(plan.stop)}`, color: COLORS.down, solid: true },
        { y: plan.t1, label: `Meta 1 ${num(plan.t1)}`, color: COLORS.up, solid: true },
        { y: plan.t2, label: `Meta 2 ${num(plan.t2)}`, color: COLORS.up, solid: false },
      ]
    : [];
  if (mode === "today" && ia) {
    const idx = ia.series.idx;
    const src = ia.src;
    bars = {
      o: idx.map((i) => src.o[i]),
      h: idx.map((i) => src.h[i]),
      l: idx.map((i) => src.l[i]),
      c: idx.map((i) => src.c[i]),
    };
    labels = idx.map((i) => S.brtClock(src.t[i]));
    const L = ia.levels;
    ds = [
      hidden("OHLC", bars.c), hidden("máx", bars.h), hidden("mín", bars.l),
      line("VWAP", ia.series.vwap, COLORS.cobalt, { borderWidth: 2 }),
      line("VWAP +1σ", ia.series.vwapUp, alpha(pal().info, 0.45), { borderWidth: 1, borderDash: [3, 3] }),
      line("VWAP -1σ", ia.series.vwapLo, alpha(pal().info, 0.45), { borderWidth: 1, borderDash: [3, 3] }),
      line("Média 21", ia.series.ema21, COLORS.amber, { borderWidth: 1.2 }),
    ]; // prettier-ignore
    levels = [
      L.orH != null && { y: L.orH, label: `Abertura máx ${num(L.orH)}`, color: COLORS.violet },
      L.orL != null && { y: L.orL, label: `Abertura mín ${num(L.orL)}`, color: COLORS.violet },
      L.prevH != null && { y: L.prevH, label: `Máx ontem ${num(L.prevH)}`, color: COLORS.grey },
      L.prevL != null && { y: L.prevL, label: `Mín ontem ${num(L.prevL)}`, color: COLORS.grey },
      ...planLevels,
    ].filter(Boolean); // prettier-ignore
  } else {
    const k = Math.min(DAILY_VISIBLE, d.bars.c.length);
    const s = (arr) => arr.slice(-k);
    bars = { o: s(d.bars.o), h: s(d.bars.h), l: s(d.bars.l), c: s(d.bars.c) };
    labels = s(d.bars.dates).map(ddmm);
    const P = d.P;
    ds = [
      hidden("OHLC", bars.c), hidden("máx", bars.h), hidden("mín", bars.l),
      line("Média 50", s(P.sma50), COLORS.cobalt, { borderWidth: 1.6 }),
      line("Média 200", s(P.sma200), COLORS.amber, { borderWidth: 1.6 }),
      line("Banda sup.", s(P.bb.up), alpha(pal().text3, 0.9), { borderWidth: 1, borderDash: [3, 3] }),
      line("Banda inf.", s(P.bb.lo), alpha(pal().text3, 0.9), { borderWidth: 1, borderDash: [3, 3] }),
    ]; // prettier-ignore
    if (d.bars.closeOnly) {
      ds[0] = line("Fechamento", bars.c, COLORS.ink, { borderWidth: 1.8 });
    }
    const lv = d.a.struct.levels;
    levels = [
      ...lv.resistances
        .slice(0, 2)
        .map((z) => ({ y: z.price, label: `Teto ${num(z.price)}`, color: COLORS.down })),
      ...lv.supports
        .slice(0, 2)
        .map((z) => ({ y: z.price, label: `Piso ${num(z.price)}`, color: COLORS.up })),
      ...planLevels,
    ];
  }
  const all = [...bars.h, ...bars.l, ...(plan ? [plan.stop, plan.t1] : [])];
  const lo = Math.min(...all);
  const hi = Math.max(...all);
  const pad = (hi - lo) * 0.05;
  const cfg = {
    type: "line",
    data: { labels, datasets: ds },
    plugins: [candlePlugin, levelsPlugin],
    options: {
      layout: { padding: { right: 4 } },
      interaction: { mode: "index", intersect: false },
      scales: {
        ...baseScales(false),
        y: { ...baseScales(false).y, suggestedMin: lo - pad, suggestedMax: hi + pad },
      },
      plugins: {
        legend: { display: false },
        candles: d.bars.closeOnly && mode === "swing" ? false : { bars },
        tlevels: { levels },
        tooltip: {
          filter: (it) => it.datasetIndex === 0,
          callbacks: {
            label: (it) => {
              const i = it.dataIndex;
              const f = (x) => num(x, 2);
              return d.bars.closeOnly && mode === "swing"
                ? `Fechamento ${f(bars.c[i])}`
                : `Abertura ${f(bars.o[i])} · Máx ${f(bars.h[i])} · Mín ${f(bars.l[i])} · Fech ${f(bars.c[i])}`;
            },
          },
        },
      },
    },
  };
  return cfg;
}

export function subConfig(d, ia, mode, which) {
  const today = mode === "today" && ia;
  let labels, v, c, o, r;
  if (today) {
    const idx = ia.series.idx;
    labels = idx.map((i) => S.brtClock(ia.src.t[i]));
    v = idx.map((i) => ia.src.v[i]);
    c = idx.map((i) => ia.src.c[i]);
    o = idx.map((i) => ia.src.o[i]);
    r = ia.series.rsi;
  } else {
    const k = Math.min(DAILY_VISIBLE, d.bars.c.length);
    const s = (arr) => arr.slice(-k);
    labels = s(d.bars.dates).map(ddmm);
    v = s(d.bars.v);
    c = s(d.bars.c);
    o = s(d.bars.o);
    r = s(d.P.rsi);
  }
  const guide = (val, color = alpha(pal().text3, 0.9)) =>
    line(
      "g",
      labels.map(() => val),
      color,
      { borderWidth: 1, borderDash: [4, 4] },
    );
  const opt = (extra = {}) => ({
    layout: { padding: { right: 4 } },
    interaction: { mode: "index", intersect: false },
    scales: { ...baseScales(true), ...extra },
    plugins: { legend: { display: false }, tooltip: { filter: (it) => it.dataset.label !== "g" } },
  });
  if (which === "volume") {
    return {
      type: "bar",
      data: {
        labels,
        datasets: [
          {
            label: "Volume",
            data: v,
            backgroundColor: v.map((_, i) =>
              c[i] >= o[i] ? alpha(pal().buy, 0.55) : alpha(pal().sell, 0.55),
            ),
          },
        ],
      },
      options: opt({
        y: {
          ...baseScales(true).y,
          ticks: {
            callback: (x) => (x >= 1e6 ? `${num(x / 1e6, 1)} mi` : `${num(x / 1e3, 0)} mil`),
          },
        },
      }),
    };
  }
  if (which === "rsi") {
    return {
      type: "line",
      data: {
        labels,
        datasets: [
          line("RSI", r, COLORS.cobalt, { borderWidth: 1.6 }),
          guide(70, alpha(pal().sell, 0.7)),
          guide(30, alpha(pal().buy, 0.7)),
        ],
      },
      options: opt({
        y: {
          ...baseScales(true).y,
          min: 0,
          max: 100,
          ticks: { stepSize: 30, callback: (x) => num(x, 0) },
        },
      }),
    };
  }
  const P = d.P;
  const k = Math.min(DAILY_VISIBLE, d.bars.c.length);
  const s = (arr) => arr.slice(-k);
  if (which === "macd") {
    const h = s(P.macd.hist);
    return {
      type: "bar",
      data: { labels, datasets: [
        { type: "bar", label: "Histograma", data: h, backgroundColor: h.map((x) => (x >= 0 ? alpha(pal().buy, 0.55) : alpha(pal().sell, 0.55))) },
        { type: "line", ...line("MACD", s(P.macd.line), COLORS.cobalt) },
        { type: "line", ...line("Sinal", s(P.macd.signal), COLORS.amber) },
      ] }, // prettier-ignore
      options: opt(),
    };
  }
  if (which === "stoch") {
    return {
      type: "line",
      data: {
        labels,
        datasets: [
          line("%K", s(P.st.k), COLORS.cobalt),
          line("%D", s(P.st.d), COLORS.amber),
          guide(80, alpha(pal().sell, 0.7)),
          guide(20, alpha(pal().buy, 0.7)),
        ],
      },
      options: opt({
        y: {
          ...baseScales(true).y,
          min: 0,
          max: 100,
          ticks: { stepSize: 30, callback: (x) => num(x, 0) },
        },
      }),
    };
  }
  return {
    type: "line",
    data: { labels, datasets: [line("OBV", s(P.obv), COLORS.cobalt, { borderWidth: 1.6 })] },
    options: opt({
      y: {
        ...baseScales(true).y,
        ticks: { callback: (x) => (Math.abs(x) >= 1e6 ? `${num(x / 1e6, 1)} mi` : num(x, 0)) },
      },
    }),
  };
}
