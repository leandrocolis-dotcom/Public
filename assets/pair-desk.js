// Carteira › Duplas L/S (puro, testado): painel das duplas long × short (pontas e alavancagem em assets/pairs.js).
// Desenho "Leme e Escada" (docs/design/DUPLAS.md). Dois gestos por dupla:
//  • leme (postura): exposição líquida ÷ bruta no ativo-base (valor × alavancagem), −1 todo vendido a +1 todo
//    comprado. Com uma postura-alvo, devolve os dois jeitos de chegar lá: vender a ponta contrária (realiza contra
//    o médio) ou comprar a ponta a favor (usa caixa).
//  • escada (travas): stops em degraus na ponta no lucro; degrau k retém keeps[k] do lucro desde o médio:
//    stop = médio + reter × (agora − médio). Cotas divididas igualmente entre os degraus.
// Mais a venda parcial (realizar %) e "se as travas executarem, a dupla fica com". O regime não entra em conta.
// Material educacional; não é recomendação de investimento.
import { DEFAULT_FEE, pairState } from "./pairs.js";

export const DESK_DEFAULTS = { sell: 0, keeps: [0.5], fee: DEFAULT_FEE };
export const MAX_STEPS = 3;

const fin = Number.isFinite;
const clamp = (x, lo, hi) => Math.max(lo, Math.min(hi, x));

/** "50 70" / "50; 70" / "50/70" / 50 / [0.5] → [0.5, 0.7] (1 a 100%, sem repetir, até 3 degraus). */
export function parseSteps(v) {
  if (Array.isArray(v)) return normSteps(v);
  if (fin(v)) return normSteps([v]);
  const parts = String(v ?? "")
    .trim()
    .split(/[\s;/]+|,(?=\s)|,(?=\d{2,}\b)/)
    .map((t) => parseFloat(t.replace(",", ".")))
    .filter((x) => x >= 1 && x <= 100)
    .map((x) => x / 100);
  return normSteps(parts);
}
const normSteps = (xs) =>
  [...new Set(xs.filter((x) => fin(x) && x > 0 && x <= 1).map((x) => Math.round(x * 1000) / 1000))]
    .sort((a, b) => a - b)
    .slice(0, MAX_STEPS);

/**
 * Ordens de uma ponta no lucro desde o médio: venda parcial (`sell` das cotas, a preço de agora) e a escada de
 * stops com o que sobra. Ordens em cotas inteiras (stop e limitada não aceitam fração).
 */
export function legOrders(
  r,
  { sell = 0, keeps = DESK_DEFAULTS.keeps, fee = DESK_DEFAULTS.fee } = {},
) {
  const profit = r.qty > 0 && r.price > 0 && r.avg > 0 ? r.price - r.avg : null;
  const out = { profit, sale: null, stops: [] };
  if (!(profit > 0)) return out;
  const shares = Math.floor(r.qty * clamp(fin(sell) ? sell : 0, 0, 1) + 1e-9);
  if (shares >= 1) {
    const notional = shares * r.price;
    out.sale = {
      shares,
      notional,
      cost: notional * fee,
      realized: shares * profit - notional * fee,
    };
  }
  const steps = parseSteps(keeps);
  const rest = Math.floor(r.qty - shares + 1e-9);
  if (!(rest >= 1) || !steps.length) return out;
  const n = Math.min(steps.length, rest);
  const each = Math.floor(rest / n);
  // degrau mais alto (mais perto do preço) primeiro: é o que executa antes numa virada
  out.stops = steps
    .slice(-n)
    .reverse()
    .map((keep, k) => {
      const q = k === n - 1 ? rest - each * (n - 1) : each;
      const price = r.avg + keep * profit;
      return { keep, shares: q, price, dist: price / r.price - 1, keeps: q * (price - r.avg) - q * price * fee }; // prettier-ignore
    });
  return out;
}

/**
 * Leme: jeitos de levar a dupla da postura atual (E/G) à postura-alvo t. Vender x US$ de exposição da ponta
 * contrária: E' = E ± x, G' = G − x → x = |tG − E| / (1 ± t); comprar y da ponta a favor: G' = G + y →
 * y = |tG − E| / (1 ∓ t). Cada opção em cotas inteiras, com o que realiza (venda) ou o caixa que usa (compra).
 */
