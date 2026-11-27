// Estado da página, preferências salvas no navegador e constantes das abas.

export const TABS = [
  ["home", "Início"],
  ["dash", "Visão geral"],
  ["macro", "Macro"],
  ["rates", "Juros"],
  ["news", "Notícias"],
  ["calendar", "Agenda"],
  ["flow", "Fluxo"],
  ["watch", "Watchlist"],
  ["local", "Visão geral"],
  ["brmacro", "Macro"],
  ["brrates", "Juros"],
  ["brnews", "Notícias"],
  ["brcal", "Agenda"],
  ["brflow", "Fluxo"],
  ["brwatch", "Watchlist"],
  ["portfolio", "Posições"],
  ["journal", "Diário"],
  ["risk", "Risco"],
  ["rebal", "Rebalancear"],
  ["phist", "Histórico"],
  ["pfperf", "Performance"],
  ["rfix", "Renda fixa BR"],
  ["pairdesk", "Duplas L/S"],
  ["longshort", "Long & Short"],
  ["trig", "Agora"],
  ["screener", "Scanner"],
  ["sim", "Placar"],
  ["checks", "Verificação"],
  ["archive", "Arquivo"],
  ["settings", "Configurações"],
];

/**
 * Mercados em dois lados com as MESMAS sete telas, na mesma ordem (Visão geral, Macro, Juros, Notícias, Agenda, Fluxo, Watchlist):
 * Offshore = EUA e mundo (dólar, Yahoo/FRED/Forex Factory); Onshore = Brasil (B3, real, BCB/Focus).
 * Ids antigos do offshore não mudam (?tab=dash etc.); o onshore usa "local" e o prefixo "br".
 */
export const MARKETS = [
  { id: "off", label: "Offshore", flag: "🌎", hint: "EUA e mundo", tabs: ["dash", "macro", "rates", "news", "calendar", "flow", "watch"] },
  { id: "on", label: "Onshore", flag: "🇧🇷", hint: "Brasil", tabs: ["local", "brmacro", "brrates", "brnews", "brcal", "brflow", "brwatch"] },
]; // prettier-ignore

/** Lado do mercado (Offshore/Onshore) de uma aba, ou null fora de Mercados. */
export const marketOf = (tab) => MARKETS.find((m) => m.tabs.includes(tab)) ?? null;
/** Aba do lado Onshore (Brasil)? */
export const isOnshore = (tab) => marketOf(tab)?.id === "on";

/**
 * Seções da navegação: cada uma responde a uma pergunta de quem decide. As abas (TABS) viram sub-abas da
 * seção; os ids das abas não mudaram (links ?tab=, atalhos e avisos continuam valendo).
 */
export const GROUPS = [
  { id: "home", label: "Início", q: "O que olhar hoje?", tabs: ["home"] },
  { id: "market", label: "Mercados", q: "Como estão os mercados agora? Offshore (EUA e mundo) e Onshore (Brasil), com as mesmas sete telas.", tabs: MARKETS.flatMap((m) => m.tabs), segs: MARKETS },
  { id: "wallet", label: "Carteira", q: "Como estão os meus investimentos?", tabs: ["portfolio", "longshort", "pairdesk", "pfperf", "journal", "risk", "rebal", "phist", "rfix"] },
  { id: "opps", label: "Gatilhos", q: "Tem gatilho com evidência agora? Só o que passou no teste fora da amostra.", tabs: ["trig", "screener", "sim", "archive"] },
]; // prettier-ignore

/** Abas removidas em 21/11/2026 (Oportunidades e Laboratório viraram Gatilhos): links e prefs antigos caem aqui. */
export const TAB_ALIAS = {
  signals: "trig",
  entry: "trig",
  analysis: "trig",
  value: "trig",
  mesa: "trig",
  lab: "sim",
};

