// Estudo do pêndulo no fim de semana (docs/ESTUDO-FIM-DE-SEMANA.md): o que negocia no fds antecipa a segunda do SPY?
// Sinais medidos ANTES de os futuros reabrirem (sexta 16h → domingo 17h de NY), para não colar dos futuros:
//   btc, eth, cripto (2/3 + 1/3), paxg (ouro tokenizado), vol (volatilidade do cripto no fds ÷ a típica) e a nota
//   atual do pêndulo de fds (assets/weekend-pulse.js, com desvio e correlação de 90 pregões só até a sexta).
// Alvos: SPY abertura de segunda ÷ fechamento de sexta (gap) e fechamento de segunda ÷ sexta (dia).
// Duas bases: (A) barras de 1 h do Yahoo, ~2 anos, janela exata; (B) diário desde 2018, janela sáb 00h → seg 00h UTC
//   (termina 19h de NY no domingo, 1 h depois dos futuros: leve contaminação, só para robustez).
// Testes: correlação com p por permutação, média do alvo no 1º × 5º quintil, acerto de direção, assimetria (queda ×
// alta) e queda forte (≤ −1,5σ). Material educacional, não é recomendação.
// Uso: node scripts/weekend-study.mjs   Saída: data/weekend-study.json
import { writeFile } from "node:fs/promises";
import { dailyStats, scoreOfZ, UP_W } from "../assets/weekend-pulse.js";

const root = new URL("..", import.meta.url);
const UA = { "User-Agent": "Mozilla/5.0" };
const H = 3600;

