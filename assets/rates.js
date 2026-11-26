// Mercados › Juros (puro, sem DOM): curvas de juros por país, datas de comparação, vértices interpolados, inclinações
// (spreads), curva dos EUA ao vivo (fechamento oficial + variação do dia do Yahoo) e o gráfico em SVG.
// Dados: GET /api/yields?curve=…&date=… (api/_curves.js). Ver docs/JUROS.md.

import { decSep } from "./format.js";
/** Curvas disponíveis em cada lado. `vert` = vértices da tabela (anos); `spreads` = [longo, curto, rótulo]. */
export const RATE_CURVES = {
  us: { label: "EUA · Treasuries", flag: "🇺🇸", vert: [1 / 12, 0.25, 0.5, 1, 2, 3, 5, 7, 10, 20, 30], spreads: [[10, 2, "10a − 2a"], [10, 0.25, "10a − 3m"], [30, 5, "30a − 5a"], [5, 2, "5a − 2a"]], note: "Par yield do Tesouro americano (fechamento oficial). Ao vivo: o fechamento + a variação do dia de 3m, 5a, 10a e 30a do Yahoo, interpolada nos demais vértices." }, // prettier-ignore
  eu: { label: "Zona do euro · AAA", flag: "🇪🇺", vert: [0.25, 0.5, 1, 2, 3, 5, 7, 10, 15, 20, 30], spreads: [[10, 2, "10a − 2a"], [30, 10, "30a − 10a"]], note: "Curva à vista dos títulos AAA da zona do euro (BCE, ~Alemanha). Publicação diária com 1 dia de defasagem." }, // prettier-ignore
  gb: { label: "Reino Unido · Gilts", flag: "🇬🇧", vert: [0, 5, 10, 20], spreads: [[10, 5, "10a − 5a"], [10, 0, "10a − Bank Rate"]], note: "Bank Rate e zero cupom de 5, 10 e 20 anos (Banco da Inglaterra), 1-2 dias de defasagem." }, // prettier-ignore
  jp: { label: "Japão · JGB", flag: "🇯🇵", vert: [1, 2, 3, 5, 7, 10, 20, 30, 40], spreads: [[10, 2, "10a − 2a"], [30, 10, "30a − 10a"]], note: "JGB do Ministério das Finanças do Japão, 1 dia de defasagem." }, // prettier-ignore
  br: { label: "Brasil · DI × pré", flag: "🇧🇷", vert: [0.25, 0.5, 1, 2, 3, 5, 7, 10], spreads: [[5, 1, "5a − 1a"], [10, 2, "10a − 2a"], [2, 0.25, "2a − 3m"]], note: "Fechamento: taxa referencial DI × pré da B3 (base 252, por dias corridos). Ao vivo: contratos futuros DI1 da B3 (~15 min de atraso)." }, // prettier-ignore
  fed: { label: "Fed · caminho implícito", flag: "🏦", vert: [], spreads: [], note: "" },
  usr: { label: "EUA · Real (TIPS)", flag: "🇺🇸", vert: [5, 7, 10, 20, 30], spreads: [[10, 5, "10a − 5a"], [30, 10, "30a − 10a"]], note: "Juro real dos TIPS (títulos do Tesouro americano corrigidos pelo CPI), par real yield do Tesouro americano, fechamento oficial." }, // prettier-ignore
  usb: { label: "EUA · Inflação implícita", flag: "🇺🇸", be: true, vert: [5, 7, 10, 20, 30], spreads: [[10, 5, "10a − 5a"], [30, 10, "30a − 10a"]], note: "Inflação implícita (breakeven) = Treasury nominal − TIPS no mesmo prazo, fechamento oficial. Inclui prêmio de risco de inflação e de liquidez dos TIPS; não é a previsão pura do CPI." }, // prettier-ignore
  brr: { label: "Brasil · Real (NTN-B)", flag: "🇧🇷", vert: [3, 5, 7, 10, 15, 20, 30], spreads: [[10, 3, "10a − 3a"], [20, 5, "20a − 5a"]], note: "Juro real das NTN-B (Tesouro IPCA+ com juros semestrais e, onde não há, Tesouro IPCA+), taxa de compra da manhã do Tesouro Direto, por dias corridos. Educa+ e Renda+ ficam de fora." }, // prettier-ignore
  brb: { label: "Brasil · Inflação implícita", flag: "🇧🇷", be: true, fisher: true, vert: [3, 5, 7, 10], spreads: [[10, 3, "10a − 3a"], [10, 5, "10a − 5a"]], note: "Inflação implícita = (1 + pré) ÷ (1 + real) − 1 em cada vértice da NTN-B, com o pré da curva DI × pré do mesmo dia. Inclui prêmio de risco; só vai até o último DI1 (~10 anos)." }, // prettier-ignore
};
/** Curvas com versão real e implícita: nominal -> { real, be }. */
export const RATE_MODES = { us: { real: "usr", be: "usb" }, br: { real: "brr", be: "brb" } };
export const MODE_LABELS = [["nom", "Nominal"], ["real", "Real"], ["be", "Inflação implícita"]]; // prettier-ignore
/** Curva efetiva: nominal + modo -> id (us + real -> usr); modo sem versão = nominal. */
export const curveFor = (base, mode) => RATE_MODES[base]?.[mode] ?? base;
/** Para a inflação implícita: nominal e real de onde ela sai. */
export const beParts = (id) => {
  const base = Object.keys(RATE_MODES).find((k) => RATE_MODES[k].be === id);
  return base ? { nom: base, real: RATE_MODES[base].real } : null;
};

