// Correlação de cada ativo com a CARTEIRA do usuário (Sinais de hoje → coluna e filtro "Correlação c/ carteira").
// Base: data/returns.json (retornos diários dos últimos ~120 pregões, gerado à noite a partir da base histórica),
// baixado uma vez só e em segundo plano. A carteira vira uma série única (média dos retornos pesada pelo valor de
// cada posição); cada ativo ganha ρ com essa série. Escala 1–5 = quintil do ρ no universo; a seta compara ρ com a
// correlação média da carteira consigo mesma (ρ̄ = Σ peso × ρ(posição, carteira)): abaixo, DIMINUI; acima, AUMENTA.
// Tudo memorizado por (data da matriz + pesos): ~900 ativos × 120 dias custam poucos milissegundos.
import { fetchJSON } from "./net.js";
import { hooks, state } from "./state.js";

const cor = { data: null, at: 0, p: null, key: "", pf: null, memo: new Map() };

/** Correlação de Pearson entre duas séries, só nos dias em que as duas têm valor (mínimo 30). */
export function pearson(a, b) {
  let n = 0, sa = 0, sb = 0, saa = 0, sbb = 0, sab = 0; // prettier-ignore
  for (let i = 0; i < a.length; i++) {
    const x = a[i], y = b[i]; // prettier-ignore
    if (x == null || y == null) continue;
    n++;
    sa += x;
    sb += y;
    saa += x * x;
    sbb += y * y;
    sab += x * y; // prettier-ignore
  }
  if (n < 30) return null;
  const va = saa - (sa * sa) / n;
  const vb = sbb - (sb * sb) / n;
  return va > 0 && vb > 0 ? (sab - (sa * sb) / n) / Math.sqrt(va * vb) : null;
}

/** Série da carteira: média pesada dos retornos de cada dia (pesos renormalizados entre quem tem o pregão). */
export function portfolioReturns(weights, r) {
  const ws = Object.entries(weights).filter(([s, w]) => w > 0 && r[s]);
  if (!ws.length) return null;
  const len = r[ws[0][0]].length;
  return Array.from({ length: len }, (_, i) => {
    let sw = 0, sx = 0; // prettier-ignore
    for (const [s, w] of ws) if (r[s][i] != null) ((sw += w), (sx += w * r[s][i]));
    return sw > 0 ? sx / sw : null;
  });
}

const LEVELS = ["Muito baixa", "Baixa", "Média", "Alta", "Muito alta"];

/**
 * Escala 1–5 = quintil do ρ no universo (1 = 20% menos correlacionados com a carteira). A seta diz o efeito: ↓ abaixo
 * do ρ médio da carteira (diminui a correlação), ↑ acima (aumenta). Rótulos numerados para ordenar no filtro.
 */
export function corBand(rho, avg, cuts) {
  const k = cuts.filter((c) => rho > c).length;
  const down = rho < avg;
  return { label: `${k + 1} · ${LEVELS[k]}`, arrow: down ? "↓" : "↑", tone: down ? (k <= 1 ? "buy" : "wait") : "sell" }; // prettier-ignore
}

/** Cortes dos quintis de uma lista de ρ. */
export function quintiles(list) {
  const v = [...list].sort((a, b) => a - b);
  return v.length
    ? [0.2, 0.4, 0.6, 0.8].map((q) => v[Math.floor(q * (v.length - 1))])
    : [0, 0, 0, 0];
}

/** Pesos da carteira (valor ao vivo; sem ele, custo). */
function weights() {
  const rows = state.valuation?.rows;
  if (rows?.length) return Object.fromEntries(rows.filter((x) => x.qty > 0).map((x) => [x.sym, x.weight ?? 0])); // prettier-ignore
  const hs = (state.portfolio?.holdings ?? []).filter((h) => h.qty > 0);
  const tot = hs.reduce((a, h) => a + h.qty * (h.avg ?? 0), 0);
  return Object.fromEntries(hs.map((h) => [h.sym, tot > 0 ? (h.qty * (h.avg ?? 0)) / tot : 0]));
}

/** Baixa a matriz uma vez (renova a cada 6 h); redesenha a tela ao chegar. */
export function loadReturns() {
  if (cor.p || (cor.data && Date.now() - cor.at < 6 * 3600_000)) return cor.p;
  cor.p = fetchJSON(`data/returns.json?d=${new Date().toISOString().slice(0, 10)}`, { bg: true })
    .then((d) => {
      if (d?.r) {
        cor.data = d;
        cor.key = "";
        hooks.render();
      }
    })
    .catch(() => {})
    .finally(() => {
      cor.at = Date.now();
      cor.p = null;
    });
  return cor.p;
}

/** Série e ρ̄ da carteira, refeitos só quando a matriz ou os pesos mudam. */
function pf() {
  if (!cor.data) return null;
  const w = weights();
  const key = `${cor.data.updated_at}|${Object.entries(w).map(([s, x]) => `${s}:${x.toFixed(3)}`).sort().join(",")}`; // prettier-ignore
  if (key === cor.key) return cor.pf;
  cor.key = key;
  cor.memo.clear();
  const r = cor.data.r;
  const series = portfolioReturns(w, r);
  if (!series) return (cor.pf = null);
  let sw = 0, sr = 0; // prettier-ignore
  for (const [s, x] of Object.entries(w)) {
    const p = r[s] ? pearson(r[s], series) : null;
    if (p != null && x > 0) ((sw += x), (sr += x * p));
  }
  const all = Object.values(r).map((x) => pearson(x, series)).filter((x) => x != null); // prettier-ignore
  return (cor.pf = { series, w, avg: sw > 0 ? sr / sw : null, cuts: quintiles(all) });
}

/** Correlação do ativo com a carteira: { rho, avg, label, arrow, tone, held } ou null. */
export function corrOf(sym) {
  const P = pf();
  if (!P || P.avg == null) return null;
  if (cor.memo.has(sym)) return cor.memo.get(sym);
  const r = cor.data.r[sym];
  const rho = r ? pearson(r, P.series) : null;
  const held = (P.w[sym] ?? 0) > 0;
  const out =
    rho == null
      ? null
      : held
        ? { rho, avg: P.avg, label: "Já na carteira", arrow: "", tone: "neutral", held }
        : { rho, avg: P.avg, ...corBand(rho, P.avg, P.cuts), held };
  cor.memo.set(sym, out);
  return out;
}

const HEDGE_NAME = /\b(short|bear|inverse|ultrashort)\b/i;

/**
 * Proteção (hedge): ativo que anda contra o mercado. Diminui a correlação da carteira, mas por proteção, não por
 * diversificação. Critério: ρ com o SPY ≤ −0,5 nos dados da matriz ou nome de ETF inverso. { spy } ou null.
 */
export function hedgeOf(sym, name = "") {
  const r = cor.data?.r;
  const spy = r?.[sym] && r.SPY ? pearson(r[sym], r.SPY) : null;
  return (spy != null && spy <= -0.5) || HEDGE_NAME.test(name) ? { spy } : null;
}
