// Dados macro divulgados (EUA, zona do euro, Alemanha, Reino Unido, Japão, China): valor real x projeção do mercado.
// Fonte do "atual": calendário econômico da Nasdaq (api.nasdaq.com/api/calendar/economicevents?date=AAAA-MM-DD).
import { topicTitle } from "./notif-topics.js";

const stemOf = (id) => String(id).split(":").slice(0, 3).join(":");
/** Chave estável de um dado divulgado (igual vindo da Nasdaq ou do Yahoo): o aviso não repete entre as fontes. */
export const releaseKey = (e) => `${e.date}:${stemOf(e.id)}:${e.t ?? ""}:${num(e.previous) ?? ""}`;

// Puro, para testar: normaliza as linhas, reconhece os indicadores que importam e monta o aviso push.

/** País da Nasdaq -> código da agenda (mesmo da faireconomy) + região usada no texto. */
const COUNTRY = [
  [/^united states|^us$|^usa$/i, "USD", "nos EUA"],
  [/^euro ?(zone|area)|^eurozone|^european (union|monetary)/i, "EUR", "na zona do euro"],
  [/^germany/i, "EUR", "na Alemanha", "DE"],
  [/^united kingdom|^uk$|^great britain/i, "GBP", "no Reino Unido"],
  [/^japan/i, "JPY", "no Japão"],
  [/^china/i, "CNY", "na China"],
];
export const REGION_PT = { USD: "nos EUA", EUR: "na zona do euro", DE: "na Alemanha", GBP: "no Reino Unido", JPY: "no Japão", CNY: "na China", BRL: "no Brasil" }; // prettier-ignore

/** Indicadores que avisam. `de`: vale também para a Alemanha (o resto só para o agregado da zona do euro). */
const BASES = [
  ["rate", /interest rate decision|federal funds rate|fed interest rate|main refinancing rate|deposit (facility )?rate|policy rate|official bank rate|bank rate decision|loan prime rate/i, "Decisão de juros"],
  ["pce", /\bpce\b|personal consumption expenditure/i, "Inflação PCE"],
  ["cpi", /\bcpi\b|\bhicp\b|consumer price/i, "Inflação (CPI)", true],
  ["ppi", /\bppi\b|producer price/i, "Preços ao produtor (PPI)"],
  ["nfp", /^(?!.*adp).*non-?farm (employment change|payrolls)/i, "Payroll (vagas fora do agro)"],
  ["unemp", /unemployment rate|jobless rate/i, "Taxa de desemprego"],
  ["claims", /jobless claims|unemployment claims/i, "Pedidos de seguro-desemprego"],
  ["gdp", /\bgdp\b|gross domestic product/i, "PIB", true],
  ["retail", /retail sales/i, "Vendas no varejo"],
  ["ism_m", /ism manufacturing/i, "ISM indústria"],
  ["ism_s", /ism (services|non-?manufacturing)/i, "ISM serviços"],
  ["pmi_m", /manufacturing pmi/i, "PMI indústria"],
  ["pmi_s", /services pmi|non-?manufacturing pmi/i, "PMI serviços"],
  ["ip", /industrial (production|output)/i, "Produção industrial"],
  ["trade", /trade balance/i, "Balança comercial"],
  ["tankan", /tankan/i, "Tankan (confiança das grandes indústrias)"],
  ["ifo", /\bifo\b/i, "Ifo (clima de negócios)", true],
  ["zew", /\bzew\b/i, "ZEW (expectativas)", true],
]; // prettier-ignore

/** Impacto de mercado: alto (move tudo), médio (move o país/setor). Fora dos EUA só juros, inflação e PIB são altos. */
const HIGH = new Set(["rate", "cpi", "pce", "nfp", "gdp", "retail", "ism_m", "ism_s", "unemp"]);
const HIGH_INTL = new Set(["rate", "cpi", "gdp"]);
const LOW = new Set(["trade"]);
export const impactOf = (cc, base) =>
  LOW.has(base) ? "low" : (cc === "USD" ? HIGH : HIGH_INTL).has(base) ? "high" : "medium";

const BANK = { USD: "do Fed", EUR: "do BCE", GBP: "do BoE", JPY: "do BoJ", CNY: "da China (LPR)" };

/**
 * Reconhece um indicador importante pelo nome (formato da Nasdaq ou da Forex Factory).
 * -> { id, label } ou null. `id` junta país, base, núcleo e período para casar as duas fontes.
 */
