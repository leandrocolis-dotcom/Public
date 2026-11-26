# Estudo 2: como funcionam os modelos de sinais de entrada e saída (com busca na web) e proposta de modelagem única

> Scripts citados aqui e removidos do repo em 21/11/2026 (estudo encerrado; conclusões abaixo valem): `spy-guard-study.mjs`. Para rodar de novo: `git show a3845cf:scripts/<nome>.mjs > scripts/<nome>.mjs`.

> Material educacional; não é recomendação de investimento. Pesquisa feita em 12/10/2026 **com busca na web**
> (WebSearch, ~19 consultas). Complementa `docs/ESTUDO-FERRAMENTAS-SINAIS.md` (que veio só de conhecimento prévio) e
> se junta aos achados medidos do próprio app (`ESTUDO-GATILHOS.md`, `ESTUDO-TENDENCIA.md`, `estudo-conclusoes.md`).
> **Nenhuma regra ou limite do app foi alterado.** Pesos proprietários não são públicos: o que for dedução está
> marcado como **(inferido)**. A maior parte das fontes é secundária (resenhas, scripts da comunidade, blogs);
> onde a fonte primária não foi alcançada, está dito.

## 1. O que a busca confirmou ou corrigiu no estudo anterior

| Ferramenta                              | Confirmado na web                                                                                                                                                                                                                     | Ressalva / correção                                                                                                                                                                                                  |
| --------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Trade Ideas Holly                       | Roda estratégias à noite, ativa só as que passam em critério de desempenho, cada sinal traz entrada, stop e alvo; 5 a 25 trades/dia, sem posição overnight                                                                            | O nº de estratégias varia por fonte (35 a 70+). **Os limiares "60% de acerto e 2:1" não apareceram em fonte independente**: tratar como (inferido). Sinais vão para toda a comunidade, então a entrada fica "lotada" |
| Zacks Rank                              | 4 componentes (concordância, magnitude, upside, surpresa); só o top 5% é #1; retorno de 25,4% a.a. (1988–2018) é **autodeclarado**                                                                                                    | Metodologia de retorno não é auditável (carteira hipotética igual-ponderada, ações sem preço de fim de mês excluídas). Crítica independente (CXO Advisory) questiona se é explorável                                 |
| Danelfin                                | Score 1–10 = probabilidade de superar o benchmark (S&P 500 / STOXX 600) em ~3 meses; 900+ indicadores (600 técnicos, 150 fundamentalistas, 150 sentimento); explicável (XAI)                                                          | "Nota 10" não é 100%: é um balde de ranking. Desempenho citado (+20% em 60 dias) é do fornecedor. Sub-scores e pesos **não divulgados**                                                                              |
| IBD / CAN SLIM                          | Stop de 7–8% sobre o ponto de compra, "sem exceção"; entrada na saída de base (copo-com-alça ≥ 7 semanas); volume ≥ 40% acima da média                                                                                                | Detalhes de alça (≤ 12% de recuo, ponto de compra 10 centavos acima) vêm de um glossário, não do O'Neil. A referência do stop (compra × entrada) varia por fonte                                                     |
| TrendSpider                             | Linhas de tendência, padrões e velas detectados por algoritmo; análise multi-timeframe (linhas do tempo maior aparecem tracejadas no gráfico menor); Raindrop = High, Low, VWAP esquerdo e direito                                    | Documentação não traz regra de entrada/saída nem backtest de acerto; é ferramenta de leitura, não de sinal                                                                                                           |
| Tickeron                                | Padrões com "nível de confiança" que pesa histórico do ativo, taxa de sucesso do padrão e direção do mercado; mostra previsões passadas                                                                                               | Fórmula da confiança **não publicada** (inferido: frequência histórica do padrão ajustada por regime)                                                                                                                |
| StockCharts SCTR                        | **Pesos publicados:** longo prazo 60% (EMA200 distância 30% + ROC125 30%), médio 30% (EMA50 distância 15% + ROC20 15%), curto 10% (inclinação do PPO 5% + RSI 5%, este último de fonte terceira); percentil 0–99,9 dentro do universo | É o único "score técnico" de grande site com pesos abertos. Mostra que o peso está no **longo prazo (60%)**                                                                                                          |
| Setup 9.1 (L. Williams)                 | Contexto: MME9 ascendente. Gatilho: após fechamento abaixo da mínima do candle de referência, entrada ao romper a máxima; stop na mínima do candle (folga 0,01–0,10)                                                                  | Fontes são scripts da comunidade; nada sobre implementação no Profit/Nelogica foi encontrado                                                                                                                         |
| TradeMap / Investidor10 / Status Invest | TradeMap agrega recomendações e preço-alvo de 10+ corretoras; Investidor10 usa preço justo de Graham e Bazin                                                                                                                          | **Nenhum publica metodologia de sinal de compra/venda.** São agregadores/fundamentalistas, não geradores de sinal                                                                                                    |