/** Uma frase por aba: para que serve (aparece sob as sub-abas e no mapa do Início). */
export const TAB_INFO = {
  home: "Cockpit do dia: sessão de NY, pulso do mercado, carteira, fluxo, agenda e manchetes.",
  dash: "Offshore · cotações de bolsas, juros, moedas, commodities e cripto, com o regime de risco do dia.",
  macro:
    "Offshore · economia dos EUA e do mundo: crescimento, inflação, juros, crédito e geopolítica, o regime e os setores que a história favorece; agenda com projeção × resultado.",
  rates:
    "Offshore · curva de juros a mercado (EUA em todos os vértices, ao vivo; zona do euro, Reino Unido e Japão) e curvas de datas passadas para comparar.",
  news: "Offshore · manchetes internacionais classificadas por assunto; as que citam a sua carteira vêm primeiro.",
  calendar:
    "Offshore · indicadores econômicos da semana (EUA, Europa, Ásia), resultados e dividendos dos seus ativos e 💻 balanços das empresas de tecnologia por subtema.",
  flow: "Offshore · para onde o dinheiro está indo: grupos que ganham e perdem força hoje (inferido por preço e volume).",
  watch:
    "Offshore · suas watchlists em abas: cole os tickers (ou a tabela do Investing) e veja preço, decisão, nota e a velocidade do fluxo de cada ativo.",
  local:
    "Onshore · Brasil ao vivo: Ibovespa, juros, câmbio, setores da B3, maiores altas e baixas e o regime do dia.",
  brmacro:
    "Onshore · economia do Brasil: juros reais, inflação × meta, atividade, emprego e fiscal (BCB e Focus), com os dados divulgados × projeção.",
  brrates:
    "Onshore · curva de juros DI × pré (B3) ao vivo pelos futuros DI1, com curvas de datas passadas para comparar.",
  brnews:
    "Onshore · manchetes do Brasil (Valor, InfoMoney, Money Times, Exame…) classificadas por assunto.",
  brcal:
    "Onshore · indicadores do Brasil da semana (Copom, IPCA, PIB, emprego…) e resultados e dividendos das ações da B3.",
  brflow:
    "Onshore · para onde o dinheiro está indo na B3: Fluxo agora por fase do pregão, mapa de calor, rotação dos setores contra o Ibovespa e volume fora do normal (inferido por preço e volume).",
  brwatch:
    "Onshore · as mesmas watchlists: ações da B3 (.SA) contra o Ibovespa, o resto contra o S&P 500, com decisão, nota e velocidade do fluxo.",
  portfolio: "Suas posições, resultado e sinais de cada ativo. Comece importando a carteira.",
  journal:
    "Suas operações reais (entrada, tamanho pelo risco, stop, motivo, saída) e o placar: as suas decisões ganham do SPY?",
  risk: "Quanto a carteira pode cair, concentração e correlação entre as posições.",
  rebal: "Quanto comprar ou vender de cada ativo para voltar aos pesos-alvo.",
  trig: "Só os gatilhos que passaram no teste: proteção das posições alavancadas, repique depois de queda muito rápida, filtro de alavancagem e o que NÃO fazer, cada um com o placar ao vivo.",
  phist:
    "Posição histórica: escolha a data e veja posições, valor de mercado e rentabilidade da carteira naquele dia (uma foto do BTG por dia).",
  pairdesk:
    "Painel das duplas long × short: soma da carteira das duplas, trava da carteira, e por dupla postura-alvo, venda parcial e travas em degraus, com preço ao vivo e máxima do dia.",
  longshort:
    "O que fazer agora nas duplas de ETFs alavancados: ordem pronta (ativo, lado, quantidade, limite, stop e motivo) do pré às 20h de NY, travas de risco, alertas e diário do que você seguiu ou ignorou.",
  pfperf:
    "Rentabilidade do exterior por janela (dia, semana, mês, ano, início): curva, queda máxima, volatilidade, Sharpe e mês a mês. BTG oficial + carteira de cada dia.",
  rfix: "Compara CDB, LCI, LCA, Tesouro, CRI/CRA, debêntures, fundo DI e poupança no mesmo valor e prazo: bruto, impostos e líquido.",
  screener:
    "Scanner de volatilidade do mercado inteiro: amplitude (ATR%), gap, volume fora do normal, esticado contra a MM20 e movimentos fortes de hoje.",
  sim: "Placar fora da amostra de cada gatilho (diário ao vivo) e o teste das regras no passado.",
  checks: "Confere se as cotações e cálculos estão corretos e atualizados.",
  archive:
    "Telas congeladas (sem trabalho novo desde 18/11/2026): fora das sub-abas, mas abrem daqui, pela busca e pelos links.",
  settings: "Conta, carteira, aparência, atualização e avisos.",
};

/**
 * Telas congeladas (docs/ROADMAP-DINHEIRO.md, D5) recolhidas no Laboratório › Arquivo em 22/11/2026: saem das
 * sub-abas, mas continuam na seção de origem (título, ?tab=, comandos e avisos seguem valendo). A Visão geral do
 * Onshore fica à vista: é o monitor do IBOV pedido pelo usuário.
 */
export const ARCHIVE = ["rates", "brmacro", "brrates", "brnews", "brcal", "brflow", "brwatch"];
/** Abas visíveis numa lista de sub-abas: sem as do Arquivo, salvo a que está aberta. */
export const visibleTabs = (list, current = null) =>
  list.filter((id) => !ARCHIVE.includes(id) || id === current);

