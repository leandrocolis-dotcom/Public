// Fundamentos trimestrais por data (point-in-time) das ações do S&P 500, do Yahoo (fundamentals-timeseries):
// LPA diluído e receita por trimestre (5 últimos) e por ano fiscal (4 anos). Grava data/fund-hist.json para o estudo de pesos (scripts/pillar-study.mjs).
// Incremental: só rebusca ativos com dado de mais de 20 dias. Uso: node scripts/fetch-fund-hist.mjs
import { readFile, writeFile } from "node:fs/promises";

const root = new URL("../", import.meta.url);
const read = async (p, d) => JSON.parse(await readFile(new URL(p, root), "utf8").catch(() => JSON.stringify(d))); // prettier-ignore
const quant = await read("data/quant.json", { rows: [] });
const out = await read("data/fund-hist.json", { updated_at: null, syms: {} });
// trimestral (5 últimos) e anual (4 anos): o suficiente para reconstruir valor, crescimento e rentabilidade por data
const BASE = ["DilutedEPS", "TotalRevenue", "NetIncome", "GrossProfit", "OperatingIncome", "EBITDA", "StockholdersEquity", "TotalAssets", "OperatingCashFlow", "FreeCashFlow", "DilutedAverageShares"]; // prettier-ignore
const SHORT = { DilutedEPS: "eps", TotalRevenue: "rev", NetIncome: "ni", GrossProfit: "gp", OperatingIncome: "oi", EBITDA: "ebitda", StockholdersEquity: "eq", TotalAssets: "ta", OperatingCashFlow: "ocf", FreeCashFlow: "fcf", DilutedAverageShares: "sh" }; // prettier-ignore
const TYPES = BASE.flatMap((b) => [`quarterly${b}`, `annual${b}`]);
const KEYS = Object.fromEntries(BASE.flatMap((b) => [[`quarterly${b}`, SHORT[b]], [`annual${b}`, `${SHORT[b]}A`]])); // prettier-ignore
const now = Math.floor(Date.now() / 1000);
const stale = (s) =>
  !out.syms[s]?.niA || !out.syms[s] || Date.now() - Date.parse(out.syms[s].at) > 20 * 864e5;
const syms = quant.rows.map((r) => r.sym).filter(stale);

async function one(sym) {
  const y = sym.replace(".", "-");
  const url = `https://query1.finance.yahoo.com/ws/fundamentals-timeseries/v1/finance/timeseries/${encodeURIComponent(y)}?type=${TYPES.join(",")}&period1=1500000000&period2=${now}`;
  for (let k = 0; k < 3; k++) {
    try {
      const r = await fetch(url, { headers: { "User-Agent": "Mozilla/5.0" } });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const j = await r.json();
      const rec = { at: new Date().toISOString() };
      for (const res of j.timeseries?.result ?? []) {
        const t = res.meta?.type?.[0];
        rec[KEYS[t]] = (res[t] ?? [])
          .filter(Boolean)
          .map((x) => [x.asOfDate, x.reportedValue?.raw ?? null]);
      }
      return rec;
    } catch {
      await new Promise((ok) => setTimeout(ok, 800 * (k + 1)));
    }
  }
  return null;
}

let done = 0;
let fail = 0;
const POOL = 6;
for (let i = 0; i < syms.length; i += POOL) {
  const part = syms.slice(i, i + POOL);
  const got = await Promise.all(part.map(one));
  part.forEach((s, k) => (got[k] ? ((out.syms[s] = got[k]), done++) : fail++));
}
out.updated_at = new Date().toISOString();
await writeFile(new URL("data/fund-hist.json", root), JSON.stringify(out));
console.log(
  `fundamentos: ${done} atualizados, ${fail} falharam, ${Object.keys(out.syms).length} no banco`,
);