## 2. Modelos sistemáticos com regras públicas (os que dá para replicar e medir)

| Modelo                               | Entrada                                                                                                                                                                     | Saída / stop                                                                                    | Premissa                                                    | Evidência encontrada e fraqueza                                                                                                                                                                                                                                |
| ------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------- | ----------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Faber GTAA (10 meses)**            | Fim do mês: comprar a classe se preço > média de 10 meses (~MM200)                                                                                                          | Fim do mês: sair para caixa se preço < média; ignora o intradiário                              | Tendência de classes de ativos persiste; evita bear markets | Queda máxima de 46% para <10% no backtest do autor (carteira de 5 classes). Revisão de 10 anos: Sharpe 0,45 → 0,80; porém o timing perdeu para ações em 6 de 8 anos seguintes. Sensível ao dia de rebalanceamento                                              |
| **Dual Momentum (Antonacci)**        | Todo mês: (1) momentum **relativo**: escolher o melhor entre S&P e mundo ex-EUA em 12 meses; (2) momentum **absoluto**: só ficar nele se rendeu mais que T-bill em 12 meses | Se o absoluto falha, ir para T-bills/títulos                                                    | Tendência de 12 meses (Moskowitz et al.) + rotação          | 12 meses foi o prazo mais significativo em 1–48 testados. Alpha Architect: uma alternativa robusta (RAA) igualou ou superou. Exige giro mensal e tem custo fiscal                                                                                              |
| **Time-series momentum**             | Comprado se retorno de 12 meses > 0, vendido se < 0, cada ativo                                                                                                             | Reavalia todo mês; tamanho = 40% ÷ volatilidade passada                                         | Persistência de 1 a 12 meses em 58 instrumentos             | Críticas (Kim–Tse–Wald; Goyal–Jegadeesh): o resultado vem em boa parte do **escalonamento por volatilidade**, não do momentum, e some em 2009–2013. Bate com `ESTUDO-TENDENCIA.md` (Sharpe baixo)                                                              |
| **Tartarugas (Donchian)**            | Sistema 1: rompe máxima de 20 dias (pula se o último sinal do Sistema 1 foi vencedor); Sistema 2: máxima de 55 dias (toma todos)                                            | Sistema 1 sai na mínima de 10 dias; Sistema 2 na de 20; stop de 2N (N = ATR de 20 dias, Wilder) | Tendências longas pagam poucos grandes ganhos               | **Tamanho pela volatilidade:** 2N de stop = 1% do patrimônio de risco; até 4 unidades por mercado; piramidar a cada 0,5N. Fontes divergem em saída de 10 × 15 dias. No app, rompimento de 55 dias **perdeu** de um dia qualquer em ETFs (`ESTUDO-GATILHOS` E2) |
| **Minervini (Trend Template)**       | 8 critérios: preço > MM50 > MM150 > MM200, MM200 subindo, preço ≥ 25–30% acima da mínima de 52 semanas e ≤ 25% da máxima de 52 semanas, força relativa alta                 | Stop inicial de 7–8%, só sobe, nunca desce                                                      | Comprar só Estágio 2 com força relativa                     | Fontes são scripts/guias, limiares divergem (25% × 30%). Filtro de **tendência + força relativa**, igual em IBD e Weinstein                                                                                                                                    |
| **Weinstein (estágios)**             | Estágio 2: preço rompe a base com volume, MM de 30 semanas virando para cima, força relativa Mansfield positiva                                                             | Estágio 3 (topo): parar de comprar, stop móvel; Estágio 4: sair                                 | Ciclo de 4 estágios no gráfico semanal                      | Atrasa por construção; rompimento pode falhar; a MM30s leva semanas para mudar                                                                                                                                                                                 |
| **Connors RSI(2)**                   | Fechamento > MM200 **e** RSI(2) < 5 (ou < 10)                                                                                                                               | Fechou acima da MM5, ou RSI(2) > 70, ou perdeu a MM200                                          | Reversão à média de curto prazo dentro de tendência de alta | S&P 500 (teste de um site, com custos, 10 anos): 71% de acerto, ganho médio 1,22% × perda média 2,10%, +1,7% a.a. contra 13,5% do buy and hold; Nasdaq 100: 2,4% a.a. × 20,2%. Alto acerto, pouco retorno, perdas maiores que ganhos                           |
| **Piotroski F-Score**                | Nota 0–9 (9 testes binários de rentabilidade, alavancagem/liquidez e eficiência); >6 historicamente melhor                                                                  | Rebalanceamento periódico                                                                       | Qualidade contábil prevê retorno em ações baratas           | Só ações com balanço; não vale para ETF                                                                                                                                                                                                                        |
| **Magic Formula (Greenblatt)**       | Ranking combinado de earnings yield (EBIT/EV) e retorno sobre capital; 20–30 ações; excluir financeiras e utilities                                                         | Rebalancear 1× ao ano; manter 5–10 anos                                                         | Barato + bom negócio                                        | Mais volatilidade e longos períodos de subdesempenho; versões divergem                                                                                                                                                                                         |
| **Stop ATR (Chandelier/Supertrend)** | —                                                                                                                                                                           | Máxima de N períodos − 3×ATR(22); só aperta (catraca)                                           | Dá espaço proporcional à volatilidade                       | **Não achei backtest rigoroso** comparando com stop percentual fixo; só páginas de fornecedor. No app, S4 (3 ATR abaixo da máxima de 60) cortou a pior queda de −43% para −33%                                                                                 |

