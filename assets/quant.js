// Quant Aberto: réplica aberta das notas quant do Seeking Alpha e da carteira ProPicks (InvestingPro), a partir de
// dados públicos do Yahoo. Funções puras; especificação e critério de validação em docs/QUANT-ABERTO.md.
// Material educacional; não é recomendação de investimento.

/**
 * Fatores e métricas (v2, 12/10/2026): alinhadas às listas que o Seeking Alpha usa em cada fator (vistas na área
 * logada, `ticker_metric_grades` com algo "main_quant"; ver docs/QUANT-ABERTO.md, seção 6), dentro do que o Yahoo
 * oferece. dir +1 = maior é melhor; −1 = menor é melhor.
 */
// prettier-ignore
export const FACTORS = {
  value: { label: "Valor", metrics: [["ey", 1], ["fey", 1], ["peg", -1], ["evSalesY", 1], ["fsy", 1], ["ebitdaY", 1], ["ebitY", 1], ["sy", 1], ["by", 1], ["cfy", 1], ["dy", 1]] },
  growth: { label: "Crescimento", metrics: [["revG", 1], ["epsG", 1], ["g0y", 1], ["g1y", 1], ["rg0y", 1], ["rg1y", 1]] },
  profit: { label: "Rentabilidade", metrics: [["gm", 1], ["om", 1], ["ebitdaM", 1], ["pm", 1], ["fcfm", 1], ["roe", 1], ["roa", 1], ["ocfAbs", 1], ["niEmp", 1]] },
  mom: { label: "Momentum", metrics: [["r3", 1], ["r6", 1], ["r9", 1], ["r12", 1]] },
  rev: { label: "Revisões", metrics: [["rev0y30", 1], ["rev0y90", 1], ["rev1y30", 1], ["rev1y90", 1], ["net0y", 1], ["net1y", 1]] },
};

/** Versão do modelo (vai no diário: fotos de versões diferentes não se comparam). */
export const MODEL_VERSION = 2;

/** Pesos da nota final (registrados antes do diário; ver docs/QUANT-ABERTO.md). */
export const WEIGHTS = { mom: 0.25, rev: 0.25, profit: 0.2, value: 0.15, growth: 0.15 };

/** Notas por percentil dentro do setor (13 degraus, como o A+…F do Seeking Alpha). */
// prettier-ignore
export const GRADES = [[95, "A+"], [88, "A"], [80, "A-"], [72, "B+"], [64, "B"], [56, "B-"], [48, "C+"], [40, "C"], [32, "C-"], [24, "D+"], [16, "D"], [8, "D-"], [0, "F"]];

// prettier-ignore
export const RATINGS = [[4.5, "Compra forte", "buy"], [3.5, "Compra", "buy"], [2.5, "Manter", "wait"], [1.5, "Venda", "sell"], [-Infinity, "Venda forte", "sell"]];

const MIN_SECTOR = 8; // setor com menos ações válidas que isso é comparado com o universo todo
const CAP = 3.49; // teto "Manter" para quem tem fator desqualificante

const fin = (x) => typeof x === "number" && Number.isFinite(x);
const ratio = (a, b) => (fin(a) && fin(b) && b !== 0 ? a / b : null);

/** Nota (letra) de um percentil 0–100. */
export function grade(p) {
  if (!fin(p)) return null;
  return GRADES.find(([min]) => p >= min)[1];
}

/** Classificação (rótulo e tom) de uma nota 1–5. */
export function ratingOf(score) {
  if (!fin(score)) return null;
  const [, label, tone] = RATINGS.find(([min]) => score >= min);
  return { label, tone };
}

/**
 * Percentil 0–100 de cada valor (empates levam a média dos postos). Nulos ficam nulos.
 * Um único valor válido vale 50.
 */
export function pctRank(values) {
  const idx = values.map((v, i) => [v, i]).filter(([v]) => fin(v));
  const out = values.map(() => null);
  const n = idx.length;
  if (!n) return out;
  idx.sort((a, b) => a[0] - b[0]);
  for (let i = 0; i < n;) {
    let j = i;
    while (j + 1 < n && idx[j + 1][0] === idx[i][0]) j++;
    const p = n === 1 ? 50 : (((i + j) / 2) * 100) / (n - 1);
    for (let k = i; k <= j; k++) out[idx[k][1]] = p;
    i = j + 1;
  }
  return out;
}

