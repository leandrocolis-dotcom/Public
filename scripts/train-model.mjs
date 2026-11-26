// Treino diário do modelo (modo sombra) depois do fechamento: grava data/model-journal.json (diário fora da
// amostra) e data/model.json (estado do modelo). Roda no GitHub Actions (.github/workflows/train-model.yml).
// Ativos: os 47 do Pêndulo (data/ohlc.json) + carteira e watchlists salvas na nuvem (precisa do segredo
// SUPABASE_SERVICE_ROLE_KEY; sem ele, treina só nos 47). Lógica e regras em assets/learner.js.
// Uso: node scripts/train-model.mjs [--dry]   (--dry: não grava, só mostra o resumo)
import { readFile, writeFile } from "node:fs/promises";
import { analyzeAll } from "../api/analyze.js";
import { deadlineIn } from "../api/_http.js";
import { analyzeTicker } from "../assets/integrated.js";
import { decisionEdge, traderDecision } from "../assets/decision.js";
import { regimeOf } from "../assets/edge.js";
import { levelAlert, noPosAlert } from "../assets/level-alerts.js";
import { ruleStats, signalsFor } from "../assets/signals.js";
import { computeSnapshot } from "../assets/engine.js";
import { expectedOfRule, expectedOfVol, replayTicker, vol5At } from "../assets/simulator.js"; // prettier-ignore
import {
  appendJournal,
  dayScore,
  emptyModel,
  logicKey,
  marketMeanOf,
  riskK,
  settleJournal,
  trainStep,
} from "../assets/learner.js";

const root = new URL("..", import.meta.url);
const read = async (f, d) => {
  try {
    return JSON.parse(await readFile(new URL(f, root), "utf8"));
  } catch {
    return d;
  }
};
const DRY = process.argv.includes("--dry");
const MAX_SYMS = 150;
const LOT = 15;

const ohlc = await read("data/ohlc.json");
const prices = await read("data/prices.json");
const fundData = await read("data/fundamentals.json", null);
const today = ohlc.dates.at(-1);

// ── ativos ──
async function cloudSyms() {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const url = process.env.SUPABASE_URL ?? "https://iufliktjawnfawerwvtg.supabase.co";
  if (!key)
    return { held: [], lists: [], note: "sem SUPABASE_SERVICE_ROLE_KEY: só os ativos do Pêndulo" };
  const get = async (path) => {
    const r = await fetch(`${url}/rest/v1/${path}`, { headers: { apikey: key, Authorization: `Bearer ${key}` } }); // prettier-ignore
    if (!r.ok) throw new Error(`${path}: HTTP ${r.status}`);
    return r.json();
  };
  const held = (await get("pendulo_portfolio?select=holdings")).flatMap((r) => (r.holdings ?? []).map((h) => h.sym)); // prettier-ignore
  let lists = [];
  try {
    lists = (await get("pendulo_watchlists?select=lists")).flatMap((r) => (r.lists ?? []).flatMap((l) => l.syms ?? [])); // prettier-ignore
  } catch (e) {
    console.log(`watchlists indisponíveis: ${e.message}`);
  }
  // 👍 Meus trades: os ativos em que o usuário entrou também treinam o modelo
  try {
    lists.push(...(await get("pendulo_trades?select=trades")).flatMap((r) => (r.trades ?? []).map((t) => t.sym))); // prettier-ignore
  } catch (e) {
    console.log(`trades indisponíveis: ${e.message}`);
  }
  return { held, lists, note: null };
}
const cloud = await cloudSyms().catch((e) => ({
  held: [],
  lists: [],
  note: `nuvem: ${e.message}`,
}));
const clean = (s) =>
  String(s ?? "")
    .toUpperCase()
    .trim();
const held = new Set(cloud.held.map(clean).filter(Boolean));
// sem juros/volatilidade (índices, não operáveis)
const NOT_TRADED = new Set(["US10Y", "US3M", "VIX", "DXY", "WTI"]);
const etfs = Object.keys(ohlc.bars).filter((s) => !NOT_TRADED.has(s));
const syms = [...new Set([...etfs, ...held, ...cloud.lists.map(clean)])].filter((s) => /^[A-Z0-9][A-Z0-9.\-=^]{0,14}$/.test(s)).slice(0, MAX_SYMS); // prettier-ignore
console.log(`${syms.length} ativos (${etfs.length} do Pêndulo, ${held.size} na carteira)${cloud.note ? ` · ${cloud.note}` : ""}`); // prettier-ignore

