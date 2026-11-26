// Universo de setores (taxonomia de rótulos) para a aba Sinais de hoje: cada rótulo vira uma lista fixa.
// Base: conhecimento consolidado até meados de 2026 + checagem pontual de alavancados (out/2026).
// "Vencedor relativo" = líder do subsetor em receita, share, margem ou momentum recente; não garante retorno.
// Alavancados e inversos (LEV/INV) replicam o retorno DIÁRIO e sofrem decaimento. Material educacional;
// não é recomendação de investimento.

/** Blocos da taxonomia, na ordem de exibição. */
export const SECTOR_BLOCKS = [
  ["MKT", "Mercado amplo"],
  ["RATES", "Juros / Renda fixa"],
  ["AI", "Inteligência Artificial"],
  ["TECH", "Tecnologia (não-AI)"],
  ["COMM", "Comunicação"],
  ["DISC", "Consumo discricionário"],
  ["STAP", "Consumo básico / Alimentação"],
  ["HLTH", "Saúde / Farma"],
  ["FIN", "Financeiro"],
  ["IND", "Industrial"],
  ["MAT", "Materiais / Mineração"],
  ["ENGY", "Energia"],
  ["UTIL", "Utilities"],
  ["RE", "Imobiliário"],
  ["CMDTY", "Commodities"],
  ["CRYPTO", "Cripto"],
];