/**
 * Inflação implícita nos vencimentos da curva real e nos vértices de `grid` (as duas curvas interpoladas no prazo):
 * `fisher` = (1+n)/(1+r) − 1 (Brasil, base 252); senão n − r (convenção do breakeven dos EUA).
 * Prazo fora de uma das curvas fica de fora (sem extrapolar).
 */
export function breakeven(nom, real, fisher = false, grid = []) {
  const ts = [...new Set([...(real ?? []).map((p) => p.t), ...grid])].sort((a, b) => a - b);
  const out = [];
  for (const t of ts) {
    const n = interp(nom, t);
    const r = interp(real, t);
    if (n == null || r == null) continue;
    const y = fisher ? ((1 + n / 100) / (1 + r / 100) - 1) * 100 : n - r;
    if (!out.some((p) => Math.abs(p.t - t) < 0.15)) out.push({ t, y: Math.round(y * 1000) / 1000 }); // prettier-ignore
  }
  return out;
}
/**
 * Inflação média esperada pelo Focus de hoje até `k` anos (k = 1, 2, …), anualizada: o resto do ano corrente com o IPCA
 * do ano, os anos cheios seguintes e a fração final do último ano. `years` = { "2026": 4,5, ... } (mediana anual).
 */
export function focusCurve(years, today) {
  const ys = Object.keys(years ?? {})
    .map(Number)
    .sort((a, b) => a - b);
  const y0 = Number(String(today).slice(0, 4));
  if (!ys.includes(y0)) return [];
  const rest = (Date.parse(`${y0 + 1}-01-01T00:00:00Z`) - Date.parse(`${today}T00:00:00Z`)) / (365 * DAY); // prettier-ignore
  const g = (y) => 1 + years[y] / 100;
  const out = [];
  for (let k = 1; ys.includes(y0 + k); k++) {
    let cum = g(y0) ** rest * g(y0 + k) ** (1 - rest);
    for (let j = 1; j < k; j++) cum *= g(y0 + j);
    out.push({ t: k, y: Math.round((cum ** (1 / k) - 1) * 100000) / 1000 });
  }
  return out;
}

/** Prêmio de risco de inflação: implícita − Focus nos prazos do Focus que a implícita cobre (bp). */
export function inflationPremium(be, focus) {
  return (focus ?? [])
    .map((f) => {
      const b = interp(be, f.t);
      return b == null ? null : { t: f.t, be: b, focus: f.y, bp: Math.round((b - f.y) * 100) };
    })
    .filter(Boolean);
}

