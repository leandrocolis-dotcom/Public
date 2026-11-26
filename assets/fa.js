// Análise fundamentalista (aba Valor): funções puras sobre data/fundamentals.json e data/prices.json.
// Teoria e fórmulas: docs/ANALISE-FUNDAMENTALISTA.md e docs/ROADMAP-VALOR.md.
import { ASSETS } from "./universe.js";

/** Fração dos valores <= x (0 a 1). */
export function percentile(arr, x) {
  const xs = arr.filter(Number.isFinite);
  if (!xs.length || !Number.isFinite(x)) return null;
  return xs.filter((v) => v <= x).length / xs.length;
}

/** Interpolação linear por pontos [x, y] ordenados por x; satura nas pontas. */
export function interp(points, x) {
  if (x <= points[0][0]) return points[0][1];
  for (let i = 1; i < points.length; i++) {
    const [x0, y0] = points[i - 1];
    const [x1, y1] = points[i];
    if (x <= x1) return y0 + ((y1 - y0) * (x - x0)) / (x1 - x0);
  }
  return points.at(-1)[1];
}

/** Regressão linear simples y = a + b·x. */
export function linreg(xs, ys) {
  const n = xs.length;
  const mx = xs.reduce((s, v) => s + v, 0) / n;
  const my = ys.reduce((s, v) => s + v, 0) / n;
  let sxy = 0;
  let sxx = 0;
  for (let i = 0; i < n; i++) {
    sxy += (xs[i] - mx) * (ys[i] - my);
    sxx += (xs[i] - mx) ** 2;
  }
  const b = sxx ? sxy / sxx : 0;
  return { a: my - b * mx, b };
}

export const clamp = (v, lo = 0, hi = 100) => Math.min(hi, Math.max(lo, v));

export function label(score, broken = false) {
  if (broken) return "Relação quebrada";
  if (score === null || !Number.isFinite(score)) return "Sem dado";
  return score >= 70 ? "Barato" : score <= 30 ? "Caro" : "Neutro";
}

/** Anos cobertos por uma lista de datas ISO. */
export function yearsOf(dates) {
  if (!dates?.length) return 0;
  return (Date.parse(dates.at(-1)) - Date.parse(dates[0])) / (365.25 * 864e5);
}

/** Valor da série (datas ISO crescentes) na data d ou na última anterior. */
export function asOf(dates, values, d) {
  let lo = 0;
  let hi = dates.length - 1;
  if (hi < 0 || d < dates[0]) return null;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (dates[mid] <= d) lo = mid;
    else hi = mid - 1;
  }
  return values[lo];
}

const last = (s) => (s?.values?.length ? s.values.at(-1) : null);

/** Bolsa EUA: prêmio de risco = rendimento do lucro (1/PL) − juro real 10a. */
export function equityCard(spy, real, capeScore = null) {
  const pe = spy?.pe?.at(-1);
  const r = last(real);
  if (!pe || r === null) return { id: "SPY", score: null };
  const ey = 100 / pe;
  const erp = ey - r;
  const hist = spy.pe.length >= 500;
  if (capeScore !== null && !hist)
    return { id: "SPY", score: clamp(capeScore), pe, ey, real: r, erp, method: "CAPE" };
  const score = hist
    ? 100 * percentile(spy.pe.map((p, i) => 100 / p - (asOf(real.dates, real.values, spy.dates[i]) ?? r)), erp)
    : interp([[1, 15], [2, 35], [4, 85]], erp); // prettier-ignore
  return {
    id: "SPY",
    score: clamp(score),
    pe,
    ey,
    real: r,
    erp,
    method: hist ? "percentil" : "faixas",
  };
}

/** CAPE de Shiller: Excess CAPE Yield (1/CAPE − juro real, definição de Shiller) contra todo o histórico.
 *  ECY alto = bolsa barata em relação aos títulos. Retorno real esperado de 10 anos ≈ 1/CAPE (estimativa grosseira). */
