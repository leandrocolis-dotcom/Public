# Estudo: Medo & Ganância da CNN no pêndulo (25/11/2026)

**Pergunta.** O alívio do Medo & Ganância (CNN) prevê alta do S&P 500 e acrescenta algo ao VIX, que o pêndulo já usa?

**Fonte.** Endpoint público do gráfico da CNN (`production.dataviz.cnn.io/index/fearandgreed/graphdata/<data>`,
grátis, sem chave, pede User-Agent e Referer de navegador; sem data responde 307). Histórico diário desde
04/01/2021 (1.481 pregões), nota ao vivo durante o pregão e os 7 componentes. SPY (ajustado) e ^VIX do Yahoo.
Script: `scripts/fear-greed-study.mjs` → `data/fear-greed-study.json`.

**Método.** Eventos de um por episódio (10 pregões de intervalo); retorno do SPY em 5, 10 e 20 pregões contra dias
quaisquer (base 20d: +1,11%, acerto 66%); p por sorteio de 5.000 conjuntos de dias ao acaso. Regressão do retorno de
20 pregões (janelas sem sobreposição) na variação de 5 dias do FG e do VIX juntos.

| Evento                             | n               | 20 pregões | excesso    | acerto  | p         |
| ---------------------------------- | --------------- | ---------- | ---------- | ------- | --------- |
| FG < 25 (medo extremo)             | 35              | +1,87%     | +0,76%     | 64%     | 0,14      |
| Alívio FG (mín. 5d ≤ 25 e +10 pts) | 28              | +1,27%     | +0,16%     | 67%     | 0,42      |
| Alívio VIX (máx. 5d ≥ 25 e −15%)   | 26              | +1,42%     | +0,31%     | 79%     | 0,35      |
| Alívio FG sem alívio do VIX        | 17              | +1,29%     | +0,18%     | 75%     | 0,43      |
| FG cruza 25 para cima              | 28              | +1,24%     | +0,13%     | 63%     | 0,44      |
| FG volta a 45 depois de < 25       | 17              | +1,58%     | +0,47%     | 71%     | 0,32      |
| **FG < 15 (medo profundo)**        | 13 (12 com 20d) | **+3,50%** | **+2,39%** | **83%** | **0,019** |

Correlação das variações de 5 dias FG × VIX: **−0,62** (o FG carrega o VIX como um dos 7 componentes). Com o VIX no
modelo, o coeficiente da variação do FG some (≈ 0).

**Conclusão.**

- O **alívio** (em 4 definições) não bate dias ao acaso em 2021–2026 e é quase o mesmo sinal do VIX: **não entra na
  nota do pêndulo** (a nota mede o regime agora; somar um índice redundante só dobraria o peso do VIX).
- O **medo profundo (< 15)** se destacou, mas com 12 casos completos e 9 hipóteses testadas não passa a correção de
  múltiplos testes (limite de Bonferroni ≈ 0,006). É um sinal **contrário** (comprar no medo), o oposto da leitura do
  pêndulo, por isso fica separado.
- **No app (modo sombra):** Início, embaixo do pêndulo: nota, faixa, ontem/1 semana/1 mês e, abaixo de 15, a leitura
  do estudo (`assets/fear-greed.js`, `api/yields?fg=1` com cache de 5 min na borda). Revisar quando houver mais
  episódios de medo profundo (refazer: `node scripts/fear-greed-study.mjs`).

Material educacional; não é recomendação de investimento.
