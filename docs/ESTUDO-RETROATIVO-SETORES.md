# Estudo retroativo do aprendizado (prévia)

> Gerado por `scripts/retro-study.mjs` em 28/11/2026. Reproduzir: `node scripts/retro-study.mjs --syms=...`.
> É **prévia**: as regras foram escolhidas olhando esses anos, então o resultado é otimista. Não aprova nada no modelo
> real, que só aprende com o diário fora da amostra. Material educacional; não é recomendação de investimento.

## Amostra

- Período avaliado: **08/12/2017 a 27/11/2026** (2246 pregões; histórico de 10y, com ~1 ano de aquecimento).
- **47 ativos**: os ETFs do Pêndulo e a carteira (–).
- **51.471 gatilhos encerrados** (Decisão do trader a cada 5 pregões, sinais de curto prazo e níveis), um por ativo e lógica a cada 5 pregões, como no diário real.
- Medida: resultado em R (stop de 2,5 ATR, 0,05% de custo por perna, entrada no fechamento do dia do gatilho), no horizonte da lógica (decisões 20 pregões; sinais e níveis 5), em **excesso sobre a média do universo** no mesmo dia. Regime: S&P acima/abaixo da média de 200 dias (400 dias em baixa).
- Decisão do trader sem fundamentos (não há fundamentos antigos) e sem o regime macro do dia.

## Lógicas que mandam operar

| Lógica | Dias | Acerto (regra antiga) | Excesso em R (faixa 90%) | Alta / baixa | Regra antiga | Regra nova |
|---|---:|---:|---:|---:|---|---|
| dec:sell:sell | 350 | 43% | +0,13 (+0,05 a +0,20) | +0,18 / +0,05 (141 d) | Eliminada | Aprovada ✓BH |
| dec:reduce:sell | 481 | 43% | +0,12 (+0,06 a +0,18) | +0,13 / +0,09 (112 d) | Eliminada | Aprovada ✓BH |
| level:sup:buy | 318 | 53% | +0,03 (−0,02 a +0,08) | +0,01 / +0,25 (31 d) | Eliminada | Em avaliação |
| sig:lost200:sell | 761 | 47% | +0,02 (−0,01 a +0,05) | +0,00 / +0,07 (160 d) | Eliminada | Em avaliação |
| dec:buy:buy | 676 | 49% | −0,00 (−0,06 a +0,06) | +0,00 / −0,05 (55 d) | Eliminada | Eliminada |
| level:stop:sell | 892 | 42% | −0,01 (−0,03 a +0,02) | −0,01 / +0,02 (143 d) | Eliminada | Eliminada |
| sig:breakdown:sell | 956 | 43% | −0,01 (−0,03 a +0,01) | −0,00 / −0,04 (194 d) | Eliminada | Eliminada |
| level:res:buy | 1246 | 49% | −0,02 (−0,05 a −0,00) | −0,04 / +0,08 (124 d) | Eliminada | Eliminada |
| sig:pullback10:buy | 831 | 50% | −0,03 (−0,05 a +0,00) | −0,03 / −0,03 (143 d) | Eliminada | Eliminada |
| sig:dip:buy | 339 | 54% | −0,03 (−0,08 a +0,03) | −0,02 / −0,07 (30 d) | Eliminada | Eliminada |
| sig:reversal:buy | 313 | 54% | −0,03 (−0,07 a +0,01) | −0,05 / +0,06 (67 d) | Eliminada | Eliminada |
| sig:stretched:sell | 346 | 45% | −0,04 (−0,09 a +0,02) | −0,05 / +0,12 (24 d) | Eliminada | Eliminada |
| sig:rally_down:sell | 602 | 43% | −0,04 (−0,07 a −0,01) | −0,03 / −0,07 (148 d) | Eliminada | Eliminada |
| level:res:sell | 109 | 40% | −0,07 (−0,14 a +0,01) | −0,09 / −0,03 (33 d) | Eliminada | Eliminada |
| dec:buy-part:buy | 702 | 51% | −0,10 (−0,17 a −0,02) | −0,09 / −0,11 (89 d) | Eliminada | Eliminada |

## Lógicas de "esperar" (seguem pelo aproveitamento)

| Lógica | Dias | Aproveitamento | Status |
|---|---:|---:|---|
| level:sup:wait | 1801 | 73% | Aprovada |
| dec:wait:wait | 587 | 73% | Aprovada |
| level:res:wait | 1545 | 74% | Aprovada |

## O filtro de vantagem funcionou?

| Grupo | Excesso em R por dia | Dias |
|---|---:|---:|
| Bloqueadas pelo filtro | −0,02 | 575 |
| Liberadas | −0,02 | 951 |
| Nota A | −0,04 | 456 |
| Nota B | −0,04 | 759 |
| Nota C | +0,14 | 199 |
| Nota D | −0,02 | 575 |

## Pesos da Decisão do trader (correlação com o excesso em 20 pregões)

- tech: 0,018 (20471 decisões)
- fund: – (0 decisões)
- market: 0,003 (20471 decisões)
- history: 0,007 (20471 decisões)

## Leitura

1. **"Reduzir" (Decisão do trader) foi aprovada em setores:** +0,11R por dia em 443 dias, e passa na correção de testes múltiplos. É o segundo universo independente em que ela fica positiva: estudo geral +0,09R; backfill de 60 pregões +0,37R. É a lógica com mais evidência no app: **sair do que perde força relativa**.
2. **Nenhuma lógica de compra teve excesso positivo em setores.** "Comprar em partes" ficou em −0,08R (menos ruim que no estudo geral, −0,19R, mas ainda negativa), o que confirma a troca para "Aguardar" nas decisões ao vivo.
3. **O filtro de vantagem não ajudou em setores** (bloqueadas +0,00R × liberadas −0,03R): a direção é a contrária da do estudo geral. Junto com as notas A–D, que nunca ordenaram bem o resultado, isso indica que o filtro é fraco. Ele segue útil como disciplina (não operar contra expectativa negativa), não como previsão.
4. Ver também `docs/ESTUDO-SETORIAL.md`: a rotação setorial perdeu para o S&P comprado e parado.
