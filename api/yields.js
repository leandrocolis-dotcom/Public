// Vercel Function: juros soberanos fora dos EUA, de fontes oficiais gratuitas (o Yahoo não cobre).
// GET /api/yields -> { fetched_at, rows: [{ id, country, tenor, value, prev, date, source }], errors }
// Fontes: BCE (curva AAA da zona do euro), Ministério das Finanças do Japão (JGB) e Banco da Inglaterra (gilts).
// Publicação diária com 1-2 dias de defasagem; cache de 1 hora. GET /api/yields?br=1 -> macro do Brasil (api/_bcb.js).
import { fetchFearGreed } from "./_feargreed.js";
import { deadlineIn, httpFetch, timeLeft } from "./_http.js";
import { fetchBrMacro, fetchFocusIpca } from "./_bcb.js";
import { fetchCurve, peekCurve } from "./_curves.js";
import { fetchFed, peekFed } from "./_fed.js";

const UA = "Mozilla/5.0 (compatible; Pendulo/1.0)";
const TIMEOUT_MS = 15000; // o BCE às vezes leva >8 s

/** GET com uma nova tentativa: o MoF do Japão alterna 404/200 no arquivo do mês. */
async function text(url, deadline = null) {
  try {
    return await text1(url, deadline);
  } catch (e) {
    if (timeLeft(deadline) < 3000) throw e; // sem tempo para a nova tentativa
    await new Promise((r) => setTimeout(r, 600));
    return text1(url, deadline);
  }
}

const text1 = (url, deadline) =>
  httpFetch(url, { timeout: TIMEOUT_MS, ua: UA, deadline }, async (r) => {
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    return r.text();
  });

const row = (id, country, tenor, pts, source) => {
  const sorted = [...pts].sort((a, b) => (a.d < b.d ? -1 : a.d > b.d ? 1 : 0));
  const [last, prev] = sorted.slice(-2).reverse();
  return last
    ? { id, country, tenor, value: last.v, prev: prev?.v ?? null, date: last.d, source }
    : null;
};

/** BCE, CSV: série SR_2Y / SR_10Y da curva AAA. Colunas KEY,...,TIME_PERIOD,OBS_VALUE. */
export function parseEcb(csv) {
  const lines = csv.trim().split(/\r?\n/);
  const head = lines[0].split(",");
  const iKey = head.indexOf("KEY");
  const iT = head.indexOf("TIME_PERIOD");
  const iV = head.indexOf("OBS_VALUE");
  const by = {};
  for (const l of lines.slice(1)) {
    const c = l.split(",");
    const tenor = /SR_(\d+Y)/.exec(c[iKey])?.[1];
    const v = Number(c[iV]);
    if (tenor && Number.isFinite(v)) (by[tenor] ??= []).push({ d: c[iT], v });
  }
  for (const k of Object.keys(by)) by[k].sort((a, b) => (a.d < b.d ? -1 : 1));
  return by;
}

/** MoF Japão, CSV: "Date,1Y,2Y,...,10Y,...,30Y,40Y"; datas "2026/10/1". */
export function parseMof(csv) {
  const lines = csv.split(/\r?\n/);
  const hi = lines.findIndex((l) => l.startsWith("Date,"));
  if (hi < 0) return {};
  const head = lines[hi].split(",");
  const by = {};
  for (const l of lines.slice(hi + 1)) {
    const c = l.split(",");
    const m = /^(\d{4})\/(\d{1,2})\/(\d{1,2})$/.exec(c[0]);
    if (!m) continue;
    const d = `${m[1]}-${m[2].padStart(2, "0")}-${m[3].padStart(2, "0")}`;
    head.forEach((h, i) => {
      const v = Number(c[i]);
      if (i && c[i] !== "" && Number.isFinite(v)) (by[h] ??= []).push({ d, v });
    });
  }
  return by;
}

