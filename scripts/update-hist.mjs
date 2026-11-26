// Atualiza a base histórica do repositório (data/hist/<ATIVO>.csv + data/hist/_index.json).
// Universo: setores do app + S&P 500 (Quant) + campeões + carteiras/watchlists da nuvem (com SUPABASE_SERVICE_ROLE_KEY).
// Ativo já na base: baixa só os últimos 5 dias (ou 1 mês se ficou parado). Ativo novo ou desdobramento: 2 anos.
// Uso: node scripts/update-hist.mjs [ATIVO ...]   (sem argumentos: o universo todo)
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { join } from "node:path";
import { yahooBars } from "../api/analyze.js";
import {
  HIST_DIR,
  daysBetween,
  histFile,
  mergeBars,
  readHist,
  toCsv,
  trimBars,
} from "../api/_hist.js";
import { SECTORS } from "../assets/sectors.js";
import { pool } from "./lib/quant-source.mjs";

const SYM_RE = /^[A-Z0-9][A-Z0-9.\-=^]{0,14}$/;
const NOT_TRADED = new Set(["US10Y", "US3M", "VIX", "DXY", "WTI"]);
const PAR = 8;

const readJson = (p, fb = null) =>
  readFile(p, "utf8")
    .then(JSON.parse)
    .catch(() => fb);

async function cloudSyms() {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!key) return [];
  const url = process.env.SUPABASE_URL ?? "https://iufliktjawnfawerwvtg.supabase.co";
  const get = async (path) => {
    const r = await fetch(`${url}/rest/v1/${path}`, { headers: { apikey: key, Authorization: `Bearer ${key}` } }); // prettier-ignore
    return r.ok ? r.json() : [];
  };
  const held = (await get("pendulo_portfolio?select=holdings")).flatMap((r) => (r.holdings ?? []).map((h) => h.sym)); // prettier-ignore
  const lists = (await get("pendulo_watchlists?select=lists")).flatMap((r) => (r.lists ?? []).flatMap((l) => l.syms ?? [])); // prettier-ignore
  return [...held, ...lists];
}

export async function universe() {
  const [quant, champ, ohlc, cloud] = await Promise.all([
    readJson("data/quant.json", {}),
    readJson("data/champions.json", {}),
    readJson("data/ohlc.json", {}),
    cloudSyms().catch(() => []),
  ]);
  const all = [
    ...SECTORS.flatMap((s) => s.syms),
    ...(quant.rows ?? []).map((r) => r.sym),
    ...(champ.members ?? []).map((m) => m.s),
    ...Object.keys(ohlc.bars ?? {}),
    ...cloud,
  ].map((s) =>
    String(s ?? "")
      .toUpperCase()
      .trim(),
  );
  return [...new Set(all)].filter((s) => SYM_RE.test(s) && !NOT_TRADED.has(s)).sort();
}

async function updateOne(sym, today) {
  const base = readHist(sym);
  const gap = base ? daysBetween(base.dates.at(-1), today) : Infinity;
  let b = null;
  let mode = "full";
  if (gap <= 25) {
    b = mergeBars(base, await yahooBars(sym, gap <= 4 ? "5d" : "1mo"));
    mode = b ? "inc" : "split";
  }
  if (!b) b = await yahooBars(sym, "2y");
  b = trimBars(b);
  if (b.c.length < 60) throw new Error("histórico curto");
  await writeFile(join(HIST_DIR, histFile(sym)), toCsv(b));
  return { mode, last: b.dates.at(-1), n: b.c.length, currency: b.currency ?? null };
}

async function main() {
  await mkdir(HIST_DIR, { recursive: true });
  const args = process.argv.slice(2).map((s) => s.toUpperCase());
  const syms = args.length ? args : await universe();
  const today = new Date().toISOString().slice(0, 10);
  const idxPath = join(HIST_DIR, "_index.json");
  const idx = await readJson(idxPath, { symbols: {} });
  const t0 = Date.now();
  const res = await pool(syms, PAR, (s) => updateOne(s, today));
  const count = { inc: 0, full: 0, split: 0, err: 0 };
  const errors = [];
  res.forEach((r, i) => {
    if (r?.error) {
      count.err++;
      errors.push(`${syms[i]}: ${r.error}`);
    } else {
      count[r.mode]++;
      idx.symbols[syms[i]] = { last: r.last, n: r.n, currency: r.currency };
    }
  });
  idx.updated_at = new Date().toISOString();
  idx.n = Object.keys(idx.symbols).length;
  idx.errors = errors.slice(0, 50);
  await writeFile(idxPath, `${JSON.stringify(idx, null, 1)}\n`);
  console.log(`${syms.length} ativos em ${((Date.now() - t0) / 1000).toFixed(0)} s · incremental ${count.inc} · completo ${count.full} · desdobramento ${count.split} · erro ${count.err}`); // prettier-ignore
  errors.slice(0, 10).forEach((e) => console.log(`  ${e}`));
  if (count.err > syms.length / 2) process.exit(1); // Yahoo fora: não commita base pela metade
}

if (import.meta.url === `file://${process.argv[1]}`) await main();
