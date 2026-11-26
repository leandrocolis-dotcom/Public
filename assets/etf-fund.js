// Fundamentos de ETFs por classe. Teoria: docs/ANALISE-FUNDAMENTALISTA.md, seção "ETFs".
// Princípio: o fundamento de um ETF é o fundamento do que ele carrega, menos o custo da estrutura.
//  - ações: múltiplos da carteira do fundo (look-through do Yahoo, topHoldings) contra o S&P 500;
//  - alavancados/inversos: nota do ativo de referência (espelhada no inverso) menos o custo de carregar
//    (perda por volatilidade ≈ L(L−1)/2·σ² ao ano + taxa);
//  - renda fixa: taxa ÷ duration (quanto o juro pode subir em 12 meses sem prejuízo), prêmio sobre o caixa e juro real;
//  - ouro: juro real (custo de oportunidade de um ativo que não rende);
//  - outras commodities, volatilidade: sem fundamento calculável (só técnico e momentum).
// Funções puras: usadas no navegador (análise) e no servidor (api/analyze decide o que buscar).
import { decSep } from "./format.js";
import { interp } from "./fa.js";

const avg = (xs) => {
  const v = xs.filter(Number.isFinite);
  return v.length ? v.reduce((a, b) => a + b, 0) / v.length : null;
};
const clamp = (x) => Math.max(0, Math.min(100, x));
const pct = (x, d = 1) =>
  Number.isFinite(x) ? `${(x * 100).toFixed(d).replace(".", decSep())}%` : "–";
const n1 = (x, d = 1) => (Number.isFinite(x) ? x.toFixed(d).replace(".", decSep()) : "–"); // duration pode faltar (ex.: BOXX)

/** Alavancados/inversos conhecidos: ativo de referência e alavancagem diária. */
const LEV = {
  NVDL: ["NVDA", 2], NVDU: ["NVDA", 2], AMDG: ["AMD", 2], CRWL: ["CRWD", 2], UCYB: ["CIBR", 2],
  TQQQ: ["QQQ", 3], SQQQ: ["QQQ", -3], QLD: ["QQQ", 2], PSQ: ["QQQ", -1],
  SPXL: ["SPY", 3], UPRO: ["SPY", 3], SSO: ["SPY", 2], SPXS: ["SPY", -3], SPXU: ["SPY", -3], SH: ["SPY", -1],
  SOXL: ["SOXX", 3], SOXS: ["SOXX", -3], TECL: ["XLK", 3], TECS: ["XLK", -3],
  TNA: ["IWM", 3], TZA: ["IWM", -3], UDOW: ["DIA", 3], SDOW: ["DIA", -3],
  FAS: ["XLF", 3], FAZ: ["XLF", -3], LABU: ["XBI", 3], LABD: ["XBI", -3],
  ERX: ["XLE", 2], ERY: ["XLE", -2], GUSH: ["XOP", 2], DRIP: ["XOP", -2],
  NUGT: ["GDX", 2], DUST: ["GDX", -2], YINN: ["FXI", 3], YANG: ["FXI", -3],
  KORU: ["EWY", 3], BRZU: ["EWZ", 2],
  TMF: ["TLT", 3], TMV: ["TLT", -3], TBT: ["TLT", -2], TTT: ["TLT", -3], TBF: ["TLT", -1], UBT: ["TLT", 2],
}; // prettier-ignore

/** { under, lev } de um alavancado/inverso: tabela acima ou nome ("2x Long NVDA", "Daily NVDA Bull 2X"). */
export function leverageOf(sym, name) {
  if (LEV[sym]) return { under: LEV[sym][0], lev: LEV[sym][1] };
  const s = String(name ?? "");
  let m = s.match(/(\d(?:\.\d+)?)\s*x\s+(long|short)\s+([A-Z]{1,5})\b/i);
  if (m) return { under: m[3].toUpperCase(), lev: (m[2].toLowerCase() === "short" ? -1 : 1) * Number(m[1]) }; // prettier-ignore
  m = s.match(/daily\s+([A-Z]{1,5})\s+(bull|bear)\s+(\d(?:\.\d+)?)\s*x/i);
  if (m) return { under: m[1].toUpperCase(), lev: (m[2].toLowerCase() === "bear" ? -1 : 1) * Number(m[3]) }; // prettier-ignore
  return null;
}

