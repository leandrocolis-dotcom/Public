// Aprendizado da VELOCIDADE do fluxo (Simulador › 🧠 Aprendizado, modo sombra). Funções puras e testadas
// (tests/speed-learn.test.js). Pergunta: ativo ganhando tração rápido contra o benchmark CONTINUA (vale entrar)?
// E o que acelera para baixo continua caindo (vale o short)? Ver docs/VELOCIDADE-FLUXO.md e docs/ESTUDO-VELOCIDADE.md.
//
// Dois tipos de gatilho no diário do modelo (assets/learner.js, mesmas regras: excesso em R sobre o universo,
// Benjamini-Hochberg, dias como observação):
//   spd  (diário): velocidade no fechamento, janela de 8 semanas (como Fluxo/Watchlist); horizonte 10 pregões.
//   ispd (sessão): velocidade no FIM do pré-mercado (9:30), do pregão (16:00) e do pós-mercado (20:00, horário de
//        NY), janela "Hoje" em barras de 5 min com pré e pós; entrada no preço daquele momento, saída no fechamento
//        do pregão seguinte (horizonte 1). Pré do dia D é gravado na data D−1 (o fechamento D é o "1 pregão depois").
// Código do gatilho: [sessão-]direção-nível, ex.: "up-fast", "pre-dn-vfast". up = força subindo (compra);
// dn = força caindo (short). Só rápido (≥ 1,5x o ritmo típico) e muito rápido (≥ 3x) viram gatilho.
import { quadrantOf } from "./flow-engine.js";
import { rotationIntraday, speedBoard } from "./rot-intraday.js";
import { RULES, bhPass, logicKey, logicR, nextStatusR } from "./learner.js";

export const SPEED_H = { spd: 10, ispd: 1 }; // diário: 10 pregões (onde o estudo achou efeito); sessão: até o fechamento seguinte
export const SESSIONS = { pre: { label: "pré-mercado", end: 570 }, reg: { label: "pregão", end: 960 }, post: { label: "pós-mercado", end: 1200 } }; // prettier-ignore
const FAST = new Set(["fast", "vfast"]);

/** Código e tom do gatilho a partir da velocidade (null se não for rápido). */
export function speedCode(sp, sess = null) {
  if (!sp || !FAST.has(sp.level?.id) || !Number.isFinite(sp.vx) || sp.vx === 0) return null;
  const dir = sp.vx > 0 ? "up" : "dn";
  return {
    c: `${sess ? `${sess}-` : ""}${dir}-${sp.level.id}`,
    o: dir === "up" ? "buy" : "sell",
    r: dir === "up" ? 1 : -1,
  };
}

// ───────────── diário: força relativa pré-calculada (rápido no histórico inteiro) ─────────────

/**
 * Série da força relativa de um ativo contra o benchmark (mesma conta de flow-engine.rotation e dailyTail):
 * x[i] = 100 × MM10(RS)/MM50(RS) no dia dates[i] (null no aquecimento). a, b = { dates, c }.
 */
export function rsRatio(a, b) {
  const bm = new Map(b.dates.map((d, i) => [d, b.c[i]]));
  const dates = [];
  const rs = [];
  a.dates.forEach((d, i) => {
    const bv = bm.get(d);
    if (bv > 0 && a.c[i] > 0) {
      dates.push(d);
      rs.push((100 * a.c[i]) / bv);
    }
  });
  const pre = [0];
  for (const v of rs) pre.push(pre.at(-1) + v);
  const sma = (i, w) => (i - w + 1 < 0 ? null : (pre[i + 1] - pre[i + 1 - w]) / w);
  const x = rs.map((_, i) => {
    const f = sma(i, 10);
    const s = sma(i, 50);
    return f && s ? (100 * f) / s : null;
  });
  return { dates, x, at: new Map(dates.map((d, i) => [d, i])) };
}

/** Cauda de 8 pontos (1 a cada 5 pregões) terminando no dia d (como a janela 8 sem). */
export function tailOn(rr, d, { points = 8, step = 5 } = {}) {
  const n = rr.at.get(d);
  if (n === undefined) return [];
  const tail = [];
  for (let k = points - 1; k >= 0; k--) {
    const i = n - k * step;
    if (i - 10 < 0 || rr.x[i] == null || rr.x[i - 10] == null) continue;
    tail.push({ x: rr.x[i], y: (100 * rr.x[i]) / rr.x[i - 10], date: rr.dates[i] });
  }
  return tail;
}

/**
 * Velocidade de todo o universo num dia: { sym: { rel, level, vx, vy, quadrant } }. O ritmo típico é o do universo
 * inteiro naquele dia (o "1x" de comparação).
 */