export function classifyEvent(cc, name, sub = null) {
  const n = String(name ?? "");
  const b = BASES.find(([, re]) => re.test(n));
  if (!b || (sub === "DE" && !b[3])) return null;
  const [base, , pt] = b;
  if (/\bspeech|speaks|minutes|statement|press conference|expectations\b/i.test(n) && base !== "zew" && base !== "ifo") return null; // prettier-ignore
  if (base === "trade" && cc === "USD") return null; // balança dos EUA mexe pouco
  const core = /\bcore\b/i.test(n) ? "core" : "";
  const per = /m\/m|\bmom\b|month/i.test(n) ? "mm" : /y\/y|\byoy\b|year/i.test(n) ? "yy" : /q\/q|\bqoq\b|quarter/i.test(n) ? "qq" : ""; // prettier-ignore
  const prelim = /flash|prelim|advance/i.test(n) ? "p" : "";
  const perPT = { mm: " m/m", yy: " a/a", qq: " t/t" }[per] ?? "";
  const label =
    base === "rate"
      ? `Decisão de juros ${BANK[cc] ?? ""}`.trim()
      : `${pt}${core ? " núcleo" : ""}${perPT}${prelim ? " (prévia)" : ""}${per || /^(ism|pmi|tankan|ifo|zew|unemp)/.test(base) ? "" : ` (${n.trim()})`}`;
  // componentes do relatório do PIB (deflator, vendas, consumo, "PCE Prices" trimestral) movem menos que a manchete
  const part = (base === "gdp" && /price|deflator|sales|capital|consumption|demand|expenditure|investment/i.test(n)) || (base === "pce" && /\bprices\b/i.test(n)) || /dallas|\bboj\b|trimmed/i.test(n); // prettier-ignore
  const impact = part && impactOf(cc, base) === "high" ? "medium" : impactOf(cc, base);
  return { id: [sub ?? cc, base, core, per].join(":"), label, impact };
}

/** Número de um campo ("0.3%", "254K", "-1.2B", "4.25%") ou null. */
export function num(s) {
  const m = String(s ?? "")
    .replace(/[−–]/g, "-")
    .replace(/,/g, "")
    .match(/-?\d+(\.\d+)?/);
  if (!m) return null;
  const mult = { K: 1e3, M: 1e6, B: 1e9, T: 1e12 }[String(s).trim().slice(-1).toUpperCase()] ?? 1;
  return Number(m[0]) * mult;
}

const clean = (s) => {
  const t = String(s ?? "").trim();
  return !t || /^(-|–|n\/?a|null|&nbsp;)$/i.test(t) ? null : t;
};

/** Diferença de Nova York para UTC (s) numa data: 4 h no horário de verão, 5 h no resto do ano. */
function nyOffset(date) {
  const p = new Intl.DateTimeFormat("en-US", { timeZone: "America/New_York", timeZoneName: "shortOffset" }).formatToParts(new Date(`${date}T12:00:00Z`)); // prettier-ignore
  const m = p.find((x) => x.type === "timeZoneName")?.value.match(/GMT([+-]\d+)/);
  return m ? -Number(m[1]) * 3600 : 4 * 3600;
}

/** "08:30", "8:30 AM", "13:45" -> segundos desde 0h (horário de Nova York); null quando "All Day"/"Tentative". */
function clockSec(g) {
  const m = String(g ?? "").match(/(\d{1,2}):(\d{2})\s*(AM|PM)?/i);
  if (!m) return null;
  let h = Number(m[1]) % (m[3] ? 12 : 24);
  if (m[3] && m[3].toUpperCase() === "PM") h += 12;
  return h * 3600 + Number(m[2]) * 60;
}

/**
 * Linhas da Nasdaq de um dia (date = "AAAA-MM-DD", horário GMT) -> indicadores reconhecidos
 * { t, cc, sub, id, label, name, actual, consensus, previous }. `t` = null quando a fonte não dá a hora.
 */
export function normalizeNasdaqEco(rows, date) {
  const day = Date.parse(`${date}T00:00:00Z`) / 1000;
  const out = [];
  for (const r of Array.isArray(rows) ? rows : []) {
    const c = COUNTRY.find(([re]) => re.test(String(r?.country ?? "").trim()));
    if (!c) continue;
    const [, cc, , sub = null] = c;
    const k = classifyEvent(cc, r.eventName, sub);
    if (!k) continue;
    const s = clockSec(r.gmt);
    out.push({
      t: Number.isFinite(day) && s != null ? day + s + nyOffset(date) : null,
      date,
      cc,
      sub,
      ...k,
      name: String(r.eventName),
      actual: clean(r.actual),
      consensus: clean(r.consensus),
      previous: clean(r.previous),
    });
  }
  return out;
}

