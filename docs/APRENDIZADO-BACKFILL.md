# Aprendizados do backfill de 60 pregões (09/10/2026)

> Scripts citados aqui e removidos do repo em 21/11/2026 (estudo encerrado; conclusões abaixo valem): `backfill-model.mjs`. Para rodar de novo: `git show a3845cf:scripts/<nome>.mjs > scripts/<nome>.mjs`.

> Gerado com `node scripts/backfill-model.mjs --syms=SNDQ,LABD,NVDL,KORU,AMDG,CIBR,TMV,UCYB,CRWL,FTNT`.
> Material educacional; não é recomendação de investimento. O modelo segue em **modo sombra**: nada disto muda a aba
> Decisões.

## O que foi feito

- Em vez de esperar 60 pregões de diário ao vivo, o modelo foi reconstruído nos **60 pregões de 14/07 a 06/10/2026**,
  em **50 ativos** (os 40 ETFs operáveis do Pêndulo e os 10 da carteira).
- Em cada pregão, o script refaz o que o treino diário gravaria (Decisão do trader, sinais de curto prazo e níveis),
  usando só os dados até aquela data. Ele fecha só os resultados já conhecidos no dia e roda o treino, com retreino a
  cada 5 pregões. Foram 13 versões do modelo, como teria sido ao vivo. Depois juntou os 2 pregões do diário real
  (07 e 08/10).
- **2.021 gatilhos** (1.949 reconstruídos, marcados `bf: 1`), **1.867 encerrados**.

## Ressalvas (importantes)

1. **Período só de alta:** o S&P esteve acima da média de 200 dias o tempo todo. Nenhuma lógica foi testada em regime
   de baixa. O estudo de 10 anos (`docs/ESTUDO-RETROATIVO.md`) cobre isso melhor.
2. **Sem fundamentos antigos:** nos dias reconstruídos, a Decisão do trader usa técnica, momento de mercado e
   situações parecidas.
3. **Regras criadas depois do período:** as regras do app foram escritas em 2026, então já "conheciam" esses meses.
   Isso é menos limpo que o diário ao vivo.
4. **60 pregões é pouco:** a maioria das lógicas tem de 9 a 57 dias. Os números oscilam muito entre janelas.

## Resultado por lógica (excesso em R sobre a média do universo, por dia)

| Lógica                                   | Status                                    |  Dias | Acerto | Excesso em R (faixa 90%)       |
| ---------------------------------------- | ----------------------------------------- | ----: | -----: | ------------------------------ |
| Sinal: queda além do ruído → vender      | **Aprovada** (passa nos testes múltiplos) |    35 |    48% | +0,29 (+0,11 a +0,48)          |
| Decisão: reduzir                         | Em avaliação                              |    49 |    44% | +0,37 (−0,06 a +0,79)          |
| Sinal: perdeu a média de 200 dias        | Em avaliação                              |    20 |    58% | +0,21 (+0,02 a +0,40)          |
| Sinal: esticado → vender                 | Em avaliação                              |     9 |    67% | +0,67 (+0,20 a +1,14)          |
| Decisão: vender / evitar                 | Em avaliação                              |    34 |    43% | +0,01 (−0,38 a +0,40)          |
| Nível: resistência → comprar             | Eliminada                                 |    50 |    47% | −0,09 (−0,22 a +0,03)          |
| Sinal: recuo de 10 dias → comprar        | Eliminada                                 |    40 |    43% | −0,07 (−0,23 a +0,09)          |
| Decisão: comprar                         | Eliminada                                 |    56 |    47% | −0,42 (−0,61 a −0,24)          |
| Decisão: comprar em partes / no recuo    | Eliminada                                 |    54 |    45% | −0,52 (−0,72 a −0,32)          |
| Esperar (suporte, resistência, aguardar) | Aprovadas                                 | 54–57 | 77–80% | – (critério de aproveitamento) |

## Aprendizados

1. **Vender ou reduzir os mais fracos funcionou; comprar não.** Todas as lógicas de venda ficaram com excesso positivo
   e todas as de compra, negativo. Nesse período, o que mais rendeu foi **sair do que estava perdendo força**, não
   escolher o que comprar. Bate com o estudo de 10 anos, onde "Reduzir" também foi a melhor decisão.
2. **"Comprar em partes / no recuo" voltou a ser a pior decisão (−0,52R).** Isso confirma a troca para "Aguardar" nas
   decisões ao vivo feita em 09/10/2026.
3. **"Comprar" também foi mal nesta janela (−0,42R),** mas no estudo de 10 anos ficou perto de zero (+0,03R).
   Recomendação: **não mudar** por causa de 60 dias; acompanhar no diário ao vivo.
4. **Primeira lógica de operar aprovada:** "Queda além do ruído → vender" (+0,29R, passa na correção de testes
   múltiplos). No estudo de 10 anos ela ficou perto de zero (−0,03R): pode ser efeito desta janela. Precisa se
   confirmar ao vivo.
5. **O filtro de vantagem separou na direção certa de novo** (bloqueadas −0,41R × liberadas −0,30R), mas as notas
   continuam não ordenando o resultado (A −0,42R, B −0,37R, C −0,07R, D −0,41R). Conclusão igual à do estudo longo:
   vale o bloqueio por expectativa negativa, não a nota A como "sinal forte".
6. **"Situações parecidas" foi anti-preditiva** nesta janela (correlação −0,25 com o excesso em 20 pregões) e
   "momento de mercado" também (−0,11). A técnica ficou levemente positiva (+0,02). Os retreinos moveram os pesos
   para técnica 43%, fundamentos 25% (sem medição: peso original), mercado 18% e situações parecidas 14%. Vale só para
   o modelo em treino; a aba Decisões segue com os pesos originais.
7. **Modelo final ainda não:** faltam uma segunda lógica de operar aprovada (a candidata mais perto é "Reduzir") e
   quatro retreinos seguidos sem mudança. Com o diário ao vivo, isso pode acontecer em algumas semanas.

## Recomendação

Como parte dos 60 pregões é reconstruída, mesmo que o modelo atinja os critérios do "final", **aplicar na aba
Decisões só depois de pelo menos 20 pregões ao vivo** confirmando as aprovadas, e com ordem do usuário.

## Correção de 09/10/2026 (risco mínimo para medir em R)

Ativos que quase não oscilam (T-bills, títulos flutuantes) tinham risco de stop de centésimos de %, e qualquer
diferença contra a média do universo virava dezenas de "R". Agora só se mede em R quem tem risco de pelo menos 1% do
preço (`RULES.minK`). Refeito o backfill:

- "Queda além do ruído → vender" **deixou de ser aprovada** (+0,18R em 33 dias, em avaliação). O resultado anterior
  (+0,29R) estava inflado.
- "Reduzir" segue a mais forte (+0,33R em 35 dias, em avaliação).
- O filtro de vantagem continua separando na direção certa (bloqueadas −0,41R × liberadas −0,26R).
- Nenhuma lógica que manda operar está aprovada ainda; o modelo final espera o diário ao vivo.