export function dailySpeeds(ratios, d, { step = 5 } = {}) {
  const tails = [];
  for (const [sym, rr] of Object.entries(ratios)) {
    const tail = tailOn(rr, d);
    if (tail.length >= 3) tails.push({ sym, label: sym, tail, quadrant: quadrantOf(tail.at(-1)) });
  }
  const q = Object.fromEntries(tails.map((t) => [t.sym, t.quadrant]));
  return Object.fromEntries(speedBoard(tails, tails, { step }).map((r) => [r.sym, { ...r, quadrant: q[r.sym] }])); // prettier-ignore
}

// ───────────── sessão: pré, pregão e pós (barras de 5 min com pré/pós) ─────────────

const DAY = 86400;
/** Dia da bolsa (inteiro) e minuto do dia de um horário unix, com o fuso da bolsa (g em segundos). */
const dayOf = (t, g) => Math.floor((t + g) / DAY);
export const isoOfDay = (day) => new Date(day * DAY * 1000).toISOString().slice(0, 10);

/** Corta a série no fim da sessão `sess` do dia `day` (inclusive o que veio antes). */
export function cutSeries(sr, day, sess) {
  const end = day * DAY + SESSIONS[sess].end * 60 - (sr.g ?? 0);
  let k = sr.t.length;
  while (k > 0 && sr.t[k - 1] >= end) k--;
  return { ...sr, t: sr.t.slice(0, k), c: sr.c.slice(0, k), s: sr.s?.slice(0, k) };
}

/**
 * Velocidade de cada ativo no fim de uma sessão, contra o benchmark (janela "Hoje" com pré e pós).
 * data = resposta de api/intraday?symbols= (series). Devolve { sym: { rel, level, vx, vy, quadrant, p } } com
 * p = último preço do ativo até aquele momento; só ativos que negociaram NAQUELA sessão.
 */
export function sessionSpeeds(data, bench, syms, day, sess) {
  const series = {};
  for (const s of [...syms, bench]) {
    const sr = data?.series?.[s];
    if (sr?.t?.length) series[s] = cutSeries(sr, day, sess);
  }
  if (!series[bench]?.t?.length) return {};
  const members = syms.filter((s) => s !== bench && series[s]?.t?.length).map((s) => ({ sym: s, label: s, name: s })); // prettier-ignore
  const tails = rotationIntraday({ series }, { bench }, members, "today", {}, quadrantOf, { ext: true, sessions: true }); // prettier-ignore
  const out = {};
  const board = speedBoard(tails, tails, { step: 1 });
  const q = Object.fromEntries(tails.map((t) => [t.sym, t.quadrant]));
  for (const r of board) {
    const sr = series[r.sym];
    // a sessão precisa ter negócio do próprio ativo naquele dia (sem pré/pós em muitos ETFs pequenos)
    const g = sr.g ?? 0;
    const k = sr.t.length - 1;
    const inSess =
      dayOf(sr.t[k], g) === day && (sr.s?.[k] ?? "reg") === (sess === "reg" ? "reg" : sess);
    if (!inSess) continue;
    out[r.sym] = { ...r, quadrant: q[r.sym], p: sr.c[k] };
  }
  return out;
}

/**
 * Velocidade mais recente de cada sessão para a tela (Watchlist): pré e pregão do último dia das barras (o pregão em
 * andamento conta "até agora") e o pós do último dia que já tem pós (senão, o da véspera).
 * @returns { pre: { day, iso, by: { sym: speed } }, reg: {...}, post: {...} }
 */
export function latestSessionSpeeds(data, bench, syms) {
  const sr = data?.series?.[bench];
  const days = barDays(sr);
  if (!days.length) return {};
  const last = days.at(-1);
  const g = sr.g ?? 0;
  const hasPost = sr.t.some((t, i) => dayOf(t, g) === last && sr.s?.[i] === "post");
  const pick = { pre: last, reg: last, post: hasPost || days.length < 2 ? last : days.at(-2) };
  return Object.fromEntries(Object.entries(pick).map(([sess, day]) => [sess, { day, iso: isoOfDay(day), by: sessionSpeeds(data, bench, syms, day, sess) }])); // prettier-ignore
}

/** Dias da bolsa presentes nas barras do benchmark (inteiros, em ordem). */
export function barDays(sr) {
  const g = sr?.g ?? 0;
  return [...new Set((sr?.t ?? []).map((t) => dayOf(t, g)))].sort((a, b) => a - b);
}

/**
 * Gatilhos de sessão para o diário. dates = pregões diários (ISO, em ordem) para achar a data de gravação:
 * pré do dia D → gravado em D−1 (sai no fechamento de D); pregão de D → em D; pós de D → em D (sai em D+1).
 * done(sess, day) diz se a sessão já terminou (o treino roda às 17h50 de NY: o pós de hoje ainda não acabou).
 * base(sym, d, p) devolve os campos comuns (k, v, g, e) ou null (ativo sem histórico diário).
 */
