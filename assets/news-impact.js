// Notícias × ativo (docs/ROADMAP-NOTICIAS.md): nota de −10 a +10 para cada manchete pelo impacto provável NESTE ativo.
// Motor de regras (sem IA): relevância (empresa, composição do ETF, setor, região, macro, geopolítica) × tom (dicionário
// financeiro) × mapa de exposição (o mesmo tema ajuda um setor e prejudica outro). Puro e testável; a troca por IA
// depois só substitui scoreItem. Leitura educacional de manchetes; não é recomendação de investimento.

const clamp = (x, a = -1, b = 1) => Math.max(a, Math.min(b, x));
const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const wordRe = (list) =>
  new RegExp(`(^|[^\\p{L}\\p{N}])(${list.map(esc).join("|")})(?![\\p{L}\\p{N}])`, "iu");

// ───────── exposição do ativo ─────────
const SECTOR_EXPO = {
  Technology: { tech: 1 },
  "Communication Services": { tech: 0.6, consumer: 0.3 },
  Energy: { energy: 1, oil: 0.8, gas: 0.4 },
  "Financial Services": { banks: 0.7, insurance: 0.3 },
  Healthcare: { health: 1, pharma: 0.5 },
  Industrials: { industrials: 1 },
  "Consumer Cyclical": { consumer: 1 },
  "Consumer Defensive": { staples: 1 },
  "Basic Materials": { materials: 1 },
  "Real Estate": { reits: 1 },
  Utilities: { utilities: 1 },
};
const FUND_SECTOR = {
  technology: "Technology",
  communication_services: "Communication Services",
  energy: "Energy",
  financial_services: "Financial Services",
  healthcare: "Healthcare",
  industrials: "Industrials",
  consumer_cyclical: "Consumer Cyclical",
  consumer_defensive: "Consumer Defensive",
  basic_materials: "Basic Materials",
  realestate: "Real Estate",
  utilities: "Utilities",
};
const INDUSTRY_EXPO = [
  [/semiconductor/i, { semis: 1, taiwan: 0.4, china: 0.3 }],
  [/airline/i, { airlines: 1, travel: 0.5 }],
  [/marine shipping|oil & gas midstream/i, { shipping: 0.8 }],
  [/aerospace & defense/i, { defense: 1 }],
  [/gold|silver|precious/i, { gold: 1 }],
  [/copper/i, { copper: 1 }],
  [/steel/i, { steel: 1 }],
  [/bank/i, { banks: 1 }],
  [/insurance/i, { insurance: 1 }],
  [/residential construction|home improvement/i, { homebuilders: 1 }],
  [/oil & gas e&p|integrated|drilling|equipment & services|refining/i, { oil: 1 }],
  [/auto/i, { autos: 1 }],
  [/travel|lodging|resorts|cruise|leisure/i, { travel: 1 }],
  [/drug manufacturers|biotech/i, { pharma: 1 }],
  [/uranium|nuclear/i, { nuclear: 1 }],
  [/utilities/i, { utilities: 1 }],
];
const COUNTRY_EXPO = { China: { china: 1, emerging: 0.6 }, "Hong Kong": { china: 0.8 }, Taiwan: { taiwan: 1, semis: 0.3, emerging: 0.4 }, Japan: { japan: 1 }, India: { india: 1, emerging: 0.6 }, Netherlands: { europe: 1 }, Germany: { europe: 1 }, France: { europe: 1 }, "United Kingdom": { europe: 0.8 }, Switzerland: { europe: 0.8 }, Denmark: { europe: 0.8 } }; // prettier-ignore
/** Rótulo da taxonomia do usuário (assets/sectors.js) → exposição, para ETFs de commodity, juros, região etc. */
const LABEL_EXPO = [
  [/^CMDTY\.OIL/, { oil: 1, energy: 0.5, market: 0 }],
  [/^CMDTY\.NATGAS/, { gas: 1, market: 0 }],
  [/^(CMDTY\.GOLD|MAT\.GOLD)/, { gold: 1, market: 0.2 }],
  [/^(CMDTY\.SILVER|MAT\.SILVER)/, { gold: 0.8, materials: 0.4, market: 0.2 }],
  [/^CMDTY/, { materials: 0.5, oil: 0.4, market: 0.2 }],
  [/^RATES/, { bonds: 1, market: 0 }],
  [/^CRYPTO/, { crypto: 1, market: 0.6 }],
  [/^MKT\.INTL\.CHINA/, { china: 1, emerging: 0.6 }],
  [/^MKT\.INTL\.INDIA/, { india: 1, emerging: 0.6 }],
  [/^MKT\.INTL\.EM/, { emerging: 1, china: 0.3 }],
  [/^MKT\.INTL\.DM/, { europe: 0.7, japan: 0.3 }],
  [/^AI\.SEMI/, { semis: 1, tech: 0.7, taiwan: 0.4, china: 0.3 }],
  [/^AI\.IND\.NUCLEAR/, { nuclear: 1, utilities: 0.5 }],
  [/^IND\.AERODEF/, { defense: 1 }],
  [/^IND\.AIRLINES/, { airlines: 1, travel: 0.5 }],
  [/^ENGY/, { energy: 1, oil: 0.8 }],
  [/^DISC\.HOME/, { homebuilders: 1 }],
  [/^FIN\.BANKS/, { banks: 1 }],
];

