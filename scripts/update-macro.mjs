// Contexto macro (atualizado todo pregão): crescimento, inflação, juros/política monetária, condições financeiras
// e geopolítica, com o regime pelo "relógio do investimento" e o que a história (1999→hoje) mostra para cada setor
// nesse regime. Agenda: guarda a projeção (Forex Factory) de cada divulgação dos EUA e, depois, o resultado (FRED)
// para medir a surpresa (resultado − projeção). Grava data/macro.json e data/macro-releases.json.
// Uso: node scripts/update-macro.mjs. Fontes gratuitas: FRED (St. Louis Fed), Forex Factory, Yahoo. Educacional.
import { readFile, writeFile } from "node:fs/promises";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { THEMES, toneOf } from "../assets/news-impact.js";

const run = promisify(execFile);

const root = new URL("../", import.meta.url);
const read = async (p, d) => JSON.parse(await readFile(new URL(p, root), "utf8").catch(() => JSON.stringify(d))); // prettier-ignore
const UA = { "User-Agent": "Mozilla/5.0" };

async function get(url, as = "text", tries = 3) {
  for (let k = 0; k < tries; k++) {
    try {
      // alguns proxies recusam o fetch do Node e aceitam o curl: tenta o curl primeiro quando existir
      // o FRED recusa User-Agent de navegador; o Yahoo exige um
      const ua = /fred\.stlouisfed/.test(url) ? [] : ["-A", "Mozilla/5.0"];
      const c = await run("curl", ["-sS", "-m", "30", "-f", ...ua, url], { maxBuffer: 64e6 }).catch(() => null); // prettier-ignore
      if (c?.stdout) return as === "json" ? JSON.parse(c.stdout) : c.stdout;
      const r = await fetch(url, { headers: /fred\.stlouisfed/.test(url) ? {} : UA, signal: AbortSignal.timeout(20000) }); // prettier-ignore
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const body = as === "json" ? await r.json() : await r.text();
      if (as === "text" && /^upstream connect error/.test(body))
        throw new Error("conexão recusada");
      return body;
    } catch (e) {
      if (k === tries - 1) throw e;
      await new Promise((ok) => setTimeout(ok, 1000 * (k + 1)));
    }
  }
}

// ───────── FRED ─────────
const FRED = {
  INDPRO: "Produção industrial", PAYEMS: "Empregos (payroll)", UNRATE: "Desemprego", ICSA: "Pedidos de seguro-desemprego",
  RSAFS: "Vendas no varejo", UMCSENT: "Confiança do consumidor (Michigan)", HOUST: "Construção de casas",
  CPIAUCSL: "Inflação (CPI)", CPILFESL: "Inflação núcleo (CPI core)", PCEPILFE: "PCE núcleo", PPIFIS: "Preços ao produtor (PPI)",
  T10YIE: "Inflação implícita 10 anos", DFEDTARU: "Juro do Fed (teto)", DGS2: "Treasury 2 anos", DGS10: "Treasury 10 anos",
  T10Y3M: "Curva 10a − 3m", BAMLH0A0HYM2: "Spread high yield", DTWEXBGS: "Dólar amplo", DCOILWTICO: "Petróleo WTI",
}; // prettier-ignore
async function fred(id) {
  const csv = await get(`https://fred.stlouisfed.org/graph/fredgraph.csv?id=${id}`, "text", 5);
  if (!/^observation_date|^DATE/i.test(csv)) throw new Error("resposta inválida");
  return csv
    .trim()
    .split("\n")
    .slice(1)
    .map((l) => l.split(","))
    .filter(([, v]) => v && v !== "." && Number.isFinite(+v))
    .map(([d, v]) => [d, +v]);
}
const F = {};
const errors = [];
// uma de cada vez: o FRED derruba conexões em paralelo
for (const id of Object.keys(FRED)) {
  try {
    F[id] = await fred(id);
  } catch (e) {
    errors.push(`FRED ${id}: ${e.message}`);
    F[id] = [];
  }
}
if (!F.INDPRO.length || !F.CPIAUCSL.length)
  throw new Error(`FRED indisponível: ${errors.join("; ")}`);

