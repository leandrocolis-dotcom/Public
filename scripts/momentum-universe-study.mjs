// F35: momentum 12-1 no "Universo de Setores" (data/universo-setores.json), ações e ETFs separados.
// Pergunta (docs/OBJETIVO.md): o 12-1 escolhe QUAL ativo comprar? E, hoje, quais passam na regra?
//
// REGRAS REGISTRADAS ANTES DE RODAR (não alterar depois de ver o resultado; se piorar, reverter):
//  Universo: todos os tickers da lista do usuário, por tipo: SINGLE (ações) e ETF (1x). Alavancados e inversos ficam
//    fora do ranking (decaimento; repetem o ativo de referência). Até 11 anos de Yahoo ajustado.
//  Datas: último pregão de cada mês (calendário do SPY) com ≥ 20 ativos do grupo com 13 meses de histórico.
//  Sinal: mom = P(m−1)/P(m−12) − 1 (12 meses, pulando o último). Percentil dentro do grupo na data.
//  Alvo: retorno do mês seguinte (h=1) em excesso sobre a média do grupo. Secundário: h=3 e h=6 (só descritivo).
//  Testes de H8 (12-1 ordena o excesso):
//    T1 IC de Spearman médio > 0 (t em meses, unicaudal);
//    T2 spread quintil 5 − quintil 1 > 0 (t);
//    T3 carteira top 20% (pesos iguais, 0,05% por perna no giro) bate 1.000 carteiras sorteadas do mesmo tamanho no
//       mesmo universo (p < 0,05). O sorteio controla o viés de sobrevivência da lista (feita em 2026 com vencedores).
//  BH (FDR 10%) sobre T1 e T2 dos 2 grupos (4 hipóteses).
//  APROVAÇÃO de H8 num grupo: T1 e T2 aprovados no BH, T3 com p < 0,05, e spread > 0 na alta E na baixa (SPY vs MM200).
//  Robustez (descritivo): subperíodos, ranking dentro do bloco (neutro de setor), versão "top 20% e > MM200" e regime.
//  H9 (nível de preço): dentro do top 20%, os mais esticados (tercil superior de distância à MM200) rendem menos no mês
//    seguinte que o tercil inferior. Aprovada se a diferença for < 0 com t ≤ −2 no grupo.
//  Foto de hoje: 12-1 na data mais recente (21 pregões pulados, 252 de janela) e os mesmos filtros.
// Material educacional; não é recomendação de investimento.
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import { chart, sma, atr, tbill, rateOf } from "./lib/study-data.mjs";

const CACHE = process.env.CACHE_DIR;
const UNI = JSON.parse(
  await readFile(new URL("../data/universo-setores.json", import.meta.url), "utf8"),
);
const COST = 0.0005;

const meta = new Map();
for (const [label, types] of Object.entries(UNI.labels))
  for (const [type, list] of Object.entries(types))
    for (const t of list)
      if (!meta.has(t)) meta.set(t, { type, label, block: label.split(".")[0] });
const GROUPS = ["SINGLE", "ETF"];

async function bars(sym, years) {
  const f = CACHE && `${CACHE}/${sym.replace(/[^A-Z0-9^.-]/gi, "_")}.json`;
  if (f && existsSync(f)) return JSON.parse(await readFile(f, "utf8"));
  const b = await chart(sym.replace(".", "-"), years);
  if (f) await writeFile(f, JSON.stringify(b));
  return b;
}

async function loadAll(syms, years = 11) {
  if (CACHE) await mkdir(CACHE, { recursive: true });
  const out = {};
  const miss = [];
  let k = 0;
  await Promise.all(
    Array.from({ length: 6 }, async () => {
      while (k < syms.length) {
        const s = syms[k++];
        try {
          out[s] = await bars(s, years);
        } catch {
          miss.push(s);
        }
      }
    }),
  );
  return { out, miss };
}

