// Carteira › Duplas L/S (puro, testado): painel de controle das duplas long × short (assets/pairs.js).
// Três perguntas por dupla, sempre em US$ da conta do exterior (posições + caixa):
//  1. Alvo de saída: a dupla já ganha o alvo que eu defini? Quanto vender da ponta vencedora para embolsá-lo
//     líquido do custo (mesma conta de targetsFor).
//  2. Inclinação pelo regime: a nota do pêndulo (−100 a +100) pede a dupla inclinada para alta ou para baixa.
//     Inclinação-alvo = nota/100 × inclinação máxima (exposição líquida ÷ exposição bruta da dupla). Quando a dupla
//     está longe do alvo, lista os jeitos de chegar lá (vender uma ponta ou comprar a outra) com o resultado que
//     cada um realiza, e recomenda o de menor prejuízo / maior lucro que respeita a reserva de caixa.
//  3. Caixa: reserva mínima (fração da conta) para comprar na queda ou na alta; compra só usa o caixa acima dela.
// Material educacional; não é recomendação de investimento.
import { DEFAULT_FEE, pairState, targetsFor } from "./pairs.js";

export const DESK_DEFAULTS = {
  reserve: 0.1,
  maxTilt: 0.5,
  band: 0.1,
  fee: DEFAULT_FEE,
  goal: 0.01,
};

const clamp = (x, lo, hi) => Math.max(lo, Math.min(hi, x));
const fin = Number.isFinite;

/** Inclinação-alvo da dupla pela nota do regime: −maxTilt (defesa forte) a +maxTilt (risco forte). */
export const targetTilt = (score, maxTilt = DESK_DEFAULTS.maxTilt) =>
  fin(score) ? clamp((score / 100) * maxTilt, -maxTilt, maxTilt) : 0;

/** Caixa da conta: quanto há, a reserva-alvo e o que está livre para comprar. account = posições + caixa. */
export function cashState(cash, account, reserve = DESK_DEFAULTS.reserve) {
  const c = fin(cash) ? cash : 0;
  const want = Math.max(0, reserve) * (account > 0 ? account : 0);
  return { cash: c, share: account > 0 ? c / account : null, want, free: Math.max(0, c - want), short: Math.max(0, want - c) }; // prettier-ignore
}

/**
 * Um jeito de mexer na exposição da dupla em `delta` US$ do ativo-base: comprar ou vender cotas de uma ponta.
 * Vender realiza o resultado contra o preço MÉDIO (é o que entra no bolso) menos o custo; comprar consome caixa.
 */
export function legMove(leg, delta, fee = DESK_DEFAULTS.fee) {
  if (!(leg?.price > 0) || !leg.lev || !delta) return null;
  const notionalNeed = Math.abs(delta / leg.lev);
  // a exposição da ponta (valor × lev) anda no sentido do delta: comprar se lev e delta têm o mesmo sinal
  const buy = Math.sign(leg.lev) === Math.sign(delta);
  let shares = Math.ceil(notionalNeed / leg.price - 1e-9);
  if (!buy) shares = Math.min(shares, Math.floor(leg.qty));
  if (!(shares > 0)) return null;
  const notional = shares * leg.price;
  const cost = notional * fee;
  const realized = buy ? 0 : shares * (leg.price - leg.avg) - cost;
  return {
    sym: leg.sym,
    side: buy ? "buy" : "sell",
    shares,
    notional,
    cost,
    realized,
    cashDelta: buy ? -(notional + cost) : notional - cost,
    expoDelta: (buy ? 1 : -1) * notional * leg.lev,
    full: buy || shares * leg.price >= notionalNeed - leg.price, // vender tudo pode não bastar
  };
}

/**
 * Jeitos de levar a dupla da exposição atual à inclinação-alvo, com a recomendação.
 * Ordem de preferência: (1) vender ponta com lucro (realiza ganho e já inclina); (2) comprar a outra ponta com o
 * caixa livre acima da reserva (não realiza perda); (3) vender a ponta com o menor prejuízo.
 */
export function tiltPlan(st, { score, maxTilt, band, fee, cash } = {}) {
  const o = { ...DESK_DEFAULTS, maxTilt: maxTilt ?? DESK_DEFAULTS.maxTilt, band: band ?? DESK_DEFAULTS.band, fee: fee ?? DESK_DEFAULTS.fee }; // prettier-ignore
  const gross = st.rows.reduce((a, r) => a + Math.abs(r.expo), 0);
  const want = targetTilt(score, o.maxTilt);
  const now = gross > 0 ? st.expo / gross : 0;
  const delta = want * gross - st.expo; // US$ de exposição no ativo-base que faltam
  const on = gross > 0 && Math.abs(want - now) > o.band;
  if (!on) return { want, now, delta, ok: true, options: [], pick: null };
  const options = st.rows
    .map((leg) => legMove(leg, delta, o.fee))
    .filter(Boolean)
    .map((m) => ({ ...m, fits: m.side === "sell" || -m.cashDelta <= (cash?.free ?? 0) }));
  const gain = options
    .filter((m) => m.side === "sell" && m.realized >= 0)
    .sort((a, b) => b.realized - a.realized);
  const buyOk = options.filter((m) => m.side === "buy" && m.fits);
  const loss = options
    .filter((m) => m.side === "sell" && m.realized < 0)
    .sort((a, b) => b.realized - a.realized);
  const pick = gain[0] ?? buyOk[0] ?? loss[0] ?? null;
  const why = !pick
    ? "sem ação possível (sem cotas para vender nem caixa livre para comprar)"
    : pick === gain[0]
      ? "vende a ponta que está no lucro: realiza ganho e já inclina a dupla"
      : pick.side === "buy"
        ? "compra a outra ponta com o caixa acima da reserva: inclina sem realizar prejuízo"
        : "única saída sem caixa livre: vende a ponta com o menor prejuízo";
  return { want, now, delta, ok: false, options, pick, why };
}

/** Painel inteiro: estado de cada dupla com alvo de saída, inclinação pelo regime e o caixa da conta. */
export function deskState(pairs, { account, cash, score, move = null, cfg = {} } = {}) {
  const o = {
    ...DESK_DEFAULTS,
    ...Object.fromEntries(Object.entries(cfg).filter(([, v]) => fin(v))),
  };
  const money = cashState(cash, account, o.reserve);
  const out = pairs.map(({ key, legs, goal }) => {
    const st = pairState(legs, { equity: account, fee: o.fee, base: cfg.base ?? "cost" });
    const g = fin(goal) && goal > 0 ? goal : o.goal;
    const [exit] = targetsFor(st, [g], { equity: account, fee: o.fee });
    const tilt = tiltPlan(st, { score, maxTilt: o.maxTilt, band: o.band, fee: o.fee, cash: money });
    return { key, st, goal: g, exit, tilt };
  });
  // virada: a nota andou ≥ 10 pontos em 1h contra a inclinação atual das duplas somadas
  const net = out.reduce((a, p) => a + p.st.expo, 0);
  const turning = fin(move) && Math.abs(move) >= 10 && Math.sign(move) !== Math.sign(net || move) ? Math.sign(move) : 0; // prettier-ignore
  return { pairs: out, money, score, move, turning, net, cfg: o };
}
