# Estudo retroativo do aprendizado (prévia)

> Gerado por `scripts/retro-study.mjs` em 21/11/2026. Reproduzir: `node scripts/retro-study.mjs --syms=...`.
> É **prévia**: as regras foram escolhidas olhando esses anos, então o resultado é otimista. Não aprova nada no modelo
> real, que só aprende com o diário fora da amostra. Material educacional; não é recomendação de investimento.

## Amostra

- Período avaliado: **04/12/2017 a 20/11/2026** (2248 pregões; histórico de 10y, com ~1 ano de aquecimento).
- **40 ativos**: os ETFs do Pêndulo e a carteira (–).
- **44.627 gatilhos encerrados** (Decisão do trader a cada 5 pregões, sinais de curto prazo e níveis), um por ativo e lógica a cada 5 pregões, como no diário real.
- Medida: resultado em R (stop de 2,5 ATR, 0,05% de custo por perna, entrada no fechamento do dia do gatilho), no horizonte da lógica (decisões 20 pregões; sinais e níveis 5), em **excesso sobre a média do universo** no mesmo dia. Regime: S&P acima/abaixo da média de 200 dias (399 dias em baixa).
- Decisão do trader sem fundamentos (não há fundamentos antigos) e sem o regime macro do dia.

## Lógicas que mandam operar

| Lógica              | Dias | Acerto (regra antiga) | Excesso em R (faixa 90%) |          Alta / baixa | Regra antiga | Regra nova   |
| ------------------- | ---: | --------------------: | -----------------------: | --------------------: | ------------ | ------------ |
| dec:reduce:sell     |  432 |                   38% |    +0,05 (−0,03 a +0,13) |  +0,05 / +0,04 (82 d) | Eliminada    | Em avaliação |
| level:res:sell      |  119 |                   43% |    +0,01 (−0,06 a +0,09) |  +0,02 / −0,00 (26 d) | Eliminada    | Em avaliação |
| sig:lost200:sell    |  799 |                   44% |    −0,00 (−0,04 a +0,04) | −0,00 / +0,00 (154 d) | Eliminada    | Eliminada    |
| sig:rally_down:sell |  732 |                   47% |    −0,02 (−0,06 a +0,02) | +0,01 / −0,12 (149 d) | Eliminada    | Eliminada    |
| dec:buy:buy         |  432 |                   49% |    −0,02 (−0,10 a +0,06) |  −0,05 / +0,13 (69 d) | Eliminada    | Eliminada    |
| level:stop:sell     |  951 |                   41% |    −0,02 (−0,05 a +0,01) | −0,03 / +0,00 (151 d) | Eliminada    | Eliminada    |
| sig:pullback10:buy  | 1073 |                   49% |    −0,02 (−0,06 a +0,01) | −0,02 / −0,04 (193 d) | Eliminada    | Eliminada    |
| sig:dip:buy         |  330 |                   52% |    −0,02 (−0,09 a +0,04) |  −0,01 / −0,11 (37 d) | Eliminada    | Eliminada    |
| sig:stretched:sell  |  373 |                   45% |    −0,03 (−0,11 a +0,04) |  −0,03 / −0,08 (49 d) | Eliminada    | Eliminada    |
| level:res:buy       | 1145 |                   50% |    −0,04 (−0,07 a −0,01) | −0,03 / −0,13 (125 d) | Eliminada    | Eliminada    |
| sig:breakdown:sell  | 1155 |                   45% |    −0,04 (−0,07 a −0,01) | −0,05 / −0,02 (234 d) | Eliminada    | Eliminada    |
| level:sup:buy       |  347 |                   49% |    −0,05 (−0,10 a +0,00) |  −0,06 / +0,01 (35 d) | Eliminada    | Eliminada    |
| sig:reversal:buy    |  381 |                   50% |    −0,06 (−0,12 a −0,01) |  −0,06 / −0,07 (80 d) | Eliminada    | Eliminada    |
| dec:sell:sell       |  283 |                   41% |    −0,07 (−0,16 a +0,03) |  −0,08 / −0,02 (75 d) | Eliminada    | Eliminada    |
| dec:buy-part:buy    |  450 |                   49% |    −0,15 (−0,22 a −0,08) |  −0,11 / −0,31 (82 d) | Eliminada    | Eliminada    |

## Lógicas de "esperar" (seguem pelo aproveitamento)

| Lógica         | Dias | Aproveitamento | Status   |
| -------------- | ---: | -------------: | -------- |
| level:sup:wait | 1774 |            74% | Aprovada |
| dec:wait:wait  |  449 |            73% | Aprovada |
| level:res:wait | 1583 |            75% | Aprovada |

## O filtro de vantagem funcionou?

| Grupo                  | Excesso em R por dia | Dias |
| ---------------------- | -------------------: | ---: |
| Bloqueadas pelo filtro |                −0,06 |  409 |
| Liberadas              |                −0,06 |  447 |
| Nota A                 |                +0,01 |  411 |
| Nota B                 |                −0,14 |  422 |
| Nota C                 |                +0,10 |  142 |
| Nota D                 |                −0,06 |  409 |

