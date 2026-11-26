# Estudo: a velocidade do fluxo prevê alguma coisa?

Pergunta do usuário (05/11/2026): ativo que **ganha tração rápido** continua subindo (vale entrar)? O que
**acelera para baixo** continua caindo (vale o short)? E isso vale também no **pré e no pós-mercado**?

- Estudo retroativo: `scripts/speed-study.mjs` → `data/speed-study.json` (roda todo dia no workflow `train-model.yml`).
- Diário fora da amostra (o que decide): `scripts/train-speed.mjs` → `data/speed-journal.json` e `data/speed-model.json`.
- Funções puras: `assets/speed-learn.js` (testes em `tests/speed-learn.test.js`). Tela: Simulador › 🧠 Aprendizado ›
  ⚡ Velocidade do fluxo (`assets/speed-view.js`). Watchlist: colunas Pré / Pregão / Pós.

## Método

- **Velocidade** (ver `docs/VELOCIDADE-FLUXO.md`): distância percorrida no gráfico de rotação (força × momento contra o
  S&P 500) nos 2 últimos trechos ÷ ritmo típico do universo naquele dia. Gatilho = **rápido** (≥ 1,5x) ou **muito
  rápido** (≥ 3x); sentido pela força: subindo → compra, caindo → short.
- **Base**: `data/hist`, 928 ações e ETFs dos EUA, 07/03/2025 a 03/11/2026 (≈ 413 pregões), janela de 8 semanas
  (como Fluxo e Watchlist), só com os dados disponíveis em cada dia.
- **Medida**: as mesmas regras do aprendizado 2.0 (`assets/learner.js`): resultado em R (stop 2,5 ATR, custo por
  perna), **excesso sobre a média do universo** no mesmo dia, cada dia = uma observação, faixa de 90%,
  Benjamini-Hochberg entre as lógicas (✓BH). Entre parênteses, o retorno simples acima do universo, no sentido da
  operação. Um gatilho por ativo e lógica a cada 5 pregões.

## Resultado (prévia: universo de hoje, com viés de sobrevivência)

| Gatilho                                                 | 1 pregão                          | 5 pregões                         | 10 pregões                            |
| ------------------------------------------------------- | --------------------------------- | --------------------------------- | ------------------------------------- |
| Força subindo rápido (≥1,5x) → compra                   | −0,010R (+0,01%) [−0,019; −0,000] | −0,001R (+0,28%) [−0,020; +0,017] | −0,002R (+0,53%) [−0,028; +0,024]     |
| Força subindo muito rápido (≥3x) → compra               | −0,011R (+0,00%) [−0,025; +0,003] | +0,003R (+0,31%) [−0,025; +0,031] | +0,031R (+0,91%) [−0,008; +0,070]     |
| Força caindo rápido (≥1,5x) → short                     | −0,017R (−0,09%) [−0,026; −0,008] | −0,022R (−0,23%) [−0,041; −0,003] | −0,022R (−0,42%) [−0,044; +0,001]     |
| Força caindo muito rápido (≥3x) → short                 | −0,011R (−0,11%) [−0,024; +0,003] | −0,032R (−0,49%) [−0,058; −0,005] | −0,040R (−0,79%) [−0,075; −0,004]     |
| Queda muito rápida em Perdendo força → compra (repique) | −0,001R (+0,03%) [−0,021; +0,018] | +0,045R (+0,61%) [+0,004; +0,086] | +0,091R (+1,54%) [+0,033; +0,150] ✓BH |

Por quadrante (10 pregões, excesso em R):

| Gatilho                                   | Liderando               | Ganhando força          | Perdendo força          | Atrasado                |
| ----------------------------------------- | ----------------------- | ----------------------- | ----------------------- | ----------------------- |
| Força subindo rápido (≥1,5x) → compra     | +0,008 [−0,025; +0,041] | −0,033 [−0,067; +0,002] | –                       | –                       |
| Força subindo muito rápido (≥3x) → compra | +0,050 [−0,001; +0,102] | +0,012 [−0,044; +0,069] | –                       | –                       |
| Força caindo rápido (≥1,5x) → short       | –                       | –                       | −0,045 [−0,078; −0,012] | +0,003 [−0,022; +0,027] |
| Força caindo muito rápido (≥3x) → short   | –                       | –                       | −0,107 [−0,157; −0,057] | +0,013 [−0,028; +0,055] |

Por regime (10 pregões): up-fast: alta +0,031 (286 dias), baixa −0,190 (13 dias) · up-vfast: alta +0,067 (283 dias), baixa −0,162 (13 dias) · dn-fast: alta −0,027 (286 dias), baixa −0,065 (13 dias) · dn-vfast: alta −0,038 (283 dias), baixa −0,037 (13 dias) · rev-pf: alta +0,115 (256 dias), baixa −0,186 (10 dias)

## Conclusões

1. **Entrar no que ganha tração rápido: quase nada de vantagem.** Em 1 a 5 pregões o excesso é zero. Em 10
   pregões, só o **muito rápido (≥ 3x)** dá algo (+0,031R, +0,9% acima do universo), sem passar na correção de
   testes múltiplos; melhor em **Liderando** (+0,050R) e com o S&P acima da MM200. Velocidade sozinha **não** é
   gatilho de compra; no máximo confirma uma entrada que outra regra já pediu, em ativo que já lidera.
2. **Short no que acelera para baixo: perde.** Todas as versões dão excesso negativo para o short (−0,02R a
   −0,04R; −0,5% a −0,8% em 5 a 10 pregões). Quem cai rápido tende a devolver parte da queda. **Não operar short
   por velocidade.**
3. **O padrão mais forte é o oposto do short: repique.** Queda **muito rápida** em ativo ainda em **Perdendo
   força** (força acima de 100, só perdendo fôlego) rende **+0,091R (+1,5% acima do universo) em 10 pregões**, faixa
   de 90% toda positiva, passa no BH; fraco em 1 pregão (o repique leva dias). Em Atrasado não há efeito.
   **Cuidado**: a hipótese nasceu olhando esses dados; por isso entrou no diário como lógica separada
   ("rev-pf", compra) e só vale se o diário fora da amostra confirmar.
4. **Regime de baixa**: só 10 a 13 dias com o S&P abaixo da MM200 no período; tudo inconclusivo ali (e pior).
5. **Pré e pós-mercado**: não há histórico intraday longo (o Yahoo guarda poucos dias de barras de 5 min). As
   sessões entram no **diário a partir de 05/11/2026**: velocidade no fim do pré (9h30 de NY), do pregão (16h) e do
   pós (20h), entrada no preço daquele momento e saída no fechamento do pregão seguinte. Com 30+ dias, o
   Simulador diz se a tração do pré/pós continua.

## Como o Simulador aprende daqui para frente

- Lógicas (diário próprio, sem mexer no modelo principal nem nos critérios do modelo final): fechamento
  (`spd`: up/dn × rápido/muito rápido + repique, 10 pregões) e sessões (`ispd`: pré/pregão/pós × up/dn ×
  rápido/muito rápido, 1 pregão).
- Os 60 pregões anteriores foram reconstruídos como **prévia** (`bf: 1`): aparecem, mas não aprovam nada.
- Aprovação: 30+ dias fora da amostra, excesso médio positivo e BH; eliminação: excesso ≤ 0 com 30+ dias.
- Modo sombra: nada muda na aba Decisões nem nos avisos até o usuário pedir.

Material educacional; não é recomendação de investimento.