export function tiltPlan(rows, target, { fee = DESK_DEFAULTS.fee, cash = null } = {}) {
  const E = rows.reduce((a, r) => a + r.expo, 0);
  const G = rows.reduce((a, r) => a + Math.abs(r.expo), 0);
  const now = G > 0 ? E / G : 0;
  if (!fin(target) || !(G > 0)) return { now, want: null, options: [] };
  const t = clamp(target, -1, 1);
  if (Math.abs(t - now) < 0.02) return { now, want: t, options: [], ok: true };
  const up = t > now; // quer mais comprado
  const gap = Math.abs(t * G - E);
  const against = rows.find((r) => (up ? r.lev < 0 : r.lev > 0));
  const favor = rows.find((r) => (up ? r.lev > 0 : r.lev < 0));
  const options = [];
  if (against && against.qty > 0) {
    const x = gap / (1 + (up ? t : -t));
    const need = x / (against.price * Math.abs(against.lev));
    const shares = Math.min(Math.round(need), Math.floor(against.qty + 1e-9));
    if (shares >= 1) {
      const notional = shares * against.price;
      options.push({ side: "sell", sym: against.sym, shares, notional, realized: shares * (against.price - against.avg) - notional * fee, full: shares >= Math.round(need) }); // prettier-ignore
    }
  }
  if (favor && Math.abs(t) < 1) {
    const y = gap / (1 - (up ? t : -t));
    const shares = Math.round(y / (favor.price * Math.abs(favor.lev)));
    if (shares >= 1) {
      const notional = shares * favor.price;
      const use = notional * (1 + fee);
      options.push({ side: "buy", sym: favor.sym, shares, notional, cashUse: use, fits: !fin(cash) || use <= cash }); // prettier-ignore
    }
  }
  return { now, want: t, options };
}

/**
 * Painel inteiro. pairs: [{ key, legs, sell, keeps, tilt }] (legs como em pairState); opts: { fee, base, cash,
 * account }. Comprado = valor das pontas com alavancagem positiva; vendido = das inversas. % = resultado ÷ investido
 * na mesma base. Garantido = resultado da dupla se todas as travas executarem (vendas e stops nas pontas no lucro
 * contra o médio + as pontas no prejuízo marcadas a preço de agora).
 */
export function deskState(pairs, opts = {}) {
  const fee = fin(opts.fee) ? opts.fee : DESK_DEFAULTS.fee;
  const base = opts.base === "day" ? "day" : "cost";
  const cash = fin(opts.cash) ? opts.cash : null;
  const out = pairs.map(({ key, legs, sell = 0, keeps = DESK_DEFAULTS.keeps, tilt = null }) => {
    const st = pairState(legs, { fee, base });
    const steps = parseSteps(keeps);
    const rows = st.rows.map((r) => {
      const inv = r.qty * r.ref;
      const high = fin(r.high) && r.high > 0 ? Math.max(r.high, r.price) : null;
      const back = high ? { high, at: r.highAt ?? null, ses: r.highSes ?? null, pct: r.price / high - 1, usd: r.qty * (high - r.price) } : null; // prettier-ignore
      return { ...r, side: r.lev < 0 ? "short" : "long", inv, plPct: inv > 0 ? r.pl / inv : null, day: r.pc > 0 ? r.price / r.pc - 1 : null, back, orders: legOrders(r, { sell, keeps: steps, fee }) }; // prettier-ignore
    });
    const sum = (f) => rows.reduce((a, r) => a + f(r), 0);
    const inv = sum((r) => r.inv);
    const pl = sum((r) => r.pl);
    const locked = sum((r) => {
      const o = r.orders;
      if (!(o.profit > 0)) return r.qty * (r.price - r.avg); // ponta no prejuízo: como está agora
      const inStops = o.stops.reduce((a, s) => a + s.shares, 0);
      const loose = r.qty - (o.sale?.shares ?? 0) - inStops; // fração fora das ordens: a preço de agora
      return (o.sale?.realized ?? 0) + o.stops.reduce((a, s) => a + s.keeps, 0) + loose * o.profit;
    });
    const hasStops = rows.some((r) => r.orders.stops.length);
    return {
      key,
      rows,
      long: sum((r) => (r.side === "long" ? r.value : 0)),
      short: sum((r) => (r.side === "short" ? r.value : 0)),
      expo: st.expo,
      inv,
      pl,
      plPct: inv > 0 ? pl / inv : null,
      locked: hasStops ? locked : null,
      sell,
      keeps: steps,
      tilt: tiltPlan(rows, tilt, { fee, cash }),
    };
  });
  const sum = (f) => out.reduce((a, p) => a + f(p), 0);
  const inv = sum((p) => p.inv);
  const long = sum((p) => p.long);
  const short = sum((p) => p.short);
  const expo = sum((p) => p.expo);
  const gross = sum((p) => p.rows.reduce((a, r) => a + Math.abs(r.expo), 0));
  const account = fin(opts.account) && opts.account > 0 ? opts.account : null;
  const lockedPairs = out.filter((p) => p.locked != null);
  return {
    pairs: out,
    base,
    fee,
    total: {
      long,
      short,
      inv,
      pl: sum((p) => p.pl),
      plPct: inv > 0 ? sum((p) => p.pl) / inv : null,
      expo,
      expoPct: account ? expo / account : null,
      posture: gross > 0 ? expo / gross : null,
      cash,
      locked: lockedPairs.length ? lockedPairs.reduce((a, p) => a + p.locked, 0) : null,
    },
  };
}

/**
 * Trava da carteira (todas as duplas de uma vez): um só nível para todas as pontas no lucro. `pct` = fração do
 * lucro de cada ponta a reter; ou `usd` = quanto a carteira das duplas deve garantir no total (vira o pct que,
 * com as pontas no prejuízo vendidas a mercado, chega nesse valor). Devolve as ordens para zerar tudo:
 * stop nas pontas no lucro, venda a mercado nas pontas no prejuízo; `now` = zerar tudo agora (líquido do custo);
 * `locked` = resultado se os stops executarem. pairs = deskState(...).pairs.
 */
