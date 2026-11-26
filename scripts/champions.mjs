// C1 (docs/ROADMAP-CAMPEOES.md): campeões dos setores em todas as bolsas dos EUA, qualidade + tendência, com folga.
// Uso: node scripts/champions.mjs [--force]   → data/champions.json (lista atual, entradas, saídas e histórico).
// Sem --force, não refaz se a última revisão já é deste mês (o cron mensal roda em vários dias por segurança).
// Regras registradas no roadmap ANTES de rodar; não mudar depois de ver o resultado. Material educacional.
import { readFile, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { sma } from "./lib/study-data.mjs";
import { getSession } from "../api/quotes.js";

const OUT = new URL("../data/champions.json", import.meta.url);
const R = {
  minCap: 2e9,
  minPrice: 5,
  minDollarVol: 20e6,
  perSector: 4,
  total: 45,
  enterRank: 3,
  keepRank: 8,
};
const prev = existsSync(OUT) ? JSON.parse(await readFile(OUT, "utf8")) : null;
const today = new Date().toISOString().slice(0, 10);
if (!process.argv.includes("--force") && prev?.asOf?.slice(0, 7) === today.slice(0, 7)) {
  console.log(`revisão de ${prev.asOf} já é deste mês; nada a fazer`);
  process.exit(0);
}

// ---------- universo: screener da Nasdaq (NYSE, Nasdaq, NYSE American) ----------
const scr = await (
  await fetch("https://api.nasdaq.com/api/screener/stocks?tableonly=true&download=true", {
    headers: { "User-Agent": "Mozilla/5.0", Accept: "application/json" },
    signal: AbortSignal.timeout(60000),
  })
).json();
const rows = scr?.data?.rows ?? [];
if (rows.length < 3000) throw new Error(`screener veio curto (${rows.length})`);
const num = (s) => Number(String(s ?? "").replace(/[$,%]/g, "")) || 0;
const uni = rows
  .filter((r) => /^[A-Z]{1,5}(\/[AB])?$/.test(r.symbol) && r.sector && r.sector !== "Miscellaneous")
  .map((r) => ({
    s: r.symbol.replace("/", "-"),
    name: r.name.replace(
      / (Common Stock|Class [A-C] .*|Ordinary Shares.*|American Depositary.*)$/i,
      "",
    ),
    sector: r.sector,
    industry: r.industry,
    cap: num(r.marketCap),
    country: r.country,
    px: num(r.lastsale),
  }))
  .filter((r) => r.cap >= R.minCap && r.px >= R.minPrice && r.country !== "Brazil"); // usuário não opera Brasil
console.log(`screener: ${rows.length} ações; ${uni.length} com valor ≥ US$ 2 bi e preço ≥ US$ 5`);

async function pool(items, n, fn) {
  let k = 0;
  await Promise.all(
    Array.from({ length: n }, async () => {
      while (k < items.length) {
        const it = items[k++];
        try {
          await fn(it);
        } catch {
          it.err = true;
        }
      }
    }),
  );
}

// ---------- liquidez e tendência (Yahoo, 2 anos; uma chamada traz preço ajustado e volume) ----------
async function yahoo(sym) {
  const u = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(sym)}?range=2y&interval=1d`;
  const j = (await (await fetch(u, { headers: { "User-Agent": "Mozilla/5.0" }, signal: AbortSignal.timeout(20000) })).json()).chart?.result?.[0]; // prettier-ignore
  const q = j?.indicators?.quote?.[0];
  const adj = j?.indicators?.adjclose?.[0]?.adjclose;
  if (!j?.timestamp || !q) throw new Error("sem dados");
  const o = { dates: [], c: [], dv: [] };
  j.timestamp.forEach((t, i) => {
    const c = q.close[i];
    if (!(c > 0)) return;
    o.dates.push(new Date(t * 1000).toISOString().slice(0, 10));
    o.c.push(adj?.[i] > 0 ? adj[i] : c);
    o.dv.push(c * (q.volume[i] ?? 0));
  });
  return o;
}
await pool(uni, 8, async (x) => {
  const b = await yahoo(x.s);
  const c = b.c;
  const n = c.length - 1;
  if (n < 260) return;
  const dv = b.dv.slice(-50);
  x.dollarVol = dv.reduce((a, v) => a + v, 0) / dv.length;
  const ma200 = sma(c, 200)[n];
  const ma50 = sma(c, 50)[n];
  x.close = c[n];
  x.date = b.dates[n];
  x.above200 = c[n] > ma200;
  x.golden = ma50 > ma200;
  x.r6 = c[n] / c[n - 126] - 1;
  x.mom = c[n - 21] / c[n - 252] - 1;
  x.offHigh = c[n] / Math.max(...c.slice(-252)) - 1;
  x.dist200 = c[n] / ma200 - 1;
});
const liquid = uni.filter((x) => x.close && x.dollarVol >= R.minDollarVol);
console.log(`com histórico e liquidez: ${liquid.length}`);

// ---------- qualidade (Yahoo quoteSummary.financialData) ----------
let sess = await getSession();
const raw = (o) => (o && typeof o === "object" ? (o.raw ?? null) : null);
async function fin(x, retry = true) {
  const u = `https://query2.finance.yahoo.com/v10/finance/quoteSummary/${encodeURIComponent(x.s)}?modules=financialData,assetProfile&crumb=${encodeURIComponent(sess.crumb)}`;
  const r = await fetch(u, { headers: { Cookie: sess.cookie, "User-Agent": "Mozilla/5.0" }, signal: AbortSignal.timeout(20000) }); // prettier-ignore
  if ((r.status === 401 || r.status === 403) && retry) {
    sess = await getSession(true);
    return fin(x, false);
  }
  const res = (await r.json())?.quoteSummary?.result?.[0];
  const ap = res?.assetProfile;
  // setor e indústria do Yahoo (padrão GICS); o do screener da Nasdaq classifica mal (navios em consumo etc.)
  if (ap?.sector) x.sector = ap.sector;
  if (ap?.industry) x.industry = ap.industry;
  if (ap?.country === "Brazil") x.brazil = true;
  const f = res?.financialData;
  if (!f) return;
  const rev = raw(f.totalRevenue);
  const fcf = raw(f.freeCashflow);
  x.q = {
    roe: raw(f.returnOnEquity),
    opm: raw(f.operatingMargins),
    gm: raw(f.grossMargins) || null, // bancos vêm com 0
    growth: raw(f.revenueGrowth),
    fcfm: rev && fcf != null ? fcf / rev : null,
    de: raw(f.debtToEquity),
    fcf,
  };
}
// todos os líquidos: o setor do Yahoo define o grupo do ranking, e a qualidade é percentil dentro dele
const needQ = liquid;
await pool(needQ, 4, fin);
console.log(`fundamentos buscados: ${needQ.length} (${needQ.filter((x) => x.q).length} com dados)`);
for (let i = liquid.length - 1; i >= 0; i--) if (liquid[i].brazil) liquid.splice(i, 1);

