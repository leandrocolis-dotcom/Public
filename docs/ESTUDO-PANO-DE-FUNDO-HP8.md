# Estudo HP8: estado do pano de fundo só pela MM200

> `node scripts/backdrop-study.mjs --hp8` → `data/backdrop-hp8.json`. Hipótese registrada no cabeçalho do script em
> 20/11/2026, depois do resultado de HP6 (docs/ESTUDO-PANO-DE-FUNDO.md) e antes de rodar. 2011-01-03 a
> 2026-08-24 (fora da amostra, 3933 pregões); taxa base 11.6%.
> Material educacional; não é recomendação de investimento.

## Veredito: **reprovada**

| Modelo                                          | Brier skill |
| ----------------------------------------------- | ----------: |
| Estado de 3 níveis (MM200 + crédito, o da tela) |       0.037 |
| Estado só pela MM200 (HP8)                      |       0.030 |
| MM200 contínua (referência)                     |       0.071 |

Bootstrap (blocos de 63, 2.000 sorteios) do estado só pela MM200 contra o de 3 níveis: p = 0.54.

| Estado          | Dias | Fração | Queda > 10% em 63d | × base |
| --------------- | ---: | -----: | -----------------: | -----: |
| abaixo da MM200 |  608 |  15.5% |              21.1% |   1.81 |
| acima da MM200  | 3325 |  84.5% |               9.9% |   0.85 |

Reprovada: o pano de fundo da tela não muda (estado de 3 níveis).
