# Estudo: assertividade do pêndulo (nota de 1 dia × SPY de fato)

> `node scripts/pend-accuracy-study.mjs` → `data/pend-accuracy.json` + diário `data/pend-accuracy-journal.json` (cron diário, `train-model.yml`). Gerado em 2026-11-26 15:29 UTC.
> Amostra: 29/09, 16:00 a 25/11, 19:55 (horário de NY), 12048 pontos de 5 min, 42 pregões de referência.
> Nota refeita com a mesma regra da Início (`regimeAt`); mercado de fato = SPY (ES=F fora do pregão) desde o fechamento de referência, em desvios de um dia (z).
> Modo sombra: nada aqui muda pesos, avisos ou a nota. Material educacional; não é recomendação de investimento.

## Resumo

| Pergunta | Métrica | Valor | Leitura boa |
| --- | --- | ---: | --- |
| Mostra o lado certo? | Coerência (nota fora do neutro × lado do SPY) | 100% | ≥ 80% |
| Acompanha o tamanho? | Spearman nota × z | 0.86 | ≥ 0,7 |
| Tem atraso? | Pico da correlação Δnota × ΔSPY | 0 min (r 0.63) | 0 min |
| Atraso espalhado? | Parte da resposta depois do mesmo passo | 16% | < 30% |
| Reage a choques? | Choques de 0.5σ em 30 min com reação de 10 pts | 69.3% de 88 | ≥ 80% |
| Quanto atrasa no choque? | Mediana (reação da nota − metade do choque no SPY) | 0 min | ≤ 5 min |
| Troca de faixa confirma? | SPY segue o sentido em 30 / 60 min | 48.1% / 55.1% de 80 | > 55% |
| Vai e volta? | Faixa desfeita em até 30 min | 7.5% | < 25% |
| Chega tarde à virada? | Mediana de minutos desde o extremo do SPY | 90 min | ≤ 15 min |
| Ainda vale entrar? | Mediana do movimento que sobrava ao trocar de faixa | 23% | ≥ 40% |
| Intensidade em ordem? | Escada por faixa (Spearman) / por z | 1 / 1 | 1 / 1 |
| Calibração | Pontos de nota por desvio do SPY · R² | 20.41 · 0.62 | R² ≥ 0,5 |
| Prevê os próximos 30 min? | Acerto do lado (base: SPY sobe 48.2%) | 53.5% | > 52% |
| Prevê os próximos 60 min? | Acerto do lado (base: SPY sobe 48.3%) | 56.2% | > 52% |

Os limiares de "leitura boa" são referência de trabalho, fixados antes de olhar o resultado (26/11/2026); não são teste de significância.

## Por sessão

| Sessão | Pontos | Coerência | ρ | Atraso (pico) | Atraso no choque | Reagiu | Trocas | Confirma 30 min | Vai e volta | Tarde à virada | À frente 30 min |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| Pré (4h–9h30) | 2706 | 100% | 0.9 | 0 min | 2.5 min | 85.7% | 11 | 44.4% | 0% | 55 min | 54.5% |
| Pregão | 3198 | 100% | 0.93 | 0 min | 0 min | 71.2% | 40 | 46.2% | 15% | 47.5 min | 53.3% |
| Pós (16h–20h) | 2016 | 98.8% | 0.57 | 0 min | 2.5 min | 50% | 4 | 66.7% | 0% | 102.5 min | 40.4% |
| Noite (futuros) | 4128 | 100% | 0.79 | 0 min | 0 min | 57.1% | 22 | 65% | 0% | 90 min | 54% |

## Intensidade

| Faixa da nota | Pontos | z médio do SPY | Mediana de \|z\| |
| --- | ---: | ---: | ---: |
| Defesa forte | 247 | -2.94 | 2.43 |
| Defesa | 2074 | -0.85 | 0.75 |
| Neutro | 7386 | 0.08 | 0.2 |
| Risco | 2265 | 1.03 | 0.73 |
| Risco forte | 76 | 2.66 | 2.71 |

| SPY desde o fechamento (z) | Pontos | Nota média |
| --- | ---: | ---: |
| −∞ a -1.5 | 493 | -58.87 |
| -1.5 a -0.5 | 1716 | -27.68 |
| -0.5 a 0.5 | 7453 | 0.51 |
| 0.5 a 1.5 | 1917 | 25.47 |
| 1.5 a +∞ | 469 | 43.78 |

