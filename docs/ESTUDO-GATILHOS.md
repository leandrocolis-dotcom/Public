# Estudo de gatilhos em dinheiro absoluto (fase 7, 09/10/2026)

> Scripts citados aqui e removidos do repo em 21/11/2026 (estudo encerrado; conclusões abaixo valem): `combo-study.mjs`, `spy-guard-study.mjs`, `triggers-study.mjs`. Para rodar de novo: `git show a3845cf:scripts/<nome>.mjs > scripts/<nome>.mjs`.

> `node scripts/triggers-study.mjs` → `data/triggers-study.json`. 40 ETFs do Pêndulo, out/2016 a out/2026, preços
> ajustados do Yahoo, só com dados até o dia do sinal. Regras registradas antes do teste em
> `docs/ROADMAP-APRENDIZADO.md` (F23–F26). Material educacional; não é recomendação de investimento.

**Pergunta (docs/OBJETIVO.md):** o gatilho faz ganhar dinheiro ao entrar, ou deixar de perder quando já estou alocado?

## Resposta curta

1. **Nenhum gatilho de entrada ganhou de um dia qualquer.** Comprar "no dia certo" não rendeu mais do que comprar em
   qualquer dia.
2. **Os gatilhos de saída não acertam a direção** (depois deles o ativo sobe em média, como em qualquer dia), **mas
   cortam a queda máxima**: em 37 de 40 ETFs, ficar 20 pregões fora reduziu o pior tombo de −43% para −31%. O preço
   disso foi render menos: de 7,7% para 3% a 6% ao ano.
3. **Comprar o inverso depois de um sinal de saída perde dinheiro** (−0,4% a −1,7% em 20 pregões). A hipótese
   "saiu, então compro o contrário" **não se confirmou**.
4. **Pares do Pêndulo:** no conjunto, a regra de entrada não foi significativa. Os pares contra o VIX parecem bons,
   mas o ganho vem de o VIXY perder valor com o tempo, não do momento da entrada.

## Saída (F23): quem já está alocado

Base: em 20 pregões, um dia qualquer rende +0,75% e tem 22,7% de chance de cair mais de 5% no caminho.

| Gatilho                         | Retorno 20 pregões depois | Chance de queda > 5% | Fora 20 pregões: ganho ao ano (× segurar 7,7%) | Pior queda (× −43,1%) | Inverso em 20 pregões |
| ------------------------------- | ------------------------: | -------------------: | ---------------------------------------------: | --------------------: | --------------------: |
| S1 Placar técnico ≤ −20         |                    +0,98% |                26,9% |                                           4,2% |                −31,5% |        −1,2% (t −2,8) |
| S2 Abaixo da média de 200 dias  |                    +0,77% |                26,0% |                                       **6,4%** |                −36,5% |        −0,4% (t −0,8) |
| S3 Abaixo da média de 50 dias   |                    +0,59% |                25,0% |                                           4,6% |                −31,3% |        −0,9% (t −2,1) |
| S4 3 ATR abaixo da máxima de 60 |                    +0,79% |                23,4% |                                           4,1% |                −32,9% |        −0,9% (t −1,9) |
| S5 Rompeu a mínima de 20 dias   |                    +1,03% |                25,9% |                                           3,3% |            **−30,8%** |        −1,7% (t −4,2) |

- Pelo critério registrado (retorno seguinte **negativo** e chance de queda acima da base), **nenhum serve**. O risco
  de queda sobe pouco (23% → 25–27%), mas a chance de alta forte também sobe: é volatilidade, não direção.
- O que eles entregam é **seguro contra tombo**: perdem rendimento quase sempre (vencem segurar em 5 a 13 de 40 ETFs) e
  cortam a queda máxima quase sempre. O caixa foi medido sem juros; com T-bill o custo cai uns 0,5 p.p. ao ano.
- **Melhor equilíbrio: S2 (perdeu a MM200).** Custa 1,3 p.p. ao ano e corta a pior queda em 7 p.p. Serve para quem
  quer dormir tranquilo, não para ganhar mais.

## Entrada (F24): ganhar dinheiro

Retorno em 20 pregões com 0,1% de custo; "excesso" é contra a média do universo no mesmo mês.