export function sessionEntries(
  data,
  bench,
  syms,
  dates,
  { done = () => true, base = () => ({}) } = {},
) {
  const days = barDays(data?.series?.[bench]);
  const entries = [];
  for (const day of days) {
    const iso = isoOfDay(day);
    const di = dates.indexOf(iso);
    if (di < 0) continue;
    for (const sess of Object.keys(SESSIONS)) {
      if (!done(sess, day)) continue;
      const d = sess === "pre" ? dates[di - 1] : iso;
      if (!d) continue;
      const sp = sessionSpeeds(data, bench, syms, day, sess);
      for (const [s, x] of Object.entries(sp)) {
        const code = speedCode(x, sess);
        if (!code) continue;
        const b = base(s, d, x.p);
        if (!b) continue;
        entries.push({ ...b, d, s, p: x.p, t: "ispd", h: SPEED_H.ispd, ...code, rel: +x.rel.toFixed(2), at: `${iso} ${sess}` }); // prettier-ignore
      }
    }
  }
  return entries;
}

/**
 * Hipótese nascida do estudo retroativo (docs/ESTUDO-VELOCIDADE.md): o que cai MUITO RÁPIDO (≥ 3x) ainda em "Perdendo força"
 * (força acima de 100, só perdendo o fôlego) tende a REPICAR, não a seguir caindo. Gatilho de compra separado,
 * para o diário confirmar fora da amostra (o estudo que a sugeriu não vale como prova).
 */
export function reversalCode(sp) {
  const base = speedCode(sp);
  if (!base || base.r !== -1 || sp.level.id !== "vfast" || sp.quadrant !== "Perdendo força")
    return null;
  return { c: "rev-pf", o: "buy", r: 1 };
}

/** Gatilhos diários de um dia: continuação (up/dn) e a hipótese de repique. base(sym, d) = campos comuns ou null. */
export function dailyEntries(speeds, d, base) {
  const out = [];
  for (const [s, x] of Object.entries(speeds)) {
    const b = base(s, d);
    if (!b) continue;
    for (const code of [speedCode(x), reversalCode(x)])
      if (code) out.push({ ...b, d, s, t: "spd", h: SPEED_H.spd, ...code, q: x.quadrant, rel: +x.rel.toFixed(2) }); // prettier-ignore
  }
  return out;
}

/**
 * Estado das lógicas de velocidade (mesmas regras do aprendizado 2.0): excesso em R por dia, Benjamini-Hochberg
 * entre as lógicas com 30+ dias, aprovada / em avaliação / eliminada (nextStatusR). Só os gatilhos de fora da
 * amostra (sem bf) decidem; os reconstruídos (bf: 1) aparecem como prévia.
 */
export function speedModel(journal, prev = {}, date = null) {
  const by = {};
  const prevBy = {};
  for (const e of journal) {
    if (!Number.isFinite(e.xR)) continue;
    (e.bf ? prevBy : by)[logicKey(e)] ??= [];
    (e.bf ? prevBy : by)[logicKey(e)].push(e);
  }
  const keys = [...new Set([...Object.keys(by), ...Object.keys(prevBy)])].sort();
  const stats = Object.fromEntries(keys.map((k) => [k, logicR(by[k] ?? [])]));
  const pass = bhPass(keys.filter((k) => stats[k].x.n >= RULES.minN).map((k) => [k, stats[k].x.p]));
  const r4 = (v) => (Number.isFinite(v) ? +v.toFixed(4) : null);
  const pick = (st) => ({ n: st.n, raw: st.raw, mean: r4(st.mean), lower: r4(st.lower), upper: r4(st.upper), p: r4(st.p) }); // prettier-ignore
  const logics = {};
  for (const k of keys) {
    const was = prev.logics?.[k];
    const status = nextStatusR(stats[k].x, was?.status ?? "eval", pass.has(k));
    logics[k] = {
      x: pick(stats[k].x),
      win: pick(stats[k].win),
      bull: pick(stats[k].bull),
      bear: pick(stats[k].bear),
      preview: pick(logicR(prevBy[k] ?? []).x),
      status,
      since: was && was.status === status ? was.since : date,
    };
  }
  return { updatedAt: date, logics };
}

// ───────────── leitura para a tela ─────────────

const SESS_TXT = { pre: "Pré-mercado", reg: "Pregão", post: "Pós-mercado" };
/** "pre-up-vfast" → "Pré-mercado · força subindo muito rápido (≥ 3x)". */
export function speedCodeLabel(code) {
  if (code === "rev-pf")
    return "Fechamento · queda muito rápida (≥ 3x) em Perdendo força → compra no repique (hipótese)";
  const parts = String(code).split("-");
  const sess = parts.length === 3 ? parts[0] : null;
  const [dir, lv] = parts.slice(-2);
  const lvTxt = lv === "vfast" ? "muito rápido (≥ 3x)" : "rápido (≥ 1,5x)";
  const txt = `${dir === "up" ? "força subindo" : "força caindo"} ${lvTxt}`;
  return sess ? `${SESS_TXT[sess] ?? sess} · ${txt}` : `Fechamento · ${txt}`;
}
