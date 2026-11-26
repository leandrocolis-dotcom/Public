# Radar de virada do regime (21/11/2026)

Pedido do usuário: opera alavancado, em trades curtos e grandes; a reversão do movimento no **pré-mercado e no
pós-mercado** é decisiva. O app precisa mostrar, com matemática sobre os dados, (1) quando o regime está com
**tendência de mudança** e (2) quando a **mudança se fortaleceu**, com alerta muito claro (notificação e tela).

## Onde aparece

| Lugar                                              | O quê                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| -------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Início, **dentro do pêndulo** (leitura integrada)  | O pêndulo desenha o próprio balanço por dentro da escala: perna anterior tracejada (do começo ao topo/fundo), volta colorida com seta até a agulha (amarela na tendência, vermelha/verde na confirmada, pontilhada se não confirmou) e marca "topo 11:05". Anel pulsando no peso enquanto há virada. Embaixo da nota, faixa com estágio, força 0–100 (⚠ 40, ‼ 70) e a ação; no detalhe ao lado, linha das últimas 3 h e critérios (✓ / ◐ / ·). A perna é deslocada para terminar na agulha. Desligado no fim de semana (agulha vira a prévia pelo cripto). |
| Todas as abas                                      | Faixa de alerta (⚠ amarela na tendência; ▼ vermelha / ▲ verde pulsando na confirmada). Toque abre a Início, × fecha aquela perna.                                                                                                                                                                                                                                                                                                                                                                                                                          |
| Pêndulo flutuante                                  | Selo "⚠ virada?" ou "▼/▲ virada"; borda pulsa na confirmada.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| Push (app fechado) e aviso do sistema (app aberto) | 🔄 VIRADA DO REGIME · título com sentido e sessão. A confirmada fica na tela até tocar e vibra forte; tendência e confirmada da mesma perna usam a mesma tag (a nova substitui a antiga). Preferência própria: Configurações › Avisos › "Virada do regime" (`reversal`).                                                                                                                                                                                                                                                                                   |

## A conta (`assets/regime-reversal.js`, puro; o mesmo código no app e no push)

1. **Trilha**: nota do pêndulo a cada 5 min nas últimas 3 h por `regimeAt` (barras de 5 min com pré/pós + preço
   ao vivo; ativo parado há > 45 min usa o futuro/ETF do país), com o **fechamento de referência fixo** no de
   agora (`refIdx`), para não haver salto artificial às 16h quando a referência muda. Cada ponto leva o preço do
   SPY (ou ES=F aplicado sobre ele).
2. **Ruído σ**: desvio absoluto mediano das variações de 5 min × 1,4826 (piso 1 ponto). Todos os limites andam
   com σ: no pré/pós nervoso o radar pede mais movimento; no pregão calmo, menos.
3. **Médias**: EMA de 3 barras (≈ 15 min) e de 12 barras (≈ 60 min). Nível de agora = meio a meio entre a nota
   crua e a EMA rápida (rápido sem seguir um ponto só).
4. **Velocidade**: inclinação de mínimos quadrados dos últimos 30 min (pontos/h) e estatística t.
5. **Perna anterior**: zigue-zague na EMA rápida (pivô a cada recuo ≥ max(5, 2σ)). Virada = perna ≥ max(10, 4σ);
   sem perna (nota de lado) vira **arranque**, medido do começo da arrancada (só vale se começou há ≤ 1 h e saiu
   de 30 min de lado).
6. **Força 0–100** = 25 × devolução (% da perna; no arranque, pontos ÷ limite de confirmação) + 20 × |t|/4 + 15 ×
   cruzamento das médias (em 2σ) + 15 × persistência (variações no sentido novo, das últimas 6) + 15 × blocos
   virando junto (EUA, mundo, câmbio/commodities) + 10 × SPY desde o extremo (cheio em 0,4%).

| Estágio                | Regra                                                                                                                                                                          |
| ---------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| ⚠ Tendência de mudança | devolução ≥ max(5, 2σ) e ≥ 25% da perna (arranque: ≥ max(8, 3σ) pontos); velocidade no sentido novo com \|t\| ≥ 2; extremo nas últimas 2 h; força ≥ 40                         |
| ‼ Mudança confirmada   | tudo acima + força ≥ 70; devolução ≥ 50% (arranque: ≥ max(15, 5σ)); EMA 15 min cruzou a de 60 min; ≥ 4 de 6 variações no sentido novo; ≥ 2 de 3 blocos virados                 |
| ↩ Não confirmou        | houve tendência/confirmação nos últimos 45 min e a nota passou do extremo daquela perna. Se já há uma virada no sentido oposto, o aviso dela traz "↩ A virada … não confirmou" |

Avisos: um por estágio e perna (extremo arredondado a 45 min) por dia de NY (`rev:w|c|f:<dia>:<up|dn>:<bloco>`).

## Limites honestos

- **Sem estudo fora da amostra.** As barras de 5 min só cobrem 2 pregões (não há 10 anos de intraday na base),
  então a regra foi calibrada por desenho, não por backtest. Leitura em **modo sombra**: vale como alerta de
  atenção, não como gatilho testado (regra 3 de `docs/OBJETIVO.md`).
- Confirmação custa atraso: com barras de 5 min, a tendência sai ~25–30 min depois do extremo e a confirmada
  ~45 min. Para virada de minutos, o radar chega depois do primeiro movimento.
- Pré/pós e noite têm pouca liquidez: o σ maior evita parte dos falsos sinais, mas não todos.
- Próximo passo: gravar cada aviso com o SPY na hora e medir SPY +30/+60/+120 min depois (diário próprio), para
  decidir em ~3 meses se a regra ganha peso ou muda.

Material educacional; não é recomendação de investimento.