| Gatilho                         | Retorno 20 pregões | Excesso (t)   | Na alta | Na baixa |
| ------------------------------- | -----------------: | ------------- | ------: | -------: |
| E1 Placar técnico ≥ +45         |             +0,52% | −0,13% (−0,4) |  +0,16% |   +2,74% |
| E2 Rompeu a máxima de 55 dias   |             +0,24% | −0,41% (−1,8) |  +0,14% |   +1,65% |
| E3 Acima da MM200 e RSI(2) < 10 |             +0,68% | +0,03% (0,1)  |  +0,65% |   +0,57% |
| E4 Momentum 12-1 top 20%        |             +0,98% | +0,31% (0,8)  |  +0,77% |   +2,00% |

- **Nenhum aprovado.** E4 (momentum de 12 meses) é o único com excesso positivo e o maior retorno em 60 pregões
  (+3,3%), mas sem significância em 10 anos e com mais risco de queda (32%). Fica **em observação**.
- Rompimento de 55 dias (E2), clássico do seguidor de tendência, **perdeu** de um dia qualquer nos ETFs.

## Inversos (F25)

Comprar o inverso −1x em um dia qualquer perde −0,7% em 20 pregões (o mercado sobe e o inverso decai). Depois de
um sinal de saída perde ainda mais (até −1,7%). Motivo: os sinais de saída disparam depois da queda, e o ativo tende a
devolver parte dela. **Recomendação: não usar inverso como gatilho de ganho.** Proteção = sair para caixa, não apostar
contra.

## Pares do Pêndulo (F26)

Regra: favorito = maior retorno de 3 meses; entrar quando o recuo relativo de 5 dias tem z ≤ −1 (como `timingV2`);
mede comprar o favorito e o spread favorito − outro em 20 pregões, com 20 pregões entre entradas.

- Total (37 pares): comprar o favorito na entrada +0,39% × +0,31% em qualquer dia; spread +0,79% (t 1,0) × +0,18%.
  **Direção certa, sem significância.**
- Melhores: Emergentes × VIX (+7,1%, t 2,7), Brasil × VIX (+5,7%, t 2,3), Dólar↑ × México (+2,0%, t 2,0). Com 37
  pares testados, nenhum passa na correção de testes múltiplos. Os pares contra VIX ganham porque o VIXY derrete.
- **Acompanhamento:** os pares seguem na tela como estão; o desempenho medido fica neste estudo para conferir ao vivo.

## O que fazer com isso (F27)

- **Nenhum gatilho foi aprovado pelo critério registrado**, então nenhum alerta novo foi criado.
- **Proposta para o usuário decidir:** usar S2 (perdeu a MM200) como **alerta de proteção** para a carteira, rotulado
  "reduz tombo, custa rendimento", e não como sinal de ganho. Não removi nada da tela sem ordem.
- Próximo passo com mais chance de gerar dinheiro: combinar E4 (momentum) com S2 (proteção) em uma regra única de
  carteira e medir em dinheiro, como no trend following multiclasse (`docs/ESTUDO-TENDENCIA.md`).

## Execução das propostas (09/10/2026)

### 1. Alerta de proteção S2

O sinal "Perdeu a média de 200 dias" já existia e já gera aviso e push. A descrição dele agora diz o que o teste mediu:
**proteção, não ganho** (corta a pior queda de −43% para −36%, custa 1,3 p.p. ao ano).

### 2. Regra única: momentum 12-1 para entrar + MM200 para sair

`node scripts/combo-study.mjs` → `data/combo-study.json`. Regras fixadas antes: no fim do mês, comprar em pesos iguais
os 20% dos ETFs do Pêndulo com maior momentum 12-1, só se acima da MM200; vender no dia em que perder a MM200; sobra em
T-bill; 0,05% por perna. Out/2016 a out/2026.

| Estratégia                     | Ganho ao ano | Volatilidade | Sharpe | Pior queda |  Covid |   2022 | Tarifas 2025 |
| ------------------------------ | -----------: | -----------: | -----: | ---------: | -----: | -----: | -----------: |
| Momentum 12-1 + proteção MM200 |         8,3% |        15,0% |   0,61 |   **−20%** | −14,2% |  −6,8% |        −7,9% |
| Só momentum 12-1 (top 20%)     |        11,3% |        18,4% |   0,67 |       −31% | −25,3% |  +2,6% |       −11,8% |
| Todos os ETFs em pesos iguais  |         9,2% |        11,6% |   0,81 |       −26% | −25,6% |  −8,9% |        −8,9% |
| S&P 500 comprar e segurar      |    **15,8%** |        18,0% |   0,90 |       −34% | −33,7% | −18,6% |       −18,8% |