/**
 * Brasil (agenda Onshore): indicadores [id, regex, rótulo, impacto], na ordem em que são testados. Fica separado
 * da lista acima de propósito: os avisos push e a agenda Offshore seguem só com EUA, Europa, Reino Unido e Ásia.
 */
const BR_BASES = [
  ["copom_ata", /copom minutes|monetary policy (meeting )?minutes/i, "Ata do Copom", "medium"],
  ["selic", /interest rate decision|selic/i, "Decisão de juros do Copom (Selic)", "high"],
  ["ipca15", /ipca-?15|mid-month (cpi|inflation)/i, "IPCA-15 (prévia da inflação)", "high"],
  ["ipca", /\bipca\b|inflation rate|\bcpi\b|consumer price/i, "Inflação (IPCA)", "high"],
  ["igpm", /igp-?m/i, "IGP-M", "medium"],
  ["igpdi", /igp-?di/i, "IGP-DI", "low"],
  ["igp10", /igp-?10/i, "IGP-10", "low"],
  ["fipe", /ipc-?fipe/i, "IPC-Fipe (inflação em São Paulo)", "low"],
  ["ppi", /\bppi\b|producer price/i, "Preços ao produtor (IPP)", "low"],
  ["fx", /foreign exchange flows?/i, "Fluxo cambial (BCB)", "medium"],
  ["cftc", /cftc brl/i, "Posição especulativa em real (CFTC)", "low"],
  ["credit", /bank lending|loan growth|credit/i, "Crédito bancário", "low"],
  ["tax", /tax revenue/i, "Arrecadação federal", "low"],
  ["fiscal", /budget|primary (balance|surplus|result)|government debt|debt-to-gdp/i, "Resultado fiscal e dívida", "medium"],
  ["gdp", /\bgdp\b|gross domestic product/i, "PIB", "high"],
  ["ibc", /ibc-?br|economic activity/i, "IBC-Br (prévia do PIB)", "medium"],
  ["caged", /caged|formal (job|employment)|net payrolls?|new jobs/i, "Emprego formal (Caged)", "medium"],
  ["unemp", /unemployment|jobless rate/i, "Desemprego (PNAD)", "medium"],
  ["retail", /retail sales/i, "Vendas no varejo", "medium"],
  ["ip", /industrial (production|output)/i, "Produção industrial", "medium"],
  ["services", /services volume|business services|service sector/i, "Volume de serviços", "medium"],
  ["trade", /trade balance|balance of trade/i, "Balança comercial", "low"],
  ["ca", /current account/i, "Transações correntes", "low"],
  ["fdi", /foreign direct investment/i, "Investimento estrangeiro direto", "low"],
  ["pmi_m", /manufacturing pmi/i, "PMI indústria", "low"],
  ["pmi_s", /services pmi|composite pmi/i, "PMI serviços", "low"],
  ["conf", /confidence|\bpcsi\b|sentiment/i, "Confiança", "low"],
  ["focus", /focus|market (readout|expectations)/i, "Boletim Focus", "low"],
]; // prettier-ignore
export const BR_KIND_OF = { selic: "juros", copom_ata: "juros", credit: "juros", ipca: "inflacao", ipca15: "inflacao", igpm: "inflacao", igpdi: "inflacao", igp10: "inflacao", fipe: "inflacao", ppi: "inflacao", focus: "inflacao", caged: "emprego", unemp: "emprego", fiscal: "fiscal", tax: "fiscal", trade: "externo", ca: "externo", fdi: "externo", fx: "externo", cftc: "externo" }; // prettier-ignore
export const BR_KIND_PT = { juros: "Juros", inflacao: "Inflação", emprego: "Emprego", atividade: "Atividade", fiscal: "Fiscal", externo: "Contas externas" }; // prettier-ignore
export const brKindOf = (id) => BR_KIND_OF[String(id).split(":")[1]] ?? "atividade";