export function capeCard(cape, real) {
  const c = cape?.values?.at(-1);
  if (!c) return { id: "CAPE", score: null };
  const cy = 100 / c;
  const ecys = (cape.ecy ?? []).filter(Number.isFinite);
  const ecy = cape.ecy?.at(-1);
  const r = last(real);
  const score = Number.isFinite(ecy) && ecys.length > 120 ? 100 * percentile(ecys, ecy) : null;
  return {
    id: "CAPE",
    score: score === null ? null : clamp(score),
    cape: c,
    capePct: percentile(cape.values, c),
    cy,
    ecy: Number.isFinite(ecy) ? ecy : null,
    ecyNow: r === null ? null : cy - r,
    r10: cy,
    since: cape.dates[0].slice(0, 4),
    asOf: cape.dates.at(-1),
  };
}

/** Crédito: spread alto = risco já pago = barato. */
export function creditCard(id, oas) {
  const v = last(oas);
  if (v === null) return { id, score: null };
  return { id, score: clamp(100 * percentile(oas.values, v)), oas: v, years: yearsOf(oas.dates) };
}

/** Treasuries: juro real alto e curva positiva = barato. Curva vem de data/prices.json. */
export function treasuryCard(real, us10y, us3m) {
  const r = last(real);
  if (r === null) return { id: "TLT", score: null };
  const pr = percentile(real.values, r);
  let slope = null;
  let ps = null;
  if (us10y?.length && us3m?.length) {
    const n = Math.min(us10y.length, us3m.length);
    const curve = Array.from({ length: n }, (_, i) => us10y.at(i - n) - us3m.at(i - n));
    slope = curve.at(-1);
    ps = percentile(curve, slope);
  }
  const score = ps === null ? 100 * pr : 100 * (0.7 * pr + 0.3 * ps);
  return { id: "TLT", score: clamp(score), real: r, slope, years: yearsOf(real.dates) };
}

/** Ouro: resíduo de ln(GLD) contra o juro real (semanal). Resíduo alto = caro para o juro real. */
export function goldCard(real, dates, gld) {
  if (!real?.dates?.length || !gld?.length) return { id: "GLD", score: null };
  const xs = [];
  const ys = [];
  for (let i = 0; i < real.dates.length; i++) {
    const p = asOf(dates, gld, real.dates[i]);
    if (real.dates[i] >= dates[0] && p > 0) {
      xs.push(real.values[i]);
      ys.push(Math.log(p));
    }
  }
  if (xs.length < 52) return { id: "GLD", score: null };
  const { a, b } = linreg(xs, ys);
  // Teoria: ouro cai quando o juro real sobe (b < 0). Se a janela mostra o contrário, o modelo não vale.
  if (b >= 0)
    return { id: "GLD", score: null, broken: true, beta: b, real: last(real), weeks: xs.length };
  const res = ys.map((y, i) => y - (a + b * xs[i]));
  const sd = Math.sqrt(res.reduce((s, v) => s + v * v, 0) / (res.length - 1));
  const now = Math.log(gld.at(-1)) - (a + b * last(real));
  const z = sd ? now / sd : 0;
  return { id: "GLD", score: clamp(50 - 15 * z), z, beta: b, real: last(real), weeks: xs.length };
}

/** Os 6 cards da aba Valor. `fund` = data/fundamentals.json; `prices` = data/prices.json. */
export function valueCards(fund, prices) {
  const f = fund?.fred ?? {};
  const s = prices?.series ?? {};
  const cape = capeCard(fund?.cape, f.DFII10);
  return [
    equityCard(fund?.spy, f.DFII10, cape.score),
    cape,
    creditCard("HYG", f.BAMLH0A0HYM2),
    creditCard("EMB", f.BAMLEMCBPIOAS),
    treasuryCard(f.DFII10, s.US10Y, s.US3M),
    goldCard(f.DFII10, prices?.dates ?? [], s.GLD),
  ].map((c) => ({ ...c, label: label(c.score, c.broken) }));
}

/** Setores cujo lucro vai a zero no ciclo: P/L engana. */
export const CYCLICAL = new Set(["XLE", "XLB", "KRE", "GDX", "COPX"]);

/** Grupo de comparação: "EUA" (ações EUA e setores) ou "Global". */
export const peerGroup = (sym) =>
  ["Ações EUA", "Setores"].includes(ASSETS[sym]?.group) ? "EUA" : "Global";

