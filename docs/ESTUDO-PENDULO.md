# Estudo P1: Pêndulo 2.0 × pêndulo atual × MM200

> `node scripts/pendulum-study.mjs` → `data/pendulum-study.json`. Regras e critério registrados no cabeçalho do
> script antes de rodar (20/11/2026). 2012-01-03 a 2026-08-24 (fora da amostra, 3681 pregões),
> Yahoo ajustado. Taxa base de queda > 10% em 63 pregões: **10.7%**.
> Material educacional; não é recomendação de investimento.

## Veredito: **reprovada**

- (a) Brier skill do 2.0 > atual (h=1) e > MM200: **não** (0.032 × 0.034 × 0.091)
- (b) Monotonia do 2.0 (Spearman ≤ −0,9) e quintil de baixo mais concentrado que os dois: **não** (Spearman -1.00; razões 2.13 × 1.73 × 2.98)
- Bootstrap (blocos de 63, 2000 sorteios) do Brier do 2.0 contra MM200 simples: p = 0.85
- Variantes testadas (contam para superajuste): 15

## 1. Probabilidade de queda > 10% em 63 pregões (fora da amostra)

Brier skill > 0 = melhor que chutar a taxa base. Logística ano a ano, treino expansivo com expurgo.

| Modelo                        | Brier | Skill |
| ----------------------------- | ----: | ----: |
| Taxa base                     | 0.109 | 0.000 |
| Atual (h=1, Início)           | 0.105 | 0.034 |
| Atual (h=5)                   | 0.106 | 0.032 |
| Atual (h=21)                  | 0.104 | 0.042 |
| MM200 simples                 | 0.099 | 0.091 |
| Vol 20d simples               | 0.106 | 0.032 |
| Pêndulo 2.0                   | 0.106 | 0.032 |
| 2.0 (5 forças separadas)      | 0.104 | 0.043 |
| Tendência + Vol               | 0.103 | 0.055 |
| Tendência + Vol + Crescimento | 0.104 | 0.049 |
| Crédito: nível                | 0.101 | 0.074 |
| Crédito: variação 60d         | 0.100 | 0.079 |

## 2. Quintis de cada sinal (quintil 1 = mais defensivo)

**Atual (h=1, Início)** (Spearman quintil × queda: -1.00)

| Quintil | Dias | Queda > 10% | × base | Vol futura 21d | Ret. 21d | Sharpe (SPY no dia seguinte) | Queda máx. |
| ------: | ---: | ----------: | -----: | -------------: | -------: | ---------------------------: | ---------: |
|       1 |  636 |       18.6% |   1.73 |          20.2% |     2.0% |                         0.61 |     -36.8% |
|       2 |  746 |       12.3% |   1.15 |          14.9% |     1.2% |                         1.21 |     -16.4% |
|       3 |  758 |        9.8% |   0.91 |          13.1% |     1.1% |                         0.98 |     -32.9% |
|       4 |  764 |        8.9% |   0.83 |          12.1% |     1.0% |                         1.70 |     -11.4% |
|       5 |  777 |        5.5% |   0.52 |          11.2% |     1.1% |                         0.78 |     -13.5% |

**Atual (h=5)** (Spearman quintil × queda: -1.00)

| Quintil | Dias | Queda > 10% | × base | Vol futura 21d | Ret. 21d | Sharpe (SPY no dia seguinte) | Queda máx. |
| ------: | ---: | ----------: | -----: | -------------: | -------: | ---------------------------: | ---------: |
|       1 |  633 |       17.7% |   1.65 |          20.0% |     2.1% |                         0.74 |     -35.5% |
|       2 |  747 |       11.1% |   1.04 |          14.3% |     1.6% |                         1.41 |     -11.7% |
|       3 |  800 |       10.1% |   0.94 |          13.3% |     0.7% |                         0.92 |     -23.1% |
|       4 |  766 |        9.8% |   0.91 |          12.6% |     0.8% |                         0.77 |     -12.5% |
|       5 |  735 |        6.0% |   0.56 |          11.2% |     1.2% |                         1.29 |     -13.4% |

**Atual (h=21)** (Spearman quintil × queda: -1.00)

| Quintil | Dias | Queda > 10% | × base | Vol futura 21d | Ret. 21d | Sharpe (SPY no dia seguinte) | Queda máx. |
| ------: | ---: | ----------: | -----: | -------------: | -------: | ---------------------------: | ---------: |
|       1 |  636 |       20.8% |   1.93 |          20.9% |     1.9% |                         0.81 |     -33.7% |
|       2 |  756 |       11.8% |   1.10 |          14.0% |     1.4% |                         2.22 |     -12.9% |
|       3 |  806 |       10.3% |   0.96 |          12.8% |     1.0% |                        -0.27 |     -27.9% |
|       4 |  769 |        7.9% |   0.74 |          12.4% |     0.6% |                         1.08 |     -19.8% |
|       5 |  714 |        4.2% |   0.39 |          11.4% |     1.4% |                         1.46 |      -7.7% |

**MM200 simples** (Spearman quintil × queda: -0.70)

