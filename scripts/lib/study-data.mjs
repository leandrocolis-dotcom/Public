// Utilitários comuns dos estudos da Fase 8 (docs/MODELO-UNICO.md): dados do Yahoo, CDI, médias, ATR e métricas.
import { readFile } from "node:fs/promises";

export const MACRO = new Set(["VIX", "DXY", "US10Y", "US3M", "WTI", "USDJPY", "USDBRL"]);

/** OHLC diário ajustado do Yahoo (até `years` anos). */
export async function chart(sym, years = 11) {
  const p2 = Math.floor(Date.now() / 1000);
  const p1 = p2 - years * 365 * 86400;
  const u = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(sym)}?period1=${p1}&period2=${p2}&interval=1d`;
  const j = (await (await fetch(u, { headers: { "User-Agent": "Mozilla/5.0" }, signal: AbortSignal.timeout(20000) })).json()).chart?.result?.[0]; // prettier-ignore
  const q = j?.indicators?.quote?.[0];
  const adj = j?.indicators?.adjclose?.[0]?.adjclose;
  if (!j?.timestamp || !q) throw new Error("sem dados");
  const o = { dates: [], o: [], h: [], l: [], c: [] };
  j.timestamp.forEach((t, i) => {
    const c = q.close[i];
    if (!(c > 0) || !(q.high[i] > 0) || !(q.low[i] > 0)) return;
    const f = adj?.[i] > 0 ? adj[i] / c : 1;
    o.dates.push(new Date(t * 1000).toISOString().slice(0, 10));
    o.o.push((q.open[i] || c) * f);
    o.h.push(q.high[i] * f);
    o.l.push(q.low[i] * f);
    o.c.push(c * f);
  });
  return o;
}

/** Barras do data/ohlc.json local (~2 anos; só para testar código). */
export async function localBars() {
  const f = JSON.parse(await readFile(new URL("../../data/ohlc.json", import.meta.url), "utf8"));
  const bars = {};
  for (const [code, b] of Object.entries(f.bars)) {
    if (MACRO.has(code) || !b?.c) continue;
    bars[code] = { dates: f.dates.slice(-b.c.length), o: b.o, h: b.h, l: b.l, c: b.c };
  }
  return bars;
}

/** Juro diário do T-bill (^IRX) por data, como fração ao dia. */
export async function tbill() {
  const m = new Map();
  try {
    const r = await chart("^IRX");
    r.dates.forEach((d, i) => m.set(d, r.c[i] / 100 / 252));
  } catch {
    /* sem T-bill: caixa a 0% */
  }
  return m;
}

/** CDI diário (fração ao dia) do Banco Central, série SGS 12. */
export async function cdi(years = 11) {
  const m = new Map();
  const fmt = (d) => `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}/${d.getFullYear()}`; // prettier-ignore
  const end = new Date();
  // a API limita a 10 anos por consulta: busca em blocos de 5 anos
  for (let y = years; y > 0; y -= 5) {
    const a = new Date(end.getTime() - y * 365 * 86400000);
    const b = new Date(end.getTime() - Math.max(0, y - 5) * 365 * 86400000);
    try {
      const u = `https://api.bcb.gov.br/dados/serie/bcdata.sgs.12/dados?formato=json&dataInicial=${fmt(a)}&dataFinal=${fmt(b)}`;
      const j = await (await fetch(u, { signal: AbortSignal.timeout(20000) })).json();
      for (const r of j) {
        const [dd, mm, yy] = r.data.split("/");
        m.set(`${yy}-${mm}-${dd}`, Number(r.valor) / 100);
      }
    } catch {
      /* bloco sem CDI: caixa a 0% nesses dias */
    }
  }
  return m;
}

/** Função de juro por data que repete o último valor conhecido. */
export function rateOf(map) {
  let last = 0;
  return (d) => {
    if (map.has(d)) last = map.get(d);
    return last;
  };
}

export const sma = (c, n) => {
  const out = [];
  let s = 0;
  c.forEach((x, i) => {
    s += x - (i >= n ? c[i - n] : 0);
    out.push(i >= n - 1 ? s / n : null);
  });
  return out;
};

export function atr(b, n) {
  const out = new Array(b.c.length).fill(null);
  let a = null;
  for (let i = 1; i < b.c.length; i++) {
    const tr = Math.max(
      b.h[i] - b.l[i],
      Math.abs(b.h[i] - b.c[i - 1]),
      Math.abs(b.l[i] - b.c[i - 1]),
    );
    if (i < n) a = (a ?? 0) + tr / n;
    else a = (a * (n - 1) + tr) / n;
    if (i >= n - 1) out[i] = a;
  }
  return out;
}

export const isMonthEnd = (dates, i) =>
  i + 1 >= dates.length || dates[i + 1].slice(0, 7) !== dates[i].slice(0, 7);

/** Métricas de uma série diária [{d, r}]; `regime(d)` devolve true (alta), false (baixa) ou null. */
export function metrics(rets, regime = () => null) {
  let eq = 1;
  let peak = 1;
  let dd = 0;
  const up = [];
  const dn = [];
  for (const { d, r } of rets) {
    eq *= 1 + r;
    peak = Math.max(peak, eq);
    dd = Math.min(dd, eq / peak - 1);
    const g = regime(d);
    if (g === true) up.push(r);
    else if (g === false) dn.push(r);
  }
  const n = rets.length;
  const mean = rets.reduce((a, b) => a + b.r, 0) / n;
  const sd = Math.sqrt(rets.reduce((a, b) => a + (b.r - mean) ** 2, 0) / (n - 1));
  const ann = (l) => (l.length ? (l.reduce((a, b) => a + b, 0) / l.length) * 252 : null);
  const cagr = eq ** (252 / n) - 1;
  return {
    cagr,
    dd,
    retDd: dd ? cagr / Math.abs(dd) : null,
    vol: sd * Math.sqrt(252),
    sharpe: sd ? (mean / sd) * Math.sqrt(252) : null,
    annUp: ann(up),
    annDn: ann(dn),
  };
}

export const pc = (x) => (Number.isFinite(x) ? `${(x * 100).toFixed(1)}%` : "—");
export const f2 = (x) => (Number.isFinite(x) ? x.toFixed(2) : "—");
export const yn = (b) => (b ? "sim" : "não");
