// Aba "Simulador": e se o usuário tivesse seguido os gatilhos da aba Sinais de hoje? Para cada gatilho (sinal de curto
// prazo, nível de preço e Decisão do trader) mede o retorno nos 5 pregões seguintes e compara com o esperado:
// Atingiu, Parcial ou Não atingiu. Duas origens: retroativa (refaz as mesmas contas da aba Sinais de hoje no histórico,
// só com os dados disponíveis em cada data) e diário (grava o que a aba Sinais de hoje mostrou e avalia depois).
// Funções puras e testadas (tests/simulator.test.js). Material educacional; não é recomendação de investimento.
import { techPillar, momPillar } from "./integrated.js";
import { traderDecision } from "./decision.js";
import { levelAlert, noPosAlert } from "./level-alerts.js";
import { signalsFor } from "./signals.js";
import { nyDate } from "./live.js";
import { store } from "./state.js";

/** Prazo de avaliação (pregões): o mesmo em que as regras e os níveis foram validados. */
export const HORIZON = 5;
/** Esperado mínimo na direção sugerida (abaixo disso, "deu certo" seria ruído). */
export const MIN_EXPECTED = 0.003;
/** Pregões mínimos antes da 1ª data simulada (a análise gráfica precisa de ~10 meses). */
export const WARMUP = 260;
/** Um mesmo gatilho que continua ativo nos dias seguintes conta uma vez a cada HORIZON pregões. */
const GAP = HORIZON;

export const TYPE_LABEL = { sig: "Sinal de curto prazo", level: "Nível de preço", dec: "Decisão do trader" }; // prettier-ignore
export const OUTCOME = {
  hit: { label: "Atingiu", tone: "buy" },
  partial: { label: "Parcial", tone: "wait" },
  miss: { label: "Não atingiu", tone: "sell" },
  open: { label: "Em andamento", tone: "neutral" },
};

/** Rótulo genérico de um gatilho de nível (zona + tom), para agrupar sem o preço do dia. */
export function levelLabel(zone, tone) {
  const z = { res: "Resistência", sup: "Suporte", stop: "Stop" }[zone] ?? zone;
  const a = { buy: zone === "res" ? "comprar/ampliar se romper" : "comprar/ampliar", sell: zone === "res" ? "realizar / não comprar" : "vender / não comprar", wait: "esperar / segurar" }[tone] ?? tone; // prettier-ignore
  return `${z}: ${a}`;
}
const withTrigger = (a) => (a.trigger ? `${a.action}. ${a.trigger}` : a.action);

const toneDir = (tone) => (tone === "buy" ? 1 : tone === "sell" ? -1 : 0);
const sigDir = (kind) => (kind === "entry" ? 1 : -1); // saída e risco sugerem reduzir

/** Oscilação normal de 5 pregões (desvio dos retornos diários de 20 dias × √5) no índice i. */
export function vol5At(c, i) {
  if (i < 21) return null;
  const r = [];
  for (let k = i - 19; k <= i; k++) r.push(c[k] / c[k - 1] - 1);
  const m = r.reduce((a, b) => a + b, 0) / r.length;
  const sd = Math.sqrt(r.reduce((a, b) => a + (b - m) ** 2, 0) / (r.length - 1));
  return sd * Math.sqrt(HORIZON);
}

/** Esperado de decisões e níveis (não há média histórica própria): ¼ da oscilação normal de 5 pregões. */
export const expectedOfVol = (vol5) => Math.max(MIN_EXPECTED, 0.25 * (vol5 ?? 0));

/** Esperado de um sinal: a média histórica da regra em 5 pregões, na direção sugerida (com piso). */
export function expectedOfRule(stats, code, dir) {
  const avg = stats?.rules?.[code]?.avgFwd;
  return Math.max(MIN_EXPECTED, Number.isFinite(avg) ? dir * avg : 0);
}

/**
 * Classifica o resultado. dir: +1 comprar/ampliar, −1 reduzir/vender, 0 aguardar. ret = retorno do ativo no prazo.
 * Com direção: Atingiu se andou a favor ao menos o esperado; Parcial se andou a favor menos que isso; Não atingiu
 * se foi contra. Aguardar: Atingiu se não subiu mais que ½ oscilação normal (esperar não custou), Parcial até 1
 * oscilação, Não atingiu se a alta passou disso (perdeu a subida).
 */
export function classify({ dir, ret, expected, vol5 }) {
  if (!Number.isFinite(ret)) return "open";
  if (dir === 0) {
    const v = vol5 > 0 ? vol5 : 0.02;
    return ret <= 0.5 * v ? "hit" : ret <= v ? "partial" : "miss";
  }
  const d = dir * ret;
  return d >= expected ? "hit" : d > 0 ? "partial" : "miss";
}

