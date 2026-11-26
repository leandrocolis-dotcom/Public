// Curvas de juros completas (todos os vértices) para Mercados › Juros. Arquivo com "_" não vira rota: servido por
// GET /api/yields?curve=us|usr|eu|gb|jp|br[&date=AAAA-MM-DD][&live=1] (o plano limita o número de funções).
// Fontes oficiais gratuitas, sem chave:
// - us: Tesouro americano (par yield curve diária, 1 mês a 30 anos);
// - usr: Tesouro americano, curva real (TIPS, par real yield, 5 a 30 anos);
// - eu: BCE (curva à vista AAA da zona do euro, 3 meses a 30 anos);
// - gb: Banco da Inglaterra (Bank Rate + zero cupom 5, 10 e 20 anos);
// - jp: Ministério das Finanças do Japão (JGB 1 a 40 anos);
// - br: B3 (taxa referencial DI × pré por dias corridos; ao vivo: contratos DI1 da B3, ~15 min de atraso).
// Cada resposta: { curve, date, points: [{ t (anos), label, y (% a.a.) }], source, live? }.
import { httpFetch, memo } from "./_http.js";

const DAY = 86400000;
export const iso = (d) => new Date(d).toISOString().slice(0, 10);
const shift = (isoDate, days) => iso(Date.parse(`${isoDate}T12:00:00Z`) + days * DAY);
const brNum = (s) => Number(String(s).trim().replace(/\./g, "").replace(",", "."));

const get = (url, deadline, kind = "text", headers = {}) =>
  httpFetch(url, { timeout: 12000, deadline, headers }, async (r) => {
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    return kind === "json" ? r.json() : r.text();
  });

/** "1 Mo" / "1.5 Month" / "2 Yr" -> anos. */
export function tenorYears(label) {
  const m = /^(\d+(?:\.\d+)?)\s*(Mo|Month|Yr|Year)/i.exec(String(label).trim());
  if (!m) return null;
  const n = Number(m[1]);
  return /^Y/i.test(m[2]) ? n : n / 12;
}

/** Rótulo curto em português para um prazo em anos (0,25 -> "3m", 2 -> "2a"). */
export function tenorLabel(t) {
  if (t < 1 - 1e-9) {
    const m = Math.round(t * 12 * 2) / 2;
    return `${String(m).replace(".", ",")}m`;
  }
  return `${Math.round(t * 10) / 10}`.replace(".", ",") + "a";
}

// ---------- EUA: Tesouro americano ----------
export const treasuryUrl = (year, type = "daily_treasury_yield_curve") =>
  `https://home.treasury.gov/resource-center/data-chart-center/interest-rates/daily-treasury-rates.csv/${year}/all?type=${type}&field_tdr_date_value=${year}&page&_format=csv`;
const REAL_TYPE = "daily_treasury_real_yield_curve";