/** Duration (anos) de ETFs de renda fixa comuns, quando o Yahoo não informa. */
const DUR = {
  TLT: 16.5, VGLT: 15, SPTL: 15, EDV: 24, ZROZ: 26, TLH: 11.5, IEF: 7, VGIT: 5, IEI: 4.3, GOVT: 6,
  SHY: 1.9, VGSH: 1.9, SCHO: 1.9, BIL: 0.1, SGOV: 0.1, SHV: 0.3, AGG: 6, BND: 6, SCHZ: 6,
  LQD: 8.3, VCIT: 6, VCSH: 2.6, HYG: 3, JNK: 3, USHY: 3, TIP: 6.7, SCHP: 6.5, VTIP: 2.5, MUB: 6, EMB: 7,
}; // prettier-ignore

const isBondCat = (c) => /bond|government|treasury|debt|muni|inflation|ultrashort|corporate|high yield|fixed|credit/i.test(c ?? ""); // prettier-ignore

/** Classe do ETF: equity | bond | gold | commodity | vol | null (não é ETF). */
export function etfClass(f, sym = "") {
  if (!f || (f.type !== "ETF" && f.type !== "MUTUALFUND")) return null;
  const c = `${f.category ?? ""} ${f.name ?? ""}`;
  if (/volatil|vix/i.test(c)) return "vol";
  if (/\bgold\b|\bouro\b/i.test(c) && !/miner/i.test(c)) return "gold";
  if (DUR[sym] || isBondCat(f.category) || f.bondPos > 0.6) return "bond";
  if (/commodit|oil|silver|natural gas|agricult|metals/i.test(c) && !/miner|equity/i.test(c)) return "commodity"; // prettier-ignore
  return "equity";
}

/** Faixa de duration (anos) esperada pela categoria: [mínimo, máximo, típico]. */
function catDuration(c = "") {
  if (/ultrashort|money/i.test(c)) return [0, 1, 0.4];
  if (/short/i.test(c)) return [0.5, 4, 2];
  if (/long/i.test(c)) return [10, 30, 15];
  if (/high yield/i.test(c)) return [1.5, 6, 3.5];
  return [2, 10, 6];
}

/** Duration: tabela > Yahoo (só se coerente com a categoria; ex.: Yahoo dá 3,6 para o TLT) > típica da categoria. */
export function durationOf(f, sym = "") {
  if (DUR[sym]) return DUR[sym];
  const [lo, hi, mid] = catDuration(f?.category ?? "");
  return f?.duration >= lo && f?.duration <= hi ? f.duration : mid;
}

/** Taxa de mercado do trecho da curva que o fundo carrega (Tesouro), em fração. */
function curveYield(dur, m) {
  const pick = dur >= 12 ? m?.y30 : dur >= 5 ? m?.y10 : dur >= 2 ? avg([m?.cash, m?.y10]) : m?.cash;
  return Number.isFinite(pick) ? pick / 100 : null;
}

/** Múltiplo que o Yahoo às vezes entrega invertido (rendimento em vez de múltiplo). */
const mult = (x) => (x > 0 ? (x < 1 ? 1 / x : x) : null);

