// Backtest do pêndulo no diário de assertividade (puro, sem DOM). Duas perguntas, com regra registrada ANTES de
// rodar (26/11/2026, docs/ESTUDO-PESOS-PENDULO.md):
//
// HW — pesos dos blocos. A nota de 1 dia é exatamente 0,4 × Bolsas + 0,4 × Classes + 0,2 × VIX e vol (medido no
// diário: erro ≤ 0,8 ponto, só arredondamento), então qualquer peso alternativo se refaz sem baixar preço. Grade de
// 0,1 em 0,1 (66 combinações). Métrica principal: acerto do lado do SPY nos 60 min seguintes com a nota fora do
// neutro. Treino = primeiros 2/3 dos pregões de referência; teste = último 1/3. Aprova só se o melhor do treino:
//  (a) bater o atual no teste por ≥ 2 pontos percentuais;
//  (b) bootstrap por pregão (2000 sorteios) da diferença no teste com p < 0,05;
//  (c) não piorar a coerência (Spearman nota × SPY) no teste em mais de 0,05;
//  (d) não piorar a confirmação de 30 min das trocas de faixa no teste.
//
// HR — radar de virada × troca de faixa. O radar (assets/regime-reversal.js, mesmas regras da Início) rodado a
// cada 5 min sobre a trilha de 3 h do diário. Aprova como gatilho melhor que a troca de faixa se o "‼ confirmada":
//  (a) chegar ≥ 15 min antes à virada do mercado (mediana);
//  (b) sobrar ≥ 10 pontos percentuais a mais do movimento (mediana);
//  (c) confirmar em 30 min em ≥ 55% das vezes, com ≥ 20 eventos.
//
// Referência "só o preço": o lado do SPY nos 30 min anteriores prevendo os 60 min seguintes (nota não entra).
// Modo sombra: nada aqui muda pesos, avisos ou a nota. Material educacional; não é recomendação de investimento.
import { ACC, bandChanges, coherence, eventOutcome, eventSummary, forward, segments } from "./pend-accuracy.js"; // prettier-ignore
import { REV, reversalAt } from "./regime-reversal.js";

export const CURRENT = { eq: 0.4, cls: 0.4, vol: 0.2 };
export const BT = {
  trainShare: 2 / 3,
  boot: 2000,
  minGain: 2,
  maxRhoLoss: 0.05,
  h: 12,
  radarSpan: 36,
};

/** Todas as combinações de pesos em passos de 0,1 que somam 1. */
export function weightGrid(step = 0.1) {
  const n = Math.round(1 / step);
  const out = [];
  for (let a = 0; a <= n; a++)
    for (let b = 0; a + b <= n; b++) out.push({ eq: a / n, cls: b / n, vol: (n - a - b) / n });
  return out;
}

/** Pontos com a nota refeita por outros pesos dos blocos. */
export const rescore = (pts, w) =>
  pts.map((p) => ({
    ...p,
    s: Math.round(w.eq * (p.b?.eq ?? 0) + w.cls * (p.b?.cls ?? 0) + w.vol * (p.b?.vol ?? 0)),
  }));

/** Separa por pregão de referência: os primeiros `share` dos dias = treino, o resto = teste. */
export function splitByDay(pts, share = BT.trainShare) {
  const days = [...new Set(pts.map((p) => p.day))].sort();
  const cut = days[Math.floor(days.length * share)];
  return {
    train: pts.filter((p) => p.day < cut),
    test: pts.filter((p) => p.day >= cut),
    cut,
    days,
  };
}

/** Acertos e tentativas por pregão no horizonte h (para o bootstrap). */
export function hitsByDay(pts, h = BT.h, o = ACC) {
  const m = new Map();
  for (const sg of segments(pts, o)) {
    for (let i = 0; i + h < sg.length; i++) {
      const dz = sg[i + h].z - sg[i].z;
      if (Math.abs(sg[i].s) < o.neutral || dz === 0) continue;
      const r = m.get(sg[i].day) ?? [0, 0];
      r[1]++;
      if (Math.sign(dz) === Math.sign(sg[i].s)) r[0]++;
      m.set(sg[i].day, r);
    }
  }
  return m;
}

/** Gerador determinístico (bootstrap reprodutível). */
function rng(seed = 42) {
  let x = seed >>> 0;
  return () => {
    x = (x * 1664525 + 1013904223) >>> 0;
    return x / 2 ** 32;
  };
}

/** p do bootstrap por pregão: parte dos sorteios em que o candidato NÃO bate o atual (acerto agregado). */
export function bootP(candDays, curDays, n = BT.boot, seed = 42) {
  const days = [...new Set([...candDays.keys(), ...curDays.keys()])];
  if (!days.length) return null;
  const r = rng(seed);
  let le = 0;
  for (let k = 0; k < n; k++) {
    let ch = 0, ct = 0, uh = 0, ut = 0; // prettier-ignore
    for (let i = 0; i < days.length; i++) {
      const d = days[Math.floor(r() * days.length)];
      const c = candDays.get(d) ?? [0, 0];
      const u = curDays.get(d) ?? [0, 0];
      ch += c[0];
      ct += c[1];
      uh += u[0];
      ut += u[1];
    }
    if (!(ct && ut) || ch / ct <= uh / ut) le++;
  }
  return Math.round((1000 * le) / n) / 1000;
}

