// Histórico da curva de juros do Brasil para Mercados › Onshore › Juros (comparar com datas passadas).
// - Todo dia útil: curva dos futuros DI1 da B3 (cotacao.b3.com.br): ajuste oficial do pregão anterior (prvsDayAdjstmntPric)
//   e a taxa de fechamento de hoje (curPrc, provisória até o ajuste sair no dia seguinte).
// - Passado sem DI1 guardado: curva do Tesouro Prefixado (LTN e NTN-F, taxa de compra da manhã, Tesouro Transparente),
//   marcada como "td" (referência próxima do DI; costuma ficar alguns bp acima).
// Grava data/br-curve.json = { updated, days: { "AAAA-MM-DD": { s: "di1"|"td", p: [[anos, taxa], ...] } } }.
// Curva real: NTN-B (Tesouro IPCA+ com juros semestrais e, onde não há, Tesouro IPCA+), taxa de compra da manhã do
// Tesouro Direto, todo dia útil -> data/br-real.json = { updated, days: { "AAAA-MM-DD": [[anos, juro real], ...] } }.
// Uso: node scripts/update-br-curve.mjs [--backfill]
import { readFile, writeFile } from "node:fs/promises";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

const run = promisify(execFile);
const OUT = new URL("../data/br-curve.json", import.meta.url);
const OUT_REAL = new URL("../data/br-real.json", import.meta.url);
const DI1_URL = "https://cotacao.b3.com.br/mds/api/v1/DerivativeQuotation/DI1";
const TD_URL = "https://www.tesourotransparente.gov.br/ckan/dataset/df56aa42-484a-4a59-8184-7676580c81e3/resource/796d2059-14e9-44e3-80c9-2d9e30b405c1/download/PrecoTaxaTesouroDireto.csv"; // prettier-ignore
const KEEP_DAYS = 3 * 366; // ~3 anos
const DAY = 86400000;
const iso = (ms) => new Date(ms).toISOString().slice(0, 10);
const r3 = (x) => Math.round(x * 1000) / 1000;

/** Dia útil (seg-sex) anterior a `d`. */
export const prevWeekday = (d) => {
  let t = Date.parse(`${d}T12:00:00Z`) - DAY;
  while ([0, 6].includes(new Date(t).getUTCDay())) t -= DAY;
  return iso(t);
};

/** JSON dos DI1 -> { today: [[t,y]], prev: [[t,y]] } (prazo em anos a partir da data de cada curva). */
export function di1Curves(j, today) {
  const yday = prevWeekday(today);
  const yrs = (mat, base) => (Date.parse(`${mat}T12:00:00Z`) - Date.parse(`${base}T12:00:00Z`)) / (365 * DAY); // prettier-ignore
  const out = { today: [], prev: [] };
  for (const s of j?.Scty ?? []) {
    const m = /^DI1([FGHJKMNQUVXZ])(\d{2})$/.exec(s?.symb ?? "");
    if (!m) continue;
    const mat = String(s?.asset?.AsstSummry?.mtrtyCode ?? `20${m[2]}-${String("FGHJKMNQUVXZ".indexOf(m[1]) + 1).padStart(2, "0")}-01`).slice(0, 10); // prettier-ignore
    if (Number(s?.asset?.AsstSummry?.opnCtrcts ?? 1) === 0) continue;
    const cur = Number(s?.SctyQtn?.curPrc);
    const prev = Number(s?.SctyQtn?.prvsDayAdjstmntPric);
    const t0 = yrs(mat, today);
    const t1 = yrs(mat, yday);
    if (cur > 0 && cur < 100 && t0 > 0.02) out.today.push([r3(t0), cur]);
    if (prev > 0 && prev < 100 && t1 > 0.02) out.prev.push([r3(t1), prev]);
  }
  for (const k of ["today", "prev"]) out[k].sort((a, b) => a[0] - b[0]);
  return out;
}

