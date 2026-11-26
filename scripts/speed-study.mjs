// Estudo retroativo da VELOCIDADE do fluxo (docs/ESTUDO-VELOCIDADE.md): ativo que ganha tração rápido contra o
// S&P 500 continua (vale entrar comprado)? O que acelera para baixo continua caindo (vale o short)?
// Base: data/hist (2 anos, 1 linha por pregão, ~930 ativos dos EUA). Pregão a pregão, só com os dados até aquele dia,
// grava os gatilhos de velocidade (assets/speed-learn.js: rápido ≥ 1,5x e muito rápido ≥ 3x o ritmo típico do
// universo, janela de 8 semanas) e mede com as MESMAS regras do diário do modelo (assets/learner.js): resultado em R
// (stop 2,5 ATR, custo por perna), excesso sobre a média do universo no mesmo dia, cada dia = uma observação,
// Benjamini-Hochberg entre as lógicas. Horizontes de 1, 5 e 10 pregões; separa por quadrante e por regime.
// É PRÉVIA (sobrevivência: o universo é o de hoje). A sessão (pré/pregão/pós) não tem histórico intraday longo:
// entra no diário do modelo a partir de agora (scripts/train-model.mjs).
// Uso: node scripts/speed-study.mjs [--dry]   Saídas: data/speed-study.json e docs/ESTUDO-VELOCIDADE.md
import { writeFile } from "node:fs/promises";
import { dailyEntries, dailySpeeds, rsRatio, speedCodeLabel } from "../assets/speed-learn.js";
import { appendJournal, settleJournal, marketMeanOf, riskK, logicR, bhPass, RULES } from "../assets/learner.js"; // prettier-ignore
import { expectedOfVol, vol5At } from "../assets/simulator.js";
import { loadHist, speedUniverse } from "./_hist-load.mjs";

const root = new URL("..", import.meta.url);
const DRY = process.argv.includes("--dry");
const HS = [1, 5, 10];
const BENCH = "SPY";

const bars = await loadHist();
const spy = bars[BENCH];
if (!spy) throw new Error("data/hist/SPY.csv ausente");
const syms = speedUniverse(bars, BENCH);
const ratios = Object.fromEntries(syms.map((s) => [s, rsRatio(bars[s], spy)]));
const idx = Object.fromEntries(syms.map((s) => [s, new Map(bars[s].dates.map((d, i) => [d, i]))]));
const spyMa = (i) => {
  if (i < 199) return null;
  let s = 0;
  for (let k = i - 199; k <= i; k++) s += spy.c[k];
  return s / 200;
};
console.log(`${syms.length} ativos · ${spy.dates[0]} a ${spy.dates.at(-1)}`);

// ── gatilhos, pregão a pregão (só com os dados até o dia) ──
const raw = [];
const t0 = Date.now();
for (let di = 90; di < spy.dates.length; di++) {
  const d = spy.dates[di];
  const sp = dailySpeeds(ratios, d);
  const ma = spyMa(di);
  const g = ma ? (spy.c[di] > ma ? 1 : 0) : undefined;
  const base = (s) => {
    const i = idx[s].get(d);
    const b = bars[s];
    const k = riskK(b, i);
    if (!(k > 0)) return null;
    const v = +(vol5At(b.c, i) ?? 0).toFixed(5);
    return { p: b.c[i], v, k, g, e: +expectedOfVol(v).toFixed(5) };
  };
  raw.push(...dailyEntries(sp, d, base));
}
console.log(`${raw.length} gatilhos brutos em ${((Date.now() - t0) / 1000).toFixed(1)} s`);

const mktOf = marketMeanOf(Object.fromEntries(syms.map((s) => [s, bars[s]])));
const barsOf = (s) => bars[s];
const fmt = (st) =>
  st?.n ? { n: st.n, raw: st.raw, mean: +st.mean.toFixed(4), lower: st.lower != null ? +st.lower.toFixed(4) : null, upper: st.upper != null ? +st.upper.toFixed(4) : null, p: st.p != null ? +st.p.toFixed(4) : null } : { n: 0 }; // prettier-ignore

