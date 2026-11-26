// Ajuste do termômetro bull/bear (puro, testado; usado no app e no servidor de push).
// 1) trimPlan: quanto vender de cada posição para a agulha voltar à faixa do cenário, com a MENOR perda realizada.
//    Usa a mesma conta do termômetro (beta médio ponderado só do que está investido): vender uma posição de beta
//    acima do beta da carteira baixa a agulha; abaixo, sobe. Ordem: menor perda por ponto movido; posições no lucro
//    primeiro, as mais eficientes antes.
// 2) traction: posição marcada para reduzir (ou aumentar) ganhou tração hoje? Reduzir: alta de pelo menos
//    max(1%, 0,75 desvio diário de 20 pregões) ou cruzou o preço médio (sai no zero a zero). Aumentar: queda do mesmo
//    tamanho (comprar no recuo). Variação do dia = p / pc (regra de coerência).
// Material educacional; não é ordem.
import { decSep } from "./format.js";
import { FIT_BAND } from "./port-bias.js";

export const TRIM_MARGIN = 5; // mira um pouco dentro da faixa, não na beirada
export const TRACTION_MIN = 0.01;
export const TRACTION_SD = 0.75;

const fin = Number.isFinite;

/**
 * b: saída de portfolioBias (com parts); rows: valuation.rows ({ sym, qty, avg, price, value }).
 * Devolve null quando a carteira já está aderente ou sem cenário.
 */
export function trimPlan(b, rows, { band = FIT_BAND, margin = TRIM_MARGIN } = {}) {
  if (!b?.ok || !b.fit || b.fit.key === "ok") return null;
  const dir = b.fit.key === "hot" ? 1 : -1; // 1 = baixar a agulha
  const target = b.fit.market + dir * (band - margin);
  const t = target / 50; // beta líquido alvo
  const rowBy = Object.fromEntries((rows ?? []).map((r) => [r.sym, r]));
  let C = 0;
  let E = 0;
  for (const p of b.parts ?? []) {
    const v = rowBy[p.sym]?.value ?? 0;
    C += v;
    E += v * p.beta;
  }
  if (!(C > 0)) return null;
  const pool = (b.parts ?? [])
    .map((p) => {
      const r = rowBy[p.sym];
      if (!r || !(r.price > 0) || !(r.qty > 0)) return null;
      return { ...p, r, lossRate: r.avg > 0 ? Math.max(0, (r.avg - r.price) / r.price) : 0 };
    })
    .filter(Boolean);
  const legs = [];
  // guloso: a cada passo, a posição com menor perda por ponto movido. Vender só ajuda se o beta dela estiver do
  // lado certo do beta ATUAL da carteira (média ponderada), que muda a cada venda.
  while (pool.length && dir * (E / C - t) > 1e-9) {
    const m = E / C;
    const cands = pool
      .map((c) => ({ c, eff: dir * (c.beta - m) }))
      .filter((x) => x.eff > 1e-9)
      .sort((a, b2) => a.c.lossRate / a.eff - b2.c.lossRate / b2.eff || b2.eff - a.eff);
    if (!cands.length) break;
    const c = cands[0].c;
    pool.splice(pool.indexOf(c), 1);
    // (E − x·β) / (C − x) = t  →  x = (E − t·C) / (β − t); se não chega, vende a posição inteira
    let x = Math.min((E - t * C) / (c.beta - t), c.r.value);
    if (!(x > 0)) continue;
    const whole = c.r.qty % 1 === 0;
    let qty = x / c.r.price;
    qty = whole ? Math.ceil(qty - 1e-9) : Math.ceil(qty * 1e4) / 1e4;
    qty = Math.min(qty, c.r.qty);
    x = qty * c.r.price;
    if (C - x <= 0) break;
    E -= x * c.beta;
    C -= x;
    legs.push({
      sym: c.sym,
      qty,
      usd: x,
      pctPos: qty / c.r.qty,
      price: c.r.price,
      pl: c.r.avg > 0 ? qty * (c.r.price - c.r.avg) : null,
      beta: c.beta,
    });
  }
  const after = Math.round(Math.max(-100, Math.min(100, (50 * E) / C)));
  return {
    dir,
    target: Math.round(target),
    legs,
    after,
    reached: Math.abs(after - b.fit.market) <= band,
    totalPL: legs.reduce((a, l) => a + (l.pl ?? 0), 0),
    totalUsd: legs.reduce((a, l) => a + l.usd, 0),
  };
}

