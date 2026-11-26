# Teoria de trading para o motor de indicações (day trade e swing)

> Material educacional; não é recomendação de investimento. Complementa `ANALISE-TECNICA.md` (fórmulas já
> implementadas) e serve ao `OBJETIVO.md`: poucos gatilhos confiáveis de **entrada** e de **proteção**.
> Cada regra abaixo é uma **hipótese a testar** (10 anos, por tipo de ativo, custos incluídos, fora da amostra), nunca
> uma verdade. Regra que não passar no teste não vai para a tela de decisão.

## 1. O que a pesquisa de cursos mostra

Cursos pagos e gratuitos (Udemy, Teachable, Alison, blogs de corretoras) repetem o mesmo núcleo: tendência,
suporte/resistência como **zonas**, candles **no contexto**, volume, RSI/MACD, e plano com stop, alvo e tamanho de
posição definidos **antes** de entrar. Não há segredo escondido; a diferença entre material sério e marketing é
método, diário de operações e backtest. Conteúdo que promete meta diária fixa piora a gestão de risco.

## 2. Evidência acadêmica (o que esperar de cada técnica)

| Técnica                             | O que os estudos indicam                                                                                           |
| ----------------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| Médias móveis e rompimento de canal | Brock, Lakonishok e LeBaron (1992) acharam ganho no Dow (1897–1986); em ações individuais recentes, raramente paga |
| Idem, mercados menos eficientes     | Resultados melhores em índices asiáticos, JSE e ativos menos líquidos; significância estatística nem sempre firme  |
| Idem, após custos e fora da amostra | A maioria perde a vantagem; viés de mineração de dados (data snooping) e instabilidade entre subperíodos           |
| Rompimento em câmbio                | Só agrega em mercados com tendência forte                                                                          |
| Sinal de compra vs. sinal de venda  | Sinais de compra costumam render mais que os de venda: favorece usar a técnica para **entrar e sair**, não vender  |

Conclusão prática: tendência de prazo médio com saída disciplinada é o grupo com mais respaldo; padrões de candle
isolados e osciladores sozinhos têm o menor.

## 3. Núcleo de regras candidatas

### 3.1 Filtro de regime (sempre primeiro)

- Tendência de alta: preço > MM200 e MM50 > MM200; baixa: o inverso; senão, lateral.
- Volatilidade: ATR(14)/preço e largura das Bandas de Bollinger separam "comprimido" de "expandido".
- Em lateral, **reduzir ou não operar** rompimentos; usar reversão só nas bordas da zona.

### 3.2 Gatilhos de entrada (comprar)

1. **Pullback na tendência**: alta confirmada, preço recua até MM20/MM50 ou zona de suporte, e o candle de reversão fecha
   acima da máxima anterior. Stop abaixo do fundo do recuo (ou 1,5×ATR).
2. **Rompimento com volume**: fechamento acima da máxima de N dias (20/55, estilo Donchian) com volume ≥ 1,5× a média de 20. Entrar no fechamento ou no reteste; rompimento sem volume tem mais chance de falhar.
3. **Reversão em suporte**: 3+ toques na zona, RSI(14) saindo de < 30 e candle de rejeição (martelo/engolfo) **na zona**.
   Só vale em lateral ou dentro de tendência de alta maior.
4. **Abertura (day trade)**: máxima/mínima dos primeiros 15–30 min como faixa; entrada no rompimento com volume, stop do
   outro lado da faixa; evitar a primeira barra de cada leilão e dias de notícia forte.

### 3.3 Gatilhos de saída/proteção (já alocado)

1. **Stop de invalidação**: abaixo do fundo estrutural ou entrada − k×ATR (k entre 1,5 e 3). Definido antes, nunca afastado.
2. **Stop móvel**: Chandelier (máxima − 3×ATR) ou fechamento abaixo da MM20/MM50, conforme o prazo.
3. **Quebra de tendência**: fechamento abaixo da MM200 com MM50 inclinada para baixo reduz posição.
4. **Realização parcial**: alvo 1 em 1R (realizar metade e subir stop ao zero a zero), resto segue o stop móvel.
5. **Saída por tempo**: se em N barras o preço não andou, sair (capital parado tem custo).

### 3.4 Zonas de suporte e resistência

Detectar pivôs (fractais de 5 barras), agrupar por proximidade (± 0,5×ATR) em **zonas**; força = nº de toques + volume
nas rejeições + recência. Suporte rompido vira resistência (e vice-versa).

### 3.5 Padrões de candle: só como confirmação

