// Rolagem de futuros nos arquivos de preços: troca cada contínuo XX=F de data/flow.json e data/prices.json
// pela série do contrato vigente (assets/futures.js), completada para trás pelo contínuo ajustado na emenda.
// Resolve o contínuo do Yahoo que congela semanas depois do vencimento (CNH=F) e os saltos falsos na troca
// de contrato (HE=F, KC=F). Roda depois de scripts/update_prices.py (workflow update-prices.yml).
// Uso: node scripts/fut-adjust.mjs [--dry]   (falha de rede num contrato = mantém o contínuo daquele ativo)
import { readFileSync, writeFileSync } from "node:fs";
import { ASSETS } from "../assets/universe.js";
import { activeContract, rollHistory, rootOf } from "../assets/futures.js";
import { parseChart } from "../api/history.js";

const ROOT = new URL("..", import.meta.url).pathname;
const dry = process.argv.includes("--dry");

async function chart(sym) {
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(sym)}?range=2y&interval=1d`;
  for (let i = 0; i < 3; i++) {
    try {
      const r = await fetch(url, { headers: { "User-Agent": "Mozilla/5.0" }, signal: AbortSignal.timeout(20000) }); // prettier-ignore
      if (r.status === 404) return null; // contrato não listado no Yahoo
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const p = parseChart(await r.json());
      return p.close.length >= 20 ? p : null;
    } catch (e) {
      if (i === 2) throw e;
      await new Promise((res) => setTimeout(res, 2000 * (i + 1)));
    }
  }
  return null;
}

/**
 * Reescreve uma tabela { dates, [key]: { sym: série } } nas datas dela: série do contrato vigente onde houver,
 * contínuo ajustado antes. symOf: chave -> símbolo Yahoo. Devolve [{ key, fut, last }].
 */
export function adjustTable(table, key, symOf, contracts, today) {
  const done = [];
  for (const [code, s] of Object.entries(table[key])) {
    const sym = symOf(code);
    const c = rootOf(sym) && activeContract(sym, today);
    const k = c && contracts[c.sym];
    if (!k) continue;
    const r = rollHistory({ dates: table.dates, close: s }, k, c);
    const at = Object.fromEntries(r.dates.map((d, i) => [d, r.close[i]]));
    // nas datas da tabela; dia sem preço em nenhuma fonte repete o anterior (como o update_prices.py)
    let last = null;
    table[key][code] = table.dates.map((d, i) => (last = at[d] ?? last ?? s[i]));
    const kLast = k.dates.filter((d) => d <= table.dates.at(-1)).at(-1);
    if (table.last_real && kLast && !(table.last_real[code] >= kLast))
      table.last_real[code] = kLast;
    (table.fut ??= {})[code] = c.code;
    done.push({ key: code, fut: c.code });
  }
  return done;
}

async function main() {
  const today = new Date().toISOString().slice(0, 10);
  const flowPath = `${ROOT}data/flow.json`;
  const pricesPath = `${ROOT}data/prices.json`;
  const flow = JSON.parse(readFileSync(flowPath, "utf8"));
  const prices = JSON.parse(readFileSync(pricesPath, "utf8"));
  const pricesSym = (code) => ASSETS[code]?.yahoo ?? code;
  const syms = [...Object.keys(flow.close), ...Object.keys(prices.series).map(pricesSym)].filter(
    (s) => rootOf(s),
  );
  const need = [...new Set(syms.map((s) => activeContract(s, today).sym))];
  const contracts = {};
  const fails = [];
  for (let i = 0; i < need.length; i += 6) {
    const got = await Promise.allSettled(need.slice(i, i + 6).map(chart));
    got.forEach((g, j) => {
      if (g.status === "fulfilled" && g.value) contracts[need[i + j]] = g.value;
      else fails.push(`${need[i + j]}: ${g.reason?.message ?? "sem histórico"}`);
    });
  }
  const a = adjustTable(flow, "close", (s) => s, contracts, today);
  const b = adjustTable(prices, "series", pricesSym, contracts, today);
  // prices.json usa 4 casas; flow.json, 6 abaixo de 1
  for (const { key } of a) flow.close[key] = flow.close[key].map((v) => +v.toFixed(v < 1 ? 6 : 4));
  for (const { key } of b) prices.series[key] = prices.series[key].map((v) => +v.toFixed(4));
  console.log(
    `Rolagem de futuros: ${a.length} no fluxo, ${b.length} nos preços (${need.length} contratos)`,
  );
  if (fails.length) console.error(`Sem contrato (mantido o contínuo): ${fails.join("; ")}`);
  if (dry || !(a.length + b.length)) return;
  writeFileSync(flowPath, JSON.stringify(flow));
  writeFileSync(pricesPath, JSON.stringify(prices));
}

if (import.meta.url === `file://${process.argv[1]}`) await main();