/** Curvas de cada lado de Mercados (a primeira é a padrão). */
export const SIDE_CURVES = { off: ["us", "fed", "eu", "gb", "jp"], on: ["br"] };

/** Atalhos de comparação: código -> rótulo. */
export const RATE_PRESETS = [["1d", "Ontem"], ["1w", "1 semana"], ["1m", "1 mês"], ["3m", "3 meses"], ["6m", "6 meses"], ["ytd", "Início do ano"], ["1y", "1 ano"], ["2y", "2 anos"]]; // prettier-ignore
export const MAX_CMP = 6;
/** Comparações padrão de cada lado. */
export const DEFAULT_CMP = ["1m", "1y"];

const DAY = 86400000;
const isoOf = (ms) => new Date(ms).toISOString().slice(0, 10);
const back = (iso, f) => {
  const d = new Date(`${iso}T12:00:00Z`);
  f(d);
  return isoOf(d.getTime());
};
/** Dia útil (seg-sex) igual ou anterior. */
export const weekdayOnOrBefore = (iso) => {
  let t = Date.parse(`${iso}T12:00:00Z`);
  while ([0, 6].includes(new Date(t).getUTCDay())) t -= DAY;
  return isoOf(t);
};

/** Código de atalho ou data ISO -> data ISO (a API acha o último dia com curva ≤ essa data). */
export function cmpDate(code, today) {
  if (/^\d{4}-\d{2}-\d{2}$/.test(code)) return code;
  const t = weekdayOnOrBefore(today);
  const map = {
    "1d": () => weekdayOnOrBefore(isoOf(Date.parse(`${t}T12:00:00Z`) - DAY)),
    "1w": () => back(today, (d) => d.setUTCDate(d.getUTCDate() - 7)),
    "1m": () => back(today, (d) => d.setUTCMonth(d.getUTCMonth() - 1)),
    "3m": () => back(today, (d) => d.setUTCMonth(d.getUTCMonth() - 3)),
    "6m": () => back(today, (d) => d.setUTCMonth(d.getUTCMonth() - 6)),
    "1y": () => back(today, (d) => d.setUTCFullYear(d.getUTCFullYear() - 1)),
    "2y": () => back(today, (d) => d.setUTCFullYear(d.getUTCFullYear() - 2)),
    ytd: () => `${Number(today.slice(0, 4)) - 1}-12-31`,
  };
  return map[code] ? weekdayOnOrBefore(map[code]()) : null;
}
/** Rótulo da comparação ("1 mês" ou "15/03/2025"). */
export const cmpLabel = (code) =>
  RATE_PRESETS.find(([k]) => k === code)?.[1] ?? code.split("-").reverse().join("/");

/** Lista de comparações saneada: códigos/datas válidos, sem repetição, até MAX_CMP. */
export function normCmp(list) {
  const ok = (c) => RATE_PRESETS.some(([k]) => k === c) || /^\d{4}-\d{2}-\d{2}$/.test(c);
  return [...new Set((Array.isArray(list) ? list : DEFAULT_CMP).filter((c) => typeof c === "string" && ok(c)))].slice(0, MAX_CMP); // prettier-ignore
}

/** Taxa interpolada (linear no prazo) em `t` anos; null fora do intervalo da curva (sem extrapolar). */
export function interp(points, t) {
  const p = (points ?? []).filter((x) => Number.isFinite(x?.t) && Number.isFinite(x?.y));
  if (!p.length) return null;
  const tol = Math.max(0.02, t * 0.03);
  const ex = p.find((x) => Math.abs(x.t - t) <= 1e-6);
  if (ex) return ex.y;
  if (t < p[0].t - tol || t > p.at(-1).t + tol) return null;
  if (t <= p[0].t) return p[0].y;
  if (t >= p.at(-1).t) return p.at(-1).y;
  const i = p.findIndex((x) => x.t > t);
  const a = p[i - 1];
  const b = p[i];
  return a.y + ((b.y - a.y) * (t - a.t)) / (b.t - a.t);
}

