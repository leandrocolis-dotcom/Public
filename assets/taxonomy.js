// Taxonomia única dos ativos (filtros Setor/tema → Subtema e Tipo nas listas): cada ticker ganha { theme, sub, kind }.
// Fontes, nesta ordem: 1) rótulos curados de assets/sectors.js (universo_setores_tickers.md), 2) GICS do Quant Aberto
// (S&P 500), 3) setor/indústria do Yahoo (campeões e Análise). Subtemas da GICS foram alinhados aos nomes curados
// (ex.: "Semiconductors" e "GPUs / ASICs" → Semicondutores), para o filtro não ter duplicados.
import { SECTORS, sectorKind } from "./sectors.js";
import { qv } from "./quant-view.js";
import { champ } from "./champions.js";

/** Tema de cada bloco curado; subtema = nome do rótulo (os ".BROAD" viram "<tema> (amplo)"). */
const BLOCK_THEME = { MKT: "Mercado amplo (EUA)", RATES: "Juros", AI: "Tecnologia", TECH: "Tecnologia", COMM: "Comunicação", DISC: "Consumo discricionário", STAP: "Consumo básico", HLTH: "Saúde", FIN: "Financeiro", IND: "Industrial", MAT: "Materiais", ENGY: "Energia", UTIL: "Utilities", RE: "Imobiliário", CMDTY: "Commodities", CRYPTO: "Cripto" }; // prettier-ignore
/** Rótulos com tema/subtema próprios (IA espalhada por tecnologia, energia e indústria; países). */
const LABEL = {
  "MKT.INTL.DM": ["Internacional", "Desenvolvidos"], "MKT.INTL.EM": ["Internacional", "Emergentes"],
  "MKT.INTL.CHINA": ["Internacional", "China"], "MKT.INTL.BRAZIL": ["Internacional", "Brasil"], "MKT.INTL.INDIA": ["Internacional", "Índia"],
  "AI.BROAD": ["Tecnologia", "IA (amplo)"], "AI.SEMI.COMPUTE": ["Tecnologia", "Semicondutores"], "AI.SEMI.FOUNDRY": ["Tecnologia", "Semicondutores"],
  "AI.SEMI.EQUIP": ["Tecnologia", "Equipamentos de semicondutores"], "AI.SEMI.MEMORY": ["Tecnologia", "Memória e armazenamento"],
  "AI.NET.OPTICS": ["Tecnologia", "Redes e ótica"], "AI.INFRA.SERVERS": ["Tecnologia", "Hardware e servidores"],
  "AI.INFRA.NEOCLOUD": ["Tecnologia", "Data centers e neoclouds"], "AI.CLOUD.HYPERSCALER": ["Tecnologia", "Cloud e big techs"],
  "AI.SOFTWARE.PLATFORM": ["Tecnologia", "Software"], "AI.CYBER": ["Tecnologia", "Cibersegurança"], "AI.EDGE.DEVICES": ["Tecnologia", "Dispositivos"],
  "AI.ROBOTICS": ["Tecnologia", "Robótica e automação"], "AI.QUANTUM": ["Tecnologia", "Computação quântica"], "TECH.BROAD": ["Tecnologia", "Tecnologia (amplo)"],
  "AI.IND.POWER": ["Energia", "Energia para IA"], "AI.IND.NUCLEAR": ["Energia", "Nuclear e urânio"],
  "AI.IND.GRID": ["Industrial", "Rede elétrica e equipamentos"], "AI.IND.BUILD": ["Industrial", "Engenharia e construção"],
  "STAP.RESTAURANT": ["Consumo discricionário", "Restaurantes"], "RE.TOWERS": ["Imobiliário", "Torres e data centers"],
}; // prettier-ignore