## Pesos da Decisão do trader (correlação com o excesso em 20 pregões)

- tech: -0,010 (17188 decisões)
- fund: – (0 decisões)
- market: -0,022 (17188 decisões)
- history: -0,013 (17188 decisões)

## Leitura

1. **Só uma lógica que manda operar teve vantagem estatística sobre o universo: "Reduzir" da Decisão do trader** (+0,10R por dia em 487 dias, aprovada na correção de testes múltiplos depois da correção do risco mínimo de 09/10/2026). Ela se repetiu em todos os universos testados: setores (+0,11R), backfill (+0,37R) e universo de 508 ativos (+0,06R). Todas as outras ficaram perto de zero ou negativas, o que confirma a literatura (Park e Irwin): regras técnicas isoladas em ETFs líquidos têm vantagem pequena ou nula depois de custos e da "maré do mercado".
2. **"Comprar em partes / no recuo" foi a pior decisão (−0,19R por dia, 508 dias), e ainda pior no regime de baixa (−0,28R).** Comprar o recuo de um ativo que não está forte perde para a média do universo. A pesquisa aponta o mesmo: comprar força (momentum) funciona melhor que comprar fraqueza. **Candidata a revisão na aba Decisões**, mas só com ordem do usuário (o modelo segue em modo sombra).
3. **As lógicas de "esperar" são as únicas aprovadas** (aproveitamento de 72% a 75%). Esperar perto de piso, teto e stop quase sempre "não custou". O critério delas é mais fácil de bater, então isso indica mais disciplina do que vantagem.
4. **A regra antiga eliminava tudo o que manda operar pelo acerto** (40% a 54%), inclusive lógicas com excesso positivo, como "Reduzir", com 40% de acerto e +0,09R. A regra nova as mantém em avaliação: o acerto sozinho engana.
5. **O filtro de vantagem ajuda pouco.** As decisões bloqueadas renderam menos que as liberadas (−0,10R × −0,03R), na direção certa. Já as notas não ordenam bem o resultado: A ficou em −0,02R, B em −0,10R e C em +0,21R. Expectativa passada positiva no próprio ativo (nota A/B) **não previu** resultado melhor. A nota C (pouca amostra, mais comum nos primeiros anos do teste) foi a melhor, o que sugere efeito do período, não do filtro. **Recomendação:** manter o bloqueio por expectativa negativa (D), que separa na direção certa, e não tratar A como "sinal forte". O diário real vai confirmar ou derrubar isso fora da amostra.
6. **Os pesos da Decisão do trader quase não importam.** A correlação de cada parte com o excesso é próxima de zero (técnica +0,004; mercado e situações parecidas ≈ 0 ou negativas). Ajustar os pesos não deve trazer ganho relevante; o que pode trazer é trocar o que entra na decisão (ex.: momentum de 12 meses, que tem evidência).
7. **Regime:** a maioria das lógicas piora no regime de baixa (ex.: "Comprar em partes", "Recuo de 10 dias", "Resistência → comprar"). O critério novo exige que nenhuma aprovada falhe nesse regime, e o estudo mostra que essa exigência importa.

### Experimento de 09/10/2026 (fase 2, autorizada pelo usuário)

Hipóteses definidas pela teoria antes do teste e critério registrado antes de rodar: "se piorar, reverter".

| Variante                                                             | Compras (buy + buy-part) | Vendas (reduce + sell) | "Comprar em partes" |               "Reduzir" |
| -------------------------------------------------------------------- | -----------------------: | ---------------------: | ------------------: | ----------------------: |
| Original                                                             |                   −0,07R |                 +0,05R |      −0,19R (508 d) |                  +0,09R |
| F9 + F10 (momentum com 20% de peso + recuo só com momentum positivo) |                   −0,14R |                 +0,07R |      −0,27R (478 d) | +0,15R (aprovada no BH) |
| Só F10 (diagnóstico)                                                 |                        – |                      – |      −0,23R (492 d) |                  +0,08R |

- **F10 não funcionou:** quase todos os "comprar em partes" já tinham momentum positivo, e o que sobra continua perdendo. O problema não é a falta de tendência, é a própria decisão.
- **F9 foi misto:** melhorou "Reduzir" (+0,15R), mas piorou as compras e o total. Pelo critério registrado, F9 e F10 foram **revertidos**. O momentum de 12 meses fica visível na Decisão do trader só como informação. Escolher só a parte boa (vendas) seria ajuste ao passado.
- **Aplicado:** "Comprar em partes / no recuo" vira **"Aguardar"** nas decisões ao vivo (abas Análise e Decisões, avisos de nível e push), por ter perdido nas três rodadas, na alta e na baixa. No Simulador e no treino do modelo a lógica original continua sendo medida fora da amostra; se ela se provar boa daqui para frente, os dados mostram e dá para rever.
- **Pendente:** seguir o diário real por 60+ pregões antes de qualquer outra mudança na aba Decisões ou de aplicar o modelo em treino.
