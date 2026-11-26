// Valida os arquivos gerados pelo cron ANTES de publicar (roda no GitHub Actions e no CI).
// Erro (✗) interrompe o commit: dado quebrado não chega ao site. Alerta (!) só é informado.
// Uso: node scripts/verify-data.mjs [--today AAAA-MM-DD]
import { readFile } from "node:fs/promises";
import { checkBase } from "../assets/checks.js";
import { computeSnapshot, validatePrices } from "../assets/engine.js";
import { checkEngine } from "../assets/checks.js";
import { checkFundamentals } from "../assets/fa.js";

const root = new URL("..", import.meta.url);
const read = async (f) => JSON.parse(await readFile(new URL(f, root), "utf8"));
const arg = process.argv.indexOf("--today");
const today = arg > 0 ? process.argv[arg + 1] : null;

const items = [];
const prices = await read("data/prices.json");
const errs = validatePrices(prices);
items.push(
  errs.length
    ? { group: "prices.json", label: "Formato", level: "bad", detail: errs.slice(0, 5).join("; ") }
    : { group: "prices.json", label: "Formato", level: "ok", detail: "ok" },
);
items.push(...checkBase(prices, { today }));
if (!errs.length) items.push(...checkEngine(computeSnapshot(prices, null), prices));

// flow.json: mesmas datas para todas as séries, números positivos
try {
  const flow = await read("data/flow.json");
  const n = flow.dates?.length ?? 0;
  const bad = Object.entries(flow.close ?? {}).filter(
    ([, s]) => s.length !== n || s.some((v) => !(typeof v === "number" && Number.isFinite(v))),
  );
  const ord = flow.dates.every((d, i) => !i || d > flow.dates[i - 1]);
  items.push({
    group: "flow.json",
    label: "Séries do mapa de fluxo",
    level: bad.length || !ord || n < 70 ? "bad" : "ok",
    detail: `${Object.keys(flow.close ?? {}).length} séries, ${n} pregões${
      bad.length
        ? `; inválidas: ${bad
            .slice(0, 5)
            .map(([k]) => k)
            .join(", ")}`
        : ""
    }${ord ? "" : "; datas fora de ordem"}`,
  });
} catch (e) {
  items.push({ group: "flow.json", label: "Leitura", level: "bad", detail: e.message });
}

// Câmbio alinhado ao calendário: o spot (=X) tem de andar junto com o futuro da CME NO MESMO DIA.
// Pega a regressão do bug de datas do Yahoo (moedas um pregão atrasadas).
try {
  const flow = await read("data/flow.json");
  const rets = (s) => s.slice(1).map((v, i) => v / s[i] - 1);
  const corr = (a, b) => {
    const m = (x) => x.reduce((p, q) => p + q, 0) / x.length;
    const ma = m(a), mb = m(b); // prettier-ignore
    let n = 0, da = 0, db = 0; // prettier-ignore
    a.forEach(
      (x, i) => ((n += (x - ma) * (b[i] - mb)), (da += (x - ma) ** 2), (db += (b[i] - mb) ** 2)),
    );
    return n / Math.sqrt(da * db);
  };
  const out = [];
  for (const [spot, fut, sg] of [
    ["EURUSD=X", "6E=F", 1],
    ["JPY=X", "6J=F", -1],
    ["BRL=X", "6L=F", -1],
  ]) {
    if (!flow.close[spot] || !flow.close[fut]) continue;
    const a = rets(flow.close[spot]).slice(-120);
    const b = rets(flow.close[fut])
      .slice(-120)
      .map((x) => sg * x);
    const same = corr(a, b);
    const lag = corr(a.slice(1), b.slice(0, -1));
    out.push({ spot, same, lag });
  }
  const bad = out.filter((x) => x.lag > x.same);
  items.push({
    group: "flow.json",
    label: "Câmbio alinhado às datas (spot × futuro CME)",
    level: bad.length ? "bad" : "ok",
    detail: out
      .map((x) => `${x.spot} mesmo dia ${x.same.toFixed(2)} / defasado ${x.lag.toFixed(2)}`)
      .join("; "),
  });
} catch (e) {
  items.push({
    group: "flow.json",
    label: "Câmbio alinhado às datas",
    level: "warn",
    detail: e.message,
  });
}

// fundamentals.json (aba Valor): opcional, só alertas
try {
  items.push(...checkFundamentals(await read("data/fundamentals.json"), today));
} catch (e) {
  items.push({ group: "fundamentals.json", label: "Leitura", level: "warn", detail: e.message });
}

const icon = { ok: "✓", warn: "!", bad: "✗" };
for (const i of items) console.log(`${icon[i.level]} [${i.group}] ${i.label}: ${i.detail}`);
const bad = items.filter((i) => i.level === "bad").length;
console.log(`\n${items.length - bad} ok/alerta, ${bad} erro(s).`);
process.exit(bad ? 1 : 0);
