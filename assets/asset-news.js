// Notícia por ativo no Painel: um "!" na linha do ativo que se moveu e tem manchete do dia que o cita.
// Toque no "!" abre o resumo das manchetes, para entender a variação. Manchetes de outro dia somem sozinhas.
import { ptSum, ptTitle } from "./translate.js";
import { decSep, esc } from "./format.js";
import { marketScore } from "./news.js";

/** Palavras que ligam a manchete a cada ativo do Painel (ticker não basta: índices e futuros têm nome). */
export const ASSET_WORDS = {
  "^GSPC": ["S&P 500", "S&P", "Wall Street", "Wall St", "US stocks", "U.S. stocks"],
  "^NDX": ["Nasdaq", "tech stocks", "megacap", "Magnificent Seven"],
  "^DJI": ["Dow", "Dow Jones", "blue chips"],
  "^RUT": ["Russell 2000", "small caps", "small-cap", "small-caps"],
  "ES=F": ["stock futures", "S&P futures", "US futures"],
  "NQ=F": ["Nasdaq futures"],
  "^IRX": ["T-bills", "Treasury bills"],
  "^FVX": ["Treasury yields", "5-year"],
  "^TNX": ["Treasury yields", "Treasuries", "bond yields", "10-year", "Fed", "Powell", "FOMC", "CPI", "payrolls", "jobs report"],
  "^TYX": ["30-year", "long bond"],
  TLT: ["Treasuries", "long bond", "bond market"],
  "^STOXX50E": ["European stocks", "Europe's stocks", "Euro Stoxx", "STOXX"],
  "^STOXX": ["European stocks", "STOXX 600", "Stoxx 600"],
  "^GDAXI": ["DAX", "German stocks"],
  "^FTSE": ["FTSE", "London stocks", "UK stocks", "British stocks"],
  "^FCHI": ["CAC", "French stocks"],
  "FTSEMIB.MI": ["Italian stocks"],
  "^IBEX": ["Spanish stocks", "IBEX"],
  "^N225": ["Nikkei", "Japanese stocks", "Tokyo stocks", "Japan's stocks"],
  "^HSI": ["Hang Seng", "Hong Kong stocks"],
  "000001.SS": ["Shanghai", "China stocks", "Chinese stocks", "CSI 300"],
  "^KS11": ["Kospi", "Korean stocks"],
  "^TWII": ["Taiwan stocks", "Taiex", "TSMC"],
  "^NSEI": ["Nifty", "Indian stocks", "Sensex"],
  "^AXJO": ["ASX", "Australian stocks"],
  "^BVSP": ["Ibovespa", "bolsa brasileira", "B3"],
  // Mercado › Local: maiores ações da B3 pelo nome da empresa (manchetes em português)
  "PETR4.SA": ["Petrobras"], "VALE3.SA": ["Vale"], "ITUB4.SA": ["Itaú", "Itaú Unibanco"], "BBDC4.SA": ["Bradesco"],
  "BBAS3.SA": ["Banco do Brasil"], "SANB11.SA": ["Santander Brasil"], "BPAC11.SA": ["BTG Pactual"], "B3SA3.SA": ["B3"],
  "ABEV3.SA": ["Ambev"], "WEGE3.SA": ["WEG"], "SUZB3.SA": ["Suzano"], "KLBN11.SA": ["Klabin"], "PRIO3.SA": ["PRIO", "PetroRio"],
  "VBBR3.SA": ["Vibra"], "UGPA3.SA": ["Ultrapar"], "GGBR4.SA": ["Gerdau"], "CSNA3.SA": ["CSN"], "USIM5.SA": ["Usiminas"],
  "MGLU3.SA": ["Magazine Luiza", "Magalu"], "LREN3.SA": ["Renner"], "RENT3.SA": ["Localiza"], "AZZA3.SA": ["Azzas"],
  "ASAI3.SA": ["Assaí"], "BEEF3.SA": ["Minerva"], "RDOR3.SA": ["Rede D'Or"], "HAPV3.SA": ["Hapvida"], "RADL3.SA": ["Raia Drogasil", "RD Saúde"],
  "EQTL3.SA": ["Equatorial"], "CMIG4.SA": ["Cemig"], "SBSP3.SA": ["Sabesp"], "EGIE3.SA": ["Engie Brasil"], "CPFE3.SA": ["CPFL"],
  "CYRE3.SA": ["Cyrela"], "MRVE3.SA": ["MRV"], "RAIL3.SA": ["Rumo"], "MOTV3.SA": ["Motiva"], "VIVT3.SA": ["Vivo", "Telefônica Brasil"],
  "TIMS3.SA": ["TIM Brasil"], "TOTS3.SA": ["Totvs"], "HYPE3.SA": ["Hypera"], "SLCE3.SA": ["SLC Agrícola"],
  "IRFM11.SA": ["juros futuros", "DI futuro", "curva de juros"], "LFTS11.SA": ["Selic", "Copom"],
  EWZ: ["Ibovespa", "Brazilian stocks", "Brazil's stocks", "Petrobras", "Vale"],
  "^MXX": ["Mexican stocks", "peso"],
  "^GSPTSE": ["TSX", "Canadian stocks"],
  "^MERV": ["Merval", "Milei"],
  "DX-Y.NYB": ["dollar", "greenback", "dólar"],
  "EURUSD=X": ["euro", "ECB", "Lagarde"],
  "JPY=X": ["yen", "BOJ", "Bank of Japan"],
  "GBPUSD=X": ["sterling", "pound", "Bank of England", "BoE"],
  "BRL=X": ["real", "câmbio", "dólar"],
  "MXN=X": ["peso"],
  "CNY=X": ["yuan", "PBOC", "renminbi"],
  "CL=F": ["oil", "crude", "WTI", "OPEC", "petróleo"],
  "BZ=F": ["Brent", "oil", "crude", "OPEC", "petróleo"],
  "NG=F": ["natural gas", "LNG"],
  "GC=F": ["gold", "bullion", "ouro"],
  "SI=F": ["silver", "prata"],
  "HG=F": ["copper", "cobre"],
  "ZS=F": ["soybean", "soybeans", "soja"],
  "ZC=F": ["corn", "milho"],
  "KC=F": ["coffee", "café"],
  HYG: ["junk bonds", "high-yield", "high yield", "credit spreads", "private credit"],
  LQD: ["corporate bonds", "investment-grade", "credit spreads"],
  EMB: ["emerging-market bonds", "emerging markets debt"],
  "^VIX": ["volatility", "VIX", "selloff", "sell-off", "rout"],
  "^MOVE": ["bond volatility", "MOVE index"],
  "BTC-USD": ["bitcoin", "crypto", "BTC"],
  "ETH-USD": ["ether", "ethereum"],
  "SOL-USD": ["solana"],
  "XRP-USD": ["XRP", "Ripple"],
  IBIT: ["bitcoin ETF", "bitcoin"],
  XLK: ["tech stocks", "technology stocks", "Nvidia", "Apple", "Microsoft"],
  XLC: ["Alphabet", "Meta", "Netflix", "media stocks"],
  XLY: ["Amazon", "Tesla", "retailers", "consumer spending"],
  XLF: ["banks", "bank stocks", "JPMorgan", "Goldman"],
  XLI: ["industrials", "Boeing", "Caterpillar"],
  XLV: ["healthcare", "drugmakers", "pharma", "biotech"],
  XLE: ["energy stocks", "Exxon", "Chevron", "oil"],
  XLB: ["materials", "miners", "chemicals"],
  XLP: ["consumer staples", "Walmart", "Procter"],
  XLU: ["utilities"],
  XLRE: ["real estate", "REITs", "mortgage rates"],
}; // prettier-ignore

