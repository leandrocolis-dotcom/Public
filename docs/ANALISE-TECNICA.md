# Análise gráfica no Pêndulo: teoria, fórmulas e como o placar é montado

Aba **Quando entrar** (`assets/ta.js`, `assets/ta-signals.js`, `assets/ta-view.js`). Material educacional, não é recomendação de investimento.

## 1. Princípios (o que a teoria diz)

| Escola / conceito                                      | Ideia central                                                                                                               | Onde entra no site                                                                    |
| ------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------- |
| **Teoria de Dow**                                      | O preço desconta tudo; tendência = topos e fundos sucessivamente mais altos (alta) ou mais baixos (baixa); volume confirma. | `dowStructure` (pivôs), votos de tendência, volume.                                   |
| **Médias móveis** (Brock, Lakonishok, LeBaron)         | Preço acima/abaixo da média e cruzamentos 50/200 separam regimes de alta e de baixa.                                        | MM20/50/200, EMA9/21, "cruz dourada/da morte".                                        |
| **Osciladores de momentum** (Wilder)                   | RSI, estocástico, MACD medem velocidade e exaustão do movimento.                                                            | RSI 14, estocástico 14-3-3, MACD 12-26-9, ROC 20.                                     |
| **Volatilidade** (Bollinger, Wilder)                   | O preço oscila em torno de uma média; extremos tendem a reverter sem tendência, e "andam na banda" com tendência forte.     | Bandas 20/2σ, %B, largura (mola comprimida), ATR 14, distância à MM20.                |
| **Volume** (Wyckoff, Granville, Chaikin)               | O dinheiro confirma ou desmente o movimento: acumulação e distribuição.                                                     | OBV, Chaikin Money Flow 20, MFI 14, volume relativo.                                  |
| **Suporte e resistência**                              | O preço lembra onde virou; nível rompido troca de papel.                                                                    | Pivôs de 3 barras agrupados em zonas (`levels`), máx/mín de 20 dias.                  |
| **Candles japoneses** (Nison)                          | Formatos de 1 a 3 candles sugerem virada; valem mais em piso/teto e com volume.                                             | Martelo, estrela cadente, engolfos, estrelas da manhã/noite, doji.                    |
| **Fibonacci**                                          | Recuos "saudáveis" param em 38,2%, 50% e 61,8% do impulso anterior.                                                         | `fibonacci` sobre o último par topo/fundo.                                            |
| **Divergências**                                       | Preço e oscilador discordam: sinal precoce de exaustão.                                                                     | `divergence` (RSI x pivôs de preço).                                                  |
| **Intradiário**: VWAP, faixa de abertura, pivôs        | O preço médio ponderado por volume é a referência institucional; os 30 primeiros minutos definem a briga do dia.            | `vwapSessions`, ORB 30 min, máx/mín de ontem, pivôs clássicos, gap, horário.          |
| **Gestão de risco** (ATR, stop, relação risco/retorno) | O stop e o tamanho da posição importam mais que a previsão.                                                                 | `buildPlan`: stop por piso/teto limitado a 1–3 ATR; metas em níveis reais ou 1,5R/3R. |

**Fora do escopo de propósito:** Ondas de Elliott, Gann e figuras gráficas (ombro-cabeça-ombro, triângulos, bandeiras). São subjetivas (analistas diferentes desenham contagens diferentes) e portanto não dá para automatizar nem testar de forma honesta.

## 2. Fórmulas implementadas (`assets/ta.js`)

- **SMA(n)** = média dos últimos n fechamentos. **EMA(n)**: α = 2/(n+1), semente = SMA(n).
- **RSI (Wilder, 14)**: `RS = média de ganhos / média de perdas` com suavização `avg = (avg·13 + x)/14`; `RSI = 100 − 100/(1+RS)`.
- **MACD**: `EMA12 − EMA26`; sinal = `EMA9(MACD)`; histograma = MACD − sinal.
- **Estocástico lento**: `%K = 100·(C − mín14)/(máx14 − mín14)` suavizado por 3; `%D` = média de 3 do %K.
- **Bollinger (20, 2σ populacional)**: `%B = (C − inf)/(sup − inf)`; `largura = (sup − inf)/média`.
- **ATR (Wilder, 14)**: média suavizada do _true range_ `max(H−L, |H−Cₐ|, |L−Cₐ|)`.
- **ADX / +DI / −DI (Wilder, 14)**: movimentos direcionais suavizados; `DX = 100·|+DI − −DI|/(+DI + −DI)`; ADX = suavização de 14 do DX.
- **OBV**: soma o volume em dias de alta, subtrai em dias de queda. **CMF(20)** = Σ(MFM·volume)/Σvolume com `MFM = ((C−L)−(H−C))/(H−L)`. **MFI(14)**: "RSI com volume" sobre o preço típico.
- **VWAP**: `Σ(preço típico·volume)/Σvolume`, reinicia a cada sessão; bandas = ±1 desvio-padrão ponderado.
- **Pivôs clássicos**: `P=(H+L+C)/3; R1=2P−L; S1=2P−H; R2=P+(H−L); S2=P−(H−L)` do dia anterior.
- **Pivôs de preço**: topo em _i_ se a máxima é a maior das _k_ barras de cada lado (confirmado _k_ barras depois, sem olhar o futuro).