// primeira palavra do nome ("Exxon" de "Exxon Mobil"), exceto palavras genéricas que casariam com qualquer manchete
const GENERIC = new Set(["the", "first", "american", "general", "united", "international", "global", "national", "new", "us", "u.s.", "china", "invesco", "ishares", "vanguard", "spdr", "proshares", "direxion", "schwab", "select", "sector", "energy", "health", "royal", "great", "southern", "western", "eastern", "north", "south", "bank", "capital", "digital"]); // prettier-ignore
const firstWord = (name) => {
  const w = name.split(/[\s,.&-]+/)[0] ?? "";
  return w.length >= 4 && !GENERIC.has(w.toLowerCase()) && w.toLowerCase() !== name.toLowerCase()
    ? [w]
    : [];
};

/**
 * Exposição do ativo: { market, setores/temas ∈ [0,1] }, sinal (−1 inverso), palavras para casar a manchete com a
 * empresa e com as maiores posições do ETF. p = resposta da api/profile; meta = { label, kind } da lista do usuário.
 */
export function assetExposure(sym, p = {}, meta = {}) {
  const e = { market: 1 };
  const add = (o, w = 1) =>
    Object.entries(o).forEach(([k, v]) => (e[k] = Math.max(e[k] ?? 0, v * w)));
  const prof = p.profile ?? {};
  if (SECTOR_EXPO[prof.sector]) add(SECTOR_EXPO[prof.sector]);
  for (const [re, o] of INDUSTRY_EXPO) if (re.test(prof.industry ?? "")) add(o);
  if (COUNTRY_EXPO[prof.country]) add(COUNTRY_EXPO[prof.country]);
  for (const s of p.fund?.sectors ?? []) if (FUND_SECTOR[s.k] && s.w > 0.08) add(SECTOR_EXPO[FUND_SECTOR[s.k]], Math.min(1, s.w * 2)); // prettier-ignore
  for (const [re, o] of LABEL_EXPO)
    if (re.test(meta.label ?? "")) {
      Object.assign(e, o);
      break;
    }
  const name = String(p.profile?.name ?? p.quote?.name ?? meta.name ?? "")
    .replace(/,?\s+(Inc\.?|Corp(oration)?\.?|Co\.?|Ltd\.?|plc|N\.V\.|S\.A\.|Holdings?|Group|Company|Technologies|Incorporated|ETF|Trust|Fund|Class [A-C]).*$/i, "")
    .trim(); // prettier-ignore
  const holds = (p.fund?.holdings ?? []).filter((h) => h.w >= 0.03).map((h) => ({ sym: h.sym, name: String(h.name ?? "").split(/[\s,]+/)[0], w: h.w })); // prettier-ignore
  return {
    sym,
    expo: e,
    sign: meta.kind === "INV" ? -1 : 1,
    direct: wordRe(
      [sym, ...(name.length >= 3 ? [name] : []), ...firstWord(name)].filter((x) => x.length >= 2),
    ),
    holds: holds.map((h) => ({
      ...h,
      re: wordRe([h.sym, h.name].filter((x) => x && x.length >= 3)),
    })),
  };
}