/** Desvio padrão dos retornos diários dos últimos n pregões (sem o último ponto, que pode ser o preço ao vivo). */
export function dailySd(close, n = 20) {
  const c = (close ?? []).slice(-(n + 2), -1).filter((x) => x > 0);
  if (c.length < 6) return null;
  const r = c.slice(1).map((x, i) => x / c[i] - 1);
  const m = r.reduce((a, x) => a + x, 0) / r.length;
  return Math.sqrt(r.reduce((a, x) => a + (x - m) ** 2, 0) / (r.length - 1));
}

/**
 * side: "reduce" | "add"; q: { p, pc }; close: série diária; avg: preço médio.
 * Devolve { kind: "up" | "be" | "dip", day, thr } ou null (com day/thr para mostrar quanto falta).
 */
export function traction(side, q, close, avg = null) {
  if (!(q?.p > 0) || !(q?.pc > 0)) return { kind: null, day: null, thr: null };
  const day = q.p / q.pc - 1;
  const sd = dailySd(close);
  const thr = Math.max(TRACTION_MIN, fin(sd) ? TRACTION_SD * sd : 0);
  if (side === "reduce") {
    if (day >= thr) return { kind: "up", day, thr };
    if (avg > 0 && q.p >= avg && q.pc < avg) return { kind: "be", day, thr };
  } else if (side === "add" && day <= -thr) return { kind: "dip", day, thr };
  return { kind: null, day, thr };
}

const pctTxt = (x) => `${x > 0 ? "+" : x < 0 ? "−" : ""}${(Math.abs(x) * 100).toFixed(1).replace(".", decSep())}%`; // prettier-ignore

/** Texto do aviso. */
export function tractionText(sym, tr) {
  if (tr.kind === "up")
    return { title: `${sym}: tração de alta`, body: `${pctTxt(tr.day)} hoje (limiar ${pctTxt(tr.thr)}). Você marcou para reduzir: vender na força perde menos.` }; // prettier-ignore
  if (tr.kind === "be")
    return { title: `${sym}: voltou ao preço médio`, body: `${pctTxt(tr.day)} hoje e acima do seu preço médio. Você marcou para reduzir: dá para sair sem prejuízo.` }; // prettier-ignore
  return { title: `${sym}: recuo para aumentar`, body: `${pctTxt(tr.day)} hoje (limiar ${pctTxt(-tr.thr)}). Você marcou para aumentar: comprar no recuo sai mais barato.` }; // prettier-ignore
}

/**
 * Avisos push das posições marcadas (servidor). picks: { SÍMBOLO: "reduce" | "add" }; quotes: { SÍMBOLO: { p, pc } };
 * live: { SÍMBOLO: { close } }. Um aviso por ativo, tipo e dia.
 */
export function trimAlerts(holdings, picks, { quotes = {}, live = {}, day } = {}) {
  const out = [];
  if (!picks || typeof picks !== "object") return out;
  const d = day ?? new Date().toISOString().slice(0, 10);
  for (const h of holdings ?? []) {
    const side = picks[h.sym];
    if (!(h.qty > 0) || (side !== "reduce" && side !== "add")) continue;
    const tr = traction(side, quotes[h.sym], live[h.sym]?.close, h.avg);
    if (!tr.kind) continue;
    const t = tractionText(h.sym, tr);
    out.push({ key: `trim:${h.sym}:${tr.kind}:${d}`, ...t, tag: `trim-${h.sym}`, url: `./?tab=portfolio&hold=${encodeURIComponent(h.sym)}` }); // prettier-ignore
  }
  return out;
}
