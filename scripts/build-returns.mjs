// Matriz compacta de retornos diários para a correlação com a carteira (Sinais de hoje → filtro "Correlação").
// Lê a base histórica (data/hist/*.csv) e grava data/returns.json: os últimos N pregões do SPY como eixo de datas e,
// por ativo, o retorno de cada dia em pontos-base inteiros (null quando falta o pregão). O app baixa uma vez só e
// calcula a correlação de cada ativo com a carteira do usuário no próprio aparelho (rápido: ~900 × 120 contas).
// Roda no GitHub Actions logo depois de update-hist.mjs. Uso: node scripts/build-returns.mjs [--days N]
import { readFile, writeFile } from "node:fs/promises";

const root = new URL("..", import.meta.url);
const DAYS = Number(process.argv[process.argv.indexOf("--days") + 1]) || 120;

/** Fechamentos por data de um CSV date,o,h,l,c,v. */
function closesOf(csv) {
  const m = new Map();
  for (const line of csv.split("\n").slice(1)) {
    const [d, , , , c] = line.split(",");
    const x = Number(c);
    if (d && x > 0) m.set(d, x);
  }
  return m;
}

/** Retornos em pontos-base no eixo `dates` (o 1º dia precisa do fechamento anterior: `prev`). */
function bpsOn(closes, dates, prev) {
  let last = closes.get(prev) ?? null;
  return dates.map((d) => {
    const c = closes.get(d);
    const r = c && last ? Math.round((c / last - 1) * 10000) : null;
    if (c) last = c;
    return r;
  });
}

const read = async (f) => readFile(new URL(f, root), "utf8");
const idx = JSON.parse(await read("data/hist/_index.json"));
const spy = closesOf(await read("data/hist/SPY.csv"));
const axis = [...spy.keys()].sort().slice(-(DAYS + 1));
const dates = axis.slice(1);
const r = {};
for (const sym of Object.keys(idx.symbols).sort()) {
  let csv;
  try {
    csv = await read(`data/hist/${sym}.csv`);
  } catch {
    continue;
  }
  const v = bpsOn(closesOf(csv), dates, axis[0]);
  if (v.filter((x) => x != null).length >= DAYS * 0.6) r[sym] = v;
}
await writeFile(
  new URL("data/returns.json", root),
  JSON.stringify({ updated_at: new Date().toISOString(), dates, r }),
);
console.log(`${Object.keys(r).length} ativos × ${dates.length} pregões → data/returns.json`);
