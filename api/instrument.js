// Vercel Function: identificação de qualquer instrumento por ISIN, CUSIP, FIGI ou texto, além do que o Yahoo cobre.
// GET /api/instrument?q=US912810TM09 -> { items: [...] }            (busca: usada pela api/search)
// GET /api/instrument?id=US912810TM09 -> { instrument, treasury }  (detalhe: página do ativo)
// Fontes: OpenFIGI (base aberta de identificadores da Bloomberg: títulos públicos e privados, fundos, OTC, futuros)
// e TreasuryDirect (leilões dos Treasuries: emissão, vencimento, cupom, taxa, preço, demanda). Cache de 1 dia.
import { httpFetch } from "./_http.js";

export const ISIN_RE = /^[A-Z]{2}[A-Z0-9]{9}\d$/;
export const CUSIP_RE = /^[0-9]{3}[A-Z0-9]{5}\d$/;
export const FIGI_RE = /^BBG[A-Z0-9]{9}$/;

const SECTOR_PT = { Govt: "Título público", Corp: "Título privado", Mtge: "Hipotecário", Muni: "Municipal", Equity: "Ação", Comdty: "Commodity", Curncy: "Moeda", Index: "Índice", "Pfd": "Preferencial", "M-Mkt": "Mercado monetário" }; // prettier-ignore

/** Tipo em português a partir de marketSector/securityType da OpenFIGI. */
export function figiType(x) {
  const t = `${x.securityType2 ?? ""} ${x.securityType ?? ""}`.toLowerCase();
  if (/mutual fund|open-end fund|closed-end fund|unit trust|sicav|fcp|hedge fund|fund of funds/.test(t)) return "Fundo";
  if (/etp|etf/.test(t)) return "ETF";
  if (/future/.test(t)) return "Futuro";
  if (/option/.test(t)) return "Opção";
  if (/warrant/.test(t)) return "Warrant";
  if (x.marketSector === "Govt") return "Título público";
  if (x.marketSector === "Corp" || x.marketSector === "Muni" || x.marketSector === "Mtge") return SECTOR_PT[x.marketSector];
  if (/common stock|adr|gdr|reit|preferred/.test(t)) return /pink|otc/i.test(x.exchCode ?? "") ? "Ação (OTC)" : "Ação";
  return SECTOR_PT[x.marketSector] ?? x.securityType ?? "Instrumento";
} // prettier-ignore

/** Itens da OpenFIGI -> sugestões (um por instrumento: agrupa listagens do mesmo papel pelo FIGI composto). */
export function parseFigi(list, { isin = null, cusip = null } = {}) {
  const seen = new Set();
  const out = [];
  for (const x of list ?? []) {
    const key = x.compositeFIGI || x.shareClassFIGI || x.figi;
    if (!x?.figi || seen.has(key)) continue;
    seen.add(key);
    out.push({
      symbol: `FIGI:${x.compositeFIGI || x.figi}`,
      name: x.name || x.securityDescription || x.ticker || x.figi,
      exch: x.exchCode || null,
      type: figiType(x),
      isin,
      cusip,
      figi: x.compositeFIGI || x.figi,
      ticker: x.ticker || null,
      desc: x.securityDescription || null,
      sector: x.marketSector || null,
      secType: x.securityType2 || x.securityType || null,
    });
  }
  return out.slice(0, 8);
}

/** Tipo de identificador do texto (ou null para busca livre). */
export function idKind(q) {
  const s = String(q ?? "")
    .trim()
    .toUpperCase();
  if (FIGI_RE.test(s)) return ["ID_BB_GLOBAL", s];
  if (ISIN_RE.test(s)) return ["ID_ISIN", s];
  if (CUSIP_RE.test(s)) return ["ID_CUSIP", s];
  return null;
}

/** CUSIP embutido no ISIN americano/canadense (US/CA + 9 + dígito). */
export const cusipOfIsin = (isin) => (/^(US|CA)/.test(isin ?? "") ? isin.slice(2, 11) : null);

const figiPost = (path, body) =>
  httpFetch(
    `https://api.openfigi.com/v3/${path}`,
    { method: "POST", timeout: 7000, headers: { "Content-Type": "application/json", Accept: "application/json" }, body: JSON.stringify(body) },
    async (r) => {
      if (!r.ok) throw new Error(`OpenFIGI HTTP ${r.status}`);
      return r.json();
    },
  ); // prettier-ignore