const hitAt = (pts, o) => forward(pts, o)[(BT.h * o.step) / 60]?.hitPct ?? null;
function evalW(pts, w, o) {
  const ps = rescore(pts, w);
  const b = bandChanges(ps, o);
  return { hit60: hitAt(ps, o), rho: coherence(ps, o).rho, bandN: b.n, confirm30: b.confirm30, late: b.medLateMin, left: b.medLeftPct }; // prettier-ignore
}

/** HW: grade de pesos no treino, melhor candidato contra o atual no teste e o veredito pelas 4 regras. */
export function weightStudy(pts, o = ACC) {
  const { train, test, cut, days } = splitByDay(pts);
  const grid = weightGrid().map((w) => ({ w, train: evalW(train, w, o) }));
  grid.sort((a, b) => (b.train.hit60 ?? -1) - (a.train.hit60 ?? -1));
  const best = grid[0];
  const cur = grid.find((g) => g.w.eq === CURRENT.eq && g.w.cls === CURRENT.cls);
  const bestTest = evalW(test, best.w, o);
  const curTest = evalW(test, CURRENT, o);
  const p = bootP(hitsByDay(rescore(test, best.w)), hitsByDay(test));
  const gain = bestTest.hit60 != null && curTest.hit60 != null ? Math.round((bestTest.hit60 - curTest.hit60) * 10) / 10 : null; // prettier-ignore
  const rules = {
    a: gain != null && gain >= BT.minGain,
    b: p != null && p < 0.05,
    c: bestTest.rho != null && curTest.rho != null && bestTest.rho >= curTest.rho - BT.maxRhoLoss,
    d: (bestTest.confirm30 ?? -1) >= (curTest.confirm30 ?? 0),
  };
  return {
    cut,
    days: days.length,
    trainN: train.length,
    testN: test.length,
    variants: grid.length,
    best: { w: best.w, train: best.train, test: bestTest },
    current: { w: CURRENT, train: cur?.train ?? null, test: curTest },
    gain,
    p,
    rules,
    approved: Object.values(rules).every(Boolean),
    top: grid.slice(0, 10),
    single: ["eq", "cls", "vol"].map((id) => ({ id, ...evalW(test, { eq: 0, cls: 0, vol: 0, [id]: 1 }, o) })), // prettier-ignore
  };
}

/** Referência "só o preço": lado do SPY nos 30 min anteriores prevendo os h passos seguintes. */
export function priceMomentum(pts, h = BT.h, back = 6, o = ACC) {
  let n = 0;
  let hit = 0;
  for (const sg of segments(pts, o)) {
    for (let i = back; i + h < sg.length; i++) {
      const past = sg[i].z - sg[i - back].z;
      const dz = sg[i + h].z - sg[i].z;
      if (!past || !dz) continue;
      n++;
      if (Math.sign(past) === Math.sign(dz)) hit++;
    }
  }
  return { n, hitPct: n ? Math.round((1000 * hit) / n) / 10 : null };
}

/**
 * Gatilhos do radar de virada sobre o diário: a cada ponto, reversalAt nas últimas 3 h do MESMO trecho
 * (referência do dia; no app a referência fica fixa na de agora, então perto das 16h os dois diferem). Um evento
 * por virada (sentido + extremo da perna), na primeira vez que atinge o estágio. px aproximado por 1 + z × 1%
 * (só pesa 10% na força e não entra nas regras da confirmação).
 */
export function radarEvents(pts, stage = "confirmed", o = ACC, rev = REV) {
  const ev = [];
  for (const sg of segments(pts, o)) {
    const tr = sg.map((p) => ({ t: p.t, score: p.s, blocks: p.b, px: 1 + p.z * 0.01 }));
    const seen = new Set();
    for (let c = rev.SLOW; c < sg.length; c++) {
      const r = reversalAt(tr.slice(Math.max(0, c - BT.radarSpan), c + 1), rev);
      if (!r || r.stage === "none") continue;
      if (stage === "confirmed" && r.stage !== "confirmed") continue;
      const key = `${r.dir}:${r.tExt}`;
      if (seen.has(key)) continue;
      seen.add(key);
      ev.push({ ...eventOutcome(sg, c, r.dir, o), strength: r.strength, kind: r.kind });
    }
  }
  return ev;
}

/** HR: radar (tendência e confirmada) × troca de faixa, com o veredito pelas 3 regras. */
export function radarStudy(pts, o = ACC) {
  const band = bandChanges(pts, o);
  const conf = radarEvents(pts, "confirmed", o);
  const watch = radarEvents(pts, "watch", o);
  const C = eventSummary(conf, o);
  const W = eventSummary(watch, o);
  const rules = {
    a: C.medLateMin != null && band.medLateMin != null && C.medLateMin <= band.medLateMin - 15,
    b: C.medLeftPct != null && band.medLeftPct != null && C.medLeftPct >= band.medLeftPct + 10,
    c: C.n >= 20 && (C.confirm30 ?? 0) >= 55,
  };
  const bandSum = { ...band };
  delete bandSum.changes;
  return { band: bandSum, confirmed: C, watch: W, rules, approved: Object.values(rules).every(Boolean), lastConfirmed: conf.slice(-15) }; // prettier-ignore
}
