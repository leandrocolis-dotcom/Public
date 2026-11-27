// Gatilhos › Pares long × short (puro, testado). Duas pontas quase simétricas do mesmo ativo-base (ex.: SOXL × SOXS,
// SNDU × SNDQ, UVIX × SVIX): quanto o par ganha em % da carteira, quando bate o alvo de realização e QUANTO vender
// da ponta vencedora para embolsar o alvo já líquido do custo de transação. Material educacional; não é recomendação.

/** Pares conhecidos [ponta comprada no ativo-base, ponta vendida]. */
export const KNOWN_PAIRS = [
  ["SOXL", "SOXS"], ["SNDU", "SNDQ"], ["UVIX", "SVIX"], ["UVXY", "SVIX"], ["UVXY", "SVXY"], ["TQQQ", "SQQQ"],
  ["SPXL", "SPXS"], ["UPRO", "SPXU"], ["TNA", "TZA"], ["YINN", "YANG"], ["LABU", "LABD"], ["FAS", "FAZ"],
  ["NUGT", "DUST"], ["GUSH", "DRIP"], ["ERX", "ERY"], ["TECL", "TECS"], ["UDOW", "SDOW"], ["TMF", "TMV"],
  ["NVDL", "NVDD"],
]; // prettier-ignore

/** Alavancagem contra o ativo-base (sinal = direção). Fora da lista: pelo nome ("-2x", "Bear 3X"…), senão 1. */
export const LEV = {
  SOXL: 3, SOXS: -3, SNDU: 2, SNDQ: -2, UVIX: 2, SVIX: -1, UVXY: 1.5, SVXY: -0.5, TQQQ: 3, SQQQ: -3, SPXL: 3,
  SPXS: -3, UPRO: 3, SPXU: -3, TNA: 3, TZA: -3, YINN: 3, YANG: -3, LABU: 3, LABD: -3, FAS: 3, FAZ: -3, NUGT: 2,
  DUST: -2, GUSH: 2, DRIP: -2, ERX: 2, ERY: -2, TECL: 3, TECS: -3, UDOW: 3, SDOW: -3, TMF: 3, TMV: -3, NVDL: 2,
  NVDD: -1,
}; // prettier-ignore

export const MAX_PAIRS = 3;
export const DEFAULT_TARGETS = [0.01, 0.02, 0.05];
export const DEFAULT_FEE = 0.01;

export function levOf(sym, name = "") {
  if (LEV[sym] != null) return LEV[sym];
  const n = String(name ?? "");
  const m = n.match(/(-?)([123])x\b/i);
  const lev = m ? +m[2] : /\bultra\b/i.test(n) ? 2 : 1;
  const inv = /\b(bear|inverse|short)\b/i.test(n) || m?.[1] === "-";
  return lev * (inv ? -1 : 1);
}

/** Pares conhecidos com as duas pontas na carteira (até MAX_PAIRS). */
export function detectPairs(syms) {
  const have = new Set(syms);
  const used = new Set();
  const out = [];
  for (const [a, b] of KNOWN_PAIRS) {
    if (out.length >= MAX_PAIRS) break;
    if (have.has(a) && have.has(b) && !used.has(a) && !used.has(b)) {
      out.push([a, b]);
      used.add(a).add(b);
    }
  }
  return out;
}

/** "1, 2, 5" ou "1,5; 3" → [0.01, 0.02, 0.05] (em ordem, sem repetir, entre 0,1% e 50%). */
export function parseTargets(text) {
  const s = String(text ?? "").trim();
  // "1,2,5" sem outro separador: vírgulas separam; com espaço ou ";", a vírgula é decimal ("1,5; 3")
  const parts = /[;\s]/.test(s) ? s.split(/[;\s]+|,(?=\s)/) : (s.match(/,/g)?.length ?? 0) > 1 ? s.split(",") : [s]; // prettier-ignore
  const xs = parts
    .map((t) => parseFloat(t.replace(",", ".")))
    .filter((x) => x >= 0.1 && x <= 50)
    .map((x) => Math.round(x * 100) / 10000);
  return [...new Set(xs)].sort((a, b) => a - b);
}

/**
 * Estado do par. legs: [{ sym, qty, avg, price, pc, lev }]; base "day" mede desde o fechamento anterior (pc),
 * "cost" desde o preço médio. fee = custo por venda, em fração do valor vendido.
 * gross = ganho das duas pontas (grossPct = ÷ patrimônio); closeNet = gross − custo de zerar as duas pontas agora.
 */