const brDate = (s) => {
  const m = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(String(s).trim());
  return m ? `${m[3]}-${m[2]}-${m[1]}` : null;
};
const brNum = (s) => Number(String(s).trim().replace(/\./g, "").replace(",", "."));

/**
 * CSV do Tesouro Direto (separador ";") -> { data: [[t, taxa], ...] } dos prefixados: LTN (zero cupom) e, depois do
 * último vencimento de LTN, NTN-F (com cupom). No mesmo vencimento os dois têm taxas diferentes; misturar faz zigue-zague.
 */
export function parseTd(csv, from = "0000-00-00") {
  const lines = String(csv).split(/\r?\n/);
  const head = lines[0].split(";").map((h) => h.trim());
  const iT = head.findIndex((h) => /^Tipo Titulo/i.test(h));
  const iV = head.findIndex((h) => /^Data Vencimento/i.test(h));
  const iB = head.findIndex((h) => /^Data Base/i.test(h));
  const iX = head.findIndex((h) => /^Taxa Compra Manha/i.test(h));
  const by = {};
  for (const l of lines.slice(1)) {
    const c = l.split(";");
    const kind = /^Tesouro Prefixado com Juros/i.test(c[iT] ?? "") ? "f" : /^Tesouro Prefixado/i.test(c[iT] ?? "") ? "z" : null; // prettier-ignore
    if (!kind) continue;
    const base = brDate(c[iB]);
    const venc = brDate(c[iV]);
    const y = brNum(c[iX]);
    if (!base || !venc || base < from || !(y > 0 && y < 100)) continue;
    const t = (Date.parse(`${venc}T12:00:00Z`) - Date.parse(`${base}T12:00:00Z`)) / (365 * DAY);
    if (t > 0.02) (by[base] ??= { z: [], f: [] })[kind].push([r3(t), y]);
  }
  const out = {};
  for (const [d, { z, f }] of Object.entries(by)) {
    const zMax = Math.max(-1, ...z.map((x) => x[0]));
    out[d] = [...z, ...f.filter((x) => x[0] > zMax + 0.05)].sort((a, b) => a[0] - b[0]);
  }
  return out;
}

/**
 * CSV do Tesouro Direto -> { data: [[t, juro real], ...] } da NTN-B: "Tesouro IPCA+ com Juros Semestrais" (referência do
 * mercado) e "Tesouro IPCA+" (principal, zero cupom) só onde não há NTN-B com cupom a menos de 9 meses. Educa+ e Renda+
 * (fluxos de amortização) ficam de fora.
 */
export function parseNtnb(csv, from = "0000-00-00") {
  const lines = String(csv).split(/\r?\n/);
  const head = lines[0].split(";").map((h) => h.trim());
  const iT = head.findIndex((h) => /^Tipo Titulo/i.test(h));
  const iV = head.findIndex((h) => /^Data Vencimento/i.test(h));
  const iB = head.findIndex((h) => /^Data Base/i.test(h));
  const iX = head.findIndex((h) => /^Taxa Compra Manha/i.test(h));
  const by = {};
  for (const l of lines.slice(1)) {
    const c = l.split(";");
    const tipo = (c[iT] ?? "").trim();
    const kind = /^Tesouro IPCA\+ com Juros Semestrais$/i.test(tipo) ? "c" : /^Tesouro IPCA\+$/i.test(tipo) ? "z" : null; // prettier-ignore
    if (!kind) continue;
    const base = brDate(c[iB]);
    const venc = brDate(c[iV]);
    const y = brNum(c[iX]);
    if (!base || !venc || base < from || !(y > -5 && y < 30)) continue;
    const t = (Date.parse(`${venc}T12:00:00Z`) - Date.parse(`${base}T12:00:00Z`)) / (365 * DAY);
    if (t > 0.25) (by[base] ??= { c: [], z: [] })[kind].push([r3(t), y]);
  }
  const out = {};
  for (const [d, { c, z }] of Object.entries(by)) {
    const pts = [...c, ...z.filter((x) => !c.some((k) => Math.abs(k[0] - x[0]) < 0.75))];
    if (pts.length >= 3) out[d] = pts.sort((a, b) => a[0] - b[0]);
  }
  return out;
}

