// Estudo retroativo do aprendizado 2.0 (docs/ROADMAP-APRENDIZADO.md, fase F6).
// Refaz, pregão a pregão e só com os dados disponíveis em cada data, os gatilhos que o diário do modelo gravaria
// (Decisão do trader, sinais de curto prazo e níveis de preço), com os campos v2 (risco, regime, nota e bloqueio do
// filtro de vantagem, horizonte por tipo), fecha em R/excesso e mede tudo com as regras de assets/learner.js.
// É PRÉVIA: as regras foram escolhidas olhando esses anos, então o resultado é otimista. Não aprova nada no modelo.
// Ativos: os do Pêndulo + carteira e watchlists da nuvem (SUPABASE_SERVICE_ROLE_KEY) + --syms=A,B,C.
// Uso: node scripts/retro-study.mjs [--syms=AAPL,MSFT] [--range=5y] [--dry]
// Saídas: data/model-retro.json (para a tela) e docs/ESTUDO-RETROATIVO.md (relatório).
// --only=A,B,C: estuda só esses ativos (ex.: setoriais); --out=nome: grava data/model-retro-nome.json e
// docs/ESTUDO-RETROATIVO-NOME.md (não mexe no estudo geral nem na tela), com conclusões em docs/estudo-conclusoes-nome.md.
import { readFile, writeFile } from "node:fs/promises";

// Conclusões escritas por quem analisou o resultado (atualize ao rodar de novo com dados muito diferentes).
const OUT = process.argv.find((a) => a.startsWith("--out="))?.split("=")[1] ?? "";
const SUF = OUT ? `-${OUT}` : "";
const JSON_OUT = `data/model-retro${SUF}.json`;
const MD_OUT = `docs/ESTUDO-RETROATIVO${SUF.toUpperCase()}.md`;
const CONCLUSOES = (await readFile(new URL(`../docs/estudo-conclusoes${SUF}.md`, import.meta.url), "utf8").catch(() => "(sem conclusões escritas)")).trim(); // prettier-ignore
import { techPillar, momPillar } from "../assets/integrated.js";
import { traderDecision } from "../assets/decision.js";
import { levelAlert, noPosAlert } from "../assets/level-alerts.js";
import { ruleStats, signalsFor } from "../assets/signals.js";
import { expectedOfRule, expectedOfVol, vol5At, WARMUP } from "../assets/simulator.js";
import { prepareDaily, scoreDailyAt } from "../assets/ta-signals.js";
import { edgeOf, regimeOf, tradeStats } from "../assets/edge.js";
import { leverageOf } from "../assets/etf-fund.js";
import { appendJournal, settleJournal, marketMeanOf, riskK, trainStep, emptyModel, dayScore, dayStatsR, logicR, edgeValidation, weightTargetsIC, weightTargets, logicKey, RULES, actionable } from "../assets/learner.js"; // prettier-ignore

const root = new URL("..", import.meta.url);
const arg = (k, d) => process.argv.find((a) => a.startsWith(`--${k}=`))?.split("=")[1] ?? d;
const DRY = process.argv.includes("--dry");
const RANGE = arg("range", "10y");
const read = async (f, d) => {
  try {
    return JSON.parse(await readFile(new URL(f, root), "utf8"));
  } catch {
    return d;
  }
};

if (process.argv.includes("--report-only")) {
  await writeReport(await read(JSON_OUT));
  process.exit(0);
}

// ── ativos ──
const ohlc = await read("data/ohlc.json");
const NOT_TRADED = new Set(["US10Y", "US3M", "VIX", "DXY", "WTI", "USDJPY", "USDBRL"]);
const base = Object.keys(ohlc.bars).filter((s) => !NOT_TRADED.has(s));
async function cloudSyms() {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!key) return { held: [], lists: [] };
  const url = process.env.SUPABASE_URL ?? "https://iufliktjawnfawerwvtg.supabase.co";
  const get = async (p) => (await fetch(`${url}/rest/v1/${p}`, { headers: { apikey: key, Authorization: `Bearer ${key}` } })).json(); // prettier-ignore
  const held = (await get("pendulo_portfolio?select=holdings")).flatMap((r) => (r.holdings ?? []).map((h) => h.sym)); // prettier-ignore
  const lists = (await get("pendulo_watchlists?select=lists").catch(() => [])).flatMap((r) => (r.lists ?? []).flatMap((l) => l.syms ?? [])); // prettier-ignore
  return { held, lists };
}
const cloud = await cloudSyms().catch(() => ({ held: [], lists: [] }));
const extra = (arg("syms", "") || "").split(",").map((s) => s.trim().toUpperCase()).filter(Boolean); // prettier-ignore
const held = new Set([...cloud.held, ...extra].map((s) => String(s).toUpperCase()));
const only = (arg("only", "") || "").split(",").map((s) => s.trim().toUpperCase()).filter(Boolean); // prettier-ignore
const syms = [...new Set(only.length ? only : [...base, ...held, ...cloud.lists.map((s) => String(s).toUpperCase())])].filter((s) => /^[A-Z0-9][A-Z0-9.\-=^]{0,14}$/.test(s)); // prettier-ignore