// ───────── utilitários ─────────
const last = (s) => s.at(-1) ?? [null, null];
const at = (s, back) => s.at(-1 - back)?.[1] ?? null; // valor k observações atrás
const yoy = (s, i = s.length - 1, per = 12) => (i - per >= 0 ? s[i][1] / s[i - per][1] - 1 : null);
const mean = (a) => a.reduce((x, y) => x + y, 0) / a.length;
const sd = (a) => { const m = mean(a); return Math.sqrt(a.reduce((x, y) => x + (y - m) ** 2, 0) / Math.max(1, a.length - 1)); }; // prettier-ignore
const clamp = (x, a = -2.5, b = 2.5) => Math.max(a, Math.min(b, x));
/** z do valor atual contra os últimos n valores da própria série (quanto está fora do normal). */
const zNow = (vals, n = 120) => {
  const w = vals.filter(Number.isFinite).slice(-n);
  return w.length > 10 ? clamp((w.at(-1) - mean(w)) / (sd(w) || 1)) : 0;
};
const monthly = (s) => {
  const m = new Map();
  for (const [d, v] of s) m.set(d.slice(0, 7), v);
  return [...m].map(([k, v]) => [k, v]);
};
const series = (s, f) => s.map((_, i) => f(i)).filter(Number.isFinite);

// ───────── pilares (cada indicador vira nota −2,5 a +2,5: + é bom para ações) ─────────
const ind = [];
const add = (pillar, id, label, value, unit, score, read) => ind.push({ pillar, id, label, value, unit, score: Math.round(score * 100) / 100, read, date: last(F[id] ?? [])[0] }); // prettier-ignore

const ip = F.INDPRO;
if (ip.length > 30) {
  const g = series(ip, (i) => yoy(ip, i));
  add(
    "growth",
    "INDPRO",
    FRED.INDPRO,
    yoy(ip) * 100,
    "% a/a",
    zNow(g),
    yoy(ip) > 0 ? "crescendo" : "encolhendo",
  );
}
const pay = F.PAYEMS;
if (pay.length > 30) {
  const ch = series(pay, (i) => (i >= 3 ? (pay[i][1] - pay[i - 3][1]) / 3 : NaN));
  add(
    "growth",
    "PAYEMS",
    "Empregos criados (média 3 meses)",
    ch.at(-1),
    "mil/mês",
    zNow(ch),
    ch.at(-1) > 100 ? "mercado de trabalho firme" : "contratação fraca",
  );
}
const ur = F.UNRATE;
if (ur.length > 30) {
  // regra de Sahm: média de 3 meses do desemprego − mínima dos 12 meses anteriores ≥ 0,5 = recessão começando
  const m3 = series(ur, (i) => (i >= 2 ? (ur[i][1] + ur[i - 1][1] + ur[i - 2][1]) / 3 : NaN));
  const sahm = m3.at(-1) - Math.min(...m3.slice(-13, -1));
  add("growth", "UNRATE", "Desemprego (regra de Sahm)", sahm, "p.p.", clamp(-sahm / 0.25 + 1), sahm >= 0.5 ? "sinal de recessão (Sahm ≥ 0,5)" : `${last(ur)[1]}% de desemprego, sem sinal de recessão`); // prettier-ignore
}
const cl = F.ICSA;
if (cl.length > 60) {
  const r = mean(cl.slice(-4).map((x) => x[1])) / mean(cl.slice(-30).map((x) => x[1])) - 1;
  add(
    "growth",
    "ICSA",
    FRED.ICSA,
    last(cl)[1] / 1000,
    "mil/semana",
    clamp(-r / 0.05),
    r > 0.05 ? "subindo: mercado de trabalho esfriando" : "estáveis ou caindo",
  );
}
const rs = F.RSAFS;
if (rs.length > 30) add("growth", "RSAFS", FRED.RSAFS, yoy(rs) * 100, "% a/a", zNow(series(rs, (i) => yoy(rs, i))), yoy(rs) > 0.03 ? "consumo forte" : "consumo fraco"); // prettier-ignore
const um = F.UMCSENT;
if (um.length > 30) add("growth", "UMCSENT", FRED.UMCSENT, last(um)[1], "pontos", zNow(um.map((x) => x[1])), "confiança das famílias"); // prettier-ignore

const cpi = F.CPIAUCSL;
const core = F.CPILFESL;
if (cpi.length > 30) {
  const y = yoy(cpi);
  add(
    "inflation",
    "CPIAUCSL",
    FRED.CPIAUCSL,
    y * 100,
    "% a/a",
    clamp(-(y - 0.02) / 0.01),
    y > 0.03 ? "acima da meta de 2%" : "perto da meta",
  );
}
if (core.length > 30) {
  const ann = (core.at(-1)[1] / core.at(-4)[1]) ** 4 - 1;
  add(
    "inflation",
    "CPILFESL",
    "Núcleo do CPI (3 meses anualizado)",
    ann * 100,
    "% a.a.",
    clamp(-(ann - 0.02) / 0.01),
    ann > yoy(core) ? "acelerando" : "desacelerando",
  );
}
const be = F.T10YIE;
if (be.length > 100) add("inflation", "T10YIE", FRED.T10YIE, last(be)[1], "%", clamp(-(last(be)[1] - 2.3) / 0.25), "o que o mercado espera de inflação"); // prettier-ignore
const oil = F.DCOILWTICO;
if (oil.length > 100) {
  const r = last(oil)[1] / at(oil, 63) - 1;
  add(
    "inflation",
    "DCOILWTICO",
    "Petróleo WTI (3 meses)",
    r * 100,
    "%",
    clamp(-r / 0.15),
    r > 0.15 ? "choque de petróleo pressiona inflação" : "sem choque",
  );
}

