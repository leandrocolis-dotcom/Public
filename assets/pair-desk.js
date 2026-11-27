// Carteira › Duplas L/S (puro, testado): painel das duplas long × short (pontas e alavancagem em assets/pairs.js).
// Desenho "Instrumento Frio" (docs/design/DUPLAS.md). Por dupla: quanto está comprado e vendido (US$), o resultado
// de cada ponta e da dupla (US$ e % sobre o investido) e, nas pontas no lucro, duas ordens prontas:
//  • venda parcial: `sell` (fração das cotas) vendida a preço de agora, realizando contra o preço médio;
//  • trava: stop no preço que retém `keep` (fração) do lucro da ponta: stop = médio + keep × (agora − médio).
// O regime não entra em nenhuma conta (só é mostrado na tela). Material educacional; não é recomendação.
import { DEFAULT_FEE, pairState } from "./pairs.js";

export const DESK_DEFAULTS = { sell: 0, keep: 0.5, fee: DEFAULT_FEE };

const fin = Number.isFinite;
const clamp = (x, lo, hi) => Math.max(lo, Math.min(hi, x));

/**
 * Ordens prontas de uma ponta (linha de pairState). Ordens em cotas inteiras (stop e limitada não aceitam fração);
 * a fração que sobra fica fora da trava. Só ponta no lucro desde o médio tem venda e trava.
 */
export function legOrders(
  r,
  { sell = 0, keep = DESK_DEFAULTS.keep, fee = DESK_DEFAULTS.fee } = {},
) {
  const profit = r.qty > 0 && r.price > 0 && r.avg > 0 ? r.price - r.avg : null;
  const out = { profit, sale: null, stop: null };
  if (!(profit > 0)) return out;
  const s = clamp(fin(sell) ? sell : 0, 0, 1);
  const k = clamp(fin(keep) ? keep : DESK_DEFAULTS.keep, 0, 1);
  const shares = Math.floor(r.qty * s + 1e-9);
  if (shares >= 1) {
    const notional = shares * r.price;
    out.sale = {
      shares,
      notional,
      cost: notional * fee,
      realized: shares * profit - notional * fee,
    };
  }
  const rest = Math.floor(r.qty - shares + 1e-9);
  if (rest >= 1 && k > 0) {
    const price = r.avg + k * profit;
    out.stop = {
      shares: rest,
      price,
      dist: price / r.price - 1,
      keeps: rest * (price - r.avg) - rest * price * fee, // lucro retido se o stop executar, líquido do custo
      risk: rest * (r.price - price), // quanto do lucro de agora fica exposto até a trava
    };
  }
  return out;
}

/**
 * Painel inteiro. pairs: [{ key, legs, sell, keep }] (legs como em pairState); cfg: { fee, base }.
 * Comprado = valor das pontas com alavancagem positiva; vendido = valor das pontas inversas (também compradas na
 * corretora, mas apostam na queda do ativo-base). % = resultado ÷ investido na mesma base (médio ou fechamento).
 */
export function deskState(pairs, cfg = {}) {
  const fee = fin(cfg.fee) ? cfg.fee : DESK_DEFAULTS.fee;
  const base = cfg.base === "day" ? "day" : "cost";
  const out = pairs.map(({ key, legs, sell, keep }) => {
    const st = pairState(legs, { fee, base });
    const rows = st.rows.map((r) => {
      const inv = r.qty * r.ref;
      return {
        ...r,
        side: r.lev < 0 ? "short" : "long",
        inv,
        plPct: inv > 0 ? r.pl / inv : null,
        day: r.pc > 0 ? r.price / r.pc - 1 : null,
        orders: legOrders(r, { sell, keep, fee }),
      };
    });
    const sum = (f) => rows.reduce((a, r) => a + f(r), 0);
    const long = sum((r) => (r.side === "long" ? r.value : 0));
    const short = sum((r) => (r.side === "short" ? r.value : 0));
    const inv = sum((r) => r.inv);
    const pl = sum((r) => r.pl);
    return { key, rows, long, short, inv, pl, plPct: inv > 0 ? pl / inv : null, sell: sell ?? 0, keep: keep ?? DESK_DEFAULTS.keep }; // prettier-ignore
  });
  const sum = (f) => out.reduce((a, p) => a + f(p), 0);
  const inv = sum((p) => p.inv);
  const pl = sum((p) => p.pl);
  const long = sum((p) => p.long);
  const short = sum((p) => p.short);
  return {
    pairs: out,
    base,
    fee,
    total: { long, short, inv, pl, plPct: inv > 0 ? pl / inv : null, longPct: long + short > 0 ? long / (long + short) : null }, // prettier-ignore
  };
}

/**
 * Escala da régua de preço da ponta: posição (0–100%) do médio, da trava e do preço de agora, com folga nas
 * pontas para os marcadores não colarem na borda.
 */
export function barScale(avg, price, stop = null) {
  const pts = [avg, price, stop].filter((x) => fin(x) && x > 0);
  if (pts.length < 2) return null;
  let lo = Math.min(...pts);
  let hi = Math.max(...pts);
  const pad = (hi - lo) * 0.12 || price * 0.05;
  lo -= pad;
  hi += pad;
  const at = (p) => (fin(p) ? ((p - lo) / (hi - lo)) * 100 : null);
  return { avg: at(avg), price: at(price), stop: at(stop) };
}