const CASE = new Set(["Vale", "Dow", "Fed", "CPI", "WTI", "OPEC", "ECB", "BOJ", "BoE", "PBOC", "DAX", "CAC", "FTSE", "ASX", "TSX", "XRP", "BTC", "VIX", "B3", "real", "peso", "Vale", "WEG", "CSN", "MRV", "PRIO", "TIM Brasil", "Vivo"]); // prettier-ignore
const reOf = (w) =>
  new RegExp(`(^|[^\\p{L}\\p{N}])${w.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(?![\\p{L}\\p{N}])`, CASE.has(w) ? "u" : "iu"); // prettier-ignore
const RES = Object.fromEntries(Object.entries(ASSET_WORDS).map(([s, ws]) => [s, ws.map(reOf)]));

const DAY = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" });
/** Mesmo dia (Brasília): manchete de ontem não aparece mais. */
const sameDay = (a, b) => DAY.format(new Date(a * 1000)) === DAY.format(new Date(b * 1000));

/** Movimento que merece explicação: ≥ 0,4% em preço, ≥ 3 bps em taxa. */
export const moved = (c, kind = "px") =>
  Number.isFinite(c) && Math.abs(c) >= (kind === "yld" ? 3 : 0.004);

/** Manchetes do dia por ativo: { sym: [item, …] } (mais nova primeiro, até 3). Puro. */
export function newsByAsset(items, nowSec = Date.now() / 1000) {
  const out = {};
  for (const it of items ?? []) {
    if (!it?.title || !it.t || !sameDay(it.t, nowSec) || it.t > nowSec + 600) continue;
    if (marketScore(it.title) === 0) continue; // só notícia de mercado
    const text = `${it.title} ${it.d ?? ""}`;
    for (const [sym, res] of Object.entries(RES))
      if (res.some((re) => re.test(it.title)) || (it.d && res.some((re) => re.test(text))))
        (out[sym] ??= []).push(it);
  }
  for (const s of Object.keys(out)) out[s] = out[s].sort((a, b) => b.t - a.t).slice(0, 3);
  return out;
}

