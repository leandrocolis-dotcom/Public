// Pêndulo da CARTEIRA (puro, testado). Separado do pêndulo do mercado: lê a carteira e a compara com ele, sem
// mexer na nota do regime. Material educacional; não é recomendação de investimento.
//
// Três perguntas, uma por parte:
//  1. Postura (a agulha, −100 a +100, mesma escala e faixas do mercado): quanto a carteira está exposta ao
//     mercado = 50 × beta líquido (soma de peso × beta de 1 ano contra o S&P; `portfolioBias`). Beta 1 (igual ao
//     S&P) = +50 (Risco); só caixa/renda fixa curta ≈ 0 (Neutro); protegida com inverso = negativa (Defesa).
//  2. Alinhamento: a postura está onde o cenário pede? Alvo = beta-alvo pela nota do regime (o pêndulo de cima),
//     pensado para carteira comprada (sem obrigar a ficar vendido): 0,7 + 0,5 × nota/100, de 0,2 (defesa forte,
//     nota −100) a 1,2 (risco forte, +100); no neutro, 0,7. Postura-alvo = 50 × beta-alvo (10 a 60).
//     Distância 0 = alinhada; 50 pontos (1 beta) ou mais = desalinhada.
//  3. Ganho de verdade (para lucrar sempre, não basta "estar exposto"):
//     • Assimetria (63 pregões, pesos de hoje): captura de alta − captura de queda contra o S&P. Carteira que sobe
//       110% do S&P nos dias de alta e cai 80% nos de queda ganha nos dois lados (+30 p.p.).
//     • Alfa de hoje: variação da carteira − beta × variação do S&P (o que a carteira fez além da exposição).
// Sinergia (0 a 100) = 50% alinhamento + 30% assimetria + 20% alfa de hoje.

import { decSep } from "./format.js";
import { alignReturns } from "./risk.js";
import { PEND_ZONES } from "./regime-zones.js";

export const SYNERGY_W = { align: 0.5, asym: 0.3, alpha: 0.2 };
export const CAPTURE_DAYS = 63;
/** Folga de alinhamento (pontos da postura; 15 = beta 0,3): dentro dela a carteira conta como alinhada. */
export const ALIGN_BAND = 15;

/** Beta-alvo para a nota do regime (carteira comprada): 0,2 na defesa forte, 0,7 no neutro, 1,2 no risco forte. */
export const targetBeta = (market) => clamp(0.7 + (0.5 * market) / 100, 0.2, 1.2);

export const SYNERGY_LEVELS = [
  { min: 70, key: "ok", label: "Em sintonia com o mercado" },
  { min: 45, key: "mid", label: "Sintonia parcial" },
  { min: 0, key: "bad", label: "Fora de sintonia" },
];

const clamp = (x, lo, hi) => Math.max(lo, Math.min(hi, x));
const fin = Number.isFinite;
export const zoneOf = (s) => PEND_ZONES.find((z) => s < z.max || z.key === "rkx") ?? PEND_ZONES[2];

/**
 * Captura de alta e de queda da carteira (pesos de hoje) contra o benchmark nos últimos `days` pregões.
 * up = soma dos retornos da carteira nos dias de alta do S&P ÷ soma dos do S&P nesses dias; down idem na queda.
 */
export function captureRatios(rows, history, { bench = "SPY", days = CAPTURE_DAYS } = {}) {
  const held = (rows ?? []).filter((r) => r.weight > 0);
  if (!held.length || !history?.[bench]) return null;
  const { syms, R } = alignReturns(history, [...new Set([...held.map((r) => r.sym), bench])], days);
  const inSet = held.filter((r) => syms.includes(r.sym));
  const cov = inSet.reduce((a, r) => a + r.weight, 0);
  const b = R[bench];
  if (!b || b.length < 20 || cov < 0.5) return null;
  const port = b.map((_, i) => inSet.reduce((a, r) => a + (r.weight / cov) * R[r.sym][i], 0));
  let pu = 0, bu = 0, pd = 0, bd = 0; // prettier-ignore
  b.forEach((x, i) => {
    if (x > 0) {
      pu += port[i];
      bu += x;
    } else if (x < 0) {
      pd += port[i];
      bd += x;
    }
  });
  if (!(bu > 0) || !(bd < 0)) return null;
  return { up: pu / bu, down: pd / bd, days: b.length, coverage: cov };
}

