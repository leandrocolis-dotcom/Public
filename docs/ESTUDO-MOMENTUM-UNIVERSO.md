# Estudo F35: momentum 12-1 no Universo de Setores (12/10/2026)

> Pergunta do usuário: "a escolha de qual ativo comprar, onde o momentum 12-1 se manteve" vale para **todos** os
> tickers da lista? E, com os preços de hoje, quais entrariam pela regra?
> Reproduzir: `CACHE_DIR=<pasta> node scripts/momentum-universe-study.mjs` → `data/momentum-universe-study.json`.
> Regras e critério estão no cabeçalho do script, registrados **antes** de rodar. Material educacional; não é
> recomendação de investimento.

## Amostra e método

- Lista `data/universo-setores.json`: **220 ações** (SINGLE) e **156 ETFs 1x** com dados no estudo (MMC sem Yahoo); 219 e 155 com cotação na foto de hoje. Alavancados e
  inversos ficam fora do ranking (decaimento; repetem o ativo de referência).
- 119 fins de mês, out/2016 a ago/2026 (o retorno de set/2026 ainda não fechou o mês seguinte). ~198 ações e ~142 ETFs
  por mês.
- Sinal: retorno de 12 meses pulando o último (`P(m−1)/P(m−12) − 1`), em percentil **dentro do grupo** (ações com
  ações, ETFs com ETFs). Alvo: retorno do mês seguinte em excesso sobre a média do grupo. Custo 0,05% por perna.

## Resultado: H8 reprovada nos dois grupos

| Teste (registrado)                      |             Ações |              ETFs |
| --------------------------------------- | ----------------: | ----------------: |
| T1 IC médio (t)                         |  **+0,003 (0,1)** |      +0,033 (1,3) |
| Acerto do IC (meses com IC > 0)         |               51% |               55% |
| T2 quintil 5 − quintil 1 ao mês (t)     |      +0,39% (0,6) |      +0,50% (1,2) |
| BH (FDR 10%) em T1 e T2                 |         reprovado |         reprovado |
| T3 top 20% × 1.000 carteiras sorteadas  | p < 0,001 (passa) | p < 0,001 (passa) |
| Spread na alta / na baixa (SPY × MM200) |   +0,07% / +1,96% |   +0,52% / +0,41% |
| **H8 aprovada?**                        |           **Não** |           **Não** |

Excesso por quintil de momentum (média ao mês):

| Quintil | 1 (mais fraco) |      2 |      3 |      4 | 5 (mais forte) |
| ------- | -------------: | -----: | -----: | -----: | -------------: |
| Ações   |         +0,42% | −0,60% | −0,13% | −0,50% |         +0,81% |
| ETFs    |         −0,03% | −0,14% | −0,34% | +0,04% |         +0,47% |

**Leitura:**

1. **Nas ações, o 12-1 não ordenou nada.** IC zero, curva em "U" (o quintil mais fraco também ganhou da média). Os
   últimos três anos (IA) foram o único trecho positivo (spread +1,4% ao mês, t 1,0); 2016–2022 ficou em zero ou
   negativo. Ranking dentro do setor: IC −0,002. Em 3 e 6 meses, também zero.
2. **Nos ETFs, a direção é a certa e o efeito é fraco**, igual aos estudos anteriores com os 40 ETFs do Pêndulo (IC ≈
   0,03). Cresce com o prazo (IC 0,05 em 3 meses, 0,08 em 6 meses), mas nenhum passa de t 1,4. Quase metade do efeito é
   rotação de setor (neutro de setor: IC 0,015).
3. **Por que o top 20% "bateu o sorteio" sem ordenar?** Beta. A carteira top 20% tem beta de **1,24** contra a média do
   grupo nos dois casos. Descontado o beta, o alfa é +0,3% ao mês com t 0,8 (ações) e 1,0 (ETFs): **não significativo**.
   O momentum comprou os papéis mais voláteis num mercado de alta. O sorteio não captura isso porque cada carteira
   sorteada tem o beta da média.
4. **Viés da lista:** pesos iguais nas 219 ações deram 26,9% ao ano contra 15,6% do SPY. A lista foi montada em 2026 com
   os vencedores, então qualquer regra dentro dela parece ótima em retorno absoluto. Por isso a medida certa é o excesso
   sobre a própria lista, e nele o 12-1 não se sustentou.

### Carteiras (mensal, pesos iguais)

| Carteira                     | Ações: ganho a.a. | Sharpe | Pior queda | ETFs: ganho a.a. | Sharpe | Pior queda |
| ---------------------------- | ----------------: | -----: | ---------: | ---------------: | -----: | ---------: |
| Top 20% do 12-1              |             36,7% |   1,34 |       −21% |            16,0% |   0,90 |       −20% |
| Top 20% e acima da MM200     |             34,9% |   1,31 |       −21% |            12,9% |   0,78 |       −22% |
| Idem + regime (SPY > MM200)  |             22,1% |   1,03 |       −21% |            10,3% |   0,71 |       −20% |
| Todos do grupo, pesos iguais |             26,9% |   1,46 |       −21% |            10,9% |   0,86 |       −20% |
| SPY comprar e segurar        |             15,6% |   1,02 |       −24% |            15,6% |   1,02 |       −24% |

- Nas ações, o top 20% rendeu mais que a lista inteira, mas com **Sharpe menor** (1,34 × 1,46): ganhou por correr mais
  risco. Filtro MM200 e regime **cortaram retorno sem cortar a queda**.
- Nos ETFs, o top 20% empatou com o SPY em retorno, com Sharpe pior. O filtro MM200 e o regime pioraram tudo.