// ── histórico longo (Yahoo, 5 anos) ──
async function chart(sym) {
  const u = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(sym)}?range=${RANGE}&interval=1d`;
  const r = await fetch(u, { headers: { "User-Agent": "Mozilla/5.0" }, signal: AbortSignal.timeout(20000) }); // prettier-ignore
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  const j = (await r.json()).chart?.result?.[0];
  const q = j?.indicators?.quote?.[0];
  const adj = j?.indicators?.adjclose?.[0]?.adjclose;
  if (!j?.timestamp || !q) throw new Error("sem dados");
  const out = { dates: [], o: [], h: [], l: [], c: [], v: [] };
  j.timestamp.forEach((t, i) => {
    const c = q.close[i];
    if (!(c > 0) || !(q.high[i] > 0) || !(q.low[i] > 0)) return;
    const f = adj?.[i] > 0 ? adj[i] / c : 1; // ajusta por dividendos/desdobramentos
    out.dates.push(new Date(t * 1000).toISOString().slice(0, 10));
    out.o.push((q.open[i] || c) * f);
    out.h.push(q.high[i] * f);
    out.l.push(q.low[i] * f);
    out.c.push(c * f);
    out.v.push(q.volume[i] ?? 0);
  });
  return out;
}
const bars = {};
const failed = [];
for (const s of ["SPY", ...syms]) {
  if (bars[s]) continue;
  try {
    bars[s] = await chart(s);
  } catch (e) {
    failed.push(`${s} (${e.message})`);
  }
}
const spy = bars.SPY;
const spyIdx = new Map(spy.dates.map((d, i) => [d, i]));
console.log(`${Object.keys(bars).length} ativos com histórico de ${RANGE}${failed.length ? ` · falharam: ${failed.join(", ")}` : ""}`); // prettier-ignore

// ── base das regras de sinal (como o treino): média de cada regra nos ativos do Pêndulo ──
const stats = ruleStats((only.length ? syms : base).filter((s) => bars[s]).map((s) => bars[s].c));

const cut = (b, i) => Object.fromEntries(Object.entries(b).map(([k, v]) => [k, Array.isArray(v) ? v.slice(0, i + 1) : v])); // prettier-ignore
const toneDir = (t) => (t === "buy" ? 1 : t === "sell" ? -1 : 0);
const spyUntil = (d) => {
  let j = spyIdx.get(d);
  if (j === undefined) j = spy.dates.findLastIndex((x) => x <= d);
  return j >= 0 ? spy.c.slice(0, j + 1) : null;
};

/** Trades do placar técnico (mesmo teste do filtro de vantagem), com o índice de saída: ponto a ponto sem olhar o futuro. */
function scoreTrades(b) {
  const P = prepareDaily({ ...b, closeOnly: false });
  const buy = [];
  const sell = [];
  for (let i = 210; i < P.n - 1; i++) {
    const a = scoreDailyAt(P, i);
    if (!a) continue;
    if (a.score >= 20) buy.push(i);
    else if (a.score <= -20) sell.push(i);
  }
  const sim = (idx, dir) => {
    const out = [];
    let busy = -1;
    for (const i of idx) {
      if (i <= busy || i + 20 >= b.c.length || !(P.atr[i] > 0)) continue;
      const entry = b.o[i + 1] || b.c[i];
      const risk = 2.5 * P.atr[i];
      const stop = entry - dir * risk;
      let exit = b.c[i + 20];
      let j = i + 1;
      for (; j <= i + 20; j++) {
        if (dir > 0 ? b.l[j] <= stop : b.h[j] >= stop) {
          exit = dir > 0 ? Math.min(stop, b.o[j] || stop) : Math.max(stop, b.o[j] || stop);
          break;
        }
      }
      const end = Math.min(j, i + 20);
      out.push({ end, r: (dir * (exit - entry) - 0.0005 * (entry + exit)) / risk });
      busy = end;
    }
    return out;
  };
  return { buy: sim(buy, 1), sell: sim(sell, -1) };
}

// ── replay ponto a ponto ──
const entries = [];
const t0 = Date.now();
for (const s of Object.keys(bars)) {
  if (s === "SPY" && !syms.includes("SPY")) continue;
  const b = bars[s];
  const n = b.c.length;
  if (n < WARMUP + 25) continue;
  const tr = scoreTrades(b);
  const lev = leverageOf(s, s);
  const decay = !!lev && (lev.lev < 0 || Math.abs(lev.lev) > 1);
  const group = /^(TLT|TBF|HYG|EMB|EMLC|BWX|GLD|SLV|DBC|USO|UUP|FXY|VIXY|TMV)$/.test(s) ? "outro" : "Ações EUA"; // prettier-ignore
  let dec = null;
  let tech = null;
  for (let i = WARMUP; i < n; i++) {
    const d = b.dates[i];
    const sp = spyUntil(d);
    const regime = sp ? regimeOf(sp) : null;
    const g = regime ? (regime.bull ? 1 : 0) : undefined;
    const k = riskK(b, i) ?? undefined;
    const v = +(vol5At(b.c, i) ?? 0).toFixed(5);
    const baseE = { d, s, p: b.c[i], v, k, g };
    const bc = cut(b, i);
    if ((i - WARMUP) % 5 === 0) {
      tech = techPillar(bc, 0);
      const r = { sym: s, price: b.c[i], series: { close: bc.c }, bars: bc, pillars: { tech, mom: momPillar(bc), fund: null, analyst: null }, fund: { beta: null } }; // prettier-ignore
      dec = traderDecision(r, { spy: sp });
      const f = dec?.final;
      if (f) {
        const dir = toneDir(f.step.tone);
        let edg = {};
        if (dir) {
          const done = (dir > 0 ? tr.buy : tr.sell).filter((t) => t.end <= i).map((t) => t.r);
          const e = edgeOf({ dir, stats: tradeStats(done), regime, group, decay });
          if (e.grade) edg = { eg: e.grade, eb: e.block ? 1 : 0 };
        }
        const sub = Object.fromEntries(Object.entries(dec.subs).filter(([, x]) => x).map(([kk, x]) => [kk, +x.dir.toFixed(3)])); // prettier-ignore
        entries.push({ ...baseE, ...edg, h: 20, t: "dec", c: f.step.key, o: f.step.tone, r: dir, e: +expectedOfVol(v).toFixed(5), sub }); // prettier-ignore
      }
    }
    for (const sg of signalsFor(bc.c, { sym: s })) {
      const dir = sg.kind === "entry" ? 1 : -1;
      entries.push({ ...baseE, t: "sig", c: sg.code, o: dir > 0 ? "buy" : "sell", r: dir, e: +expectedOfRule(stats, sg.code, dir).toFixed(5) }); // prettier-ignore
    }
    if (dec?.final && tech?.levels) {
      const a = levelAlert({ sym: s, price: b.c[i], bars: bc, pillars: { tech } }, dec, { price: b.c[i], hold: { qty: 1 } }); // prettier-ignore
      if (a) {
        const sh = held.has(s) ? a : noPosAlert(a);
        entries.push({ ...baseE, t: "level", c: a.zone, o: sh.tone, r: toneDir(sh.tone), e: +expectedOfVol(v).toFixed(5) }); // prettier-ignore
      }
    }
  }
  process.stdout.write(`${s} `);
}
console.log(
  `\nreplay: ${entries.length} gatilhos brutos em ${((Date.now() - t0) / 1000).toFixed(0)} s`,
);

// ── diário retroativo: mesmas regras do diário real (um gatilho por ativo+lógica a cada 5 pregões) ──
RULES.journalMax = 1e7; // no estudo, sem corte do diário (o real guarda os 20 mil mais recentes)
entries.sort((a, b) => (a.d < b.d ? -1 : a.d > b.d ? 1 : 0));
const { list } = appendJournal([], entries, (s) => bars[s]?.dates);
const journal = settleJournal(list, (s) => bars[s], 5, { mktOf: marketMeanOf(bars) });
const closed = journal.filter((e) => e.out);
console.log(`diário retroativo: ${journal.length} gatilhos, ${closed.length} encerrados`);

// ── medições ──
const groups = {};
for (const e of closed) (groups[logicKey(e)] ??= []).push(e);
const days = [...new Set(journal.map((e) => e.d))].length;
const model = trainStep({ ...emptyModel(journal[0]?.d), logics: {} }, journal, { date: journal.at(-1)?.d, sessions: days }); // prettier-ignore
const v1 = (es) => {
  const st = dayScore(es);
  return st.n >= RULES.minN ? (st.score >= RULES.threshold ? "approved" : "eliminated") : "eval";
};
const logics = Object.entries(groups)
  .map(([key, es]) => {
    const R = logicR(es);
    const st = dayScore(es);
    const l = model.logics[key] ?? {};
    return {
      key,
      act: actionable(key),
      n: st.n,
      raw: st.raw,
      score: st.score,
      x: R.x,
      r: R.r,
      win: R.win,
      bull: R.bull,
      bear: R.bear,
      bh: !!l.bh,
      v1: v1(es),
      v2: l.status ?? "eval",
    };
  })
  .sort((a, b) => (b.x.mean ?? -9) - (a.x.mean ?? -9));
const decs = closed.filter((e) => e.t === "dec");
// --groups=arquivo.json: { dimensão: { SÍMBOLO: [grupos] } } -> excesso por lógica dentro de cada grupo (exploratório)
const groupsFile = arg("groups", "");
const byGroup = {};
if (groupsFile) {
  const maps = JSON.parse(await readFile(new URL(groupsFile, root), "utf8"));
  for (const [dim, map] of Object.entries(maps)) {
    byGroup[dim] = {};
    for (const g of [...new Set(Object.values(map).flat())]) {
      const es = closed.filter((e) => (map[e.s] ?? []).includes(g));
      const per = {};
      for (const e of es) (per[logicKey(e)] ??= []).push(e);
      const pool = (f) => dayStatsR(es.filter(f), "xR");
      byGroup[dim][g] = {
        assets: new Set(es.map((e) => e.s)).size,
        buys: pool((e) => e.r > 0),
        sells: pool((e) => e.r < 0),
        decBuy: pool((e) => e.t === "dec" && e.r > 0),
        decSell: pool((e) => e.t === "dec" && e.r < 0),
        edge: edgeValidation(es),
        logics: Object.fromEntries(Object.entries(per).filter(([k]) => actionable(k)).map(([k, v]) => [k, dayStatsR(v, "xR")])), // prettier-ignore
      };
    }
  }
}
const out = {
  byGroup,
  generatedAt: new Date().toISOString(),
  range: RANGE,
  from: journal[0]?.d,
  to: journal.at(-1)?.d,
  assets: Object.keys(bars).length,
  held: [...held],
  failed,
  days,
  triggers: journal.length,
  closed: closed.length,
  bearDays: [...new Set(closed.filter((e) => e.g === 0).map((e) => e.d))].length,
  logics,
  edge: edgeValidation(journal),
  weightsIC: weightTargetsIC(decs),
  weightsAcc: weightTargets(decs),
  modelWeights: model.weights,
  criteria: model.criteria,
};
const fmt = (x, d = 2) => (Number.isFinite(x) ? (x >= 0 ? "+" : "−") + Math.abs(x).toFixed(d).replace(".", ",") : "–"); // prettier-ignore
const pct = (x) => (Number.isFinite(x) ? `${Math.round(x * 100)}%` : "–");
console.log(`lógicas: ${logics.length} · v1 aprovaria ${logics.filter((l) => l.v1 === "approved").length} · v2 aprovaria ${logics.filter((l) => l.v2 === "approved").length}`); // prettier-ignore
for (const l of logics.slice(0, 40))
  console.log(`${l.key.padEnd(28)} dias ${String(l.n).padStart(4)} acerto ${pct(l.score).padStart(4)} excesso ${fmt(l.x.mean)}R (alta ${fmt(l.bull.mean)} · baixa ${fmt(l.bear.mean)}, ${l.bear.n}d) v1=${l.v1} v2=${l.v2}`); // prettier-ignore
const ev = out.edge;
console.log(`filtro: bloqueadas ${fmt(ev.blocked.mean)}R (${ev.blocked.n}d) × liberadas ${fmt(ev.passed.mean)}R (${ev.passed.n}d) · notas ${["A", "B", "C", "D"].map((g) => `${g} ${fmt(ev.grades[g].mean)}R (${ev.grades[g].n}d)`).join(" · ")}`); // prettier-ignore
console.log("pesos por correlação:", JSON.stringify(out.weightsIC));

if (!DRY) {
  await writeFile(new URL(JSON_OUT, root), JSON.stringify(out));
  await writeReport(out);
  console.log(`gravado ${JSON_OUT} e ${MD_OUT}`);
}

/** Relatório em português (docs/ESTUDO-RETROATIVO.md) a partir do resultado. */
async function writeReport(o) {
  const f = (x, d = 2) => (Number.isFinite(x) ? `${x >= 0 ? "+" : "−"}${Math.abs(x).toFixed(d).replace(".", ",")}` : "–"); // prettier-ignore
  const p = (x) => (Number.isFinite(x) ? `${Math.round(x * 100)}%` : "–");
  const ST = { approved: "Aprovada", eval: "Em avaliação", eliminated: "Eliminada" };
  const br = (d) => (d ? d.split("-").reverse().join("/") : "–");
  const act = o.logics.filter((l) => l.act && l.n >= 10);
  const wait = o.logics.filter((l) => !l.act && l.n >= 10);
  const ev = o.edge;
  const ic = o.weightsIC?.ic ?? {};
  const md = `# Estudo retroativo do aprendizado (prévia)