const ff = F.DFEDTARU;
const y2 = F.DGS2;
if (ff.length > 200 && y2.length) {
  const ch = last(ff)[1] - (ff.find(([d]) => d >= new Date(Date.now() - 182 * 864e5).toISOString().slice(0, 10))?.[1] ?? last(ff)[1]); // prettier-ignore
  add(
    "policy",
    "DFEDTARU",
    "Juro do Fed (variação em 6 meses)",
    ch,
    "p.p.",
    clamp(-ch / 0.5),
    ch < 0 ? "Fed cortando juros" : ch > 0 ? "Fed subindo juros" : "Fed parado",
  );
  const exp = last(y2)[1] - last(ff)[1];
  add(
    "policy",
    "DGS2",
    "2 anos − juro do Fed (expectativa)",
    exp,
    "p.p.",
    clamp(-exp / 0.5),
    exp < -0.25
      ? "mercado espera cortes"
      : exp > 0.25
        ? "mercado espera altas"
        : "mercado espera Fed parado",
  );
}
const cv = F.T10Y3M;
if (cv.length > 100) add("policy", "T10Y3M", FRED.T10Y3M, last(cv)[1], "p.p.", clamp(last(cv)[1] / 0.75), last(cv)[1] < 0 ? "curva invertida (historicamente antecede recessão)" : "curva positiva"); // prettier-ignore

const hy = F.BAMLH0A0HYM2;
if (hy.length > 300) {
  add(
    "financial",
    "BAMLH0A0HYM2",
    FRED.BAMLH0A0HYM2,
    last(hy)[1],
    "p.p.",
    -zNow(
      hy.map((x) => x[1]),
      1260,
    ),
    last(hy)[1] < 3.5 ? "crédito barato (apetite a risco)" : "crédito caro (estresse)",
  );
  const d = last(hy)[1] - at(hy, 21);
  add(
    "financial",
    "HY1M",
    "Spread high yield (1 mês)",
    d,
    "p.p.",
    clamp(-d / 0.3),
    d > 0.3 ? "abrindo: estresse subindo" : "estável",
  );
}
const usd = F.DTWEXBGS;
if (usd.length > 100) {
  const r = last(usd)[1] / at(usd, 63) - 1;
  add(
    "financial",
    "DTWEXBGS",
    "Dólar amplo (3 meses)",
    r * 100,
    "%",
    clamp(-r / 0.04),
    r > 0.04 ? "dólar forte aperta condições globais" : "dólar estável/fraco",
  );
}

// ───────── geopolítica e macro nas notícias (temas do motor de impacto) ─────────
const news = await read("data/news.json", { items: [] });
const nowSec = Date.now() / 1000;
const recent = news.items.filter((it) => nowSec - it.t < 3 * 86400);
const themeHits = {};
const expo = {};
for (const it of recent) {
  const txt = `${it.title} ${it.d ?? ""}`;
  const tone = toneOf(it.title);
  for (const th of THEMES) {
    if (!th.re.test(txt)) continue;
    themeHits[th.k] ??= { label: th.label, geo: !!th.geo, n: 0 };
    themeHits[th.k].n++;
    for (const [e, fx] of Object.entries(th.fx))
      expo[e] = (expo[e] ?? 0) + fx * (tone < 0 ? 1.2 : 1);
  }
}
const geoN = Object.values(themeHits)
  .filter((t) => t.geo)
  .reduce((a, t) => a + t.n, 0);
const geoShare = recent.length ? geoN / recent.length : 0;

