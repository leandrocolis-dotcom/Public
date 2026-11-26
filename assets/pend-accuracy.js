// Assertividade do pêndulo (puro, sem DOM): mede se a nota de 1 dia (−100 a +100) mostra o que o mercado está
// fazendo, com que atraso, se as trocas de faixa se confirmam e se a intensidade bate com o tamanho do movimento.
//
// Entrada: pontos a cada 5 min { t (s), s (nota), z (SPY desde o fechamento de referência, em desvios de um dia),
// day (data do fechamento de referência), ses ("pre" | "reg" | "post" | "night"), b ({ bloco: nota }) }.
// "Mercado de fato" = SPY (ES=F fora do pregão, mesma regra do pêndulo: assets/regime-history.js).
// Leitura em modo sombra: nada aqui muda pesos, avisos ou a nota. Material educacional, não é recomendação.
import { BOUNDS, HYST } from "./mkt-regime-alerts.js";

export const ACC = {
  step: 300, // passo dos pontos (s)
  neutral: 20, // |nota| abaixo disso = neutro (não conta como "apontando")
  zMin: 0.25, // |z| abaixo disso = mercado parado (não conta na coerência)
  maxLag: 12, // atrasos testados na correlação cruzada: ±12 passos (±60 min)
  shockZ: 0.5, // choque de mercado: SPY anda ≥ 0,5 desvio em ...
  shockWin: 6, // ... 6 passos (30 min)
  reactPts: 10, // o pêndulo "reagiu" quando andou 10 pontos no mesmo sentido
  reactMax: 12, // procura a reação até 12 passos (60 min) depois do começo do choque
  whipsaw: 6, // troca de faixa desfeita em até 6 passos (30 min) = vai e volta
  pivotWin: 24, // procura a virada do mercado até 24 passos (2 h) antes da troca de faixa
  fwd: [6, 12], // horizontes à frente: 30 e 60 min
};

const ZONES = ["Defesa forte", "Defesa", "Neutro", "Risco", "Risco forte"];
const sign = (x) => (x > 0 ? 1 : x < 0 ? -1 : 0);
const mean = (xs) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);
const median = (xs) => {
  if (!xs.length) return null;
  const a = [...xs].sort((x, y) => x - y);
  const m = a.length >> 1;
  return a.length % 2 ? a[m] : (a[m - 1] + a[m]) / 2;
};
const r2 = (x) => (x == null || !Number.isFinite(x) ? null : Math.round(x * 100) / 100);
const pct = (k, n) => (n ? Math.round((1000 * k) / n) / 10 : null);

export function pearson(xs, ys) {
  const n = xs.length;
  if (n < 3) return null;
  const mx = mean(xs);
  const my = mean(ys);
  let sxy = 0;
  let sxx = 0;
  let syy = 0;
  for (let i = 0; i < n; i++) {
    sxy += (xs[i] - mx) * (ys[i] - my);
    sxx += (xs[i] - mx) ** 2;
    syy += (ys[i] - my) ** 2;
  }
  return sxx && syy ? sxy / Math.sqrt(sxx * syy) : null;
}

function ranks(xs) {
  const idx = xs.map((x, i) => [x, i]).sort((a, b) => a[0] - b[0]);
  const r = new Array(xs.length);
  for (let i = 0; i < idx.length;) {
    let j = i;
    while (j + 1 < idx.length && idx[j + 1][0] === idx[i][0]) j++;
    for (let k = i; k <= j; k++) r[idx[k][1]] = (i + j) / 2 + 1;
    i = j + 1;
  }
  return r;
}
export const spearman = (xs, ys) => (xs.length < 3 ? null : pearson(ranks(xs), ranks(ys)));

/** Índice da faixa (0 = defesa forte … 4 = risco forte) sem histerese. */
export const zoneIdx = (s) => BOUNDS.filter((b) => s >= b).length;

/** Trechos contínuos: mesmo fechamento de referência e sem buraco maior que 1,5 passo. */
export function segments(pts, o = ACC) {
  const out = [];
  let cur = [];
  for (const p of pts) {
    const prev = cur.at(-1);
    if (prev && (p.day !== prev.day || p.t - prev.t > o.step * 1.5)) {
      out.push(cur);
      cur = [];
    }
    cur.push(p);
  }
  if (cur.length) out.push(cur);
  return out;
}