/** Indicador do Brasil pelo nome da Nasdaq -> { id, label, impact } (sem reconhecimento: o nome original, impacto baixo). */
export function classifyBR(name) {
  const n = String(name ?? "").trim();
  const b = BR_BASES.find(([, re]) => re.test(n));
  const core = /\bcore\b/i.test(n) ? "core" : "";
  const per = /y\/y|\byoy\b/i.test(n) ? "yy" : /m\/m|\bmom\b|(?<!mid-)month/i.test(n) ? "mm" : /year/i.test(n) ? "yy" : /q\/q|\bqoq\b|quarter/i.test(n) ? "qq" : ""; // prettier-ignore
  const perPT = { mm: " m/m", yy: " a/a", qq: " t/t" }[per] ?? "";
  const hol = n.match(/^brazil\s*-\s*(.+)$/i);
  if (hol) return { id: `BR:hol:${hol[1].toLowerCase().replace(/\W+/g, "-")}`, label: `Feriado: ${hol[1]} (B3 fechada)`, impact: "holiday" }; // prettier-ignore
  if (!b) return { id: `BR:x:${n.toLowerCase().replace(/\W+/g, "-")}`, label: n, impact: "low" };
  const [base, , label, impact] = b;
  return {
    id: ["BR", base, core, per].join(":"),
    label: `${label}${core ? " núcleo" : ""}${perPT}`,
    impact,
  };
}

/**
 * A Nasdaq repete o mesmo evento em dois dias seguidos (mesmo nome, projeção e anterior, < 1,5 dia de distância):
 * fica o primeiro. Eventos semanais (Focus, fluxo cambial) estão a 7 dias e não se juntam.
 */
export function dedupeBR(events) {
  const kept = [];
  const key = (e) => `${e.name}|${e.consensus ?? ""}|${e.previous ?? ""}`;
  const at = (e) => e.t ?? Date.parse(`${e.date}T12:00:00Z`) / 1000;
  for (const e of [...events].sort((a, b) => at(a) - at(b))) {
    const twin = kept.find((k) => key(k) === key(e) && Math.abs(at(k) - at(e)) < 1.5 * 86400);
    if (!twin) kept.push(e);
    else if (e.actual && !twin.actual) kept[kept.indexOf(twin)] = e;
  }
  return kept;
}

/** Linhas da Nasdaq de um dia -> eventos do Brasil { t, date, cc: "BRL", id, label, name, impact, actual, consensus, previous }. */
export function normalizeNasdaqEcoBR(rows, date) {
  const day = Date.parse(`${date}T00:00:00Z`) / 1000;
  const out = [];
  for (const r of Array.isArray(rows) ? rows : []) {
    if (!/^brazil/i.test(String(r?.country ?? "").trim())) continue;
    const s = clockSec(r.gmt);
    out.push({
      t: Number.isFinite(day) && s != null ? day + s + nyOffset(date) : null,
      date,
      cc: "BRL",
      ...classifyBR(r.eventName),
      name: String(r.eventName),
      actual: clean(r.actual),
      consensus: clean(r.consensus),
      previous: clean(r.previous),
    });
  }
  return out;
}

const pt = (s) => String(s).replace(/(\d)\.(\d)/g, "$1,$2");

/** Frase do aviso: "Inflação (CPI) a/a nos EUA foi de 3,1%, acima da expectativa de mercado de 3,0% (anterior: 2,9%)." */
export function macroSentence(e) {
  const where = REGION_PT[e.sub ?? e.cc] ?? "";
  const a = num(e.actual);
  const c = num(e.consensus);
  let vs = " (sem projeção do mercado)";
  if (e.consensus && a != null && c != null) {
    const eps = Math.max(Math.abs(c), 1) * 1e-9;
    vs = a > c + eps ? `, acima da expectativa de mercado de ${pt(e.consensus)}` : a < c - eps ? `, abaixo da expectativa de mercado de ${pt(e.consensus)}` : `, em linha com a expectativa de mercado de ${pt(e.consensus)}`; // prettier-ignore
  }
  const prev = e.previous ? ` (anterior: ${pt(e.previous)})` : "";
  return `${e.label} ${where} foi de ${pt(e.actual)}${vs}${prev}.`.replace(/\s+/g, " ");
}

/**
 * Avisos dos dados já divulgados nas últimas `window` horas (o cron roda a cada 10 min; a chave evita repetir).
 * Sem hora na fonte, vale o dia de hoje (UTC).
 */
