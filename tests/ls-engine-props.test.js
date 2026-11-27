// Long & Short: testes de propriedade do motor (computeLs, limitPrice). Estados aleatórios com semente fixa
// (mulberry32), ~2.000 cenários por propriedade: sessões, plano, calendário, travas do dia, ordens vivas,
// stops atingidos, devolução, P&L variado, short real (dir −1) com/sem aluguel e ETFs bull/bear do catálogo.
import { describe, expect, it } from "vitest";
import { computeLs, limitPrice } from "../assets/ls-engine.js";
import { assetInfo, ETF_CATALOG } from "../assets/ls-etfs.js";
import { PARAMS } from "../assets/ls-params.js";
import { pyRound } from "../assets/ls-core.js";

const N = 2000;
const TOL = 1e-6;

function mulberry32(a) {
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function gen(rnd) {
  const r = (a, b) => a + (b - a) * rnd();
  const ri = (a, b) => Math.floor(r(a, b + 1));
  const pick = (xs) => xs[Math.floor(rnd() * xs.length)];
  const chance = (p) => rnd() < p;
  const c2 = (x) => pyRound(x, 2);
  return { r, ri, pick, chance, c2 };
}

const ETF_SYMS = Object.keys(ETF_CATALOG);
const REAL_SHORTS = ["QQQ", "SPY", "IWM", "SOXX", "XLK"];
const BASE = Date.parse("2026-12-01T05:00:00Z"); // 00:00 ET
const SESSION_MIN = {
  PRE: [240, 569],
  REGULAR: [570, 959],
  POS: [960, 1199],
  FECHADO: [1200, 1439],
};

function makeLeg(g, sym, real, now, clean, capital) {
  const { r, ri, pick, chance, c2 } = g;
  const asset = real ? { ok: true, sym, L: 1, type: 1, under: sym } : assetInfo(sym);
  const dir = real ? -1 : chance(0.15) ? -1 : 1;
  const P = c2(r(5, 200));
  const spreadTicks = clean ? ri(1, 3) : chance(0.1) ? ri(20, 200) : ri(1, 4);
  const bidT = ri(0, spreadTicks);
  const noBidAsk = !clean && chance(0.05);
  const quote = {
    P,
    bid: noBidAsk ? undefined : c2(Math.max(0.01, P - bidT * 0.01)),
    ask: noBidAsk ? undefined : c2(P + (spreadTicks - bidT) * 0.01),
    ts: now - (clean ? r(0, 5) : r(0, 40)) * 1000,
  };
  const maxQ = Math.max(2, Math.floor((capital * (clean ? r(0.02, 0.12) : r(0.02, 0.45))) / P));
  const qty = chance(clean ? 0.45 : 0.3) ? 0 : chance(0.12) ? 1 : ri(2, maxQ);
  const avg = qty > 0 ? c2(P * (1 + r(-0.12, 0.12))) : null;
  let stop = null;
  if (qty > 0 && !chance(0.1)) {
    // atrás do médio (normal), ou já cruzado pelo preço (stop atingido), ou no lucro (travado)
    const k = r(0, 1);
    const winning = dir * (P - avg) > 0;
    if (k < (clean ? 0.05 : 0.15))
      stop = c2(P * (1 + dir * r(0, 0.05))); // atingido
    else if (winning && k < (clean ? 0.7 : 0.35))
      stop = c2(avg + dir * (P - avg) * r(0, 0.9)); // subido
    else stop = c2((dir === 1 ? Math.min(P, avg) : Math.max(P, avg)) * (1 - dir * r(0.005, 0.06)));
  }
  const ext = chance(0.4) ? r(0, 0.1) : 0; // 40% com devolução desde a máxima a favor
  const hwm = qty > 0 ? c2(dir === 1 ? Math.max(P, avg) * (1 + ext) : Math.min(P, avg) * (1 - ext)) : null; // prettier-ignore
  const S = c2(r(50, 600));
  const favor = (asset.type ?? 1) * dir;
  const aligned = clean && chance(0.7); // rompimento a favor e lado certo da VWAP
  const under = {
    S,
    atrIntra: !clean && chance(0.04) ? null : S * r(0.002, 0.012),
    atrD: S * r(0.01, 0.03),
    vwap: { value: aligned ? S * (1 - favor * r(0.001, 0.01)) : S * (1 + r(-0.01, 0.01)), approx: false }, // prettier-ignore
    or: { done: clean || chance(0.7) },
    breakout: { dir: aligned ? (favor === 1 ? "up" : "down") : pick(["up", "down", null]), volRel: r(0.5, 3) }, // prettier-ignore
    crosses: ri(0, 6),
  };
  if (chance(0.1)) under.gap = { atr: r(-3, 3) };
  const leg = {
    sym,
    dir,
    qty,
    avg,
    stop,
    hwm,
    pRef: c2(P * (1 + r(-0.05, 0.05))),
    asset,
    quote,
    under,
  };
  if (chance(0.2)) leg.entryUnder = c2(S * (1 + r(-0.04, 0.04)));
  if (chance(0.2)) leg.partialDone = true;
  if (qty > 0 && chance(0.4)) leg.lastLot = ri(1, qty);
  if (dir === -1)
    leg.borrow = clean || chance(0.6) ? { ok: true, rateAa: r(0, 0.2) } : { ok: false };
  if (!clean && chance(0.03)) leg.recall = true;
  if (!clean && chance(0.03)) leg.corpEvent = true;
  return leg;
}

function makeCase(seed) {
  const g = gen(mulberry32(seed));
  const { r, ri, pick, chance } = g;
  if (chance(0.15)) return makePyrCase(g);
  const clean = chance(0.35);
  const session = clean ? pick(["REGULAR", "REGULAR", "PRE"]) : pick(Object.keys(SESSION_MIN));
  const [lo, hi] = SESSION_MIN[session];
  const minET = clean && session === "REGULAR" ? ri(585, 890) : ri(lo, hi);
  const now = BASE + minET * 60000;
  const capital = Math.round(r(5000, 100000));
  const nPairs = ri(1, 3);
  const pool = [...ETF_SYMS];
  const take = () => pool.splice(Math.floor(r(0, pool.length)), 1)[0];
  const usedReal = new Set();
  const pairs = [];
  const syms = [];
  for (let k = 0; k < nPairs; k++) {
    const id = `p${k}`;
    const mk = (forceNull) => {
      if (forceNull) return null;
      let sym;
      let real = false;
      if (chance(0.15)) {
        const cand = REAL_SHORTS.filter((s) => !usedReal.has(s));
        if (cand.length) {
          sym = pick(cand);
          usedReal.add(sym);
          real = true;
        }
      }
      sym ??= take();
      syms.push(sym);
      return makeLeg(g, sym, real, now, clean, capital);
    };
    const long = mk(chance(0.15));
    const short = mk(!long ? false : chance(0.15));
    const pr = { id, name: `Par ${k}`, long, short };
    if (clean || chance(0.8)) pr.corr = r(clean ? 0.5 : 0.2, 0.95);
    if (chance(0.5)) {
      pr.betas = {};
      for (const l of [long, short]) if (l?.asset?.ok) pr.betas[l.asset.under] = r(0.3, 1.8);
    }
    pairs.push(pr);
  }
  const day = {};
  if (!clean) {
    if (chance(0.3)) day.entries = ri(0, 8);
    if (chance(0.3)) day.ignoredRisk30 = ri(0, 3);
    if (chance(0.3)) day.losses = ri(0, 4);
    if (chance(0.15)) day.realized = -r(0, 0.03) * capital;
    if (chance(0.03)) day.rsk01Locked = true;
  }
  if (chance(clean ? 0.6 : 0.3)) {
    day.reduced = {};
    for (const pr of pairs) if (chance(0.5)) day.reduced[pr.id] = [pick([pr.long, pr.short].filter(Boolean)).sym]; // prettier-ignore
  }
  if (chance(0.2)) day.lastAdj = { [pick(syms)]: now - r(0, 20) * 60000 };
  if (chance(0.15)) day.lastStop = { [pick(syms)]: now - r(0, 30) * 60000 };
  if (chance(0.1)) day.stopsBySym = { [pick(syms)]: ri(0, 3) };
  if (chance(0.2)) day.adds = { [pick(syms)]: ri(0, 3) };
  const input = {
    now,
    session,
    minET,
    date: "2026-12-01",
    capital,
    plan: { ok: clean || chance(0.75), pairs: Object.fromEntries(pairs.map((p) => [p.id, { dirPlan: chance(0.7) ? 0 : r(-0.3, 0.3) }])) }, // prettier-ignore
    calendar: { blocks: !clean && chance(0.12) },
    day,
    pairs,
  };
  if (!clean && chance(0.15)) input.liveOrders = Array.from({ length: ri(1, 3) }, () => ({ purpose: pick(["REDUZIR", "ZERAR", "ENTRAR", "AUMENTAR"]), sym: pick(syms) })); // prettier-ignore
  if (!clean && chance(0.12)) input.events = [{ atMs: now + r(-40, 60) * 60000 }];
  if (!clean && chance(0.1)) input.weeklyLossHit = true;
  if (chance(0.2)) input.peak = capital * r(1, 1.2);
  return input;
}

/** Par vencedor com a oposta já reduzida, stop no médio e rompimento a favor: exercita P6 (aumentar) liberado. */
function makePyrCase(g) {
  const { r, ri, pick, chance, c2 } = g;
  const minET = ri(600, 880);
  const now = BASE + minET * 60000;
  const capital = Math.round(r(10000, 100000));
  const real = chance(0.3);
  const bulls = ETF_SYMS.filter((s) => ETF_CATALOG[s].type === 1);
  const bears = ETF_SYMS.filter((s) => ETF_CATALOG[s].type === -1);
  const wSym = real ? pick(REAL_SHORTS) : pick(bulls);
  const asset = real ? { ok: true, sym: wSym, L: 1, type: 1, under: wSym } : assetInfo(wSym);
  const dir = real ? -1 : 1;
  const P = c2(r(10, 150));
  const avg = c2(P * (1 - dir * r(0.02, 0.1)));
  const qty = Math.max(2, Math.floor((capital * r(0.08, 0.2)) / P));
  const S = c2(r(50, 600));
  const favor = asset.type * dir;
  const winner = {
    sym: wSym,
    dir,
    qty,
    avg,
    stop: chance(0.7) ? avg : c2(avg + dir * (P - avg) * r(0, 0.5)),
    hwm: P,
    pRef: c2(P * (1 + r(-0.03, 0.03))),
    asset, // prettier-ignore
    quote: { P, bid: c2(P - 0.01), ask: c2(P + 0.01), ts: now - r(0, 5) * 1000 },
    under: { S, atrIntra: S * r(0.002, 0.008), atrD: S * 0.02, vwap: { value: S * (1 - favor * r(0.001, 0.01)) }, or: { done: true }, breakout: { dir: favor === 1 ? "up" : "down", volRel: r(1.5, 3) }, crosses: ri(0, 3) }, // prettier-ignore
    lastLot: ri(Math.ceil(qty / 2), qty),
  };
  if (dir === -1) winner.borrow = { ok: chance(0.85), rateAa: r(0, 0.1) };
  const lSym = pick(bears);
  const lP = c2(r(10, 80));
  const lQty = ri(1, Math.max(1, Math.floor((capital * 0.08) / lP)));
  const loser = {
    sym: lSym,
    dir: 1,
    qty: lQty,
    avg: c2(lP * (1 + r(0, 0.02))),
    stop: c2(lP * (1 - r(0.02, 0.05))),
    hwm: null,
    pRef: lP,
    asset: assetInfo(lSym), // prettier-ignore
    quote: { P: lP, bid: c2(lP - 0.01), ask: c2(lP + 0.01), ts: now - r(0, 5) * 1000 },
    under: { S: 400, atrIntra: 2, atrD: 8, vwap: { value: 401 }, or: { done: true }, breakout: { dir: null }, crosses: 1 }, // prettier-ignore
  };
  const pr = { id: "w", name: "Vencedor", corr: r(0.4, 0.95), long: winner, short: loser };
  if (chance(0.3)) pr.betas = { [asset.under]: r(0.5, 1.5), [loser.asset.under]: r(0.5, 1.5) };
  const day = { reduced: { w: [lSym] } };
  if (chance(0.3)) day.adds = { [wSym]: ri(0, 2) };
  return {
    now,
    session: chance(0.85) ? "REGULAR" : pick(["PRE", "POS"]),
    minET,
    date: "2026-12-01",
    capital, // prettier-ignore
    plan: { ok: chance(0.9), pairs: { w: { dirPlan: chance(0.5) ? 0 : r(-0.3, 0.3) } } },
    calendar: { blocks: chance(0.05) },
    day,
    pairs: [pr],
  };
}

const CASES = Array.from({ length: N }, (_, i) => {
  const input = makeCase(1000 + i);
  return { seed: 1000 + i, input, out: computeLs(input) };
});

const isReduce = (o) => o.purpose === "REDUZIR" || o.purpose === "ZERAR";
const isBuy = (o) => o.purpose === "ENTRAR" || o.purpose === "AUMENTAR";
const legsOf = (input) => input.pairs.flatMap((p) => [p.long, p.short].filter(Boolean));
const legBySym = (input, sym) => legsOf(input).find((l) => l.sym === sym);
const ctx = (c, o) => `seed ${c.seed} ${o ? `${o.sym} ${o.purpose} ${o.reason}` : ""}`;

describe("motor L&S: propriedades (2.000 cenários com semente fixa)", () => {
  it("gera cenários variados (sanidade do gerador)", () => {
    const all = CASES.flatMap((c) => c.out.orders);
    expect(CASES.every((c) => c.out.ok)).toBe(true);
    expect(all.filter(isReduce).length).toBeGreaterThan(500);
    expect(all.filter((o) => isBuy(o) && !o.blocked).length).toBeGreaterThan(50);
    for (const pr of ["P0", "P1", "P2", "P3", "P4", "P5", "P6", "P7"]) expect(all.some((o) => o.reason === pr), pr).toBe(true); // prettier-ignore
    expect(all.some((o) => o.side === "COMPRAR_PARA_COBRIR")).toBe(true);
    expect(all.some((o) => o.side === "VENDER_A_DESCOBERTO")).toBe(true);
  });

  it("1. REDUZIR/ZERAR nunca levam trava de carteira (só DEC-08 em P5 e EXE-02)", () => {
    for (const c of CASES)
      for (const o of c.out.orders.filter(isReduce)) {
        for (const b of o.blockers) {
          const ok = b.id === "EXE-02" || (b.id === "DEC-08" && o.reason === "P5");
          expect(ok, `${ctx(c, o)} bloqueador ${b.id}`).toBe(true);
        }
        expect(o.blocked, ctx(c, o)).toBe(o.blockers.length > 0);
      }
  });

  it("2. lado da ordem pela finalidade e dir", () => {
    const T = { REDUZIR: { 1: "VENDER", "-1": "COMPRAR_PARA_COBRIR" }, AUMENTAR: { 1: "COMPRAR", "-1": "VENDER_A_DESCOBERTO" } }; // prettier-ignore
    for (const c of CASES)
      for (const o of c.out.orders) {
        const leg = legBySym(c.input, o.sym);
        const dir = leg.dir === -1 ? -1 : 1;
        const key = isReduce(o) ? "REDUZIR" : "AUMENTAR";
        expect(o.side, ctx(c, o)).toBe(T[key][dir]);
      }
  });

  it("3. quantidade de redução inteira, 1 ≤ qty ≤ posição; ZERAR = posição inteira", () => {
    for (const c of CASES)
      for (const o of c.out.orders.filter(isReduce)) {
        const leg = legBySym(c.input, o.sym);
        expect(Number.isInteger(o.qty), ctx(c, o)).toBe(true);
        expect(o.qty, ctx(c, o)).toBeGreaterThanOrEqual(1);
        expect(o.qty, ctx(c, o)).toBeLessThanOrEqual(leg.qty);
        if (o.purpose === "ZERAR") expect(o.qty, ctx(c, o)).toBe(leg.qty);
      }
  });

  it("4. no máximo uma ordem REDUZIR/ZERAR por ativo", () => {
    for (const c of CASES) {
      const syms = c.out.orders.filter(isReduce).map((o) => o.sym);
      expect(new Set(syms).size, ctx(c)).toBe(syms.length);
    }
  });

  it("5. ENTRAR/AUMENTAR liberadas: inteiras, dentro de exposição, concentração e com stop do lado certo", () => {
    let checked = 0;
    for (const c of CASES) {
      const { input, out } = c;
      const cap = input.capital;
      const red = new Map(out.orders.filter(isReduce).map((o) => [o.sym, o.qty]));
      // visão do motor: pontas com métricas válidas (as inválidas ficam fora; ver relatório)
      const valid = new Set(out.legs.filter((m) => m.ok).map((m) => m.sym));
      const expOf = (l, q) => q * l.quote.P * l.asset.L * l.asset.type * (l.dir === -1 ? -1 : 1);
      const base = legsOf(input).filter((l) => valid.has(l.sym)).map((l) => ({ l, q: l.qty - (red.get(l.sym) ?? 0) })); // prettier-ignore
      for (const o of out.orders.filter((x) => isBuy(x) && !x.blocked)) {
        const leg = legBySym(input, o.sym);
        const dir = leg.dir === -1 ? -1 : 1;
        expect(Number.isInteger(o.qty) && o.qty >= 1, ctx(c, o)).toBe(true);
        let liq = 0;
        let bru = 0;
        for (const { l, q } of base) {
          const e = expOf(l, q + (l.sym === o.sym ? o.qty : 0));
          liq += e;
          bru += Math.abs(e);
        }
        expect(Math.abs(liq), `${ctx(c, o)} líquida`).toBeLessThanOrEqual(PARAMS.exposicao_liquida_max_x_capital * cap + TOL); // prettier-ignore
        expect(bru, `${ctx(c, o)} bruta`).toBeLessThanOrEqual(PARAMS.exposicao_bruta_max_x_capital * cap + TOL); // prettier-ignore
        const valueAfter = (leg.qty + o.qty) * leg.quote.P;
        expect(valueAfter, `${ctx(c, o)} concentração`).toBeLessThanOrEqual((PARAMS.concentracao_max_pct_capital / 100) * cap + TOL); // prettier-ignore
        if (dir === 1) expect(o.stop, `${ctx(c, o)} stop`).toBeLessThan(leg.quote.P);
        else expect(o.stop, `${ctx(c, o)} stop`).toBeGreaterThan(leg.quote.P);
        checked++;
      }
    }
    expect(checked).toBeGreaterThan(50);
  });

  it("6. POS/FECHADO ou sem plano: nenhuma ENTRAR/AUMENTAR liberada", () => {
    let n = 0;
    for (const c of CASES) {
      const s = c.input.session;
      if (!(s === "POS" || s === "FECHADO" || !c.input.plan.ok)) continue;
      for (const o of c.out.orders.filter(isBuy)) {
        expect(o.blocked, ctx(c, o)).toBe(true);
        n++;
      }
    }
    expect(n).toBeGreaterThan(20);
  });

  it("7. ordens em prioridade não decrescente P0..P7", () => {
    for (const c of CASES) {
      const pr = c.out.orders.map((o) => Number(o.reason.slice(1)));
      for (let k = 1; k < pr.length; k++) expect(pr[k], ctx(c)).toBeGreaterThanOrEqual(pr[k - 1]);
    }
  });

  it("8a. preço limite das ordens do motor: compra ≥ ask, venda ≤ bid; redução no pré/pós com folga", () => {
    for (const c of CASES)
      for (const o of c.out.orders) {
        const q = legBySym(c.input, o.sym).quote;
        const buy = o.side === "COMPRAR" || o.side === "COMPRAR_PARA_COBRIR";
        const ext = c.input.session === "PRE" || c.input.session === "POS";
        if (buy && q.ask > 0) expect(o.limit, ctx(c, o)).toBeGreaterThanOrEqual(q.ask);
        if (!buy && q.bid > 0) expect(o.limit, ctx(c, o)).toBeLessThanOrEqual(q.bid);
        if (ext && isReduce(o) && !buy && q.bid > 0) expect(o.limit, ctx(c, o)).toBe(pyRound(q.bid * 0.995, 2)); // prettier-ignore
        if (ext && isReduce(o) && buy && q.ask > 0) expect(o.limit, ctx(c, o)).toBe(pyRound(q.ask * 1.005, 2)); // prettier-ignore
      }
  });

  it("8b. limitPrice isolado em cotações aleatórias (centavos)", () => {
    const g = gen(mulberry32(77));
    const sides = ["COMPRAR", "VENDER", "COMPRAR_PARA_COBRIR", "VENDER_A_DESCOBERTO"];
    const purposes = ["ENTRAR", "AUMENTAR", "REDUZIR", "ZERAR"];
    const sessions = ["PRE", "REGULAR", "POS", "FECHADO"];
    for (let k = 0; k < N; k++) {
      const P = g.c2(g.r(0.5, 500));
      const bid = g.chance(0.1) ? undefined : g.c2(Math.max(0.01, P - g.ri(0, 30) * 0.01));
      const ask = g.chance(0.1) ? undefined : g.c2(P + g.ri(0, 30) * 0.01);
      const q = { P, bid, ask };
      const s = g.pick(sides);
      const pu = g.pick(purposes);
      const se = g.pick(sessions);
      const { limit, from } = limitPrice(s, pu, se, q);
      const buy = s === "COMPRAR" || s === "COMPRAR_PARA_COBRIR";
      const red = pu === "REDUZIR" || pu === "ZERAR";
      const ext = se === "PRE" || se === "POS";
      const tag = `${k} ${s} ${pu} ${se} ${JSON.stringify(q)}`;
      expect(limit, tag).toBeGreaterThan(0);
      if (buy && ask > 0) {
        expect(from, tag).toBe("ask");
        expect(limit, tag).toBeGreaterThanOrEqual(ask);
        expect(limit, tag).toBe(ext && red ? pyRound(ask * 1.005, 2) : ask);
      } else if (!buy && bid > 0) {
        expect(from, tag).toBe("bid");
        expect(limit, tag).toBeLessThanOrEqual(bid);
        expect(limit, tag).toBe(ext && red ? pyRound(bid * 0.995, 2) : bid);
      } else expect(from, tag).toBe("último");
    }
  });

  it("9. determinismo: mesma entrada → mesma saída, e a entrada não é alterada", () => {
    for (const c of CASES) {
      const fresh = makeCase(c.seed);
      expect(JSON.stringify(fresh), ctx(c)).toBe(JSON.stringify(c.input));
      expect(JSON.stringify(computeLs(fresh)), ctx(c)).toBe(JSON.stringify(c.out));
    }
  });
});
