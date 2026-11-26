# Estudo F30: satélite (top 20% do 12-1 + regime) × SPY + MM200 mensal

> `node scripts/satellite-study.mjs` → `data/satellite-study.json`. Regras e critério registrados no cabeçalho do
> script antes de rodar. 40 ETFs do Pêndulo, 2016-11-14 a 2026-10-12, Yahoo ajustado, rebalanceamento
> mensal, custo 0,05% por perna, caixa a T-bill (^IRX).
> Material educacional; não é recomendação de investimento.

| Regra                              | Ganho ao ano | Queda máx. | Retorno/queda | Volatilidade | Sharpe | Ano em alta do S&P | Ano em baixa do S&P |
| ---------------------------------- | -----------: | ---------: | ------------: | -----------: | -----: | -----------------: | ------------------: |
| N Segurar SPY                      |        15.5% |     -33.7% |          0.46 |        18.0% |   0.89 |              25.1% |              -30.7% |
| P SPY + MM200 mensal               |         9.4% |     -24.3% |          0.39 |        12.5% |   0.78 |              17.8% |              -31.4% |
| S Top 20% 12-1 + regime (satélite) |         8.8% |     -23.8% |          0.37 |        15.0% |   0.64 |              13.8% |              -12.6% |

"Ano em alta/baixa" = retorno médio diário anualizado nos dias em que o SPY está acima/abaixo da MM200.

## Veredito de H3/H4 (critério fixado antes)

- Retorno/queda do satélite > o do SPY + MM200? não.
- Melhor nos dias de baixa? sim.
- Não pior nos dias de alta? não.
- **H3 REPROVADA.** H4: sem satélite; o núcleo é o índice protegido pela MM200 mensal.

Aprovar aqui não aplica nada na aba Decisões: só entra em modo sombra (docs/MODELO-UNICO.md, camada 5).