// histórico diário de temas (para validar depois e para o z da geopolítica)
const prev = await read("data/macro.json", { newsHist: [] });
const today = new Date().toISOString().slice(0, 10);
const newsHist = [...(prev.newsHist ?? []).filter((x) => x.day !== today), { day: today, n: recent.length, geo: geoN, themes: Object.fromEntries(Object.entries(themeHits).map(([k, v]) => [k, v.n])) }].slice(-400); // prettier-ignore
const shares = newsHist.map((x) => (x.n ? x.geo / x.n : 0));
const geoZ = shares.length > 10 ? zNow(shares) : clamp((geoShare - 0.15) / 0.08);
const gold = await get("https://query1.finance.yahoo.com/v8/finance/chart/GC=F?range=6mo&interval=1d", "json").catch(() => null); // prettier-ignore
const gc = gold?.chart?.result?.[0]?.indicators?.quote?.[0]?.close?.filter(Number.isFinite) ?? [];
const gold1m = gc.length > 22 ? gc.at(-1) / gc.at(-22) - 1 : null;
ind.push({ pillar: "geo", id: "NEWSGEO", label: "Peso da geopolítica nas manchetes (3 dias)", value: geoShare * 100, unit: "% das manchetes", score: Math.round(-geoZ * 100) / 100, read: geoZ > 1 ? "geopolítica dominando o noticiário" : "noticiário normal", date: today }); // prettier-ignore
if (gold1m !== null) ind.push({ pillar: "geo", id: "GOLD1M", label: "Ouro (1 mês, termômetro de medo)", value: gold1m * 100, unit: "%", score: Math.round(clamp(-gold1m / 0.05) * 100) / 100, read: gold1m > 0.05 ? "procura por proteção" : "sem corrida para proteção", date: today }); // prettier-ignore