## 3. Padrões que se repetem (síntese)

| Regra recorrente                                           | Quem usa                                                             | Peso da evidência (web + app)                                                                                                                                 |
| ---------------------------------------------------------- | -------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Filtro de tendência longa (MM200 / 10 meses / 30 sem.)** | Faber, Dual Momentum, Minervini, Weinstein, Connors, IBD, SCTR (60%) | **Forte para "deixar de perder"**: no app, SPY + MM200 de fim de mês cortou a queda de −55% para −24% rendendo quase o mesmo em 33 anos. Não gera lucro extra |
| **Momentum de 6–12 meses (relativo)**                      | Dual Momentum, TSMOM, IBD RS, SCTR, Danelfin, Seeking Alpha          | Moderada: no app, top 20% por 12-1 rendeu 2 p.p. a.a. a mais que o universo, mas **não** bateu o S&P 500                                                      |
| **Momentum absoluto (ativo > caixa)**                      | Dual Momentum, Faber, TSMOM                                          | Mesmo efeito do filtro de tendência: protege                                                                                                                  |
| **Stop fixo 7–8% ou 2×ATR; tamanho pela volatilidade**     | IBD, Minervini, Tartarugas, Chandelier                               | Boa para controlar perda por trade; o app já usa stop de 2,5 ATR. O ganho vem do **tamanho**, não do ponto de entrada                                         |
| **Saída só aperta (catraca)**                              | Minervini, Chandelier, Tartarugas (saída de 10 dias)                 | Regra de disciplina, sem backtest independente achado                                                                                                         |
| **Reversão à média só dentro de tendência de alta**        | Connors, setup 9.1/Ponto Contínuo                                    | Acerto alto, retorno baixo, perda média > ganho médio                                                                                                         |
| **Rompimento com volume**                                  | IBD, Weinstein, Finviz, Trade Ideas                                  | No app, rompimento de máxima de 55 dias perdeu de um dia qualquer nos ETFs                                                                                    |
| **Distribuição forçada / percentil**                       | Zacks, SCTR, IBD, Danelfin                                           | Reduz o número de sinais: casa com "poucos gatilhos"                                                                                                          |
| **Confiança calibrada + histórico de acerto visível**      | Danelfin, Tickeron                                                   | Boa prática de transparência; ninguém mostra intervalo de erro                                                                                                |