// ───────── tom (dicionário financeiro) ─────────
const POS = [
  [3, ["beats estimates", "beat estimates", "tops estimates", "record revenue", "record profit", "raises guidance", "raises outlook", "raises forecast", "lifts forecast", "upgraded", "upgrade", "soars", "surges", "skyrockets", "FDA approval", "approved by FDA", "wins contract", "awarded contract", "buyback", "share repurchase", "dividend hike", "raises dividend", "blowout", "beats"]], // prettier-ignore
  [2, ["jumps", "rallies", "climbs", "strong demand", "outperform", "overweight", "buy rating", "price target raised", "raises price target", "partnership", "deal with", "expands", "approval", "growth accelerates", "profit rises", "revenue rises", "tops", "rebounds", "acquire", "to acquire", "breakthrough", "all-time high", "record high"]], // prettier-ignore
  [1, ["gains", "rises", "higher", "edges up", "upbeat", "optimism", "boost", "boosts", "strong", "recovery", "ceasefire", "truce", "peace talks", "eases", "cools"]], // prettier-ignore
];
const NEG = [
  [3, ["misses estimates", "missed estimates", "cuts guidance", "lowers guidance", "slashes", "plunges", "tumbles", "crashes", "collapses", "bankruptcy", "chapter 11", "fraud", "SEC charges", "indicted", "recall", "halts", "suspends", "downgraded", "downgrade", "profit warning", "short seller", "default", "delisting", "data breach"]], // prettier-ignore
  [2, ["falls", "drops", "slides", "sinks", "misses", "probe", "investigation", "lawsuit", "sued", "antitrust", "fine", "fined", "underperform", "underweight", "sell rating", "price target cut", "cuts price target", "layoffs", "job cuts", "delay", "delays", "weak demand", "slowdown", "loses", "loss widens", "export curbs", "export controls", "ban", "banned", "sanctions"]], // prettier-ignore
  [1, ["lower", "slips", "dips", "edges down", "concern", "concerns", "worries", "fears", "risk", "pressure", "uncertainty", "volatile", "selloff", "sell-off", "tariff", "tariffs"]], // prettier-ignore
];
const POS_RE = POS.map(([w, l]) => [w, wordRe(l)]);
const NEG_RE = NEG.map(([w, l]) => [w, wordRe(l)]);

/** Tom da manchete em [−1, 1] pelo dicionário (palavra mais forte de cada lado). */
export function toneOf(title) {
  const pos = Math.max(0, ...POS_RE.filter(([, re]) => re.test(title)).map(([w]) => w));
  const neg = Math.max(0, ...NEG_RE.filter(([, re]) => re.test(title)).map(([w]) => w));
  return clamp((pos - neg) / 3);
}