const MIN_HIST = 250; // ~1 ano de pregões para usar o percentil do próprio ativo

/** Valuation por ETF de ações: rendimento do lucro, dividend yield, desconto vs. SPY e placar.
 *  Placar = percentil do próprio rendimento do lucro (com >= 250 pontos) ou, antes disso, posição entre os pares do grupo. */
export function etfValuation(etf, group = peerGroup) {
  const rows = Object.entries(etf ?? {}).map(([sym, h]) => {
    const pe = h.pe?.at(-1) ?? null;
    const eys = (h.pe ?? []).filter((p) => p > 0).map((p) => 100 / p);
    return {
      sym,
      pe,
      ey: pe ? 100 / pe : null,
      dy: h.dy?.at(-1) ?? null,
      pb: h.pb?.at(-1) ?? null,
      eys,
      group: group(sym),
    };
  });
  const spyPe = rows.find((r) => r.sym === "SPY")?.pe ?? null;
  return rows
    .map((r) => {
      let score = null;
      let base = null;
      if (r.ey !== null && r.eys.length >= MIN_HIST) {
        score = 100 * percentile(r.eys, r.ey);
        base = "histórico";
      } else if (r.ey !== null) {
        const peers = rows.filter((x) => x.group === r.group && x.ey !== null).map((x) => x.ey);
        if (peers.length >= 3) {
          // posição entre os pares: 0 = mais caro do grupo, 100 = mais barato
          score = (100 * (percentile(peers, r.ey) * peers.length - 1)) / (peers.length - 1);
          base = "pares";
        }
      }
      return {
        sym: r.sym,
        name: ASSETS[r.sym]?.name ?? r.sym,
        group: r.group,
        pe: r.pe,
        ey: r.ey,
        dy: r.dy,
        pb: r.pb,
        vsSpy: r.pe && spyPe && r.sym !== "SPY" ? r.pe / spyPe - 1 : null,
        score: score === null ? null : clamp(score),
        base,
        cyclical: CYCLICAL.has(r.sym),
        label: label(score),
      };
    })
    .sort((a, b) => (b.score ?? -1) - (a.score ?? -1));
}

/** Validação de data/fundamentals.json (scripts/verify-data.mjs). Só alertas: o arquivo é opcional. */
export function checkFundamentals(fund, today = null) {
  const g = "fundamentals.json";
  const out = [];
  const series = [
    ...Object.entries(fund?.fred ?? {}).map(([k, v]) => [k, v.dates, v.values]),
    ...(fund?.cape ? [["CAPE", fund.cape.dates, fund.cape.values]] : []),
  ];
  const bad = series.filter(
    ([, d, v]) =>
      !d?.length ||
      d.length !== v?.length ||
      d.some((x, i) => i && x <= d[i - 1]) ||
      v.some((x) => !Number.isFinite(x)),
  );
  out.push({
    group: g,
    label: "Séries",
    level: bad.length ? "warn" : "ok",
    detail: bad.length
      ? `com problema: ${bad.map(([k]) => k).join(", ")}`
      : `${series.length} séries ok`,
  });
  const etfs = Object.entries(fund?.etf ?? {});
  const badEtf = etfs.filter(([, h]) => [h.pe, h.dy].some((a) => a?.length !== h.dates?.length));
  out.push({
    group: g,
    label: "ETFs",
    level: badEtf.length || !etfs.length ? "warn" : "ok",
    detail: badEtf.length
      ? `tamanhos diferentes: ${badEtf.map(([k]) => k).join(", ")}`
      : `${etfs.length} ETFs`,
  });
  const upd = fund?.meta?.updated_at;
  const age = upd && today ? (Date.parse(today) - Date.parse(upd)) / 864e5 : 0;
  out.push({
    group: g,
    label: "Atualização",
    level: !upd || age > 10 ? "warn" : "ok",
    detail: upd
      ? `${upd}${fund.meta.errors?.length ? ` · avisos: ${fund.meta.errors.length}` : ""}`
      : "sem data",
  });
  return out;
}