const MONTHS = { Jan: 1, Feb: 2, Mar: 3, Apr: 4, May: 5, Jun: 6, Jul: 7, Aug: 8, Sep: 9, Oct: 10, Nov: 11, Dec: 12 }; // prettier-ignore
/** Banco da Inglaterra, CSV: "DATE,IUDSNZC,IUDMNZC,..."; datas "02 Oct 2026"; células vazias em feriados. */
export function parseBoe(csv) {
  const lines = csv.trim().split(/\r?\n/);
  const head = lines[0].split(",");
  const by = {};
  for (const l of lines.slice(1)) {
    const c = l.split(",");
    const m = /^(\d{2}) (\w{3}) (\d{4})$/.exec(c[0]);
    if (!m) continue;
    const d = `${m[3]}-${String(MONTHS[m[2]]).padStart(2, "0")}-${m[1]}`;
    head.forEach((h, i) => {
      const v = Number(c[i]);
      if (i && c[i] !== "" && Number.isFinite(v)) (by[h] ??= []).push({ d, v });
    });
  }
  return by;
}

export async function fetchYields(deadline = null) {
  const today = new Date();
  const from = new Date(today - 20 * 86400000);
  const boeFrom = `${String(from.getUTCDate()).padStart(2, "0")}/${Object.keys(MONTHS)[from.getUTCMonth()]}/${from.getUTCFullYear()}`;
  const jobs = {
    ecb: text("https://data-api.ecb.europa.eu/service/data/YC/B.U2.EUR.4F.G_N_A.SV_C_YM.SR_2Y+SR_10Y+SR_30Y?lastNObservations=5&format=csvdata", deadline).then(parseEcb), // prettier-ignore
    mof: text("https://www.mof.go.jp/english/policy/jgbs/reference/interest_rate/jgbcme.csv", deadline).then(parseMof), // prettier-ignore
    boe: text(`https://www.bankofengland.co.uk/boeapps/database/_iadb-fromshowcolumns.asp?csv.x=yes&Datefrom=${boeFrom}&Dateto=now&SeriesCodes=IUDSNZC,IUDMNZC,IUDLNZC,IUDBEDR&CSVF=TN&UsingCodes=Y`, deadline).then(parseBoe), // prettier-ignore
  };
  const keys = Object.keys(jobs);
  const res = await Promise.allSettled(Object.values(jobs));
  const got = {};
  const errors = [];
  res.forEach((r, i) => {
    if (r.status === "fulfilled") got[keys[i]] = r.value;
    else errors.push(`${keys[i]}: ${r.reason?.message ?? r.reason}`);
  });
  const rows = [
    got.ecb && row("EU2Y", "Zona do euro", "2 anos", got.ecb["2Y"] ?? [], "BCE (curva AAA)"),
    got.ecb && row("EU10Y", "Zona do euro", "10 anos", got.ecb["10Y"] ?? [], "BCE (curva AAA)"),
    got.ecb && row("EU30Y", "Zona do euro", "30 anos", got.ecb["30Y"] ?? [], "BCE (curva AAA)"),
    got.boe && row("GB5Y", "Reino Unido", "5 anos", got.boe.IUDSNZC ?? [], "Banco da Inglaterra"),
    got.boe && row("GB10Y", "Reino Unido", "10 anos", got.boe.IUDMNZC ?? [], "Banco da Inglaterra"),
    got.boe && row("GB20Y", "Reino Unido", "20 anos", got.boe.IUDLNZC ?? [], "Banco da Inglaterra"),
    got.boe &&
      row("GBBR", "Reino Unido", "Bank Rate", got.boe.IUDBEDR ?? [], "Banco da Inglaterra"),
    got.mof && row("JP2Y", "Japão", "2 anos", got.mof["2Y"] ?? [], "MoF Japão"),
    got.mof && row("JP10Y", "Japão", "10 anos", got.mof["10Y"] ?? [], "MoF Japão"),
    got.mof && row("JP30Y", "Japão", "30 anos", got.mof["30Y"] ?? [], "MoF Japão"),
  ].filter(Boolean);
  return { fetched_at: new Date().toISOString(), rows, errors };
}