const GICS_THEME = { "Information Technology": "Tecnologia", Technology: "Tecnologia", Industrials: "Industrial", Financials: "Financeiro", "Financial Services": "Financeiro", "Health Care": "Saúde", Healthcare: "Saúde", "Consumer Discretionary": "Consumo discricionário", "Consumer Cyclical": "Consumo discricionário", "Consumer Staples": "Consumo básico", "Consumer Defensive": "Consumo básico", Utilities: "Utilities", "Real Estate": "Imobiliário", Materials: "Materiais", "Basic Materials": "Materiais", "Communication Services": "Comunicação", Energy: "Energia" }; // prettier-ignore
const GICS_SUB = {
  Semiconductors: "Semicondutores", "Semiconductor Materials & Equipment": "Equipamentos de semicondutores", "Semiconductor Equipment & Materials": "Equipamentos de semicondutores",
  "Application Software": "Software", "Systems Software": "Software", "Software - Application": "Software", "Software - Infrastructure": "Software",
  "Technology Hardware, Storage & Peripherals": "Hardware e servidores", "Computer Hardware": "Hardware e servidores", "Electronic Components": "Hardware e servidores",
  "Electronic Equipment & Instruments": "Hardware e servidores", "Electronic Manufacturing Services": "Hardware e servidores", "Technology Distributors": "Hardware e servidores",
  "Communications Equipment": "Redes e ótica", "Communication Equipment": "Redes e ótica", "IT Consulting & Other Services": "Serviços de TI", "Information Technology Services": "Serviços de TI",
  "Internet Services & Infrastructure": "Data centers e neoclouds", "Consumer Electronics": "Dispositivos",
  "Interactive Media & Services": "Internet e redes sociais", "Internet Content & Information": "Internet e redes sociais", "Movies & Entertainment": "Mídia e streaming",
  "Interactive Home Entertainment": "Games", "Advertising": "Publicidade", "Broadcasting": "Mídia e streaming", "Cable & Satellite": "Telecom", "Publishing": "Mídia e streaming",
  "Integrated Telecommunication Services": "Telecom", "Wireless Telecommunication Services": "Telecom", "Telecom Services": "Telecom",
  "Broadline Retail": "E-commerce", "Internet Retail": "E-commerce", "Apparel Retail": "Varejo", "Other Specialty Retail": "Varejo", "Computer & Electronics Retail": "Varejo",
  "Home Improvement Retail": "Homebuilders e casa", "Homefurnishing Retail": "Homebuilders e casa", "Homebuilding": "Homebuilders e casa", "Automotive Retail": "Varejo",
  "Apparel, Accessories & Luxury Goods": "Vestuário e luxo", "Footwear": "Vestuário e luxo", "Automobile Manufacturers": "Automóveis", "Auto Manufacturers": "Automóveis",
  "Automotive Parts & Equipment": "Automóveis", "Hotels, Resorts & Cruise Lines": "Viagem e lazer", "Casinos & Gaming": "Viagem e lazer", "Leisure Products": "Viagem e lazer",
  "Restaurants": "Restaurantes", "Distributors": "Varejo", "Specialized Consumer Services": "Serviços ao consumidor",
  "Packaged Foods & Meats": "Alimentos embalados", "Soft Drinks & Non-alcoholic Beverages": "Bebidas", "Distillers & Vintners": "Bebidas", "Tobacco": "Tabaco / nicotina",
  "Household Products": "Higiene e limpeza", "Personal Care Products": "Higiene e limpeza", "Food Retail": "Varejo alimentar / escala", "Consumer Staples Merchandise Retail": "Varejo alimentar / escala",
  "Food Distributors": "Varejo alimentar / escala", "Agricultural Products & Services": "Agronegócio",
  "Integrated Oil & Gas": "Integradas", "Oil & Gas Integrated": "Integradas", "Oil & Gas Exploration & Production": "Exploração e produção", "Oil & Gas E&P": "Exploração e produção",
  "Oil & Gas Equipment & Services": "Serviços de petróleo", "Oil & Gas Refining & Marketing": "Refino", "Oil & Gas Storage & Transportation": "Dutos (midstream)", "Oil & Gas Midstream": "Dutos (midstream)",
  "Diversified Banks": "Grandes bancos", "Banks - Diversified": "Grandes bancos", "Regional Banks": "Bancos regionais", "Banks - Regional": "Bancos regionais",
  "Investment Banking & Brokerage": "Corretoras / wealth", "Capital Markets": "Corretoras / wealth", "Asset Management & Custody Banks": "Gestoras de recursos", "Asset Management": "Gestoras de recursos",
  "Financial Exchanges & Data": "Bolsas e dados", "Transaction & Payment Processing Services": "Pagamentos", "Credit Services": "Pagamentos", "Consumer Finance": "Crédito ao consumidor",
  "Property & Casualty Insurance": "Seguros", "Life & Health Insurance": "Seguros", "Multi-line Insurance": "Seguros", "Reinsurance": "Seguros", "Insurance Brokers": "Seguros", "Multi-Sector Holdings": "Holdings",
  "Pharmaceuticals": "Farmacêuticas", "Drug Manufacturers - General": "Farmacêuticas", "Biotechnology": "Biotecnologia", "Health Care Equipment": "Dispositivos médicos", "Medical Devices": "Dispositivos médicos",
  "Health Care Supplies": "Dispositivos médicos", "Managed Health Care": "Planos de saúde", "Health Care Services": "Serviços de saúde", "Health Care Facilities": "Serviços de saúde",
  "Health Care Distributors": "Serviços de saúde", "Health Care Technology": "Tecnologia em saúde", "Life Sciences Tools & Services": "Ferramentas de ciências da vida",
  "Aerospace & Defense": "Aeroespacial e defesa", "Passenger Airlines": "Aéreas", "Airlines": "Aéreas", "Rail Transportation": "Ferrovias e logística", "Air Freight & Logistics": "Ferrovias e logística",
  "Cargo Ground Transportation": "Ferrovias e logística", "Passenger Ground Transportation": "Ferrovias e logística", "Construction Machinery & Heavy Transportation Equipment": "Máquinas e equipamentos",
  "Agricultural & Farm Machinery": "Máquinas e equipamentos", "Industrial Machinery & Supplies & Components": "Máquinas e equipamentos", "Electrical Components & Equipment": "Rede elétrica e equipamentos",
  "Heavy Electrical Equipment": "Rede elétrica e equipamentos", "Construction & Engineering": "Engenharia e construção", "Engineering & Construction": "Engenharia e construção", "Building Products": "Materiais de construção",
  "Environmental & Facilities Services": "Resíduos", "Waste Management": "Resíduos", "Industrial Conglomerates": "Conglomerados", "Trading Companies & Distributors": "Distribuidores industriais",
  "Data Processing & Outsourced Services": "Serviços empresariais", "Diversified Support Services": "Serviços empresariais", "Human Resource & Employment Services": "Serviços empresariais", "Research & Consulting Services": "Serviços empresariais",
  "Gold": "Mineradoras de ouro", "Copper": "Cobre", "Steel": "Aço", "Specialty Chemicals": "Químicos / gases", "Commodity Chemicals": "Químicos / gases", "Industrial Gases": "Químicos / gases",
  "Fertilizers & Agricultural Chemicals": "Agronegócio", "Construction Materials": "Materiais de construção", "Metal, Glass & Plastic Containers": "Embalagens", "Paper & Plastic Packaging Products & Materials": "Embalagens",
  "Electric Utilities": "Elétricas", "Utilities - Regulated Electric": "Elétricas", "Multi-Utilities": "Elétricas", "Gas Utilities": "Gás", "Water Utilities": "Água",
  "Independent Power Producers & Energy Traders": "Energia para IA", "Utilities - Independent Power Producers": "Energia para IA",
  "Data Center REITs": "Torres e data centers", "Telecom Tower REITs": "Torres e data centers", "Health Care REITs": "Senior housing", "Industrial REITs": "Logística",
  "Multi-Family Residential REITs": "Residencial", "Single-Family Residential REITs": "Residencial", "Retail REITs": "Varejo (REITs)", "Office REITs": "Escritórios", "Self-Storage REITs": "Self-storage",
  "Hotel & Resort REITs": "Hotéis (REITs)", "Other Specialized REITs": "REITs especializados", "Timber REITs": "REITs especializados", "Real Estate Services": "Serviços imobiliários",
}; // prettier-ignore

