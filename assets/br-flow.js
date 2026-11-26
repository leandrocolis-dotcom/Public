// Fluxo Onshore (B3) no mesmo motor do Fluxo Offshore (flow-engine.js): universo próprio, tabela
// { dates, close, vol } montada do histórico de 1 ano (com volume) + cotação ao vivo, fases do pregão da B3
// e a curva de volume intradiário medida no estudo (data/br-flow-study.json). Puro (sem DOM).
import { BR_SECTORS, buildClose, dayIn, tick } from "./br.js";

const SA = (t) => `${t}.SA`;

/** Grupos do mapa. "br_sectors" (cestas S:<setor>) só existe na rotação: noHeat tira do mapa de calor. */
export const BR_FLOW_GROUPS = [
  { id: "br_idx", label: "Índices e ETFs da B3", bench: "^BVSP" },
  ...BR_SECTORS.map((s) => ({ id: `br_${s.key}`, label: s.label, bench: "^BVSP" })),
  { id: "br_rf", label: "Juros (ETFs de renda fixa)", bench: SA("LFTS11") },
  { id: "br_ny", label: "Brasil em Nova York", bench: "EWZ" },
  { id: "br_fx", label: "Real e emergentes contra o US$", bench: null },
  { id: "br_cmd", label: "Commodities da B3", bench: null },
  { id: "br_sectors", label: "Setores da B3 × Ibovespa", bench: "^BVSP", noHeat: true },
];

const RAW = [
  ["^BVSP", "Ibovespa", "Ibovespa", "br_idx", { nt: true }],
  [SA("BOVA11"), "BOVA11", "Ibovespa (BOVA11)", "br_idx"],
  [SA("SMAL11"), "SMAL11", "Small caps (SMAL11)", "br_idx"],
  [SA("DIVO11"), "DIVO11", "Dividendos (DIVO11)", "br_idx"],
  [SA("IVVB11"), "IVVB11", "S&P 500 em R$ (IVVB11)", "br_idx"],
  ...BR_SECTORS.flatMap((s) => s.members.map((sym) => [sym, tick(sym), tick(sym), `br_${s.key}`])),
  // LFTS11 (Tesouro Selic) quase não oscila: σ minúsculo faria ruído virar sinal; fica só como benchmark dos juros
  [SA("IRFM11"), "IRFM11", "Prefixados (IRFM11)", "br_rf"],
  [SA("IMAB11"), "IMAB11", "IPCA+ (IMAB11)", "br_rf"],
  [SA("B5P211"), "B5P211", "IPCA+ até 5 anos (B5P211)", "br_rf"],
  ["EWZ", "EWZ", "Brasil (EWZ)", "br_ny"],
  ["EWZS", "EWZS", "Small caps Brasil (EWZS)", "br_ny"],
  ["PBR", "PBR", "Petrobras (PBR)", "br_ny"],
  ["VALE", "VALE", "Vale (VALE)", "br_ny"],
  ["ITUB", "ITUB", "Itaú (ITUB)", "br_ny"],
  ["NU", "NU", "Nubank (NU)", "br_ny"],
  ["BRL=X", "Real", "Real contra o dólar", "br_fx", { inv: true }],
  ["EURBRL=X", "Real/euro", "Real contra o euro", "br_fx", { inv: true }],
  ["MXN=X", "Peso MX", "Peso mexicano contra o dólar", "br_fx", { inv: true }],
  ["CLP=X", "Peso CL", "Peso chileno contra o dólar", "br_fx", { inv: true }],
  ["ZAR=X", "Rand", "Rand sul-africano contra o dólar", "br_fx", { inv: true }],
  ["BZ=F", "Brent", "Petróleo Brent", "br_cmd"],
  ["ZS=F", "Soja", "Soja", "br_cmd"],
  ["ZC=F", "Milho", "Milho", "br_cmd"],
  ["KC=F", "Café", "Café", "br_cmd"],
  ["SB=F", "Açúcar", "Açúcar", "br_cmd"],
  ["LE=F", "Boi", "Boi gordo (EUA)", "br_cmd"],
  ["GC=F", "Ouro", "Ouro", "br_cmd"],
  ...BR_SECTORS.map((s) => [
    `S:${s.key}`,
    s.label,
    `Setor ${s.label} (cesta de peso igual)`,
    "br_sectors",
  ]),
];

export const BR_FLOW_ASSETS = RAW.map(([sym, label, name, group, opt = {}]) => ({
  sym,
  label,
  name,
  group,
  inv: !!opt.inv,
  yld: false,
  risk: false,
  nt: !!opt.nt,
}));

const BY_SYM = Object.fromEntries(BR_FLOW_ASSETS.map((a) => [a.sym, a]));
BY_SYM[SA("LFTS11")] = { sym: SA("LFTS11"), label: "LFTS11", name: "Tesouro Selic (LFTS11)" };

/** Símbolos reais que precisam de histórico com volume (as cestas S: são montadas no app). */
export const BR_FLOW_SYMBOLS = BR_FLOW_ASSETS.filter((a) => !a.sym.startsWith("S:")).map((a) => a.sym); // prettier-ignore