**O que quase ninguém mostra:** custos e impostos; resultado fora da amostra auditado; quantas regras foram testadas até achar a que aparece (viés de seleção); desempenho **por regime**; e a diferença entre "acertar a direção" e "ganhar dinheiro" (Connors: 71% de acerto e perde do buy and hold).

## 4. Diagnóstico: o que o app já mediu diz sobre cada família de regra

1. **Entrada não ganha de comprar em um dia qualquer** (placar técnico, rompimento 55d, RSI(2), todas sem significância). O único sinal fraco de ganho é **momentum 12-1** (+0,31% de excesso em 20 pregões, t 0,8; +3,3% em 60 pregões).
2. **Saída/proteção funciona como seguro**: reduz a pior queda e custa rendimento. Melhor equilíbrio: **perdeu a MM200** (−7 p.p. de queda máxima por 1,3 p.p. a.a.). A versão de fim do mês no SPY foi a melhor encontrada (33 anos).
3. **"Comprar o recuo" perde** (−0,19R) e **"Reduzir" é a única lógica de operar com vantagem** (+0,10R, aprovada nos testes múltiplos).
4. **Nada bateu o S&P 500 em dinheiro** nos últimos 10 anos. Para ganhar dinheiro na entrada, a alternativa honesta é: **comprar e segurar o índice com seguro de queda**, e usar o resto do sistema para escolher _qual_ ativo (momentum) e _quando reduzir_.

A web reforça (1) e (2): as regras vencedoras na literatura (Faber, Dual Momentum, TSMOM) são **de tendência longa em fim de mês**, e a vantagem delas é **drawdown menor**, não retorno maior. As regras de curto prazo (Connors, setups de 9 períodos) têm acerto alto e retorno ruim.

## 5. Modelagem única proposta para o app (para avaliar, não aplicada)

Uma única máquina de estados por ativo, em vez de dezenas de lógicas independentes. Cada camada tem **uma pergunta** e **uma métrica de prova**. Nada daqui altera a aba Decisões sem ordem do usuário (`CLAUDE.md`).

### Camada 1: regime (liga/desliga a entrada)

- Índice de referência (SPY; para BR, IBOV/BOVA11) fechou o **mês** acima da MM200 (Faber, Dual Momentum, IBD).
- Se abaixo: **nenhum sinal de entrada**; só proteção. Já medido no app (`spy-guard-study`).

### Camada 2: seleção (qual ativo)

- Ranking percentil dentro do universo por **momentum 12-1** (peso maior no longo prazo, como SCTR: 60/30/10) com filtro de **ativo acima da própria MM200** (momentum absoluto).
- Só os **top 20%** viram "candidatos a entrar" (distribuição forçada: poucos gatilhos).
- Rótulo de armadilha para o que está barato e fraco (Stockopedia).

### Camada 3: entrada (quando)

- Candidato + regime ligado + **sem exigir "timing de recuo"** (o app mediu que comprar recuo perde). Entrada em **escalonamento mensal** (fim do mês), não diária.
- Tamanho pela volatilidade: risco fixo por posição (ex.: 1% do patrimônio, stop de 2 a 2,5 ATR), como Tartarugas e o R do app.

### Camada 4: saída/proteção (já alocado)

