// Notícias: leitura de RSS (manchete, fonte, horário, link), junção sem repetidas e ligação com a carteira.
// Funções puras, usadas pela função /api/news, pelo cron (scripts/update-news.mjs) e pelo navegador.

const ENT = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " " };
function decode(s) {
  return String(s ?? "")
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
    .replace(/<[^>]+>/g, "")
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(Number(d)))
    .replace(/&([a-z]+);/gi, (m, n) => ENT[n.toLowerCase()] ?? m)
    .replace(/\s+/g, " ")
    .trim();
}

const tag = (xml, name) => {
  const m = new RegExp(`<${name}(?:\\s[^>]*)?>([\\s\\S]*?)</${name}>`, "i").exec(xml);
  return m ? decode(m[1]) : "";
};

/** Datas dos feeds: RFC 822 ("Wed, 07 Oct 2026 11:44 GMT") ou ISO sem fuso ("2026-10-07 11:18:44" = UTC). */
export function parseDate(s) {
  if (!s) return null;
  if (/^\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}(:\d{2})?$/.test(s))
    return Math.round(Date.parse(s.replace(" ", "T") + "Z") / 1000);
  const t = Date.parse(s);
  return Number.isNaN(t) ? null : Math.round(t / 1000);
}

/**
 * Resumo publicado pelo próprio site no feed (o "olho" da matéria), limpo e curto (cabe em 2 linhas).
 * Descarta quando só repete o título ou é texto de rodapé ("The post ... appeared first on").
 */
export function summaryOf(raw, title = "") {
  let d = decode(raw)
    .replace(/\s*(The post|O post) .* (appeared first on|apareceu primeiro em) .*$/i, "")
    .replace(/\s*(Continue reading|Leia mais|Read more)\b.*$/i, "")
    .replace(/\s*\[(…|\.\.\.)\]\s*$/, "…")
    .trim();
  if (d.length < 25) return "";
  const n = (x) => x.toLowerCase().replace(/[^a-z0-9à-ú]+/g, "");
  if (n(d).startsWith(n(title).slice(0, 40)) && d.length < title.length + 20) return "";
  if (d.length > 900) d = `${d.slice(0, 897).replace(/\s+\S*$/, "")}…`;
  return d;
}