const PHASES = {
  pre: {
    title: "Pré-abertura da B3 (9:45–10:00)",
    text: "Leilão de abertura: há ofertas, mas quase nenhum negócio. O fluxo da tela ainda é o do último pregão; a prévia vem do EWZ e dos ADRs em Nova York e do dólar.",
  },
  closed: {
    title: "Pregão da B3 fechado",
    text: "Fluxo do último pregão. Fora do pregão, o EWZ e os ADRs no pré/pós de Nova York antecipam a abertura.",
  },
  replay: { title: "Replay", text: "Fluxo do pregão escolhido na barra do replay." },
};

/** Fase do pregão da B3 com o texto de leitura de cada janela. */
export function brPhase(session, frac = 1) {
  if (session !== "open") return { id: session, ...(PHASES[session] ?? PHASES.closed) };
  if (frac < 0.15)
    return {
      id: "open1",
      title: "Abertura do pregão (primeira hora)",
      text: "Começo mais volátil: o fluxo ainda se acomoda e falsas partidas são comuns. A abertura de Nova York (10:30 no horário de verão dos EUA, 11:30 no resto do ano) costuma redefinir o fluxo do estrangeiro.",
    };
  if (frac > 0.85)
    return {
      id: "open3",
      title: "Última hora do pregão",
      text: "O fluxo que chega ao leilão de fechamento é o mais confiável do dia. Movimento tardio com volume mostra quem leva posição para o dia seguinte.",
    };
  return {
    id: "open2",
    title: "Meio do pregão",
    text: "O fluxo já tem direção. Procure setores que ganham força contra o Ibovespa e ações fortes nesses setores, com volume acima da média.",
  };
}

/** Universo Onshore para o motor do fluxo (mesmo formato de OFF_UNI em flow-engine.js). */
export const BR_UNI = {
  id: "br",
  assets: BR_FLOW_ASSETS,
  groups: BR_FLOW_GROUPS,
  byId: Object.fromEntries(BR_FLOW_GROUPS.map((g) => [g.id, g])),
  bySym: BY_SYM,
  // apetite a risco no Brasil: bolsa, Brasil em NY, real e prefixados (juros caindo) subindo
  tone: ["br_idx", "br_ny", "br_fx", "br_rf"],
  // câmbio e commodities (futuros nos EUA) contam para o tom, não viram candidatos de compra na B3
  notTradable: new Set(["br_fx", "br_cmd", "br_sectors"]),
  phase: brPhase,
  rotDefault: "br_sectors",
};

/** Preferências do Fluxo Onshore (as do Offshore ficam intactas): nome usado no motor -> chave salva. */
export const BR_FLOW_PREFS = {
  flowHorizon: "brFlowHorizon",
  flowGroup: "brFlowGroup",
  flowSize: "brFlowSize",
  rotGroup: "brRotGroup",
  rotWin: "brRotWin",
  flowStrong: "brFlowStrong",
};

/** Volume diário alinhado às datas da B3 (pregão sem dado = 0, que o volume relativo ignora). */
function alignVol(dates, src) {
  const at = new Map(src.dates.map((d, i) => [d, src.vol[i]]));
  return dates.map((d) => at.get(d) ?? 0);
}

/**
 * Tabela do fluxo no formato de data/flow.json ({ dates, close, vol, last_real }) a partir do histórico
 * ({ SÍMBOLO: { dates, close, vol } }) e das cotações ao vivo. Fechamentos vêm de buildClose (preço ao vivo no
 * último ponto e o fechamento anterior oficial da cotação no penúltimo: variação do dia = p ÷ pc). O volume de
 * hoje é o da cotação (v), mais novo que o do histórico.
 */
export function brFlowTable(hist, quotes = {}) {
  const built = buildClose(hist, quotes);
  if (!built) return null;
  const { dates, close } = built;
  const last = dates.at(-1);
  const vol = {};
  for (const sym of BR_FLOW_SYMBOLS) {
    const src = hist?.[sym];
    if (!src?.vol?.length || src.vol.length !== src.dates.length || !close[sym]) continue;
    const v = alignVol(dates, src);
    const q = quotes[sym];
    if (q?.v > 0 && q.t && dayIn(q.t) === last) v[v.length - 1] = q.v;
    vol[sym] = v;
  }
  return { dates, close, vol, last_real: {} };
}

/**
 * Parcela do volume do dia que costuma ter saído até a fração `frac` do pregão. Com a curva medida no estudo
 * ([[frac, parcela], ...], crescente) interpola; sem ela, linear (como no Offshore). O volume relativo do dia
 * divide o volume até agora por essa parcela da média: sem isso, no meio do pregão todo ativo pareceria fraco.
 */
export function volShare(frac, curve) {
  const f = Math.max(0, Math.min(1, frac));
  if (!Array.isArray(curve) || curve.length < 2) return f;
  const pts = [[0, 0], ...curve.filter(([x, y]) => x > 0 && x < 1 && y > 0 && y < 1), [1, 1]];
  for (let i = 1; i < pts.length; i++) {
    const [x0, y0] = pts[i - 1];
    const [x1, y1] = pts[i];
    if (f <= x1) return x1 === x0 ? y1 : y0 + ((f - x0) / (x1 - x0)) * (y1 - y0);
  }
  return 1;
}