## Atraso: correlação Δnota (agora) × ΔSPY (k passos antes)

k > 0 = a nota anda depois do mercado; k < 0 = antes.

| k (min) | -30 | -25 | -20 | -15 | -10 | -5 | 0 | 5 | 10 | 15 | 20 | 25 | 30 |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| r | -0.02 | -0.01 | 0 | 0 | 0.01 | 0.03 | 0.63 | 0.07 | 0.02 | 0 | 0 | -0.01 | 0 |

## Por bloco (insumo para os pesos)

| Bloco | Pontos | ρ com o SPY | Atraso (pico) | r no pico | À frente 30 min | À frente 60 min |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| Classes | 12048 | 0.79 | 0 min | 0.37 | 52.3% | 54% |
| Bolsas | 12048 | 0.82 | 0 min | 0.63 | 53.8% | 55% |
| VIX e vol | 12048 | 0.51 | 0 min | 0.47 | 51.3% | 52.6% |

## Últimas trocas de faixa

| Quando (NY) | Sessão | De → para | SPY 30 min (z, no sentido) | Vai e volta | Minutos desde a virada | Sobrava |
| --- | --- | --- | ---: | --- | ---: | ---: |
| 19/11, 11:35 | Pregão | Defesa → Neutro | -1.66 | sim | 60 | 0% |
| 19/11, 11:50 | Pregão | Neutro → Defesa | 0.35 | não | 110 | 40% |
| 19/11, 15:55 | Pregão | Defesa → Def. forte | — | não | 85 | 0% |
| 19/11, 17:10 | Pós (16h–20h) | Defesa → Neutro | 0.09 | não | 25 | 31% |
| 19/11, 18:05 | Pós (16h–20h) | Neutro → Defesa | 0.05 | não | 115 | 15% |
| 20/11, 12:00 | Pregão | Defesa → Def. forte | -0.07 | não | 120 | 7% |
| 23/11, 03:15 | Noite (futuros) | Neutro → Risco | 0.19 | não | 105 | 53% |
| 24/11, 05:35 | Pré (4h–9h30) | Neutro → Defesa | 0.16 | não | 115 | 35% |
| 24/11, 10:00 | Pregão | Defesa → Neutro | -0.56 | sim | 90 | 0% |
| 24/11, 10:15 | Pregão | Neutro → Defesa | 0.41 | não | 15 | 50% |
| 24/11, 12:40 | Pregão | Defesa → Neutro | -0.22 | não | 100 | 0% |
| 24/11, 14:55 | Pregão | Neutro → Defesa | 0.03 | não | 120 | 13% |
| 24/11, 21:15 | Noite (futuros) | Neutro → Defesa | 0.03 | não | 65 | 26% |
| 25/11, 09:30 | Pregão | Defesa → Def. forte | -0.65 | não | 70 | 38% |
| 25/11, 12:05 | Pregão | Def. forte → Defesa | 0.44 | não | 50 | 38% |

## Como ler e o que vem depois

- **Coerência e intensidade** dizem se o pêndulo mostra o que o mercado já fez. Como a nota é feita dos próprios preços, coerência alta é o mínimo esperado; o valor está em onde ela falha (sessão, faixa, bloco).
- **Atraso** aqui é o atraso do MODELO (ativos parados, bolsas de fora fechadas, substitutos). O atraso da entrega na tela soma ~15 s do robô de cotações + até 60 s de cache da borda e não aparece nesta conta.
- **Resolução**: passos de 5 min; atraso menor que 5 min aparece como 0. Pontos vizinhos se sobrepõem (as janelas de 30/60 min andam juntas), então o número efetivo de casos independentes é bem menor que o de pontos: acerto à frente de 53–55% ainda não é prova de vantagem.
- **Trocas de faixa**: "tarde à virada" e "sobrava" medem se a troca chega a tempo de servir para entrar/sair; confirmação acima de 55% com vai e volta abaixo de 25% é o que se espera de um gatilho útil.
- **Por bloco**: bloco com ρ baixo, atraso maior ou acerto à frente pior que os outros é candidato a peso menor. Próxima etapa (backtest): testar pesos alternativos neste mesmo diário, com regra registrada antes e correção para múltiplos testes, sem mudar a nota oficial sem ordem do usuário.