const HM = new Intl.DateTimeFormat("pt-BR", { timeZone: "America/Sao_Paulo", hour: "2-digit", minute: "2-digit" }); // prettier-ignore

/** Botão "!" da linha. */
export const newsBadge = (sym) =>
  `<button type="button" class="anews" data-asset-news="${esc(sym)}" aria-label="Notícia que pode explicar a variação" title="Notícia do dia ligada a este movimento"><svg viewBox="0 0 16 16" aria-hidden="true"><path d="M3 3.5h8v9H4.2A1.2 1.2 0 0 1 3 11.3z" fill="none" stroke="currentColor" stroke-width="1.3"/><path d="M11 6h2v5.3a1.2 1.2 0 0 1-2.4 0" fill="none" stroke="currentColor" stroke-width="1.3"/><path d="M5 5.5h4M5 7.5h4M5 9.5h2.5" stroke="currentColor" stroke-width="1.1"/></svg></button>`;

/**
 * Movimento fora da curva: variação de hoje em desvios-padrão das variações diárias dos últimos 60 pregões.
 * s = série de fechamentos (ou taxas); c = variação de hoje (fração, ou bps se kind = "yld"). Puro.
 */
export function zMove(s, c, kind = "px", n = 60) {
  if (!s || s.length < 22 || !Number.isFinite(c)) return null;
  const v = s.slice(-(n + 2), -1);
  const d = [];
  for (let i = 1; i < v.length; i++)
    if (Number.isFinite(v[i]) && Number.isFinite(v[i - 1]) && v[i - 1] !== 0)
      d.push(kind === "yld" ? (v[i] - v[i - 1]) * 100 : v[i] / v[i - 1] - 1);
  if (d.length < 20) return null;
  const m = d.reduce((a, b) => a + b, 0) / d.length;
  const sd = Math.sqrt(d.reduce((a, b) => a + (b - m) ** 2, 0) / (d.length - 1));
  return sd > 0 ? c / sd : null;
}