## 3. Do indicador ao placar (`assets/ta-signals.js`)

1. Cada indicador vira um **voto** em [−1, +1] com peso e um texto em português simples (`vote`).
2. Votos são agrupados em categorias: _tendência_ (MM50/200, cruz, MACD, ADX, Dow), _força do movimento_ (RSI, estocástico, ROC), _esticado ou calmo_ (Bollinger, distância à média), _volume_ (OBV, CMF, volume relativo), _pisos, tetos e padrões_ (suportes/resistências, rompimento de 20 dias, candles, divergência, Fibonacci).
3. **Placar** = `Σ peso·voto / Σ peso × 100` (−100 a +100). Faixas: ≥ +45 COMPRAR; +20 a +45 viés de compra; −20 a +20 AGUARDAR; −45 a −20 viés de venda; ≤ −45 VENDER/REDUZIR.
4. **Confiança**: quantas categorias apontam para o mesmo lado do placar (alta ≥ 4, média 3, baixa < 3).
5. **Timing** (separado do placar): um ativo forte, mas esticado (RSI > 75, acima da banda, > 2,5 ATR da MM20, colado num teto) recebe "esperar recuo" com a zona de entrada sugerida.
6. **Plano**: stop = piso (ou teto) mais próximo ± 0,25 ATR, limitado a 1,2–3 ATR no diário e 0,8–2,5 "unidades de meia hora" (ATR5·√6) no dia; metas em pisos/tetos reais entre 1,2R e 4R (meta 1) e 2,4R e 7R (meta 2), senão 1,5R e 3R.
7. **Hoje**: placar próprio (VWAP, faixa de abertura, médias de 5 min, estrutura do dia, máx/mín de ontem, gap, RSI 5 min, volume acumulado vs. mesmo horário) + fase do pregão em horário de Nova York e de Brasília. `finalCall` combina diário e dia numa frase de ação (ex.: "bom ativo, dia fraco: aguardar").
8. **Histórico do sinal** (`backtestDaily`): para cada dia com placar ≥ +20 ou ≤ −20, mede o retorno 5 pregões depois, sem sobreposição, e compara com um dia qualquer. Se o sinal não foi melhor, o texto diz.

Os pesos e limiares são **regras práticas, não otimizadas** (de propósito, para não "ajustar ao passado").

## 4. Evidência e limites

- Brock, Lakonishok e LeBaron (1992): médias móveis e rompimentos com valor preditivo no Dow Jones (1897–1986).
- Park e Irwin (2007), revisão: 58 de 92 estudos modernos positivos, mas com _data snooping_ e custos ignorados; depois de corrigir, poucos mercados seguiram lucrativos.
- Rompimento da faixa de abertura (ORB): o ganho bruto de um estudo popular se reproduz, mas líquido de custos fica perto de zero em replicação independente. Por isso é usado só como contexto.
- Padrões de candle isolados: acerto de ~55–65% em levantamentos de backtests; melhoram em pisos/tetos e com volume.
- Mercado eficiente e muito observado (grandes ETFs): regras populares perdem força.

## 4.1 Como traders ganham dinheiro (base das lições 9 a 17)

Material incorporado em `LESSONS` (`assets/ta-glossary.js`), mostrado em "Aprenda" na aba Quando entrar.