/**
 * bias: saída de portfolioBias (score = postura, netBeta); market: nota do regime (−100 a +100) ou null;
 * capture: captureRatios ou null; day: { port, spy } variação de hoje (fração) ou null; total: patrimônio (US$).
 */
export function portfolioPendulum({
  bias,
  market = null,
  capture = null,
  day = null,
  total = null,
}) {
  if (!bias?.ok) return { ok: false, coverage: bias?.coverage ?? 0, missing: bias?.missing ?? [] };
  const posture = clamp(bias.score, -100, 100);
  const zone = zoneOf(posture);
  const parts = {};
  let gap = null;
  let tb = null;
  let target = null;
  if (fin(market)) {
    tb = targetBeta(market);
    target = 50 * tb;
    gap = posture - target;
    parts.align = 1 - Math.min(1, Math.abs(gap) / 50);
  }
  const asym = capture ? capture.up - capture.down : null;
  if (fin(asym)) parts.asym = clamp(0.5 + asym / 0.6, 0, 1); // ±30 p.p. de assimetria = 1 ou 0
  const alpha = day && fin(day.port) && fin(day.spy) ? day.port - bias.netBeta * day.spy : null;
  if (fin(alpha)) parts.alpha = clamp(0.5 + alpha / 0.02, 0, 1); // ±1% além do beta = 1 ou 0
  let sum = 0;
  let wsum = 0;
  for (const [k, w] of Object.entries(SYNERGY_W))
    if (fin(parts[k])) {
      sum += w * parts[k];
      wsum += w;
    }
  const synergy = wsum ? Math.round((100 * sum) / wsum) : null;
  const level = fin(synergy) ? SYNERGY_LEVELS.find((l) => synergy >= l.min) : null;
  // leitura: o que o desalinhamento custa e o tamanho do ajuste (educacional, não é ordem)
  let read = null;
  if (fin(gap)) {
    const br = (x) => x.toFixed(2).replace(".", decSep());
    // exposição a mover (US$ "de S&P"): diferença de beta × patrimônio; o caixa/T-bill (BIL) tem beta ≈ 0
    const move = fin(total) ? Math.abs(bias.netBeta - tb) * total : null;
    if (Math.abs(gap) <= ALIGN_BAND)
      read = {
        key: "ok",
        text: `Exposição alinhada ao cenário (beta ${br(bias.netBeta)}, alvo ${br(tb)}).`,
      };
    else if (gap > 0)
      read = {
        key: "hot",
        text: `Mais exposta que o cenário pede: beta ${br(bias.netBeta)} para um alvo de ${br(tb)}. Uma queda de 1% do S&P tende a tirar ${br(bias.netBeta)}% da carteira.`,
        move,
        dir: "reduzir",
      };
    else
      read = {
        key: "cold",
        text: `Mais protegida que o cenário: beta ${br(bias.netBeta)} para um alvo de ${br(tb)}. Uma alta de 1% do S&P rende só ${br(Math.max(0, bias.netBeta))}% à carteira.`,
        move,
        dir: "aumentar",
      };
  }
  return {
    ok: true,
    posture,
    zone,
    netBeta: bias.netBeta,
    market: fin(market) ? market : null,
    targetBeta: tb,
    target,
    gap,
    synergy,
    level,
    parts,
    asym,
    capture,
    alpha,
    read,
    coverage: bias.coverage,
    missing: bias.missing ?? [],
  };
}
