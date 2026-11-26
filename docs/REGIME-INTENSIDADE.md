# Intensidade do regime

Além do tipo (Risk-on, Risk-off, Misto, Estresse), o regime agora tem uma **nota de −100 a +100** e uma
**intensidade de 0 a 100 no sentido do regime**, numa escala de 5 níveis. A ideia é responder: "o vento a favor
é forte o bastante para entrar, ou é melhor esperar um momentum mais forte?".

Código: `assets/regime-strength.js` (puro). Usado em `regime()` (`assets/dash.js`, Mercados › Offshore) e
`brRegime()` (`assets/br.js`, Onshore). Aparece no cartão do topo ("Risk-on · Forte", intensidade x/100) e no
quadro Regime (barra, partes e o que fazer).

## Pêndulo ao vivo: o humor do mercado agora (23/11/2026)

O pêndulo é o item mais ao vivo do app: em qualquer horário, cada razão usa o **preço mais novo que existe naquele
momento**, sempre medido contra o último fechamento regular de NY (a referência do regime).

| Horário (NY)      | Ações/ETFs dos EUA                                 | Bolsas de fora                                       | VIX                           |
| ----------------- | -------------------------------------------------- | ---------------------------------------------------- | ----------------------------- |
| Pregão (9h30–16h) | preço do pregão                                    | Europa aberta até 11h30, depois o ETF do país (EZU…) | VIX ao vivo                   |
| Pré (4h–9h30)     | futuros (ES, NQ, RTY, ZB, ZN) ou pré-market do ETF | Europa aberta; Ásia do pregão que acabou             | futuros de VIX via VIXY (pré) |
| Pós (16h–20h)     | futuros ou pós-market do ETF                       | ETF do país em NY                                    | VIXY (pós)                    |
| Noite (20h–4h)    | futuros                                            | Ásia aberta (Tóquio, Hong Kong, Coreia)              | estimado pelo S&P (sem VIXY)  |
|                   | Emergentes                                         | EEM, Índia (Nifty 50), Brasil (EWZ), México (EWW)    |
| Fim de semana     | — (prévia pelo cripto, `weekend-pulse.js`)         | —                                                    | —                             |

- **Bolsa de fora sem dupla contagem** (`sinceNyClose`): a sessão local compara com o fechamento local anterior, que
  veio antes do fechamento de NY; o que o ETF do país já andou em NY depois disso sai da conta (Kospi −4,7% na
  segunda, depois de NY −3,6% na sexta → −0,9%). O pregão de referência do ETF sai da cotação dele.
- **VIX** (`impliedByVixEtf` em `offmarket.js`): o Yahoo não tem o futuro de VIX (VX=F); o VIXY carrega os futuros de
  curto prazo e negocia no pré e no pós (VIX ≈ 2× o VIXY; o de 3 meses 1,2×). Sem pré/pós do VIXY dos últimos 30 min,
  −3× o ES=F (−2× no de 3 meses). Estimado, não exato.
- **Pesos na janela de 1 dia** (`STRENGTH_W_LIVE`): amplitude 40%, força 40%, VIX 20%, sem médias de 20/50 pregões
  (longo prazo fica no pano de fundo MM200 + crédito; o histórico de 250 pregões só mede o desvio normal de um dia). Nas janelas de 5D/1M/3M seguem os pesos de sempre (30/25/30/15).
- **VIX com rumo**: na janela de 1 dia a parte de volatilidade soma nível, curva e o rumo do VIX agora (z da variação
  desde o último fechamento, peso 2 de 4): VIX alto e caindo forte melhora a leitura em vez de ficar travado no mínimo.
- **Janelas de horas** (botões 1h · 3h · 5h no seletor do pêndulo, ao lado de 1D/5D/1M/3M; `regimeOver` em
  `regime-history.js`): o humor só nas últimas 1, 3 ou 5 horas. Cada razão = preço agora × preço de N horas atrás
  (barras de 5 min com pré/pós; parado há mais de 45 min, o futuro ou o ETF do país), em desvios de um dia ×
  √(horas ÷ 6,5); mesmos pesos ao vivo. Só a tela: avisos e carteira seguem no regime do dia. Na janela 1D, a
  linha "Variação da nota · 1h · 3h · 5h" mostra quanto a nota do dia andou.