async function get(url, as = "text") {
  const c = await run("curl", ["-sS", "-m", "120", "-f", "-L", "-A", "Mozilla/5.0", url], { maxBuffer: 256e6 }).catch(() => null); // prettier-ignore
  const body =
    c?.stdout ?? (await (await fetch(url, { signal: AbortSignal.timeout(120000) })).text());
  return as === "json" ? JSON.parse(body) : body;
}

async function main() {
  const db = JSON.parse(await readFile(OUT, "utf8").catch(() => '{"days":{}}'));
  db.days ??= {};
  const today = iso(Date.now() - 3 * 3600e3); // horário de Brasília (aprox.)
  const from = iso(Date.now() - KEEP_DAYS * DAY);
  try {
    const c = di1Curves(await get(DI1_URL, "json"), today);
    if (c.prev.length >= 3) db.days[prevWeekday(today)] = { s: "di1", p: c.prev };
    const wd = new Date(`${today}T12:00:00Z`).getUTCDay();
    if (c.today.length >= 3 && wd > 0 && wd < 6) db.days[today] = { s: "di1", p: c.today, prov: 1 };
    console.log(`DI1: ${c.prev.length} vértices (ajuste) e ${c.today.length} (hoje)`);
  } catch (e) {
    console.warn("DI1 indisponível:", e.message);
  }
  // Tesouro Direto: todo dia para a NTN-B (curva real); prefixados só para o passado sem DI1
  let tdCsv = null;
  try {
    tdCsv = await get(TD_URL);
  } catch (e) {
    console.warn("Tesouro Transparente indisponível:", e.message);
  }
  if (tdCsv) {
    const real = JSON.parse(await readFile(OUT_REAL, "utf8").catch(() => '{"days":{}}'));
    const nb = parseNtnb(tdCsv, from);
    real.days = Object.fromEntries(Object.entries({ ...(real.days ?? {}), ...nb }).filter(([d]) => d >= from).sort(([a], [b]) => (a < b ? -1 : 1))); // prettier-ignore
    real.updated = new Date().toISOString();
    if (Object.keys(nb).length) await writeFile(OUT_REAL, JSON.stringify(real));
    console.log(`NTN-B: ${Object.keys(nb).length} dias no CSV; data/br-real.json: ${Object.keys(real.days).length} dias`); // prettier-ignore
  }
  // versão 2 do Tesouro: refaz os dias "td" (só LTN, e NTN-F depois do último LTN)
  const redo = db.tdv !== 2;
  const missing = redo || Object.keys(db.days).length < 200 || process.argv.includes("--backfill");
  if (missing && tdCsv) {
    try {
      const td = parseTd(tdCsv, from);
      let n = 0;
      for (const [d, p] of Object.entries(td))
        if ((!db.days[d] || (redo && db.days[d].s === "td")) && p.length >= 3)
          ((db.days[d] = { s: "td", p }), n++);
      if (Object.keys(td).length) db.tdv = 2;
      console.log(`Tesouro Prefixado: ${n} dias novos`);
    } catch (e) {
      console.warn("Tesouro Prefixado: falha ao ler o CSV:", e.message);
    }
  }
  for (const d of Object.keys(db.days)) if (d < from) delete db.days[d];
  db.days = Object.fromEntries(Object.entries(db.days).sort(([a], [b]) => (a < b ? -1 : 1)));
  db.updated = new Date().toISOString();
  await writeFile(OUT, JSON.stringify(db));
  console.log(`data/br-curve.json: ${Object.keys(db.days).length} dias`);
}

if (import.meta.url === `file://${process.argv[1]}`) await main();
