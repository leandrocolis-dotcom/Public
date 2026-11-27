// Long & Short: métricas de posição, par e carteira (puro). Fórmulas de `metricas` do JSON v4.
// Toda métrica em R é comparada já arredondada a 2 casas (o número que o usuário vê na tela, como a referência).
import { PARAMS } from "./ls-params.js";
import { aluguel, desvioDirecional, devolucaoPct, distStop, exposure, pyRound, rValue } from "./ls-core.js"; // prettier-ignore

const fin = (x) => typeof x === "number" && Number.isFinite(x);
const pos = (x) => fin(x) && x > 0;

/** Idade máxima da cotação (s) na sessão. */
export const maxQuoteAge = (session, p = PARAMS) => (session === "REGULAR" ? p.cotacao_max_s_regular : p.cotacao_max_s_estendida); // prettier-ignore

/**
 * Cotação confiável (EXE-01 se não): idade ≤ limite da sessão, bid e ask presentes, bid ≤ ask, preço > 0.
 * Devolve { ok, age, reasons }.
 */
export function quoteCheck(q, now, session, p = PARAMS) {
  const reasons = [];
  const age = fin(q?.ts) ? (now - q.ts) / 1000 : null;
  if (!pos(q?.P)) reasons.push("preço ausente");
  if (age === null) reasons.push("sem horário da cotação");
  else if (age > maxQuoteAge(session, p)) reasons.push(`cotação com ${Math.round(age)} s`);
  if (!pos(q?.bid) || !pos(q?.ask)) reasons.push("sem bid/ask");
  else if (q.bid > q.ask) reasons.push("bid acima do ask");
  return { ok: reasons.length === 0, age, reasons };
}

/**
 * Métricas de uma ponta. `leg` = { sym, dir, qty, avg, stop, hwm, partialDone, entryUnder, entryPrice,
 * asset: { ok, L, type, under }, quote: { P, bid, ask, ts }, under: underlyingView, borrow }.
 * Sem cadastro ou sem preço/ATR: ok = false com errors (EXE-01) e nenhuma quantidade derivada.
 */
export function legMetrics(leg, { capital, now, session, p = PARAMS }) {
  const errors = [];
  const a = leg.asset;
  if (!a?.ok) errors.push(...(a?.errors ?? ["ativo sem cadastro"]));
  const q = leg.qty ?? 0;
  const P = leg.quote?.P;
  const dir = leg.dir === -1 ? -1 : 1;
  const R = rValue(capital, p);
  const qc = quoteCheck(leg.quote, now, session, p);
  const u = leg.under ?? {};
  const out = { sym: leg.sym, dir, qty: q, quote: qc, errors };
  if (!a?.ok || !pos(P)) {
    if (!pos(P)) errors.push("preço ausente");
    return { ...out, ok: false };
  }
  const { L, type } = a;
  out.favor = type * dir; // +1: ganha quando o subjacente sobe
  out.value = q * P;
  out.expAj = exposure(q, P, L, type, dir);
  out.unit = P * L * type * dir;
  out.pnl = q > 0 && pos(leg.avg) ? dir * (P - leg.avg) * q : 0;
  out.pnlR = pyRound(out.pnl / R, 2);
  // ATR/S ausentes só impedem DIMENSIONAR compras (canSize); saídas, P&L, exposição e risco seguem valendo
  out.sizeErrors = [];
  try {
    out.dist = distStop(P, L, u.atrIntra, u.S, p);
    out.stopSug = P - dir * out.dist;
  } catch (e) {
    out.dist = null;
    out.stopSug = null;
    out.sizeErrors.push(e.message);
  }
  out.canSize = out.sizeErrors.length === 0;
  out.noStop = q > 0 && !fin(leg.stop);
  // sem stop o risco não é zero: usa o stop sugerido (ATR) ou, sem ele, o valor inteiro da posição
  const riskStop = fin(leg.stop) ? leg.stop : out.stopSug;
  out.riskOpen =
    q > 0 && pos(leg.avg)
      ? fin(riskStop)
        ? Math.max(0, dir * (leg.avg - riskStop) * q)
        : out.value
      : 0;
  out.stopHit = q > 0 && fin(leg.stop) && (dir === 1 ? P <= leg.stop : P >= leg.stop);
  const w = session === "REGULAR" ? u.vwap : (u.vwapExt ?? u.vwap);
  out.vwap = w ?? null;
  out.vwapSide = w && fin(u.S) ? ((u.S - w.value) * out.favor > 0 ? "a favor" : "contra") : null;
  out.spreadPct = pos(leg.quote?.bid) && pos(leg.quote?.ask) ? ((leg.quote.ask - leg.quote.bid) / ((leg.quote.ask + leg.quote.bid) / 2)) * 100 : null; // prettier-ignore
  out.concPct = (out.value / capital) * 100;
  out.devolucao = q > 0 && fin(leg.hwm) && pos(leg.avg) ? devolucaoPct(leg.hwm, P, leg.avg, dir) : null; // prettier-ignore
  out.decayPp = pos(leg.entryUnder) && pos(leg.entryPrice) && pos(u.S) ? (L * type * (u.S / leg.entryUnder - 1) - (P / leg.entryPrice - 1)) * 100 : null; // prettier-ignore
  out.stretchAtr = pos(leg.entryUnder) && pos(u.atrD) && pos(u.S) ? Math.abs(u.S - leg.entryUnder) / u.atrD : null; // prettier-ignore
  out.rentDay = dir === -1 && pos(leg.borrow?.rateAa) ? aluguel(out.value, leg.borrow.rateAa, 1, p.aluguel_base_dias) : 0; // prettier-ignore
  out.ok = errors.length === 0;
  return out;
}