- **Fontes à vista**: embaixo da nota, "11 de 15 razões ao vivo · futuros, bolsas de fora abertas · VIX pelos
  futuros (VIXY)" (`feedLine`).
- Efeito: a nota anda mais com o mercado da hora; os avisos 🧭 e 🔄 (mesma conta) tendem a sair mais vezes.
  Fora do padrão: o VIX estimado pelo S&P repete o sinal do ES (não é fonte independente) até o VIXY abrir às 4h.

## Módulos (desde 24/11/2026)

O pêndulo tem **3 módulos**, cada um com nota própria de −100 a +100 (Início › detalhe do pêndulo e Mercados ›
Offshore › quadro Regime). Mesmas regras de horário do pêndulo ao vivo (pregão, pré/pós, futuros, bolsas de fora).

| Módulo                                | Grupos (peso igual dentro do módulo) | Itens                                                      |
| ------------------------------------- | ------------------------------------ | ---------------------------------------------------------- |
| Bolsas por região                     | EUA                                  | S&P 500 (SPY), Nasdaq 100 (QQQ), Russell 2000 (IWM)        |
|                                       | Europa                               | Euro Stoxx 50, DAX, FTSE 100                               |
|                                       | Ásia                                 | Nikkei 225, Hang Seng, Kospi, Taiex                        |
| Classes de ativos (risco × segurança) | Ações × títulos                      | SPY/TLT, QQQ/TLT                                           |
|                                       | Crédito                              | HYG/IEF, EMB/IEF                                           |
|                                       | Dentro das ações                     | XLY/XLP, IWM/SPY, RSP/SPY, EEM/EFA                         |
|                                       | Câmbio e commodities                 | cobre/ouro, AUD/JPY, dólar DXY (invertido)                 |
| VIX e vol                             | —                                    | VIX (nível), VIX ÷ VIX3m, rumo do VIX agora (peso 2), MOVE |

- **Pesos**: Bolsas e Classes pesam igual nas razões (peso da razão = 1 ÷ (módulos × grupos do módulo × itens do
  grupo)); VIX e vol entra pela parte "vol". Na janela 1D: Bolsas 40%, Classes 40%, VIX e vol 20%; em 5D/1M/3M
  a tendência (MM20/50) leva 30% e o resto segue 30/25/15 (`STRENGTH_W`).
- **Nota do módulo/grupo**: 50 × média de tanh(2·z) + 50 × média de tanh(z ÷ 2) (Bolsas, Classes); 100 × parte
  vol (VIX e vol). "Como a nota se forma" abre a nota em Bolsas + Classes (+ tendência) + VIX e vol, somando a nota.
- **MOVE** (vol de Treasuries, só o nível do último dado): tanh((90 − MOVE) ÷ 25).
- **Emergentes** (24/11/2026): pega o risco de emergentes. EEM, EWZ e EWW são ETFs de NY (pregão e pré/pós; à
  noite ficam fora da prévia); a Índia usa a própria bolsa (abre ~23h45 de NY), senão o INDA.
- **Bolsas de fora** (Europa, Ásia e Índia): preço da própria bolsa desde o fechamento local anterior, sem dupla contagem
  (`sinceNyClose`, ETF do país em `COUNTRY_ETF`: EZU, EWG, EWU, EWJ, EWH, EWY, EWT, INDA); fechada, o ETF do país em NY.
- **Tipo** (Risk-on ≥ 70%, Risk-off ≤ 30%): média das frações em alta de Bolsas e Classes. **Amplitude**: quantos
  dos 3 módulos estão do lado da nota. **Fora do padrão**: item que anda ≥ 1,5 desvio (`OUTLIER_Z`) contra a nota.
- **Prévia (pré/pós)**: só os itens com preço fora do pregão contam; S&P, Nasdaq e Russell pelos futuros (ES, NQ,
  RTY) ou pré/pós do ETF.
