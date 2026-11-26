# Estudo F29: score SCTR (60/30/10) × momentum 12-1

> `node scripts/sctr-study.mjs` → `data/sctr-study.json`. Regras e critério registrados no cabeçalho do script antes
> de rodar. 40 ETFs do Pêndulo, 121 fins de mês (2016-10-31 a 2026-10-12), Yahoo ajustado.
> Material educacional; não é recomendação de investimento.

IC = correlação de postos entre o ordenador e o excesso de retorno sobre a média do universo (0 = não ordena; 1 = perfeito).
"t da diferença" > 2 indica SCTR melhor que o 12-1 com folga estatística.

| Amostra             | IC SCTR 20d | IC 12-1 20d | t da diferença 20d | IC SCTR 60d | IC 12-1 60d | t da diferença 60d |
| ------------------- | ----------: | ----------: | -----------------: | ----------: | ----------: | -----------------: |
| Todos os meses      |       0.030 |       0.031 |              -0.03 |       0.054 |       0.057 |               1.20 |
| SPY acima da MM200  |       0.067 |       0.036 |               1.07 |       0.095 |       0.063 |               0.36 |
| SPY abaixo da MM200 |      -0.154 |       0.007 |              -2.66 |      -0.148 |       0.027 |              -0.33 |

Significância (datas sem sobreposição, p unicaudal, BH a 10%):

| Hipótese           | IC médio |    t |      p | Aprovada no BH |
| ------------------ | -------: | ---: | -----: | -------------- |
| SCTR em 20 pregões |    0.030 | 1.09 | 0.1383 | não            |
| 12-1 em 20 pregões |    0.031 | 1.09 | 0.1384 | não            |
| SCTR em 60 pregões |    0.099 | 1.93 | 0.0268 | não            |
| 12-1 em 60 pregões |    0.047 | 0.79 | 0.2150 | não            |

## Veredito de H2 (critério fixado antes)

- **20 pregões:** IC do SCTR > IC do 12-1? não; SCTR aprovado no BH? não.
- **60 pregões:** IC do SCTR > IC do 12-1? não; SCTR aprovado no BH? não.
- **H2 REPROVADA.** Fica o momentum 12-1 como ordenador da camada 2.

Aprovar aqui não aplica nada na aba Decisões: só entra em modo sombra (docs/MODELO-UNICO.md, camada 5).