- **Stop inicial** em 2,5 ATR (já no app) e **catraca**: o stop só sobe (Minervini/Chandelier).
- **Saída de tendência**: fechamento do mês abaixo da MM200 do ativo → reduzir/zerar (Faber). Medido como o melhor "deixar de perder".
- **"Reduzir"** da Decisão do trader mantém-se como alerta (única lógica com vantagem estatística).

### Camada 5: validação (o que manda no modelo)

- Todo gatilho precisa: (a) resultado em **dinheiro e queda máxima** contra _segurar_; (b) por regime; (c) correção de testes múltiplos (Benjamini-Hochberg, já no learner v2); (d) diário ao vivo fora da amostra antes de ir para a tela (regra 3 do `OBJETIVO.md`).

### Quadro de integração com os achados anteriores

| Achado anterior (app)                                              | Fonte web que converge                     | Papel na modelagem única              |
| ------------------------------------------------------------------ | ------------------------------------------ | ------------------------------------- |
| SPY + MM200 fim do mês (queda −24% × −55%)                         | Faber, Dual Momentum                       | Camada 1 e 4                          |
| Momentum 12-1 top 20% (+2 p.p. sobre universo)                     | Dual Momentum, TSMOM, SCTR, IBD RS         | Camada 2                              |
| Comprar recuo perde (−0,19R)                                       | Connors (acerto alto, retorno baixo)       | Camada 3: não usar                    |
| Rompimento 55d perde de dia qualquer                               | Tartarugas (ganha em futuros, não em ETFs) | Não usar como gatilho de ETF          |
| Trend multiclasse = seguro de cauda (Sharpe 0,55–0,89, corr. 0,02) | TSMOM e críticas                           | Complemento de 10–20%, fora do núcleo |
| "Reduzir" com vantagem (+0,10R)                                    | Saída por catraca/stop                     | Camada 4                              |
| Inversos perdem                                                    | —                                          | Fora do modelo                        |

## 6. Experimentos propostos (ordem de valor; registrar regra e critério antes de rodar)

1. **Catraca + MM200 mensal por ativo** (Camada 4) contra "segurar" e contra stop fixo de 8%, nos 40 ETFs, 10 anos, por regime. Métrica: queda máxima e retorno líquido de custos (e T-bill no caixa).
2. **Momentum 12-1 top 20% + filtro de regime mensal (Camada 1+2)** como regra única de entrada, comparada a "SPY + MM200 mensal". Pergunta: a seleção adiciona algo sobre o índice protegido?
3. **Pesos 60/30/10 estilo SCTR** como alternativa ao placar técnico atual: testar se um score de longo prazo ordena melhor o excesso do que o placar de hoje.
4. **Tamanho por volatilidade (risco igual)** contra pesos iguais: a literatura sugere que parte do ganho do TSMOM vem daí.
5. **Dual Momentum simplificado** (S&P × mundo ex-EUA × T-bill) com os ETFs do universo: verificar se o app já cobre (SPY, EFA/VEA).
6. **Mercado brasileiro**: repetir 1 e 2 com IBOV/BOVA11 e ações da B3; incluir imposto (15% sobre ganho; a vantagem do giro mensal pode sumir).
7. **Armadilhas**: medir se "barato e fraco" (valor sem momentum) pior que o universo na aba Valor.

## 7. Limites desta pesquisa

- Busca na web retornou majoritariamente **fontes secundárias**; nenhum PDF ou página primária de Zacks, Danelfin, Trade Ideas, Tickeron ou do paper de Faber foi lido na íntegra.
- Números de desempenho dos fornecedores (Zacks 25,4% a.a.; Danelfin +20% em 60 dias) são **autodeclarados**, sem custos nem auditoria.
- Pesos e limiares de Holly, Danelfin e Tickeron **não são públicos**; qualquer coisa além do que está na seção 1 é **(inferido)**.
- Plataformas brasileiras pesquisadas (TradeMap, Investidor10, Status Invest) **não divulgam metodologia de sinal**.
- Resultados do app são de 10 anos dominados pela alta do S&P 500; regras de proteção parecem caras nesse período e baratas em baixas longas.
- Não há recomendação de investimento; nenhuma regra foi aplicada ao app.