/** Rótulo do vértice: 0 = "Bank Rate"/"Overnight", 0,25 = "3m", 2 = "2a". */
export const vertLabel = (t, curve) =>
  t === 0
    ? curve === "gb"
      ? "Bank Rate"
      : "Overnight"
    : t < 1
      ? `${Math.round(t * 12)}m`
      : `${t}a`;

/** Rótulo de um prazo qualquer (0,75 -> "9m", 2,25 -> "2,3a"). */
export const tLabel = (t) =>
  t < 1
    ? `${Math.max(1, Math.round(t * 12))}m`
    : `${String(Math.round(t * 10) / 10).replace(".", decSep())}a`;

/** Inclinações da curva em pontos-base (bp). */
export function spreadsOf(points, curve) {
  return (RATE_CURVES[curve]?.spreads ?? []).map(([long, short, label]) => {
    const a = interp(points, long);
    const b = interp(points, short);
    return { label, bp: a != null && b != null ? Math.round((a - b) * 100) : null };
  });
}

/** Leitura simples do formato da curva (inclinada, plana, invertida) pela inclinação longa − curta. */
export function shapeOf(points, curve) {
  if (RATE_CURVES[curve]?.be) return null; // formato "invertida" não se aplica à inflação implícita
  const s = spreadsOf(points, curve)[0]?.bp;
  if (s == null) return null;
  if (s <= -25) return { id: "inv", label: "Invertida", hint: "juro curto acima do longo: historicamente antecede desaceleração" }; // prettier-ignore
  if (s < 25) return { id: "flat", label: "Plana", hint: "pouca diferença entre curto e longo" };
  return { id: "pos", label: "Positivamente inclinada", hint: "juro longo acima do curto (formato normal)" }; // prettier-ignore
}

/** Âncoras da curva dos EUA ao vivo no Yahoo: prazo (anos) -> ticker. */
export const US_LIVE = [[0.25, "^IRX"], [5, "^FVX"], [10, "^TNX"], [30, "^TYX"]]; // prettier-ignore

/**
 * Curva dos EUA ao vivo: fechamento oficial (`base`) + variação do dia (p − pc) de cada âncora do Yahoo,
 * interpolada entre as âncoras (constante antes da primeira e depois da última).
 * Só ajusta se a cotação é de um pregão posterior ao fechamento oficial (`qDate` = data NY da cotação).
 * -> { date, points, live: true, anchors } ou null (sem cotação nova).
 */
export function liveUs(base, quotes, qDate) {
  if (!base?.points?.length || !qDate || qDate <= base.date) return null;
  const anchors = US_LIVE.map(([t, sym]) => {
    const q = quotes?.[sym];
    return q && q.p > 0 && q.pc > 0 ? { t, sym, d: q.p - q.pc, p: q.p } : null;
  }).filter(Boolean);
  if (anchors.length < 2) return null;
  const dAt = (t) => interp(anchors.map((a) => ({ t: a.t, y: a.d })), Math.min(Math.max(t, anchors[0].t), anchors.at(-1).t)); // prettier-ignore
  return {
    date: qDate,
    live: true,
    anchors,
    points: base.points.map((x) => ({ ...x, y: Math.round((x.y + dAt(x.t)) * 1000) / 1000 })),
  };
}

// ---------- gráfico (SVG) ----------
/** Escala do prazo: raiz quadrada (abre os vértices curtos sem esmagar os longos). */
const sx = (t) => Math.sqrt(Math.max(0, t));
export const CURVE_COLORS = ["var(--accent, #4f8cff)", "#9aa3b2", "#f5a524", "#c084fc", "#22c55e", "#ef4444", "#14b8a6", "#e879f9"]; // prettier-ignore

/** Escala bonita do eixo y: mínimo, máximo e passo arredondados. */
export function niceRange(lo, hi) {
  if (!Number.isFinite(lo) || !Number.isFinite(hi)) return { lo: 0, hi: 1, step: 0.25 };
  if (hi - lo < 0.2) [lo, hi] = [lo - 0.1, hi + 0.1];
  const raw = (hi - lo) / 5;
  const pow = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 2, 2.5, 5, 10].map((k) => k * pow).find((s) => s >= raw);
  return { lo: Math.floor(lo / step) * step, hi: Math.ceil(hi / step) * step, step };
}