/** Resultado simulado de US$ 1.000 no gatilho: comprar ganha a alta; reduzir "ganha" a queda evitada; aguardar = 0. */
export const pnlOf = (dir, ret, notional = 1000) => (Number.isFinite(ret) && dir ? notional * dir * ret : 0); // prettier-ignore

const cut = (bars, i) => {
  const o = {};
  for (const [k, v] of Object.entries(bars)) o[k] = Array.isArray(v) ? v.slice(0, i + 1) : v;
  return o;
};

/** Série do SPY até a data d (alinhada pelas datas publicadas), para o momento de mercado da decisão. */
function spyUntil(spy, d) {
  if (!spy?.close?.length || !spy.dates?.length) return null;
  let j = spy.dates.length - 1;
  while (j >= 0 && spy.dates[j] > d) j--;
  return j >= 0 ? spy.close.slice(0, j + 1) : null;
}

/**
 * Refaz a aba Sinais de hoje em cada pregão do passado de um ativo e devolve os gatilhos com o resultado.
 * bars = { dates, o, h, l, c, v } (api/analyze), ctx = { sym, name, held, beta, stats, spy: { dates, close } }.
 * Decisão do trader: só técnica, momento de mercado (sem o regime do dia) e situações parecidas, pois os
 * fundamentos antigos não existem; amostrada a cada 5 pregões. Níveis: com a análise gráfica da última amostra.
 */
export function replayTicker(bars, ctx = {}) {
  const c = bars?.c ?? [];
  const n = c.length;
  const out = [];
  if (n < WARMUP + HORIZON + 1) return out;
  const { sym = "", held = false, stats = null } = ctx;
  const last = {};
  const push = (key, i, ev) => {
    if (last[key] !== undefined && i - last[key] < GAP) return;
    last[key] = i;
    const j = i + HORIZON;
    const ret = j < n ? c[j] / c[i] - 1 : n - 1 > i ? c[n - 1] / c[i] - 1 : null;
    const done = j < n;
    const vol5 = vol5At(c, i);
    const expected = ev.expected ?? expectedOfVol(vol5);
    const row = { sym, date: bars.dates?.[i] ?? String(i), price: c[i], src: "retro", vol5, expected, ret, done, ...ev }; // prettier-ignore
    row.outcome = done ? classify(row) : "open";
    row.pnl = done ? pnlOf(row.dir, ret) : null;
    out.push(row);
  };
  let tech = null;
  let dec = null;
  for (let i = WARMUP; i < n; i++) {
    const b = cut(bars, i);
    if ((i - WARMUP) % GAP === 0) {
      tech = techPillar(b, 0);
      const r = {
        sym, price: c[i], series: { close: b.c }, bars: b,
        pillars: { tech, mom: momPillar(b), fund: null, analyst: null }, fund: { beta: ctx.beta },
      }; // prettier-ignore
      dec = traderDecision(r, { spy: spyUntil(ctx.spy, b.dates?.[i]) });
      const step = dec?.final?.step;
      if (step)
        push(`dec:${step.key}`, i, {
          type: "dec", code: step.key, title: step.label, action: step.label,
          dir: toneDir(step.tone), tone: step.tone, conf: dec.final.conf,
          sub: Object.fromEntries(Object.entries(dec.subs).filter(([, x]) => x).map(([k, x]) => [k, x.dir])),
        }); // prettier-ignore
    }
    for (const s of signalsFor(b.c, { sym })) {
      const dir = sigDir(s.kind);
      push(`sig:${s.code}`, i, {
        type: "sig", code: s.code, title: s.title, action: s.kind === "entry" ? "Comprar (entrada)" : s.kind === "exit" ? "Realizar / reduzir" : "Proteger / reduzir",
        dir, tone: dir > 0 ? "buy" : "sell", expected: expectedOfRule(stats, s.code, dir),
      }); // prettier-ignore
    }
    if (dec?.final && tech?.levels) {
      const r = { sym, price: c[i], bars: b, pillars: { tech } };
      const a = levelAlert(r, dec, { price: c[i], hold: { qty: 1 } });
      if (a) {
        const shown = held ? a : noPosAlert(a);
        push(`level:${a.zone}:${shown.tone}`, i, {
          type: "level", code: a.zone, title: a.headline, action: withTrigger(shown),
          dir: toneDir(shown.tone), tone: shown.tone,
        }); // prettier-ignore
      }
    }
  }
  return out;
}

// ───────────── diário (gatilhos gravados da aba Sinais de hoje) ─────────────

const DIARY_MAX = 800;
const DAY = 86_400_000;

/**
 * Converte uma linha da aba Sinais de hoje (deskRow) em gatilhos para o diário. date = pregão (AAAA-MM-DD).
 */
