// Long & Short: fórmulas do motor, porte 1:1 de docs/long-short/pendulo_motor_ref.py (puro). Paridade obrigatória:
// tests/ls-core.test.js roda os mesmos casos da referência. Parâmetros sempre por argumento (padrão = JSON v4).
// Convenções: dir +1 comprado no ETF / −1 vendido a descoberto; type +1 bull / −1 bear; P preço do ETF;
// L alavancagem; S preço do subjacente.
import { PARAMS, SIDE } from "./ls-params.js";

/** Dado inválido: dispara EXE-01 e nenhuma quantidade é gerada. */
export class InvalidData extends Error {
  constructor(field) {
    super(`dado inválido: ${field}`);
    this.field = field;
    this.alert = "EXE-01";
  }
}

const EPS = 1e-9;

/**
 * round(x, n) do Python (meio para o par, sobre o valor EXATO do double), para os números baterem com a
 * referência até o último centavo. toFixed(60) dá a expansão decimal exata dos preços (|x| < 2^53).
 */
export function pyRound(x, n = 2) {
  if (!Number.isFinite(x)) return x;
  const neg = x < 0;
  const s = Math.abs(x).toFixed(60);
  const [ip, fp] = s.split(".");
  const keep = ip + fp.slice(0, n);
  const next = fp.charCodeAt(n) - 48;
  const rest = fp.slice(n + 1);
  let up = next > 5 || (next === 5 && /[1-9]/.test(rest));
  if (next === 5 && !/[1-9]/.test(rest)) up = (keep.charCodeAt(keep.length - 1) - 48) % 2 === 1;
  const digits = BigInt(keep) + (up ? 1n : 0n);
  const out = Number(digits) / 10 ** n;
  return neg ? -out : out;
}

/** Fração de redução: o JSON grava 0,33, a referência usa 1/3 (277 → vende 92, não 91). */
export const frac = (x) => (Math.abs(x - 1 / 3) < 0.005 ? 1 / 3 : x);

/** Lado da ordem pela FINALIDADE e dir: REDUZIR/ZERAR usam a tabela de redução, ENTRAR/AUMENTAR a de aumento. */
export function side(purpose, dir) {
  const key = purpose === "REDUZIR" || purpose === "ZERAR" ? "REDUZIR" : "AUMENTAR";
  return SIDE[key][dir === 1 ? "+1" : "-1"];
}

/** Ordem que o app manda comprar? (compra ou cobertura de short). */
export const isBuySide = (s) => s === "COMPRAR" || s === "COMPRAR_PARA_COBRIR";

export function rValue(capital, p = PARAMS) {
  if (!(capital > 0)) throw new InvalidData("capital");
  return (capital * p.risco_por_ponta_pct_capital) / 100;
}

export function distStop(P, L, atrIntra, S, p = PARAMS) {
  if (![P, L, atrIntra, S].every((x) => typeof x === "number" && x > 0)) throw new InvalidData("P/L/ATR/S"); // prettier-ignore
  return (P * L * p.stop_inicial_atr_intraday * atrIntra) / S;
}

export const exposure = (q, P, L, type, dir) => q * P * L * type * dir;

/** Stop monótono: só se aproxima do preço, nunca se afasta. */
export function stopVigente(stopAtual, P, d, dir) {
  const calc = P - dir * d;
  if (stopAtual === null || stopAtual === undefined) return calc;
  return dir === 1 ? Math.max(stopAtual, calc) : Math.min(stopAtual, calc);
}

/** Quanto do melhor movimento já foi devolvido (%), ou null sem ganho a favor. */
export function devolucaoPct(hwm, P, pm, dir) {
  const base = dir * (hwm - pm);
  if (base <= 0) return null;
  return ((dir * (hwm - P)) / base) * 100;
}

/** Cotas a reduzir: q > 1 → max(1, floor(q·f)); q = 1 → P2–P4 zeram, P5 nada. */
export function qtdReducao(q, f, prioridade) {
  if (q <= 0) return 0;
  if (q === 1) return ["P2", "P3", "P4"].includes(prioridade) ? 1 : 0;
  return Math.min(q, Math.max(1, Math.floor(q * f)));
}