export function bookPlan(pairs, { pct = null, usd = null, fee = DESK_DEFAULTS.fee } = {}) {
  const rows = pairs.flatMap((p) => p.rows.map((r) => ({ ...r, pair: p.key })));
  if (!rows.length) return null;
  const win = rows.filter((r) => r.price > r.avg && r.qty > 0);
  const lose = rows.filter((r) => !(r.price > r.avg) && r.qty > 0);
  const now = rows.reduce((a, r) => a + r.qty * (r.price - r.avg) - r.qty * r.price * fee, 0);
  const loseNow = lose.reduce((a, r) => a + r.qty * (r.price - r.avg) - r.qty * r.price * fee, 0);
  const winProfit = win.reduce((a, r) => a + Math.floor(r.qty + 1e-9) * (r.price - r.avg), 0);
  let k = fin(pct) ? pct : null;
  if (k == null && fin(usd) && winProfit > 0) {
    // garante usd ≈ Σ q·k·lucro − custo das vendas no stop + pontas no prejuízo a mercado
    const feeAt = (kk) => win.reduce((a, r) => a + Math.floor(r.qty + 1e-9) * (r.avg + kk * (r.price - r.avg)) * fee, 0); // prettier-ignore
    const k0 = (usd - loseNow) / winProfit;
    k = (usd - loseNow + feeAt(clamp(k0, 0, 1))) / winProfit;
  }
  if (k == null) return { k: null, now, legs: [], locked: null };
  const kk = clamp(k, 0, 1);
  const legs = [];
  let locked = loseNow;
  for (const r of win) {
    const q = Math.floor(r.qty + 1e-9);
    const loose = r.qty - q; // fração não vai no stop: vendida a mercado agora
    const price = r.avg + kk * (r.price - r.avg);
    const keeps =
      q * (price - r.avg) - q * price * fee + loose * (r.price - r.avg) - loose * r.price * fee;
    locked += keeps;
    legs.push({ pair: r.pair, sym: r.sym, kind: "stop", shares: q, loose, price, dist: price / r.price - 1, keeps }); // prettier-ignore
  }
  for (const r of lose)
    legs.push({ pair: r.pair, sym: r.sym, kind: "sell", shares: r.qty, price: r.price, keeps: r.qty * (r.price - r.avg) - r.qty * r.price * fee }); // prettier-ignore
  return { k: kk, wanted: k, now, legs, locked, reach: !(fin(usd) && k > 1) };
}

/**
 * Máxima do dia da ponta, com pré e pós (barras de 5 min de api/intraday?symbol=X&prepost=1). O dia é o pregão de
 * NY de `now` (4:00–20:00; antes das 4:00 vale o da véspera); barras de outros dias (ex.: o Yahoo ainda sem o pré
 * de hoje) não contam. O preço ao vivo e a máxima já vista nesta sessão do app (`seen`) entram na conta.
 * bars = { t (s), h, s }, g = gmtoffset (s). Devolve { high, at (s), ses: "pre" | "reg" | "post" | "live", day }.
 */
export function dayHigh(bars, { g = 0, price = null, now = Date.now() / 1000, seen = null } = {}) {
  const day = (x) => Math.floor((x + g) / 86400);
  const d = (((now + g) % 86400) + 86400) % 86400 < 4 * 3600 ? day(now) - 1 : day(now);
  let best = seen?.day === d && fin(seen.high) ? { ...seen } : null;
  const t = bars?.t ?? [];
  const h = bars?.h ?? [];
  for (let i = t.length - 1; i >= 0 && day(t[i]) >= d; i--)
    if (day(t[i]) === d && fin(h[i]) && h[i] > 0 && (!best || h[i] > best.high))
      best = { high: h[i], at: t[i], ses: bars.s?.[i] ?? "reg", day: d };
  if (fin(price) && price > 0 && (!best || price > best.high))
    best = { high: price, at: Math.floor(now), ses: "live", day: d };
  return best;
}

/** Escala da régua de preço: posição (0–100%) do médio, dos degraus, da máxima do dia e do preço de agora. */
export function barScale(avg, price, stops = [], high = null) {
  const list = (Array.isArray(stops) ? stops : [stops]).filter((x) => fin(x) && x > 0);
  const pts = [avg, price, high, ...list].filter((x) => fin(x) && x > 0);
  if (!(fin(avg) && avg > 0 && fin(price) && price > 0)) return null;
  let lo = Math.min(...pts);
  let hi = Math.max(...pts);
  const pad = (hi - lo) * 0.12 || price * 0.05;
  lo -= pad;
  hi += pad;
  const at = (p) => ((p - lo) / (hi - lo)) * 100;
  return {
    avg: at(avg),
    price: at(price),
    stops: list.map(at),
    high: fin(high) && high > 0 ? at(high) : null,
  };
}