// ───────── mundo: zona do euro, Japão e China (dados oficiais + mercado) ─────────
// Fontes atualizadas e gratuitas: FRED (BCE, HICP, Bund, BoJ, JGB, desemprego do Japão, exportações da China,
// câmbio, cobre) e Eurostat (desemprego da zona do euro). Inflação de Japão/China e produção industrial não têm
// série gratuita atualizada: o mercado (bolsa, moeda, cobre) entra como termômetro do momento.
const GF = {};
for (const id of [
  "CP0000EZ19M086NEST",
  "ECBDFR",
  "IRLTLT01DEM156N",
  "LRUNTTTTJPM156S",
  "IRSTCI01JPM156N",
  "IRLTLT01JPM156N",
  "XTEXVA01CNM667S",
  "DEXCHUS",
  "DEXJPUS",
  "DEXUSEU",
  "PCOPPUSDM",
]) {
  // prettier-ignore
  try {
    GF[id] = await fred(id);
  } catch (e) {
    errors.push(`FRED ${id}: ${e.message}`);
    GF[id] = [];
  }
}
let euUnemp = [];
try {
  const j = await get("https://ec.europa.eu/eurostat/api/dissemination/statistics/1.0/data/une_rt_m?geo=EA21&s_adj=SA&age=TOTAL&sex=T&unit=PC_ACT&sinceTimePeriod=2016-01", "json"); // prettier-ignore
  const idx = j.dimension.time.category.index;
  euUnemp = Object.entries(idx).sort((a, b) => a[1] - b[1]).map(([t, i]) => [t, j.value[i]]).filter(([, v]) => v != null); // prettier-ignore
} catch (e) {
  errors.push(`Eurostat desemprego: ${e.message}`);
}
async function yDaily(sym) {
  try {
    const j = await get(`https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(sym)}?range=2y&interval=1d`, "json"); // prettier-ignore
    const r = j.chart.result[0];
    return r.timestamp.map((t, i) => [new Date(t * 1000).toISOString().slice(0, 10), r.indicators.quote[0].close[i]]).filter(([, v]) => v > 0); // prettier-ignore
  } catch (e) {
    errors.push(`Yahoo ${sym}: ${e.message}`);
    return [];
  }
}
const MK = { eu: "^STOXX50E", jp: "^N225", cn: "000001.SS", hk: "^HSI", copper: "HG=F" };
const MKS = {};
for (const [k, s] of Object.entries(MK)) MKS[k] = await yDaily(s);
const world = [];
const wadd = (region, id, label, value, unit, score, read, date) => world.push({ region, id, label, value, unit, score: Math.round(clamp(score) * 100) / 100, read, date }); // prettier-ignore
/** Bolsa da região: 3 meses e posição vs. média de 200 dias (tendência). */
function equity(region, key, label) {
  const s = MKS[key];
  if (s.length < 210) return;
  const c = s.map((x) => x[1]);
  const r3 = c.at(-1) / c.at(-64) - 1;
  const ma = mean(c.slice(-200));
  wadd(region, `IDX_${key}`, `${label} (3 meses)`, r3 * 100, "%", r3 / 0.06 + (c.at(-1) > ma ? 0.5 : -0.5), `${c.at(-1) > ma ? "acima" : "abaixo"} da média de 200 dias`, s.at(-1)[0]); // prettier-ignore
}
// zona do euro
const hicp = GF.CP0000EZ19M086NEST;
if (hicp.length > 13) {
  const y = yoy(hicp);
  wadd("eu", "HICP", "Inflação (HICP)", y * 100, "% a/a", -(y - 0.02) / 0.01, y > 0.025 ? "acima da meta do BCE" : "perto da meta de 2%", last(hicp)[0]); // prettier-ignore
}
if (GF.ECBDFR.length > 200) {
  const ff = GF.ECBDFR;
  const ago = ff.find(([d]) => d >= new Date(Date.now() - 182 * 864e5).toISOString().slice(0, 10))?.[1] ?? last(ff)[1]; // prettier-ignore
  const ch = last(ff)[1] - ago;
  wadd("eu", "ECBDFR", "Juro do BCE (6 meses)", last(ff)[1], "%", -ch / 0.5, ch < 0 ? "BCE cortando juros" : ch > 0 ? "BCE subindo juros" : "BCE parado", last(ff)[0]); // prettier-ignore
}
if (GF.IRLTLT01DEM156N.length > 6) {
  const b = GF.IRLTLT01DEM156N;
  const d = last(b)[1] - at(b, 3);
  wadd("eu", "BUND", "Bund 10 anos (Alemanha, 3 meses)", last(b)[1], "%", -d / 0.4, d > 0.3 ? "juro longo subindo" : "estável", last(b)[0]); // prettier-ignore
}
if (euUnemp.length > 13) {
  const u = euUnemp.at(-1)[1], u12 = euUnemp.at(-13)[1]; // prettier-ignore
  wadd("eu", "EUUNEMP", "Desemprego da zona do euro", u, "%", -(u - u12) / 0.3, u <= u12 ? "estável ou caindo" : "subindo", euUnemp.at(-1)[0]); // prettier-ignore
}
if (GF.DEXUSEU.length > 70) {
  const e = GF.DEXUSEU;
  const r = last(e)[1] / at(e, 63) - 1;
  wadd("eu", "EURUSD", "Euro × dólar (3 meses)", r * 100, "%", 0, r > 0 ? "euro mais forte (aperta exportadores)" : "euro mais fraco (ajuda exportadores)", last(e)[0]); // prettier-ignore
}
equity("eu", "eu", "Euro Stoxx 50");
// Japão
if (GF.LRUNTTTTJPM156S.length > 13) {
  const u = GF.LRUNTTTTJPM156S;
  wadd("jp", "JPUNEMP", "Desemprego do Japão", last(u)[1], "%", -(last(u)[1] - at(u, 12)) / 0.3, "mercado de trabalho apertado", last(u)[0]); // prettier-ignore
}
if (GF.IRSTCI01JPM156N.length > 13) {
  const b = GF.IRSTCI01JPM156N;
  const ch = last(b)[1] - at(b, 6);
  wadd("jp", "BOJ", "Juro do BoJ (6 meses)", last(b)[1], "%", -ch / 0.25, ch > 0 ? "BoJ normalizando (subindo juros): risco de desmonte do carry trade" : "BoJ parado", last(b)[0]); // prettier-ignore
}
if (GF.IRLTLT01JPM156N.length > 6) {
  const b = GF.IRLTLT01JPM156N;
  const d = last(b)[1] - at(b, 3);
  wadd("jp", "JGB", "JGB 10 anos (3 meses)", last(b)[1], "%", -d / 0.25, d > 0.2 ? "juro japonês subindo: pressiona juros globais" : "estável", last(b)[0]); // prettier-ignore
}
if (GF.DEXJPUS.length > 70) {
  const e = GF.DEXJPUS;
  const r = last(e)[1] / at(e, 63) - 1;
  wadd("jp", "USDJPY", "Dólar × iene (3 meses)", last(e)[1], "ienes", -Math.abs(r) / 0.04 + 0.5, r < -0.04 ? "iene subindo rápido: desmonte do carry trade (risco global)" : r > 0.04 ? "iene fraco" : "estável", last(e)[0]); // prettier-ignore
}
equity("jp", "jp", "Nikkei 225");
// China
const ex = GF.XTEXVA01CNM667S;
if (ex.length > 14) {
  const m3 = (k) => mean(ex.slice(ex.length - 3 - k, ex.length - k).map((x) => x[1]));
  const y = m3(0) / m3(12) - 1;
  wadd("cn", "CNEXP", "Exportações da China (3 meses, a/a)", y * 100, "%", y / 0.05, y > 0 ? "demanda externa firme" : "exportações caindo", last(ex)[0]); // prettier-ignore
}
if (GF.DEXCHUS.length > 70) {
  const e = GF.DEXCHUS;
  const r = last(e)[1] / at(e, 63) - 1;
  wadd("cn", "USDCNY", "Dólar × yuan (3 meses)", last(e)[1], "yuan", -r / 0.02, r > 0.02 ? "yuan enfraquecendo (estresse ou estímulo)" : "yuan estável/forte", last(e)[0]); // prettier-ignore
}
const cu = MKS.copper.length > 70 ? MKS.copper : null;
if (cu) {
  const r = cu.at(-1)[1] / cu.at(-64)[1] - 1;
  wadd("cn", "COPPER", "Cobre (3 meses, termômetro da indústria chinesa)", r * 100, "%", r / 0.08, r > 0 ? "demanda industrial forte" : "demanda industrial fraca", cu.at(-1)[0]); // prettier-ignore
}
equity("cn", "cn", "Xangai Composite");
equity("cn", "hk", "Hang Seng (Hong Kong)");
const REGIONS = { eu: "Zona do euro", jp: "Japão", cn: "China" };
const regions = Object.fromEntries(Object.entries(REGIONS).map(([k, label]) => {
  const l = world.filter((x) => x.region === k);
  return [k, { label, score: l.length ? Math.round(mean(l.map((x) => x.score)) * 100) / 100 : null, n: l.length }];
})); // prettier-ignore
const globalScore =
  mean(
    Object.values(regions)
      .map((r) => r.score)
      .filter(Number.isFinite),
  ) ?? 0;