/** 1. Coerência: a nota aponta para o mesmo lado que o SPY andou desde o fechamento? */
export function coherence(pts, o = ACC) {
  const act = pts.filter((p) => Math.abs(p.s) >= o.neutral && Math.abs(p.z) >= o.zMin);
  const hit = act.filter((p) => sign(p.s) === sign(p.z)).length;
  return {
    n: pts.length,
    active: act.length,
    hitPct: pct(hit, act.length),
    rho: r2(spearman(pts.map((p) => p.s), pts.map((p) => p.z))), // prettier-ignore
  };
}

/**
 * 2. Atraso estrutural: correlação entre a variação da nota e a do SPY k passos antes (k > 0 = a nota anda
 * DEPOIS do mercado). Pico em k = 0 = sem atraso; "lagMin" = minutos do pico; "spread" = quanto da resposta vem
 * depois do mesmo passo (soma das correlações com k > 0 ÷ soma com k ≥ 0).
 */
export function lagProfile(pts, o = ACC) {
  const segs = segments(pts, o).filter((s) => s.length > 2 * o.maxLag + 2);
  const prof = [];
  for (let k = -o.maxLag; k <= o.maxLag; k++) {
    const xs = [];
    const ys = [];
    for (const sg of segs) {
      for (let i = 1; i < sg.length; i++) {
        const j = i - k;
        if (j < 1 || j >= sg.length) continue;
        xs.push(sg[i].s - sg[i - 1].s);
        ys.push(sg[j].z - sg[j - 1].z);
      }
    }
    prof.push({ k, min: k * (o.step / 60), r: r2(pearson(xs, ys)), n: xs.length });
  }
  const valid = prof.filter((p) => p.r != null);
  const peak = valid.reduce((a, b) => (b.r > (a?.r ?? -2) ? b : a), null);
  const pos = valid.filter((p) => p.k >= 0).map((p) => Math.max(0, p.r));
  const tot = pos.reduce((a, b) => a + b, 0);
  return {
    profile: prof,
    peakK: peak?.k ?? null,
    lagMin: peak ? peak.min : null,
    peakR: peak?.r ?? null,
    spread: tot ? r2((tot - pos[0]) / tot) : null,
  };
}

/**
 * 3. Tempo de reação a choques: o SPY anda ≥ shockZ em shockWin passos. Mede quantos minutos o mercado levou
 * para fazer metade do choque e quantos a nota levou para andar reactPts no mesmo sentido; atraso = diferença.
 */
export function reactionTimes(pts, o = ACC) {
  const ev = [];
  const mins = o.step / 60;
  for (const sg of segments(pts, o)) {
    for (let i = 0; i + o.shockWin < sg.length; i++) {
      const dz = sg[i + o.shockWin].z - sg[i].z;
      if (Math.abs(dz) < o.shockZ) continue;
      const d = sign(dz);
      let kM = null;
      let kS = null;
      for (let k = 0; k <= o.reactMax && i + k < sg.length; k++) {
        if (kM == null && d * (sg[i + k].z - sg[i].z) >= Math.abs(dz) / 2) kM = k;
        if (kS == null && d * (sg[i + k].s - sg[i].s) >= o.reactPts) kS = k;
      }
      ev.push({ t: sg[i].t, ses: sg[i].ses, d, dz: r2(dz), mktMin: kM * mins, penMin: kS == null ? null : kS * mins, lagMin: kS == null ? null : (kS - kM) * mins }); // prettier-ignore
      i += o.shockWin; // eventos sem sobreposição
    }
  }
  const got = ev.filter((e) => e.lagMin != null);
  return {
    n: ev.length,
    reactedPct: pct(got.length, ev.length),
    medLagMin: median(got.map((e) => e.lagMin)),
    meanLagMin: r2(mean(got.map((e) => e.lagMin))),
    events: ev,
  };
}

/** Faixas com histerese (mesma regra do aviso 🧭): troca só ao passar a fronteira por HYST pontos. */
export function bandTrack(sg) {
  let b = zoneIdx(sg[0].s);
  return sg.map((p) => {
    while (b < 4 && p.s >= BOUNDS[b] + HYST) b++;
    while (b > 0 && p.s < BOUNDS[b - 1] - HYST) b--;
    return b;
  });
}

