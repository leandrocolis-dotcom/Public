# Pêndulo no fim de semana

O pêndulo da Início (e a pílula flutuante) tem calibração contínua: no pregão usa o preço ao vivo; no
pré/pós e à noite, a prévia com futuros, câmbio e bolsas de fora (`regime()` em `assets/dash.js`). O buraco
era o fim de semana: do fechamento de sexta até domingo à noite nada do regime negocia, e a nota ficava parada
no último dado de sexta.

## Linha do tempo do fim de semana (horário de NY)

| Quando                   | O que negocia                                                                  | Como entra no pêndulo                                    |
| ------------------------ | ------------------------------------------------------------------------------ | -------------------------------------------------------- |
| Sexta 16h–20h            | Pós de SPY/QQQ, futuros até 17h                                                | Prévia normal (já existia)                               |
| Sexta 20h → domingo ~17h | **Só cripto** (Bitcoin, Ether; futuros de cripto da CME 24/7 desde 29/05/2026) | **Novo:** prévia pelo cripto (`assets/weekend-pulse.js`) |
| Domingo ~17h             | Câmbio (AUD/JPY, iene, DXY)                                                    | Prévia normal volta sozinha                              |
| Domingo 18h              | Futuros da CME (S&P, Nasdaq, Russell, ouro, cobre, petróleo, Treasuries)       | Prévia normal                                            |
| Domingo ~19h–21h         | Nova Zelândia, Austrália, Japão, Coreia, depois Hong Kong/China                | Bloco "Mundo" da prévia normal                           |

O vão é detectado por `weekendGap`: janela do fim de semana (`weekendWindow`) e nenhuma cotação nova de
ES=F, NQ=F, AUDJPY=X, JPY=X, SPY ou QQQ (incluindo pós) nas últimas 2 h.

## Proxies pesquisadas

| Proxy                                                               | Disponível no app?                                | Decisão                                                                                                                                                                                                                                        |
| ------------------------------------------------------------------- | ------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Bitcoin e Ether (spot, Yahoo)                                       | Sim (`BTC-USD`, `ETH-USD`, já no feed)            | **Usado.** Estudo com 20 criptos (Mourey, Shahrour e Șoiman, _Finance Research Letters_, 2025): queda do cripto no fds antecipa queda de Nasdaq, Russell e setores na segunda; alta não antecipa. Efeito mais forte depois de LUNA/FTX (2022). |
| Futuro de Bitcoin da CME (`BTC=F`, 24/7 desde mai/2026)             | Sim                                               | Redundante com o spot (a CME acompanha o spot 1 para 1); fica de fora.                                                                                                                                                                         |
| Índices "de fim de semana" da IG (Weekend Wall Street, US Tech 100) | Não (preço próprio da corretora, sem API pública) | Fora. São cotações da casa, não do mercado.                                                                                                                                                                                                    |
| Ouro tokenizado (PAXG)                                              | Sim                                               | Testado e rejeitado (sem efeito; `docs/ESTUDO-FIM-DE-SEMANA.md`).                                                                                                                                                                              |
| Volatilidade do cripto no fds                                       | Sim                                               | Testada e rejeitada (não antecipa direção nem tamanho do gap).                                                                                                                                                                                 |
| Ações tokenizadas no fim de semana                                  | Não                                               | Fora. Estudo da Bitquery (17 fds, 2026): 53% de acerto de direção, pior que "abre igual à sexta".                                                                                                                                              |
| Bolsas do Golfo (Arábia Saudita, Catar, domingo)                    | Parcial                                           | Fora. Andam com o petróleo, pouca ligação com o apetite a risco dos EUA. Tel Aviv passou a negociar de segunda a sexta em 2026.                                                                                                                |
| Câmbio, futuros e Ásia no domingo à noite                           | Sim                                               | Já entram na prévia normal assim que reabrem.                                                                                                                                                                                                  |

## Conta da prévia pelo cripto

1. Variação desde sexta 16h de NY: preço ao vivo ÷ barra de 30 min no fechamento de sexta (`api/intraday`, lote `long`).
2. z = log(1 + variação) ÷ (desvio diário dos últimos 90 pregões × √(252/365) × √dias corridos desde sexta).
3. z combinado: Bitcoin e Ether meio a meio (estudo: `docs/ESTUDO-FIM-DE-SEMANA.md`).
4. × correlação diária Bitcoin × SPY dos mesmos 90 pregões (mínimo 0): calibra sozinho quando o cripto se descola da bolsa.
5. Assimetria do estudo: alta pesa `UP_W` = 0,25; queda pesa 1.
6. Nota = 100 · tanh(z efetivo), de −100 a +100, nas mesmas faixas do pêndulo.

Queda forte (z combinado ≤ −1,5σ) acende um aviso: no estudo de 2017–2026 a segunda abriu em média −1,0% e fechou em queda 71% das vezes. A prévia é da **abertura** de segunda: na base limpa o cripto não antecipou o fechamento.

## Na tela

- Agulha principal = prévia pelo cripto; agulha clara = nota de sexta.
- Título "O mercado está … (prévia do fim de semana)"; pílula flutuante com a marca "fds".
- Detalhe: Bitcoin e Ether desde sexta (variação e σ), blocos de sexta, correlação e pesos.
- **Hora da medição** embaixo da nota, sempre (Brasília): "medido sáb 21/11 17:21 · fds". Nas janelas 5D/1M/3M: "fechamentos até dd/mm".

Leitura em modo sombra (não gera aviso de mudança de regime). Material educacional, não é recomendação.