// ---------- notas por setor ----------
function pctRank(list, key, higher = true) {
  const v = list.filter((x) => Number.isFinite(key(x)));
  const sorted = v.map(key).sort((a, b) => a - b);
  const out = new Map();
  for (const x of v) {
    const k = key(x);
    let lo = 0;
    while (lo < sorted.length && sorted[lo] < k) lo++;
    const p = sorted.length > 1 ? lo / (sorted.length - 1) : 0.5;
    out.set(x, 100 * (higher ? p : 1 - p));
  }
  return out;
}
const bySector = {};
liquid.forEach((x) => (bySector[x.sector] ||= []).push(x));
for (const list of Object.values(bySector)) {
  const t = [
    pctRank(list, (x) => x.r6),
    pctRank(list, (x) => x.mom),
    pctRank(list, (x) => x.offHigh),
  ];
  const qk = [
    pctRank(list, (x) => x.q?.roe),
    pctRank(list, (x) => x.q?.opm),
    pctRank(list, (x) => x.q?.gm),
    pctRank(list, (x) => x.q?.growth),
    pctRank(list, (x) => x.q?.fcfm),
    pctRank(list, (x) => x.q?.de, false),
  ];
  for (const x of list) {
    x.T = t
      .map((m) => m.get(x))
      .filter(Number.isFinite)
      .reduce((a, b, _, arr) => a + b / arr.length, 0);
    const qs = qk.map((m) => m.get(x)).filter(Number.isFinite);
    x.Q = qs.length >= 3 ? qs.reduce((a, b) => a + b, 0) / qs.length : null;
    x.trendOk = x.above200 && x.golden;
    x.qualOk = !!x.q && x.q.opm > 0 && !(x.q.fcf != null && x.q.fcf <= 0);
    x.score = x.Q == null ? null : 0.5 * x.Q + 0.5 * x.T;
  }
  const ranked = list
    .filter((x) => x.trendOk && x.qualOk && x.score != null)
    .sort((a, b) => b.score - a.score);
  ranked.forEach((x, i) => (x.rank = i + 1));
}

