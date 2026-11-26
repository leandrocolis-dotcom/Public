// Treino diário da VELOCIDADE do fluxo (modo sombra), depois do fechamento, logo após scripts/train-model.mjs
// (workflow train-model.yml). Diário próprio: data/speed-journal.json; estado: data/speed-model.json.
// Gatilhos (assets/speed-learn.js):
//   spd  = velocidade no fechamento (janela 8 sem, universo da base data/hist, ~930 ativos dos EUA), saída em 10 pregões;
//   ispd = velocidade no fim do pré-mercado, do pregão e do pós-mercado (barras de 5 min com pré/pós do Yahoo,
//          universo do Fluxo que está na base), saída no fechamento do pregão seguinte.
// Mesmas regras do aprendizado 2.0 (excesso em R sobre o universo, dias como observação, Benjamini-Hochberg).
// Primeira execução: reconstrói os últimos 60 pregões do diário (bf: 1, prévia, não decide).
// Uso: node scripts/train-speed.mjs [--dry]
import { readFile, writeFile } from "node:fs/promises";
import { dailyEntries, dailySpeeds, rsRatio, sessionEntries, speedModel, SESSIONS } from "../assets/speed-learn.js"; // prettier-ignore
import { appendJournal, settleJournal, marketMeanOf, riskK, RULES } from "../assets/learner.js";
import { expectedOfVol, vol5At } from "../assets/simulator.js";
import { FLOW_ASSETS } from "../assets/flow-universe.js";
import { fetchBatch } from "../api/intraday.js";
import { loadHist, speedUniverse } from "./_hist-load.mjs";

const root = new URL("..", import.meta.url);
const DRY = process.argv.includes("--dry");
const BENCH = "SPY";
const MAX = 60000; // gatilhos guardados no diário da velocidade
const BACKFILL = 60;
const read = async (f, d) => {
  try {
    return JSON.parse(await readFile(new URL(f, root), "utf8"));
  } catch {
    return d;
  }
};

const bars = await loadHist();
const spy = bars[BENCH];
if (!spy) throw new Error("data/hist/SPY.csv ausente");
const syms = speedUniverse(bars, BENCH);
const ratios = Object.fromEntries(syms.map((s) => [s, rsRatio(bars[s], spy)]));
const idx = Object.fromEntries(Object.keys(bars).map((s) => [s, new Map(bars[s].dates.map((d, i) => [d, i]))])); // prettier-ignore
const today = spy.dates.at(-1);
const spyMa = (i) => {
  if (i < 199) return null;
  let s = 0;
  for (let k = i - 199; k <= i; k++) s += spy.c[k];
  return s / 200;
};
const regimeOn = (d) => {
  const i = idx[BENCH].get(d);
  const ma = i != null ? spyMa(i) : null;
  return ma ? (spy.c[i] > ma ? 1 : 0) : undefined;
};
/** Campos comuns de um gatilho no dia d (risco pelo ATR do próprio dia; null se o ativo não tem o dia). */
const baseOf = (s, d, p = null) => {
  const i = idx[s]?.get(d);
  if (i === undefined) return null;
  const b = bars[s];
  const k = riskK(b, i);
  if (!(k > 0)) return null;
  const v = +(vol5At(b.c, i) ?? 0).toFixed(5);
  return { p: p ?? b.c[i], v, k, g: regimeOn(d), e: +expectedOfVol(v).toFixed(5) };
};

let journal = await read("data/speed-journal.json", []);
const prev = await read("data/speed-model.json", {});
const entries = [];

// ── diário (fechamento); na primeira vez, os últimos 60 pregões reconstruídos (bf: 1) ──
const days = journal.length ? [today] : spy.dates.slice(-BACKFILL);
for (const d of days) {
  const bf = d !== today || !journal.length ? { bf: 1 } : {};
  entries.push(...dailyEntries(dailySpeeds(ratios, d), d, (s) => { const b = baseOf(s, d); return b && { ...b, ...bf }; })); // prettier-ignore
}

// ── sessões: pré, pregão e pós (Yahoo, 2 pregões de barras de 5 min com pré/pós) ──
const sessSyms = [...new Set(FLOW_ASSETS.map((a) => a.sym))].filter((s) => s !== BENCH && bars[s]);
const series = {};
const missing = [];
for (let i = 0; i < sessSyms.length; i += 39) {
  const lot = [...sessSyms.slice(i, i + 39), BENCH];
  try {
    const j = await fetchBatch(lot, "short");
    Object.assign(series, j.series);
    missing.push(...j.missing);
  } catch (e) {
    console.log(`intraday ${lot[0]}…: ${e.message}`);
  }
}
const now = Date.now() / 1000;
const g = series[BENCH]?.g ?? 0;
// sessão encerrada? (o treino roda perto das 18h de NY: o pós de hoje ainda não acabou e fica para amanhã)
const done = (sess, day) => now >= day * 86400 + SESSIONS[sess].end * 60 - g;
const sess = series[BENCH]
  ? sessionEntries({ series }, BENCH, sessSyms, spy.dates, {
      done,
      base: (s, d, p) => baseOf(s, d, p),
    })
  : [];
entries.push(...sess);
console.log(`sessões: ${Object.keys(series).length} ativos com barras (${missing.length} sem) · ${sess.length} gatilhos`); // prettier-ignore

// ── diário e estado ──
const { list, added } = appendJournal(journal, entries, (s) => bars[s]?.dates);
const mktOf = marketMeanOf(Object.fromEntries(syms.map((s) => [s, bars[s]])));
journal = settleJournal(list.slice(-MAX), (s) => bars[s], 5, { mktOf });
const model = { ...speedModel(journal, prev, today), sessions: [...new Set(journal.filter((e) => !e.bf).map((e) => e.d))].length, universe: { daily: syms.length, session: sessSyms.length }, minN: RULES.minN }; // prettier-ignore
console.log(`diário da velocidade: +${added} gatilhos, ${journal.length} no total, ${journal.filter((e) => Number.isFinite(e.xR)).length} fechados`); // prettier-ignore
for (const [k, l] of Object.entries(model.logics))
  console.log(` ${k.padEnd(22)} ${l.status.padEnd(10)} dias ${String(l.x.n).padStart(3)} excesso ${l.x.mean ?? "–"}R · prévia ${l.preview.mean ?? "–"}R (${l.preview.n} dias)`); // prettier-ignore
if (!DRY) {
  await writeFile(new URL("data/speed-journal.json", root), JSON.stringify(journal));
  await writeFile(new URL("data/speed-model.json", root), JSON.stringify(model, null, 1));
}