// ───────── temas macro e geopolíticos com efeito por exposição ─────────
/** fx = efeito do evento em cada exposição (−1 a +1). geo = geopolítica (aparece no radar). */
export const THEMES = [
  { k: "mideast", geo: true, label: "Conflito no Oriente Médio", re: wordRe(["Iran", "Israel", "Hezbollah", "Houthi", "Hormuz", "Red Sea", "Gaza", "Middle East", "Strait of Hormuz", "Tehran"]), fx: { market: -0.3, oil: 0.8, energy: 0.6, gold: 0.6, defense: 0.6, shipping: 0.5, airlines: -0.7, travel: -0.4, bonds: 0.2 } }, // prettier-ignore
  { k: "russia", geo: true, label: "Rússia e Ucrânia", re: wordRe(["Russia", "Ukraine", "Putin", "Kremlin", "Zelensky", "NATO"]), fx: { market: -0.2, gas: 0.7, oil: 0.4, energy: 0.4, defense: 0.7, europe: -0.5, gold: 0.4, steel: 0.2 } }, // prettier-ignore
  { k: "china", geo: true, label: "Tensão EUA–China / Taiwan", re: wordRe(["Taiwan", "Beijing", "Xi Jinping", "China tensions", "South China Sea", "export controls", "export curbs", "rare earth", "rare earths", "chip ban", "entity list"]), fx: { market: -0.3, semis: -0.6, taiwan: -0.8, china: -0.7, tech: -0.3, defense: 0.5, gold: 0.3, materials: 0.2 } }, // prettier-ignore
  { k: "tariff", geo: true, label: "Tarifas e guerra comercial", re: wordRe(["tariff", "tariffs", "trade war", "trade deal", "trade talks", "duties", "import taxes", "Section 232", "retaliation"]), fx: { market: -0.4, china: -0.6, autos: -0.6, consumer: -0.4, semis: -0.4, industrials: -0.3, emerging: -0.4, steel: 0.4, gold: 0.3, staples: -0.1 } }, // prettier-ignore
  { k: "sanctions", geo: true, label: "Sanções", re: wordRe(["sanctions", "sanctioned", "embargo", "blacklist"]), fx: { market: -0.2, oil: 0.4, energy: 0.3, shipping: 0.3, gold: 0.3, emerging: -0.3 } }, // prettier-ignore
  { k: "peace", geo: true, label: "Trégua / acordo de paz", re: wordRe(["ceasefire", "truce", "peace deal", "peace talks", "peace agreement", "de-escalation"]), fx: { market: 0.3, oil: -0.6, energy: -0.4, gold: -0.4, defense: -0.4, airlines: 0.5, travel: 0.3, europe: 0.3 } }, // prettier-ignore
  { k: "oilup", label: "Petróleo subindo", re: /\b(oil|crude|Brent|WTI)\b.{0,40}\b(jumps?|surges?|soars?|rall(y|ies)|climbs?|spikes?|rises?|higher)\b|\bOPEC\+? (cuts?|curbs?)/iu, fx: { oil: 0.9, energy: 0.7, airlines: -0.7, travel: -0.3, consumer: -0.2, market: -0.1, shipping: 0.3 } }, // prettier-ignore
  { k: "oildown", label: "Petróleo caindo", re: /\b(oil|crude|Brent|WTI)\b.{0,40}\b(falls?|drops?|slides?|plunges?|tumbles?|sinks?|lower)\b|\bOPEC\+? (raises?|boosts?|hikes?) (output|production)/iu, fx: { oil: -0.9, energy: -0.7, airlines: 0.6, travel: 0.3, consumer: 0.2 } }, // prettier-ignore
  { k: "fedcut", label: "Fed cortando juros", re: /\b(Fed|Federal Reserve|Powell|FOMC)\b.{0,50}\b(cuts?|cutting|lowers?|dovish|easing)\b|\brate cuts?\b/iu, fx: { market: 0.4, bonds: 0.7, homebuilders: 0.7, reits: 0.6, utilities: 0.4, tech: 0.3, gold: 0.4, banks: -0.2, crypto: 0.4 } }, // prettier-ignore
  { k: "fedhike", label: "Fed duro / juros subindo", re: /\b(Fed|Federal Reserve|Powell|FOMC)\b.{0,50}\b(hikes?|raises?|hawkish|tightening)\b|\b(yields?|Treasury yields?) (jump|surge|soar|climb|rise)/iu, fx: { market: -0.4, bonds: -0.7, homebuilders: -0.7, reits: -0.6, utilities: -0.4, tech: -0.4, banks: 0.2, gold: -0.3, crypto: -0.4 } }, // prettier-ignore
  { k: "inflhot", label: "Inflação acima do esperado", re: /\b(inflation|CPI|PCE)\b.{0,40}\b(hotter|accelerates?|jumps?|surges?|higher than expected|above expectations)\b/iu, fx: { market: -0.4, bonds: -0.6, homebuilders: -0.5, tech: -0.3, gold: 0.3, staples: -0.1 } }, // prettier-ignore
  { k: "inflcool", label: "Inflação esfriando", re: /\b(inflation|CPI|PCE)\b.{0,40}\b(cools?|eases?|slows?|lower than expected|below expectations)\b/iu, fx: { market: 0.4, bonds: 0.6, homebuilders: 0.5, tech: 0.3, reits: 0.3 } }, // prettier-ignore
  { k: "recession", label: "Medo de recessão", re: wordRe(["recession", "recession fears", "hard landing", "contraction", "jobless claims jump", "layoffs surge"]), fx: { market: -0.6, consumer: -0.6, industrials: -0.5, banks: -0.5, materials: -0.5, copper: -0.6, oil: -0.4, staples: 0.2, utilities: 0.2, bonds: 0.5, gold: 0.3, health: 0.1 } }, // prettier-ignore
  { k: "aicapex", label: "Investimento em IA", re: wordRe(["AI spending", "AI capex", "data center", "data centers", "AI demand", "AI infrastructure", "hyperscaler", "hyperscalers"]), fx: { semis: 0.6, tech: 0.4, utilities: 0.3, nuclear: 0.4, copper: 0.3, industrials: 0.2 } }, // prettier-ignore
  { k: "defense", geo: true, label: "Gastos com defesa", re: wordRe(["defense spending", "military spending", "Pentagon budget", "rearmament", "arms deal"]), fx: { defense: 0.8, europe: 0.1 } }, // prettier-ignore
  {
    k: "crypto",
    label: "Cripto",
    re: wordRe(["Bitcoin", "crypto", "Ethereum", "stablecoin"]),
    fx: { crypto: 1 },
  },
];