const mean = (a) => a.reduce((x, y) => x + y, 0) / a.length;
const sd = (a) => {
  const m = mean(a);
  return Math.sqrt(a.reduce((x, y) => x + (y - m) ** 2, 0) / (a.length - 1));
};
const tstat = (a) => (a.length > 2 ? (mean(a) / sd(a)) * Math.sqrt(a.length) : 0);
const pOne = (t) => 0.5 * (1 - erf(t / Math.SQRT2)); // unicaudal (normal)
function erf(x) {
  const s = Math.sign(x);
  x = Math.abs(x);
  const t = 1 / (1 + 0.3275911 * x);
  const y = 1 - ((((1.061405429 * t - 1.453152027) * t + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t * Math.exp(-x * x); // prettier-ignore
  return s * y;
}
const ranks = (a) => {
  const idx = a.map((v, i) => [v, i]).sort((x, y) => x[0] - y[0]);
  const r = new Array(a.length);
  idx.forEach(([, i], k) => (r[i] = k));
  return r;
};
const spearman = (a, b) => {
  const ra = ranks(a);
  const rb = ranks(b);
  const ma = mean(ra);
  const mb = mean(rb);
  let n = 0;
  let da = 0;
  let db = 0;
  ra.forEach((x, i) => {
    n += (x - ma) * (rb[i] - mb);
    da += (x - ma) ** 2;
    db += (rb[i] - mb) ** 2;
  });
  return n / Math.sqrt(da * db);
};
function bh(ps, q = 0.1) {
  const o = ps.map((p, i) => [p, i]).sort((a, b) => a[0] - b[0]);
  let kmax = -1;
  o.forEach(([p], k) => {
    if (p <= ((k + 1) / o.length) * q) kmax = k;
  });
  const pass = new Array(ps.length).fill(false);
  o.forEach(([, i], k) => (pass[i] = k <= kmax));
  return pass;
}
let seed = 42;
const rnd = () => (seed = (seed * 1664525 + 1013904223) % 4294967296) / 4294967296;
function perf(rets) {
  let eq = 1;
  let pk = 1;
  let dd = 0;
  for (const r of rets) {
    eq *= 1 + r;
    pk = Math.max(pk, eq);
    dd = Math.min(dd, eq / pk - 1);
  }
  const cagr = eq ** (12 / rets.length) - 1;
  const vol = sd(rets) * Math.sqrt(12);
  return { cagr, vol, sharpe: (mean(rets) / sd(rets)) * Math.sqrt(12), dd };
}

// ---------- dados ----------
const syms = [...meta.keys()].filter((s) => GROUPS.includes(meta.get(s).type));
const OUT = new URL("../data/momentum-universe-study.json", import.meta.url);

// --today: só a foto de hoje (cron diário em .github/workflows/train-model.yml), sem refazer o estudo de 10 anos
if (process.argv.includes("--today")) {
  const { out, miss } = await loadAll([...new Set(["SPY", ...syms])], 2);
  if (!out.SPY) throw new Error("SPY sem dados");
  const prev = JSON.parse(await readFile(OUT, "utf8"));
  const snap = snapshot(out);
  const n = Object.keys(snap.all).length;
  if (n < 0.8 * Object.keys(prev.all ?? {}).length)
    throw new Error(`poucos ativos com dados (${n})`);
  await writeFile(OUT, JSON.stringify({ ...prev, ...snap, todayMissing: miss }, null, 1));
  console.log(`foto de ${snap.regimeToday.date}: ${n} ativos, regime ${snap.regimeToday.on ? "LIGADO" : "DESLIGADO"}`); // prettier-ignore
  process.exit(0);
}
const { out: B, miss } = await loadAll([...new Set(["SPY", ...syms])]);
const spy = B.SPY;
const ME = spy.dates.filter(
  (d, i) => i + 1 >= spy.dates.length || spy.dates[i + 1].slice(0, 7) !== d.slice(0, 7),
);
const lastIsPartial = ME.at(-1) === spy.dates.at(-1); // mês corrente incompleto
const months = lastIsPartial ? ME.slice(0, -1) : ME;
const tb = rateOf(await tbill());

// preço ajustado e MM200 por ativo em cada fim de mês
const S = {};
for (const s of [...syms, "SPY"]) {
  const b = B[s];
  if (!b) continue;
  const m200 = sma(b.c, 200);
  const pos = new Map(b.dates.map((d, i) => [d, i]));
  const px = [];
  const ma = [];
  let j = 0;
  for (const d of months) {
    // último pregão do ativo em ou antes de d (até 5 dias de folga)
    while (j + 1 < b.dates.length && b.dates[j + 1] <= d) j++;
    const ok = b.dates[j] <= d && (new Date(d) - new Date(b.dates[j])) / 864e5 <= 5;
    px.push(ok ? b.c[j] : null);
    ma.push(ok ? m200[j] : null);
  }
  S[s] = { px, ma, pos };
}
const spyUp = months.map((_, m) => S.SPY.px[m] > S.SPY.ma[m]);
const cashM = months.map((d, m) => (m + 1 < months.length ? 21 * tb(d) : 0));

// ---------- estudo por grupo ----------
function study(group, opts = {}) {
  const names = syms.filter((s) => meta.get(s).type === group && S[s]);
  const rows = [];
  for (let m = 12; m < months.length - 1; m++) {
    const xs = [];
    for (const s of names) {
      const p = S[s].px;
      if (!(p[m - 12] > 0 && p[m - 1] > 0 && p[m] > 0 && p[m + 1] > 0)) continue;
      const fwd = (k) => (p[m + k] > 0 ? p[m + k] / p[m] - 1 : null);
      xs.push({
        s,
        block: meta.get(s).block,
        mom: p[m - 1] / p[m - 12] - 1,
        f1: fwd(1),
        f3: m + 3 < months.length ? fwd(3) : null,
        f6: m + 6 < months.length ? fwd(6) : null,
        dist: S[s].ma[m] ? p[m] / S[s].ma[m] - 1 : null,
        above: S[s].ma[m] ? p[m] > S[s].ma[m] : false,
      });
    }
    if (xs.length < 20) continue;
    if (opts.neutral) {
      // ranking dentro do bloco: subtrai a mediana do momentum do bloco
      const byB = {};
      xs.forEach((x) => (byB[x.block] ||= []).push(x.mom));
      xs.forEach((x) => {
        const a = byB[x.block].slice().sort((u, v) => u - v);
        x.mom -= a.length >= 3 ? a[a.length >> 1] : 0;
      });
    }
    const avg1 = mean(xs.map((x) => x.f1));
    const r = ranks(xs.map((x) => x.mom));
    const n = xs.length;
    xs.forEach((x, i) => (x.q = Math.min(4, Math.floor((r[i] / n) * 5))));
    const q = [0, 1, 2, 3, 4].map((k) => {
      const a = xs.filter((x) => x.q === k).map((x) => x.f1 - avg1);
      return a.length ? mean(a) : 0;
    });
    const top = xs.filter((x) => x.q === 4);
    const terc = (a) => {
      const o = a.filter((x) => x.dist != null).sort((u, v) => u.dist - v.dist);
      const k = Math.floor(o.length / 3);
      return k ? mean(o.slice(-k).map((x) => x.f1)) - mean(o.slice(0, k).map((x) => x.f1)) : null;
    };
    const ic3 = xs.filter((x) => x.f3 != null);
    const ic6 = xs.filter((x) => x.f6 != null);
    rows.push({
      m,
      d: months[m],
      n,
      up: spyUp[m],
      ic: spearman(
        xs.map((x) => x.mom),
        xs.map((x) => x.f1),
      ),
      ic3:
        ic3.length > 20 && m % 3 === 0
          ? spearman(
              ic3.map((x) => x.mom),
              ic3.map((x) => x.f3),
            )
          : null,
      ic6:
        ic6.length > 20 && m % 6 === 0
          ? spearman(
              ic6.map((x) => x.mom),
              ic6.map((x) => x.f6),
            )
          : null,
      q,
      spread: q[4] - q[0],
      avg1,
      top: top.map((x) => x.s),
      topAbove: top.filter((x) => x.above).map((x) => x.s),
      topRet: top.map((x) => x.f1),
      all: xs.map((x) => ({ s: x.s, f1: x.f1 })),
      ext: terc(top),
    });
  }
  return { names, rows };
}

function portfolio(rows, pick, regime = false) {
  const rets = [];
  let prev = new Set();
  for (const r of rows) {
    let set = pick(r);
    if (regime && !r.up) set = [];
    const cur = new Set(set);
    const turn = set.length
      ? [...cur].filter((s) => !prev.has(s)).length / cur.size + (prev.size ? [...prev].filter((s) => !cur.has(s)).length / prev.size : 0) // prettier-ignore
      : prev.size
        ? 1
        : 0;
    const f = new Map(r.all.map((x) => [x.s, x.f1]));
    const g = set.length ? mean(set.map((s) => f.get(s))) : cashM[r.m];
    rets.push(g - turn * COST);
    prev = cur;
  }
  return rets;
}

const sub = (rows, a, b) => rows.filter((r) => r.d >= a && r.d < b);
const res = { generated: new Date().toISOString().slice(0, 10), missing: miss, groups: {} };
const pvals = [];

for (const g of GROUPS) {
  const { names, rows } = study(g);
  const neu = study(g, { neutral: true }).rows;
  const ics = rows.map((r) => r.ic);
  const sp = rows.map((r) => r.spread);
  const tIC = tstat(ics);
  const tSp = tstat(sp);
  pvals.push(pOne(tIC), pOne(tSp));
  const top = portfolio(rows, (r) => r.top);
  const topAbove = portfolio(rows, (r) => r.topAbove);
  const topReg = portfolio(rows, (r) => r.topAbove, true);
  const ew = rows.map((r) => r.avg1);
  const spyR = rows.map((r) => S.SPY.px[r.m + 1] / S.SPY.px[r.m] - 1);
  // T3: sorteio de carteiras do mesmo tamanho
  const topC = perf(top).cagr;
  let beat = 0;
  const randC = [];
  for (let k = 0; k < 1000; k++) {
    const rr = portfolio(rows, (r) => {
      const a = r.all.map((x) => x.s);
      for (let i = a.length - 1; i > 0; i--) {
        const j = Math.floor(rnd() * (i + 1));
        [a[i], a[j]] = [a[j], a[i]];
      }
      return a.slice(0, r.top.length);
    });
    const c = perf(rr).cagr;
    randC.push(c);
    if (c >= topC) beat++;
  }
  randC.sort((a, b) => a - b);
  const ext = rows.map((r) => r.ext).filter((x) => x != null);
  const qAvg = [0, 1, 2, 3, 4].map((k) => mean(rows.map((r) => r.q[k])));
  const per = [
    ["2016–2019", "2016", "2020"],
    ["2020–2022", "2020", "2023"],
    ["2023–2026", "2023", "2027"],
  ].map(([lab, a, b]) => {
    const rr = sub(rows, a, b);
    return { lab, n: rr.length, ic: mean(rr.map((r) => r.ic)), spread: mean(rr.map((r) => r.spread)), t: tstat(rr.map((r) => r.spread)) }; // prettier-ignore
  });
  // descritivo (não muda a aprovação): excesso do top 20% sobre a média do grupo e alfa/beta contra a média
  const topEx = rows.map((r) => mean(r.topRet) - r.avg1);
  const ewS = rows.map((r) => r.avg1);
  const tr = rows.map((r) => mean(r.topRet));
  const mx = mean(ewS);
  const my = mean(tr);
  const beta =
    ewS.reduce((a, x, i) => a + (x - mx) * (tr[i] - my), 0) /
    ewS.reduce((a, x) => a + (x - mx) ** 2, 0);
  const resid = tr.map((y, i) => y - beta * ewS[i]);
  const ic3s = rows.map((r) => r.ic3).filter((x) => x != null);
  const ic6s = rows.map((r) => r.ic6).filter((x) => x != null);
  const upR = rows.filter((r) => r.up);
  const dnR = rows.filter((r) => !r.up);
  res.groups[g] = {
    universe: names.length,
    months: rows.length,
    from: rows[0]?.d,
    to: rows.at(-1)?.d,
    avgN: mean(rows.map((r) => r.n)),
    ic: {
      mean: mean(ics),
      t: tIC,
      p: pOne(tIC),
      hit: ics.filter((x) => x > 0).length / ics.length,
    },
    ic3: mean(ic3s),
    ic3t: tstat(ic3s),
    ic6: mean(ic6s),
    ic6t: tstat(ic6s),
    topExcess: { mean: mean(topEx), t: tstat(topEx) },
    beta,
    alpha: { monthly: mean(resid), t: tstat(resid) },
    quintiles: qAvg,
    spread: { mean: mean(sp), t: tSp, p: pOne(tSp) },
    regime: {
      up: {
        n: upR.length,
        spread: mean(upR.map((r) => r.spread)),
        t: tstat(upR.map((r) => r.spread)),
      },
      down: {
        n: dnR.length,
        spread: mean(dnR.map((r) => r.spread)),
        t: tstat(dnR.map((r) => r.spread)),
      },
    },
    neutral: { ic: mean(neu.map((r) => r.ic)), t: tstat(neu.map((r) => r.ic)), spread: mean(neu.map((r) => r.spread)), tSp: tstat(neu.map((r) => r.spread)) }, // prettier-ignore
    periods: per,
    portfolios: {
      top20: perf(top),
      top20AboveMA: perf(topAbove),
      top20AboveMARegime: perf(topReg),
      equalWeight: perf(ew),
      spy: perf(spyR),
    },
    random: { p: beat / 1000, p50: randC[500], p95: randC[950] },
    extension: { n: ext.length, mean: ext.length ? mean(ext) : null, t: tstat(ext) },
  };
}
const bhp = bh(pvals);
GROUPS.forEach((g, i) => {
  const r = res.groups[g];
  r.bh = { ic: bhp[2 * i], spread: bhp[2 * i + 1] };
  r.approved =
    r.bh.ic &&
    r.bh.spread &&
    r.random.p < 0.05 &&
    r.regime.up.spread > 0 &&
    r.regime.down.spread > 0;
  r.h9 = r.extension.mean < 0 && r.extension.t <= -2;
});

// ---------- foto de hoje ----------
function rsi(c, n = 14) {
  let g = 0;
  let l = 0;
  for (let i = c.length - n; i < c.length; i++) {
    const d = c[i] - c[i - 1];
    if (d > 0) g += d;
    else l -= d;
  }
  return l ? 100 - 100 / (1 + g / l) : 100;
}

/** 12-1 de hoje (21 pregões pulados, 252 de janela), percentil no grupo e filtros da regra. */
function snapshot(B) {
  const today = {};
  const all = {};
  const spyB = B.SPY;
  const spyMA = sma(spyB.c, 200).at(-1);
  const regimeToday = { date: spyB.dates.at(-1), spy: spyB.c.at(-1), ma200: spyMA, on: spyB.c.at(-1) > spyMA }; // prettier-ignore
  for (const g of GROUPS) {
    const list = [];
    for (const s of syms.filter((x) => meta.get(x).type === g)) {
      const b = B[s];
      if (!b || b.c.length < 260) continue;
      const c = b.c;
      const n = c.length - 1;
      if (b.dates[n] < spyB.dates.at(-1)) continue;
      const ma200 = sma(c, 200)[n];
      const ma50 = sma(c, 50)[n];
      const hi = Math.max(...c.slice(-252));
      const a = atr(b, 20)[n];
      list.push({
        s,
        label: meta.get(s).label,
        px: c[n],
        mom: c[n - 21] / c[n - 252] - 1,
        r1m: c[n] / c[n - 21] - 1,
        dist200: c[n] / ma200 - 1,
        dist50: c[n] / ma50 - 1,
        offHigh: c[n] / hi - 1,
        atrPct: a / c[n],
        rsi: rsi(c),
      });
    }
    const r = ranks(list.map((x) => x.mom));
    list.forEach((x, i) => (x.pct = r[i] / (list.length - 1)));
    list.sort((a, b) => b.mom - a.mom);
    const top = list.filter((x) => x.pct >= 0.8);
    const d = top.map((x) => x.dist200).sort((u, v) => u - v);
    const t1 = d[Math.floor(d.length / 3)];
    const t2 = d[Math.floor((2 * d.length) / 3)];
    top.forEach((x) => (x.extTercile = x.dist200 <= t1 ? 1 : x.dist200 <= t2 ? 2 : 3));
    today[g] = { n: list.length, top, bottom: list.slice(-10) };
    // linha da página do ativo: grupo, percentil, 12-1, acima da MM200 e se passa na regra
    for (const x of list)
      all[x.s] = { g, pct: +x.pct.toFixed(3), mom: +x.mom.toFixed(4), above: x.dist200 > 0, pass: x.pct >= 0.8 && x.dist200 > 0 }; // prettier-ignore
  }
  return { regimeToday, today, all };
}
Object.assign(res, snapshot(B));

await writeFile(OUT, JSON.stringify(res, null, 1));
const pc = (x) => (Number.isFinite(x) ? `${(x * 100).toFixed(1)}%` : "—");
for (const g of GROUPS) {
  const r = res.groups[g];
  console.log(
    `\n== ${g}: ${r.universe} ativos, ${r.months} meses (${r.from}→${r.to}), média ${r.avgN.toFixed(0)}/mês`,
  );
  console.log(`IC ${r.ic.mean.toFixed(3)} t ${r.ic.t.toFixed(2)} acerto ${pc(r.ic.hit)} | IC3 ${r.ic3.toFixed(3)} t ${r.ic3t.toFixed(2)} IC6 ${r.ic6.toFixed(3)} t ${r.ic6t.toFixed(2)}`); // prettier-ignore
  console.log(`Quintis (excesso/mês): ${r.quintiles.map(pc).join(" ")} | Q5−Q1 ${pc(r.spread.mean)} t ${r.spread.t.toFixed(2)}`); // prettier-ignore
  console.log(`Alta: ${pc(r.regime.up.spread)} t ${r.regime.up.t.toFixed(2)} (${r.regime.up.n}) | Baixa: ${pc(r.regime.down.spread)} t ${r.regime.down.t.toFixed(2)} (${r.regime.down.n})`); // prettier-ignore
  console.log(`Neutro de setor: IC ${r.neutral.ic.toFixed(3)} t ${r.neutral.t.toFixed(2)} spread ${pc(r.neutral.spread)} t ${r.neutral.tSp.toFixed(2)}`); // prettier-ignore
  r.periods.forEach((p) => console.log(`  ${p.lab}: IC ${p.ic.toFixed(3)} spread ${pc(p.spread)} t ${p.t.toFixed(2)} (${p.n})`)); // prettier-ignore
  for (const [k, v] of Object.entries(r.portfolios)) console.log(`  ${k}: CAGR ${pc(v.cagr)} vol ${pc(v.vol)} Sharpe ${v.sharpe.toFixed(2)} DD ${pc(v.dd)}`); // prettier-ignore
  console.log(`Top20 excesso ${pc(r.topExcess.mean)} t ${r.topExcess.t.toFixed(2)} | beta ${r.beta.toFixed(2)} alfa ${pc(r.alpha.monthly)} t ${r.alpha.t.toFixed(2)}`); // prettier-ignore
  console.log(`Sorteio: p ${r.random.p} mediana ${pc(r.random.p50)} p95 ${pc(r.random.p95)}`);
  console.log(`H9 esticado−não: ${pc(r.extension.mean)} t ${r.extension.t.toFixed(2)} | BH ${JSON.stringify(r.bh)} | APROVADA ${r.approved} | H9 ${r.h9}`); // prettier-ignore
}
console.log("\nRegime hoje:", res.regimeToday, "faltando:", miss.join(","));