/**
 * Métricas derivadas do resumo bruto do Yahoo (`raw`, montado pelo script) e dos fechamentos semanais.
 * Rendimentos (lucro/preço, EBITDA/EV…) em vez de múltiplos: lucro negativo vira número baixo, não some.
 */
export function deriveMetrics(raw, weekly = []) {
  const r = raw ?? {};
  const w = (weekly ?? []).filter(fin);
  const last = w.at(-1);
  const back = (k) => (w.length > k ? w[w.length - 1 - k] : null);
  const ret = (a, b) => (fin(a) && fin(b) && b > 0 ? a / b - 1 : null);
  const trend = (cur, old) => (fin(cur) && fin(old) && Math.abs(old) > 1e-9 ? (cur - old) / Math.abs(old) : null); // prettier-ignore
  const net = (up, down) => (fin(up) && fin(down) && up + down > 0 ? (up - down) / (up + down) : null); // prettier-ignore
  const price = fin(r.price) ? r.price : last;
  const high = w.length ? Math.max(...w.slice(-52)) : null;
  return {
    ey: ratio(r.trailingEps, price),
    fey: ratio(r.forwardEps, price),
    ebitdaY: fin(r.evEbitda) && r.evEbitda !== 0 ? 1 / r.evEbitda : null,
    sy: fin(r.ps) && r.ps > 0 ? 1 / r.ps : null,
    by: fin(r.pb) && r.pb !== 0 ? 1 / r.pb : null,
    fcfy: ratio(r.fcf, r.mcap),
    peg: fin(r.peg) && r.peg > 0 ? r.peg : null,
    evSalesY: fin(r.evRev) && r.evRev > 0 ? 1 / r.evRev : null,
    fsy: ratio(r.rev0yAvg, r.mcap),
    ebitY: ratio(fin(r.om) && fin(r.revenue) ? r.om * r.revenue : null, r.ev),
    cfy: ratio(r.ocf, r.mcap),
    dy: fin(r.price) || fin(r.mcap) ? (r.dy ?? 0) : null, // quem não paga dividendo fica com 0
    revG: r.revG ?? null,
    epsG: r.epsG ?? null,
    g0y: r.g0y ?? null,
    g1y: r.g1y ?? null,
    rg0y: r.rg0y ?? null,
    rg1y: r.rg1y ?? null,
    gm: r.gm ?? null,
    om: r.om ?? null,
    pm: r.pm ?? null,
    roe: r.roe ?? null,
    roa: r.roa ?? null,
    fcfm: ratio(r.fcf, r.revenue),
    ebitdaM: r.ebitdaM ?? null,
    ocfAbs: fin(r.ocf) ? r.ocf / 1e9 : null, // caixa operacional em US$ bi: o SA premia porte
    niEmp: ratio(fin(r.ni) ? r.ni / 1e3 : null, r.emp),
    r3: ret(last, back(13)),
    r6: ret(last, back(26)),
    r9: ret(last, back(39)),
    r12: ret(last, back(52)),
    r12_1: ret(back(4), back(52)),
    ma200: ret(price, r.ma200),
    hi52: ret(price, high),
    rev0y30: trend(r.e0y, r.e0y30),
    rev0y90: trend(r.e0y, r.e0y90),
    rev1y30: trend(r.e1y, r.e1y30),
    rev1y90: trend(r.e1y, r.e1y90),
    net0y: net(r.up0y, r.down0y),
    net1y: net(r.up1y, r.down1y),
  };
}

/** Percentis de uma métrica dentro de cada grupo (setor); grupo pequeno usa o universo. */
function groupPct(rows, get) {
  const all = pctRank(rows.map(get));
  const out = [...all];
  const by = new Map();
  rows.forEach((r, i) => by.set(r.sector, [...(by.get(r.sector) ?? []), i]));
  for (const idx of by.values()) {
    const vals = idx.map((i) => get(rows[i]));
    if (vals.filter(fin).length < MIN_SECTOR) continue;
    pctRank(vals).forEach((p, k) => (out[idx[k]] = p));
  }
  return out;
}

const mean = (xs) => {
  const v = xs.filter(fin);
  return v.length ? v.reduce((a, b) => a + b, 0) / v.length : null;
};