// ───────── pilares e regime ─────────
const PIL = { growth: "Crescimento", inflation: "Inflação", policy: "Juros e Fed", financial: "Condições financeiras", geo: "Geopolítica", global: "Mundo (Europa, Japão, China)" }; // prettier-ignore
const pillars = Object.fromEntries(Object.entries(PIL).map(([k, label]) => {
  const l = ind.filter((x) => x.pillar === k);
  return [k, { label, score: l.length ? Math.round(mean(l.map((x) => x.score)) * 100) / 100 : null, n: l.length }];
})); // prettier-ignore
pillars.global = { label: PIL.global, score: Math.round(globalScore * 100) / 100, n: world.length };

// ───────── história: regime mensal desde 1999 e setores ─────────
// crescimento: produção industrial a/a acima ou abaixo de 3 meses antes; inflação: CPI a/a acima ou abaixo de 3 meses
// antes (dados publicados com ~1 mês de atraso: o mês t usa o dado de t−1). "Relógio do investimento" (Merrill Lynch).
const ipM = monthly(ip), cpiM = monthly(cpi); // prettier-ignore
const regimeAt = (k) => {
  const i = ipM.findIndex(([m]) => m === k), j = cpiM.findIndex(([m]) => m === k); // prettier-ignore
  if (i < 15 || j < 15) return null;
  const g = yoy(ipM, i) - yoy(ipM, i - 3);
  const p = yoy(cpiM, j) - yoy(cpiM, j - 3);
  return { g, p, r: g >= 0 ? (p >= 0 ? "super" : "recup") : p >= 0 ? "estag" : "desac" };
};
const REG = {
  recup: { label: "Recuperação", text: "crescimento acelerando, inflação desacelerando" },
  super: { label: "Superaquecimento", text: "crescimento e inflação acelerando" },
  estag: { label: "Estagflação", text: "crescimento desacelerando, inflação acelerando" },
  desac: { label: "Desaceleração", text: "crescimento e inflação desacelerando" },
};
const SECT = [
  "XLB",
  "XLE",
  "XLF",
  "XLI",
  "XLK",
  "XLP",
  "XLU",
  "XLV",
  "XLY",
  "TLT",
  "GLD",
  "IWM",
  "EEM",
];
const NAMES = { XLB: "Materiais", XLE: "Energia", XLF: "Financeiro", XLI: "Industriais", XLK: "Tecnologia", XLP: "Consumo básico", XLU: "Utilities", XLV: "Saúde", XLY: "Consumo discricionário", TLT: "Treasuries longas", GLD: "Ouro", IWM: "Small caps", EEM: "Emergentes" }; // prettier-ignore
const monthlyYahoo = async (sym) => {
  const j = await get(
    `https://query1.finance.yahoo.com/v8/finance/chart/${sym}?range=max&interval=1mo`,
    "json",
  );
  const r = j.chart.result[0];
  const adj = r.indicators.adjclose?.[0]?.adjclose ?? r.indicators.quote[0].close;
  return new Map(r.timestamp.map((t, i) => [new Date(t * 1000).toISOString().slice(0, 7), adj[i]]).filter(([, v]) => v > 0)); // prettier-ignore
};
const px = {};
for (const s of ["SPY", ...SECT]) px[s] = await monthlyYahoo(s).catch((e) => (errors.push(`Yahoo ${s}: ${e.message}`), new Map())); // prettier-ignore
const months = [...px.SPY.keys()].filter((m) => m >= "1999-01");
const prevMonth = (m) => { const [y, mo] = m.split("-").map(Number); return mo === 1 ? `${y - 1}-12` : `${y}-${String(mo - 1).padStart(2, "0")}`; }; // prettier-ignore
const hist = {};
for (let i = 0; i < months.length - 1; i++) {
  const m = months[i], n = months[i + 1]; // prettier-ignore
  const rg = regimeAt(prevMonth(m)); // dado do mês anterior (publicação atrasada)
  if (!rg) continue;
  const spy = px.SPY.get(n) / px.SPY.get(m) - 1;
  for (const s of SECT) {
    const a = px[s].get(m), b = px[s].get(n); // prettier-ignore
    if (!(a > 0 && b > 0)) continue;
    ((hist[rg.r] ??= {})[s] ??= []).push(b / a - 1 - spy);
  }
  ((hist[rg.r] ??= {}).SPY ??= []).push(spy);
}
const history = Object.fromEntries(Object.entries(hist).map(([r, o]) => [r, Object.fromEntries(Object.entries(o).map(([s, v]) => [s, { n: v.length, avg: mean(v), t: (mean(v) / (sd(v) || 1)) * Math.sqrt(v.length), hit: v.filter((x) => x > 0).length / v.length }]))])); // prettier-ignore

