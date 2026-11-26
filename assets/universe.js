// Universo do Pêndulo: 47 ativos (especificação, seção 3). Os pares foram removidos em 25/11/2026.

/** [código, símbolo Yahoo, nome, unidade, grupo] */
const RAW_ASSETS = [
  ["SPY", "SPY", "S&P 500", "US$", "Ações EUA"],
  ["QQQ", "QQQ", "Nasdaq 100", "US$", "Ações EUA"],
  ["IWM", "IWM", "Small caps EUA", "US$", "Ações EUA"],
  ["EFA", "EFA", "Desenvolvidos ex-EUA", "US$", "Ações Globais"],
  ["VGK", "VGK", "Europa", "US$", "Ações Globais"],
  ["EWJ", "EWJ", "Japão", "US$", "Ações Globais"],
  ["EEM", "EEM", "Emergentes", "US$", "Ações Globais"],
  ["FXI", "FXI", "China large caps", "US$", "Ações Globais"],
  ["INDA", "INDA", "Índia", "US$", "Ações Globais"],
  ["EWZ", "EWZ", "Brasil", "US$", "Ações Globais"],
  ["EWW", "EWW", "México", "US$", "Ações Globais"],
  ["XLK", "XLK", "Tecnologia", "US$", "Setores"],
  ["SMH", "SMH", "Semicondutores", "US$", "Setores"],
  ["XLC", "XLC", "Comunicação", "US$", "Setores"],
  ["XLY", "XLY", "Consumo discricionário", "US$", "Setores"],
  ["XLF", "XLF", "Financeiro", "US$", "Setores"],
  ["KRE", "KRE", "Bancos regionais", "US$", "Setores"],
  ["XLI", "XLI", "Industriais", "US$", "Setores"],
  ["XLB", "XLB", "Materiais", "US$", "Setores"],
  ["XLE", "XLE", "Energia", "US$", "Setores"],
  ["XLP", "XLP", "Consumo básico", "US$", "Setores"],
  ["XLV", "XLV", "Saúde", "US$", "Setores"],
  ["XLU", "XLU", "Utilities", "US$", "Setores"],
  ["VNQ", "VNQ", "REITs EUA", "US$", "Setores"],
  ["TLT", "TLT", "Treasury 20+ anos", "US$", "Renda Fixa"],
  ["TBF", "TBF", "Inverso Treasury 20+ (-1x)", "US$", "Renda Fixa"],
  ["HYG", "HYG", "High yield EUA", "US$", "Renda Fixa"],
  ["EMB", "EMB", "Bonds EM em USD", "US$", "Renda Fixa"],
  ["EMLC", "EMLC", "Bonds EM moeda local", "US$", "Renda Fixa"],
  ["BWX", "BWX", "Bonds globais ex-EUA", "US$", "Renda Fixa"],
  ["GLD", "GLD", "Ouro", "US$", "Commodities"],
  ["SLV", "SLV", "Prata", "US$", "Commodities"],
  ["GDX", "GDX", "Mineradoras de ouro", "US$", "Commodities"],
  ["COPX", "COPX", "Mineradoras de cobre", "US$", "Commodities"],
  ["DBC", "DBC", "Commodities amplas", "US$", "Commodities"],
  ["USO", "USO", "Petróleo (ETF)", "US$", "Commodities"],
  ["VNQI", "VNQI", "REITs ex-EUA", "US$", "Ações Globais"],
  ["UUP", "UUP", "Dólar (ETF DXY)", "US$", "Moedas"],
  ["FXY", "FXY", "Iene (ETF)", "US$", "Moedas"],
  ["VIXY", "VIXY", "Futuros VIX curto prazo", "US$", "Volatilidade"],
  ["VIX", "^VIX", "Índice VIX", "pontos", "Macro"],
  ["DXY", "DX-Y.NYB", "Índice Dólar DXY", "pontos", "Macro"],
  ["US10Y", "^TNX", "Treasury 10 anos", "% a.a.", "Macro"],
  ["US3M", "^IRX", "T-bill 3 meses", "% a.a.", "Macro"],
  ["WTI", "CL=F", "Petróleo WTI (futuro)", "US$/barril", "Macro"],
  ["USDJPY", "JPY=X", "Dólar/Iene", "JPY por USD", "Macro"],
  ["USDBRL", "BRL=X", "Dólar/Real", "BRL por USD", "Macro"],
];

export const ASSETS = Object.fromEntries(
  RAW_ASSETS.map(([code, yahoo, name, unit, group]) => [code, { code, yahoo, name, unit, group }]),
);

export const REGION_LIST = [
  "SPY", "QQQ", "IWM", "EFA", "VGK", "EWJ", "EEM", "FXI", "INDA", "EWZ", "EWW", "VNQI", "TLT",
  "HYG", "EMB", "EMLC", "BWX", "GLD", "SLV", "COPX", "DBC", "USO", "UUP", "FXY", "VIXY",
]; // prettier-ignore

export const SECTOR_LIST = [
  "XLK", "SMH", "XLC", "XLY", "XLF", "KRE", "XLI", "XLB", "XLE", "XLP", "XLV", "XLU", "VNQ",
]; // prettier-ignore

export const MACRO_LIST = ["VIX", "DXY", "US10Y", "CURVE", "WTI", "USDJPY", "USDBRL"];

export const MIN_HISTORY = 260; // pregões mínimos para o ativo entrar nos cálculos