export default async function handler(req, res) {
  // ?br=1: macro do Brasil (SGS + Focus do BCB) para Mercado › Local
  const sp = new URL(req.url, "http://x").searchParams;
  if (sp.get("br") === "1") return brHandler(res);
  // ?focus=ipca: IPCA esperado pelo Focus, ano a ano (Juros › Brasil › Inflação implícita)
  if (sp.get("focus") === "ipca") return focusHandler(res);
  // ?fg=1: Medo & Ganância da CNN (Início, embaixo do pêndulo; api/_feargreed.js)
  if (sp.get("fg") === "1") return fgHandler(res);
  // ?fed=1: caminho do Fed implícito nos futuros de Fed Funds (Juros › 🏦 Fed, api/_fed.js)
  if (sp.get("fed") === "1") return fedHandler(sp, res);
  // ?curve=us|usr|eu|gb|jp|br[&date=AAAA-MM-DD][&live=1]: curva completa para Mercados › Juros (api/_curves.js)
  if (sp.get("curve")) return curveHandler(sp, res);
  try {
    const out = await fetchYields(deadlineIn(20000));
    res.setHeader(
      "Cache-Control",
      !out.rows.length
        ? "no-store"
        : out.errors.length
          ? "public, s-maxage=300" // alguma fonte falhou: tenta de novo em 5 min
          : "public, s-maxage=3600, stale-while-revalidate=21600",
    );
    res.status(out.rows.length ? 200 : 502).json(out);
  } catch (e) {
    res.setHeader("Cache-Control", "no-store");
    res.status(502).json({ error: String(e?.message ?? e), fetched_at: new Date().toISOString() });
  }
}

async function fgHandler(res) {
  try {
    const out = await fetchFearGreed({ deadline: deadlineIn(9000) });
    res.setHeader("Cache-Control", "public, s-maxage=120, stale-while-revalidate=120"); // a CNN muda no pregão
    res.status(200).json({ fetched_at: new Date().toISOString(), ...out });
  } catch (e) {
    res.setHeader("Cache-Control", "public, s-maxage=60");
    res.status(502).json({ error: String(e?.message ?? e), fetched_at: new Date().toISOString() });
  }
}

async function brHandler(res) {
  try {
    const out = await fetchBrMacro(deadlineIn(20000));
    const ok = out.indicators.length > 0;
    res.setHeader(
      "Cache-Control",
      !ok ? "no-store" : out.errors.length ? "public, s-maxage=600" : "public, s-maxage=3600, stale-while-revalidate=21600", // prettier-ignore
    );
    res.status(ok ? 200 : 502).json(out);
  } catch (e) {
    res.setHeader("Cache-Control", "no-store");
    res.status(502).json({ error: String(e?.message ?? e), fetched_at: new Date().toISOString() });
  }
}

async function fedHandler(sp, res) {
  try {
    if (sp.get("debug") === "1") {
      res.setHeader("Cache-Control", "no-store");
      return res.status(200).json(await peekFed(deadlineIn(15000)));
    }
    const out = await fetchFed(deadlineIn(20000));
    res.setHeader("Cache-Control", out.errors.length ? "public, s-maxage=120" : "public, s-maxage=300, stale-while-revalidate=600"); // prettier-ignore
    res.status(200).json(out);
  } catch (e) {
    res.setHeader("Cache-Control", "no-store");
    res.status(502).json({ error: String(e?.message ?? e), fetched_at: new Date().toISOString() });
  }
}

async function focusHandler(res) {
  try {
    const out = await fetchFocusIpca(deadlineIn(15000));
    res.setHeader("Cache-Control", "public, s-maxage=21600, stale-while-revalidate=86400"); // Focus sai 1x por semana
    res.status(200).json(out);
  } catch (e) {
    res.setHeader("Cache-Control", "no-store");
    res.status(502).json({ error: String(e?.message ?? e), fetched_at: new Date().toISOString() });
  }
}

async function curveHandler(sp, res) {
  const q = { curve: sp.get("curve"), date: sp.get("date") || null, live: sp.get("live") === "1" };
  try {
    if (sp.get("debug") === "1") {
      res.setHeader("Cache-Control", "no-store");
      return res.status(200).json(await peekCurve(q, deadlineIn(15000)));
    }
    const out = await fetchCurve(q, deadlineIn(20000));
    const past = q.date && q.date < new Date().toISOString().slice(0, 10);
    res.setHeader(
      "Cache-Control",
      q.live
        ? "public, s-maxage=60, stale-while-revalidate=60"
        : past
          ? "public, s-maxage=86400, stale-while-revalidate=604800" // curva de uma data passada não muda
          : "public, s-maxage=900, stale-while-revalidate=3600",
    );
    res.status(200).json(out);
  } catch (e) {
    res.setHeader("Cache-Control", "no-store");
    res.status(502).json({ error: String(e?.message ?? e), curve: q.curve, asked: q.date, fetched_at: new Date().toISOString() }); // prettier-ignore
  }
}