- **Quem perde:** 97% dos day traders de mini-índice que persistiram mais de 300 pregões perderam (Chague, De-Losso e Giovannetti, 2020); menos de 1% lucra de forma previsível em Taiwan (Barber, Lee, Liu e Odean).
- **O que funciona:** seguir tendência e momentum de forma sistemática e diversificada (Moskowitz, Ooi e Pedersen, 2012; Hurst, Ooi e Pedersen, 2017; Jegadeesh e Titman, 1993). Padrões visuais isolados (Elliott, Fibonacci, candles soltos) têm pouca ou nenhuma evidência.
- **Fontes de vantagem:** prêmio de tendência, reação lenta, exagero e falta de liquidez, fluxos obrigatórios, eventos e velocidade (inacessível ao varejo). Sem fonte identificada não há vantagem.
- **Métricas:** expectativa = acerto × ganho médio − (1 − acerto) × perda média (> 0 depois dos custos); acerto para empatar = 1 ÷ (1 + ganho/perda); profit factor, SQN, Sharpe, drawdown máximo, Calmar; perda x exige ganho x ÷ (1 − x).
- **Tamanho da posição:** fração fixa de 0,5–1% de risco por operação; ATR para igualar o risco entre ativos; Kelly só como teto (¼ a ½); risco total aberto de até 5–8%; reduzir à metade depois de −10% e parar depois de −20%.
- **Backtest:** hipótese econômica → regras escritas → dentro e fora da amostra → janela móvel → variação de parâmetros → papel. A expectativa precisa sobreviver a 2× o custo estimado.
- **ETFs alavancados:** retorno ≈ L·r − ½·(L² − L)·σ²·t; gerar o sinal no ativo de referência e executar no alavancado.

### Na prática: o filtro de vantagem (`assets/edge.js`)

As decisões do app passam por um filtro de vantagem depois do placar. Ele vale igual no radar, no detalhe e nos ativos vigiados (`assetCall` em `ta-data.js`).

1. **Expectativa medida em R** (`simulateR` + `tradeStats`): cada dia com placar ≥ +20 (ou ≤ −20) vira uma operação simulada. A entrada é na abertura do dia seguinte (para não olhar o futuro), o stop fica a 2,5 ATR, a saída é no stop ou em 20 pregões e há 0,05% de custo por perna. O app mostra acerto, acerto para empatar, expectativa, profit factor e pior sequência.
2. **Bloqueio:** com 10 ou mais operações e expectativa ≤ 0, a resposta vira "AGUARDAR: compra (ou venda) sem vantagem medida" (`applyEdge`). Com menos de 10, a nota fica "C" (sem evidência) e nada é bloqueado.
3. **Regime** (`regimeOf`): S&P abaixo da MM200 corta pela metade o tamanho das compras de ações (grupos Ações EUA, Ações Globais e Setores). A volatilidade de 20 dias é comparada com a mediana do ano.
4. **Momentum 12-1** (`momentumRank`): percentil no universo. Os 30% melhores contam a favor de compras; os 30% piores contam contra.
5. **Decaimento:** inversos, alavancados e futuros de VIX (TBF, VIXY e a tabela de `etf-fund.js`) recebem metade do tamanho e um aviso de uso tático.
6. **Nota:** A (expectativa ≥ +0,2R e nada contra), B (expectativa positiva), C (amostra pequena), D (expectativa negativa, bloqueia).
7. **Plano:** o tamanho máximo considera o corte (0,5% de risco em vez de 1%), e o teto por Kelly ¼ aparece com 20 ou mais operações.
8. **Decisões:** card de regime + rotação setorial (top 3 setores em 6 meses com o S&P acima da MM200; senão SGOV). As oportunidades do universo são ordenadas por força + momentum. Regras que não bateram um dia qualquer (com 30 ou mais ocorrências) e compras contra o regime vão para o fim, com marcas ✓/✗.

9. **Decisão do trader** (aba Análise, painel Decisões e avisos de nível): `traderDecision(r, market, { gate: true })` calcula a mesma vantagem (`decisionEdge`: expectativa do sinal técnico no próprio ativo, regime do S&P, decaimento). Expectativa negativa medida rebaixa "Comprar"/"Reduzir" para "Aguardar" e mostra a decisão original. Regime contra ou decaimento acrescentam "metade do tamanho" aos avisos de compra. **O Simulador e o treino do modelo chamam sem `gate`**: o teste usa o histórico inteiro e, numa data passada, seria olhar o futuro (e o aprendizado do modelo não deve mudar sem ordem do usuário).
10. **Push do servidor** (`scripts/lib/push-alerts.mjs`): avisos de nível usam a decisão com `gate`. Sinais de entrada da carteira levam a marca ✗ quando a regra não bateu um dia qualquer ou quando a compra vai contra o regime (`edgeNote`). O mesmo vale para as notificações com o app aberto.

A aba Análise não ranqueia momentum (não tem um universo para comparar). Por isso, a mesma ação pode ter nota A em Quando entrar e B na Análise.

