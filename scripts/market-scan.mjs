// Varredura do mercado (aba Oportunidades → Sinais de hoje → 🌐 Todas): depois do fechamento, roda a MESMA análise
// e Decisão do trader do app para o universo inteiro (S&P 500 do Quant + rótulos de setores + campeões, ~900 ativos)
// e grava data/market-scan.json, compacto. O app recalcula só a ação de agora e os níveis com o preço ao vivo.
// Roda no GitHub Actions (.github/workflows/market-scan.yml). Uso: node scripts/market-scan.mjs [--dry] [--max N]
import { readFile, writeFile } from "node:fs/promises";
import { analyzeAll } from "../api/analyze.js";
import { deadlineIn } from "../api/_http.js";
import { analyzeTicker } from "../assets/integrated.js";
import { traderDecision } from "../assets/decision.js";
import { mediumTerm } from "../assets/level-alerts.js";
import { signalsFor } from "../assets/signals.js";
import { computeSnapshot } from "../assets/engine.js";
import { SECTORS } from "../assets/sectors.js";
import { ratingOf } from "../assets/quant.js";

const root = new URL("..", import.meta.url);
const read = async (f, d) => {
  try {
    return JSON.parse(await readFile(new URL(f, root), "utf8"));
  } catch {
    return d;
  }
};
const arg = (k) => process.argv.includes(k);
const MAX = Number(process.argv[process.argv.indexOf("--max") + 1]) || 1200;
const LOT = 15;
const SYM_RE = /^[A-Z0-9][A-Z0-9.\-=^]{0,14}$/;

const prices = await read("data/prices.json");
const fundData = await read("data/fundamentals.json", null);
const quant = await read("data/quant.json", { rows: [] });
const champs = await read("data/champions.json", { members: [] });

// ── universo (o mesmo de assets/market.js) ──
const syms = [
  ...new Set([
    ...quant.rows.map((r) => r.sym),
    ...SECTORS.flatMap((s) => s.syms),
    ...champs.members.map((m) => m.s),
  ]),
]
  .filter((s) => SYM_RE.test(s))
  .sort()
  .slice(0, MAX);
console.log(`${syms.length} ativos no universo`);

// ── contexto de mercado (igual ao app) ──
const snap = computeSnapshot(prices, null);
const qmap = new Map(quant.rows.map((r) => [r.sym, r]));
const quantOf = (s) => (qmap.has(s) ? [qmap.get(s), ratingOf(qmap.get(s).score)?.label ?? null] : []); // prettier-ignore
const market = { regime: snap.regime, spy: prices.series.SPY, quantOf };
const spyPe = fundData?.etf?.SPY?.pe?.filter((x) => x > 0).at(-1) ?? 25;

// ── histórico + fundamentos (Yahoo, como a aba Análise), um lote por vez para não tomar 429 ──
const r2 = (x, d = 2) => (Number.isFinite(x) ? +x.toFixed(d) : null);
const rows = [];
const fails = [];
const deadline = deadlineIn(25 * 60_000);
for (let i = 0; i < syms.length; i += LOT) {
  const lot = syms.slice(i, i + LOT);
  let items = {};
  try {
    const j = await analyzeAll(lot, deadline);
    items = j.items;
  } catch (e) {
    fails.push(`${lot[0]}…: ${e.message}`);
  }
  for (const s of lot) {
    const it = items[s];
    if (!it?.bars?.c?.length) continue;
    try {
      const r = analyzeTicker(s, it, { spyPe });
      const dec = traderDecision(r, market, { gate: true });
      const f = dec?.final;
      if (!f) continue;
      const t = r.pillars?.tech ?? {};
      const lv = t.levels ?? {};
      const mt = mediumTerm(dec);
      const sigs = signalsFor(it.bars.c, { sym: s }).map((g) => [g.kind, g.title]);
      rows.push({
        s,
        n: r.name ?? it.fund?.name ?? s,
        d: it.bars.dates.at(-1),
        p: r2(r.price, 4),
        sc: r2(f.score, 3),
        st: f.step.key,
        cf: f.conf,
        ...(f.conflict ? { cx: 1 } : {}),
        ...(f.gated ? { gt: 1 } : {}),
        ...(f.partGated ? { pg: 1 } : {}),
        sub: Object.fromEntries(Object.entries(dec.subs).filter(([, x]) => x).map(([k, x]) => [k, [r2(x.dir, 3), x.conf]])), // prettier-ignore
        lv: {
          s: (lv.supports ?? [])
            .map((x) => r2(x.price, 4))
            .filter((x) => x < r.price)
            .sort((a, b) => b - a)
            .slice(0, 4),
          r: (lv.resistances ?? [])
            .map((x) => r2(x.price, 4))
            .filter((x) => x > r.price)
            .sort((a, b) => a - b)
            .slice(0, 4),
        },
        atr: r2(t.atr, 4),
        ...(t.plan?.dir > 0 && Number.isFinite(t.plan.stop) ? { stop: r2(t.plan.stop, 4) } : {}),
        mt: r2(mt.dir, 3),
        ...(sigs.length ? { sig: sigs } : {}),
      });
    } catch (e) {
      fails.push(`${s}: ${e.message}`);
    }
  }
  process.stdout.write(`\r${Math.min(i + LOT, syms.length)}/${syms.length} · ${rows.length} ok`);
  await new Promise((ok) => setTimeout(ok, 400));
}
console.log(`\n${rows.length} analisados · ${fails.length} falhas${fails.length ? ` (${fails.slice(0, 5).join(" | ")})` : ""}`); // prettier-ignore

const out = {
  updated_at: new Date().toISOString(),
  date:
    rows
      .map((r) => r.d)
      .sort()
      .at(-1) ?? null, // pregão mais recente das barras analisadas
  n: rows.length,
  universe: syms.length,
  rows,
};
if (rows.length < syms.length * 0.5) {
  console.log("Menos da metade analisada: não publica (mantém o arquivo anterior).");
  process.exit(arg("--dry") ? 0 : 1);
}
if (arg("--dry")) console.log(JSON.stringify(rows.slice(0, 2)));
else {
  await writeFile(new URL("data/market-scan.json", root), JSON.stringify(out));
  console.log("data/market-scan.json gravado");
}