/** Dado já divulgado com hora "no futuro": a Nasdaq põe a Ásia no dia local com a hora da véspera em Nova York. */
export const fixT = (e, nowSec) => (e.t > nowSec + 300 && e.actual ? e.t - 86400 : e.t);

/** ETFs de país negociados nos EUA -> região do dado que mexe com eles (o resto listado nos EUA = EUA). */
const COUNTRY_ETF = {
  BRL: ["EWZ", "EWZS", "BRZU", "FLBR", "BRF"],
  JPY: ["EWJ", "DXJ", "BBJP", "FLJP", "HEWJ", "SCJ", "JPXN"],
  CNY: ["FXI", "MCHI", "KWEB", "ASHR", "GXC", "CQQQ", "YINN", "CHIQ", "KBA", "CNYA"],
  DE: ["EWG", "DAX", "FLGR", "HEWG"],
  GBP: ["EWU", "FLGB", "EWUS"],
  EUR: ["VGK", "EZU", "FEZ", "IEUR", "HEDJ", "IEV", "DBEU", "EWQ", "EWI", "EWP", "EWN"],
}; // prettier-ignore
const ETF_REGION = Object.fromEntries(Object.entries(COUNTRY_ETF).flatMap(([r, l]) => l.map((s) => [s, r]))); // prettier-ignore
const SUFFIX_REGION = { SA: "BRL", T: "JPY", HK: "CNY", SS: "CNY", SZ: "CNY", DE: "DE", F: "DE", L: "GBP", PA: "EUR", AS: "EUR", MI: "EUR", MC: "EUR" }; // prettier-ignore

/** Região cujo dado macro mexe com o ativo. */
export function symRegion(sym) {
  const s = String(sym ?? "").toUpperCase();
  const suf = s.match(/\.([A-Z]{1,2})$/)?.[1];
  if (suf && SUFFIX_REGION[suf]) return SUFFIX_REGION[suf];
  return ETF_REGION[s] ?? "USD";
}

/**
 * Exposição da carteira por região: { região: { syms (maiores primeiro), w (fração do valor) } }.
 * Ativo da Alemanha também conta para a zona do euro (o dado do agregado mexe com ele).
 */
export function exposure(holdings) {
  const val = (h) => Number(h.invValue) || Number(h.qty) * (Number(h.invPrice) || Number(h.avg)) || 0; // prettier-ignore
  const list = (holdings ?? []).filter((h) => h?.sym);
  const total = list.reduce((a, h) => a + Math.max(val(h), 0), 0);
  const out = {};
  const add = (r, h) => {
    const x = (out[r] ??= { syms: [], v: 0 });
    x.syms.push([h.sym, val(h)]);
    x.v += Math.max(val(h), 0);
  };
  for (const h of list) {
    const r = symRegion(h.sym);
    add(r, h);
    if (r === "DE") add("EUR", h);
  }
  for (const x of Object.values(out)) {
    x.syms = x.syms.sort((a, b) => b[1] - a[1]).map(([s]) => s);
    x.w = total > 0 ? x.v / total : null;
    delete x.v;
  }
  return out;
}

/** "SPY, QQQ, NVDA +4 (82% da carteira)". */
export function exposureText(x) {
  const names = x.syms.slice(0, 3).join(", ") + (x.syms.length > 3 ? ` +${x.syms.length - 3}` : "");
  const w = x.w != null ? ` (${Math.round(x.w * 100)}% da carteira)` : "";
  return `${names}${w}`;
}

/**
 * Avisos dos dados já divulgados nas últimas `window` horas (o robô roda a cada minuto; a chave evita repetir).
 * Sem hora na fonte, vale o dia de hoje (UTC). Filtro (`all` = false): alto impacto sempre; médio só quando a
 * carteira tem ativo na região do dado; baixo nunca. Dado que mexe com a carteira vem primeiro, marcado com 💼 e
 * com os ativos atingidos.
 */