Martelo, engolfo, estrela da manhã/noite, doji e pin bar contam **apenas** se ocorrerem numa zona e a favor do regime.
Padrão fora de contexto tem peso zero no placar.

### 3.6 Indicadores: papel de cada um

| Indicador    | Serve para                                       | Não serve para                       |
| ------------ | ------------------------------------------------ | ------------------------------------ |
| MM 20/50/200 | Direção e filtro de regime                       | Antecipar reversão                   |
| RSI(14)      | Exaustão em lateral; divergência com zona        | Vender "sobrecomprado" em tendência  |
| MACD         | Momento e mudança de direção                     | Gatilho isolado (atrasado)           |
| ATR          | Stop, tamanho de posição, filtro de volatilidade | Direção                              |
| Volume/OBV   | Confirmar rompimento e rejeição                  | Direção sozinho                      |
| Bollinger    | Compressão → expansão; bordas em lateral         | Sinal de reversão em tendência forte |

## 4. Gestão de risco (vale mais que o gatilho)

- Risco por operação: 0,5–1% do capital. `tamanho = capital × risco% ÷ (entrada − stop)`.
- Razão retorno/risco mínima de 2:1 para estratégias com acerto < 50%; esperança em R = `acerto×ganho médio − (1−acerto)×perda média`.
- Limite diário/semanal de perda (ex.: 2–3R/dia): atingiu, para.
- Correlação: não somar posições do mesmo fator como se fossem independentes.
- Custos e deslizamento entram em todo teste; alavancados e inversos têm decaimento: horizonte curto.
- Sem meta diária fixa; diário de operações com motivo, R obtido e erro de execução.

## 5. Como o app deve usar isso

1. **Pontuação por confluência** (regime + zona + gatilho + volume), cada item com peso aprendido, não fixo.
2. **Saída sempre acompanha a entrada**: toda indicação nasce com stop, alvo e tamanho sugerido.
3. **Rótulo de confiança** vindo do aprendizado (modo sombra, `assets/learner.js`): só mostrar "confiável" com evidência
   fora da amostra (Benjamini-Hochberg, já usado).
4. **Backtest por gatilho** (ETF, ação, alavancado, inverso; por regime), com custo, comparado a caixa e a comprar-e-segurar.
5. **Não mexer nos limites do aprendizado nem aplicar na aba Decisões sem ordem do usuário** (regra do projeto).

## 6. Plano de testes (ordem sugerida)

| Fase | Teste                                                             | Critério de aceite                                               |
| ---- | ----------------------------------------------------------------- | ---------------------------------------------------------------- |
| T1   | Filtro de regime MM200 como proteção (sair/reduzir quando quebra) | Menor queda máxima, retorno igual ou pouco menor que segurar     |
| T2   | Rompimento Donchian 55 com volume + stop ATR                      | Expectativa em R > 0 líquida de custos, em ≥ 70% dos subperíodos |
| T3   | Pullback em tendência (MM20/50 + candle de reversão)              | Idem, e melhor que entrar em dia aleatório                       |
| T4   | Reversão em zona de suporte (lateral)                             | Idem, só no regime lateral                                       |
| T5   | Abertura (day trade, 15 min) — exige dados intradiários           | Idem, com custo e deslizamento realistas                         |
| T6   | Combinações (confluência) e dimensionamento de posição            | Ganho sobre cada gatilho isolado, sem sobreajuste                |

Cuidados: congelar parâmetros antes de rodar, separar treino/validação/ao vivo, corrigir por múltiplos testes e
registrar o que foi rejeitado.

## 7. Fontes consultadas

- Brock, Lakonishok e LeBaron (1992), regras simples de médias móveis e rompimento (via resumo acadêmico).
- Estudos posteriores: FT30/Londres, câmbio (14 pares), índices asiáticos 1990–2012, JSE, ações dos EUA 1990–2004, Paquistão.
- [Alpha Architect: regras de média móvel](https://alphaarchitect.com/old-school-academics-on-moving-average-rules-remarkable/)
- [Serasa: price action](https://www.serasa.com.br/blog/price-action/)
- [FundedFast: curso de day trade](https://fundedfast.com/learn/trading-101/curso-day-trade)
- [Alison: estratégias de day trading](https://alison.com/pt-BR/claro/estrategias-de-day-trading)
- [Udemy: Technical Analysis Fundamentals](https://www.udemy.com/course/technical-analysis-fundamentals/)
- Heresy Financial, "Technical Analysis Mastery" (Teachable).

Limitação: as buscas retornaram sobretudo páginas de venda e resumos; números de cursos (stops, janelas) são práticas
comuns de mercado, não resultados verificados. Tudo depende do teste da seção 6.
