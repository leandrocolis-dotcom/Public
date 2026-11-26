# Estudo: como funcionam as ferramentas de sugestão de trading

Engenharia reversa (a partir de documentação pública, metodologias divulgadas e
comportamento observável) dos principais sites e ferramentas que dão sinais de
compra/venda, entrada e saída. Objetivo: extrair premissas e regras que possam
servir aos gatilhos do Pêndulo (`docs/OBJETIVO.md`). Material educacional; não é
recomendação de investimento.

> Fonte: conhecimento público até 2026 (páginas de metodologia, white papers,
> FAQs). Pesos exatos de modelos proprietários não são divulgados; onde houver
> inferência, está marcado como **(inferido)**.

---

## 1. Votação de indicadores técnicos

### TradingView — "Technical Ratings"

- **Modelo:** contagem de votos. Cada indicador vota +1 (compra), 0 (neutro) ou
  −1 (venda). Média dos votos em dois grupos:
  - **Médias móveis (15):** SMA e EMA 10/20/30/50/100/200, Ichimoku (linha base),
    VWMA 20, Hull MA 9. Regra: preço > MA → compra; < MA → venda.
  - **Osciladores (11):** RSI 14, Estocástico, CCI 20, ADX 14, Awesome
    Oscillator, Momentum 10, MACD, Stoch RSI, Williams %R, Bull/Bear Power,
    Ultimate Oscillator. Regras: RSI < 30 e subindo → compra; > 70 e caindo →
    venda; MACD acima da linha de sinal → compra etc.
- **Saída:** média ∈ [−1, 1] → Venda forte (< −0,5), Venda (−0,5 a −0,1),
  Neutro, Compra (0,1 a 0,5), Compra forte (> 0,5). Rating geral = média dos dois
  grupos.
- **Premissa:** consenso de muitos indicadores reduz ruído. **Fraqueza:** os
  indicadores são altamente correlacionados (todos derivados do preço), então o
  "consenso" é basicamente seguir tendência; sem backtest publicado.

### Investing.com — "Technical Summary"

- Mesmo princípio: 12 indicadores + 12 médias móveis (simples e exponenciais
  5/10/20/50/100/200) por timeframe (5 min a mensal). Contagem de "Buy/Sell"
  → Strong Buy / Buy / Neutral / Sell / Strong Sell.
- Também mostra pivôs clássicos, Fibonacci, Camarilla e Woodie como suportes e
  resistências (alvos e stops implícitos).

### Barchart — "Opinion"

- 13 indicadores em três prazos (curto: 7 indicadores; médio; longo). Resultado
  em % (ex.: "88% Buy"), mais **força** (fraca/média/forte/máxima) e
  **direção** (fortalecendo/enfraquecendo), comparando a opinião de hoje com
  a de ontem.
- **Ideia útil:** a _variação_ do sinal (direção) carrega informação separada
  do nível.

---

## 2. Rankings quantitativos multifator (ações)

### Zacks Rank (1 a 5)

- **Fator único dominante: revisão de estimativas de lucro (EPS).** Quatro
  componentes: concordância (quantos analistas revisaram na mesma direção),
  magnitude (tamanho da revisão nos últimos 60 dias), upside (estimativa mais
  precisa vs. consenso) e surpresa (histórico de bater lucro).
