# Roadmap: Campeões dos setores (lista viva + modelo de entra/sai)

> Pedido do usuário (12/10/2026): acompanhar, semana a semana, os **melhores de cada setor** numa lista da aba
> Decisões, com os mesmos gatilhos de entrada das outras listas (Decisão do trader, níveis, sinais, cotação do dia), e
> construir um **modelo maior** que varre todas as bolsas dos EUA, inclui campeões novos e mostra quem está saindo.
> Escolhas do usuário: critério **qualidade + tendência**; universo **todas as bolsas dos EUA**; revisão **mensal**;
> calibrar a Decisão do trader **diferente para ações e ETFs**. Objetivo geral: `docs/OBJETIVO.md`. Material
> educacional; não é recomendação de investimento.

## Status

| Fase | O que entrega                                                                    | Status   |
| ---- | -------------------------------------------------------------------------------- | -------- |
| C1   | Modelo de campeões (`scripts/champions.mjs` → `data/champions.json`)             | entregue |
| C2   | Lista fixa 🏆 Campeões na aba Decisões + cartão "Entraram / Saíram"              | entregue |
| C3   | Cron mensal (`.github/workflows/champions.yml`) com histórico de entradas/saídas | entregue |
| C4   | Decisão do trader calibrada: ações ≠ ETFs (hipótese H10, estudo antes/depois)    | pendente |
| C5   | Placar fora da amostra: campeões × SPY × lista inteira, mês a mês                | pendente |
| C6   | Push quando a lista muda (entrou/saiu) e quando um campeão dá gatilho de entrada | pendente |

## Lista 🏆 na aba Decisões (12/10/2026, pedido do usuário)

A lista 🏆 mostra **a lista inteira do usuário** (todos os tickers de `assets/sectors.js`, ~580, com filtro Ações /
ETFs / Alavancados / Inversos) **mais os campeões do modelo** que não estão nela, marcados com 🏆. O filtro
"🏆 Do modelo" mostra só os escolhidos pelo modelo. Para caber ~590 ativos, a análise carrega em blocos de 15, três
em paralelo, redesenhando a cada bloco (~40 s na primeira vez; depois, cache de 10 min), e as cotações em blocos de 60. Sem dados no Yahoo: IGU, IGS, LITG, CLDL, STLL, EATZ (marcados ⚠️ na lista) e MMC.

## Regras do modelo (C1), registradas antes de rodar

**Universo:** todas as ações listadas nas bolsas dos EUA (NYSE, Nasdaq, NYSE American), pelo screener público da
Nasdaq. Só tickers comuns (sem preferenciais/warrants), valor de mercado ≥ US$ 2 bi, preço ≥ US$ 5.

**Liquidez (histórico do Yahoo, 1 ano):** pelo menos 260 pregões e volume financeiro médio de 50 pregões ≥ US$ 20 mi.

**Portão de tendência:** fechamento > MM200 **e** MM50 > MM200.

**Nota de tendência (T, 0–100):** média dos percentis **dentro do setor** de: retorno de 6 meses (126 pregões),
momentum 12-1 e proximidade da máxima de 52 semanas.

**Portão de qualidade:** margem operacional > 0 e, quando informado, fluxo de caixa livre > 0.

**Nota de qualidade (Q, 0–100):** média dos percentis dentro do setor de: ROE, margem operacional, margem bruta,
crescimento de receita, margem de caixa livre (FCL ÷ receita) e dívida/patrimônio (menor é melhor). Métrica ausente
é ignorada; precisa de pelo menos 3.

**Nota final:** 50% Q + 50% T. Setor = setor do screener da Nasdaq (12 setores); subsetor (indústria) só exibido.

**Seleção com folga (para não trocar por ruído):**

- Quem já está na lista **fica** enquanto passar nos dois portões e estiver entre os **8 primeiros** do setor.
- Vaga aberta é preenchida pelo melhor do setor que esteja entre os **3 primeiros**.
- Até **4 por setor** e **45 no total** (limite das listas da aba Decisões); acima disso, saem os novatos de nota
  menor.
- Motivo de saída gravado: perdeu a MM200, MM50 abaixo da MM200, qualidade, caiu no ranking do setor, sem
  dados/liquidez.

**Ajustes de dados antes da primeira lista (12/10/2026, não mudam as notas):** (1) setor e indústria passam a vir
do Yahoo (padrão GICS), porque o screener da Nasdaq classificava mal (navios-tanque em consumo, mineradora em
industrial, dutos em utilities); (2) empresas do Brasil ficam fora (o usuário não opera Brasil, nem ADRs); (3)
fundamentos são buscados para todos os líquidos, para o percentil de qualidade comparar o setor inteiro. Efeito
conhecido das regras: **Utilities fica vazio**, porque concessionárias quase sempre têm caixa livre negativo
(investimento pesado) e são barradas no portão de qualidade. Na largada só entram os top 3 de cada setor, então a
primeira lista tem até 33 nomes (saiu com 30: 3 em cada um de 10 setores).

**Frequência:** fim de cada mês (cron no 1º dia útil seguinte). Os gatilhos de entrada continuam diários, pela aba
Decisões. A primeira lista (12/10/2026) é uma foto do meio do mês para começar.

**O que a evidência diz (honestidade):** a parte de tendência sozinha não escolheu melhor ativo no estudo F35
(`docs/ESTUDO-MOMENTUM-UNIVERSO.md`); a parte de qualidade ainda não foi testada. A lista é **o que acompanhar**, não
sinal de compra. Ela será medida fora da amostra (C5) antes de qualquer alerta de "comprar campeão".

## C4: hipótese H10 (Decisão do trader, ações ≠ ETFs), a registrar antes de rodar

Base: `docs/ESTUDO-UNIVERSO-SETORES.md` (ações: comprar +0,04R, comprar em partes +0,08R, reduzir −0,07R, vender
−0,09R; ETFs: o contrário). Proposta: em ações, não rebaixar "comprar em partes" e exigir mais para "reduzir/vender"
sem posição; em ETFs, exigir mais para "comprar". Critério: refazer o estudo retroativo do universo antes e depois; se
o excesso em R das decisões de ação não melhorar em ações **e** em ETFs, reverter.

## C5: placar fora da amostra

Cada lista mensal fica gravada em `data/champions.json` (`history`). Medir, mês a mês: retorno médio dos campeões ×
SPY × média do universo filtrado, e o resultado dos gatilhos de entrada da Decisão nos campeões (diário do Simulador).
