# Estudo retroativo do aprendizado (prévia)

> Gerado por `scripts/retro-study.mjs` em 09/10/2026. Reproduzir: `node scripts/retro-study.mjs --syms=...`.
> É **prévia**: as regras foram escolhidas olhando esses anos, então o resultado é otimista. Não aprova nada no modelo
> real, que só aprende com o diário fora da amostra. Material educacional; não é recomendação de investimento.

## Amostra

- Período avaliado: **20/10/2017 a 08/10/2026** (2253 pregões; histórico de 10y, com ~1 ano de aquecimento).
- **508 ativos**: os ETFs do Pêndulo e a carteira (–). Sem dados: CLDL (HTTP 404), MMC (HTTP 404).
- **502.697 gatilhos encerrados** (Decisão do trader a cada 5 pregões, sinais de curto prazo e níveis), um por ativo e lógica a cada 5 pregões, como no diário real.
- Medida: resultado em R (stop de 2,5 ATR, 0,05% de custo por perna, entrada no fechamento do dia do gatilho), no horizonte da lógica (decisões 20 pregões; sinais e níveis 5), em **excesso sobre a média do universo** no mesmo dia. Regime: S&P acima/abaixo da média de 200 dias (401 dias em baixa).
- Decisão do trader sem fundamentos (não há fundamentos antigos) e sem o regime macro do dia.

## Lógicas que mandam operar

| Lógica              | Dias | Acerto (regra antiga) | Excesso em R (faixa 90%) |          Alta / baixa | Regra antiga | Regra nova   |
| ------------------- | ---: | --------------------: | -----------------------: | --------------------: | ------------ | ------------ |
| dec:reduce:sell     | 1577 |                   42% |    +0,06 (+0,03 a +0,10) | +0,08 / +0,02 (325 d) | Eliminada    | Aprovada ✓BH |
| level:res:sell      |  596 |                   43% |    +0,02 (−0,03 a +0,06) | +0,03 / −0,04 (104 d) | Eliminada    | Em avaliação |
| sig:rally_down:sell | 2133 |                   46% |    +0,02 (−0,01 a +0,04) | +0,02 / +0,02 (360 d) | Eliminada    | Em avaliação |
| dec:sell:sell       | 1333 |                   42% |    +0,01 (−0,02 a +0,05) | +0,05 / −0,09 (338 d) | Eliminada    | Em avaliação |
| level:stop:sell     | 1992 |                   43% |    +0,01 (−0,00 a +0,03) | +0,01 / +0,03 (354 d) | Eliminada    | Em avaliação |
| sig:stretched:sell  | 1789 |                   37% |    −0,00 (−0,03 a +0,03) | −0,01 / +0,08 (189 d) | Eliminada    | Eliminada    |
| sig:breakdown:sell  | 2219 |                   45% |    −0,00 (−0,02 a +0,01) | −0,00 / −0,00 (388 d) | Eliminada    | Eliminada    |
| sig:lost200:sell    | 2126 |                   45% |    −0,00 (−0,02 a +0,01) | +0,00 / −0,03 (384 d) | Eliminada    | Eliminada    |
| dec:buy:buy         | 1811 |                   48% |    −0,02 (−0,06 a +0,01) | −0,01 / −0,10 (218 d) | Eliminada    | Eliminada    |
| sig:reversal:buy    | 1462 |                   49% |    −0,02 (−0,05 a +0,00) | −0,05 / +0,10 (223 d) | Eliminada    | Eliminada    |
| sig:pullback10:buy  | 2192 |                   48% |    −0,03 (−0,05 a −0,02) | −0,04 / −0,02 (381 d) | Eliminada    | Eliminada    |
| level:res:buy       | 2182 |                   48% |    −0,03 (−0,05 a −0,02) | −0,02 / −0,11 (362 d) | Eliminada    | Eliminada    |
| dec:buy-part:buy    | 1813 |                   47% |    −0,04 (−0,08 a −0,00) | −0,01 / −0,18 (282 d) | Eliminada    | Eliminada    |
| level:sup:buy       | 1721 |                   48% |    −0,04 (−0,06 a −0,02) | −0,04 / −0,08 (242 d) | Eliminada    | Eliminada    |
| sig:dip:buy         | 1297 |                   48% |    −0,05 (−0,07 a −0,02) | −0,05 / −0,03 (172 d) | Eliminada    | Eliminada    |

## Lógicas de "esperar" (seguem pelo aproveitamento)

| Lógica         | Dias | Aproveitamento | Status   |
| -------------- | ---: | -------------: | -------- |
| level:sup:wait | 2247 |            75% | Aprovada |
| level:res:wait | 2248 |            75% | Aprovada |
| dec:wait:wait  | 1602 |            75% | Aprovada |

## O filtro de vantagem funcionou?

| Grupo                  | Excesso em R por dia | Dias |
| ---------------------- | -------------------: | ---: |
| Bloqueadas pelo filtro |                −0,02 | 1626 |
| Liberadas              |                −0,00 | 2121 |
| Nota A                 |                −0,00 | 1507 |
| Nota B                 |                −0,06 | 1812 |
| Nota C                 |                +0,11 | 1884 |
| Nota D                 |                −0,02 | 1626 |

## Pesos da Decisão do trader (correlação com o excesso em 20 pregões)

- tech: 0,008 (190817 decisões)
- fund: – (0 decisões)
- market: -0,006 (190817 decisões)
- history: -0,009 (190817 decisões)

## Leitura

Ver a leitura completa em `docs/ESTUDO-UNIVERSO-SETORES.md`.
