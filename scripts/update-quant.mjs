// Quant Aberto: coleta diária (depois do fechamento) das ações do S&P 500 e cálculo das notas.
// Grava data/quant.json (notas do dia + carteira Top 20) e, na primeira execução de cada mês, uma foto em
// data/quant-journal.json (diário fora da amostra). Roda no GitHub Actions (.github/workflows/update-quant.yml).
// Fontes: lista e setor GICS da Wikipédia; fundamentos, estimativas e preços semanais do Yahoo (1 resumo + 1
// gráfico por ação). Se a coleta falhar em mais de 20% do universo, mantém os arquivos anteriores.
// Uso: node scripts/update-quant.mjs [--dry] [--limit N]
import { readFile, writeFile } from "node:fs/promises";
import { pool, summary, universe, weekly } from "./lib/quant-source.mjs";
import {
  MODEL_VERSION,
  deriveMetrics,
  healthLabel,
  scoreUniverse,
  topPicks,
} from "../assets/quant.js";

const root = new URL("..", import.meta.url);
const read = async (f, d) => {
  try {
    return JSON.parse(await readFile(new URL(f, root), "utf8"));
  } catch {
    return d;
  }
};
const DRY = process.argv.includes("--dry");
const li = process.argv.indexOf("--limit");
const LIMIT = li > 0 ? Number(process.argv[li + 1]) : Infinity;
const CONC = 6;

const r4 = (x) => (Number.isFinite(x) ? Math.round(x * 1e4) / 1e4 : null);

const prev = await read("data/quant.json", null);
const journal = await read("data/quant-journal.json", { months: [] });
const t0 = Date.now();
const { list: full, source } = await universe(prev);
const list = full.slice(0, LIMIT);
const errors = [];
const got = await pool(list, CONC, async (u) => {
  const [s, w] = await Promise.allSettled([summary(u.sym), weekly(u.sym)]);
  if (s.status === "rejected") throw new Error(s.reason.message);
  return { s: s.value, w: w.status === "fulfilled" ? w.value : [] };
});
const rows = [];
list.forEach((u, i) => {
  const x = got[i];
  if (!x || x.error) return errors.push(`${u.sym}: ${x?.error ?? "?"}`);
  rows.push({ ...u, raw: x.s, m: deriveMetrics(x.s, x.w) });
});
console.log(`coletadas ${rows.length}/${list.length} em ${Math.round((Date.now() - t0) / 1000)} s (${source})`); // prettier-ignore
if (rows.length < 0.8 * list.length) {
  console.error(`coleta incompleta: ${errors.slice(0, 10).join(" · ")}`);
  process.exit(DRY ? 0 : 1);
}

const scored = scoreUniverse(rows);
const month = new Date().toISOString().slice(0, 7);
const lastSnap = journal.months.at(-1);
const prevTop = lastSnap?.top ?? prev?.top ?? [];
const today = new Date().toISOString().slice(0, 10);
// a carteira só troca na foto do mês; no meio do mês mostra a do mês corrente. Modelo novo = foto nova (no mesmo
// dia, substitui a anterior); o diário só compara fotos da mesma versão (evalJournal).
const sameVersion = (lastSnap?.v ?? 1) === MODEL_VERSION;
const newMonth = !lastSnap || lastSnap.d.slice(0, 7) !== month || !sameVersion;
if (newMonth && lastSnap && !sameVersion && lastSnap.d === today) journal.months.pop();
const top = newMonth ? topPicks(scored, { prev: sameVersion ? prevTop : [] }) : lastSnap.top;
const out = {
  updated_at: new Date().toISOString(),
  source,
  n: scored.length,
  errors: errors.slice(0, 30),
  top,
  topSince: newMonth ? today : lastSnap.d,
  version: MODEL_VERSION,
  rows: scored.map((r) => ({
    sym: r.sym,
    name: r.name,
    sector: r.sector,
    sub: r.sub,
    price: r.raw.price,
    mcap: r.raw.mcap,
    analysts: r.raw.analysts,
    target: r.raw.target,
    beta: r4(r.raw.beta),
    f: Object.fromEntries(Object.entries(r.f).map(([k, v]) => [k, Number.isFinite(v) ? Math.round(v) : null])), // prettier-ignore
    g: r.g,
    score: r.score,
    capped: r.capped,
    health: r.health,
  })),
};

if (newMonth) {
  const spy = await weekly("SPY").catch(() => null);
  journal.months.push({
    d: today,
    v: MODEL_VERSION,
    top,
    spy: spy?.at(-1) ?? null,
    s: Object.fromEntries(scored.filter((r) => r.score !== null).map((r) => [r.sym, r.score])),
    px: Object.fromEntries(scored.map((r) => [r.sym, r.raw.price]).filter(([, p]) => Number.isFinite(p))), // prettier-ignore
  });
}

const counts = {};
for (const r of scored) counts[r.rating?.label ?? "Sem nota"] = (counts[r.rating?.label ?? "Sem nota"] ?? 0) + 1; // prettier-ignore
console.log("classificações:", counts);
console.log("Top 20:", top.map((s) => {
  const r = scored.find((x) => x.sym === s);
  return `${s} ${r.score} (${r.sector}, saúde ${healthLabel(r.health)})`;
}).join(" · ")); // prettier-ignore
if (DRY) process.exit(0);
await writeFile(new URL("data/quant.json", root), JSON.stringify(out));
if (newMonth) await writeFile(new URL("data/quant-journal.json", root), JSON.stringify(journal));
console.log(newMonth ? `foto do mês ${month} gravada no diário` : "diário: mês já registrado");
