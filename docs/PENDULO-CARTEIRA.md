# Pêndulo da carteira (20/11/2026)

Cartão próprio na Início, logo abaixo do pêndulo do mercado. **Não entra na nota do regime**: o pêndulo do mercado
segue igual; o da carteira só lê a nota dele para saber onde deveria estar. Motor puro em `assets/port-pendulum.js`
(testes em `tests/port-pendulum.test.js`), montado em `assets/views.js` (`portPendNow`) e desenhado em
`assets/home-view.js` (`portPendHtml`). Leitura educacional, modo sombra; não é recomendação.

## Lógica

| Parte                   | Como mede                                                                                                              |
| ----------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| Postura (agulha)        | 50 × beta líquido contra o S&P (beta de 1 ano, `portfolioBias`); mesma escala e faixas do mercado                      |
| Alvo (agulha tracejada) | beta-alvo = 0,7 + 0,5 × nota do regime ÷ 100, de 0,2 (defesa forte) a 1,2 (risco forte); postura-alvo = 50 × beta-alvo |
| Alinhamento (50%)       | 1 − distância ÷ 50 pontos (1 beta de distância = zero)                                                                 |
| Assimetria (30%)        | captura de alta − captura de queda contra o S&P, 63 pregões, pesos de hoje (±30 p.p. = nota cheia ou zero)             |
| Alfa de hoje (20%)      | variação da carteira − beta × variação do S&P (±1% = nota cheia ou zero)                                               |

Sinergia 0 a 100: 70+ em sintonia, 45–69 parcial, abaixo de 45 fora de sintonia. Fora da folga (15 pontos = 0,3
de beta), o cartão diz quanto de exposição "de S&P" mover para alinhar: |beta − beta-alvo| × patrimônio.

Por que um beta-alvo e não a nota do mercado direto: na defesa a nota é negativa, o que mandaria ficar vendido.
Para carteira comprada, defesa = pouca exposição (beta baixo), não aposta contra.
