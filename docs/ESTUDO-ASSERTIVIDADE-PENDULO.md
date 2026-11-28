# Estudo: assertividade do pêndulo (nota de 1 dia × SPY de fato)

> `node scripts/pend-accuracy-study.mjs` → `data/pend-accuracy.json` + diário `data/pend-accuracy-journal.json` (cron diário, `train-model.yml`). Gerado em 2026-11-28 04:19 UTC.
> Amostra: 29/09, 16:00 a 27/11, 16:55 (horário de NY), 12528 pontos de 5 min, 43 pregões de referência.
> Nota refeita com a mesma regra da Início (`regimeAt`); mercado de fato = SPY (ES=F fora do pregão) desde o fechamento de referência, em desvios de um dia (z).
> Modo sombra: nada aqui muda pesos, avisos ou a nota. Material educacional; não é recomendação de investimento.

## Resumo

| Pergunta | Métrica | Valor | Leitura boa |
| --- | --- | ---: | --- |
| Mostra o lado certo? | Coerência (nota fora do neutro × lado do SPY) | 100% | ≥ 80% |
| Acompanha o tamanho? | Spearman nota × z | 0.86 | ≥ 0,7 |
| Tem atraso? | Pico da correlação Δnota × ΔSPY | 0 min (r 0.61) | 0 min |
| Atraso espalhado? | Parte da resposta depois do mesmo passo | 14% | < 30% |
| Reage a choques? | Choques de 0.5σ em 30 min com reação de 10 pts | 68.5% de 89 | ≥ 80% |
| Quanto atrasa no choque? | Mediana (reação da nota − metade do choque no SPY) | 0 min | ≤ 5 min |
| Troca de faixa confirma? | SPY segue o sentido em 30 / 60 min | 45.3% / 58.1% de 75 | > 55% |
| Vai e volta? | Faixa desfeita em até 30 min | 6.7% | < 25% |
| Chega tarde à virada? | Mediana de minutos desde o extremo do SPY | 90 min | ≤ 15 min |
| Ainda vale entrar? | Mediana do movimento que sobrava ao trocar de faixa | 25% | ≥ 40% |
| Intensidade em ordem? | Escada por faixa (Spearman) / por z | 1 / 1 | 1 / 1 |
| Calibração | Pontos de nota por desvio do SPY · R² | 21.58 · 0.66 | R² ≥ 0,5 |
| Prevê os próximos 30 min? | Acerto do lado (base: SPY sobe 46.4%) | 53.3% | > 52% |
| Prevê os próximos 60 min? | Acerto do lado (base: SPY sobe 46.8%) | 56.6% | > 52% |

Os limiares de "leitura boa" são referência de trabalho, fixados antes de olhar o resultado (26/11/2026); não são teste de significância.

## Por sessão

| Sessão | Pontos | Coerência | ρ | Atraso (pico) | Atraso no choque | Reagiu | Trocas | Confirma 30 min | Vai e volta | Tarde à virada | À frente 30 min |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| Pré (4h–9h30) | 2772 | 100% | 0.9 | 0 min | 2.5 min | 85.7% | 11 | 44.4% | 0% | 55 min | 53.1% |
| Pregão | 3240 | 100% | 0.93 | 0 min | 0 min | 65% | 35 | 45.7% | 14.3% | 40 min | 53.7% |
| Pós (16h–20h) | 2064 | 100% | 0.61 | 0 min | 2.5 min | 50% | 2 | 0% | 0% | 105 min | 39.2% |
| Noite (futuros) | 4452 | 100% | 0.77 | 0 min | 0 min | 100% | 23 | 57.1% | 0% | 70 min | 53.2% |

## Intensidade

| Faixa da nota | Pontos | z médio do SPY | Mediana de \|z\| |
| --- | ---: | ---: | ---: |
| Defesa forte | 171 | -3.12 | 2.79 |
| Defesa | 2077 | -0.92 | 0.81 |
| Neutro | 7795 | 0.08 | 0.2 |
| Risco | 2409 | 0.95 | 0.7 |
| Risco forte | 76 | 2.66 | 2.71 |

| SPY desde o fechamento (z) | Pontos | Nota média |
| --- | ---: | ---: |
| −∞ a -1.5 | 493 | -53.61 |
| -1.5 a -0.5 | 1684 | -26.51 |
| -0.5 a 0.5 | 7804 | 1.33 |
| 0.5 a 1.5 | 2125 | 24.63 |
| 1.5 a +∞ | 422 | 51.97 |

## Atraso: correlação Δnota (agora) × ΔSPY (k passos antes)

k > 0 = a nota anda depois do mercado; k < 0 = antes.

| k (min) | -30 | -25 | -20 | -15 | -10 | -5 | 0 | 5 | 10 | 15 | 20 | 25 | 30 |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| r | -0.02 | 0 | 0 | 0 | 0.02 | 0.03 | 0.61 | 0.06 | 0.02 | 0 | 0 | 0.01 | 0 |

## Por bloco (insumo para os pesos)

| Bloco | Pontos | ρ com o SPY | Atraso (pico) | r no pico | À frente 30 min | À frente 60 min |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| Classes | 12528 | 0.79 | 0 min | 0.37 | 51.8% | 53.9% |
| Bolsas | 12528 | 0.82 | 0 min | 0.61 | 53.8% | 55.2% |
| VIX e vol | 12528 | 0.44 | 0 min | 0.37 | 50.9% | 52.2% |

## Últimas trocas de faixa

| Quando (NY) | Sessão | De → para | SPY 30 min (z, no sentido) | Vai e volta | Minutos desde a virada | Sobrava |
| --- | --- | --- | ---: | --- | ---: | ---: |
| 18/11, 09:55 | Pregão | Defesa → Neutro | -0.28 | sim | 10 | 0% |
| 18/11, 10:05 | Pregão | Neutro → Defesa | 0.19 | não | 80 | 42% |
| 19/11, 03:15 | Noite (futuros) | Neutro → Risco | -0.09 | não | 120 | 10% |
| 19/11, 04:00 | Pré (4h–9h30) | Risco → Neutro | 0.19 | não | 0 | 100% |
| 19/11, 11:55 | Pregão | Neutro → Defesa | -0.21 | não | 115 | 25% |
| 20/11, 04:45 | Pré (4h–9h30) | Neutro → Defesa | -0.19 | não | 120 | 8% |
| 23/11, 03:15 | Noite (futuros) | Neutro → Risco | 0 | não | 0 | 100% |
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
