// Termômetro bull/bear da CARTEIRA (puro, testado). Direcional = exposição líquida ao mercado:
// soma de peso ao vivo × beta de cada posição contra o S&P 500 (beta do histórico de 1 ano, `portfolioRisk`).
// Escala −100 (muito bear) a +100 (muito bull): score = 50 × beta líquido (beta 1 = carteira "igual ao S&P" = +50).
// Aderência: compara com a intensidade do regime de mercado (−100 risk-off a +100 risk-on, `regimeStrength`).
// Leitura em modo sombra; material educacional, não é recomendação.

export const BIAS_LEVELS = [
  { min: 60, key: "vbull", label: "Muito bull" },
  { min: 25, key: "bull", label: "Bull" },
  { min: -25, key: "flat", label: "Neutra" },
  { min: -60, key: "bear", label: "Bear" },
  { min: -Infinity, key: "vbear", label: "Muito bear" },
];

/** Faixa de folga entre carteira e cenário que ainda conta como aderente (pontos da escala). */
export const FIT_BAND = 25;

const clamp = (x, lo = -100, hi = 100) => Math.max(lo, Math.min(hi, x));
export const biasLevel = (s) => BIAS_LEVELS.find((l) => s >= l.min);

/** Beta estimado pelo nome quando não há histórico: ETFs alavancados/inversos (ex.: "-3x", "Bear 3X"). */
export function nameBeta(name = "") {
  const n = String(name);
  const m = n.match(/(-?)([123])x\b/i);
  const lev = m ? +m[2] : /\bultra\b/i.test(n) ? 2 : null;
  const inv = /\b(bear|inverse|short)\b/i.test(n) || m?.[1] === "-";
  if (lev == null && !inv) return null;
  return (lev ?? 1) * (inv ? -1 : 1);
}

/**
 * rows: linhas da valuation ({ sym, name, weight }); risk: saída de portfolioRisk (positions com beta);
 * market: score do regime (−100 a +100) ou null.
 */
export function portfolioBias(rows, risk, market = null) {
  const betaBy = Object.fromEntries((risk?.positions ?? []).filter((p) => Number.isFinite(p.beta)).map((p) => [p.sym, p.beta])); // prettier-ignore
  const parts = [];
  const missing = [];
  for (const r of rows ?? []) {
    if (!(r.weight > 0)) continue;
    let beta = betaBy[r.sym];
    let est = false;
    if (!Number.isFinite(beta)) {
      beta = nameBeta(r.name);
      est = beta != null;
    }
    if (beta == null) missing.push(r.sym);
    else parts.push({ sym: r.sym, weight: r.weight, beta, est, contrib: r.weight * beta });
  }
  const coverage = parts.reduce((a, p) => a + p.weight, 0);
  if (!parts.length || coverage < 0.5) return { ok: false, coverage, missing };
  // pesos renormalizados no que tem beta (o resto fica de fora e é listado)
  const netBeta = parts.reduce((a, p) => a + p.contrib, 0) / coverage;
  const score = Math.round(clamp(50 * netBeta));
  const lvl = biasLevel(score);
  const sorted = [...parts].sort((a, b) => b.contrib - a.contrib);
  let fit = null;
  if (Number.isFinite(market)) {
    const gap = score - market;
    fit = {
      market: Math.round(market),
      marketLevel: biasLevel(market).label,
      gap: Math.round(gap),
      key: Math.abs(gap) <= FIT_BAND ? "ok" : gap > 0 ? "hot" : "cold",
      label:
        Math.abs(gap) <= FIT_BAND
          ? "Aderente ao cenário"
          : gap > 0
            ? "Mais agressiva que o cenário"
            : "Mais defensiva que o cenário",
    };
  }
  return {
    ok: true,
    score,
    netBeta,
    level: lvl.label,
    key: lvl.key,
    coverage,
    missing,
    parts,
    bull: sorted.filter((p) => p.contrib > 0).slice(0, 3),
    bear: sorted.filter((p) => p.contrib < 0).reverse().slice(0, 3), // prettier-ignore
    fit,
  };
}
