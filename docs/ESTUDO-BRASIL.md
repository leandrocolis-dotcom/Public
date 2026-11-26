# Estudo F33: Brasil (B3) com imposto de 15% sobre a venda

> `node scripts/brazil-study.mjs` → `data/brazil-study.json`. Regras e critério registrados no cabeçalho do script antes
> de rodar. ETFs da B3: BOVA11, SMAL11, IVVB11, DIVO11, PIBB11 (Yahoo ajustado), 2016-11-24 a 2026-10-09. Caixa rende CDI
> (Banco Central, SGS 12). Custo 0,05% por perna. Imposto de 15% sobre o ganho realizado,
> com prejuízo compensado; no fim todas as regras liquidam e pagam o imposto. Material educacional; não é recomendação
> de investimento nem orientação tributária.

| Regra                                 | Ganho ao ano bruto | Ganho ao ano líquido | Queda máx. | Sharpe (líquido) | Ano em alta do BOVA11 | Ano em baixa do BOVA11 | Imposto pago (por R$ 1) |
| ------------------------------------- | -----------------: | -------------------: | ---------: | ---------------: | --------------------: | ---------------------: | ----------------------: |
| N Segurar BOVA11                      |              13.4% |                12.1% |     -46.9% |             0.61 |                 31.7% |                 -37.9% |                 R$ 0.36 |
| C Stop 2,5 ATR                        |              13.2% |                11.9% |     -46.9% |             0.60 |                 31.4% |                 -37.9% |                 R$ 0.35 |
| D Catraca                             |               8.0% |                 7.3% |     -18.9% |             0.60 |                 14.3% |                 -10.7% |                 R$ 0.08 |
| E BOVA11 + MM200 mensal               |               8.3% |                 7.4% |     -30.7% |             0.51 |                 22.3% |                 -32.2% |                 R$ 0.13 |
| S Satélite B3 (top 20% 12-1 + regime) |              17.3% |                15.0% |     -16.8% |             0.96 |                 23.7% |                  -9.8% |                 R$ 0.44 |

"Ano em alta/baixa" = retorno médio diário anualizado nos dias em que o BOVA11 está acima/abaixo da MM200.

## Veredito de H7 (critério fixado antes: ganho líquido de imposto > segurar BOVA11)

- **C Stop 2,5 ATR:** vantagem líquida -0.2 p.p. ao ano → REPROVADA.
- **D Catraca:** vantagem líquida -4.8 p.p. ao ano → REPROVADA.
- **E BOVA11 + MM200 mensal:** vantagem líquida -4.7 p.p. ao ano → REPROVADA.
- **S Satélite B3 (top 20% 12-1 + regime):** vantagem líquida +2.9 p.p. ao ano → APROVADA.
- **H7 APROVADA.** Não recomendar giro mensal na B3: depois do imposto, a MM200 mensal não bate segurar o BOVA11.

Aprovar aqui não aplica nada na aba Decisões: só entra em modo sombra (docs/MODELO-UNICO.md, camada 5).
