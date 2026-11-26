# Estudo J3 (P1b): pano de fundo MM200 + crédito

> `node scripts/backdrop-study.mjs` → `data/backdrop-study.json` e `data/backdrop-model.json`. Regras registradas no
> cabeçalho antes de rodar (20/11/2026). 2011-01-03 a 2026-08-24 (fora da amostra, 3933 pregões).
> Taxa base de queda > 10% em 63 pregões: **11.6%**.
> Material educacional; não é recomendação de investimento.

## Hipóteses

| Hipótese                                                        | Confirmada? | Números                 |
| --------------------------------------------------------------- | ----------- | ----------------------- |
| HP6: MM200 + crédito > MM200 sozinha (Brier skill) com p ≤ 0,10 | **não**     | 0.060 × 0.071; p = 0.85 |
| HP7: regime h=63 > h=1                                          | **não**     | 0.023 × 0.024           |

## Brier fora da amostra

| Modelo                            | Brier | Skill |
| --------------------------------- | ----: | ----: |
| Taxa base                         | 0.115 | 0.000 |
| MM200 sozinha                     | 0.106 | 0.071 |
| MM200 + crédito 60d (HP6)         | 0.108 | 0.060 |
| Estado do pano de fundo (−1/0/+1) | 0.110 | 0.037 |
| Regime atual h=1 (1D)             | 0.112 | 0.024 |
| Regime atual h=63 (3M)            | 0.112 | 0.023 |

## Taxa de queda por estado do pano de fundo (o que a tela mostra)

| Estado    | Dias | Fração | Queda > 10% em 63d | × base |
| --------- | ---: | -----: | -----------------: | -----: |
| defesa    |  422 |  10.7% |              18.2% |   1.57 |
| atenção   | 1093 |  27.8% |              16.7% |   1.43 |
| favorável | 2418 |  61.5% |               8.2% |   0.70 |

HP6 reprovada: a probabilidade (J4) **não** vai para a tela; o pano de fundo segue só com os lados (estado).