## H9: o nível de preço importa? (esperar recuo × comprar esticado)

Dentro do top 20%, compara o tercil mais esticado (distância à MM200) com o menos esticado no mês seguinte:

- **Ações: os esticados renderam MAIS**, +1,76% ao mês (t +2,5). O contrário da hipótese. H9 reprovada.
- **ETFs: sem diferença** (−0,38%, t −0,7). H9 reprovada.

Ou seja, **esperar o recuo para entrar num líder não teve base** (bate com o F24: comprar recuo −0,19R). Nas ações,
"está esticado demais" foi um mau motivo para não comprar.

## O que fazer com isso

- **Nenhum alerta novo.** O 12-1 não é gatilho de "qual comprar" com evidência estatística nesta lista, nem em ações nem
  em ETFs. A premissa "o 12-1 se manteve" só vale como **direção fraca em ETFs** e nos três anos de IA em ações.
- O que o estudo mostra que funciona é **escolher risco** (beta), não escolher ativo. Se a ideia é ganhar mais que o
  índice, isso vem de aceitar mais volatilidade, e a mesma conta vale ao contrário numa baixa forte.
- Segue valendo a conclusão da Fase 8: **segurar o índice** foi o melhor retorno por queda entre os ETFs.

## Foto de hoje (12/10/2026, prévia; a regra avalia no fim do mês)

Regime: **LIGADO** (SPY 778,58 × MM200 720,14). Regra aplicada: top 20% do 12-1 no grupo **e** acima da própria
MM200. Entra quem passa; a coluna "preço hoje" é só descritiva, porque H9 mostrou que esperar recuo não ajudou.

### Ações que passam (39 de 219)

| Situação do preço hoje                           | Tickers                                                                                         |
| ------------------------------------------------ | ----------------------------------------------------------------------------------------------- |
| Perto da máxima de 52 semanas (≤ 5% abaixo)      | DELL, HPE, FTNT, CRWD, PANW, XOM, CVX, COP, SCCO                                                |
| Em tendência, meio do caminho (5% a 20% abaixo)  | LITE, MU, MRVL, AMD, FIX, NUE, ASML, MRK, FCX, STLD, GM, PWR, GEV, NEM, WPM, DE, TSM, ADM, FANG |
| Recuo forte, ainda acima da MM200 (> 20% abaixo) | SNDK, STX, INTC, TER, LRCX, AMAT, KLAC, CIEN, NBIS, ARM, CAT                                    |

- **Fora pela MM200** (top 20% mas abaixo da média): WDC, COHR, SLB, VRT, STRL.
- **Concentração:** 20 das 39 são semicondutores, memória, redes ou servidores de IA. Pela regra, é praticamente uma
  aposta só (beta de IA). Memória (SNDK, MU, STX) e WDC já caem 18% a 48% da máxima com RSI < 35.
- Mais fracos do 12-1 (para evitar pela mesma regra): SMR, OKLO, RGTI, MSTR, BSX, COIN, IONQ, QBTS, ORCL, ZS.

### ETFs que passam (27 de 155)

| Tema                | Tickers                                            |
| ------------------- | -------------------------------------------------- |
| Petróleo e energia  | USO, BNO, XOP, XLE, AMLP, MLPX                     |
| Commodities amplas  | PDBC, DBC                                          |
| Semicondutores / IA | PSI, SOXX, SOXQ, SMH, IGPT, ARTY, WTAI, QTUM, DTCR |
| Saúde / biotech     | XBI, IBB, XPH, IHE, PJP                            |
| Outros              | SLX, COPX, DXJ, EWZ, IYZ                           |

- **Fora pela MM200:** OIH, SIL, SILJ, SLV (prata caiu 48% da máxima).
- USO e BNO são futuros (rolagem corrói no longo prazo; ver `universo_setores_tickers.md`, parte F). EWZ é Brasil,
  fora do escopo do usuário.
- Mais fracos: ETHA, KWEB, IBIT, FBTC, BKCH, ARKF, NLR, UNG, WGMI, IHI.

## Limites

- Um caminho histórico, 10 anos, só 20 meses de regime de baixa: os recortes na baixa têm pouco poder.
- Lista com viés de sobrevivência (montada em 2026). O teste contra o sorteio e o excesso sobre a lista reduzem, mas não
  eliminam, esse viés.
- Sem custo de imposto nem spread de ativos pouco líquidos.

## No app (12/10/2026, a pedido do usuário)

Tudo é **só exibição**: nada muda na aba Decisões, nos alertas nem no aprendizado.

1. **Lição 18 em "Aprenda"** (aba Quando entrar): "Momentum 12-1: escolhe risco, não ativo", com os números do teste.
2. **Página do ativo** (lupa no cabeçalho): cartão "Momentum 12-1" com o percentil no grupo, o retorno 12-1, a posição
   contra a MM200 e se passa na regra, sempre com o aviso de que o estudo reprovou o sinal. Some para ativos fora da
   lista.
3. **Simulador → 🧠 Aprendizado:** painel com o veredito do estudo e, recolhida, a tabela "quem passa na regra hoje".

A foto de hoje é refeita todo pregão pelo cron `train-model.yml` (`node scripts/momentum-universe-study.mjs --today`,
~2 anos de Yahoo; o passo pode falhar sem derrubar o treino). O estudo de 10 anos não roda no cron: refazer à mão com
`CACHE_DIR=<pasta> node scripts/momentum-universe-study.mjs`. Código: `assets/momentum-study.js`.