// ---------- seleção com folga ----------
const bySym = new Map(liquid.map((x) => [x.s, x]));
const kept = [];
const leaving = [];
for (const m of prev?.members ?? []) {
  const x = bySym.get(m.s);
  const why = !x
    ? "sem dados ou abaixo do mínimo de valor/liquidez"
    : !x.above200
      ? "perdeu a MM200"
      : !x.golden
        ? "MM50 cruzou abaixo da MM200"
        : !x.qualOk
          ? "qualidade: margem operacional ou caixa livre negativos"
          : !(x.rank <= R.keepRank)
            ? `caiu para ${x.rank ? `${x.rank}º` : "fora do ranking"} no setor`
            : null;
  if (why) leaving.push({ s: m.s, name: m.name, sector: m.sector, since: m.since, why });
  else kept.push({ x, since: m.since });
}
const count = {};
kept.forEach(({ x }) => (count[x.sector] = (count[x.sector] ?? 0) + 1));
const newcomers = [];
for (const [sector, list] of Object.entries(bySector)) {
  const cands = list.filter((x) => x.rank && x.rank <= R.enterRank && !kept.some((k) => k.x === x)).sort((a, b) => a.rank - b.rank); // prettier-ignore
  for (const x of cands) {
    if ((count[sector] ?? 0) >= R.perSector) break;
    newcomers.push(x);
    count[sector] = (count[sector] ?? 0) + 1;
  }
}
newcomers.sort((a, b) => b.score - a.score);
const room = Math.max(0, R.total - kept.length);
const entering = newcomers.slice(0, room);

const card = (x, since) => ({
  s: x.s,
  name: x.name,
  sector: x.sector,
  industry: x.industry,
  since,
  score: +x.score.toFixed(1),
  Q: +x.Q.toFixed(1),
  T: +x.T.toFixed(1),
  rank: x.rank,
  close: +x.close.toFixed(2),
  dist200: +x.dist200.toFixed(4),
  offHigh: +x.offHigh.toFixed(4),
  r6: +x.r6.toFixed(4),
  roe: x.q.roe,
  opm: x.q.opm,
  growth: x.q.growth,
});
const members = [...kept.map(({ x, since }) => card(x, since)), ...entering.map((x) => card(x, today))].sort((a, b) => a.sector.localeCompare(b.sector) || b.score - a.score); // prettier-ignore
const next = newcomers
  .slice(room)
  .concat(
    Object.values(bySector).flatMap((l) =>
      l.filter((x) => x.rank > R.enterRank && x.rank <= R.enterRank + 2),
    ),
  )
  .filter((x) => !members.some((m) => m.s === x.s))
  .sort((a, b) => b.score - a.score)
  .slice(0, 15)
  .map((x) => card(x, null));

const res = {
  asOf: today,
  priceDate: liquid
    .map((x) => x.date)
    .sort()
    .at(-1),
  rules: R,
  funnel: { screener: rows.length, universe: uni.length, liquid: liquid.length, fundamentals: needQ.length, eligible: liquid.filter((x) => x.rank).length }, // prettier-ignore
  members,
  entering: entering.map((x) => ({ s: x.s, name: x.name, sector: x.sector, why: `${x.rank}º do setor (nota ${x.score.toFixed(0)}: qualidade ${x.Q.toFixed(0)}, tendência ${x.T.toFixed(0)})` })), // prettier-ignore
  leaving,
  next,
  history: [...(prev?.history ?? []), { date: today, in: entering.map((x) => x.s), out: leaving.map((x) => x.s), members: members.map((m) => m.s) }].slice(-36), // prettier-ignore
};
await writeFile(OUT, JSON.stringify(res, null, 1));
console.log(`campeões: ${members.length} (entraram ${entering.length}, saíram ${leaving.length})`);
const bys = {};
members.forEach((m) => (bys[m.sector] ||= []).push(`${m.s}(${m.score.toFixed(0)})`));
for (const [k, v] of Object.entries(bys)) console.log(`  ${k}: ${v.join(" ")}`);