export function rowTriggers(row, date) {
  if (!row || row.missing || !(row.price > 0)) return [];
  const base = { sym: row.sym, date, price: row.price, src: "diary" };
  const out = [];
  const f = row.dec?.final;
  if (f?.step) out.push({ ...base, type: "dec", code: f.step.key, title: f.step.label, action: f.step.label, dir: toneDir(f.step.tone), tone: f.step.tone, conf: f.conf }); // prettier-ignore
  const a = row.alert;
  if (a) out.push({ ...base, type: "level", code: a.zone, title: a.headline, action: withTrigger(a), dir: toneDir(a.tone), tone: a.tone }); // prettier-ignore
  for (const s of row.sigs ?? []) {
    const dir = sigDir(s.kind);
    out.push({ ...base, type: "sig", code: s.code, title: s.title, action: s.kind === "entry" ? "Comprar (entrada)" : s.kind === "exit" ? "Realizar / reduzir" : "Proteger / reduzir", dir, tone: dir > 0 ? "buy" : "sell" }); // prettier-ignore
  }
  return out;
}

/** Acrescenta ao diário os gatilhos novos (o mesmo gatilho do mesmo ativo só volta a contar após 7 dias). */
export function addToDiary(diary, triggers) {
  const list = [...(diary ?? [])];
  let added = 0;
  for (const t of triggers) {
    const key = `${t.sym}:${t.type}:${t.code}:${t.tone}`;
    const prev = list.findLast((x) => `${x.sym}:${x.type}:${x.code}:${x.tone}` === key);
    if (prev && Date.parse(t.date) - Date.parse(prev.date) < 7 * DAY) continue;
    list.push(t);
    added++;
  }
  return { list: list.slice(-DIARY_MAX), added };
}

/**
 * Avalia um gatilho do diário com o histórico atual do ativo (bars). Antes de 5 pregões fica "Em andamento",
 * com o retorno até agora. A entrada é o preço gravado (o da tela na hora).
 */
export function evalDiary(t, bars, stats) {
  const c = bars?.c ?? [];
  const dates = bars?.dates ?? [];
  const i = dates.findIndex((d) => d >= t.date);
  const vol5 = i > 0 ? vol5At(c, i) : null;
  const expected = t.type === "sig" ? expectedOfRule(stats, t.code, t.dir) : expectedOfVol(vol5);
  if (i < 0 || !(t.price > 0)) return { ...t, vol5, expected, ret: null, done: false, outcome: "open", pnl: null }; // prettier-ignore
  const j = i + HORIZON;
  const done = j < c.length;
  const ret = (done ? c[j] : c.at(-1)) / t.price - 1;
  const row = { ...t, vol5, expected, ret, done };
  return { ...row, outcome: done ? classify(row) : "open", pnl: done ? pnlOf(t.dir, ret) : null };
}

export const DIARY_KEY = "pendulo.sim.diary";
export const loadDiary = () => store.get(DIARY_KEY, []);

/** Grava no diário (neste aparelho) os gatilhos que a aba Sinais de hoje está mostrando agora. */
export function recordDiary(rows, now = Date.now()) {
  const date = nyDate(now / 1000);
  const trig = rows.flatMap((r) => rowTriggers(r, date));
  if (!trig.length) return 0;
  const { list, added } = addToDiary(loadDiary(), trig);
  if (added) store.set(DIARY_KEY, list);
  return added;
}

// ───────────── placar ─────────────

/** Contagem por resultado, taxa de acerto (Atingiu + ½ Parcial) e resultado simulado. Só gatilhos encerrados. */
export function summarize(rows) {
  const done = rows.filter((r) => r.done);
  const c = { hit: 0, partial: 0, miss: 0 };
  done.forEach((r) => c[r.outcome]++);
  const n = done.length;
  const traded = done.filter((r) => r.dir);
  return {
    n,
    open: rows.length - n,
    ...c,
    score: n ? (c.hit + 0.5 * c.partial) / n : null,
    pnl: traded.reduce((a, r) => a + (r.pnl ?? 0), 0),
    avgDirRet: traded.length ? traded.reduce((a, r) => a + r.dir * r.ret, 0) / traded.length : null,
    avgExpected: traded.length ? traded.reduce((a, r) => a + r.expected, 0) / traded.length : null,
  };
}

/** Agrupa e resume (ex.: por tipo, por ativo ou por gatilho). */
export function groupSummary(rows, keyOf) {
  const g = {};
  for (const r of rows) (g[keyOf(r)] ??= []).push(r);
  return Object.entries(g).map(([k, rs]) => ({ key: k, sample: rs[0], ...summarize(rs) }));
}