/** ETF de ações: look-through da carteira (P/L, P/FC, crescimento) contra o S&P 500, mais dividendos. */
export function equityEtfFund(f, spyPe = 25) {
  const pe = mult(f.eqPe) ?? (f.pe > 0 ? f.pe : null);
  if (!pe) return null;
  const rel = pe / spyPe;
  const value = avg([
    interp([[0.6, 85], [0.8, 70], [1, 50], [1.3, 25], [1.6, 10]], rel),
    mult(f.eqPcf) ? interp([[2, 25], [4, 45], [6, 65], [9, 85]], 100 / mult(f.eqPcf)) : null,
  ]); // prettier-ignore
  const g = f.eqG3 > 1.5 ? f.eqG3 / 100 : f.eqG3;
  const growth = Number.isFinite(g) ? interp([[-0.05, 15], [0, 30], [0.08, 55], [0.15, 75], [0.25, 90]], g) : null; // prettier-ignore
  const income = f.dy === null || f.dy === undefined ? null : interp([[0, 40], [0.02, 55], [0.04, 70]], f.dy); // prettier-ignore
  const reasons = [
    `P/L da carteira ${n1(pe)} contra ${n1(spyPe)} do S&P 500 (${rel < 1 ? `${Math.round((1 - rel) * 100)}% mais barato` : `${Math.round((rel - 1) * 100)}% mais caro`}).`,
  ];
  if (mult(f.eqPcf)) reasons.push(`Preço/fluxo de caixa ${n1(mult(f.eqPcf))}.`);
  if (Number.isFinite(g)) reasons.push(`Lucro das empresas do fundo cresceu ${pct(g, 0)} ao ano (3 anos).`); // prettier-ignore
  if (f.dy !== null && f.dy !== undefined) reasons.push(`Dividend yield ${pct(f.dy)}.`);
  const score = value === null ? null : 0.6 * value + 0.25 * (growth ?? value) + 0.15 * (income ?? value); // prettier-ignore
  return { score, parts: { value, growth, income }, conf: "Média", basis: "carteira do fundo contra o S&P 500", reasons }; // prettier-ignore
}

/**
 * Renda fixa: margem de segurança = taxa ÷ duration (alta de juro, em pontos, que zera 12 meses de carrego),
 * prêmio sobre o caixa (taxa − T-bill) e juro real. m = { cash, y10, y30, real10 } em % ao ano.
 */
export function bondEtfFund(f, sym, m) {
  const dur = durationOf(f, sym);
  const treasury = /government|treasury|tesouro/i.test(`${f.category ?? ""} ${f.name ?? ""}`) || DUR[sym] && /^(TLT|VGLT|SPTL|EDV|ZROZ|TLH|IEF|VGIT|IEI|GOVT|SHY|VGSH|SCHO|BIL|SGOV|SHV)$/.test(sym); // prettier-ignore
  const y = treasury ? (curveYield(dur, m) ?? (f.dy > 0 ? f.dy : null)) : f.dy > 0 ? f.dy : curveYield(dur, m); // prettier-ignore
  if (!(y > 0)) return null;
  const cash = Number.isFinite(m?.cash) ? m.cash / 100 : null;
  const cushion = (y / Math.max(dur, 0.1)) * 1e4; // em pontos-base
  const sCush = interp(
    [
      [5, 20],
      [15, 35],
      [30, 55],
      [60, 75],
      [100, 85],
    ],
    cushion,
  );
  const term = cash === null ? null : y - cash;
  const sTerm = term === null ? null : interp([[-0.01, 25], [0, 40], [0.005, 55], [0.015, 75]], term); // prettier-ignore
  const real = Number.isFinite(m?.real10) ? m.real10 / 100 : null;
  const sReal = real === null || dur < 2 ? null : interp([[-0.005, 25], [0.005, 45], [0.015, 65], [0.025, 80]], real); // prettier-ignore
  const reasons = [
    `Taxa ${pct(y, 2)} com duration ${n1(dur)} anos: o juro pode subir ${Math.round(cushion)} pontos-base em 12 meses antes de o fundo dar prejuízo.`,
  ];
  if (term !== null) reasons.push(`Prêmio sobre o caixa (T-bill ${pct(cash, 2)}): ${term >= 0 ? "+" : ""}${pct(term, 2)}.`); // prettier-ignore
  if (sReal !== null) reasons.push(`Juro real de 10 anos ${pct(real, 2)}${real >= 0.015 ? " (alto: protege contra inflação)" : real <= 0 ? " (negativo: pouco atrativo)" : ""}.`); // prettier-ignore
  return {
    score: avg([sCush, sTerm, sReal]),
    parts: { cushion: sCush, term: sTerm, real: sReal },
    conf: "Média",
    basis: "taxa, duration e juro real",
    reasons,
  };
}