export function pairState(legs, { equity, fee = DEFAULT_FEE, base = "day" } = {}) {
  const rows = legs.map((l) => {
    const ref = base === "day" ? (l.pc > 0 ? l.pc : l.avg) : l.avg;
    const value = l.qty * l.price;
    return { ...l, ref, value, pl: l.qty * (l.price - ref), move: ref > 0 ? l.price / ref - 1 : null, expo: value * l.lev }; // prettier-ignore
  });
  const value = rows.reduce((a, r) => a + r.value, 0);
  const gross = rows.reduce((a, r) => a + r.pl, 0);
  const closeFee = fee * value;

  const expo = rows.reduce((a, r) => a + r.expo, 0);
  const absExpo = rows.reduce((a, r) => a + Math.abs(r.expo), 0);
  const tilt = absExpo > 0 ? expo / absExpo : 0; // −1 (todo vendido no ativo-base) a +1 (todo comprado)
  const winner = rows.filter((r) => r.price - r.ref > 0).sort((a, b) => b.pl - a.pl)[0] ?? null;
  return { rows, value, gross, grossPct: equity > 0 ? gross / equity : null, closeFee, closeNet: gross - closeFee, expo, tilt, winner }; // prettier-ignore
}

/**
 * Quanto vender da ponta para embolsar `amount` (US$) já líquido do custo: cada cota vendida rende
 * (preço − referência) − fee × preço. Cotas inteiras, arredondadas para cima; se não houver cotas suficientes,
 * diz o máximo possível.
 */
export function takePlan(leg, amount, fee = DEFAULT_FEE) {
  const per = leg.price - leg.ref - fee * leg.price;
  if (!(per > 0))
    return { ok: false, reason: "o ganho por cota ainda não cobre o custo da venda", per };
  const need = Math.ceil(amount / per - 1e-9);
  const shares = Math.min(need, Math.floor(leg.qty));
  const notional = shares * leg.price;
  return {
    ok: shares >= need,
    sym: leg.sym,
    shares,
    notional,
    cost: notional * fee,
    realized: shares * per,
    left: leg.qty - shares,
    leftExpo: (leg.qty - shares) * leg.price * leg.lev,
    per,
  };
}

/**
 * Alvos (fração do patrimônio). Batido quando o par inteiro, depois de pagar o custo das cotas vendidas da ponta
 * vencedora, ganha pelo menos o alvo (a ponta perdedora entra na conta) e há cotas para embolsá-lo.
 * gap = quanto o par ainda precisa ganhar (com o custo da venda); plan = o que vender quando batido.
 */
export function targetsFor(st, targets, { equity, fee = DEFAULT_FEE } = {}) {
  return targets.map((t) => {
    const amount = t * equity;
    const plan = st.winner ? takePlan(st.winner, amount, fee) : null;
    const cost = plan?.ok ? plan.cost : 0;
    const hit = !!plan?.ok && st.gross - cost >= amount;
    return {
      t,
      amount,
      hit,
      gap: hit ? 0 : Math.max(0, amount + cost - st.gross),
      plan: hit ? plan : null,
      expoAfter: hit ? st.expo - st.winner.expo + plan.leftExpo : null,
    };
  });
}

/**
 * Oscilação diária típica do par em % do patrimônio: desvio-padrão dos últimos `n` dias de Σ peso × retorno,
 * peso = valor da ponta ÷ patrimônio. closes: séries de fechamento alinhadas pelo fim (último = mais recente).
 */
export function pairVol(closes, weights, n = 20) {
  const len = Math.min(...closes.map((c) => c?.length ?? 0));
  if (!(len > n)) return null;
  const tails = closes.map((c) => c.slice(-(n + 1)));
  const daily = [];
  for (let i = 1; i <= n; i++) {
    let r = 0;
    for (let k = 0; k < tails.length; k++) {
      const [p0, p1] = [tails[k][i - 1], tails[k][i]];
      if (!(p0 > 0 && p1 > 0)) return null;
      r += weights[k] * (p1 / p0 - 1);
    }
    daily.push(r);
  }
  const m = daily.reduce((a, b) => a + b, 0) / n;
  return Math.sqrt(daily.reduce((a, b) => a + (b - m) ** 2, 0) / (n - 1));
}

