// Universo do Mercado › Local (Brasil): quadros, setores da B3, razões do regime e a lista de símbolos.
// Sem dependências: o /api/quotes também importa (as cotações da B3 vão no canal de tempo real).
const SA = (t) => `${t}.SA`;

/** Quadros de cotação: [símbolo, rótulo, tipo ("px" | "yld")]. IBOV_USD é sintético (Ibovespa ÷ USD/BRL). */
export const BR_PANELS = [
  ["Bolsa B3", [["^BVSP", "Ibovespa"], ["IBOV_USD", "Ibovespa em US$"], [SA("BOVA11"), "Ibovespa (BOVA11)"], [SA("SMAL11"), "Small caps (SMAL11)"], [SA("DIVO11"), "Dividendos (DIVO11)"], [SA("IVVB11"), "S&P 500 em R$ (IVVB11)"]]],
  ["Brasil em Nova York", [["EWZ", "Brasil (EWZ)"], ["EWZS", "Small caps (EWZS)"], ["PBR", "Petrobras (PBR)"], ["VALE", "Vale (VALE)"], ["ITUB", "Itaú (ITUB)"], ["NU", "Nubank (NU)"]]],
  ["Juros e renda fixa", [[SA("LFTS11"), "Tesouro Selic (LFTS11)"], [SA("IRFM11"), "Prefixados (IRFM11)"], [SA("IMAB11"), "IPCA+ (IMAB11)"], [SA("B5P211"), "IPCA+ até 5 anos (B5P211)"]]],
  ["Câmbio", [["BRL=X", "USD/BRL"], ["EURBRL=X", "EUR/BRL"], ["DX-Y.NYB", "DXY"], ["MXN=X", "USD/MXN"], ["CLP=X", "USD/CLP"], ["ZAR=X", "USD/ZAR"]]],
  ["Commodities da B3", [["BZ=F", "Brent"], ["ZS=F", "Soja"], ["ZC=F", "Milho"], ["KC=F", "Café"], ["SB=F", "Açúcar"], ["LE=F", "Boi gordo (EUA)"], ["GC=F", "Ouro"]]],
]; // prettier-ignore

/** Setores da B3 como cestas de ações de peso igual (variação = média das variações das ações). */
export const BR_SECTORS = [
  ["fin", "Financeiro", ["ITUB4", "BBDC4", "BBAS3", "SANB11", "BPAC11", "B3SA3", "ITSA4"]],
  ["oil", "Petróleo e gás", ["PETR4", "PETR3", "PRIO3", "VBBR3", "UGPA3"]],
  ["min", "Mineração e siderurgia", ["VALE3", "GGBR4", "CSNA3", "USIM5", "CMIN3"]],
  ["pap", "Papel, celulose e agro", ["SUZB3", "KLBN11", "SLCE3", "SMTO3"]],
  ["util", "Energia e saneamento", ["EQTL3", "CMIG4", "CPFE3", "EGIE3", "TAEE11", "SBSP3"]],
  ["cons", "Consumo básico", ["ABEV3", "ASAI3", "BEEF3"]],
  ["var", "Varejo e consumo cíclico", ["MGLU3", "LREN3", "AZZA3", "CEAB3", "VIVA3", "RENT3"]],
  ["imob", "Construção e shoppings", ["CYRE3", "MRVE3", "EZTC3", "DIRR3", "MULT3"]],
  ["sau", "Saúde", ["RDOR3", "HAPV3", "FLRY3", "RADL3", "HYPE3"]],
  ["ind", "Industriais e transporte", ["WEGE3", "RAIL3", "MOTV3", "POMO4"]],
  ["tel", "Telecom e tecnologia", ["VIVT3", "TIMS3", "TOTS3"]],
].map(([key, label, tk]) => ({ key, label, members: tk.map(SA) }));

/** Cestas do regime (juntam setores). */
export const BASKETS = {
  dom: ["fin", "var", "imob", "sau"],
  exp: ["oil", "min", "pap"],
  cic: ["var", "imob"],
  def: ["util", "tel", "cons"],
};

/** Razões que sobem com apetite a risco no Brasil: [numerador, denominador (null = a própria série), rótulo]. */
export const BR_RATIOS = [
  [SA("BOVA11"), SA("LFTS11"), "Bolsa × caixa (Tesouro Selic)"],
  [SA("SMAL11"), SA("BOVA11"), "Small × large"],
  ["BRLUSD", null, "Real × dólar"],
  [SA("IRFM11"), SA("LFTS11"), "Prefixado × Selic (juros)"],
  ["EWZ", "EEM", "Brasil × emergentes"],
  ["B:dom", "B:exp", "Doméstico × exportadoras"],
  ["B:cic", "B:def", "Cíclico × defensivo"],
];

export const STOCKS = [...new Set(BR_SECTORS.flatMap((s) => s.members))];
/** Faixa rolante do topo: [símbolo, rótulo, tipo]. */
export const BR_TAPE = [["^BVSP", "Ibov"], ["BRL=X", "Dólar"], ["IRFM11.SA", "Pré"], ["SMAL11.SA", "Small"], ["PETR4.SA", "PETR4"], ["VALE3.SA", "VALE3"], ["ITUB4.SA", "ITUB4"], ["BBAS3.SA", "BBAS3"], ["WEGE3.SA", "WEGE3"], ["EWZ", "EWZ"], ["BZ=F", "Brent"], ["DX-Y.NYB", "DXY"]]; // prettier-ignore

/** Ativo da B3 -> espelho em Nova York (ADR ou ETF) cujo pré/pós-mercado antecipa o próximo pregão. */
export const BR_NY = {
  "^BVSP": "EWZ", [SA("BOVA11")]: "EWZ", [SA("SMAL11")]: "EWZS",
  [SA("PETR4")]: "PBR-A", [SA("PETR3")]: "PBR", [SA("VALE3")]: "VALE", [SA("ITUB4")]: "ITUB", [SA("BBDC4")]: "BBD",
  [SA("SANB11")]: "BSBR", [SA("ABEV3")]: "ABEV", [SA("SUZB3")]: "SUZ", [SA("GGBR4")]: "GGB", [SA("CSNA3")]: "SID",
  [SA("SBSP3")]: "SBS", [SA("CMIG4")]: "CIG", [SA("UGPA3")]: "UGP", [SA("VIVT3")]: "VIV", [SA("TIMS3")]: "TIMB",
}; // prettier-ignore

export const BR_SYNTH = new Set(["IBOV_USD", "BRLUSD"]);

/** Todos os símbolos reais (cotação ao vivo e histórico). */
export const BR_SYMBOLS = [
  ...new Set([
    ...BR_PANELS.flatMap(([, rows]) => rows.map(([s]) => s)).filter((s) => !BR_SYNTH.has(s)),
    ...BR_RATIOS.flatMap(([a, b]) => [a, b]).filter(
      (s) => s && !BR_SYNTH.has(s) && !s.startsWith("B:"),
    ),
    ...STOCKS,
    ...BR_TAPE.map(([sym]) => sym),
    ...Object.values(BR_NY),
  ]),
];

/** Nome curto de uma ação da B3 ("PETR4.SA" -> "PETR4"). */
export const tick = (sym) => String(sym).replace(/\.SA$/, "");