- Distribuição forçada: 5% Strong Buy (#1), 15% Buy, 60% Hold, 15% Sell, 5%
  Strong Sell. Horizonte declarado: 1 a 3 meses.
- **Premissa:** analistas revisam devagar; o preço reage com atraso
  (post-earnings-announcement drift). Só funciona com cobertura de analistas —
  **não se aplica a ETFs** diretamente (para ETFs a Zacks usa um "ETF Rank"
  agregando os ranks das posições + custo + momentum).

### Seeking Alpha — Quant Rating

- Cinco notas de fator **relativas ao setor** (A+ a F): Valor, Crescimento,
  Rentabilidade, Momentum e Revisões de EPS. Cada fator usa várias métricas
  (P/L, EV/EBITDA, crescimento de receita, margens, retornos de 3/6/9/12 meses,
  revisões).
- Nota final 1,0–5,0 → Strong Buy (≥ 4,5) … Strong Sell. Notas ruins em
  valuation ou momentum podem _vetar_ a nota máxima **(inferido pelo
  comportamento: raramente há Strong Buy com Momentum D/F)**.
- **Premissa:** comparar dentro do setor elimina viés setorial; combinar fatores
  pouco correlacionados (valor + momentum) dá estabilidade.

### IBD (Investor's Business Daily) — CAN SLIM / Composite Rating

- Notas percentílicas 1–99: **EPS Rating**, **Relative Strength (RS) Rating**
  (desempenho de 12 meses com peso dobrado no último trimestre vs. todo o
  mercado), **Group RS**, **SMR** (vendas, margem, ROE) e **Acc/Dis** (volume em
  dias de alta vs. baixa).
- **Regras de entrada:** comprar no rompimento de uma base (copo-com-alça,
  base plana, fundo duplo) com volume ≥ 40–50% acima da média, até 5% acima do
  ponto de compra; só quando o "Market Pulse" indica **tendência de alta
  confirmada** (follow-through day).
- **Regras de saída (as mais citadas):** stop fixo de **7–8% abaixo da compra**;
  realizar a 20–25% de ganho, exceto se o papel subir 20% em ≤ 3 semanas (aí
  segurar 8 semanas); vender em "distribution days" acumulados no índice.
- **Premissa:** força relativa persiste (momentum) e o mercado geral decide 3 de
  cada 4 movimentos — _filtro de regime antes do sinal individual_.

### TipRanks — Smart Score (1 a 10)

- Oito fatores: consenso de analistas (ponderado pelo histórico de acerto de
  cada analista), blogueiros, insiders, hedge funds, sentimento de notícias,
  investidores individuais, fundamentos e técnico (momentum 12m).
- **Ideia útil:** ponderar cada "voz" pelo seu histórico de acerto, e não
  igualmente.

### Danelfin — AI Score (1 a 10)

- Modelo de ML (árvores de decisão) sobre ~900 features diárias (técnicas,
  fundamentalistas, sentimento). O score é a **probabilidade de superar o
  S&P 500 nos próximos 3 meses**, calibrada; cada score mostra a taxa de acerto
  histórica e a contribuição dos principais fatores (explicabilidade tipo SHAP).
- **Premissa:** alvo é _excesso de retorno sobre o benchmark_, não retorno
  absoluto — o mesmo critério do learner v2 do Pêndulo.

### Stockopedia — StockRanks

- Três percentis 0–100: **Quality**, **Value**, **Momentum**; nota final
  combinada. Classificação em estilos ("High Flyer", "Super Stock", "Value
  Trap", "Momentum Trap", "Falling Star").
- **Ideia útil:** rótulos de _armadilha_ (valor sem momentum = Value Trap) —
  explicam ao usuário _por que não_ entrar.

### Morningstar — estrelas (fair value)

- Ações: estrelas = desconto do preço sobre o valor justo estimado por DCF,
  ajustado por incerteza (quanto maior a incerteza, maior a margem exigida
  para 5 estrelas). Fundos/ETFs: estrelas = retorno ajustado ao risco
  **passado** dentro da categoria (não é sinal de entrada).

---

## 3. Sinais algorítmicos de entrada/saída

### Trade Ideas — "Holly AI"

- Toda noite roda milhares de estratégias candidatas (combinações de filtros:
  gap, volume relativo, distância da média, padrão de vela, setor) em backtest
  de ~60 pregões. Só ficam ativas no dia seguinte as que atingem **≥ 60% de
  acerto e relação ganho/perda ≥ 2:1** **(limiares divulgados no marketing)**.
- Cada sinal sai com **entrada, stop e alvo** pré-definidos; posição fechada no
  fim do dia se não atingir nenhum.
- **Premissa e risco:** seleção diária de estratégias = alto risco de
  sobreajuste (data snooping); o filtro de acerto mínimo + R:R é a defesa.
  Muito parecido com o ciclo de aprendizado diário do Pêndulo.

### Finviz — Screener + padrões

- Não dá "nota"; detecta padrões gráficos automaticamente (canal, triângulo,
  cunha, topo/fundo duplo, suporte/resistência por linhas de tendência) e
  sinais (novo máximo, cruzamento de MA, gap, volume incomum, insiders).
- **Ideia útil:** sinal binário e explicável ("rompeu máxima de 52 semanas")
  em vez de score opaco.

### Plataformas brasileiras (Profit/Nelogica, TradeMap, Status Invest, Grafbase)

- Profit: estratégias de robô com regras paramétricas (cruzamento de médias,
  IFR, Bandas de Bollinger, setups clássicos como **9.1/9.2/9.3 de Larry
  Williams** — virada da média exponencial de 9 períodos; **123 de compra**;
  **Ponto Contínuo** — pullback à MM21 em tendência). Stop técnico na mínima do
  candle sinal; alvo de 2× o risco ou trailing pela própria MME9.
- Status Invest/TradeMap: foco fundamentalista (preço justo de Graham, Bazin
  por dividendos: preço-teto = dividendo médio / 6%).

### Indicadores populares de "buy/sell" no TradingView (scripts da comunidade)

- **Supertrend:** ATR(10) × 3 em torno do preço mediano; muda de vermelho para
  verde = compra. Serve como entrada _e_ trailing stop.
- **Chandelier Exit:** stop = máxima de 22 períodos − 3 × ATR(22).
- **UT Bot / Squeeze Momentum (LazyBear):** Bollinger dentro de Keltner =
  compressão; sinal no "disparo" da compressão com momentum a favor.

---

## 4. Padrões comuns encontrados (premissas e regras)

| Tema                    | Regra recorrente                                                               | Quem usa                           |
| ----------------------- | ------------------------------------------------------------------------------ | ---------------------------------- |
| Filtro de regime        | Só comprar com o índice em tendência de alta (preço > MM200 ou follow-through) | IBD, maioria dos robôs             |
| Tendência               | Preço > MM50 > MM200; votos de MAs                                             | TradingView, Investing, Barchart   |
| Momentum relativo       | Retorno 6–12 meses vs. universo (peso maior no recente)                        | IBD RS, Seeking Alpha, Stockopedia |
| Revisões de lucro       | Direção e magnitude das revisões dos analistas                                 | Zacks, Seeking Alpha               |
| Valor + qualidade       | Desconto vs. setor/valor justo, só com qualidade e momentum não negativo       | Morningstar, Stockopedia, SA       |
| Volume como confirmação | Rompimento com volume ≥ 1,4–1,5× a média                                       | IBD, Finviz, Trade Ideas           |
| Saída por stop fixo     | −7/−8% da entrada, ou mínima do candle sinal                                   | IBD, setups BR                     |
| Saída por volatilidade  | Trailing 2–3 × ATR (Supertrend, Chandelier)                                    | TradingView, robôs                 |
| Alvo por R              | Alvo ≥ 2 × risco; acerto mínimo ~60%                                           | Trade Ideas, setups BR             |
| Alvo de excesso         | Probabilidade de superar o benchmark em N meses                                | Danelfin, learner v2               |
| Distribuição forçada    | Só os top 5–20% recebem "compra"                                               | Zacks, ratings percentílicos       |
| Explicabilidade         | Mostrar fatores que puxaram a nota; rótulos de armadilha                       | Danelfin, Stockopedia              |

## 5. O que quase ninguém mostra (e devemos desconfiar)

- **Backtest com custos e fora da amostra:** raramente publicado (Zacks e
  Danelfin publicam desempenho histórico, mas próprio e sem auditoria).
- **Correlação entre "votos":** somar 26 indicadores de preço não dá 26
  evidências independentes.
- **Sobrevivência e snooping:** seleção diária de estratégias (Holly) e rankings
  recalibrados escondem quantas regras foram testadas — exatamente o que o
  Benjamini-Hochberg do learner v2 corrige.
- **Saída:** a maioria dá sinal de entrada e trata saída de forma genérica.
  As que tratam bem (IBD, Supertrend/ATR) usam regras simples e fixas.

## 6. Ideias aplicáveis ao Pêndulo (para avaliar, não aplicadas)

1. **Filtro de regime obrigatório** antes de qualquer gatilho de entrada
   (índice > MM200 / tendência confirmada) — maior consenso entre as fontes.
2. **Saída por ATR** (trailing 3 × ATR) como regra única de "deixar de perder"
   quando alocado, comparada ao stop fixo de −8% no estudo retroativo.
3. **Direção do sinal** (melhorando/piorando vs. ontem), à la Barchart.
4. **Rótulos de armadilha** (valor barato sem momentum = "armadilha de valor")
   na aba Análise/Valor.
5. **Peso por histórico de acerto** de cada gatilho (TipRanks), alinhado ao que
   o learner já mede.
6. **Distribuição forçada:** marcar como "entrar" só os top N% do universo,
   reduzindo a quantidade de sinais (objetivo: _poucos_ gatilhos confiáveis).

Qualquer mudança nos limites do aprendizado precisa de autorização do usuário
(ver `CLAUDE.md`).
