// Vercel Function: sugestões para a busca de ativo (lupa do cabeçalho).
// GET /api/search?q=apple -> { q, items: [{ symbol, name, exch, type, isin }] }
// Fontes: busca do Yahoo Finance (ações, ETFs, fundos, OTC, futuros, índices, moedas, cripto) e, para identificadores
// (ISIN, CUSIP, FIGI) ou quando o Yahoo acha pouco, a OpenFIGI (títulos públicos e privados, fundos não listados).
// Cache de 1 dia na borda.
import { httpFetch } from "./_http.js";
import { idKind, searchFigi } from "./instrument.js";

const TYPES = {
  EQUITY: "Ação",
  ETF: "ETF",
  INDEX: "Índice",
  MUTUALFUND: "Fundo",
  CRYPTOCURRENCY: "Cripto",
  CURRENCY: "Moeda",
  FUTURE: "Futuro",
};
export const ISIN_RE = /^[A-Z]{2}[A-Z0-9]{9}\d$/;

/** Resposta da busca do Yahoo -> sugestões (só tipos negociáveis, sem repetir símbolo). */
export function parseSearch(json, q = "") {
  const Q = String(q).toUpperCase();
  const isin = ISIN_RE.test(Q) && !Q.startsWith("BBG") ? Q : null;
  const seen = new Set();
  return (json?.quotes ?? [])
    .filter((x) => x?.symbol && TYPES[x.quoteType] && !seen.has(x.symbol) && seen.add(x.symbol))
    .slice(0, 20)
    .map((x) => ({
      symbol: x.symbol,
      name: x.longname || x.shortname || x.symbol,
      exch: x.exchDisp || x.exchange || null,
      type:
        x.quoteType === "EQUITY" && /^(PNK|OQB|OQX|OBB|OTC)$/.test(x.exchange ?? "")
          ? "Ação (OTC)"
          : TYPES[x.quoteType],
      isin,
    }));
}

export async function searchYahoo(q) {
  const url = `https://query2.finance.yahoo.com/v1/finance/search?q=${encodeURIComponent(q)}&quotesCount=25&newsCount=0&listsCount=0`;
  return httpFetch(url, { timeout: 6000, headers: { Accept: "application/json" } }, async (r) => {
    if (!r.ok) throw new Error(`busca HTTP ${r.status}`);
    return parseSearch(await r.json(), q);
  });
}

/** Junta Yahoo e OpenFIGI: o que o Yahoo cota vem primeiro (tem preço e gráfico); a OpenFIGI completa. */
export function mergeSources(yahoo, figi) {
  const have = new Set(yahoo.map((x) => x.symbol.toUpperCase()));
  const extra = figi.filter(
    (x) => !(x.ticker && have.has(x.ticker.toUpperCase()) && /Ação|ETF/.test(x.type)),
  );
  return [...yahoo, ...extra].slice(0, 20);
}

export async function searchAll(q) {
  const id = idKind(q);
  const [y, f] = await Promise.allSettled([
    searchYahoo(q),
    id ? searchFigi(q) : Promise.resolve(null),
  ]);
  let yahoo = y.status === "fulfilled" ? y.value : [];
  let figi = f.status === "fulfilled" && f.value ? f.value : [];
  // texto livre: só consulta a OpenFIGI quando o Yahoo acha pouco (limite de uso baixo sem chave)
  if (!id && yahoo.length < 3 && q.length >= 3) figi = await searchFigi(q).catch(() => []);
  if (y.status === "rejected" && f.status === "rejected") throw y.reason;
  if (id?.[0] === "ID_ISIN") yahoo = yahoo.map((x) => ({ ...x, isin: id[1] }));
  return mergeSources(yahoo, figi);
}

export default async function handler(req, res) {
  const q = String(new URL(req.url, "http://x").searchParams.get("q") ?? "").trim();
  if (!q || q.length > 40 || [...q].some((c) => c.charCodeAt(0) < 32)) {
    res.setHeader("Cache-Control", "no-store");
    return res.status(400).json({ error: "informe ?q=texto (até 40 caracteres)" });
  }
  try {
    const items = await searchAll(q);
    res.setHeader("Cache-Control", "public, s-maxage=86400, stale-while-revalidate=172800");
    res.status(200).json({ q, items });
  } catch (e) {
    res.setHeader("Cache-Control", "no-store");
    res.status(502).json({ q, items: [], error: String(e?.message ?? e) });
  }
}
