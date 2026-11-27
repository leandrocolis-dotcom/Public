// Barra de comandos (estilo Bloomberg): mnemônicos curtos levam a abas ou a funções de um ativo.
// Puro, para testar. Ex.: "PORT" -> Carteira; "SPY TA" -> página do ativo SPY; "AAPL AN" -> Análise.

/** Mnemônicos de aba: chave digitada -> id da aba (ver TABS em state.js). */
export const TAB_CMDS = {
  INICIO: "home", HOME: "home", DASH: "dash", PAINEL: "dash", MERCADO: "dash", MACRO: "macro", ECON: "macro",
  OFF: "dash", OFFSHORE: "dash", ON: "local", ONSHORE: "local",
  LOCAL: "local", BR: "local", BRASIL: "local", IBOV: "local", B3: "local",
  BRMACRO: "brmacro", BCB: "brmacro", FOCUS: "brmacro", BRNEWS: "brnews", BRN: "brnews",
  BRCAL: "brcal", COPOM: "brcal", BRFLOW: "brflow", BRFLUXO: "brflow",
  PORT: "portfolio", CART: "portfolio", CARTEIRA: "portfolio",
  REB: "rebal", REBAL: "rebal", RF: "rfix", CDB: "rfix", LCI: "rfix", LCA: "rfix",
  GAT: "trig", GATILHOS: "trig", AGORA: "trig", DEC: "trig", SIG: "trig", SINAIS: "trig",
  SIM: "sim", PLACAR: "sim",
  NEWS: "news", N: "news", TOP: "news",
  FLOW: "flow", MAPA: "flow", HEAT: "flow",
  CHK: "checks", VER: "checks",
  CFG: "settings", SET: "settings",
  CAL: "calendar", ECO: "calendar", AGENDA: "calendar",
  RISK: "risk", RISCO: "risk",
  DIARIO: "journal", JOURNAL: "journal", DIÁRIO: "journal",
  SCR: "screener", EQS: "screener", FILTRO: "screener", SCAN: "screener", VOL: "screener",
  JUROS: "rates", RATES: "rates", CURVA: "rates", BRJUROS: "brrates", BRCURVA: "brrates",
  WATCH: "watch", WL: "watch", BRWATCH: "brwatch", NOTICIAS: "news",
}; // prettier-ignore

/** Funções de ativo: "<TICKER> <FUNÇÃO>". */
export const ASSET_CMDS = {
  DES: { go: "page", label: "Página do ativo" },
  GP: { go: "page", label: "Gráfico e página do ativo" },
  TA: { go: "page", label: "Gráfico e níveis (página do ativo)" },
  AN: { go: "analysis", label: "Análise integrada" },
}; // prettier-ignore

const TICKER = /^[A-Z0-9^][A-Z0-9.\-=^]{0,14}$/;

/**
 * Interpreta o texto da barra.
 * @returns {{type:"tab",tab:string}|{type:"asset",sym:string,go:string}|null}
 */
export function parseCommand(raw, tabIds = null) {
  const q = String(raw ?? "")
    .trim()
    .toUpperCase()
    .replace(/\s+/g, " ");
  if (!q) return null;
  const parts = q.split(" ");
  if (parts.length === 1) {
    const tab = TAB_CMDS[q];
    if (tab && (!tabIds || tabIds.includes(tab))) return { type: "tab", tab };
    return null;
  }
  if (parts.length === 2) {
    const [sym, fn] = parts;
    const c = ASSET_CMDS[fn];
    if (c && TICKER.test(sym)) return { type: "asset", sym, go: c.go };
  }
  return null;
}

/** Sugestões de comando para o texto digitado (prefixo do mnemônico). */
export function suggestCommands(raw, tabNames, max = 4) {
  const q = String(raw ?? "")
    .trim()
    .toUpperCase();
  if (!q || q.includes(" ")) {
    const p = parseCommand(q, Object.keys(tabNames));
    if (p?.type === "asset") {
      const fn = q.split(" ")[1];
      return [{ cmd: q, ...p, label: `${p.sym}: ${ASSET_CMDS[fn].label}` }];
    }
    return [];
  }
  const all = Object.entries(TAB_CMDS)
    .filter(([k, tab]) => k.startsWith(q) && tabNames[tab])
    .map(([k, tab]) => ({
      cmd: k,
      type: "tab",
      tab,
      label: `Ir para ${tabNames[tab]}`,
      exact: k === q,
    }))
    .sort((a, b) => b.exact - a.exact || a.cmd.length - b.cmd.length);
  const seen = new Set();
  return all.filter((x) => !seen.has(x.tab) && seen.add(x.tab)).slice(0, max);
}
