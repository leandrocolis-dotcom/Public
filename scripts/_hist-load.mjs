// Carrega a base histórica local data/hist/<ATIVO>.csv (2 anos, 1 linha por pregão; scripts/update-hist.mjs).
import { readFile, readdir } from "node:fs/promises";

const root = new URL("..", import.meta.url);

/** Um CSV → { dates, o, h, l, c, v } (linhas sem fechamento válido ficam de fora). */
export async function loadCsv(sym) {
  const txt = await readFile(new URL(`data/hist/${sym}.csv`, root), "utf8");
  const b = { dates: [], o: [], h: [], l: [], c: [], v: [] };
  for (const ln of txt.trim().split("\n").slice(1)) {
    const [d, o, h, l, c, v] = ln.split(",");
    const cc = +c;
    if (!(cc > 0)) continue;
    b.dates.push(d);
    b.o.push(+o || cc);
    b.h.push(+h || cc);
    b.l.push(+l || cc);
    b.c.push(cc);
    b.v.push(+v || 0);
  }
  return b;
}

/** Todos os ativos da base com pelo menos `min` pregões: { SYM: bars }. */
export async function loadHist({ min = 120 } = {}) {
  const files = (await readdir(new URL("data/hist/", root))).filter((f) => f.endsWith(".csv"));
  const bars = {};
  for (const f of files) {
    const s = f.slice(0, -4);
    try {
      const b = await loadCsv(s);
      if (b.c.length >= min) bars[s] = b;
    } catch {
      /* arquivo ruim: fica de fora */
    }
  }
  return bars;
}

/** Ativos que entram nos estudos de velocidade: ações e ETFs comuns (sem índices, futuros e volatilidade). */
export const speedUniverse = (bars, bench = "SPY") =>
  Object.keys(bars).filter((s) => s !== bench && !/^\^|=F$|^(VIX|UVIX|SVIX|VIXY|UVXY)$/.test(s));