/** Limite para o "!" de alerta: 2,5 desvios (≈ 1 dia em 80, se os retornos fossem normais). */
export const Z_ALERT = 2.5;

export const outlierBadge = (sym, z) =>
  `<button type="button" class="aout" data-outlier="${esc(sym)}" title="Fora da curva: ${Math.abs(z).toFixed(1).replace(".", decSep())} desvios-padrão do normal dos últimos 60 pregões" aria-label="Movimento fora da média">!</button>`;

/** Popup: por que o ativo está variando (manchetes do dia, com resumo e link). */
export function assetNewsPopHtml({ label, chgText, up, items }) {
  const list = items
    .map(
      (
        it,
      ) => `<article class="anews-it"><span class="nmeta"><b>${esc(it.source ?? "")}</b> · ${it.t ? HM.format(new Date(it.t * 1000)) : ""}</span>
      <h4>${esc(ptTitle(it))}</h4>${it.d ? `<p class="npop-sum">${esc(ptSum(it))}</p>` : ""}
      <a href="${esc(it.link)}" target="_blank" rel="noopener noreferrer">Abrir matéria ↗</a></article>`,
    )
    .join("");
  return `<div class="npop-back" data-npop-close><div class="npop" role="dialog" aria-modal="true" aria-labelledby="anT">
    <button type="button" class="npop-x" data-npop-close aria-label="Fechar">✕</button>
    <span class="nmeta">Por que está variando</span>
    <h3 id="anT">${esc(label)} <span class="${up ? "up" : "dn"}">${esc(chgText)}</span></h3>
    <p class="muted" style="margin:0 0 8px">Manchetes de hoje que citam este ativo ou o que o move. A ligação é por palavras-chave: confira se a notícia explica o tamanho do movimento.</p>
    ${list}
  </div></div>`;
}

/** Popup com todos os ativos fora da curva no dia (visão global), do mais extremo ao menos. */
export function outliersPopHtml(list, focus = null, scope = "Visão global") {
  const pct = (o) =>
    o.kind === "yld"
      ? `${o.c > 0 ? "+" : "−"}${Math.abs(o.c).toFixed(0)} bps`
      : `${o.c > 0 ? "+" : "−"}${(Math.abs(o.c) * 100).toFixed(2).replace(".", decSep())}%`;
  const rows = list
    .map(
      (o) =>
        `<tr ${o.page ? "data-sr-open" : "data-sym"}="${esc(o.sym)}" data-npop-close tabindex="0"${o.sym === focus ? ' class="focus"' : ""}><td>${esc(o.label)}</td><td class="num ${o.c > 0 ? "up" : "dn"}">${pct(o)}</td><td class="num"><b>${Math.abs(o.z).toFixed(1).replace(".", decSep())}σ</b></td></tr>`,
    )
    .join("");
  return `<div class="npop-back" data-npop-close><div class="npop" role="dialog" aria-modal="true" aria-labelledby="outT">
    <button type="button" class="npop-x" data-npop-close aria-label="Fechar">✕</button>
    <span class="nmeta">${esc(scope)}</span>
    <h3 id="outT">Fora da curva hoje</h3>
    <p class="muted" style="margin:0 0 8px">Variação do dia comparada à oscilação diária normal de cada ativo nos últimos 60 pregões. Acima de 2,5 desvios-padrão (σ) é raro: vale entender o motivo. Toque na linha para o gráfico.</p>
    ${list.length ? `<table class="tbl out-tbl"><thead><tr><th>Ativo</th><th class="num">Hoje</th><th class="num">Desvios</th></tr></thead><tbody>${rows}</tbody></table>` : `<p class="muted">Nenhum ativo do quadro com variação fora do normal agora.</p>`}
  </div></div>`;
}
