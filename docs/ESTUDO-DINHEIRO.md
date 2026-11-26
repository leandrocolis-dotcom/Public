# Estudo D3: volatilidade-alvo (H9), alavancado com filtro (H10) e tendência entre classes (H11)

> `node scripts/money-study.mjs` → `data/money-study.json`. Regras e critério registrados no cabeçalho do script
> antes de rodar (18/11/2026). 2007-05-01 a 2026-11-18, Yahoo ajustado, rebalanceamento mensal, custo
> 0,05% por perna, caixa a T-bill (^IRX).
> Material educacional; não é recomendação de investimento.

| Regra                                     | Ganho ao ano | Queda máx. | Retorno/queda |  Vol. | Sharpe | Em alta | Em baixa | até 2012 | 2013–2019 | 2020 em diante |
| ----------------------------------------- | -----------: | ---------: | ------------: | ----: | -----: | ------: | -------: | -------: | --------: | -------------: |
| Segurar SPY                               |        10.5% |     -55.2% |          0.19 | 19.6% |   0.53 |   23.6% |   -31.8% |     1.5% |     14.6% |          14.2% |
| SPY + MM200 mensal                        |         9.1% |     -24.3% |          0.37 | 12.6% |   0.63 |   17.6% |   -20.9% |     7.9% |     10.4% |           8.7% |
| H9 Volatilidade-alvo 16% (SPY/caixa)      |        10.1% |     -36.1% |          0.28 | 14.7% |   0.63 |   21.1% |   -28.2% |     3.9% |     13.6% |          11.8% |
| H10 SSO 2x com filtro (MM200 + vol < 20%) |        13.9% |     -38.4% |          0.36 | 23.9% |   0.60 |   30.6% |   -38.8% |    11.1% |     18.2% |          12.1% |
| H10 (registro) QLD 2x com filtro no QQQ   |        19.8% |     -48.8% |          0.41 | 31.1% |   0.69 |   44.9% |   -59.0% |     5.6% |     31.1% |          21.3% |
| H11 Tendência entre 5 classes (10 meses)  |         5.8% |     -11.9% |          0.49 |  7.3% |   0.60 |    8.6% |    -4.5% |     5.7% |      3.4% |           8.3% |

"Em alta/baixa" = retorno médio diário anualizado nos dias em que o SPY está acima/abaixo da MM200. Sharpe sobre o caixa.

## Veredito (critério fixado antes)

| Hipótese                                  | Critério cumprido? | p (bootstrap) | Passa no BH 10%? | Resultado         |
| ----------------------------------------- | ------------------ | ------------: | ---------------- | ----------------- |
| H9 Volatilidade-alvo 16% (SPY/caixa)      | sim                |          0.11 | não              | **em observação** |
| H10 SSO 2x com filtro (MM200 + vol < 20%) | sim                |          0.11 | não              | **em observação** |
| H11 Tendência entre 5 classes (10 meses)  | sim                |          0.36 | não              | **em observação** |

- H9: Sharpe > segurar, queda menor e no máximo 1 p.p. a menos ao ano.
- H10: ganhar mais que segurar, sem queda pior, e ganhar em pelo menos 2 dos 3 períodos.
- H11: retorno/queda e Sharpe maiores e queda menor que segurar.

Aprovar aqui não aplica nada na aba Decisões: só entra em modo sombra. Alavancado (H10) perde valor em mercado lateral
e volátil (decaimento diário); o filtro de volatilidade existe para isso, mas um tombo de um dia (ex.: 2020) pega a
posição cheia antes do fim do mês.