/**
 * 4. Trocas de faixa: para cada troca, se o SPY seguiu no sentido em 30 e 60 min, se a faixa voltou em até
 * 30 min (vai e volta), quantos minutos depois da virada do mercado (extremo do SPY nas 2 h anteriores) ela veio
 * e que parte do movimento total (da virada ao extremo seguinte, até 60 min) ainda sobrava quando ela veio.
 */
/**
 * Resultado de um gatilho no índice c do trecho sg, no sentido d: SPY no sentido em cada horizonte de o.fwd (z),
 * minutos desde a virada do mercado (extremo contrário do SPY nas 2 h anteriores) e que parte do movimento total
 * (da virada ao extremo seguinte, até o maior horizonte) ainda sobrava no gatilho.
 */
export function eventOutcome(sg, c, d, o = ACC) {
  const hz = Math.max(...o.fwd);
  const fwd = Object.fromEntries(
    o.fwd.map((h) => [h, c + h < sg.length ? d * (sg[c + h].z - sg[c].z) : null]),
  );
  let pv = c;
  for (let k = Math.max(0, c - o.pivotWin); k <= c; k++) if (d * (sg[k].z - sg[pv].z) < 0) pv = k;
  let ex = c;
  for (let k = c; k <= Math.min(sg.length - 1, c + hz); k++) if (d * (sg[k].z - sg[ex].z) > 0) ex = k; // prettier-ignore
  const done = d * (sg[c].z - sg[pv].z);
  const left = d * (sg[ex].z - sg[c].z);
  return {
    t: sg[c].t,
    ses: sg[c].ses,
    d,
    fwd,
    lateMin: (c - pv) * (o.step / 60),
    leftPct: done + left > 0 ? Math.round((100 * left) / (done + left)) : null,
  };
}

/** Resumo de uma lista de gatilhos: confirmação por horizonte, vai e volta, atraso e quanto sobrava (medianas). */
export function eventSummary(ev, o = ACC) {
  const ws = ev.filter((c) => typeof c.whipsaw === "boolean");
  const out = { n: ev.length, whipsawPct: ws.length ? pct(ws.filter((c) => c.whipsaw).length, ws.length) : null }; // prettier-ignore
  for (const h of o.fwd) {
    const v = ev.filter((c) => c.fwd[h] != null);
    out[`confirm${h * (o.step / 60)}`] = pct(v.filter((c) => c.fwd[h] > 0).length, v.length);
    out[`meanFwd${h * (o.step / 60)}`] = r2(mean(v.map((c) => c.fwd[h])));
  }
  out.medLateMin = median(ev.map((c) => c.lateMin));
  out.medLeftPct = median(ev.map((c) => c.leftPct).filter((x) => x != null));
  return out;
}

/**
 * 4. Trocas de faixa: para cada troca, o resultado do gatilho (eventOutcome) e se a faixa voltou em até 30 min
 * (vai e volta).
 */
export function bandChanges(pts, o = ACC) {
  const ch = [];
  for (const sg of segments(pts, o)) {
    const bt = bandTrack(sg);
    for (let c = 1; c < sg.length; c++) {
      if (bt[c] === bt[c - 1]) continue;
      let back = false;
      for (let k = 1; k <= o.whipsaw && c + k < sg.length; k++) if (bt[c + k] === bt[c - 1]) back = true; // prettier-ignore
      ch.push({ ...eventOutcome(sg, c, sign(bt[c] - bt[c - 1]), o), from: bt[c - 1], to: bt[c], whipsaw: back }); // prettier-ignore
    }
  }
  return { ...eventSummary(ch, o), changes: ch };
}

/**
 * 5. Intensidade: por faixa da nota, o tamanho médio do movimento do SPY (z) e, ao contrário, por faixa de z,
 * a nota média. Bate quando as duas escadas sobem em ordem (Spearman das médias = 1) e a reta nota ~ z explica
 * bem (R²). "slope" = pontos de nota por desvio de SPY.
 */