> Gerado por \`scripts/retro-study.mjs\` em ${br(o.generatedAt.slice(0, 10))}. Reproduzir: \`node scripts/retro-study.mjs --syms=...\`.
> É **prévia**: as regras foram escolhidas olhando esses anos, então o resultado é otimista. Não aprova nada no modelo
> real, que só aprende com o diário fora da amostra. Material educacional; não é recomendação de investimento.

## Amostra

- Período avaliado: **${br(o.from)} a ${br(o.to)}** (${o.days} pregões; histórico de ${o.range}, com ~1 ano de aquecimento).
- **${o.assets} ativos**: os ETFs do Pêndulo e a carteira (${o.held.join(", ") || "–"}).${o.failed.length ? ` Sem dados: ${o.failed.join(", ")}.` : ""}
- **${o.closed.toLocaleString("pt-BR")} gatilhos encerrados** (Decisão do trader a cada 5 pregões, sinais de curto prazo e níveis), um por ativo e lógica a cada 5 pregões, como no diário real.
- Medida: resultado em R (stop de 2,5 ATR, 0,05% de custo por perna, entrada no fechamento do dia do gatilho), no horizonte da lógica (decisões 20 pregões; sinais e níveis 5), em **excesso sobre a média do universo** no mesmo dia. Regime: S&P acima/abaixo da média de 200 dias (${o.bearDays} dias em baixa).
- Decisão do trader sem fundamentos (não há fundamentos antigos) e sem o regime macro do dia.

## Lógicas que mandam operar

| Lógica | Dias | Acerto (regra antiga) | Excesso em R (faixa 90%) | Alta / baixa | Regra antiga | Regra nova |
|---|---:|---:|---:|---:|---|---|
${act.map((l) => `| ${l.key} | ${l.n} | ${p(l.score)} | ${f(l.x.mean)} (${f(l.x.lower)} a ${f(l.x.upper)}) | ${f(l.bull.mean)} / ${f(l.bear.mean)} (${l.bear.n} d) | ${ST[l.v1]} | ${ST[l.v2]}${l.bh ? " ✓BH" : ""} |`).join("\n")}

## Lógicas de "esperar" (seguem pelo aproveitamento)

| Lógica | Dias | Aproveitamento | Status |
|---|---:|---:|---|
${wait.map((l) => `| ${l.key} | ${l.n} | ${p(l.score)} | ${ST[l.v2]} |`).join("\n")}

## O filtro de vantagem funcionou?

| Grupo | Excesso em R por dia | Dias |
|---|---:|---:|
| Bloqueadas pelo filtro | ${f(ev.blocked.mean)} | ${ev.blocked.n} |
| Liberadas | ${f(ev.passed.mean)} | ${ev.passed.n} |
${["A", "B", "C", "D"].map((g) => `| Nota ${g} | ${f(ev.grades[g].mean)} | ${ev.grades[g].n} |`).join("\n")}

## Pesos da Decisão do trader (correlação com o excesso em 20 pregões)

${Object.entries(ic)
  .map(
    ([k, v]) =>
      `- ${k}: ${v.ic == null ? "–" : v.ic.toFixed(3).replace(".", ",")} (${v.n} decisões)`,
  )
  .join("\n")}

## Leitura

${CONCLUSOES}
`;
  await writeFile(new URL(MD_OUT, root), md);
}