const SECTOR_WORDS = {
  semis: ["chipmakers", "chip stocks", "semiconductors", "semiconductor", "chips"],
  banks: ["banks", "bank stocks", "lenders", "bankers"],
  oil: ["oil stocks", "oil majors", "energy stocks", "drillers", "shale"],
  airlines: ["airlines", "air travel", "carriers"],
  homebuilders: ["homebuilders", "housing market", "mortgage rates", "home sales"],
  pharma: ["drugmakers", "pharma", "pharmaceutical", "biotech", "FDA"],
  defense: ["defense stocks", "defense contractors", "Pentagon"],
  gold: ["gold", "bullion", "precious metals", "gold miners"],
  shipping: ["shipping", "tankers", "freight rates", "container ships"],
  tech: ["tech stocks", "Big Tech", "megacaps", "software stocks", "Magnificent Seven"],
  reits: ["REITs", "real estate", "commercial property"],
  utilities: ["utilities", "power grid", "electricity demand"],
  consumer: ["retailers", "consumer spending", "shoppers", "retail sales"],
  autos: ["automakers", "carmakers", "auto sales", "EV sales"],
  copper: ["copper"],
  crypto: ["Bitcoin", "crypto"],
  nuclear: ["uranium", "nuclear power"],
};
const SECTOR_RE = Object.fromEntries(Object.entries(SECTOR_WORDS).map(([k, l]) => [k, wordRe(l)]));
const REGION_WORDS = { china: ["China", "Chinese", "Hong Kong"], europe: ["Europe", "European", "ECB", "euro zone", "eurozone", "Germany", "France"], japan: ["Japan", "BOJ", "Nikkei", "yen"], india: ["India", "Indian", "RBI"], emerging: ["emerging markets"], taiwan: ["Taiwan", "TSMC"] }; // prettier-ignore
const REGION_RE = Object.fromEntries(Object.entries(REGION_WORDS).map(([k, l]) => [k, wordRe(l)]));

const dot = (fx, expo) => Object.entries(fx).reduce((a, [k, v]) => a + v * (expo[k] ?? 0), 0);

/**
 * Nota de uma manchete para o ativo: { score −10..+10, tier, why, themes } ou null (não tem relação).
 * Tiers: Empresa (1,0) > Composição do ETF (0,4–0,8) > Setor (0,6) > Região (0,5) > Geopolítica / Macro (0,6).
 */
