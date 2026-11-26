// J5 do docs/PLANO-PENDULO.md: diário fora da amostra do pêndulo por janela e do pano de fundo (modo sombra).
// Roda no cron diário (train-model.yml) depois do fechamento: lê data/flow.json, grava a leitura do dia em
// data/backdrop-journal.json (uma linha por pregão; refazer no mesmo dia substitui) e, quando a linha completa 63
// pregões, anota se houve queda > 10% do SPY (mínimo dos 63 pregões seguintes ÷ fechamento do dia − 1 ≤ −10%).
// Uso do diário em avisos, carteira ou decisão só por ordem do usuário (≥ 2 meses de dados).
// Material educacional; não é recomendação de investimento.
import { readFile, writeFile } from "node:fs/promises";
import { regime } from "../assets/dash.js";
import { backdrop } from "../assets/backdrop.js";

const FILE = new URL("../data/backdrop-journal.json", import.meta.url);
const flow = JSON.parse(await readFile(new URL("../data/flow.json", import.meta.url), "utf8"));
let j = { entries: [] };
try {
  j = JSON.parse(await readFile(FILE, "utf8"));
} catch {
  /* primeiro dia */
}

/** Linha do diário para o último pregão de `flow` (puro sobre os dados lidos). */
export function journalRow(fl) {
  const date = fl.dates.at(-1);
  const notes = {};
  for (const [k, h] of [
    ["1d", 1],
    ["5d", 5],
    ["1m", 21],
    ["3m", 63],
  ]) {
    try {
      const s = regime(fl.close, h)?.strength?.score;
      notes[k] = Number.isFinite(s) ? s : null;
    } catch {
      notes[k] = null;
    }
  }
  const bd = backdrop(fl.close);
  return {
    date,
    spy: fl.close.SPY.at(-1),
    notes,
    backdrop: bd ? { state: bd.state, trend: bd.trend, credit: bd.credit } : null,
    drop63: null,
  };
}

const row = journalRow(flow);
const entries = (j.entries ?? []).filter((e) => e.date !== row.date);
entries.push(row);
entries.sort((a, b) => a.date.localeCompare(b.date));
// resultado: queda > 10% nos 63 pregões seguintes (com os fechamentos de flow.json)
const idx = new Map(flow.dates.map((d, i) => [d, i]));
for (const e of entries) {
  if (e.drop63 !== null) continue;
  const i = idx.get(e.date);
  if (i === undefined || i + 63 >= flow.dates.length) continue;
  const fut = flow.close.SPY.slice(i + 1, i + 64);
  e.drop63 = Math.min(...fut) / e.spy - 1 <= -0.1 ? 1 : 0;
}
const done = entries.filter((e) => e.drop63 !== null);
const byState = Object.fromEntries(
  ["favorável", "atenção", "defesa"].map((s) => {
    const xs = done.filter((e) => e.backdrop?.state === s);
    return [s, { dias: xs.length, quedas: xs.reduce((a, e) => a + e.drop63, 0) }];
  }),
);
const out = {
  geradoEm: new Date().toISOString(),
  inicio: entries[0]?.date ?? null,
  dias: entries.length,
  comResultado: done.length,
  porEstado: byState,
  entries,
};
await writeFile(FILE, JSON.stringify(out, null, 1));
console.log(`diário do pêndulo: ${row.date} · notas ${JSON.stringify(row.notes)} · pano de fundo ${row.backdrop?.state ?? "—"} · ${entries.length} dias`); // prettier-ignore