// ── histórico (Yahoo, como a aba Análise); reserva: data/ohlc.json para os 47 ──
const items = {};
const deadline = deadlineIn(240_000);
for (let i = 0; i < syms.length; i += LOT) {
  const lot = syms.slice(i, i + LOT);
  try {
    const j = await analyzeAll(lot, deadline);
    Object.assign(items, j.items);
    if (j.errors.length) console.log(j.errors.slice(0, 3).join(" | "));
  } catch (e) {
    console.log(`${lot.join(",")}: ${e.message}`);
  }
}
for (const s of etfs) {
  const b = ohlc.bars[s];
  if (!items[s]?.bars?.c?.length && b) items[s] = { bars: { dates: ohlc.dates, o: b.o, h: b.h, l: b.l, c: b.c, v: b.vk.map((x) => x * 1000) }, fund: null }; // prettier-ignore
}
// alinha todos no pregão de hoje (o do data/ohlc.json): corta barras posteriores e, se o Yahoo estiver atrasado,
// usa a série publicada dos ativos do Pêndulo (mantendo os fundamentos do Yahoo)
const lag = { ahead: 0, behind: [], fixed: 0 };
for (const [s, it] of Object.entries(items)) {
  const b = it.bars;
  if (!b?.dates?.length) continue;
  const k = b.dates.findLastIndex((d) => d <= today);
  if (k < b.dates.length - 1) {
    lag.ahead++;
    for (const f of ["dates", "o", "h", "l", "c", "v"])
      if (Array.isArray(b[f])) b[f] = b[f].slice(0, k + 1);
  }
  if (b.dates.at(-1) !== today) {
    const o = ohlc.bars[s];
    if (o) {
      it.bars = { dates: ohlc.dates, o: o.o, h: o.h, l: o.l, c: o.c, v: o.vk.map((x) => x * 1000) };
      lag.fixed++;
    } else lag.behind.push(`${s} ${b.dates.at(-1)}`);
  }
}
console.log(`${Object.keys(items).length} com histórico · pregão ${today} · cortados ${lag.ahead} · trocados pela série publicada ${lag.fixed} · atrasados ${lag.behind.length}${lag.behind.length ? ` (${lag.behind.slice(0, 5).join(", ")})` : ""}`); // prettier-ignore

// ── contexto de mercado e esperado das regras ──
const snap = computeSnapshot(prices, null);
const market = { regime: snap.regime, spy: prices.series.SPY };
const skip = new Set(["US10Y", "US3M", "VIX", "VIXY", "TBF"]);
const stats = ruleStats(Object.entries(prices.series).filter(([c]) => !skip.has(c)).map(([, s]) => s)); // prettier-ignore
const spyPe = fundData?.etf?.SPY?.pe?.filter((x) => x > 0).at(-1) ?? 25;

// ── modelo e diário ──
let model = await read("data/model.json", null);
if (!model) model = emptyModel(today);
let journal = await read("data/model-journal.json", []);

