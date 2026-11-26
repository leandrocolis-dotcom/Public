# Quant Aberto: engenharia reversa das notas quant do Seeking Alpha e do ProPicks (12/10/2026)

> Pedido do usuário: "entenda como o top picks IA da Investing e Seeking Alpha funciona a partir de dados disponíveis
> e tente decompor inversamente para criar um modelo aberto com as mesmas características". Só ações dos EUA
> (S&P 500). Material educacional; não é recomendação de investimento. Roadmap: `docs/ROADMAP-QUANT.md`.

## 1. O que se sabe dos dois produtos (só fontes públicas)

**Seeking Alpha, notas quant** ([FAQ](https://help.seekingalpha.com/premium/quant-ratings-and-factor-grades-faq),
[o que são](https://help.seekingalpha.com/migration/premium/what-are-quant-ratings-and-how-do-i-use-them)):

- Mais de 100 métricas, agrupadas em **5 fatores**: valor, crescimento, rentabilidade, momentum e revisões de lucro (EPS).
- Cada fator é comparado **dentro do setor** e vira uma nota de **A+ a F** (13 degraus).
- Nota final de **1,0 a 5,0** (venda forte … compra forte). **Não é a média** dos fatores: pesa mais o que tem mais poder
  de previsão. Tamanho e risco entram na nota final, mas não nos fatores.
- **Teto em "Manter"**: crescimento, momentum ou revisões em D+ ou pior, ou valor ou rentabilidade em D− ou pior.
- ~5.600 ações com cobertura de analistas; atualização diária antes da abertura.
- Não publicam as métricas de cada fator, os pesos, nem os cortes de cada letra.

**InvestingPro, ProPicks AI** ([Investing.com](https://investing.com/analysis/propicks-6-aicurated-stockpicking-strategies-proven-to-beat-the-market-200644170),
[Beat the S&P 500](https://investing.com/analysis/ai-to-the-rescue-beat-the-sp-500-with-a-24-cagr-200647010)):

- Modelo de IA (Google Vertex AI) treinado em 100+ métricas e 25 anos de dados, que classifica as ações em
  "abaixo / neutro / acima" do mercado. Filtros de setor, liquidez e valor de mercado.
- Estratégia "Beat the S&P 500": **20 ações do S&P 500, pesos iguais, troca mensal** (no começo do mês).
- "Fair Value" e "Financial Health" (saúde financeira, 1 a 5, 100+ métricas de crescimento, caixa, rentabilidade e
  valuation contra os pares) aparecem como ferramentas de apoio. Não está documentado quanto pesam na escolha.
- Os retornos divulgados (ex.: 1.000%+ desde 2013) são **backtest do próprio vendedor**, sem auditoria independente.

**Conclusão:** os dois são, na essência, um **modelo multifator relativo ao setor** (valor, qualidade, crescimento,
momentum e revisões), a família mais estudada da literatura (Fama-French, Jegadeesh-Titman, Chan-Jegadeesh-Lakonishok
para revisões). O "IA" do ProPicks é um classificador sobre os mesmos fatores. Dá para replicar a **estrutura** com dados
públicos; os pesos exatos não.

## 2. O modelo aberto (o que foi implementado)

Universo: as ~503 ações do S&P 500 (lista e setor GICS da Wikipédia). Dados: Yahoo, um resumo (fundamentos,
estimativas e revisões dos analistas) e um gráfico semanal de 2 anos por ação. Cron diário (`update-quant.yml`,
22:40 UTC). Código: `assets/quant.js` (puro e testado), `scripts/update-quant.mjs`, `assets/quant-view.js`.

| Fator         | Métricas (cada uma em percentil dentro do setor)                                                                              |
| ------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| Valor         | Lucro/preço (passado e futuro), EBITDA/EV, vendas/preço, patrimônio/preço, caixa livre/valor de mercado, PEG (menor é melhor) |
| Crescimento   | Receita e lucro (trimestre contra o do ano anterior), crescimento esperado do lucro e da receita neste ano e no próximo       |
| Rentabilidade | Margens bruta, operacional e líquida, ROE, ROA, margem de caixa livre                                                         |
| Momentum      | Retorno de 3 e 6 meses, 12 meses pulando o último, preço contra a média de 200 dias, distância da máxima de 52 semanas        |
| Revisões      | Variação da estimativa de lucro deste ano e do próximo em 30 e 90 dias; saldo de revisões para cima e para baixo em 30 dias   |

- **Fator** = média dos percentis das métricas disponíveis (pelo menos metade delas), de novo em percentil no setor.
  Setor com menos de 8 ações válidas é comparado com o universo. Rendimentos (lucro/preço) no lugar de múltiplos (P/L),
  para que lucro negativo vire número baixo em vez de sumir.
- **Letras:** A+ ≥ 95, A ≥ 88, A− ≥ 80, B+ ≥ 72, B ≥ 64, B− ≥ 56, C+ ≥ 48, C ≥ 40, C− ≥ 32, D+ ≥ 24, D ≥ 16, D− ≥ 8, F.
- **Nota final:** média ponderada dos fatores: **momentum 25%, revisões 25%, rentabilidade 20%, valor 15%,
  crescimento 15%**. Esses são os pesos a priori: a literatura e o próprio SA dizem que momentum e revisões são os
  fatores que mais preveem. A média vira percentil no universo e depois nota de 1 a 5. Sem momentum ou com menos de 3
  fatores, não há nota.
- **Classificação:** ≥ 4,5 compra forte · ≥ 3,5 compra · ≥ 2,5 manter · ≥ 1,5 venda · abaixo, venda forte. **Teto
  Manter (3,49)** com a mesma regra do SA.
- **Saúde (estilo InvestingPro), de 1 a 5:** média dos percentis de valor, crescimento, rentabilidade, momentum e fluxo de
  caixa. Faixas: ≥ 4 excelente · ≥ 3,25 ótima · ≥ 2,5 boa · ≥ 1,75 razoável · abaixo, fraca.
- **Carteira Top 20 (estilo ProPicks "Beat the S&P 500"):** nota ≥ 3,5, no máximo 4 por setor, uma classe de ação por
  empresa (GOOG/GOOGL). Quem já estava fica se seguir entre as 40 melhores, para girar menos. Troca na primeira coleta
  do mês.

Distribuição em 12/10/2026 (503 ações): compra forte 34, compra 61, manter 218, venda 125, venda forte 62.
Top 20 em 10 setores (4 de tecnologia, 4 de materiais, 3 de indústria...).

## 3. Decomposição inversa contra o Seeking Alpha (estudo Q1)

`scripts/quant-calib-study.mjs` → `data/quant-calib.json`. As hipóteses e os critérios estão no cabeçalho do script,
registrados antes de rodar.

**Dado:** a API pública do SA libera a foto de **6 meses atrás** (12/04/2026) com a nota quant e as 5 letras. A foto de
hoje é paga. **Limitação forte:** depois de ~30 chamadas o site passou a responder com bloqueio de robô (CAPTCHA). O
estudo **não contorna** isso: parou e ficou com **27 ações** (as primeiras em ordem alfabética, então a amostra é
enviesada). Os números abaixo são indicativos, não conclusivos.

| Teste                                      | Resultado                                                                                   | Critério                   | Decisão                                          |
| ------------------------------------------ | ------------------------------------------------------------------------------------------- | -------------------------- | ------------------------------------------------ |
| C1 Pesos do SA (regressão nota ~ 5 letras) | R² 0,60; pesos implícitos: crescimento 40%, revisões 21%, momentum 17%, valor 14%, rent. 7% | R² ≥ 0,6 para adotar       | **Não adotados** (0,596 e só 27 ações)           |
| C2 Teto "Manter"                           | 0 de 20 ações com fator fraco tinham nota ≥ 3,5                                             | < 5%                       | **Confirmado** (regra mantida)                   |
| C3 Momentum (exato na data)                | Spearman **0,81** entre o nosso fator e a letra do SA                                       | ≥ 0,6                      | **Réplica boa**                                  |
| C4 Outros fatores (fundamentos de hoje)    | rentabilidade 0,71 · crescimento 0,65 · valor 0,52 · revisões 0,24 · nota final 0,69        | só informativo             | Revisões discordam: a foto tem 6 meses de atraso |
| C5 O SA acertou nos 6 meses seguintes?     | IC 0,21; 3 "compra forte" renderam +62,6% contra SPY +15,1%; "manter" +4,9%                 | só informativo (1 período) | Sinal positivo, amostra pequena demais           |

**Leitura:**

1. A estrutura replicada bate com a do SA onde dá para medir sem atraso: momentum (0,81) e rentabilidade (0,71,
   fator que muda pouco em 6 meses). Revisões só podem concordar com dados da mesma data, por isso o 0,24 é esperado.
2. A regressão sugere que o SA pesa **crescimento** mais do que imaginávamos, mas com 27 ações e R² no limite o critério
   manda manter os pesos a priori. Para refazer com amostra maior: o usuário pode exportar a tela de notas quant do SA
   (conta Premium) para CSV, e o estudo roda sobre o arquivo, sem raspar o site.
3. A nota do SA teve IC positivo nos 6 meses seguintes, mas é um único período e uma amostra enviesada. **Isso não
   prova que funciona.**

## 4. Validação: o que falta para virar gatilho (regra 3 do `OBJETIVO.md`)

Não existe histórico grátis de fundamentos e estimativas na data certa (point-in-time), então **não há backtest honesto
da nota inteira**. Um backtest com os fundamentos de hoje teria olhar no futuro. O estudo F35
(`ESTUDO-MOMENTUM-UNIVERSO.md`) já mostrou que o momentum 12-1 **sozinho** não ordenou 220 ações em 10 anos. A
validação, portanto, é **fora da amostra, para a frente**:

- `data/quant-journal.json`: na primeira coleta de cada mês, guarda a carteira Top 20, a nota de cada ação e os preços.
  A 1ª foto foi em 12/10/2026, no meio do mês.
- `evalJournal()` mede cada mês: Top 20 (pesos iguais, menos 0,05% por perna sobre o giro) contra o SPY, IC de Spearman
  (nota × retorno do mês seguinte) e quintil 5 menos quintil 1.
- **Critério (registrado antes):** depois de **12 meses**, aprovado se (1) a Top 20 acumular mais que o SPY, (2) o IC
  médio for positivo com t ≥ 2 e (3) o spread Q5 − Q1 médio for positivo. Antes disso: "em observação".
- **Modo sombra:** nada entra na aba Decisões nem no aprendizado sem ordem do usuário.

Limitações conhecidas: preços sem dividendos no diário (diferença pequena em 1 mês); viés de sobrevivência zero no
diário (o universo é o do dia da foto); o Yahoo pode mudar ou faltar campos (falha > 20% mantém o arquivo anterior).

## 5. Onde ver

Aba **Análise** → card "Quant Aberto (S&P 500)": classificações, carteira Top 20 do mês, ranking com filtro por setor,
classificação e busca, diário e calibração. No detalhe de cada ação (clique), o bloco "Quant Aberto" mostra as letras e
os percentis.

## 6. O que a área logada do Seeking Alpha mostrou (conta gratuita, 12/10/2026)

Observado nas requisições que as páginas da AAPL fizeram no navegador do usuário (Valuation, Growth,
Profitability, Momentum e Earnings Revisions). Foi só leitura do tráfego normal da página, sem coleta em massa.

**Desbloqueado para conta gratuita:**

- A **lista de métricas de cada fator** (`ticker_metric_grades?filter[algos][]=main_quant`).
- Os **valores** de cada métrica (`metrics`).
- A **mediana do setor GICS** de cada métrica (`symbols/{t}/sector_metrics`).
- Uma amostra de 1 a 3 notas por fator.
- A foto de 6 meses atrás da nota quant e das letras (`rating/periods`, period 6).

**Bloqueado:** a nota quant atual e as notas das demais métricas ("Go Premium").

| Fator         | Métricas do SA (main_quant)                                                                                                                                                                                 |
| ------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Valor (19)    | P/L GAAP e non-GAAP (passado e FY1), PEG GAAP e non-GAAP FY1, EV/Vendas, EV/EBITDA e EV/EBIT (passado e FY1), P/Vendas, P/VP e Preço/Caixa (passado e FY1), dividend yield                                  |
| Crescimento   | Receita, EBITDA, EBIT, LPA diluído, LPA GAAP, caixa livre por ação, caixa operacional e ROE (no ano e projetado), LPA de longo prazo e GAAP 3 anos à frente, capital de giro, capex (dividendos à parte)    |
| Rentabilidade | Margens bruta, EBIT, EBITDA, líquida e de caixa livre; ROE, retorno sobre o capital total, ROA, capex/vendas, giro do ativo, **caixa operacional em valor absoluto**, caixa por ação, lucro por funcionário |
| Momentum (4)  | Retorno de **3, 6, 9 e 12 meses** (simples: AAPL 12m = +32,5%, contra +35,9% de 52 semanas no Yahoo), comparado com a mediana do setor                                                                      |
| Revisões      | Sem nota por métrica na página: usa o histórico do consenso de LPA e de receita (janela de 120 dias) e as contagens de revisões para cima, para baixo e no total                                            |

Amostras de nota na AAPL (código 1 = A+ … 13 = F; diferença para a mediana do setor de TI):

| Métrica                     | Diferença | Nota    |
| --------------------------- | --------: | ------- |
| P/L non-GAAP                |      +48% | 9 (C−)  |
| P/L non-GAAP FY1            |      +64% | 10 (D+) |
| Dividend yield              |      −71% | 12 (D−) |
| Receita no ano              |       +9% | 7 (C+)  |
| Receita projetada           |      −15% | 8 (C)   |
| Margem EBIT                 |         – | 1 (A+)  |
| Margem bruta                |         – | 8 (C)   |
| Momentum 3m (+6,5% × −2,8%) |         – | 5 (B)   |

**Leitura:**

1. As notas acompanham a posição contra o setor, mas não seguem uma escala fixa de diferença percentual. Diferenças
   de −15% e −24% deram a mesma nota C. Isso é compatível com **percentil no setor**, que é o que o Quant Aberto usa.
2. O SA premia **porte** na rentabilidade (caixa operacional em dólares, lucro por funcionário) e usa **múltiplos
   projetados** em quase tudo.
3. O momentum do SA é o **retorno simples** de 3, 6, 9 e 12 meses, sem média de 200 dias e sem pular o último mês.

**Mudanças no modelo (v2, mesma data):** o valor ganhou EV/Vendas, receita projetada/preço, EBIT/EV, caixa
operacional/preço e dividend yield (quem não paga fica com 0); saiu o FCF yield. A rentabilidade ganhou margem
EBITDA, caixa operacional absoluto e lucro por funcionário. O momentum passou a ser o retorno de 3, 6, 9 e 12 meses.
O diário marca a versão (`v`) em cada foto e só compara fotos da mesma versão. A foto v1 de 12/10 foi substituída pela
v2. Os pesos não mudaram. Faltam no Yahoo: crescimento de EBITDA, EBIT, caixa e ROE, LPA de longo prazo,
capex/vendas e giro do ativo.

**Não feito:** baixar notas ou medianas das ~500 ações pela conta do usuário. Seria coleta automatizada com a conta
dele, contra os termos do site e com risco de bloqueio. Só com ordem explícita.