/** Maior q inteiro com |exp_liq + q·unit| ≤ 1,5·cap e bruta + q·|unit| ≤ 2·cap. */
export function qLimiteExposicao(expLiq, expBruta, unitLiq, capital, p = PARAMS) {
  const limL = p.exposicao_liquida_max_x_capital * capital;
  const limB = p.exposicao_bruta_max_x_capital * capital;
  const a = Math.abs(unitLiq);
  if (a === 0) return 1e9;
  const qB = (limB - expBruta) / a;
  const qL = unitLiq > 0 ? (limL - expLiq) / unitLiq : (limL + expLiq) / a;
  return Math.max(0, Math.floor(Math.min(qB, qL) + EPS));
}

/** Entrada: { q, stop }. `mult` reduz o 1R (pré-mercado 0,5; dia de evento 0,5; semana ruim 0,5). */
export function qEntrada({ capital, P, L, type, dir, atr, S, expLiq, expBruta, riscoTotal, teto, sessao = "REGULAR", mult = 1, p = PARAMS }) {
  const R = rValue(capital, p) * mult;
  const d = distStop(P, L, atr, S, p);
  const rSess = R * (sessao === "PRE" ? p.pre_tamanho_mult : 1);
  const conc = (p.concentracao_max_pct_capital / 100) * capital;
  const unit = P * L * type * dir;
  const q = Math.min(rSess / d, conc / P, qLimiteExposicao(expLiq, expBruta, unit, capital, p), Math.max(0, teto - riscoTotal) / d); // prettier-ignore
  return { q: Math.max(0, Math.floor(q + EPS)), stop: pyRound(P - dir * d, 2), d };
} // prettier-ignore

/** Pyramiding sem crédito de lucro: { q, stop, trava, lims }. trava = o limite que travou. */
export function qPyramiding({ capital, q, pm, stopAtual, ultimoLote, P, L, type, dir, atr, S, expLiq, expBruta, riscoTotal, teto, mult = 1, p = PARAMS }) {
  const R = rValue(capital, p) * mult;
  const d = distStop(P, L, atr, S, p);
  const s = P - dir * d;
  const riscoAtual = Math.max(0, dir * (pm - stopAtual) * q);
  const conc = (p.concentracao_max_pct_capital / 100) * capital;
  const unit = P * L * type * dir;
  const lims = {
    risco: (R - riscoAtual) / d,
    lote: p.pyramiding_lote_max_vs_anterior * ultimoLote,
    concentracao: (conc - q * P) / P,
    exposicao: qLimiteExposicao(expLiq, expBruta, unit, capital, p),
    teto_risco: Math.max(0, teto - riscoTotal) / d,
  };
  // min() do Python devolve a 1ª chave em caso de empate: mesma ordem aqui
  const trava = Object.keys(lims).reduce((a, k) => (lims[k] < lims[a] ? k : a));
  return { q: Math.max(0, Math.floor(lims[trava] + EPS)), stop: pyRound(s, 2), trava, lims, d };
} // prettier-ignore

/** Bloqueios valem pela finalidade, nunca pelo lado (cobertura de short é compra que reduz risco). */
export function ordemBloqueada(purpose, travasCompra) {
  if (purpose === "REDUZIR" || purpose === "ZERAR") return false;
  return travasCompra.length > 0;
}

/** pontas: [[exposição ajustada, beta]]. { efetivo (x capital, 4 casas), bloqueia }. */
export function desvioDirecional(pontas, capital, planejado, p = PARAMS) {
  const ef = pontas.reduce((s, [e, b]) => s + e * b, 0) / capital;
  return { efetivo: pyRound(ef, 4), bloqueia: Math.abs(ef - planejado) > p.desvio_direcional_max_x_capital }; // prettier-ignore
}

export const aluguel = (valorVendido, taxaAa, dias, base = PARAMS.aluguel_base_dias) =>
  (valorVendido * taxaAa * dias) / base;

/** Heurística de evento corporativo (ETF-01): só alerta, nunca altera a carteira. */
export const alertaEventoCorporativo = (retEtf, retSubj, L, type, p = PARAMS) =>
  Math.abs(retEtf - L * type * retSubj) * 100 > p.etf_divergencia_alerta_pp;