const f2 = (x) => x.toFixed(2).replace(".", decSep());
const escA = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/"/g, "&quot;");

/**
 * SVG das curvas. `series` = [{ name, points, color, dash?, width? }]; a primeira é a principal (com pontos).
 * Eixo x em raiz do prazo com marcas nos vértices de `ticks`; dica (title) em cada ponto.
 */
export function curveSvg(
  series,
  { ticks = [0.25, 1, 2, 5, 10, 20, 30], curve = "us", w = 760, h = 320 } = {},
) {
  const all = series.flatMap((s) => s.points ?? []).filter((p) => Number.isFinite(p.y) && Number.isFinite(p.t)); // prettier-ignore
  if (!all.length) return "";
  const P = { l: 44, r: 14, t: 12, b: 28 };
  const tMin = Math.min(...all.map((p) => p.t));
  const tMax = Math.max(...all.map((p) => p.t));
  const x0 = sx(Math.max(0, tMin - 0.02));
  const x1 = sx(tMax);
  const { lo, hi, step } = niceRange(Math.min(...all.map((p) => p.y)), Math.max(...all.map((p) => p.y))); // prettier-ignore
  const X = (t) => P.l + ((sx(t) - x0) / (x1 - x0 || 1)) * (w - P.l - P.r);
  const Y = (y) => P.t + ((hi - y) / (hi - lo || 1)) * (h - P.t - P.b);
  const grid = [];
  for (let v = lo; v <= hi + 1e-9; v += step)
    grid.push(`<line x1="${P.l}" x2="${w - P.r}" y1="${Y(v).toFixed(1)}" y2="${Y(v).toFixed(1)}" class="rc-grid"/><text x="${P.l - 6}" y="${(Y(v) + 3.5).toFixed(1)}" text-anchor="end" class="rc-ax">${f2(v)}%</text>`); // prettier-ignore
  const xt = ticks
    .filter((t) => t >= tMin - 0.05 && t <= tMax + 0.05)
    .map(
      (t) =>
        `<line x1="${X(t).toFixed(1)}" x2="${X(t).toFixed(1)}" y1="${P.t}" y2="${h - P.b}" class="rc-grid v"/><text x="${X(t).toFixed(1)}" y="${h - P.b + 16}" text-anchor="middle" class="rc-ax">${vertLabel(t, curve)}</text>`,
    ) // prettier-ignore
    .join("");
  const lines = [...series]
    .map((s, i) => ({ s, i }))
    .reverse() // a principal por cima
    .map(({ s, i }) => {
      const pts = (s.points ?? []).filter((p) => Number.isFinite(p.y)).sort((a, b) => a.t - b.t);
      if (!pts.length) return "";
      const d = pts.map((p, k) => `${k ? "L" : "M"}${X(p.t).toFixed(1)},${Y(p.y).toFixed(1)}`).join(""); // prettier-ignore
      const dots = pts
        .map(
          (p) =>
            `<circle cx="${X(p.t).toFixed(1)}" cy="${Y(p.y).toFixed(1)}" r="${i === 0 ? 3.2 : 2.2}" fill="${s.color}"><title>${escA(`${s.name} · ${p.label ?? vertLabel(p.t, curve)}: ${f2(p.y)}%`)}</title></circle>`,
        ) // prettier-ignore
        .join("");
      return `<path d="${d}" fill="none" stroke="${s.color}" stroke-width="${s.width ?? (i === 0 ? 2.6 : 1.6)}"${s.dash ? ` stroke-dasharray="${s.dash}"` : ""} stroke-linejoin="round"/>${dots}`; // prettier-ignore
    })
    .join("");
  return `<svg class="rc-svg" viewBox="0 0 ${w} ${h}" role="img" aria-label="Curva de juros">${grid.join("")}${xt}${lines}</svg>`;
}