## Fontes consultadas (busca na web, 12/10/2026)

- Trade Ideas Holly: [daytradingtoolkit](https://daytradingtoolkit.com/trading-tools-tutorials/trade-ideas-holly-ai-explained), [curvedtrading](https://curvedtrading.com/articles/en/reviews/trade-ideas-review/), [finmasters](https://finmasters.com/trade-ideas-review/)
- TrendSpider: [help.trendspider.com MTFA](https://help.trendspider.com/kb/charting/multi-timeframe-analysis), [CME Direct](https://cmegroup.com/solutions/market-access/cme-direct/introducing-trendspider-charting-functionality-for-cme-direct.html)
- Danelfin: [Kiplinger](https://kiplinger.com/investing/stocks/604067/can-ai-beat-the-market-10-stocks-to-watch), [diyai.io](https://diyai.io/ai-tools/finance/reviews/danelfin-review/)
- Zacks: [CXO Advisory](https://www.cxoadvisory.com/fundamental-valuation/are-zacks-rankings-exploitable/), [Nasdaq/Zacks](https://www.nasdaq.com/articles/how-pick-winning-stocks-zacks-rank)
- CAN SLIM: [Wikipedia](https://en.wikipedia.org/wiki/CAN_SLIM)
- Minervini: [TradingView SEPA](https://in.tradingview.com/script/kcihs4Hp-Minervini-SEPA-System), [sharpely](https://sharpely.in/blogs/minervini-trend-template-for-stage2-stocks/)
- SCTR: [StockCharts Chart School](https://chartschool.stockcharts.com/table-of-contents/technical-indicators-and-overlays/technical-indicators/stockcharts-technical-rank), [fórum StockCharts](https://scan.stockcharts.com/discussion/comment/7672)
- Faber GTAA: [QuantConnect](https://www.quantconnect.com/forum/discussion/8285/a-quantitative-approach-to-tactical-asset-allocation-gtaa-5-with-simplemovingaverage/), [etf.com Swedroe](https://www.etf.com/sections/index-investor-corner/swedroe-why-financial-trends-persist)
- Dual Momentum: [Advisor Perspectives](https://www.advisorperspectives.com/commentaries/2015/01/29/momentum-x-2-unleashing-the-true-power-of-momentum), [Alpha Architect](https://alphaarchitect.com/asset-allocation-horserace-robust-asset-allocation-raa-vs-dual-momentum/)
- Connors RSI(2): [Backtrex S&P 500](https://backtrex.com/en/backtests/connors-rsi-2-sp-500), [Quantified Strategies](https://quantifiedstrategies.substack.com/p/larry-connors-r3-strategy-it-still-795)
- Tartarugas: [MQL5](https://www.mql5.com/en/articles/23448), [NexusFi](https://nexusfi.com/a/indicators/donchian-channels)
- Weinstein: [LuxAlgo](https://www.luxalgo.com/library/concept/weinstein-stage-analysis.md)
- Tickeron: [Barchart](https://www.barchart.com/story/news/21027766/tickeron-unlocks-hidden-market-insights-with-ai-stock-pattern-search-engine), [Liberated Stock Trader](https://www.liberatedstocktrader.com/tickeron-review/)
- Setup 9.1: [TradingView (EduHit)](https://br.tradingview.com/script/96Y9tZHb)
- TSMOM: [SSRN](https://papers.ssrn.com/abstract=2089463), [Alpha Architect](https://alphaarchitect.com/2016/12/time-series-momentum-volatility-scaling-and-crisis-alpha/), [Quantpedia](https://quantpedia.com/deconstructing-the-time-series-momentum-strategy/)
- Piotroski / Magic Formula: [Wikipedia F-score](https://en.wikipedia.org/wiki/Piotroski_F-score), [Wikipedia Magic Formula](https://en.wikipedia.org/wiki/Magic_formula_investing)
- Chandelier / ATR: [LuxAlgo](https://www.luxalgo.com/library/indicator/chandelier-exit/)
- Plataformas BR: [TradeMap](https://trademap.com.br/?p=238492)