- Antes × depois (121 pregões de `data/flow.json`, só fechamentos): correlação 0,97, mesma faixa em 97 (80%),
  diferença média +0,4 ponto, máxima 19. Nos dois modelos, nota |≥ 20| acertou a direção do SPY 5 pregões depois
  em só 34% (a nota extrema tende a reverter em 5 dias): leitura do humor, não gatilho.

## Como andou o regime (botão embaixo do pêndulo)

Gaveta com a nota do pêndulo ao longo de **1h, 5h, 24h, 48h, 1 semana e 1 mês** (`assets/regime-history.js`,
puro; tela em `assets/regime-history-view.js`). Em cada instante vale a mesma regra do ao vivo: variação desde
o último fechamento regular de NY (`usRefDate`), barra própria do ativo e, parada há mais de 45 min, o futuro ou
o ETF do país (`priceAt`). 1h a 24h em barras de 5 min, 48h e 1 semana em barras de 30 min (`api/intraday`
em lote, 30 símbolos, pela central de barras), 1 mês nos fechamentos diários. O último ponto é sempre a nota da
tela.

- **Tendência**: média do primeiro quarto da janela × média do último quarto (a nota de 1 dia oscila muito de
  um ponto para o outro; comparar só as pontas enganava). ±10 pontos = intensificando / perdendo força; médias
  em lados opostos = virou de lado.
- **Permanência**: parte dos pontos da janela do mesmo lado de agora.
- Também mostra as notas dos 3 blocos (linhas tracejadas).

## Aviso de mudança de regime (🧭)

Push imediato (cron a cada minuto, também de madrugada enquanto os futuros negociam) quando a nota troca de faixa
ou ganha tração rumo à fronteira. Regras e limiares em `assets/mkt-regime-alerts.js` e `supabase/PUSH.md`.
Configurações › Avisos › "Regime do mercado" liga e desliga.

## Partes (cada uma de −1 a +1)

| Parte       | Peso | Como mede                                                                                                    |
| ----------- | ---- | ------------------------------------------------------------------------------------------------------------ |
| Amplitude   | 30%  | por razão tanh(2·z) (≈ ±1 a partir de 1 desvio, suave perto de zero); média ponderada                        |
| Força       | 25%  | por razão tanh(z ÷ 2), z = variação no horizonte ÷ desvio das variações de mesmo prazo (1 ano); sem trava    |
| Direcionais | 30%  | por razão: preço × MM20, preço × MM50, MM20 × MM50, inclinação da MM20 (5 pregões), cada um em tanh(desvios) |
| VIX e curva | 15%  | tanh((20 − VIX) ÷ 8) e tanh((0,95 − VIX÷VIX3m) ÷ 0,1); só EUA (no Brasil o peso é redistribuído)             |

**Nota contínua (20/11/2026).** Antes, amplitude e direcionais contavam só o sinal (degrau) e força e VIX travavam
em ±1; com o mercado andando, a nota ficava parada e só "pulava" quando uma razão trocava de lado. Agora todas as
partes são contínuas: a agulha do pêndulo usa a nota sem arredondar (`strength.raw`) e anda a cada pacote de
cotações; o número, as faixas e os avisos 🧭 seguem a nota inteira (`score`). Os blocos (EUA, mundo,
câmbio/commodities) usam a mesma regra. Antes × depois em 121 pregões de `data/flow.json`: correlação 0,99,
mesma faixa em 108 (89%), diferença média −0,3 ponto, máxima 12 (perto das fronteiras).

## Escala

| Intensidade | Nível       | Risk-on                                        | Risk-off / Estresse                       |
| ----------- | ----------- | ---------------------------------------------- | ----------------------------------------- |
| 80–100      | Muito forte | momentum amplo e confirmado: entrada a favor   | aversão forte: proteger, não abrir compra |
| 60–79       | Forte       | idem                                           | idem                                      |
| 40–59       | Moderada    | a favor, sem folga: entrar em parte e com stop | pressão firme: reduzir ou esperar         |
| 20–39       | Fraca       | apetite tímido: esperar momentum mais forte    | pressão leve: esperar definição           |
| 0–19        | Muito fraca | idem                                           | idem                                      |