/** CSV do Tesouro: "Date","1 Mo",...,"30 Yr"; datas MM/DD/AAAA, mais recente primeiro. -> [{ date, points }] (crescente). */
export function parseTreasury(csv) {
  const lines = String(csv).trim().split(/\r?\n/);
  if (!lines.length) return [];
  const head = lines[0].split(",").map((h) => h.replace(/"/g, "").trim());
  const tenors = head.map((h, i) => (i ? tenorYears(h) : null));
  const out = [];
  for (const l of lines.slice(1)) {
    const c = l.split(",").map((x) => x.replace(/"/g, "").trim());
    const m = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(c[0]);
    if (!m) continue;
    const points = [];
    c.forEach((v, i) => {
      const t = tenors[i];
      const y = Number(v);
      if (i && t != null && v !== "" && Number.isFinite(y)) points.push({ t, label: tenorLabel(t), y }); // prettier-ignore
    });
    if (points.length >= 3) out.push({ date: `${m[3]}-${m[1]}-${m[2]}`, points: points.sort((a, b) => a.t - b.t) }); // prettier-ignore
  }
  return out.sort((a, b) => (a.date < b.date ? -1 : 1));
}

/** Última curva com data ≤ alvo (null se não há). */
export const pickOnOrBefore = (rows, target) =>
  target ? ([...rows].reverse().find((r) => r.date <= target) ?? null) : (rows.at(-1) ?? null);

async function usCurve(date, deadline, real = false) {
  const target = date ?? iso(Date.now());
  const year = Number(target.slice(0, 4));
  const load = (y) => memo(`ust${real ? "r" : ""}:${y}`, y < new Date().getUTCFullYear() ? 86400e3 : 15 * 60e3, () => get(real ? treasuryUrl(y, REAL_TYPE) : treasuryUrl(y), deadline).then(parseTreasury)); // prettier-ignore
  let hit = pickOnOrBefore(await load(year), date);
  if (!hit) hit = pickOnOrBefore(await load(year - 1), date); // começo de janeiro: vale o fim do ano anterior
  if (!hit) throw new Error("Tesouro sem curva para a data");
  return { ...hit, source: real ? "Tesouro americano (TIPS, par real yield)" : "Tesouro americano (par yield)" }; // prettier-ignore
}

// ---------- Zona do euro: BCE ----------
const ECB_TENORS = ["3M", "6M", "1Y", "2Y", "3Y", "5Y", "7Y", "10Y", "15Y", "20Y", "30Y"];
export const ecbUrl = (date) => {
  const base = `https://data-api.ecb.europa.eu/service/data/YC/B.U2.EUR.4F.G_N_A.SV_C_YM.${ECB_TENORS.map((t) => `SR_${t}`).join("+")}?format=csvdata`; // prettier-ignore
  return date ? `${base}&startPeriod=${shift(date, -14)}&endPeriod=${date}` : `${base}&lastNObservations=3`; // prettier-ignore
};

/** CSV do BCE (KEY,...,TIME_PERIOD,OBS_VALUE) -> [{ date, points }] por data. */
export function parseEcbCurve(csv) {
  const lines = String(csv).trim().split(/\r?\n/);
  const head = lines[0].split(",");
  const iKey = head.indexOf("KEY");
  const iT = head.indexOf("TIME_PERIOD");
  const iV = head.indexOf("OBS_VALUE");
  const by = {};
  for (const l of lines.slice(1)) {
    const c = l.split(",");
    const m = /SR_(\d+)([MY])/.exec(c[iKey] ?? "");
    const y = Number(c[iV]);
    if (!m || !Number.isFinite(y) || !c[iT]) continue;
    const t = m[2] === "Y" ? Number(m[1]) : Number(m[1]) / 12;
    (by[c[iT]] ??= []).push({ t, label: tenorLabel(t), y });
  }
  return Object.entries(by)
    .filter(([, p]) => p.length >= 3)
    .map(([date, p]) => ({ date, points: p.sort((a, b) => a.t - b.t) }))
    .sort((a, b) => (a.date < b.date ? -1 : 1));
}

async function euCurve(date, deadline) {
  const rows = await memo(`ecb:${date ?? "last"}`, date ? 86400e3 : 30 * 60e3, () => get(ecbUrl(date), deadline).then(parseEcbCurve)); // prettier-ignore
  const hit = pickOnOrBefore(rows, date);
  if (!hit) throw new Error("BCE sem curva para a data");
  return { ...hit, source: "BCE (curva à vista AAA)" };
}

// ---------- Japão: MoF ----------
const MOF_NOW = "https://www.mof.go.jp/english/policy/jgbs/reference/interest_rate/jgbcme.csv";
const MOF_ALL = "https://www.mof.go.jp/english/policy/jgbs/reference/interest_rate/historical/jgbcme_all.csv"; // prettier-ignore

/** CSV do MoF ("Date,1Y,...,40Y"; datas AAAA/M/D) -> [{ date, points }]. */
export function parseMofCurve(csv) {
  const lines = String(csv).split(/\r?\n/);
  const hi = lines.findIndex((l) => l.startsWith("Date,"));
  if (hi < 0) return [];
  const head = lines[hi].split(",").map((h) => h.trim());
  const out = [];
  for (const l of lines.slice(hi + 1)) {
    const c = l.split(",");
    const m = /^(\d{4})\/(\d{1,2})\/(\d{1,2})$/.exec(c[0]?.trim() ?? "");
    if (!m) continue;
    const points = [];
    head.forEach((h, i) => {
      const t = /^(\d+)Y$/.exec(h) ? Number(h.slice(0, -1)) : null;
      const y = Number(c[i]);
      if (i && t && c[i]?.trim() !== "" && c[i]?.trim() !== "-" && Number.isFinite(y)) points.push({ t, label: tenorLabel(t), y }); // prettier-ignore
    });
    if (points.length >= 3) out.push({ date: `${m[1]}-${m[2].padStart(2, "0")}-${m[3].padStart(2, "0")}`, points }); // prettier-ignore
  }
  return out.sort((a, b) => (a.date < b.date ? -1 : 1));
}

async function jpCurve(date, deadline) {
  const thisMonth = iso(Date.now()).slice(0, 7);
  let hit = null;
  if (!date || date.slice(0, 7) === thisMonth) {
    const rows = await memo("mof:now", 30 * 60e3, () => get(MOF_NOW, deadline).then(parseMofCurve)); // prettier-ignore
    hit = pickOnOrBefore(rows, date);
  }
  if (!hit) {
    const rows = await memo("mof:all", 6 * 3600e3, () => get(MOF_ALL, deadline).then(parseMofCurve)); // prettier-ignore
    hit = pickOnOrBefore(rows, date);
  }
  if (!hit) throw new Error("MoF sem curva para a data");
  return { ...hit, source: "MoF Japão (JGB)" };
}

// ---------- Reino Unido: Banco da Inglaterra ----------
const MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const boeDate = (isoDate) => {
  const [y, m, d] = isoDate.split("-");
  return `${d}/${MON[Number(m) - 1]}/${y}`;
};
const BOE_SERIES = { IUDBEDR: 0, IUDSNZC: 5, IUDMNZC: 10, IUDLNZC: 20 };
export const boeUrl = (date) =>
  `https://www.bankofengland.co.uk/boeapps/database/_iadb-fromshowcolumns.asp?csv.x=yes&Datefrom=${boeDate(shift(date ?? iso(Date.now()), -20))}&Dateto=${date ? boeDate(date) : "now"}&SeriesCodes=${Object.keys(BOE_SERIES).join(",")}&CSVF=TN&UsingCodes=Y`; // prettier-ignore

/** CSV do BoE ("DATE,IUDBEDR,..."; datas "02 Oct 2026") -> [{ date, points }]. */
export function parseBoeCurve(csv) {
  const lines = String(csv).trim().split(/\r?\n/);
  const head = lines[0].split(",").map((h) => h.trim());
  const out = [];
  for (const l of lines.slice(1)) {
    const c = l.split(",");
    const m = /^(\d{2}) (\w{3}) (\d{4})$/.exec(c[0]?.trim() ?? "");
    if (!m) continue;
    const points = [];
    head.forEach((h, i) => {
      const t = BOE_SERIES[h];
      const y = Number(c[i]);
      if (i && t != null && c[i]?.trim() !== "" && Number.isFinite(y)) points.push({ t, label: t ? tenorLabel(t) : "Bank Rate", y }); // prettier-ignore
    });
    if (points.length >= 3) out.push({ date: `${m[3]}-${String(MON.indexOf(m[2]) + 1).padStart(2, "0")}-${m[1]}`, points: points.sort((a, b) => a.t - b.t) }); // prettier-ignore
  }
  return out.sort((a, b) => (a.date < b.date ? -1 : 1));
}

async function gbCurve(date, deadline) {
  const rows = await memo(`boe:${date ?? "last"}`, date ? 86400e3 : 30 * 60e3, () => get(boeUrl(date), deadline).then(parseBoeCurve)); // prettier-ignore
  const hit = pickOnOrBefore(rows, date);
  if (!hit) throw new Error("BoE sem curva para a data");
  return { ...hit, source: "Banco da Inglaterra (zero cupom)" };
}

// ---------- Brasil: B3 ----------
export const b3RefUrl = (isoDate) => {
  const [y, m, d] = isoDate.split("-");
  return `https://www2.bmf.com.br/pages/portal/bmfbovespa/lumis/lum-taxas-referenciais-bmf-ptBR.asp?Data=${d}/${m}/${y}&Data1=${y}${m}${d}&slcTaxa=PRE`; // prettier-ignore
};

/**
 * Página "Taxas referenciais" da B3 (DI × pré): tabela com dias corridos, taxa 252 e taxa 360.
 * -> pontos { t (anos), label, y (taxa 252) }, ou [] sem tabela (feriado, fim de semana).
 */
export function parseB3Ref(html) {
  const cells = [...String(html).matchAll(/<td[^>]*>([\s\S]*?)<\/td>/gi)].map((m) =>
    m[1]
      .replace(/<[^>]+>/g, "")
      .replace(/&nbsp;/g, " ")
      .trim(),
  );
  const pts = [];
  for (let i = 0; i + 2 < cells.length; i++) {
    if (!/^\d{1,5}$/.test(cells[i]) || !/^\d+,\d+$/.test(cells[i + 1]) || !/^\d+,\d+$/.test(cells[i + 2])) continue; // prettier-ignore
    const dc = Number(cells[i]);
    const y = brNum(cells[i + 1]);
    if (dc > 0 && y > 0 && y < 100) pts.push({ dc, y });
    i += 2;
  }
  return thinBr(pts.map(({ dc, y }) => ({ t: dc / 365, y })));
}

/** A tabela da B3 tem um ponto por dia útil: guarda ~1 por mês até 2 anos e ~1 por trimestre depois (o gráfico não precisa de mais). */
export function thinBr(pts) {
  const out = [];
  const sorted = [...pts].sort((a, b) => a.t - b.t);
  let last = -1;
  for (const p of sorted) {
    const step = p.t <= 2 ? 1 / 12 : 0.25;
    if (p.t - last >= step - 1e-6 || p === sorted.at(-1)) {
      out.push({ t: Math.round(p.t * 1000) / 1000, label: tenorLabel(p.t), y: p.y });
      last = p.t;
    }
  }
  return out;
}

async function brRef(date, deadline) {
  // sem data: hoje (depois do fechamento) ou o último dia útil anterior; com data: aquele dia ou o anterior com tabela
  const start = date ?? iso(Date.now() - 3 * 3600e3);
  for (let k = 0; k < 4; k++) {
    const d = shift(start, -k);
    const wd = new Date(`${d}T12:00:00Z`).getUTCDay();
    if (wd === 0 || wd === 6) continue;
    const pts = await memo(`b3ref:${d}`, d < iso(Date.now()) ? 86400e3 : 20 * 60e3, () => get(b3RefUrl(d), deadline).then(parseB3Ref)); // prettier-ignore
    if (pts.length >= 3) return { date: d, points: pts, source: "B3 (taxa referencial DI × pré, 252)" }; // prettier-ignore
  }
  throw new Error("B3 sem taxa referencial nos últimos dias");
}

const MONTH_CODE = "FGHJKMNQUVXZ";
/** DI1F27 -> "2027-01-01" (vencimento no 1º dia útil do mês; o dia exato não muda o gráfico). */
export const di1Maturity = (symb) => {
  const m = /^DI1([FGHJKMNQUVXZ])(\d{2})$/.exec(symb ?? "");
  return m ? `20${m[2]}-${String(MONTH_CODE.indexOf(m[1]) + 1).padStart(2, "0")}-01` : null;
};

/** Cotação dos contratos DI1 da B3 (JSON da cotacao.b3.com.br) -> pontos ao vivo ordenados por prazo. */
export function parseDi1(j, now = Date.now()) {
  const pts = [];
  for (const s of j?.Scty ?? []) {
    const mat = s?.asset?.AsstSummry?.mtrtyCode ?? di1Maturity(s?.symb);
    const q = s?.SctyQtn ?? {};
    const bid = Number(s?.buyOffer?.price);
    const ask = Number(s?.sellOffer?.price);
    const cur = Number(q.curPrc);
    const y = cur > 0 ? cur : bid > 0 && ask > 0 ? (bid + ask) / 2 : NaN;
    const t = (Date.parse(`${String(mat).slice(0, 10)}T12:00:00Z`) - now) / (365 * DAY);
    const oi = Number(s?.asset?.AsstSummry?.opnCtrcts ?? 1);
    if (!Number.isFinite(y) || !(y > 0 && y < 100) || !(t > 0.02) || oi === 0) continue;
    pts.push({ t: Math.round(t * 1000) / 1000, label: s.symb, y, sym: s.symb, prev: Number(q.prvsDayAdjstmntPric) || null }); // prettier-ignore
  }
  return pts.sort((a, b) => a.t - b.t);
}

async function brLive(deadline) {
  const j = await memo("b3di1", 45e3, () => get("https://cotacao.b3.com.br/mds/api/v1/DerivativeQuotation/DI1", deadline, "json", { Accept: "application/json" })); // prettier-ignore
  const points = parseDi1(j);
  if (points.length < 3) throw new Error("B3 sem cotação dos DI1");
  return { date: iso(Date.now()), at: j?.Msg?.dtTm ?? null, points, source: "B3 (futuros DI1, ~15 min de atraso)", live: true }; // prettier-ignore
}

/** Último fechamento do Brasil: ajuste oficial do pregão anterior de cada DI1 (vem junto da cotação ao vivo). */
async function brClose(date, deadline) {
  if (date)
    throw new Error("histórico do Brasil em data/br-curve.json (scripts/update-br-curve.mjs)");
  try {
    const l = await brLive(deadline);
    const points = l.points.filter((p) => p.prev > 0).map((p) => ({ t: p.t, label: p.label, y: p.prev, sym: p.sym })); // prettier-ignore
    if (points.length >= 3) return { date: prevWeekday(iso(Date.now() - 3 * 3600e3)), points, source: "B3 (ajuste do DI1 no pregão anterior)" }; // prettier-ignore
  } catch {
    /* tenta a página de taxas referenciais */
  }
  return brRef(null, deadline);
}
const prevWeekday = (d) => {
  let t = Date.parse(`${d}T12:00:00Z`) - DAY;
  while ([0, 6].includes(new Date(t).getUTCDay())) t -= DAY;
  return iso(t);
};

const CURVES = {
  us: usCurve,
  usr: (d, dl) => usCurve(d, dl, true),
  eu: euCurve,
  gb: gbCurve,
  jp: jpCurve,
  br: brClose,
};

/** Uma curva: `curve` (us|usr|eu|gb|jp|br), `date` (AAAA-MM-DD ou null = a mais recente), `live` (só br). */
export async function fetchCurve({ curve, date = null, live = false }, deadline = null) {
  if (!CURVES[curve]) throw new Error(`curva desconhecida: ${curve}`);
  if (date && !/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new Error("data inválida (use AAAA-MM-DD)");
  const out = curve === "br" && live ? await brLive(deadline) : await CURVES[curve](date, deadline);
  return { curve, asked: date, fetched_at: new Date().toISOString(), ...out };
}

/** Diagnóstico (?debug=1): começo da resposta bruta da fonte, para conferir o formato quando o parser falha. */
export async function peekCurve({ curve, date = null, live = false }, deadline = null) {
  const d = date ?? iso(Date.now());
  const url = { us: treasuryUrl(d.slice(0, 4)), usr: treasuryUrl(d.slice(0, 4), REAL_TYPE), eu: ecbUrl(date), gb: boeUrl(date), jp: MOF_NOW, br: live ? "https://cotacao.b3.com.br/mds/api/v1/DerivativeQuotation/DI1" : b3RefUrl(d) }[curve]; // prettier-ignore
  if (!url) throw new Error(`curva desconhecida: ${curve}`);
  const txt = await get(url, deadline);
  return {
    url,
    length: txt.length,
    head: txt.slice(0, 2500),
    tables: (txt.match(/<td/gi) ?? []).length,
  };
}
