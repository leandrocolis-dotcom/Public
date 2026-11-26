# Velocidade do fluxo

Fluxo › Rotação relativa › bloco **Velocidade do fluxo**: quanto e com que pressa cada ativo está
girando, além da direção. Código puro em `assets/rot-intraday.js` (`headSpeed`, `typicalSpeed`,
`speedBoard`, `SPEED_LEVELS`); desenho em `assets/flow-view.js` (`drawSpeed`). Leitura em modo sombra:
não entra na Decisão nem em avisos.

## Por que não "pontos de preço por minuto"

- US$ 1/min num ativo de US$ 500 é pouco e num de US$ 20 é muito: preço em dólares não se compara entre
  ativos (nem com moedas e juros).
- Num dia agitado tudo anda rápido junto. O que interessa ao fluxo é quem anda **mais rápido que o grupo
  contra o benchmark**.

## Como mede

No próprio plano da rotação (força relativa × momento):

| Medida                | Definição                                                | Unidade                                                                                                     |
| --------------------- | -------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| Força /h (ou /pregão) | variação da força relativa nos 2 últimos trechos ÷ tempo | pontos por hora (intraday) ou por pregão (diário); 1 ponto ≈ 1% de desempenho contra o benchmark, suavizado |
| Momento /h            | variação do momento no mesmo trecho                      | aceleração (▲) ou freio (▼)                                                                                 |
| Intensidade           | distância percorrida no gráfico ÷ ritmo típico           | múltiplo da mediana de todos os trechos do grupo na janela                                                  |

- Os 2 últimos trechos tiram o ruído da barra em formação; no play, a cabeça deslizante (`partial`) não conta.
- Tempo real entre pontos (`t`) no intraday: o último trecho, mais curto, não infla a velocidade.
- Níveis: lento < 0,5x · normal 0,5x a 1,5x · rápido ≥ 1,5x · muito rápido ≥ 3x.

## No gráfico da rotação

- Anel em volta da cabeça de quem gira rápido: 1 anel = rápido (≥ 1,5x), 2 anéis = muito rápido (≥ 3x);
  o raio cresce com o múltiplo.
- O múltiplo aparece ao lado do nome ("América Latina 7,0x"); lento e normal ficam sem marca, para não poluir.
- A dica (passar o mouse na cabeça) mostra intensidade, nível e força por hora/pregão.
- Tudo acompanha o ▶ Play: a velocidade é a do quadro mostrado.

## Como usar

- Liderando ou Ganhando força **e** rápido/muito rápido = rotação com convicção (o tema está sendo
  comprado agora). Lento no mesmo quadrante = posição que se mantém, sem pressa.
- Perdendo força ou Atrasado e rápido com força ▼ = saída acelerada: a leitura de "deixar de perder".
- Ruído intraday é alto: use como leitura, confirme com o gatilho da aba Decisões.

## Próximo passo

Medir se "rápido" antecede retorno: registrar a intensidade por tema no estudo da liderança
(`docs/LIDERANCA.md`) e só depois pensar em usá-la como critério de confiança.

## O que o estudo mostrou (05/11/2026)

Ver `docs/ESTUDO-VELOCIDADE.md`: entrar no que ganha tração rápido quase não tem vantagem (só o muito rápido em
Liderando, em 10 pregões, e sem significância); short no que acelera para baixo perde; queda muito rápida em
Perdendo força tende a repicar (hipótese em teste no diário). Pré, pregão e pós entram no diário do Simulador e
aparecem na Watchlist.