const KIND_PT = { SINGLE: "Ação", ETF: "ETF", LEV: "Alavancado", INV: "Inverso" };

let memo = null;
function build() {
  const m = new Map();
  // 1) rótulos curados: o primeiro rótulo específico vence o ".BROAD" (ex.: NVDA fica em Semicondutores)
  for (const s of SECTORS) {
    const broad = s.id.endsWith(".BROAD");
    const [theme, sub] = LABEL[s.id] ?? [BLOCK_THEME[s.block] ?? s.block, broad ? `${BLOCK_THEME[s.block]} (amplo)` : s.name]; // prettier-ignore
    for (const sym of s.syms) {
      const cur = m.get(sym);
      if (cur && !(cur.broad && !broad)) continue;
      m.set(sym, { theme, sub, kind: KIND_PT[sectorKind(s.id, sym)] ?? null, broad });
    }
  }
  // 2) GICS do Quant (S&P 500) e 3) Yahoo (campeões)
  const add = (sym, sector, industry) => {
    if (m.has(sym) || !sector) return;
    const theme = GICS_THEME[sector] ?? sector;
    m.set(sym, { theme, sub: GICS_SUB[industry] ?? industry ?? `${theme} (amplo)`, kind: "Ação" });
  };
  for (const r of qv.data?.rows ?? []) add(r.sym, r.sector, r.sub);
  for (const c of champ.data?.members ?? []) add(c.s, c.sector, c.industry);
  return { m, q: qv.data, c: champ.data };
}

/** { theme, sub, kind } de um ticker (r = análise do app, opcional, para quem está fora do universo). */
export function taxOf(sym, r = null) {
  if (!memo || memo.q !== qv.data || memo.c !== champ.data) memo = build();
  const t = memo.m.get(sym);
  if (t) return t;
  const f = r?.fund;
  if (f?.sector) {
    const theme = GICS_THEME[f.sector] ?? f.sector;
    return { theme, sub: GICS_SUB[f.industry] ?? f.industry ?? `${theme} (amplo)`, kind: f.type === "ETF" ? "ETF" : "Ação" }; // prettier-ignore
  }
  return { theme: "Outros", sub: f?.category ?? "Outros", kind: f?.type === "ETF" ? "ETF" : null };
}
