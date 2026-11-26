# Estudo F28: catraca + MM200 mensal × stop fixo × segurar

> `node scripts/ratchet-study.mjs` → `data/ratchet-study.json`. Regras e critério de aprovação registrados no cabeçalho do
> script antes de rodar. 40 ETFs do Pêndulo, até 10 anos (Yahoo ajustado), carteira de pesos iguais,
> custo 0,05% por perna, caixa a T-bill (^IRX). Material educacional; não é recomendação de investimento.

| Regra                                 | Ganho ao ano | Volatilidade | Sharpe | Queda máx. da carteira | Ano em alta do S&P | Ano em baixa do S&P | Queda máx. média por ativo | Tempo no mercado | Saídas por ativo |
| ------------------------------------- | -----------: | -----------: | -----: | ---------------------: | -----------------: | ------------------: | -------------------------: | ---------------: | ---------------: |
| A Segurar                             |         9.2% |        12.0% |   0.80 |                 -26.9% |              13.8% |              -13.3% |                     -43.2% |             100% |              0.0 |
| B Stop fixo 8%                        |         7.6% |        10.7% |   0.74 |                 -23.2% |              13.3% |              -20.8% |                     -39.5% |              89% |              2.9 |
| C Stop fixo 2,5 ATR                   |         7.5% |        10.0% |   0.78 |                 -18.3% |              12.8% |              -19.3% |                     -37.2% |              83% |              5.8 |
| D Catraca (2,5 ATR → 3 ATR da máxima) |         5.5% |         4.7% |   1.18 |                  -5.4% |               6.9% |               -1.9% |                     -22.8% |              42% |             56.1 |
| E Só MM200 mensal                     |         7.1% |         7.5% |   0.95 |                 -10.1% |               9.8% |               -6.9% |                     -30.8% |              67% |             10.2 |
| F Catraca + MM200 mensal              |         5.6% |         4.7% |   1.18 |                  -5.4% |               6.9% |               -1.9% |                     -22.8% |              42% |             56.1 |

"Ano em alta/baixa" = retorno médio diário anualizado nos dias em que o SPY está acima/abaixo da MM200.

## Veredito de H1 (critério fixado antes)

- **D (Catraca (2,5 ATR → 3 ATR da máxima)) × B (stop fixo 8%):** queda menor que B? sim; ganho ≥ B − 1 p.p.? não; ativos com queda não pior que B: 95% (mínimo 60%). **REPROVADA.**
- **F (Catraca + MM200 mensal) × B (stop fixo 8%):** queda menor que B? sim; ganho ≥ B − 1 p.p.? não; ativos com queda não pior que B: 95% (mínimo 60%). **REPROVADA.**

Se reprovar, mantém-se o stop fixo de 2,5 ATR (C), já usado no simulador. Aprovar aqui não aplica nada na aba Decisões:
só entra em modo sombra (docs/MODELO-UNICO.md, camada 5).