Misto: a intensidade mostra para que lado o mercado pende; a orientação é esperar. Quando o tipo e a nota
apontam lados opostos (ex.: um dia de risk-on dentro de tendência de baixa), a intensidade vai a 0 e aparece
"contra a tendência".

## Checagem rápida (03/11/2026, `data/flow.json`, ago/2025 a nov/2026)

Retorno do SPY nos 5 pregões seguintes, pela nota do regime 1D: nota ≥ +40 → média +0,45%, acerto 65% (n = 37);
+15 a +40 → +0,20%, 51% (n = 98); neutro → +0,45%, 54% (n = 76). Com só 14 meses de um mercado em alta, a
amostra é curta e a relação não é monotônica: a escala é uma **leitura**, não um gatilho validado (modo sombra;
não entra na Decisão nem no aprendizado). Material educacional; não é recomendação de investimento.

## Velocidade do humor (24/11/2026)

Pedido do usuário: usar as janelas dentro de 1h para medir com que velocidade o humor muda.

- **Base única:** a nota do dia (`regimeAt`, barras de 5 min + preço ao vivo, referência de fechamento fixa). É a mesma
  trilha dos chips "Variação da nota" (em todas as janelas), dos avisos 🧭 e do radar de virada.
- **Trilha:** nota agora e 5, 15, 30, 45 e 60 min atrás → 5 trechos (0–5, 5–15, 15–30, 30–45, 45–60 min) em pontos por hora.
- **Leitura (`speedFrom`):** ritmo = variação em 60 min (pts/h); recente = últimos 15 min; antes = 15 a 60 min;
  aceleração = recente − antes. Parado se |ritmo| < 10 pts/h; virando se os últimos 15 min andam ≥ 10 pts/h contra o
  ritmo; acelerando/freando se a aceleração passa de ±10 pts/h; senão ritmo constante. Confiança = trechos no mesmo
  lado do ritmo (≥ 80% alta, ≥ 60% média).
- **Por que não a nota da janela curta:** testado em 24/11 com a mesma alta de preço: nota de 1h em 5 min = 39 e em
  60 min = 29. A nota é dominada pela amplitude (quantas razões sobem), que não depende do tamanho do movimento, então
  não separa rápido de lento.
- **Limite conhecido:** a nota do dia também satura pela amplitude: depois que todas as razões viram para o mesmo lado,
  o resto do movimento só entra pela força em desvios (uma alta linear de preço pode aparecer como "freando").
  Limiares de 10 pts/h sem backtest; modo sombra.

**Em minutos (25/11/2026, pedido do usuário: "o mercado pode virar muito rápido dentro de uma hora").** Substitui a
leitura por hora acima.

- **Trilha:** nota agora e 1, 3, 5, 10 e 15 min atrás → trechos 0–1, 1–3, 3–5, 5–10 e 10–15 min, em **pontos por
  minuto**. As barras são de 5 min, então 1 e 3 min vêm da trilha que o app grava a cada 10 s em qualquer aba
  (`pushTrail`/`trailAt` em `assets/regime-history.js`, últimos 20 min em `localStorage` `pendulo.moodTrail`, gravada
  pelo `tick` de `assets/app.js` e por `speedNow` em `assets/home-view.js`). 5, 10 e 15 min usam a trilha e, sem ela,
  as barras.
- **Leitura:** ritmo = variação em 5 min (pts/min); recente = último minuto; antes = 1 a 5 min. Sem o ponto de 1 min
  (app recém-aberto): recente = 0–5 min e antes = 5–15 min, com "· medindo" na faixa. Limiares: parado < 0,3 pt/min;
  acelerando/freando/virando ≥ 0,3 pt/min (0,3/min = 18/h, mais exigente que os 10/h antigos na escala de 1 h, mas
  medido em 5 min). Sem backtest; modo sombra.
- **Limite:** a trilha só existe com o app aberto (aba visível); fechado, não há como reconstruir o minuto a minuto
  porque o Yahoo só dá barras de 5 min nas razões.