// v2: regime do dia (S&P × MM200) gravado em cada gatilho, para separar o resultado por regime
const reg = regimeOf(prices.series.SPY);
const g = reg ? (reg.bull ? 1 : 0) : undefined;
const toneDir = (t) => (t === "buy" ? 1 : t === "sell" ? -1 : 0);
const subDirs = (d) => Object.fromEntries(Object.entries(d.subs).filter(([, s]) => s).map(([k, s]) => [k, +s.dir.toFixed(3)])); // prettier-ignore
const entries = [];
const analyzed = {};
for (const s of syms) {
  const it = items[s];
  if (!it?.bars?.c?.length || it.bars.dates.at(-1) !== today) continue; // sem o pregão de hoje: não grava
  let r;
  try {
    r = analyzeTicker(s, it, { spyPe });
  } catch (e) {
    console.log(`${s}: análise falhou (${e.message})`);
    continue;
  }
  analyzed[s] = r;
  const c = it.bars.c;
  const price = c.at(-1);
  const v = +(vol5At(c, c.length - 1) ?? 0).toFixed(5);
  const base = { d: today, s, p: price, v, k: riskK(it.bars, c.length - 1) ?? undefined, g };
  const dec = traderDecision(r, market);
  const alt = traderDecision(r, market, { weights: model.weights });
  const f = dec?.final;
  if (f) {
    const a = alt?.final?.step;
    // filtro de vantagem com os dados até hoje (assets/edge.js): nota e se bloquearia a decisão
    const ed = decisionEdge(r, market, toneDir(f.step.tone));
    const edg = ed?.grade ? { eg: ed.grade, eb: ed.block ? 1 : 0 } : {};
    entries.push({ ...base, ...edg, h: 20, t: "dec", c: f.step.key, o: f.step.tone, r: toneDir(f.step.tone), e: +expectedOfVol(v).toFixed(5), sub: subDirs(dec), a: a ? { c: a.key, o: a.tone, r: toneDir(a.tone) } : undefined }); // prettier-ignore
    const al = levelAlert(r, dec, { price, hold: { qty: 1 } });
    if (al) {
      const sh = held.has(s) ? al : noPosAlert(al);
      entries.push({ ...base, t: "level", c: al.zone, o: sh.tone, r: toneDir(sh.tone), e: +expectedOfVol(v).toFixed(5) }); // prettier-ignore
    }
  }
  for (const sg of signalsFor(c, { sym: s })) {
    const dir = sg.kind === "entry" ? 1 : -1;
    entries.push({ ...base, t: "sig", c: sg.code, o: dir > 0 ? "buy" : "sell", r: dir, e: +expectedOfRule(stats, sg.code, dir).toFixed(5) }); // prettier-ignore
  }
}

const barsOf = (s) => items[s]?.bars ?? null;
const { list, added } = appendJournal(journal, entries, (s) => barsOf(s)?.dates);
journal = settleJournal(list, barsOf, 5, { mktOf: marketMeanOf(Object.fromEntries(Object.entries(items).map(([k, it]) => [k, it.bars]))) }); // prettier-ignore
console.log(`diário: +${added} gatilhos hoje, ${journal.length} no total, ${journal.filter((e) => e.out).length} encerrados`); // prettier-ignore

// ── prévia: backtest do último ano por lógica (só exibição) ──
const retro = [];
for (const s of Object.keys(analyzed)) {
  const r = analyzed[s];
  retro.push(...replayTicker(r.bars, { sym: s, held: held.has(s), beta: r.fund?.beta, stats, spy: { dates: prices.dates, close: prices.series.SPY } })); // prettier-ignore
}
const byLogic = {};
for (const x of retro.filter((x) => x.done)) (byLogic[logicKey({ t: x.type, c: x.code, o: x.tone })] ??= []).push({ d: x.date, out: x.outcome }); // prettier-ignore
const preview = Object.fromEntries(
  Object.entries(byLogic).map(([k, es]) => {
    const st = dayScore(es);
    return [k, { n: st.n, raw: st.raw, score: +st.score.toFixed(4) }];
  }),
);

const sessions = ohlc.dates.filter((d) => d >= model.startDate).length;
model = trainStep(model, journal, { date: today, sessions, preview });
model.universe = { n: Object.keys(analyzed).length, held: held.size, lists: cloud.note ? 0 : new Set(cloud.lists).size, note: cloud.note }; // prettier-ignore
model.updatedAt = new Date().toISOString();

const c = model.criteria;
console.log(`modelo: ${model.final ? "FINAL" : "em treino"} · ${model.sessions} pregões · versão ${model.versions.at(-1)?.n ?? 0}`); // prettier-ignore
c?.items.forEach((x) => console.log(` ${x.ok ? "✓" : "·"} ${x.text}`));
if (!DRY) {
  await writeFile(new URL("data/model-journal.json", root), JSON.stringify(journal));
  await writeFile(new URL("data/model.json", root), JSON.stringify(model, null, 1));
}