/**
 * Nota de todo o universo. `rows`: [{ sym, sector, m: métricas de deriveMetrics }].
 * Devolve cópias com `f` (percentil de cada fator no setor), `g` (letras), `composite`, `score` 1–5, `rating`,
 * `capped` (teto "Manter") e `health` 1–5 (estilo "saúde financeira" do InvestingPro).
 */
export function scoreUniverse(rows, weights = WEIGHTS) {
  const f = {};
  for (const [key, def] of Object.entries(FACTORS)) {
    const per = def.metrics.map(([m, dir]) =>
      groupPct(rows, (r) => (fin(r.m?.[m]) ? dir * r.m[m] : null)),
    );
    const need = Math.ceil(def.metrics.length / 2);
    const raw = rows.map((_, i) => {
      const ps = per.map((p) => p[i]).filter(fin);
      return ps.length >= need ? mean(ps) : null;
    });
    f[key] = groupPct(
      rows.map((r, i) => ({ sector: r.sector, v: raw[i] })),
      (x) => x.v,
    );
  }
  const comp = rows.map((_, i) => {
    let s = 0;
    let wsum = 0;
    for (const [k, w] of Object.entries(weights)) {
      if (fin(f[k][i])) {
        s += w * f[k][i];
        wsum += w;
      }
    }
    const n = Object.keys(weights).filter((k) => fin(f[k][i])).length;
    return n >= 3 && fin(f.mom[i]) ? s / wsum : null;
  });
  const q = pctRank(comp);
  const cfm = groupPct(rows, (x) => x.m?.fcfm ?? null);
  const cfy = groupPct(rows, (x) => x.m?.fcfy ?? null);
  return rows.map((r, i) => {
    const fi = Object.fromEntries(Object.keys(FACTORS).map((k) => [k, f[k][i]]));
    const g = Object.fromEntries(Object.entries(fi).map(([k, p]) => [k, grade(p)]));
    const weak =
      ["mom", "growth", "rev"].some((k) => fin(fi[k]) && fi[k] < 32) ||
      ["value", "profit"].some((k) => fin(fi[k]) && fi[k] < 16);
    let score = fin(q[i]) ? 1 + (4 * q[i]) / 100 : null;
    const capped = fin(score) && weak && score > CAP;
    if (capped) score = CAP;
    const cash = mean([cfm[i], cfy[i]]);
    const hp = mean([fi.value, fi.growth, fi.profit, fi.mom, cash]);
    return {
      ...r,
      f: fi,
      g,
      composite: comp[i],
      score: fin(score) ? Math.round(score * 100) / 100 : null,
      rating: ratingOf(score),
      capped,
      health: fin(hp) ? Math.round((1 + (4 * hp) / 100) * 100) / 100 : null,
    };
  });
}

/** Rótulo da "saúde financeira" 1–5 (aproximação aberta do Financial Health do InvestingPro). */
export function healthLabel(h) {
  if (!fin(h)) return null;
  return h >= 4 ? "Excelente" : h >= 3.25 ? "Ótima" : h >= 2.5 ? "Boa" : h >= 1.75 ? "Razoável" : "Fraca"; // prettier-ignore
}

/**
 * Carteira Top N no estilo ProPicks "Beat the S&P 500": pesos iguais, troca mensal, só nota ≥ 3,5 (Compra ou melhor),
 * no máximo `maxPerSector` por setor. Quem já estava e segue entre os `buffer` melhores fica (menos giro).
 */
export function topPicks(scored, { n = 20, maxPerSector = 4, prev = [], buffer = 40 } = {}) {
  const ok = scored
    .filter((r) => fin(r.score) && r.score >= 3.5)
    .sort((a, b) => b.score - a.score || a.sym.localeCompare(b.sym));
  const rank = new Map(ok.map((r, i) => [r.sym, i]));
  const out = [];
  const per = new Map();
  // mesma empresa com duas classes de ação (GOOG/GOOGL, FOX/FOXA, NWS/NWSA) entra uma vez só
  const co = (r) => (r.name ?? r.sym).replace(/\s*\(Class [A-Z]\)/i, "").trim();
  const add = (r) => {
    if (out.length >= n || out.some((x) => x.sym === r.sym || co(x) === co(r))) return;
    if ((per.get(r.sector) ?? 0) >= maxPerSector) return;
    out.push(r);
    per.set(r.sector, (per.get(r.sector) ?? 0) + 1);
  };
  for (const s of prev) {
    const i = rank.get(s);
    if (i !== undefined && i < buffer) add(ok[i]);
  }
  for (const r of ok) add(r);
  return out.map((r) => r.sym);
}

