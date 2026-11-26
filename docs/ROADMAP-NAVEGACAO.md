# Navegação em seções (12/10/2026)

Pedido do usuário: "muita aba, muita função sem clareza". Objetivo: alguém que abre o app pela primeira vez
entende para que serve cada parte e chega ao que importa (entrar / se proteger) em poucos toques.

## N1 (entregue): 16 abas → 5 seções por pergunta

| Seção         | Pergunta                                    | Sub-abas                                                                        |
| ------------- | ------------------------------------------- | ------------------------------------------------------------------------------- |
| Início        | O que olhar hoje?                           | (tela única: primeiros passos, hoje em 3 perguntas, mapa)                       |
| Mercado       | Como está o mercado agora?                  | Visão geral (ex-Painel), Notícias, Agenda, Fluxo                                |
| Carteira      | Como estão os meus investimentos?           | Posições, Risco, Rebalancear                                                    |
| Oportunidades | Onde entrar e quando?                       | Sinais de hoje (ex-Decisões), Quando entrar, Screener, Análise por ativo, Valor |
| Laboratório   | As regras funcionam? Os dados estão certos? | Simulador, Verificação, Mesa                                                    |

- `GROUPS`, `TAB_INFO` e `groupOf` em `assets/state.js`; ids das abas não mudaram (`?tab=`, avisos, comandos).
- Barra lateral e dock do celular mostram as 5 seções (sem menu "Mais"); cada seção lembra a última sub-aba.
- Sub-abas em pílulas no topo + uma frase "para que serve" (`subNavHtml` em `assets/ui.js`).
- Início (`assets/home-view.js`): primeiros passos com progresso, regime/carteira/oportunidades do dia, mapa do app
  e legenda dos sinais. Migração `prefsV: 6` abre o Início uma vez para todos.
- Saiu: arrastar para reordenar abas (com 5 seções fixas perdeu sentido). Teclas 1–5 trocam de seção.

## Próximas fases (sugestão, não iniciadas)

- N2: enxugar a Visão geral (hoje são ~12 blocos de cotação; deixar 4 e o resto recolhido).
- N3: "Sinais de hoje" com o resumo no topo e a tabela de regras recolhida; Quando entrar aberto pelo ativo.
- N4: unificar Análise por ativo com a página do ativo da busca (duas portas para a mesma pergunta).
- N5: Pares removida em 21/11/2026 (aviso de par abre o painel em Sinais de hoje). Avaliar se Valor e Mesa merecem ficar visíveis ou só na busca/Laboratório (medir uso pela telemetria).

## N6 (entregue 28/10/2026): Mercado → Mercados, com Offshore e Onshore

Pedido do usuário: no lugar das 6 sub-abas (Visão geral, Local, Macro, Notícias, Agenda, Fluxo), dois botões,
**Offshore** e **Onshore**, com a mesma visão e as mesmas funções dos dois lados.

| Lado                      | Visão geral | Macro     | Notícias             | Agenda                              | Fluxo    |
| ------------------------- | ----------- | --------- | -------------------- | ----------------------------------- | -------- |
| 🌎 Offshore (EUA e mundo) | `dash`      | `macro`   | `news` (região int)  | `calendar` (Forex Factory + Nasdaq) | `flow`   |
| 🇧🇷 Onshore (Brasil)       | `local`     | `brmacro` | `brnews` (região br) | `brcal` (Nasdaq, Brasil)            | `brflow` |

- Taxonomia em `assets/state.js`: `MARKETS` (lados, mesmas 5 telas na mesma ordem e com os mesmos nomes),
  `marketOf`, `isOnshore`; a seção `market` tem `segs: MARKETS`. Toda frase de `TAB_INFO` do mercado começa com
  "Offshore · " ou "Onshore · ". Título da página: "Mercados · Onshore · Agenda".
- `subNavHtml` (`assets/ui.js`) desenha dois níveis: os lados (🌎 Offshore · EUA e mundo | 🇧🇷 Onshore · Brasil) e,
  embaixo, só as telas do lado aberto. Cada lado lembra a última tela (`prefs.groupLast["market:on"]`).
- Ids antigos não mudaram (`?tab=dash`, `local`, avisos); comandos novos: `ON`/`OFF`, `BRMACRO`, `BRNEWS`,
  `BRCAL`/`COPOM`, `BRFLOW`.
- Onshore: Macro = nota do BCB/Focus (saiu da Visão geral) + divulgados × projeção; Agenda = `api/calendar?br=1`
  (Nasdaq, últimos 14 e próximos 10 dias, `normalizeNasdaqEcoBR`/`classifyBR`) + resultados/dividendos da B3;
  Fluxo = `brFlow` (preço × volume relativo por ação e setor, rotação contra o Ibovespa, estrangeiro pelo EWZ).
  Telas em `assets/br-views.js`. O Brasil fica fora da agenda Offshore e dos avisos push.

## Início v2 (19/11/2026)

Cockpit do dia em `assets/home-view.js` (partes puras testadas em `tests/home-view.test.js`):
sessão de NY com contagem (`sessionLine`), regime do dia + tendência MM200, pulso do mercado
(`pulseTiles`, variação = `p / pc`), **O que fazer agora** (`actionList`: proteger → agenda de alto impacto
em até 6 h → balanço de posição em 7 dias → entradas aprovadas sem veto), carteira (`portfolioBrief`:
patrimônio, dia, contra o S&P, resultado, fatias, maiores altas/quedas), fluxo do dia (`flowSummary`),
agenda 48 h (`agendaNext`) e manchetes (`topHeadlines`). Ativo: `data-home-sym` abre a página do ativo;
posição: `data-hold`. Mapa completo do app e legenda dos sinais ficam recolhidos no fim.

## Início v3 (19/11/2026): Measured Equilibrium

Direção visual em `docs/design/measured-equilibrium-philosophy.md` (prancha `measured-equilibrium.png`).
Hierarquia: 01 Leitura (frase do dia em Instrument Serif + pêndulo do regime, `pendulumAngle`) → 02 Números
(faixa de patrimônio/dia/contra o S&P/resultado) → 03 Agir + carteira (rosca `donutArcs`) → 04 Contexto (pulso
com mini-gráfico de 1 mês `sparkPath`, fluxo em barras divergentes, agenda em linha do tempo com marcador
"agora", manchetes) → 05 Navegar. Animações só na chegada à aba (`#view.enter`, classe `.hm-anim`), também no
modo "Leve"; respeitam `prefers-reduced-motion`. A agulha do pêndulo desliza ao novo regime com a tela aberta.