| Quintil | Dias | Queda > 10% | × base | Vol futura 21d | Ret. 21d | Sharpe (SPY no dia seguinte) | Queda máx. |
| ------: | ---: | ----------: | -----: | -------------: | -------: | ---------------------------: | ---------: |
|       1 |  651 |       32.0% |   2.98 |          22.5% |     1.5% |                         0.82 |     -25.9% |
|       2 |  588 |       10.7% |   1.00 |          13.2% |     1.8% |                         1.76 |     -14.4% |
|       3 |  924 |        5.2% |   0.48 |          11.4% |     1.6% |                         1.48 |     -11.6% |
|       4 |  896 |        2.6% |   0.24 |          11.2% |     1.0% |                         0.60 |     -13.8% |
|       5 |  622 |        8.5% |   0.79 |          14.4% |     0.3% |                         0.40 |     -12.5% |

**Pêndulo 2.0** (Spearman quintil × queda: -1.00)

| Quintil | Dias | Queda > 10% | × base | Vol futura 21d | Ret. 21d | Sharpe (SPY no dia seguinte) | Queda máx. |
| ------: | ---: | ----------: | -----: | -------------: | -------: | ---------------------------: | ---------: |
|       1 |  687 |       22.9% |   2.13 |          20.0% |     1.6% |                         1.11 |     -30.5% |
|       2 |  728 |       11.7% |   1.09 |          14.3% |     1.5% |                         1.12 |     -24.0% |
|       3 |  821 |        9.4% |   0.87 |          12.8% |     1.0% |                         0.34 |     -14.9% |
|       4 |  757 |        6.7% |   0.63 |          12.1% |     1.0% |                         1.53 |     -13.6% |
|       5 |  688 |        3.6% |   0.34 |          11.8% |     1.2% |                         0.85 |     -10.0% |

## 3. Faixas do 2.0 com histerese (defesa < −30 até > −10; risco > +30 até < +10)

| Faixa  | Dias | Fração | Queda > 10% | Vol futura 21d |
| ------ | ---: | -----: | ----------: | -------------: |
| Defesa |  705 |  19.2% |       24.3% |          21.0% |
| Neutro | 2362 |  64.2% |        8.5% |          12.6% |
| Risco  |  614 |  16.7% |        3.7% |          11.9% |

## 4. Exposição (HP5)

| Regra                    | Ganho ao ano | Queda máx. | Retorno/queda |  Vol. | Sharpe |
| ------------------------ | -----------: | ---------: | ------------: | ----: | -----: |
| Segurar SPY              |        10.8% |     -51.9% |          0.21 | 19.7% |   0.62 |
| SPY + MM200 (diário)     |         9.2% |     -20.9% |          0.44 | 11.7% |   0.81 |
| Vol-alvo 16%             |         9.0% |     -28.6% |          0.31 | 12.4% |   0.76 |
| Vol-alvo + MM200 (HP5)   |         8.7% |     -17.1% |          0.51 | 11.0% |   0.82 |
| Vol-alvo + defesa do 2.0 |         9.1% |     -20.6% |          0.44 | 10.9% |   0.86 |

## 5. Quadrante crescimento × inflação (pelo impulso de 20 pregões)

| Quadrante    | Dias | SPY 63d | TLT 63d |
| ------------ | ---: | ------: | ------: |
| ↑cresc ↓infl |  814 |    1.5% |    0.5% |
| ↑cresc ↑infl | 1685 |    3.5% |   -0.1% |
| ↓cresc ↑infl |  641 |    3.4% |    0.2% |
| ↓cresc ↓infl | 1550 |    3.5% |    2.2% |

## 6. Hipóteses registradas

| Hipótese                                                                  | Confirmada? | Números                                  |
| ------------------------------------------------------------------------- | ----------- | ---------------------------------------- |
| HP1: quintil de baixo do 2.0 ≥ 2× a base; atual (h=1) ≤ 1,3×              | não         | 2.0 2.13×; atual 1.73×                   |
| HP2: força Vol melhora a previsão da vol de 21d (R² fora da amostra)      | não         | só vol de hoje 0.383; com a força 0.376  |
| HP3: crédito em variação de 60d > crédito em nível (Brier skill)          | sim         | nível 0.074; var. 60d 0.079              |
| HP4: Crescimento acrescenta < 10% sobre Tendência + Vol                   | sim         | 0.055 → 0.049                            |
| HP5: vol-alvo + MM200 corta ≥ 30% da queda máx. com CAGR ≥ SPY − 1,5 p.p. | não         | queda -17.1% × -51.9%; CAGR 8.7% × 10.8% |

## 7. Leitura de hoje (2026-11-20)

Pêndulo 2.0: **-47** (faixa defesa); atual (h=1): -46.

| Força                 | Estado | Impulso | Nota |
| --------------------- | -----: | ------: | ---: |
| Tendência             |    -63 |     -64 |  -63 |
| Volatilidade/estresse |    -50 |     -60 |  -55 |
| Crédito               |    -88 |     -62 |  -75 |
| Crescimento           |      1 |     -24 |  -12 |
| Inflação              |    -34 |     -93 |  -64 |
| Global/dólar          |    -51 |      -9 |  -30 |

Aprovar aqui não muda a tela: a P2 (motor em modo sombra) só começa com a P1 aprovada, e a troca do oficial (P5) só por
ordem do usuário depois de ≥ 2 meses de diário fora da amostra.
