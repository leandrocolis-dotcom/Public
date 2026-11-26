// Base histórica no próprio repositório: data/hist/<ATIVO>.csv, uma linha por pregão ("data,o,h,l,c,v").
// Atualizada todo dia por scripts/update-hist.mjs (GitHub Actions). A api/analyze lê daqui e só pede ao Yahoo
// os últimos dias. CSV com uma linha por dia: o git guarda só a diferença (a linha nova), o repositório não incha.
import { readFileSync } from "node:fs";
import { join } from "node:path";

export const HIST_DIR = join(process.cwd(), "data", "hist");
export const KEEP_DAYS = 2 * 365 + 10; // 2 anos (mesmo que o range=2y do Yahoo) + folga
export const SPLIT_TOL = 0.02; // fechamento de um mesmo dia diferente em mais de 2%: desdobramento/ajuste, rebaixar tudo

/** Nome do arquivo de um ativo (^ não é amigável em URL/arquivo). */
export const histFile = (sym) => `${String(sym).toUpperCase().replace(/\^/g, "_")}.csv`;

const r4 = (x) => Math.round(x * 1e4) / 1e4;

/** Barras { dates, o, h, l, c, v } -> CSV (cabeçalho + uma linha por pregão). */
export function toCsv(b) {
  const lines = ["date,o,h,l,c,v"];
  for (let i = 0; i < b.dates.length; i++)
    lines.push(
      `${b.dates[i]},${r4(b.o[i])},${r4(b.h[i])},${r4(b.l[i])},${r4(b.c[i])},${Math.round(b.v[i] ?? 0)}`,
    );
  return `${lines.join("\n")}\n`;
}

/** CSV -> barras; linhas inválidas são ignoradas. null se vazio. */
export function parseCsv(txt) {
  const b = { dates: [], o: [], h: [], l: [], c: [], v: [] };
  for (const line of String(txt ?? "")
    .split(/\r?\n/)
    .slice(1)) {
    const [d, ...n] = line.split(",");
    const x = n.map(Number);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(d) || x.length < 5 || !x.slice(0, 4).every((y) => y > 0))
      continue;
    b.dates.push(d);
    b.o.push(x[0]);
    b.h.push(x[1]);
    b.l.push(x[2]);
    b.c.push(x[3]);
    b.v.push(x[4] || 0);
  }
  return b.c.length ? b : null;
}

/**
 * Junta a base com barras novas (as novas mandam nos dias repetidos: o pregão de hoje vai sendo corrigido).
 * Devolve null quando um dia em comum diverge mais que SPLIT_TOL: a base ficou velha (desdobramento) e precisa
 * ser baixada inteira de novo.
 */
export function mergeBars(base, fresh) {
  if (!base) return fresh;
  if (!fresh?.dates?.length) return base;
  const at = new Map(base.dates.map((d, i) => [d, i]));
  for (let j = 0; j < fresh.dates.length; j++) {
    const i = at.get(fresh.dates[j]);
    // só compara dias já fechados (o último da base pode ser um pregão em andamento)
    if (
      i !== undefined &&
      i < base.dates.length - 1 &&
      Math.abs(fresh.c[j] / base.c[i] - 1) > SPLIT_TOL
    )
      return null;
  }
  const first = fresh.dates[0];
  const keep = base.dates.findIndex((d) => d >= first);
  const cut = keep < 0 ? base.dates.length : keep;
  const out = {};
  for (const k of ["dates", "o", "h", "l", "c", "v"])
    out[k] = [...base[k].slice(0, cut), ...fresh[k]];
  if (fresh.currency ?? base.currency) out.currency = fresh.currency ?? base.currency;
  return out;
}

/** Corta para os últimos KEEP_DAYS dias corridos até `ref` (AAAA-MM-DD). */
export function trimBars(b, ref = b?.dates?.at(-1)) {
  if (!b || !ref) return b;
  const from = new Date(Date.parse(ref) - KEEP_DAYS * 864e5).toISOString().slice(0, 10);
  const i = b.dates.findIndex((d) => d >= from);
  if (i <= 0) return b;
  const out = { ...b };
  for (const k of ["dates", "o", "h", "l", "c", "v"]) out[k] = b[k].slice(i);
  return out;
}

/** Dias corridos entre duas datas AAAA-MM-DD. */
export const daysBetween = (a, b) => Math.round((Date.parse(b) - Date.parse(a)) / 864e5);

/** Lê a base de um ativo (null se não existe). Síncrono e barato: arquivo local de poucos KB. */
export function readHist(sym, dir = HIST_DIR) {
  try {
    return parseCsv(readFileSync(join(dir, histFile(sym)), "utf8"));
  } catch {
    return null;
  }
}
