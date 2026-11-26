# Estudo F32: núcleo-satélite 70/30 × 100% núcleo × 100% satélite

> `node scripts/satellite-study.mjs` → `data/core-satellite-study.json`. Regras e critério registrados no cabeçalho do
> script antes de rodar. Mesmas séries da F30 (`docs/ESTUDO-SATELITE.md`), 2016-11-14 a 2026-10-12; rebalanceamento
> mensal entre as partes com custo 0,05%.
> Material educacional; não é recomendação de investimento.

| Regra                                              | Ganho ao ano | Queda máx. | Retorno/queda | Volatilidade | Sharpe |
| -------------------------------------------------- | -----------: | ---------: | ------------: | -----------: | -----: |
| P SPY + MM200 mensal (100% núcleo)                 |         9.4% |     -24.3% |          0.39 |        12.5% |   0.78 |
| S Top 20% 12-1 + regime (satélite) (100% satélite) |         8.8% |     -23.8% |          0.37 |        15.0% |   0.64 |
| M Núcleo-satélite 70/30                            |         9.4% |     -19.3% |          0.49 |        12.3% |   0.79 |

## Veredito de H6 (critério fixado antes)

- Sharpe do 70/30 > o do núcleo? sim.
- Sharpe do 70/30 > o do satélite? sim.
- **H6 APROVADA.** Mas a H3 foi reprovada: pelo MODELO-UNICO o satélite só existe com H3 aprovada; fica registrado, sem efeito.

Aprovar aqui não aplica nada na aba Decisões: só entra em modo sombra (docs/MODELO-UNICO.md, camada 5).