/** Correlação de postos (Spearman) entre duas listas pareadas. */
export function spearman(a, b) {
  const pairs = a.map((x, i) => [x, b[i]]).filter(([x, y]) => fin(x) && fin(y));
  if (pairs.length < 5) return null;
  const ra = pctRank(pairs.map((p) => p[0]));
  const rb = pctRank(pairs.map((p) => p[1]));
  const ma = mean(ra);
  const mb = mean(rb);
  let num = 0;
  let da = 0;
  let db = 0;
  for (let i = 0; i < ra.length; i++) {
    num += (ra[i] - ma) * (rb[i] - mb);
    da += (ra[i] - ma) ** 2;
    db += (rb[i] - mb) ** 2;
  }
  return da && db ? num / Math.sqrt(da * db) : null;
}

const COST = 0.0005; // por perna, como nos outros estudos

/**
 * Resultado do diário mensal (fora da amostra). `journal`: [{ d, top:[sym], s:{sym:nota}, px:{sym:preço}, spy }]
 * em ordem de data. Cada par de fotos consecutivas vira um mês: retorno da Top N (pesos iguais, menos o custo do
 * giro), do SPY e da média do universo; IC de Spearman da nota × retorno; quintil 5 − quintil 1.
 */
export function evalJournal(journal) {
  const months = [];
  for (let i = 1; i < (journal ?? []).length; i++) {
    const a = journal[i - 1];
    const b = journal[i];
    if ((a.v ?? 1) !== (b.v ?? 1)) continue; // modelo mudou: não mistura versões
    const syms = Object.keys(a.s ?? {}).filter((s) => fin(a.px?.[s]) && fin(b.px?.[s]));
    const ret = Object.fromEntries(syms.map((s) => [s, b.px[s] / a.px[s] - 1]));
    const topR = mean((a.top ?? []).map((s) => ret[s]));
    const prevTop = i >= 2 ? (journal[i - 2].top ?? []) : [];
    const changed = (a.top ?? []).filter((s) => !prevTop.includes(s)).length;
    const turn = (a.top ?? []).length ? changed / a.top.length : 0;
    const topNet = fin(topR) ? topR - 2 * COST * turn : null;
    const spy = fin(a.spy) && fin(b.spy) ? b.spy / a.spy - 1 : null;
    const scores = syms.map((s) => a.s[s]);
    const rets = syms.map((s) => ret[s]);
    const ord = syms.filter((s) => fin(a.s[s])).sort((x, y) => a.s[x] - a.s[y]);
    const k = Math.floor(ord.length / 5);
    const q1 = k ? mean(ord.slice(0, k).map((s) => ret[s])) : null;
    const q5 = k ? mean(ord.slice(-k).map((s) => ret[s])) : null;
    months.push({
      from: a.d,
      to: b.d,
      top: topNet,
      spy,
      univ: mean(rets),
      excess: fin(topNet) && fin(spy) ? topNet - spy : null,
      ic: spearman(scores, rets),
      spread: fin(q1) && fin(q5) ? q5 - q1 : null,
      n: syms.length,
    });
  }
  const ics = months.map((m) => m.ic).filter(fin);
  const icMean = mean(ics);
  const sd =
    ics.length > 1
      ? Math.sqrt(ics.reduce((s, x) => s + (x - icMean) ** 2, 0) / (ics.length - 1))
      : null;
  const comp = (k) => months.reduce((acc, m) => (fin(m[k]) ? acc * (1 + m[k]) : acc), 1) - 1;
  const summary = {
    months: months.length,
    topCum: comp("top"),
    spyCum: comp("spy"),
    icMean,
    icT: fin(icMean) && sd ? (icMean / sd) * Math.sqrt(ics.length) : null,
    icHit: ics.length ? ics.filter((x) => x > 0).length / ics.length : null,
    spreadMean: mean(months.map((m) => m.spread)),
  };
  // critério registrado antes (docs/QUANT-ABERTO.md): 12+ meses, Top N acima do SPY, IC > 0 com t ≥ 2, spread > 0
  summary.verdict =
    summary.months < 12
      ? "em observação"
      : summary.topCum > summary.spyCum && summary.icT >= 2 && summary.spreadMean > 0
        ? "aprovado"
        : "reprovado";
  return { months, summary };
}