export function scoreItem(item, ax) {
  const title = String(item?.title ?? "");
  if (!title) return null;
  const tone = toneOf(title);
  const themes = THEMES.filter((t) => t.re.test(title));
  const themeFx = themes.length ? clamp(themes.reduce((a, t) => a + dot(t.fx, ax.expo), 0)) : null;
  let tier = null;
  let rel = 0;
  let dir = 0;
  let why = "";
  const hold = ax.holds.find((h) => h.re.test(title));
  const sector = Object.keys(SECTOR_RE).find(
    (k) => (ax.expo[k] ?? 0) >= 0.5 && SECTOR_RE[k].test(title),
  );
  const region = Object.keys(REGION_RE).find(
    (k) => (ax.expo[k] ?? 0) >= 0.5 && REGION_RE[k].test(title),
  );
  if (ax.direct.test(title)) {
    tier = "Empresa";
    rel = 1;
    dir = tone || (themeFx ?? 0);
    why = tone
      ? "Cita o ativo; tom da manchete"
      : themeFx
        ? "Cita o ativo; efeito do tema"
        : "Cita o ativo; tom neutro";
  } else if (item.own) {
    // manchete que o Yahoo devolveu na busca do próprio ticker, sem citar o nome: provavelmente do ativo
    tier = "Empresa";
    rel = 0.7;
    dir = tone || (themeFx ?? 0);
    why = "Notícia do ticker no Yahoo";
    if (!dir) return null;
  } else if (hold) {
    tier = "Composição";
    rel = clamp(0.4 + hold.w * 4, 0.4, 0.8);
    dir = tone || (themeFx ?? 0);
    why = `Cita ${hold.sym}, ${Math.round(hold.w * 100)}% do fundo`;
  } else if (sector) {
    tier = "Setor";
    rel = 0.6;
    dir = themeFx ?? tone;
    why = `Fala do setor (${SECTOR_WORDS[sector][0]})`;
  } else if (region) {
    tier = "Região";
    rel = 0.5;
    dir = themeFx ?? tone;
    why = `Fala da região (${REGION_WORDS[region][0]})`;
  } else if (themes.length && Math.abs(themeFx) >= 0.15) {
    tier = themes.some((t) => t.geo) ? "Geopolítica" : "Macro";
    rel = 0.6;
    dir = themeFx;
    why = themes.map((t) => t.label).join(" + ");
  } else return null;
  if (themes.length && tier !== "Geopolítica" && tier !== "Macro")
    why += ` · tema: ${themes.map((t) => t.label).join(", ")}`;
  const score = Math.round(clamp(dir * ax.sign) * rel * 10);
  return { score, tier, why, themes: themes.map((t) => t.k), geo: themes.some((t) => t.geo) };
}

const HALF_LIFE_H = 48;

/**
 * Ranking das notícias do ativo e saldo: { items (ordenados por |nota| × frescor), balance −10..+10, n, conf, geo }.
 * items = manchetes { title, link, source, t (segundos) } de todas as fontes (sem repetir título).
 */
export function rankImpact(items, ax, nowSec = Date.now() / 1000, maxAgeH = 7 * 24) {
  const seen = new Set();
  const out = [];
  for (const it of items ?? []) {
    const key = String(it.title ?? "")
      .toLowerCase()
      .slice(0, 80);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    if (it.tags?.includes("opinion") || it.tags?.includes("noise")) continue; // opinião e ruído (assets/news.js)
    const age = it.t ? (nowSec - it.t) / 3600 : 24;
    if (age > maxAgeH) continue;
    const s = scoreItem(it, ax);
    if (!s) continue;
    out.push({ ...it, ...s, age, fresh: 0.5 ** (Math.max(0, age) / HALF_LIFE_H) });
  }
  out.sort((a, b) => Math.abs(b.score) * b.fresh - Math.abs(a.score) * a.fresh || a.age - b.age);
  const w = out.filter((x) => x.score !== 0);
  const tw = w.reduce((a, x) => a + x.fresh * (x.tier === "Empresa" ? 1.5 : 1), 0);
  const balance = tw ? Math.round(w.reduce((a, x) => a + x.score * x.fresh * (x.tier === "Empresa" ? 1.5 : 1), 0) / tw) : 0; // prettier-ignore
  const direct = w.filter((x) => x.tier === "Empresa").length;
  const conf = w.length >= 6 && direct >= 2 ? "Média" : "Baixa";
  const geo = {};
  for (const x of out.filter((y) => y.geo)) for (const k of x.themes) (geo[k] ||= []).push(x.score);
  const geoList = Object.entries(geo).map(([k, l]) => ({ k, label: THEMES.find((t) => t.k === k)?.label ?? k, n: l.length, avg: Math.round(l.reduce((a, b) => a + b, 0) / l.length) })); // prettier-ignore
  return { items: out, balance, n: w.length, conf, geo: geoList.sort((a, b) => b.n - a.n) };
}

/** Sub-análise "Notícias" para a Decisão do trader (modo sombra: mostrada, sem peso). */
export const newsSub = (rk) => (rk?.n ? { dir: rk.balance / 10, conf: rk.conf, shadow: true, text: `saldo ${rk.balance > 0 ? "+" : ""}${rk.balance} em ${rk.n} notícias` } : null); // prettier-ignore