export function macroAlerts(
  events,
  nowSec,
  { window = 6 * 3600, holdings = [], all = false } = {},
) {
  const today = new Date(nowSec * 1000).toISOString().slice(0, 10);
  const exp = exposure(holdings);
  return (events ?? [])
    .filter(
      (e) => e.actual && (e.t != null ? fixT(e, nowSec) >= nowSec - window : e.date === today),
    )
    .map((e) => ({ e, x: exp[e.sub ?? e.cc] ?? null, imp: e.impact ?? "medium" }))
    .filter(({ x, imp }) => all || imp === "high" || (imp === "medium" && x))
    .sort((a, b) => (b.x ? 2 : 0) + (b.imp === "high") - ((a.x ? 2 : 0) + (a.imp === "high")))
    .map(({ e, x }) => ({
      key: `macro:${e.date}:${e.id}:${e.name}:${e.consensus ?? ""}:${e.previous ?? ""}`.slice(
        0,
        200,
      ),
      title: topicTitle("macro", `${x ? "💼 " : ""}${e.label} ${REGION_PT[e.sub ?? e.cc] ?? ""}`.trim()), // prettier-ignore
      body: macroSentence(e) + (x ? ` Na carteira: ${exposureText(x)}.` : ""),
      tag: `macro:${releaseKey(e)}`.slice(0, 120),
      id: e.id,
      url: e.cc === "BRL" ? "./?tab=brcal" : "./?tab=calendar",
    }));
}

/**
 * Leva o "atual" (e a projeção, quando faltar) da Nasdaq para os eventos da agenda (Forex Factory):
 * mesmo indicador (id) e horário até 2 h de diferença (ou o mesmo dia, sem hora na Nasdaq).
 */
export function attachActuals(events, eco) {
  const done = (eco ?? []).filter((x) => x.actual);
  if (!done.length) return events;
  const dayOf = (t) => new Date(t * 1000).toISOString().slice(0, 10);
  const near = (x, e) => (x.t != null ? [0, 86400, -86400].some((d) => Math.abs(x.t + d - e.t) <= 7200) : x.date === dayOf(e.t)); // prettier-ignore
  const stem = (id) => id.split(":").slice(0, 3).join(":"); // país:base:núcleo (sem o período)
  const same = (a, b) => a != null && b != null && num(a) === num(b);
  return events.map((e) => {
    const k = classifyEvent(e.cc, e.title, /^german/i.test(e.title) ? "DE" : null);
    if (!k) return e;
    const cands = done.filter((x) => near(x, e));
    // 1º o mesmo indicador e período; senão a Nasdaq sem período no nome (ex.: "Core PCE Price Index" m/m e a/a),
    // escolhida pela projeção igual à da agenda (ou pelo anterior)
    // várias linhas do mesmo indicador (ex.: pedidos iniciais, contínuos e média de 4 semanas): só com o anterior ou a
    // projeção iguais
    const pick = (l) => (l.length === 1 ? l[0] : l.find((x) => same(x.consensus, e.forecast) || same(x.previous, e.previous))); // prettier-ignore
    const hit =
      pick(cands.filter((x) => x.id === k.id)) ??
      cands.find((x) => x.id.endsWith(":") && stem(x.id) === stem(k.id) && (same(x.consensus, e.forecast) || same(x.previous, e.previous))); // prettier-ignore
    return hit ? { ...e, actual: hit.actual, forecast: e.forecast ?? hit.consensus } : e;
  });
}

/** Grupos de tipo de dado para filtrar o histórico. */
export const KIND_OF = { rate: "juros", cpi: "inflacao", pce: "inflacao", ppi: "inflacao", nfp: "emprego", unemp: "emprego", claims: "emprego" }; // prettier-ignore
export const KIND_PT = {
  juros: "Juros",
  inflacao: "Inflação",
  emprego: "Emprego",
  atividade: "Atividade",
};
export const kindOf = (id) => KIND_OF[String(id).split(":")[1]] ?? "atividade";

/** Últimos `n` dados divulgados (com valor), do mais recente ao mais antigo, sem repetir. */
export function releasedHistory(eco, n = 50, nowSec = Date.now() / 1000) {
  const seen = new Set();
  return (eco ?? [])
    .filter((e) => e.actual)
    .map((e) => ({ ...e, t: e.t != null ? fixT(e, nowSec) : null }))
    .filter((e) => {
      const k = `${e.date}|${e.id}|${e.name}`;
      return !seen.has(k) && seen.add(k);
    })
    .sort((a, b) => (b.t ?? Date.parse(b.date) / 1000) - (a.t ?? Date.parse(a.date) / 1000))
    .slice(0, n)
    .map((e) => ({ t: e.t, date: e.date, cc: e.cc, sub: e.sub, id: e.id, label: e.label, impact: e.impact, name: e.name, actual: e.actual, consensus: e.consensus, previous: e.previous })); // prettier-ignore
}