const out = { at: new Date().toISOString(), from: spy.dates[90], to: spy.dates.at(-1), syms: syms.length, horizons: {} }; // prettier-ignore
for (const H of HS) {
  // uma lógica por vez: o diário guarda no máximo RULES.journalMax gatilhos (cortaria os anos mais antigos)
  const list = [];
  for (const c of [...new Set(raw.map((e) => e.c))]) {
    const part = appendJournal([], raw.filter((e) => e.c === c).map((e) => ({ ...e, h: H })), (s) => bars[s]?.dates).list; // prettier-ignore
    if (part.length >= RULES.journalMax)
      throw new Error(`${c}: mais de ${RULES.journalMax} gatilhos`);
    list.push(...part);
  }
  const j = settleJournal(list, barsOf, 5, { mktOf });
  const groups = {};
  for (const e of j) if (Number.isFinite(e.xR)) (groups[e.c] ??= []).push(e);
  const logics = {};
  for (const [c, es] of Object.entries(groups)) {
    const L = logicR(es);
    // retorno simples em excesso (sem stop), no sentido da operação: quanto o gatilho rendeu acima do universo
    const xs = es.filter((e) => Number.isFinite(e.xs)).map((e) => ({ d: e.d, v: e.r * e.xs }));
    const byQ = {};
    for (const q of ["Liderando", "Ganhando força", "Perdendo força", "Atrasado"]) {
      const sub = es.filter((e) => e.q === q);
      if (sub.length) byQ[q] = fmt(logicR(sub).x);
    }
    logics[c] = { label: speedCodeLabel(c), tone: es[0].o, x: fmt(L.x), r: fmt(L.r), win: fmt(L.win), bull: fmt(L.bull), bear: fmt(L.bear), xs: fmt(dayMean(xs)), byQ }; // prettier-ignore
  }
  const pass = bhPass(Object.entries(logics).map(([c, l]) => [c, l.x.p]));
  for (const [c, l] of Object.entries(logics)) l.pass = pass.has(c);
  out.horizons[H] = { trades: j.filter((e) => Number.isFinite(e.xR)).length, logics };
}

/** Média por dia de { d, v } (cada pregão = 1 observação), no formato de dayStatsR. */
function dayMean(rows) {
  const by = new Map();
  for (const r of rows) {
    const x = by.get(r.d) ?? [0, 0];
    x[0] += r.v;
    x[1]++;
    by.set(r.d, x);
  }
  const days = [...by.values()].map(([s, k]) => s / k);
  const n = days.length;
  if (!n) return { n: 0 };
  const mean = days.reduce((a, b) => a + b, 0) / n;
  const sd = n > 1 ? Math.sqrt(days.reduce((a, b) => a + (b - mean) ** 2, 0) / (n - 1)) : 0;
  const se = sd / Math.sqrt(n);
  return { n, raw: rows.length, mean, se, lower: mean - RULES.z * se, upper: mean + RULES.z * se, p: null }; // prettier-ignore
}

// ── resumo no terminal ──
for (const H of HS) {
  console.log(`\nH = ${H} pregão(ões)`);
  for (const [c, l] of Object.entries(out.horizons[H].logics).sort()) {
    console.log(` ${c.padEnd(9)} ${l.tone.padEnd(4)} dias ${String(l.x.n).padStart(3)} gatilhos ${String(l.x.raw).padStart(5)}  excesso ${l.x.mean?.toFixed(3)}R [${l.x.lower?.toFixed(3)}; ${l.x.upper?.toFixed(3)}] p=${l.x.p}  acerto ${(l.win.mean * 100).toFixed(0)}%  ret.excesso ${(l.xs.mean * 100).toFixed(2)}%  ${l.pass ? "APROVADA (BH)" : ""}`); // prettier-ignore
  }
}

if (!DRY) {
  await writeFile(new URL("data/speed-study.json", root), JSON.stringify(out, null, 1));
  console.log("\ngravado: data/speed-study.json");
}