export const Z_BUCKETS = [-Infinity, -1.5, -0.5, 0.5, 1.5, Infinity];
export function intensity(pts) {
  const byZone = ZONES.map((label, i) => {
    const v = pts.filter((p) => zoneIdx(p.s) === i);
    return {
      zone: label,
      n: v.length,
      meanZ: r2(mean(v.map((p) => p.z))),
      medAbsZ: r2(median(v.map((p) => Math.abs(p.z)))),
    };
  });
  const byZ = Z_BUCKETS.slice(0, -1).map((lo, i) => {
    const hi = Z_BUCKETS[i + 1];
    const v = pts.filter((p) => p.z >= lo && p.z < hi);
    return { lo, hi, n: v.length, meanS: r2(mean(v.map((p) => p.s))) };
  });
  const okZ = byZone.filter((b) => b.n >= 10);
  const okS = byZ.filter((b) => b.n >= 10);
  const xs = pts.map((p) => p.z);
  const ys = pts.map((p) => p.s);
  const mx = mean(xs);
  const my = mean(ys);
  let sxy = 0;
  let sxx = 0;
  for (let i = 0; i < xs.length; i++) {
    sxy += (xs[i] - mx) * (ys[i] - my);
    sxx += (xs[i] - mx) ** 2;
  }
  const rho = pearson(xs, ys);
  return {
    byZone,
    byZ,
    monoZone: r2(spearman(okZ.map((_, i) => i), okZ.map((b) => b.meanZ))), // prettier-ignore
    monoZ: r2(spearman(okS.map((_, i) => i), okS.map((b) => b.meanS))), // prettier-ignore
    slope: sxx ? r2(sxy / sxx) : null,
    r2: rho == null ? null : r2(rho * rho),
  };
}

/** 6. À frente: a nota (fora do neutro) acerta o lado do SPY nos próximos 30/60 min? Compara com a taxa base. */
export function forward(pts, o = ACC) {
  const out = {};
  for (const h of o.fwd) {
    let n = 0;
    let hit = 0;
    let up = 0;
    let all = 0;
    const rk = [];
    const dn = [];
    for (const sg of segments(pts, o)) {
      for (let i = 0; i + h < sg.length; i++) {
        const dz = sg[i + h].z - sg[i].z;
        all++;
        if (dz > 0) up++;
        if (Math.abs(sg[i].s) < o.neutral || dz === 0) continue;
        n++;
        if (sign(dz) === sign(sg[i].s)) hit++;
        (sg[i].s > 0 ? rk : dn).push(dz);
      }
    }
    out[h * (o.step / 60)] = { n, hitPct: pct(hit, n), baseUpPct: pct(up, all), riskMeanDz: r2(mean(rk)), defMeanDz: r2(mean(dn)) }; // prettier-ignore
  }
  return out;
}

/** 7. Por bloco (Bolsas, Classes, VIX e vol): coerência com o SPY, atraso e acerto à frente (insumo dos pesos). */
export function blockStats(pts, o = ACC) {
  const ids = [...new Set(pts.flatMap((p) => Object.keys(p.b ?? {})))];
  return ids.map((id) => {
    const v = pts.filter((p) => Number.isFinite(p.b?.[id]));
    const as = v.map((p) => ({ ...p, s: p.b[id] }));
    const lag = lagProfile(as, o);
    const fw = forward(as, o);
    return {
      id,
      n: v.length,
      rho: r2(spearman(v.map((p) => p.b[id]), v.map((p) => p.z))), // prettier-ignore
      lagMin: lag.lagMin,
      peakR: lag.peakR,
      fwdHit: Object.fromEntries(Object.entries(fw).map(([k, x]) => [k, x.hitPct])),
    };
  });
}

/** Relatório completo + o mesmo por sessão (pré, pregão, pós, noite). */
export function accuracyReport(pts, o = ACC) {
  const one = (ps) => ({
    coherence: coherence(ps, o),
    lag: lagProfile(ps, o),
    reaction: reactionTimes(ps, o),
    bands: bandChanges(ps, o),
    intensity: intensity(ps),
    forward: forward(ps, o),
  });
  const all = one(pts);
  const bySession = {};
  for (const ses of ["pre", "reg", "post", "night"]) {
    const ps = pts.filter((p) => p.ses === ses);
    if (ps.length < 50) continue;
    const r = one(ps);
    bySession[ses] = {
      n: ps.length,
      coherence: r.coherence.hitPct,
      rho: r.coherence.rho,
      lagMin: r.lag.lagMin,
      reactLag: r.reaction.medLagMin,
      reacted: r.reaction.reactedPct,
      bandN: r.bands.n,
      confirm30: r.bands.confirm30,
      whipsaw: r.bands.whipsawPct,
      lateMin: r.bands.medLateMin,
      fwd30: r.forward[30]?.hitPct ?? null,
    };
  }
  return { ...all, bySession, blocks: blockStats(pts, o) };
}