/** Seção a que a aba pertence (Configurações fica fora das seções). */
export const groupOf = (tab) => GROUPS.find((g) => g.tabs.includes(tab)) ?? null;

export const store = {
  get(k, d) {
    try {
      const v = localStorage.getItem(k);
      return v === null ? d : JSON.parse(v);
    } catch {
      return d;
    }
  },
  set(k, v) {
    try {
      localStorage.setItem(k, JSON.stringify(v));
    } catch {
      /* sem armazenamento: a página funciona igual */
    }
  },
};

const prefsDefault = {
  tab: "home", groupLast: {}, dashH: "1d", pendH: "1d", dashExtra: {}, setTab: "conta", newsAlerts: "all", sigAlerts: "on",
  autoReload: "auto", flowHorizon: "1d", flowGroup: "all", flowSize: "liq",
  rotGroup: "regions", rotWin: "8w", brRotWin: "8w", flowStrong: false, prefsV: 6,
  brFlowHorizon: "1d", brFlowGroup: "all", brFlowSize: "liq", brRotGroup: "br_sectors", brFlowStrong: false,
  taSel: null, taMode: "today", taFilter: "all", taClass: "Todas", taSort: "best", taSub: {}, taIntroClosed: true, taWatch: [], proChart: "on", calMin: "medium", calCc2: "USD,EUR,GBP,JPY,CNY", calHistCc: "all", calHistKind: "all",
  calView: "eco", earnTheme: "all", earnWin: "30", earnSort: "date", earnSetup: "all", earnOnly: "all",
}; // prettier-ignore

const storedPrefs = store.get("pendulo.prefs", {});
// v2: atualização automática a cada 5 min passa a ser o padrão (antes vinha desligada).
if (!storedPrefs.prefsV) Object.assign(storedPrefs, { autoReload: 5, prefsV: 2 });
// v3: abas enxutas; quem estava numa aba removida volta para o Painel.
if ((storedPrefs.prefsV ?? 0) < 3) Object.assign(storedPrefs, { tab: "dash", prefsV: 3 });
// v4: padrão "Automático" (1 min no pregão dos EUA, 10 min no pré/pós, 60 min fechado).
if ((storedPrefs.prefsV ?? 0) < 4) Object.assign(storedPrefs, { autoReload: "auto", prefsV: 4 });
// v5: cotações em tempo real (canal do servidor); intervalos fixos viram "Tempo real", só "Desligado" fica.
if ((storedPrefs.prefsV ?? 0) < 5)
  Object.assign(storedPrefs, {
    autoReload: storedPrefs.autoReload === 0 ? 0 : "auto",
    prefsV: 5,
  });

// v6: navegação em 5 seções; todo mundo passa uma vez pelo Início (mapa novo do app).
if ((storedPrefs.prefsV ?? 0) < 6) Object.assign(storedPrefs, { tab: "home", prefsV: 6 });
// Aba salva que não existe mais (ex.: Pares, removida em 11/2026) volta para o Início.
if (TAB_ALIAS[storedPrefs.tab]) storedPrefs.tab = TAB_ALIAS[storedPrefs.tab];
if (storedPrefs.tab && !TABS.some(([id]) => id === storedPrefs.tab)) storedPrefs.tab = "home";

export const state = {
  prices: null, snap: null, prefs: { ...prefsDefault, ...storedPrefs },
  charts: [], timer: null, error: null,
  base: null, flowBase: null, flow: null, live: null, liveError: null, late: [],
  back: 0, playing: null, nextAt: null, loading: false,
  portfolio: store.get("pendulo.portfolio", null), history: {}, valuation: null, signals: [], stats: null,
  newVersion: null, pendBusy: false, pendAt: null, pfParsed: null,
  verify: null, verifyAt: 0, verifying: false, audit: null, yields: null, yieldsAt: 0,
  baseAt: 0, news: null, newsAt: 0, newsLoading: false, newsWknd: null, cal: null, calAt: 0, calLoading: false, fund: null, fundAt: 0, fundError: null,
  cloud: { busy: false, error: null, info: null, syncedAt: null, pulledAt: 0 }, pushState: null,
}; // prettier-ignore

export const savePrefs = () => store.set("pendulo.prefs", state.prefs);

/** Funções do app que os outros módulos chamam sem importar app.js (evita dependência circular). */
// render: redesenho pedido por dados de fundo (agrupado, assets/app.js); renderNow: ação do usuário (imediato).
export const hooks = { render: () => {}, renderNow: () => {} };
