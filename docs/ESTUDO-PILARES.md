# Estudo de pesos dos pilares (12/10/2026)

Pedido do usuário: o Simulador acumula a assertividade de cada análise (técnica, gráfica, fundamentalista, notícias…)
e distribui o peso de cada uma por essa assertividade, com testes diários em segundo plano.

## Como foi feito

- Base: `data/hist/*.csv` (~2 anos, 920 ativos dos EUA) + **novo** `data/fund-hist.json` (LPA e receita trimestral e
  anual por data, Yahoo, `scripts/fetch-fund-hist.mjs`; vale 45/75 dias depois do fim do período, sem olhar o futuro).
- `scripts/pillar-study.mjs` (Fama-MacBeth): em cada pregão, regressão cruzada do retorno futuro em excesso nos
  z-scores dos pilares. **1.722 testes** = pregões × horizontes (5 e 21) × universos (todos, ações, ETFs).
- Peso = coeficiente médio dos pilares com |t| ≥ 1,5 (t sem sobreposição), normalizado. Fora da amostra: estima nos
  60% primeiros pregões, mede nos 40% finais.
- Roda todo pregão no cron `train-model.yml` → `data/pillar-weights.json`; exibido em Simulador › 🧠 Aprendizado.

## Resultado (21 pregões, bps de retorno em excesso por 1σ)

- **acoes|21**: `Y(21d, bps) = +147.0·z_tec −58.6·z_graf +1.7·z_mom +5.1·z_rev −3.3·z_volu −94.3·z_lowvol +19.3·z_ep −1.1·z_growth`  
  pesos: tec 49%, graf -20%, lowvol -31% · fora da amostra IC 0.050 (t 0.41)
- **todos|21**: `Y(21d, bps) = +261.2·z_tec −44.4·z_graf −58.7·z_mom +19.8·z_rev +6.5·z_volu +37.0·z_lowvol`  
  pesos: tec 100% · fora da amostra IC 0.002 (t -0.29)
- **etfs|21**: `Y(21d, bps) = +313.6·z_tec +9.6·z_graf −120.0·z_mom +19.2·z_rev +5.2·z_volu +111.2·z_lowvol`  
  pesos: tec 100% · fora da amostra IC 0.031 (t -0.01)

## Leitura crítica

- **Técnica (preço vs. MM200) é o único pilar estável** (t ≈ 2,3–2,6 em 21 pregões): ativos acima da média de 200 dias
  seguiram melhores.
- **Gráfica (posição na faixa de 52 semanas) saiu negativa nas ações** quando controlada pela técnica: as duas medem
  tendência e são correlacionadas; a gráfica vira "já subiu demais".
- Momentum 6-1, volume, lucro/preço e crescimento: **sem sinal estável** em 2 anos (|t| < 1,5).
- **Fora da amostra nenhum modelo foi significativo** (|t| do IC < 2). Os pesos são hipótese, não vantagem provada.
  Dois anos com um só regime (alta) é pouco; o cron diário vai acumulando.
- **Notícias e analistas ficam de fora** por falta de histórico por data na fonte gratuita; entram quando o diário
  tiver 6 meses.
- Modo sombra: nada muda na nota da Análise nem na Decisão sem ordem do usuário.