**Leitura:**

- **Momentum funciona dentro do universo:** escolher os 20% mais fortes rendeu 2 p.p. ao ano a mais que comprar todos
  os ETFs (11,3% × 9,2%).
- **A proteção pela MM200 faz o que promete:** a pior queda caiu de −31% para −20%, e as crises doeram menos da metade
  do S&P. Custou 3 p.p. ao ano.
- **Nada ganhou do S&P 500 em dinheiro** (15,8% ao ano). Esses 10 anos foram excepcionais para a bolsa americana, e o
  universo do Pêndulo tem muito ativo que andou de lado (emergentes, commodities, títulos).
- **Conclusão para o objetivo:** para **ganhar dinheiro**, segurar o S&P bateu todas as regras testadas. Para **deixar
  de perder**, a regra combinada é a melhor encontrada (pior queda −20% × −34%). É uma escolha de perfil, não um
  gatilho de lucro. Nenhuma mudança na aba Decisões sem ordem do usuário.

### 3. S&P 500 como base, protegido pela MM200

`node scripts/spy-guard-study.mjs` → `data/spy-guard-study.json`. SPY de nov/1993 a out/2026 (pega a bolha .com, 2008,
Covid, 2022 e as tarifas de 2025). Fora do mercado, o caixa rende a T-bill de 13 semanas. 0,05% de custo por troca.
Regras fixadas antes: **diária** (sai no fechamento abaixo da MM200), **fim do mês** (mesma regra, conferida só no
último pregão do mês) e **faixa de 2%** (sai 2% abaixo, volta 2% acima).

| Estratégia                   | Ganho ao ano (33 anos) | Pior queda |   Sharpe | Ganho ao ano (10 anos) | Trocas | Bolha .com | 2008      |  Covid | Juros 2022 |
| ---------------------------- | ---------------------: | ---------: | -------: | ---------------------: | -----: | ---------: | --------- | -----: | ---------: |
| S&P 500 comprar e segurar    |              **10,9%** |       −55% |     0,65 |              **15,5%** |      0 |     −47,5% | −55,2%    | −33,7% |     −24,5% |
| S&P + MM200 (diária)         |                   8,9% |       −24% |     0,76 |                  12,2% |    214 |     −19,2% | −13,2%    | −17,6% |     −12,7% |
| **S&P + MM200 (fim do mês)** |              **10,7%** |   **−24%** | **0,86** |                   9,5% |     42 |  **−6,2%** | **−4,8%** | −12,5% |     −15,9% |
| S&P + MM200 com faixa de 2%  |                  10,0% |       −23% |     0,84 |                  10,9% |     48 |      −7,6% | −10,4%    | −22,4% |     −14,6% |

**Leitura:**

- **É o melhor gatilho de "deixar de perder" encontrado até aqui.** Em 33 anos, a regra de fim do mês rendeu quase o
  mesmo que segurar (10,7% × 10,9% ao ano) com **menos da metade da pior queda** (−24% × −55%). Na bolha .com e em 2008,
  perdeu 5% a 6% enquanto o S&P caiu metade.
- **Mas custou caro nos últimos 10 anos** (9,5% × 15,5% ao ano). Quedas rápidas com volta em V (2018, Covid, 2025)
  fazem a regra vender perto do fundo e recomprar mais caro. Ela só paga quando a baixa é longa.
- Fica fora do mercado cerca de 22% do tempo, com uma troca a cada 9 meses na versão mensal.
- **Ressalva de imposto:** cada venda realiza ganho. Para residente no Brasil, o custo fiscal pode anular parte da
  vantagem; não foi medido.
- **Recomendação:** é um seguro contra baixas longas, não um gatilho de lucro. Proposta ao usuário: um aviso
  "S&P fechou o mês abaixo da MM200" na aba Carteira. Não criado sem ordem.