/**
 * P&L do dia de uma ponta contra o preço de referência (último preço do pós anterior; a tela passa o preço
 * médio para lote aberto hoje). Sem referência: usa o preço médio e marca `missing` (compras bloqueadas).
 */
export function legPnlDay(leg, m) {
  if (!(m.qty > 0) || !pos(leg.quote?.P)) return { pnl: 0, missing: false };
  const ref = pos(leg.pRef) ? leg.pRef : pos(leg.avg) ? leg.avg : null;
  if (ref === null) return { pnl: 0, missing: true };
  return { pnl: m.dir * (leg.quote.P - ref) * m.qty, missing: !pos(leg.pRef) };
}

/**
 * Carteira: R, P&L do dia, limite restante, exposições, risco aberto, teto, drawdown e semáforo das travas.
 * ctx = { capital, peak?, realized?, weeklyLossHit?, p }.
 */
export function portfolioMetrics(
  legs,
  metrics,
  { capital, peak = null, realized = 0, weeklyLossHit = false, p = PARAMS },
) {
  const R = rValue(capital, p) * (weeklyLossHit ? 0.5 : 1);
  let open = 0;
  let expB = 0;
  let expL = 0;
  let risk = 0;
  const refMissing = [];
  legs.forEach((leg, i) => {
    const m = metrics[i];
    if (!m.ok) return;
    const d = legPnlDay(leg, m);
    if (d.missing) refMissing.push(leg.sym);
    open += d.pnl;
    expB += Math.abs(m.expAj);
    expL += m.expAj;
    risk += m.riskOpen;
  });
  const pnlDay = open + realized;
  const lossLim = (capital * p.perda_diaria_max_pct_capital) / 100;
  const limiteRestante = lossLim + pnlDay;
  const teto = Math.min(p.teto_risco_r * R, limiteRestante);
  const capNow = capital + pnlDay;
  const drawdown = pos(peak) ? (capNow / Math.max(peak, capNow) - 1) * 100 : 0;
  const limB = p.exposicao_bruta_max_x_capital * capital;
  const limL = p.exposicao_liquida_max_x_capital * capital;
  const use = {
    perda: Math.max(0, -pnlDay) / lossLim,
    bruta: expB / limB,
    liquida: Math.abs(expL) / limL,
    risco: teto > 0 ? risk / teto : 1,
  };
  return {
    R,
    pnlDay,
    pnlDayR: pyRound(pnlDay / R, 2),
    pnlDayPct: (pnlDay / capital) * 100,
    limiteRestante,
    lossLim,
    expBruta: expB,
    expLiq: expL,
    expBrutaX: expB / capital,
    expLiqX: expL / capital,
    refMissing,
    noStop: legs.filter((l, i) => metrics[i].noStop).map((l) => l.sym),
    riskOpen: risk,
    riskOpenR: pyRound(risk / R, 2),
    teto,
    tetoR: pyRound(teto / R, 2),
    drawdown,
    use,
    near: Object.entries(use)
      .filter(([, v]) => v > 0.8 && v < 1)
      .map(([k]) => k),
  };
}

/**
 * Par: P&L em R, exposições, exposição beta-ajustada contra o S&P 500 e desvio do plano, mesmo subjacente.
 * `betas` = { SYM: beta60d }; `dirPlan` em x capital.
 */
export function pairMetrics(
  pair,
  legL,
  legS,
  mL,
  mS,
  { capital, dirPlan = 0, betas = {}, maxPnlR = null, p = PARAMS },
) {
  const ms = [mL, mS].filter((m) => m?.ok);
  const pnlR = pyRound(
    ms.reduce((s, m) => s + m.pnlR, 0),
    2,
  );
  const pontas = [[legL, mL], [legS, mS]].filter(([, m]) => m?.ok).map(([l, m]) => [m.expAj, betas[l.asset?.under] ?? null]); // prettier-ignore
  const betaOk = pontas.length > 0 && pontas.every(([, b]) => fin(b));
  const desvio = betaOk ? desvioDirecional(pontas, capital, dirPlan, p) : null;
  return {
    id: pair.id,
    pnlR,
    expLiq: ms.reduce((s, m) => s + m.expAj, 0),
    expBruta: ms.reduce((s, m) => s + Math.abs(m.expAj), 0),
    desvio,
    dirPlan,
    sameUnder: !!legL?.asset?.ok && !!legS?.asset?.ok && legL.asset.under === legS.asset.under && legL.asset.type === -legS.asset.type, // prettier-ignore
    devolucaoPar: fin(maxPnlR) && maxPnlR > 0 ? ((maxPnlR - pnlR) / maxPnlR) * 100 : null,
  };
}