/** P(Z > z) da normal padrão (Abramowitz–Stegun 7.1.26, erro < 1,5e-7). */
function upperTail(z) {
  const x = Math.abs(z) / Math.SQRT2;
  const t = 1 / (1 + 0.3275911 * x);
  const erfc = t * (0.254829592 + t * (-0.284496736 + t * (1.421413741 + t * (-1.453152027 + t * 1.061405429)))) * Math.exp(-x * x); // prettier-ignore
  return z >= 0 ? erfc / 2 : 1 - erfc / 2;
}

/**
 * Quão comum é o par andar `t` (fração do patrimônio) a favor num dia, pela oscilação típica σ:
 * curva normal, uma direção. { z, p, every } com every = "1 dia em N".
 */
export function targetOdds(t, sigma) {
  if (!(sigma > 0)) return null;
  const z = t / sigma;
  const p = upperTail(z);
  return { z, p, every: p > 0 ? Math.max(1, Math.round(1 / p)) : Infinity };
}

/** Ponta do par a partir da linha da carteira avaliada (valuePortfolio) e da cotação (pc = fechamento anterior). */
export const legFrom = (r, q) => ({
  sym: r.sym,
  name: r.name ?? q?.n ?? "",
  qty: r.qty,
  avg: r.avg,
  price: r.price,
  pc: q?.pc > 0 ? q.pc : null,
  lev: levOf(r.sym, r.name ?? q?.n),
});

const pctLabel = (t) => `${String(Math.round(t * 1000) / 10).replace(".", ",")}%`;
const money = (x) => `US$ ${Math.round(x).toLocaleString("pt-BR")}`;

/**
 * Avisos de alvo batido (push e app). val = valuePortfolio(...); cfg = { pairs, targets, fee, base }.
 * Um aviso por par com o MAIOR alvo batido no dia (os menores vão em `covers`, para não chegarem depois).
 */
export function pairAlerts(val, quotes = {}, cfg = {}, { day = "" } = {}) {
  const equity = val?.total ?? 0;
  if (!(equity > 0)) return [];
  const held = Object.fromEntries((val.rows ?? []).filter((r) => r.qty > 0).map((r) => [r.sym, r]));
  const targets = cfg.targets?.length ? cfg.targets : DEFAULT_TARGETS;
  const fee = Number.isFinite(cfg.fee) ? cfg.fee : DEFAULT_FEE;
  const base = cfg.base === "cost" ? "cost" : "day";
  const pairs = (cfg.pairs ?? detectPairs(Object.keys(held))).filter(
    ([a, b]) => held[a] && held[b],
  );
  const out = [];
  for (const [a, b] of pairs) {
    const st = pairState([legFrom(held[a], quotes[a]), legFrom(held[b], quotes[b])], { equity, fee, base }); // prettier-ignore
    const hits = targetsFor(st, targets, { equity, fee }).filter((t) => t.hit);
    if (!hits.length) continue;
    const top = hits.at(-1);
    const p = top.plan;
    const keyOf = (t) => `pair:${a}-${b}:${t.t}:${base}:${day}`;
    out.push({
      key: keyOf(top),
      covers: hits.slice(0, -1).map(keyOf),
      title: `${a} × ${b} bateu ${pctLabel(top.t)} da carteira`,
      body: `Vender ${p.shares} ${p.sym} (≈ ${money(p.notional)}) embolsa ${money(p.realized)} líquido (custo ${money(p.cost)}). Par ${base === "day" ? "hoje" : "desde o médio"}: ${st.grossPct >= 0 ? "+" : "−"}${pctLabel(Math.abs(st.grossPct))}.`, // prettier-ignore
      tag: `pair-${a}-${b}`,
      url: "./?tab=trig",
    });
  }
  return out;
}

/** O que o servidor de avisos precisa saber dos pares (pares escolhidos, alvos, custo e base). */
export const pairCfg = (prefs = {}) => {
  const t = parseTargets(prefs.pairTargets ?? "");
  return {
    pairs: prefs.pairs ?? null,
    targets: t.length ? t : DEFAULT_TARGETS,
    fee: Number.isFinite(prefs.pairFee) ? prefs.pairFee : DEFAULT_FEE,
    base: prefs.pairBase === "cost" ? "cost" : "day",
  };
};
