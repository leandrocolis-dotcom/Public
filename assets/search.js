// Busca de ativo: ranqueamento local (instantâneo) das sugestões, antes da resposta da api/search.

/** Minúsculas e sem acento. */
export const norm = (s) =>
  String(s ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .trim();

/** Pontua um item ({ symbol, name }) para o texto q: ticker exato > prefixo do ticker > prefixo de palavra do nome > trecho. */
export function scoreItem(q, it) {
  const s = norm(it.symbol);
  const n = norm(it.name);
  if (!q) return 0;
  if (s === q) return 100;
  if (s.startsWith(q)) return 80 - Math.min(20, s.length - q.length);
  if (n.startsWith(q)) return 60;
  if (n.split(/[\s\-/().,&]+/).some((w) => w.startsWith(q))) return 50;
  if (s.includes(q)) return 30;
  if (q.length >= 3 && n.includes(q)) return 20;
  return 0;
}

/** As melhores sugestões locais para q (sem repetir símbolo). */
export function rankLocal(q, universe, max = 8) {
  const k = norm(q);
  if (!k) return [];
  const seen = new Set();
  return universe
    .map((it) => ({ it, sc: scoreItem(k, it) }))
    .filter((x) => x.sc > 0)
    .sort((a, b) => b.sc - a.sc || a.it.symbol.length - b.it.symbol.length)
    .map((x) => x.it)
    .filter((it) => !seen.has(it.symbol) && seen.add(it.symbol))
    .slice(0, max);
}

/** Junta duas listas: a primeira na frente, a segunda completa (sem repetir) e preenche dados faltantes, até max. */
export function mergeSuggestions(local, remote, max = 10) {
  const seen = new Set(local.map((x) => x.symbol));
  const out = [...local];
  for (const r of remote ?? []) {
    const l = out.find((x) => x.symbol === r.symbol);
    if (l) {
      l.exch ??= r.exch;
      l.type ??= r.type;
      l.isin ??= r.isin;
    } else if (!seen.has(r.symbol)) {
      seen.add(r.symbol);
      out.push(r);
    }
  }
  return out.slice(0, max);
}

/** Trecho casado em destaque (texto já escapado por quem chama). */
export function markMatch(text, q, esc) {
  const t = String(text ?? "");
  const i = norm(t).indexOf(norm(q));
  if (!q || i < 0) return esc(t);
  return `${esc(t.slice(0, i))}<mark>${esc(t.slice(i, i + q.length))}</mark>${esc(t.slice(i + q.length))}`;
}