/** Ouro: não rende; o custo de carregar é o juro real. Juro real alto pesa contra, baixo/negativo a favor. */
export function goldFund(m) {
  const est = !Number.isFinite(m?.real10) && Number.isFinite(m?.y10);
  const real = Number.isFinite(m?.real10) ? m.real10 : est ? m.y10 - 2.3 : null; // inflação implícita ~2,3%
  if (real === null) return null;
  const score = interp(
    [
      [-0.5, 80],
      [0.5, 65],
      [1.5, 50],
      [2.5, 35],
      [3, 25],
    ],
    real,
  );
  return {
    score,
    parts: { real: score },
    conf: "Baixa",
    basis: "juro real (custo de oportunidade)",
    reasons: [
      `Juro real de 10 anos ${n1(real, 2).replace(".", decSep())}%${est ? " (estimado: 10 anos − 2,3% de inflação implícita)" : ""}: ${real >= 2 ? "alto, pesa contra o ouro" : real <= 0.5 ? "baixo, favorece o ouro" : "neutro"}.`,
      "Ouro não gera caixa: o fundamento é macro (juro real e dólar), com confiança baixa.",
    ],
  };
}

/** Custo anual de carregar um alavancado: perda por volatilidade L(L−1)/2·σ² (σ do ativo de referência) + taxa. */
export function carryCost(lev, volEtf, expense) {
  const sigma = volEtf > 0 ? volEtf / Math.abs(lev) : null;
  const drag = sigma === null ? null : ((lev * lev - lev) / 2) * sigma * sigma;
  const fee = expense > 0 ? expense : 0.0095;
  return { sigma, drag, fee, total: (drag ?? 0) + fee };
}

/** Alavancado/inverso: nota do ativo de referência (espelhada no inverso) − custo de carregar. */
export function leveragedFund(lv, under, uPillar, volEtf, expense) {
  if (!Number.isFinite(uPillar?.score)) return null;
  const base = lv.lev > 0 ? uPillar.score : 100 - uPillar.score;
  const c = carryCost(lv.lev, volEtf, expense);
  const penalty = interp(
    [
      [0, 0],
      [0.05, 4],
      [0.15, 12],
      [0.3, 22],
      [0.6, 35],
    ],
    c.total,
  );
  const score = clamp(base - penalty);
  const lx = `${Math.abs(lv.lev)}x ${lv.lev > 0 ? "comprado" : "vendido (inverso)"}`;
  return {
    score,
    parts: { under: base, cost: 100 - penalty * 2 },
    conf: "Baixa",
    basis: `${under} (${lx}) menos o custo de carregar`,
    under: { sym: under, lev: lv.lev, score: uPillar.score, cost: c },
    reasons: [
      `Fundamento de ${under}: ${Math.round(uPillar.score)}/100${lv.lev < 0 ? ` (inverso: conta ${Math.round(base)}/100)` : ""}. ${uPillar.reasons?.[0] ?? ""}`.trim(),
      ...(uPillar.reasons ?? []).slice(1, 3),
      c.drag === null
        ? `Custo de carregar: taxa ${pct(c.fee, 2)} ao ano mais a perda pela volatilidade (não medida).`
        : `Custo de carregar ${lx}: ~${pct(c.total, 0)} ao ano (perda por volatilidade ${pct(c.drag, 0)} com ${under} oscilando ${pct(c.sigma, 0)} ao ano, mais taxa ${pct(c.fee, 2)}). Desconta ${Math.round(penalty)} pontos.`,
      "Serve para operar dias ou semanas; o fundamento do ativo de referência não se transfere para quem carrega por meses.",
    ],
  };
}