/** Itens de um RSS: só título, link e data (sem o texto da matéria). */
export function parseRss(xml, { source, region }) {
  const out = [];
  for (const m of String(xml).matchAll(/<item[\s>][\s\S]*?<\/item>/gi)) {
    const it = m[0];
    const title = tag(it, "title");
    let link = tag(it, "link") || (/<link[^>]+href="([^"]+)"/i.exec(it)?.[1] ?? "");
    if (!/^https?:\/\//.test(link)) link = tag(it, "guid");
    const t = parseDate(tag(it, "pubDate") || tag(it, "dc:date") || tag(it, "published"));
    const d = summaryOf(tag(it, "description") || tag(it, "summary"), title);
    if (title && /^https?:\/\//.test(link))
      out.push({ title, link, source, region, t, ...(d ? { d } : {}) });
  }
  return out;
}

const norm = (s) =>
  s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
const hash = (s) => {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (Math.imul(31, h) + s.charCodeAt(i)) | 0;
  return (h >>> 0).toString(36);
};

/** Junta, remove repetidas (mesmo título), descarta antigas e ordena da mais nova para a mais antiga. */
export function mergeItems(lists, nowSec = Date.now() / 1000, maxAgeH = 36) {
  const seen = new Set();
  const out = [];
  for (const it of lists.flat()) {
    const key = norm(it.title ?? "");
    if (!key || seen.has(key)) continue;
    if (it.t && nowSec - it.t > maxAgeH * 3600) continue;
    if (it.t && it.t - nowSec > 3600) continue; // data no futuro: feed com fuso errado
    seen.add(key);
    out.push({ ...it, id: it.id ?? hash(key) });
  }
  return out.sort((a, b) => (b.t ?? 0) - (a.t ?? 0));
}

// ───────────── mesma história com títulos diferentes ─────────────

const STOP = new Set(("the and for with from that this into over after amid says said will its are was has have " +
  "than more new what why how who about out off not but you your our their just being been could would should " +
  "como para com que por uma dos das nos nas sobre apos mais diz entre ate sua seu pelo pela isso esta este sao " +
  "tem foi ser vai").split(" ")); // prettier-ignore
/** Palavras fortes do título (e da tradução, se houver), sem repetição, em ordem. */
export function newsSig(x) {
  const words = norm(`${x.title ?? ""} ${x.titlePt ?? ""}`).split(" ");
  return [...new Set(words.filter((w) => (w.length >= 3 || /\d/.test(w)) && !STOP.has(w)))]
    .sort()
    .slice(0, 20);
}
/** Mesma história: ≥ 3 palavras fortes em comum e ≥ 60% do título menor. */
export function sameStory(a, b) {
  const B = new Set(b);
  const n = a.filter((w) => B.has(w)).length;
  return n >= 3 && n / Math.min(a.length, b.length) >= 0.6;
}

// ───────────── ligação com a carteira ─────────────

/** Temas: palavras que, numa manchete, afetam quem tem exposição àquele tema. */
const THEMES = {
  biotech: [
    "biotech",
    "biotechnology",
    "drugmaker",
    "drugmakers",
    "pharma",
    "FDA",
    "clinical trial",
  ],
  banks: [
    "bank stocks",
    "banks",
    "banking",
    "lender",
    "lenders",
    "JPMorgan",
    "Goldman Sachs",
    "Morgan Stanley",
    "Citigroup",
    "Wells Fargo",
    "Bank of America",
    "financials",
    "big banks",
  ],
  semis: [
    "chip",
    "chips",
    "chipmaker",
    "chipmakers",
    "semiconductor",
    "semiconductors",
    "Nvidia",
    "AMD",
    "TSMC",
    "Micron",
    "Broadcom",
  ],
  cyber: [
    "cyber",
    "cybersecurity",
    "hack",
    "hackers",
    "ransomware",
    "data breach",
    "CrowdStrike",
    "Palo Alto Networks",
    "Fortinet",
    "Zscaler",
    "SentinelOne",
  ],
  korea: ["Korea", "Korean", "Kospi", "Samsung", "SK Hynix", "Seoul", "Coreia"],
  brazil: [
    "Brazil",
    "Brazilian",
    "Ibovespa",
    "Petrobras",
    "Vale",
    "Lula",
    "Copom",
    "Selic",
    "Haddad",
    "Brasil",
  ],
  rates: [
    "Treasury",
    "Treasuries",
    "bond yields",
    "Treasury yields",
    "10-year",
    "30-year",
    "Fed",
    "Federal Reserve",
    "Powell",
    "FOMC",
    "Fomc",
    "rate cut",
    "rate cuts",
    "rate hike",
    "CPI",
    "PCE",
    "payrolls",
    "jobs report",
    "US inflation",
  ],
  oil: ["oil", "crude", "OPEC", "Brent", "WTI", "petróleo"],
  gold: ["gold", "bullion", "ouro"],
  china: ["China", "Chinese", "Beijing", "yuan", "Hang Seng"],
  crypto: ["bitcoin", "crypto", "ether", "ethereum", "stablecoin"],
  tech: ["Nasdaq", "tech stocks", "megacap", "Magnificent Seven"],
};

/** Ativos conhecidos (alavancados/temáticos): empresa ou tema que move o preço. */
const KNOWN = {
  LABD: ["biotech"], LABU: ["biotech"], XBI: ["biotech"],
  FAS: ["banks"], FAZ: ["banks"], XLF: ["banks"], KRE: ["banks"],
  NVDL: { words: ["Nvidia", "NVDA"], themes: ["semis"] }, NVDU: { words: ["Nvidia", "NVDA"], themes: ["semis"] },
  AMDG: { words: ["AMD", "Advanced Micro"], themes: ["semis"] }, SOXL: ["semis"], SMH: ["semis"],
  KORU: ["korea"], EWY: ["korea"], BRZU: ["brazil"], EWZ: ["brazil"],
  CIBR: ["cyber"], UCYB: ["cyber"], HACK: ["cyber"], CRWL: { words: ["CrowdStrike"], themes: ["cyber"] },
  FTNT: { words: ["Fortinet"], themes: ["cyber"] },
  TMV: ["rates"], TMF: ["rates"], TLT: ["rates"], TBF: ["rates"], TBT: ["rates"],
  TQQQ: ["tech"], SQQQ: ["tech"], QQQ: ["tech"],
  USO: ["oil"], XLE: ["oil"], GLD: ["gold"], FXI: ["china"], YINN: ["china"], IBIT: ["crypto"],
}; // prettier-ignore

// Pelo nome do ativo (Yahoo), quando não está na lista acima
const NAME_THEMES = [
  [/biotech|pharma/i, "biotech"], [/bank|financ/i, "banks"], [/semicond|chip/i, "semis"],
  [/cyber|security/i, "cyber"], [/korea/i, "korea"], [/brazil/i, "brazil"], [/treasury|bond/i, "rates"],
  [/oil|energy|crude/i, "oil"], [/gold/i, "gold"], [/china/i, "china"], [/bitcoin|ether|crypto/i, "crypto"],
  [/\b(nasdaq|technology|tech)\b/i, "tech"],
]; // prettier-ignore
const NAME_NOISE =
  /\b(inc|corp|corporation|co|ltd|plc|holdings|group|the|etf|trust|fund|shares|daily|long|short|bull|bear|2x|3x|1x|-1x|leveraged|inverse|index|direxion|proshares|graniteshares|tradr|defiance|leverage|ultra|ultrapro|class [a-z])\b/gi;

/** Gatilhos de cada posição: o próprio ticker, a empresa (do nome) e os temas. */
export function holdingTriggers(sym, name = "") {
  const k = KNOWN[sym];
  const themes = new Set(Array.isArray(k) ? k : (k?.themes ?? []));
  const words = new Set(Array.isArray(k) ? [] : (k?.words ?? []));
  for (const [re, th] of NAME_THEMES) if (re.test(name ?? "")) themes.add(th);
  // empresa: o que sobra do nome sem ruído (ex.: "Fortinet, Inc." -> "Fortinet"), só se for ação comum
  if (!k) {
    const core = String(name ?? "")
      .replace(/[,.()]/g, " ")
      .replace(NAME_NOISE, " ")
      .replace(/\s+/g, " ")
      .trim();
    if (core.length >= 4 && core.split(" ").length <= 3) words.add(core);
  }
  return { sym, words: [...words], themes: [...themes] };
}

// Palavras ambíguas: só valem com a grafia exata (ex.: "Vale" a mineradora, não "vale a pena"; "Fed").
const CASE_SENSITIVE = new Set([
  "Vale",
  "Fed",
  "AMD",
  "CPI",
  "PCE",
  "FOMC",
  "Fomc",
  "WTI",
  "OPEC",
  "FDA",
  "Lula",
  "Brent",
]);
// Trechos que enganam um tema e são removidos antes do teste (banco central não é o setor bancário).
const EXCLUDE = { banks: /\b(central banks?|banco central|bancos centrais)\b/gi };

const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const wordRe = (w) =>
  /^[A-Z0-9]{2,5}$/.test(w)
    ? new RegExp(`(^|[^A-Za-z0-9$])\\$?${esc(w)}(?![A-Za-z0-9])`)
    : new RegExp(
        `(^|[^\\p{L}\\p{N}])${esc(w)}(?![\\p{L}\\p{N}])`,
        CASE_SENSITIVE.has(w) ? "u" : "iu",
      );

/**
 * Para cada manchete, quais posições ela afeta e por quê.
 * Ticker e empresa = ligação direta; tema (setor/país/juros) = ligação indireta.
 * holdings: [{ sym, name }]. Devolve os itens com .hits = [{ sym, why, direct }].
 */
export function matchNews(items, holdings) {
  const trig = holdings.map((h) => holdingTriggers(h.sym, h.name));
  const themeRes = Object.fromEntries(Object.entries(THEMES).map(([k, ws]) => [k, ws.map(wordRe)]));
  return items.map((it) => {
    const hits = [];
    for (const tr of trig) {
      // ticker com 1-2 letras só com "$" (ex.: "$F"); a partir de 3 letras, palavra inteira em maiúsculas
      const tick =
        tr.sym.length >= 3 ? wordRe(tr.sym) : new RegExp(`\\$${esc(tr.sym)}(?![A-Za-z])`);
      const w = tr.words.find((x) => wordRe(x).test(it.title));
      if (tick.test(it.title) || w) {
        hits.push({ sym: tr.sym, why: w ?? tr.sym, direct: true });
        continue;
      }
      const th = tr.themes.find((t) => {
        const title = EXCLUDE[t] ? it.title.replace(EXCLUDE[t], " ") : it.title;
        return themeRes[t]?.some((re) => re.test(title));
      });
      if (th) hits.push({ sym: tr.sym, why: THEME_LABEL[th] ?? th, direct: false });
    }
    return hits.length ? { ...it, hits } : it;
  });
}

const THEME_LABEL = {
  biotech: "biotecnologia", banks: "bancos", semis: "semicondutores", cyber: "cibersegurança", korea: "Coreia",
  brazil: "Brasil", rates: "juros/Fed", oil: "petróleo", gold: "ouro", china: "China", crypto: "cripto", tech: "tecnologia",
}; // prettier-ignore

// ───────────── relevância de mercado ─────────────

/** Palavras que indicam notícia de mercado (macro, ativos, empresas grandes, resultados). */
const MARKET_WORDS = [
  // EN
  "stocks", "stock market", "shares", "S&P 500", "S&P", "Nasdaq", "Dow", "Wall Street", "futures", "bond", "bonds", "yields",
  "Treasury", "Treasuries", "Fed", "Federal Reserve", "Powell", "ECB", "BOJ", "Bank of England", "central bank", "rate cut",
  "rate hike", "interest rates", "inflation", "CPI", "PCE", "GDP", "jobs report", "payrolls", "unemployment", "recession",
  "tariff", "tariffs", "trade war", "dollar", "euro", "yen", "yuan", "oil", "crude", "OPEC", "gold", "copper", "bitcoin",
  "crypto", "earnings", "profit", "revenue", "guidance", "IPO", "merger", "acquisition", "buyback", "dividend", "downgrade",
  "upgrade", "price target", "rally", "selloff", "sell-off", "slump", "record high", "investors", "markets", "economy",
  "Nvidia", "Apple", "Microsoft", "Amazon", "Tesla", "Alphabet", "Meta", "chip", "chips", "AI", "bank", "banks", "hedge fund",
  "private credit", "default", "debt", "deficit", "budget", "sanctions", "China", "emerging markets", "stock", "rates",
  "mortgage", "mortgages", "economic", "economies", "profits", "fund", "funds", "fund managers", "asset managers",
  "data center", "data centers", "Wall St", "valuation", "bubble", "volatility", "carry", "price targets", "bid",
  "takeover", "lender", "Iran", "Russia", "Ukraine", "Israel", "Putin", "hurricane", "privatization", "antitrust",
  // PT
  "Ibovespa", "bolsa", "ações", "juros", "Selic", "Copom", "IPCA", "inflação", "PIB", "dólar", "câmbio", "real",
  "Tesouro", "petróleo", "Petrobras", "Vale", "Banco Central", "BC", "lucro", "balanço", "dividendos", "mercado",
  "investidores", "Fazenda", "fiscal", "arcabouço", "Haddad", "minério", "commodities", "recomendação", "preço-alvo",
  "preços-alvo", "Galípolo", "Banco Master", "bancos", "crédito", "economia", "empresas", "resultado", "receita",
]; // prettier-ignore
const MARKET_RES = MARKET_WORDS.map((w) =>
  new RegExp(`(^|[^\\p{L}\\p{N}])${w.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(?![\\p{L}\\p{N}])`, /^[A-Z]{2,}$|^(Fed|Vale|BC|AI|Dow|Meta)$/.test(w) ? "u" : "iu"),
); // prettier-ignore

/** Pontuação de relevância de mercado da manchete (0 = provavelmente não é notícia de mercado). */
export function marketScore(title) {
  return MARKET_RES.reduce((n, re) => n + (re.test(title) ? 1 : 0), 0);
}

// ───────────── tags (assunto) e ruído ─────────────

/** Tags de assunto, na ordem em que aparecem nos filtros da aba Notícias. */
export const NEWS_TAGS = [
  ["macro", "Macro"],
  ["geo", "Geopolítica"],
  ["commod", "Commodities"],
  ["stocks", "Ações"],
  ["earnings", "Resultados"],
  ["bonds", "Juros/Bonds"],
  ["fx", "Câmbio"],
  ["crypto", "Cripto"],
  ["corp", "Empresas/Setores"],
  ["other", "Outros"],
  ["opinion", "Opinião"],
  ["noise", "Ruído"],
];
export const TAG_LABEL = Object.fromEntries(NEWS_TAGS);
/** Padrão: só o que mexe com preço (opinião e ruído ficam de fora até o usuário ligar). */
export const DEFAULT_TAGS = NEWS_TAGS.map(([k]) => k).filter(
  (k) => !["other", "opinion", "noise"].includes(k),
);

const rx = (words, cs = false) =>
  new RegExp(
    `(^|[^\\p{L}\\p{N}])(${words.map((w) => w.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|")})(?![\\p{L}\\p{N}])`,
    cs ? "u" : "iu",
  );

const TAG_RES = {
  macro: [
    rx([
      "inflation",
      "GDP",
      "jobs report",
      "payrolls",
      "unemployment",
      "jobless claims",
      "recession",
      "economy",
      "economic",
      "economies",
      "consumer spending",
      "retail sales",
      "PMI",
      "central bank",
      "rate cut",
      "rate cuts",
      "rate hike",
      "interest rates",
      "tariff",
      "tariffs",
      "trade war",
      "trade deal",
      "trade talks",
      "deficit",
      "budget",
      "IMF",
      "World Bank",
      "Federal Reserve",
      "Powell",
      "Bank of England",
      "housing starts",
      "trade conflict",
      "inflação",
      "PIB",
      "desemprego",
      "Banco Central",
      "Copom",
      "Selic",
      "IPCA",
      "fiscal",
      "arcabouço",
      "Fazenda",
      "Haddad",
      "Galípolo",
      "economia",
      "juros",
    ]),
    rx(["Fed", "ECB", "BOJ", "PBOC", "CPI", "PCE", "FOMC", "BC"], true),
  ],
  geo: [
    rx([
      "Iran",
      "Israel",
      "Russia",
      "Russian",
      "Ukraine",
      "Putin",
      "Zelensky",
      "Gaza",
      "Hamas",
      "Hezbollah",
      "Taiwan",
      "North Korea",
      "sanctions",
      "war",
      "missile",
      "missiles",
      "strike",
      "strikes",
      "military",
      "Pentagon",
      "NATO",
      "ceasefire",
      "invasion",
      "geopolitical",
      "Middle East",
      "Red Sea",
      "Strait of Hormuz",
      "Venezuela",
      "election",
      "elections",
      "midterms",
      "White House",
      "Trump",
      "Xi Jinping",
      "guerra",
      "sanções",
      "eleição",
      "eleições",
      "Oriente Médio",
    ]),
  ],
  commod: [
    rx([
      "oil",
      "crude",
      "Brent",
      "natural gas",
      "LNG",
      "gasoline",
      "diesel",
      "fuel",
      "gold",
      "silver",
      "copper",
      "iron ore",
      "aluminum",
      "lithium",
      "nickel",
      "wheat",
      "corn",
      "soybeans",
      "soy",
      "coffee",
      "sugar",
      "cocoa",
      "cattle",
      "commodities",
      "commodity",
      "metals",
      "petróleo",
      "minério",
      "ouro",
      "soja",
      "milho",
      "café",
      "açúcar",
      "commodities",
      "gasolina",
      "combustíveis",
    ]),
    rx(["OPEC", "WTI"], true),
  ],
  stocks: [
    rx([
      "stocks",
      "stock",
      "shares",
      "S&P 500",
      "S&P",
      "Nasdaq",
      "Wall Street",
      "Wall St",
      "equities",
      "equity",
      "stock market",
      "IPO",
      "buyback",
      "merger",
      "acquisition",
      "takeover",
      "tender offer",
      "deal",
      "rally",
      "selloff",
      "sell-off",
      "record high",
      "downgrade",
      "upgrade",
      "price target",
      "Ibovespa",
      "bolsa",
      "ações",
      "B3",
      "fusão",
      "aquisição",
      "recomendação",
      "preço-alvo",
    ]),
    rx(["Dow"], true),
  ],
  earnings: [
    rx([
      "earnings",
      "quarterly",
      "quarter",
      "profit",
      "profits",
      "revenue",
      "revenues",
      "guidance",
      "outlook",
      "forecast",
      "sales",
      "results",
      "EPS",
      "lucro",
      "balanço",
      "receita",
      "resultado",
      "resultados",
      "trimestre",
      "dividendos",
      "dividend",
      "dividends",
    ]),
  ],
  bonds: [
    rx([
      "bond",
      "bonds",
      "yields",
      "yield",
      "Treasury",
      "Treasuries",
      "gilts",
      "bund",
      "bunds",
      "credit spreads",
      "high yield",
      "junk bonds",
      "private credit",
      "debt",
      "default",
      "10-year",
      "30-year",
      "2-year",
      "mortgage rates",
      "Tesouro",
      "títulos",
      "debêntures",
      "crédito",
      "DI",
      "curva",
    ]),
  ],
  fx: [
    rx([
      "dollar",
      "euro",
      "yen",
      "yuan",
      "sterling",
      "pound",
      "peso",
      "currency",
      "currencies",
      "forex",
      "FX",
      "dólar",
      "câmbio",
      "real",
      "moeda",
    ]),
  ],
  corp: [
    rx([
      "bank",
      "banks",
      "banking",
      "lender",
      "lenders",
      "hedge fund",
      "hedge funds",
      "private equity",
      "asset manager",
      "asset managers",
      "buybacks",
      "fined",
      "fine",
      "regulator",
      "regulators",
      "watchdog",
      "SEC",
      "antitrust",
      "windfall tax",
      "bailout",
      "bankruptcy",
      "layoffs",
      "telecom",
      "telecoms",
      "job cuts",
      "financing",
      "funding round",
      "valuation",
      "chipmaker",
      "chipmakers",
      "semiconductor",
      "semiconductors",
      "data center",
      "data centers",
      "AI",
      "Nvidia",
      "Apple",
      "Microsoft",
      "Amazon",
      "Alphabet",
      "Google",
      "Meta",
      "Tesla",
      "OpenAI",
      "SoftBank",
      "Berkshire",
      "JPMorgan",
      "Goldman Sachs",
      "Morgan Stanley",
      "Petrobras",
      "Vale",
      "Itaú",
      "Bradesco",
      "Banco do Brasil",
      "Eletrobras",
      "bancos",
      "falência",
      "recuperação judicial",
      "CVM",
    ]),
  ],
  crypto: [
    rx([
      "bitcoin",
      "crypto",
      "cryptocurrency",
      "ether",
      "ethereum",
      "stablecoin",
      "stablecoins",
      "Coinbase",
      "Binance",
      "solana",
      "cripto",
      "criptomoedas",
    ]),
  ],
};

/** Opinião, análise, colunas, "por que você deveria comprar..." (não é fato novo que move preço). */
const OPINION_RE = [
  /^(opinion|analysis|análise|opinião|column|coluna|commentary|editorial|lex|letter|letters|review & preview|explainer|podcast|video|vídeo|watch|listen|live|quiz|the big read|lunch with the ft|ft alphaville|unhedged)\s*[:|–—-]/iu,
  /^(why|what|how|is|are|should|could|can|has|have|will|would|do|does)\b[^?]*\?$/iu, // pergunta retórica: "What Could Derail Boeing Stock?"
  /^(por que|o que|como|vale a pena|será que|deve|devo)\b[^?]*\?$/iu,
  /^(how to|como)\b/iu,
  /\b(should you (buy|sell)|(three|four|five|six|seven|ten|\d+) ways|is it time to|better buy|top \d+|\d+ (stocks?|reasons|things|ways)|best stocks?|stocks? to (buy|watch)|millionaire|retire|retirement|passive income|my (portfolio|favorite)|i'm buying|i bought|here's why|here is why|what you need to know|could make you|could affect you|ways it could)\b/iu,
  /\b(stockpickers|wisdom of|the case for|the case against|lessons from|in defen[cs]e of)\b/iu,
  /\b(ações para (comprar|investir)|onde investir|carteira recomendada|como investir|vale a pena|aposentadoria|renda passiva)\b/iu,
];

/** Ruído: release jurídico, comunicado corporativo sem efeito de preço, varejo/estilo de vida, apostas. */
const NOISE_RE = [
  /\b(class action|securities fraud|investor counsel|law firm|lawsuit investigation|shareholder alert|deadline alert|rosen|pomerantz|bragar|levi & korsinsky|faruqi|the gross law firm|bronstein|kessler topaz|investors who lost)\b/iu,
  /\b(celebrates|opens new|new branch|grand opening|ribbon|appoints|announces (the )?appointment|names .* (ceo|cfo|president|director)|joins board|webinar|conference call (schedule|notice)|to present at|to participate in|investor day|award|awards|recognized as|ranked|sponsorship|partnership with|launches .* (app|platform|solution))\b/iu,
  /\b(EQS-|PVR:|Form 8\.3|Total voting rights|Transaction in own shares|Director\/PDMR|Holding\(s\) in Company|Notification of major holdings|Article 40)\b/u,
  /\b(recipe|travel|vacation|celebrity|horoscope|wedding|dating|fashion|sports|Kalshi examines|press secretary|execution|livestreamed)\b/iu,
  /^(market talk|.* roundup: market talk)$/iu,
];

/**
 * Classifica a manchete: tags de assunto (macro, geo, commodities...), "opinion" e "noise".
 * Devolve { tags, impact }: impact = notícia que pode mexer com preço (tem assunto de mercado e não é opinião/ruído).
 */
export function classifyNews(it) {
  const title = String(it?.title ?? "");
  const tags = Object.entries(TAG_RES)
    .filter(([, res]) => res.some((re) => re.test(title)))
    .map(([k]) => k);
  const opinion = OPINION_RE.some((re) => re.test(title));
  const noise = !opinion && NOISE_RE.some((re) => re.test(title));
  // geo sozinho (ex.: "Trump") só conta como impacto com outro assunto de mercado ou palavra de conflito
  if (opinion) tags.push("opinion");
  if (noise) tags.push("noise");
  const subject = tags.filter((t) => !["opinion", "noise", "geo"].includes(t));
  const geoOnly = tags.includes("geo") && !subject.length;
  const impact =
    !opinion &&
    !noise &&
    (subject.length > 0 ||
      (geoOnly &&
        /\b(sanction|war|strike|missile|attack|tanker|hormuz|invasion|ceasefire|tariff)/iu.test(
          title,
        )) ||
      !!it?.hits?.some((h) => h.direct));
  if (!tags.length) tags.push("other");
  return { tags, impact };
}

/** Acrescenta .tags e .impact a cada item. */
export const tagNews = (items) => items.map((it) => ({ ...it, ...classifyNews(it) }));

/** Item passa no filtro de tags? Opinião/ruído só aparecem com a tag ligada; o resto precisa de uma tag ligada. */
export function passTags(it, on) {
  const set = new Set(on ?? DEFAULT_TAGS);
  const tags = it.tags ?? classifyNews(it).tags;
  if (tags.includes("opinion") && !set.has("opinion")) return false;
  if (tags.includes("noise") && !set.has("noise")) return false;
  return tags.some((t) => set.has(t));
}