// [rótulo, nome, ETF 1x, LEV (alavancado long), INV (inverso), SINGLE (ações)]
const RAW = [
  [
    "MKT.US.LARGE",
    "S&P 500 / Nasdaq",
    "SPY VOO IVV RSP QQQ QQQM",
    "SPXL UPRO SSO TQQQ QLD",
    "SPXS SPXU SDS SH SQQQ QID PSQ",
    "",
  ],
  ["MKT.US.SMALL", "Russell 2000", "IWM VB IJR", "TNA UWM", "TZA TWM RWM", ""],
  ["MKT.US.DOW", "Dow Jones", "DIA", "UDOW DDM", "SDOW DXD DOG", ""],
  ["MKT.INTL.DM", "Desenvolvidos", "VEA EFA VGK EWJ DXJ", "EURL EFO", "EFZ", ""],
  ["MKT.INTL.EM", "Emergentes", "EEM VWO IEMG", "EDC", "EDZ", ""],
  ["MKT.INTL.CHINA", "China", "FXI KWEB MCHI", "YINN CWEB", "YANG", "BABA PDD TCEHY"],
  ["MKT.INTL.BRAZIL", "Brasil", "EWZ EWZS", "BRZU", "", "NU ITUB MELI"],
  ["MKT.INTL.INDIA", "Índia", "INDA EPI", "INDL", "", "IBN HDB INFY"],

  ["RATES.UST.CASH", "T-bills (0–3m)", "SGOV BIL SHV USFR TFLO BOXX", "", "", ""],
  ["RATES.UST.SHORT", "Treasuries 1–3 anos", "SHY VGSH SCHO", "", "", ""],
  ["RATES.UST.MID", "Treasuries 3–10 anos", "IEI IEF VGIT", "UST TYD", "PST TYO", ""],
  ["RATES.UST.LONG", "Treasuries 20+ anos", "TLT VGLT EDV ZROZ", "TMF UBT", "TMV TTT TBT TBF", ""],
  ["RATES.TIPS", "Inflação (TIPS)", "TIP SCHP STIP VTIP", "", "", ""],
  ["RATES.IG", "Crédito grau de investimento", "LQD VCIT VCSH IGIB", "IGU", "IGS", ""],
  ["RATES.HY", "High yield", "HYG JNK USHY SJNK JAAA", "", "SJB", ""],
  ["RATES.FLOAT", "Taxa flutuante", "FLOT USFR JAAA BKLN SRLN", "", "", ""],
  ["RATES.MUNI", "Municipais", "MUB VTEB", "", "", ""],
  ["RATES.MBS", "Hipotecários (MBS)", "MBB VMBS", "", "", ""],
  ["RATES.EM", "Dívida emergente", "EMB EMLC", "", "", ""],
  ["RATES.AGG", "Agregado", "AGG BND BNDX", "", "", ""],

  ["AI.BROAD", "AI amplo", "AIQ BOTZ IGPT ARTY IVES WTAI", "AIBU FNGU", "AIBD", ""],
  [
    "AI.SEMI.COMPUTE",
    "GPUs / ASICs",
    "SMH SOXX SOXQ PSI",
    "SOXL USD NVDL NVDU AMUU AVL",
    "SOXS SSG NVDD",
    "NVDA AVGO AMD MRVL",
  ],
  ["AI.SEMI.FOUNDRY", "Foundry", "", "TSMX", "", "TSM INTC"],
  ["AI.SEMI.EQUIP", "Equipamentos de semicondutores", "", "", "", "ASML AMAT LRCX KLAC"],
  ["AI.SEMI.MEMORY", "Memória", "", "MUU", "", "MU SNDK WDC STX"],
  ["AI.NET.OPTICS", "Redes e ótica", "", "LITG", "", "ANET CRDO ALAB CIEN COHR LITE"],
  ["AI.INFRA.SERVERS", "Servidores", "", "", "", "DELL SMCI HPE"],
  [
    "AI.INFRA.NEOCLOUD",
    "Neoclouds e data centers",
    "DTCR SRVR",
    "NEBX",
    "",
    "CRWV NBIS IREN EQIX DLR",
  ],
  [
    "AI.CLOUD.HYPERSCALER",
    "Hyperscalers",
    "SKYY CLOU WCLD",
    "CLDL SKYU MSFU AMZU GGLL METU",
    "MSFD AMZD GGLS",
    "MSFT AMZN GOOGL ORCL META",
  ],
  [
    "AI.SOFTWARE.PLATFORM",
    "Software e plataformas",
    "IGV",
    "PLTU",
    "",
    "PLTR NOW SNOW MDB DDOG CRM",
  ],
  ["AI.CYBER", "Cibersegurança", "CIBR HACK BUG IHAK", "UCYB", "", "CRWD PANW ZS NET FTNT"],
  ["AI.EDGE.DEVICES", "Dispositivos (edge)", "", "AAPU", "", "AAPL QCOM ARM"],
  ["AI.IND.POWER", "Energia para AI", "", "", "", "CEG VST TLN NRG GEV"],
  ["AI.IND.NUCLEAR", "Nuclear", "NLR URA URNM NUKZ", "", "", "CEG CCJ BWXT OKLO SMR"],
  ["AI.IND.GRID", "Rede elétrica", "GRID", "", "", "VRT ETN GEV PWR MOD"],
  ["AI.IND.BUILD", "Construção de infraestrutura", "", "STLL", "", "PWR EME STRL FIX"],
  ["AI.ROBOTICS", "Robótica", "BOTZ ROBO ARKQ", "TSLL", "TSLQ", "TSLA ISRG SYM ROK TER"],
  ["AI.QUANTUM", "Computação quântica", "QTUM", "", "", "IONQ RGTI QBTS"],

  ["TECH.BROAD", "Tecnologia", "XLK VGT FTEC", "TECL ROM", "TECS REW", ""],

  ["COMM.BROAD", "Comunicação", "XLC VOX", "LTL", "", "META GOOGL NFLX"],
  ["COMM.MEDIA", "Mídia e streaming", "", "", "", "NFLX SPOT DIS"],
  ["COMM.TELECOM", "Telecom", "IYZ", "", "", "TMUS VZ T"],

  ["DISC.BROAD", "Consumo discricionário", "XLY VCR", "WANT UCC", "SCC", "AMZN TSLA HD"],
  ["DISC.RETAIL", "Varejo", "XRT", "RETL", "", "TJX ORLY AZO"],
  ["DISC.ECOMMERCE", "E-commerce", "IBUY ONLN", "", "", "AMZN MELI SHOP"],
  ["DISC.TRAVEL", "Viagem e lazer", "PEJ AWAY", "", "", "BKNG RCL MAR UBER"],
  ["DISC.HOME", "Homebuilders e casa", "ITB XHB", "NAIL", "", "DHI LEN NVR HD LOW"],
  ["DISC.AUTO", "Automóveis", "CARZ DRIV", "", "", "TSLA GM RACE"],

  ["STAP.BROAD", "Consumo básico", "XLP VDC", "UGE", "SZK", "COST WMT PG"],
  ["STAP.RETAIL", "Varejo alimentar / escala", "", "", "", "COST WMT BJ KR"],
  ["STAP.FOOD", "Alimentos embalados", "PBJ", "", "", "MDLZ HSY GIS"],
  ["STAP.BEV", "Bebidas", "PBJ", "", "", "KO MNST PEP"],
  ["STAP.TOBACCO", "Tabaco / nicotina", "", "", "", "PM MO"],
  ["STAP.RESTAURANT", "Restaurantes", "EATZ", "", "", "MCD TXRH CMG CAVA DPZ"],
  ["STAP.AGRI", "Agronegócio", "MOO", "", "", "DE CTVA ADM NTR"],

  ["HLTH.BROAD", "Saúde", "XLV VHT", "CURE RXL", "RXD", "LLY JNJ ABBV"],
  ["HLTH.PHARMA", "Farmacêuticas", "XPH IHE PJP", "PILL", "", "LLY ABBV JNJ AZN MRK"],
  ["HLTH.OBESITY", "GLP-1 / obesidade", "HRTS", "ELIL", "", "LLY NVO VKTX"],
  ["HLTH.BIOTECH", "Biotecnologia", "XBI IBB", "LABU BIB", "LABD BIS", "VRTX GILD ARGX AMGN REGN"],
  ["HLTH.MEDTECH", "Dispositivos médicos", "IHI", "", "", "ISRG BSX SYK ABT"],
  ["HLTH.MANAGED", "Planos de saúde", "IHF", "", "", "CI ELV UNH"],

  ["FIN.BROAD", "Financeiro", "XLF VFH", "FAS UYG", "FAZ SKF SEF", "JPM BRK-B V"],
  ["FIN.BANKS.LARGE", "Grandes bancos", "KBE KBWB", "", "", "JPM GS MS BAC"],
  ["FIN.BANKS.REGIONAL", "Bancos regionais", "KRE", "DPST", "", "PNC USB HBAN"],
  ["FIN.BROKERS", "Corretoras / wealth", "IAI", "", "", "IBKR HOOD SCHW"],
  ["FIN.EXCHANGES", "Bolsas e dados", "", "", "", "CME ICE NDAQ SPGI MCO"],
  ["FIN.INSURANCE", "Seguros", "KIE IAK", "", "", "PGR CB AJG MMC"],
  ["FIN.PAYMENTS", "Pagamentos", "IPAY", "", "", "V MA AXP"],
  ["FIN.ALTMGR", "Gestoras alternativas", "PSP", "", "", "KKR BX APO ARES"],
  ["FIN.FINTECH", "Fintech", "ARKF FINX", "", "", "NU HOOD SOFI COIN"],

  ["IND.BROAD", "Industrial", "XLI VIS", "DUSL UXI", "SIJ", "GE CAT ETN"],
  ["IND.AERODEF", "Aeroespacial e defesa", "ITA XAR PPA SHLD", "DFEN", "", "GE HWM RTX GD LMT NOC"],
  ["IND.MACHINERY", "Máquinas e equipamentos", "", "", "", "CAT DE PH"],
  ["IND.TRANSPORT", "Ferrovias e logística", "IYT XTN", "", "", "UNP CSX ODFL"],
  ["IND.AIRLINES", "Aéreas", "JETS", "", "", "DAL UAL"],
  ["IND.SPACE", "Espaço", "UFO ARKX", "", "", "RKLB ASTS LHX"],
  ["IND.WASTE", "Resíduos", "", "", "", "WM RSG WCN"],

  ["MAT.BROAD", "Materiais", "XLB VAW", "UYM", "SMN", "LIN SHW NEM"],
  ["MAT.GOLD", "Mineradoras de ouro", "GDX GDXJ", "NUGT JNUG", "DUST JDST", "NEM AEM WPM FNV"],
  ["MAT.SILVER", "Mineradoras de prata", "SIL SILJ", "", "", "PAAS AG"],
  ["MAT.COPPER", "Cobre", "COPX CPER", "", "", "FCX SCCO"],
  ["MAT.STEEL", "Aço", "SLX", "", "", "NUE STLD"],
  ["MAT.CHEM", "Químicos / gases", "", "", "", "LIN SHW APD"],

  ["ENGY.BROAD", "Energia", "XLE VDE", "ERX DIG", "ERY DUG", "XOM CVX"],
  ["ENGY.INTEGRATED", "Integradas", "", "", "", "XOM CVX SHEL"],
  ["ENGY.EP", "Exploração e produção", "XOP", "GUSH", "DRIP", "COP EOG FANG"],
  ["ENGY.SERVICES", "Serviços de petróleo", "OIH IEZ", "", "", "SLB BKR"],
  ["ENGY.MIDSTREAM", "Dutos (midstream)", "AMLP MLPX TPYP", "", "", "WMB KMI ET"],
  ["ENGY.LNG", "Gás natural liquefeito", "", "", "", "LNG VG"],
  ["ENGY.CLEAN", "Energia limpa", "ICLN TAN QCLN", "", "", "FSLR NEE ENPH"],

  ["UTIL.BROAD", "Utilities", "XLU VPU", "UTSL UPW", "SDP", "CEG VST NEE SO"],

  ["RE.BROAD", "Imobiliário (REITs)", "XLRE VNQ", "DRN URE", "DRV SRS REK", "PLD WELL EQIX"],
  ["RE.HEALTHCARE", "Senior housing", "", "", "", "WELL VTR"],
  ["RE.INDUSTRIAL", "Logística", "", "", "", "PLD EGP"],
  ["RE.TOWERS", "Torres e data centers", "", "", "", "AMT EQIX DLR"],

  ["CMDTY.BROAD", "Commodities amplas", "DBC PDBC GSG", "", "", ""],
  ["CMDTY.GOLD", "Ouro", "GLD IAU GLDM", "UGL", "GLL", ""],
  ["CMDTY.SILVER", "Prata", "SLV SIVR", "AGQ", "ZSL", ""],
  ["CMDTY.OIL", "Petróleo", "USO BNO", "UCO", "SCO", ""],
  ["CMDTY.NATGAS", "Gás natural", "UNG", "BOIL", "KOLD", ""],
  ["CMDTY.AGRI", "Agrícolas", "DBA CORN WEAT SOYB", "", "", ""],

  ["CRYPTO.BTC", "Bitcoin", "IBIT FBTC BITB", "BITX BITU", "SBIT BITI", ""],
  ["CRYPTO.ETH", "Ethereum", "ETHA FETH", "ETHU", "ETHD", ""],
  ["CRYPTO.EQUITY", "Ações cripto", "BKCH WGMI", "CONL MSTU MSTX", "", "COIN MSTR HOOD"],
];

const split = (s) => (s ? s.split(" ") : []);

/** [{ id, name, block, etf, lev, inv, single, syms }] na ordem da taxonomia. */
export const SECTORS = RAW.map(([id, name, etf, lev, inv, single]) => {
  const g = { etf: split(etf), lev: split(lev), inv: split(inv), single: split(single) };
  // ações primeiro (vencedores relativos), depois ETF, alavancado e inverso; sem repetir ticker
  return {
    id,
    name,
    block: id.split(".")[0],
    ...g,
    syms: [...new Set([...g.single, ...g.etf, ...g.lev, ...g.inv])],
  };
});

export const SECTOR_BY_ID = Object.fromEntries(SECTORS.map((s) => [s.id, s]));

/** Tipo do ticker dentro do rótulo: "LEV", "INV", "ETF", "SINGLE" ou null. */
export function sectorKind(id, sym) {
  const s = SECTOR_BY_ID[id];
  if (!s) return null;
  if (s.single.includes(sym)) return "SINGLE";
  if (s.etf.includes(sym)) return "ETF";
  if (s.lev.includes(sym)) return "LEV";
  if (s.inv.includes(sym)) return "INV";
  return null;
}
