# Estudo F31: risco igual por ativo (peso ∝ 1/ATR) × pesos iguais

> `node scripts/risk-weight-study.mjs` → `data/risk-weight-study.json`. Regras e critério registrados no cabeçalho do
> script antes de rodar. 40 ETFs do Pêndulo, até 10 anos (Yahoo ajustado), rebalanceamento mensal, custo
> 0,05% por perna sobre o giro.
> Material educacional; não é recomendação de investimento.

| Regra                        | Ganho ao ano | Queda máx. | Retorno/queda | Volatilidade | Sharpe | Ano em alta do S&P | Ano em baixa do S&P |
| ---------------------------- | -----------: | ---------: | ------------: | -----------: | -----: | -----------------: | ------------------: |
| Q Pesos iguais               |         9.2% |     -25.9% |          0.36 |        11.6% |   0.82 |              13.5% |              -14.0% |
| R Risco igual (peso ∝ 1/ATR) |         7.5% |     -22.2% |          0.34 |         9.6% |   0.80 |              11.3% |              -14.2% |

## Veredito de H5 (critério fixado antes)

- Sharpe do risco igual maior? não.
- Queda máxima menor? sim.
- **H5 REPROVADA.** Ficam os pesos iguais.

Aprovar aqui não aplica nada na aba Decisões: só entra em modo sombra (docs/MODELO-UNICO.md, camada 5).
