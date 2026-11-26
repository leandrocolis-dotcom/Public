# Roadmap: Quant Aberto (réplica aberta do Seeking Alpha Quant e do ProPicks)

> **Para o agente que continuar:** leia `docs/QUANT-ABERTO.md`. Siga da primeira fase `[ ]`. Antes de push:
> `npm run preload` (módulo novo), `npx prettier --write .`, `npm run lint`, `npm run format:check`, `npm test`.
> Só ações dos EUA. Modo sombra: nada vai para a aba Decisões sem ordem do usuário. Material educacional.

## Status

| Fase | Entrega                                                                                          | Estado |
| ---- | ------------------------------------------------------------------------------------------------ | ------ |
| Q0   | Engenharia reversa (fontes públicas) e especificação                                             | [x]    |
| Q1   | `assets/quant.js` (fatores, letras, nota 1–5, teto, saúde, Top 20, diário) + testes              | [x]    |
| Q2   | Coleta diária do S&P 500 (`scripts/update-quant.mjs`, `update-quant.yml`) → `data/quant.json`    | [x]    |
| Q3   | Calibração contra o SA (`scripts/quant-calib-study.mjs`): 27 ações, pesos a priori mantidos      | [x]    |
| Q4   | Card na aba Análise + bloco no detalhe da ação (`assets/quant-view.js`)                          | [x]    |
| Q4b  | Modelo v2: métricas alinhadas às listas do SA (área logada, conta gratuita)                      | [x]    |
| Q4c  | Backtest com o passado (`scripts/quant-backtest.mjs`): 175 mil notas ação-dia, balanços por data | [x]    |
| Q5   | Diário mensal fora da amostra (1ª foto 12/10/2026); veredito depois de 12 meses (out/2027)       | [ ]    |

## Ideias futuras (só com ordem do usuário)

- Recalibrar os pesos com um CSV exportado pelo usuário da tela de notas quant do SA (Premium), sem raspar o site.
- Ampliar o universo para S&P 400/600 (ações médias e pequenas), onde fatores costumam render mais.
- Alerta quando uma ação da carteira cair para Venda ou Venda forte (gatilho de saída), **só depois** do veredito.
- "Valor justo" estilo InvestingPro (média de modelos: DCF simples, múltiplos do setor, preço-alvo dos analistas).

## Registro de decisões

- 12/10/2026 (Q4c): backtest com o passado, sem esperar o diário. 353 fotos diárias × ~500 ações (175.927 notas),
  abr/2025–set/2026, balanços anual/trimestral só depois de publicados (+75/+45 dias), preço do dia. Sem revisões
  (sem histórico). Resultado: nota final sem poder de previsão (IC −0,008, t −0,5); faixas Compra forte ≈ Venda
  forte; Top 20 +49,6% vs SPY +44,9% no acumulado, mas −0,13%/21d em média (t −0,3) e −0,95% fora da amostra.
  Rentabilidade com IC negativo e significativo (−0,067, t −4,7): no período, empresas menos rentáveis subiram mais.
  Valor levemente positivo (0,025, t 1,1). Conclusão: não usar a nota como gatilho; período curto e de alta.

- 12/10/2026: Q0–Q4 entregues. SA bloqueou a coleta (CAPTCHA) depois de ~30 chamadas; não contornamos. R² 0,596 <
  0,6: pesos a priori mantidos (momentum 25, revisões 25, rentabilidade 20, valor 15, crescimento 15). Teto
  "Manter" confirmado (0/20). Momentum replicado (ρ 0,81).
- 12/10/2026: área logada do SA (conta gratuita) revelou as métricas de cada fator e as medianas do setor. Modelo v2
  alinhado a elas; diário passa a marcar a versão. Coleta em massa pela conta do usuário não foi feita (termos e risco).
