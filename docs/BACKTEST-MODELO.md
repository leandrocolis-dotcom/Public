# Backtest do modelo novo (12/10/2026)

`scripts/model-backtest.mjs` → `data/model-backtest.json` (cron diário). 26964 simulações: cada gatilho de entrada em 920 ativos, 2025-08-04 a 2026-10-05, com o contexto do próprio dia (FRED com 1 mês de atraso, inclinação do setor só com meses anteriores). Retorno em excesso sobre o SPY; t por dia, sem sobreposição. Metade final (2026-03-05+) = fora da amostra.

| Filtro                                                         | 21d média | acerto | t     | n     | fora da amostra média | t     |
| -------------------------------------------------------------- | --------- | ------ | ----- | ----- | --------------------- | ----- |
| Todos os gatilhos de entrada (como hoje)                       | -1.04%    | 45.42% | -2.73 | 23835 | -1.08%                | -1.80 |
| + técnica a favor (preço acima da MM200)                       | 0.12%     | 48.22% | -1.76 | 9131  | -0.33%                | -1.25 |
| + S&P acima da MM200                                           | -0.98%    | 46.32% | -2.31 | 21682 | -0.96%                | -1.41 |
| + setor favorecido no regime macro                             | -0.37%    | 48.45% | -1.08 | 7942  | -0.54%                | -0.83 |
| + crédito sem estresse (spread HY não abriu > 0,3 p.p. no mês) | -1.10%    | 45.77% | -1.59 | 21713 | -1.19%                | -0.40 |
| Modelo completo: técnica + S&P + macro + crédito               | 0.00%     | 49.93% | -2.16 | 2898  | 0.31%                 | -0.00 |
| Gatilhos que o modelo rejeitaria                               | -1.18%    | 44.80% | -3.06 | 20937 | -1.28%                | -2.09 |

## Leitura

- Os gatilhos de entrada atuais, sozinhos, **perderam para o SPY** (−1,0% em 21 pregões, t −2,7). A maioria é recuo/fraqueza de curto prazo.
- O filtro do modelo (técnica + S&P + macro + crédito) não cria vantagem própria: leva a média para ~0 e +0,3% fora da amostra (t ≈ 0). O valor está em **descartar**: os gatilhos rejeitados perderam −1,2% (t −3,1).
- Por regime: estagflação foi o pior (−8,5%, amostra pequena); desaceleração −1,3%.
- Conclusão prática: usar o modelo como **veto** (não entrar quando ele rejeita), não como gatilho de compra. Sem custos. Material educacional.