async function chart(sym, range, interval) {
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(sym)}?range=${range}&interval=${interval}`;
  for (let k = 0; k < 3; k++) {
    try {
      const r = await fetch(url, { headers: UA });
      const j = await r.json();
      const x = j.chart.result[0];
      const q = x.indicators.quote[0];
      const t = [];
      const o = [];
      const c = [];
      x.timestamp.forEach((ts, i) => {
        if (q.close[i] > 0) {
          t.push(ts);
          o.push(q.open[i]);
          c.push(q.close[i]);
        }
      });
      return { t, o, c };
    } catch (e) {
      if (k === 2) throw e;
      await new Promise((r) => setTimeout(r, 1500));
    }
  }
}

const NY = new Intl.DateTimeFormat("en-CA", { timeZone: "America/New_York", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }); // prettier-ignore
const nyDate = (s) => NY.format(new Date(s * 1000)).slice(0, 10);
/** Instante (s) de uma hora de NY na data AAAA-MM-DD. */
function nyAt(date, h) {
  let g = Date.parse(`${date}T${String(h).padStart(2, "0")}:00:00Z`) / 1000 + 5 * H;
  for (let i = 0; i < 2; i++) {
    const p = NY.format(new Date(g * 1000));
    const got = Date.parse(`${p.slice(0, 10)}T${p.slice(12, 17)}:00Z`) / 1000;
    g -= got - Date.parse(`${date}T${String(h).padStart(2, "0")}:00:00Z`) / 1000;
  }
  return g;
}
const addDays = (d, n) =>
  new Date(Date.parse(`${d}T12:00:00Z`) + n * 86400e3).toISOString().slice(0, 10);

/** Último preço da série até t (s). */
function at(ser, t) {
  let lo = 0;
  let hi = ser.t.length - 1;
  let r = -1;
  while (lo <= hi) {
    const m = (lo + hi) >> 1;
    if (ser.t[m] <= t) {
      r = m;
      lo = m + 1;
    } else hi = m - 1;
  }
  return r < 0 ? null : { p: ser.c[r], t: ser.t[r] };
}

// ── estatística ──
const mean = (x) => x.reduce((a, b) => a + b, 0) / x.length;
function corr(x, y) {
  const mx = mean(x);
  const my = mean(y);
  let a = 0;
  let b = 0;
  let c = 0;
  for (let i = 0; i < x.length; i++) {
    a += (x[i] - mx) * (y[i] - my);
    b += (x[i] - mx) ** 2;
    c += (y[i] - my) ** 2;
  }
  return b && c ? a / Math.sqrt(b * c) : 0;
}
function rng(seed) {
  let s = seed >>> 0;
  return () => (s = (s * 1664525 + 1013904223) >>> 0) / 2 ** 32;
}
function permP(x, y, n = 4000) {
  const r0 = Math.abs(corr(x, y));
  const r = rng(7);
  const ys = [...y];
  let hit = 0;
  for (let k = 0; k < n; k++) {
    for (let i = ys.length - 1; i > 0; i--) {
      const j = Math.floor(r() * (i + 1));
      [ys[i], ys[j]] = [ys[j], ys[i]];
    }
    if (Math.abs(corr(x, ys)) >= r0) hit++;
  }
  return (hit + 1) / (n + 1);
}
const tstat = (a, b) => {
  const v = (x) => x.reduce((s, z) => s + (z - mean(x)) ** 2, 0) / (x.length - 1);
  return (mean(a) - mean(b)) / Math.sqrt(v(a) / a.length + v(b) / b.length);
};
const bp = (x) => Math.round(x * 1e4 * 10) / 10; // em pontos-base

/** Testes de um sinal x contra o alvo y (pares com x finito). */
function test(rows, key, tgt) {
  const r = rows.filter((w) => Number.isFinite(w[key]) && Number.isFinite(w[tgt]));
  if (r.length < 30) return null;
  const x = r.map((w) => w[key]);
  const y = r.map((w) => w[tgt]);
  const ord = [...r].sort((a, b) => a[key] - b[key]);
  const q = Math.floor(r.length / 5);
  const lo = ord.slice(0, q).map((w) => w[tgt]);
  const hi = ord.slice(-q).map((w) => w[tgt]);
  const neg = r.filter((w) => w[key] < 0);
  const pos = r.filter((w) => w[key] > 0);
  const big = r.filter((w) => Math.abs(w[tgt]) >= 0.0025 && w[key] !== 0);
  const hit = big.filter((w) => Math.sign(w[key]) === Math.sign(w[tgt])).length;
  const upShare = big.filter((w) => w[tgt] > 0).length / (big.length || 1);
  return {
    n: r.length,
    corr: Math.round(corr(x, y) * 1000) / 1000,
    p: Math.round(permP(x, y) * 1000) / 1000,
    q1: bp(mean(lo)),
    q5: bp(mean(hi)),
    t15: Math.round(tstat(hi, lo) * 100) / 100,
    corrNeg: neg.length >= 15 ? Math.round(corr(neg.map((w) => w[key]), neg.map((w) => w[tgt])) * 1000) / 1000 : null, // prettier-ignore
    corrPos: pos.length >= 15 ? Math.round(corr(pos.map((w) => w[key]), pos.map((w) => w[tgt])) * 1000) / 1000 : null, // prettier-ignore
    hit: big.length ? Math.round((hit / big.length) * 1000) / 10 : null,
    base: big.length ? Math.round(Math.max(upShare, 1 - upShare) * 1000) / 10 : null,
    nBig: big.length,
  };
}

// ── dados ──
console.log("baixando…");
const spyD = await chart("SPY", "10y", "1d");
const cryD = {
  "BTC-USD": await chart("BTC-USD", "10y", "1d"),
  "ETH-USD": await chart("ETH-USD", "10y", "1d"),
  "PAXG-USD": await chart("PAXG-USD", "10y", "1d"),
};
const cryH = {
  "BTC-USD": await chart("BTC-USD", "730d", "1h"),
  "ETH-USD": await chart("ETH-USD", "730d", "1h"),
  "PAXG-USD": await chart("PAXG-USD", "730d", "1h"),
};
const spyDates = spyD.t.map(nyDate);

// fechamentos diários do cripto alinhados aos pregões do SPY (para desvio e correlação de 90 pregões)
const closeOn = (ser, dates) => dates.map((d) => at(ser, nyAt(d, 16))?.p ?? null);
const aligned = {
  SPY: spyD.c,
  "BTC-USD": closeOn(cryD["BTC-USD"], spyDates),
  "ETH-USD": closeOn(cryD["ETH-USD"], spyDates),
};

/** Fins de semana: pregões seguidos com 3+ dias corridos de intervalo. */
function weekends(base) {
  const out = [];
  for (let i = 91; i < spyDates.length; i++) {
    const a = spyDates[i - 1];
    const b = spyDates[i];
    const gapDays = (Date.parse(b) - Date.parse(a)) / 86400e3;
    if (gapDays < 3) continue;
    // domingo depois do pregão a
    const dow = new Date(`${a}T12:00:00Z`).getUTCDay();
    const sun = addDays(a, (7 - dow) % 7 || 7);
    let from;
    let cut;
    let src;
    if (base === "A") {
      from = nyAt(a, 16);
      cut = nyAt(sun, 17);
      src = cryH;
    } else {
      const sat = addDays(a, (6 - dow + 7) % 7 || 7);
      from = Date.parse(`${sat}T00:00:00Z`) / 1000;
      cut = Date.parse(`${addDays(sun, 1)}T00:00:00Z`) / 1000;
      src = cryD;
    }
    const ret = (sym) => {
      const s = src[sym];
      const p0 = at(s, from);
      const p1 = at(s, cut);
      if (!p0 || !p1 || from - p0.t > 2 * 86400 || cut - p1.t > 2 * 86400 || p1.t <= p0.t)
        return null;
      return p1.p / p0.p - 1;
    };
    const row = { a, b, gap: spyD.o[i] / spyD.c[i - 1] - 1, day: spyD.c[i] / spyD.c[i - 1] - 1 };
    row.btc = ret("BTC-USD");
    row.eth = ret("ETH-USD");
    row.paxg = ret("PAXG-USD");
    // desvio e correlação só até a sexta (sem olhar o futuro)
    const hist = { SPY: aligned.SPY.slice(0, i), "BTC-USD": aligned["BTC-USD"].slice(0, i), "ETH-USD": aligned["ETH-USD"].slice(0, i) }; // prettier-ignore
    const sb = dailyStats(hist, "BTC-USD");
    const se = dailyStats(hist, "ETH-USD");
    const days = (cut - from) / 86400;
    const zOf = (r, st) => (r != null && st?.sd ? Math.log(1 + r) / (st.sd * Math.sqrt(252 / 365) * Math.sqrt(days)) : null); // prettier-ignore
    const zb = zOf(row.btc, sb);
    const ze = zOf(row.eth, se);
    row.zbtc = zb;
    row.cry = zb != null && ze != null ? (2 / 3) * zb + (1 / 3) * ze : zb;
    row.cry50 = zb != null && ze != null ? (zb + ze) / 2 : zb;
    if (row.cry != null && sb) {
      const rho = Math.max(0, Math.min(1, sb.rho));
      row.rho = rho;
      row.score = scoreOfZ(rho * row.cry * (row.cry < 0 ? 1 : UP_W));
      row.scoreSym = scoreOfZ(rho * row.cry); // sem a assimetria
      row.score50 = scoreOfZ(rho * row.cry50 * (row.cry50 < 0 ? 1 : UP_W)); // Bitcoin e Ether meio a meio
    }
    // volatilidade do Bitcoin no fds (barras de 1 h, base A): desvio das variações por hora
    if (base === "A") {
      const s = cryH["BTC-USD"];
      const rs = [];
      for (let k = 1; k < s.t.length; k++) if (s.t[k] > from && s.t[k] <= cut && s.t[k] - s.t[k - 1] <= 2 * H) rs.push(Math.log(s.c[k] / s.c[k - 1])); // prettier-ignore
      row.rv = rs.length > 20 ? Math.sqrt(mean(rs.map((x) => x * x))) : null;
    }
    out.push(row);
  }
  // vol relativa = vol do fds ÷ mediana dos 12 fds anteriores (só o passado)
  for (let i = 0; i < out.length; i++) {
    const prev = out.slice(Math.max(0, i - 12), i).map((w) => w.rv).filter(Number.isFinite).sort((p, q) => p - q); // prettier-ignore
    out[i].vol = out[i].rv != null && prev.length >= 6 ? out[i].rv / prev[Math.floor(prev.length / 2)] : null; // prettier-ignore
    out[i].absGap = Math.abs(out[i].gap);
  }
  return out.filter((w) => w.btc != null);
}

const SIG = ["btc", "eth", "cry", "cry50", "paxg", "vol", "score", "scoreSym", "score50"];
const result = { generated: new Date().toISOString(), bases: {} };
for (const base of ["A", "B"]) {
  const rows = weekends(base);
  const res = { n: rows.length, from: rows[0]?.a, to: rows.at(-1)?.a, tests: {} };
  for (const tgt of ["gap", "day"]) {
    res.tests[tgt] = {};
    for (const k of SIG) res.tests[tgt][k] = test(rows, k, tgt);
  }
  // vol × tamanho do gap (agitação antecipa segunda agitada?)
  res.tests.absGap = { vol: test(rows, "vol", "absGap") };
  // queda forte do cripto (≤ −1,5σ) × resto
  const crash = rows.filter((w) => w.cry != null && w.cry <= -1.5);
  const rest = rows.filter((w) => w.cry != null && w.cry > -1.5);
  const rally = rows.filter((w) => w.cry != null && w.cry >= 1.5);
  const blk = (xs) => (xs.length ? { n: xs.length, gap: bp(mean(xs.map((w) => w.gap))), day: bp(mean(xs.map((w) => w.day))), downDay: Math.round((xs.filter((w) => w.day < 0).length / xs.length) * 100) } : null); // prettier-ignore
  res.crash = blk(crash);
  res.rally = blk(rally);
  res.rest = blk(rest);
  res.all = blk(rows);
  result.bases[base] = res;
  console.log(`\nBase ${base}: ${rows.length} fins de semana (${res.from} a ${res.to})`);
  for (const tgt of ["gap", "day"]) {
    console.log(`  alvo ${tgt}`);
    for (const k of SIG) {
      const t = res.tests[tgt][k];
      if (t) console.log(`    ${k.padEnd(8)} n=${t.n} corr=${t.corr} p=${t.p} Q1=${t.q1}bp Q5=${t.q5}bp t=${t.t15} neg=${t.corrNeg} pos=${t.corrPos} acerto=${t.hit}% (base ${t.base}%, n=${t.nBig})`); // prettier-ignore
    }
  }
  const v = res.tests.absGap.vol;
  if (v) console.log(`  vol × |gap|: corr=${v.corr} p=${v.p}`);
  console.log(`  queda forte ${JSON.stringify(res.crash)} · alta forte ${JSON.stringify(res.rally)} · resto ${JSON.stringify(res.rest)}`); // prettier-ignore
}
await writeFile(new URL("data/weekend-study.json", root), `${JSON.stringify(result, null, 1)}\n`);
console.log("\ngravado data/weekend-study.json");