**Escolha da saída (transparência sobre o teste):** testamos três saídas nos 47 ativos (~2 anos de dados): fixa em 10 pregões (stop 2 ATR), fixa em 20 pregões (stop 2,5 ATR) e móvel (placar negativo ou máxima − 3 ATR). A expectativa média foi −0,01R, +0,25R e +0,15R, respectivamente. Ficamos com 20 pregões e 2,5 ATR porque é o horizonte do plano "próximos dias/semanas" e o stop recomendado na lição 14, não por ter sido a melhor. Ainda assim, há risco de ajuste ao passado, e a amostra cobre quase só um mercado de alta.

**No app:** o plano de cada ativo mostra o acerto para empatar (`100 ÷ (1 + ganho/risco)`) e um checklist antes de entrar. O checklist marca sozinho o que o motor sabe (sinais a favor com confiança, momento esticado ou não, stop definido, ganho/risco ≥ 2) e deixa para o usuário o que ele não sabe (tamanho, risco total, agenda de eventos, diário).

## 5. Ativos vigiados

No detalhe do ativo, **☆ Vigiar** (até 5 ativos). Com o pregão aberto e a página visível, a cada 60 s a página busca as barras de 5 min de cada ativo vigiado, recalcula a resposta e **avisa na tela quando ela muda** (ex.: de "Aguardar" para "Comprar"). O aviso só funciona enquanto a página está aberta (não há servidor nem notificação do navegador). As mudanças ficam registradas em "O que mudou hoje neste ativo".

## 6. Dados

- **Diário**: `data/ohlc.json` (abertura, máxima, mínima, fechamento e volume em milhares; ~520 pregões), gerado por `scripts/update_prices.py` no workflow. Com o pregão aberto o dia parcial não entra no arquivo (o arquivo só muda quando um pregão novo fecha). Se o arquivo não existir, a página usa só fechamentos de `data/prices.json` (sem candles/volume) e avisa.
- **Hoje**: `api/intraday.js` devolve barras de 5 min dos últimos 5 pregões de **um** ativo do universo (Yahoo, gratuito, cache de 60 s na borda). A página atualiza a cada 60 s com o ativo aberto.
- **Ao vivo**: o último dia diário é montado a partir das barras de 5 min (ou da cotação de `api/quotes`).

## 7. Fontes

- Brock, Lakonishok e LeBaron (1992), _Simple Technical Trading Rules and the Stochastic Properties of Stock Returns_: <https://ideas.repec.org/a/bla/jfinan/v47y1992i5p1731-64.html>
- RSI: <https://en.wikipedia.org/wiki/Relative_strength_index>
- Pontos de pivô: <https://en.wikipedia.org/wiki/Pivot_point_(technical_analysis)>
- Fibonacci: <https://www.babypips.com/forexpedia/fibonacci-retracement>
- Indicadores (CFA): <https://analystprep.com/cfa-level-1-exam/portfolio-management/technical-analysis-indicators/>
- Chaikin Money Flow: <https://infront-investment-manager.helpcenter.infront.co/en/im/latest/chaikin-money-flow>
- Replicação do ORB: <https://www.mql5.com/en/blogs/post/776235>
- Chague, De-Losso e Giovannetti (2020), _Day Trading for a Living?_; Moskowitz, Ooi e Pedersen (2012), _Time Series Momentum_; Hurst, Ooi e Pedersen (2017), _A Century of Evidence on Trend-Following Investing_; Jegadeesh e Titman (1993); Park e Irwin (2007).
- Leituras práticas: Clenow (_Following the Trend_, _Stocks on the Move_); Van Tharp (_Trade Your Way to Financial Freedom_); Aronson (_Evidence-Based Technical Analysis_); Minervini (_Trade Like a Stock Market Wizard_).
- Livros: Edwards e Magee (_Technical Analysis of Stock Trends_); Murphy (_Technical Analysis of the Financial Markets_); Wilder (_New Concepts in Technical Trading Systems_); Bollinger (_Bollinger on Bollinger Bands_); Nison (_Japanese Candlestick Charting Techniques_).

## 8. Limitações conhecidas

- O código de geração de `data/ohlc.json` foi testado com dados sintéticos; a primeira execução real do workflow deve ser conferida.
- O calendário de feriados e pregões encurtados da NYSE (`sessionInfo` em `ta-signals.js`) cobre 2026 e 2027 e precisa ser atualizado todo ano.
- ETFs alavancados e inversos usam o mesmo motor; o comportamento deles (decaimento) não é modelado.
- O histórico do sinal é um teste simples (sem custos, uma janela só); poucas ocorrências significam pouca confiança.
