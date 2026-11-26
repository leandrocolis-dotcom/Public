# Estudo retroativo do aprendizado (prévia)

> Gerado por `scripts/retro-study.mjs` em 21/11/2026. Reproduzir: `node scripts/retro-study.mjs --syms=...`.
> É **prévia**: as regras foram escolhidas olhando esses anos, então o resultado é otimista. Não aprova nada no modelo
> real, que só aprende com o diário fora da amostra. Material educacional; não é recomendação de investimento.

## Amostra

- Período avaliado: **04/12/2017 a 20/11/2026** (2243 pregões; histórico de 10y, com ~1 ano de aquecimento).
- **47 ativos**: os ETFs do Pêndulo e a carteira (–).
- **51.527 gatilhos encerrados** (Decisão do trader a cada 5 pregões, sinais de curto prazo e níveis), um por ativo e lógica a cada 5 pregões, como no diário real.
- Medida: resultado em R (stop de 2,5 ATR, 0,05% de custo por perna, entrada no fechamento do dia do gatilho), no horizonte da lógica (decisões 20 pregões; sinais e níveis 5), em **excesso sobre a média do universo** no mesmo dia. Regime: S&P acima/abaixo da média de 200 dias (400 dias em baixa).
- Decisão do trader sem fundamentos (não há fundamentos antigos) e sem o regime macro do dia.

## Lógicas que mandam operar

| Lógica              | Dias | Acerto (regra antiga) | Excesso em R (faixa 90%) |          Alta / baixa | Regra antiga | Regra nova   |
| ------------------- | ---: | --------------------: | -----------------------: | --------------------: | ------------ | ------------ |
| dec:sell:sell       |  306 |                   40% |    +0,08 (+0,01 a +0,15) | +0,13 / −0,02 (105 d) | Eliminada    | Em avaliação |
| dec:reduce:sell     |  443 |                   42% |    +0,08 (+0,02 a +0,14) |  +0,10 / +0,01 (99 d) | Eliminada    | Em avaliação |
| sig:lost200:sell    |  759 |                   47% |    +0,02 (−0,01 a +0,04) | +0,00 / +0,07 (159 d) | Eliminada    | Em avaliação |
| sig:breakdown:sell  |  955 |                   43% |    −0,01 (−0,03 a +0,01) | −0,00 / −0,04 (193 d) | Eliminada    | Eliminada    |
| level:stop:sell     |  884 |                   42% |    −0,01 (−0,04 a +0,01) | −0,02 / +0,04 (129 d) | Eliminada    | Eliminada    |
| level:sup:buy       |  302 |                   49% |    −0,02 (−0,07 a +0,03) |  −0,02 / +0,08 (21 d) | Eliminada    | Eliminada    |
| dec:buy:buy         |  551 |                   50% |    −0,02 (−0,08 a +0,04) |  −0,01 / −0,12 (57 d) | Eliminada    | Eliminada    |
| level:res:buy       | 1257 |                   50% |    −0,02 (−0,05 a −0,00) | −0,03 / +0,05 (142 d) | Eliminada    | Eliminada    |
| sig:pullback10:buy  |  829 |                   50% |    −0,03 (−0,05 a +0,00) | −0,03 / −0,03 (142 d) | Eliminada    | Eliminada    |
| sig:dip:buy         |  340 |                   54% |    −0,03 (−0,08 a +0,03) |  −0,02 / −0,07 (30 d) | Eliminada    | Eliminada    |
| sig:reversal:buy    |  315 |                   54% |    −0,03 (−0,07 a +0,01) |  −0,05 / +0,06 (67 d) | Eliminada    | Eliminada    |
| sig:stretched:sell  |  347 |                   45% |    −0,04 (−0,09 a +0,02) |  −0,05 / +0,12 (24 d) | Eliminada    | Eliminada    |
| sig:rally_down:sell |  602 |                   43% |    −0,04 (−0,07 a −0,01) | −0,03 / −0,07 (148 d) | Eliminada    | Eliminada    |
| dec:buy-part:buy    |  577 |                   50% |    −0,07 (−0,14 a +0,00) |  −0,07 / −0,03 (88 d) | Eliminada    | Eliminada    |
| level:res:sell      |  104 |                   35% |    −0,08 (−0,15 a −0,01) |  −0,10 / −0,02 (30 d) | Eliminada    | Eliminada    |

## Lógicas de "esperar" (seguem pelo aproveitamento)

| Lógica         | Dias | Aproveitamento | Status   |
| -------------- | ---: | -------------: | -------- |
| level:sup:wait | 1765 |            74% | Aprovada |
| dec:wait:wait  |  549 |            72% | Aprovada |
| level:res:wait | 1540 |            74% | Aprovada |

## O filtro de vantagem funcionou?

| Grupo                  | Excesso em R por dia | Dias |
| ---------------------- | -------------------: | ---: |
| Bloqueadas pelo filtro |                −0,01 |  540 |
| Liberadas              |                −0,02 |  647 |
| Nota A                 |                −0,01 |  399 |
| Nota B                 |                −0,05 |  579 |
| Nota C                 |                +0,16 |  186 |
| Nota D                 |                −0,01 |  540 |

## Pesos da Decisão do trader (correlação com o excesso em 20 pregões)

- tech: 0,016 (20469 decisões)
- fund: – (0 decisões)
- market: -0,002 (20469 decisões)
- history: 0,007 (20469 decisões)

## Leitura

1. **"Reduzir" (Decisão do trader) foi aprovada em setores:** +0,11R por dia em 443 dias, e passa na correção de testes múltiplos. É o segundo universo independente em que ela fica positiva: estudo geral +0,09R; backfill de 60 pregões +0,37R. É a lógica com mais evidência no app: **sair do que perde força relativa**.
2. **Nenhuma lógica de compra teve excesso positivo em setores.** "Comprar em partes" ficou em −0,08R (menos ruim que no estudo geral, −0,19R, mas ainda negativa), o que confirma a troca para "Aguardar" nas decisões ao vivo.
3. **O filtro de vantagem não ajudou em setores** (bloqueadas +0,00R × liberadas −0,03R): a direção é a contrária da do estudo geral. Junto com as notas A–D, que nunca ordenaram bem o resultado, isso indica que o filtro é fraco. Ele segue útil como disciplina (não operar contra expectativa negativa), não como previsão.
4. Ver também `docs/ESTUDO-SETORIAL.md`: a rotação setorial perdeu para o S&P comprado e parado.