// regime atual: último mês com dado (com a mesma régua) + probabilidade pela distância ao eixo
const lastM = ipM.at(-1)[0] < cpiM.at(-1)[0] ? ipM.at(-1)[0] : cpiM.at(-1)[0];
const cur = regimeAt(lastM);
const prob = (x, s) => 1 / (1 + Math.exp(-x / s));
const pg = prob(cur.g, 0.01), pp = prob(cur.p, 0.004); // prettier-ignore
const probs = {
  recup: pg * (1 - pp),
  super: pg * pp,
  estag: (1 - pg) * pp,
  desac: (1 - pg) * (1 - pp),
};
// inclinação de cada setor: média histórica no regime ponderada pela probabilidade de cada regime, com encolhimento
// (amostra pequena puxa para zero) e o efeito dos temas das notícias de hoje
const EXPO_OF = { XLE: ["energy", "oil"], XLK: ["tech", "semis"], XLF: ["banks", "insurance"], XLU: ["utilities"], XLP: ["staples"], XLV: ["health", "pharma"], XLB: ["materials", "copper", "steel"], XLI: ["industrials", "defense"], XLY: ["consumer", "autos", "travel"], TLT: ["bonds"], GLD: ["gold"], EEM: ["emerging", "china"], IWM: ["market"] }; // prettier-ignore
const tilts = SECT.map((s) => {
  let hm = 0;
  for (const [r, p] of Object.entries(probs)) {
    const h = history[r]?.[s];
    if (h) hm += p * h.avg * (h.n / (h.n + 24));
  }
  const nw = (EXPO_OF[s] ?? []).reduce((a, e) => a + (expo[e] ?? 0), 0);
  const newsTilt = clamp(nw / Math.max(5, recent.length / 10), -1, 1);
  const h = history[cur.r]?.[s];
  return { sym: s, name: NAMES[s], hist: hm, histRegime: h ?? null, news: newsTilt, score: clamp(hm / 0.01 + newsTilt * 0.5, -3, 3) };
}).sort((a, b) => b.score - a.score); // prettier-ignore

// nota geral do contexto macro para ações (−100 a +100)
const W = { growth: 0.25, inflation: 0.2, policy: 0.15, financial: 0.15, geo: 0.1, global: 0.15 };
const overall = Math.round(Object.entries(W).reduce((a, [k, w]) => a + w * (pillars[k].score ?? 0), 0) / 2.5 * 100); // prettier-ignore