/** Busca na OpenFIGI: identificador exato (mapping) ou texto livre (search). */
export async function searchFigi(q) {
  const k = idKind(q);
  if (k) {
    const [j] = await figiPost("mapping", [{ idType: k[0], idValue: k[1] }]);
    const isin = k[0] === "ID_ISIN" ? k[1] : null;
    return parseFigi(j?.data, { isin, cusip: k[0] === "ID_CUSIP" ? k[1] : cusipOfIsin(isin) });
  }
  const j = await figiPost("search", { query: String(q).slice(0, 60) });
  return parseFigi(j?.data);
}

/** Leilões de um Treasury pelo CUSIP (mais recente primeiro) -> resumo. */
export function parseTreasury(list) {
  const a = (Array.isArray(list) ? list : []).filter((x) => x?.cusip);
  if (!a.length) return null;
  a.sort((x, y) => String(y.auctionDate).localeCompare(String(x.auctionDate)));
  const n = (v) => (v === "" || v == null || Number.isNaN(+v) ? null : +v);
  const d = (v) => (v ? String(v).slice(0, 10) : null);
  const f = a.at(-1); // primeira emissão
  return {
    cusip: f.cusip,
    type: f.securityType ?? null, // Bill, Note, Bond, TIPS, FRN, CMB
    term: f.securityTerm ?? null,
    tips: f.tips === "Yes" || /TIPS/i.test(f.type ?? ""),
    frn: f.floatingRate === "Yes",
    issueDate: d(f.issueDate),
    maturity: d(f.maturityDate),
    coupon: n(f.interestRate),
    firstPayment: d(f.firstInterestPaymentDate),
    frequency: f.interestPaymentFrequency ?? null,
    auctions: a.slice(0, 6).map((x) => ({
      date: d(x.auctionDate),
      reopening: x.reopening === "Yes",
      highYield: n(x.highYield) ?? n(x.highDiscountRate),
      price: n(x.pricePer100),
      bidToCover: n(x.bidToCoverRatio),
      accepted: n(x.totalAccepted ?? x.offeringAmount),
    })),
  };
}

export async function treasuryOf(cusip) {
  const url = `https://www.treasurydirect.gov/TA_WS/securities/search?cusip=${encodeURIComponent(cusip)}&format=json`;
  return httpFetch(url, { timeout: 7000, headers: { Accept: "application/json" } }, async (r) => {
    if (!r.ok) throw new Error(`TreasuryDirect HTTP ${r.status}`);
    return parseTreasury(await r.json());
  });
}

/** Detalhe de um identificador: FIGI + (se for Treasury) dados de leilão. */
export async function instrumentOf(id) {
  const s = String(id ?? "")
    .trim()
    .toUpperCase()
    .replace(/^FIGI:/, "");
  const k = idKind(s);
  if (!k) throw new Error("identificador inválido");
  const errors = [];
  const items = await searchFigi(s).catch((e) => (errors.push(e.message), []));
  const inst = items[0] ?? null;
  const cusip = k[0] === "ID_CUSIP" ? k[1] : cusipOfIsin(k[0] === "ID_ISIN" ? k[1] : null);
  const isTsy = cusip?.startsWith("912") || (inst?.sector === "Govt" && /^US|^T /.test(`${inst.isin ?? ""}${inst.ticker ?? ""}`)); // prettier-ignore
  const treasury = isTsy && cusip ? await treasuryOf(cusip).catch((e) => (errors.push(e.message), null)) : null; // prettier-ignore
  return { id: s, instrument: inst, listings: items.length, treasury, errors };
}

export default async function handler(req, res) {
  const sp = new URL(req.url, "http://x").searchParams;
  const q = String(sp.get("q") ?? "").trim();
  const id = String(sp.get("id") ?? "").trim();
  const bad = (x) => !x || x.length > 60 || [...x].some((c) => c.charCodeAt(0) < 32);
  try {
    if (id) {
      if (bad(id))
        throw Object.assign(new Error("informe ?id=ISIN, CUSIP ou FIGI"), { status: 400 });
      const out = await instrumentOf(id);
      res.setHeader("Cache-Control", out.instrument || out.treasury ? "public, s-maxage=86400, stale-while-revalidate=172800" : "no-store"); // prettier-ignore
      return res.status(out.instrument || out.treasury ? 200 : 404).json(out);
    }
    if (bad(q))
      throw Object.assign(new Error("informe ?q=texto ou ?id=identificador"), { status: 400 });
    const items = await searchFigi(q);
    res.setHeader("Cache-Control", "public, s-maxage=86400, stale-while-revalidate=172800");
    res.status(200).json({ q, items });
  } catch (e) {
    res.setHeader("Cache-Control", "no-store");
    res.status(e.status ?? 502).json({ error: String(e?.message ?? e), items: [] });
  }
}