// ───────── agenda: projeção (Forex Factory) × resultado (FRED) ─────────
const rel = await read("data/macro-releases.json", { events: {} });
for (const u of [
  "https://nfs.faireconomy.media/ff_calendar_thisweek.json",
  "https://nfs.faireconomy.media/ff_calendar_nextweek.json",
]) {
  const l = await get(u, "json", 1).catch(() => []);
  for (const e of l) {
    if (e.country !== "USD" || !["High", "Medium"].includes(e.impact)) continue;
    const id = `${e.title}|${e.date.slice(0, 10)}`;
    rel.events[id] = { ...rel.events[id], title: e.title, date: e.date, impact: e.impact, forecast: e.forecast || rel.events[id]?.forecast || null, previous: e.previous || rel.events[id]?.previous || null }; // prettier-ignore
  }
}
// resultado pelo FRED: o valor do período anterior à data de divulgação, na mesma unidade da projeção
const pctNum = (s) => (s == null || s === "" ? null : parseFloat(String(s).replace(/[%KM]/g, "")) * (/K$/.test(s) ? 1 : /M$/.test(s) ? 1000 : 1)); // prettier-ignore
const MAP = [
  [/^Core CPI m\/m/, "CPILFESL", "mom"], [/^CPI m\/m/, "CPIAUCSL", "mom"], [/^CPI y\/y/, "CPIAUCSL", "yoy"], [/^Core CPI y\/y/, "CPILFESL", "yoy"],
  [/^Unemployment Rate/, "UNRATE", "lvl"], [/^Non-Farm Employment Change/, "PAYEMS", "diffK"], [/^Retail Sales m\/m/, "RSAFS", "mom"],
  [/^Unemployment Claims/, "ICSA", "lvlK"], [/^PPI m\/m/, "PPIFIS", "mom"], [/^Core PCE Price Index m\/m/, "PCEPILFE", "mom"],
  [/^Prelim UoM Consumer Sentiment|^Revised UoM Consumer Sentiment/, "UMCSENT", "lvl"], [/^Building Permits|^Housing Starts/, "HOUST", "lvlM"],
  [/^Federal Funds Rate/, "DFEDTARU", "lvl"],
]; // prettier-ignore
// sinal da surpresa para ações: + bom (crescimento acima, inflação abaixo)
const GOOD = { CPILFESL: -1, CPIAUCSL: -1, PPIFIS: -1, PCEPILFE: -1, UNRATE: -1, ICSA: -1, PAYEMS: 1, RSAFS: 1, UMCSENT: 1, HOUST: 1, DFEDTARU: -1 }; // prettier-ignore
for (const e of Object.values(rel.events)) {
  if (Date.parse(e.date) > Date.now() || e.actual != null) continue;
  const m = MAP.find(([re]) => re.test(e.title));
  if (!m) continue;
  const [, id, kind] = m;
  const s = F[id];
  if (!s?.length) continue;
  const relDay = e.date.slice(0, 10);
  // dado publicado depois da divulgação: a última observação com data anterior à divulgação
  const avail = s.filter(([d]) => d < relDay);
  const i = avail.length - 1;
  if (i < 13) continue;
  // o FRED atualiza dias depois; só aceita se a observação for recente (até 75 dias antes da divulgação)
  if (Date.parse(relDay) - Date.parse(avail[i][0]) > 75 * 864e5) continue;
  const v = kind === "mom" ? (s[i][1] / s[i - 1][1] - 1) * 100 : kind === "yoy" ? (s[i][1] / s[i - 12][1] - 1) * 100 : kind === "diffK" ? s[i][1] - s[i - 1][1] : kind === "lvlK" ? s[i][1] / 1000 : kind === "lvlM" ? s[i][1] / 1000 : s[i][1]; // prettier-ignore
  e.actual = Math.round(v * 100) / 100;
  e.series = id;
  const f = pctNum(e.forecast);
  if (f !== null) {
    e.surprise = Math.round((e.actual - f) * 100) / 100;
    e.good = Math.sign(e.surprise) * (GOOD[id] ?? 0);
  }
}
// índice de surpresas (30 dias): saldo das surpresas boas − ruins
const recentRel = Object.values(rel.events).filter((e) => e.good !== undefined && Date.now() - Date.parse(e.date) < 30 * 864e5); // prettier-ignore
const surpriseIdx = recentRel.length
  ? recentRel.reduce((a, e) => a + e.good, 0) / recentRel.length
  : 0;

const out = {
  updated_at: new Date().toISOString(),
  overall,
  regime: { id: cur.r, ...REG[cur.r], month: lastM, growthMom: cur.g, inflMom: cur.p, probs },
  pillars,
  world: { regions, indicators: world },
  indicators: ind,
  surprises: { index: Math.round(surpriseIdx * 100) / 100, n: recentRel.length },
  news: { n: recent.length, geoShare, themes: Object.entries(themeHits).sort((a, b) => b[1].n - a[1].n).slice(0, 8).map(([k, v]) => ({ k, ...v })) }, // prettier-ignore
  tilts,
  history: { since: months[0], regimes: REG, bySector: history },
  newsHist,
  errors,
};
await writeFile(new URL("data/macro.json", root), JSON.stringify(out));
await writeFile(new URL("data/macro-releases.json", root), JSON.stringify(rel));
console.log(`macro: nota ${overall} · regime ${REG[cur.r].label} (${lastM}) · ${ind.length} indicadores · ${Object.keys(rel.events).length} divulgações · ${errors.length} erros`); // prettier-ignore
for (const p of Object.values(pillars)) console.log(`  ${p.label}: ${p.score} (${p.n})`);
console.log("  setores:", tilts.map((t) => `${t.sym} ${t.score.toFixed(2)}`).join(" "));
if (errors.length) console.log(errors.join("\n"));
