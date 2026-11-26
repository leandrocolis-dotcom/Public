# Pêndulo: mapa da arquitetura

App estático (sem build) + funções na Vercel + Supabase. Leia antes de mexer em fluxo de dados.

## Camadas

| Camada           | Onde                                                                                              | O que faz                                                                                                                                                                                                                                                                            |
| ---------------- | ------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Front (PWA)      | `index.html`, `assets/*.js`, `sw.js`                                                              | ES modules puros; `app.js` orquestra carga, recálculo e render. Service worker rede-primeiro.                                                                                                                                                                                        |
| Estado           | `assets/state.js`                                                                                 | `state` único + `prefs` persistidas em localStorage. `hooks.render()` re-renderiza a aba atual.                                                                                                                                                                                      |
| Visões           | `assets/*-view.js`, `views.js`, `contexts.js`                                                     | Funções puras que recebem um contexto e devolvem HTML; eventos em `events.js`.                                                                                                                                                                                                       |
| Cálculo          | `engine.js`, `signals.js`, `ta-*.js`, `fa.js`, `analysis-data.js`, `offmarket.js`, `simulator.js` | Puras e testadas (`tests/`). Simulador: refaz os gatilhos da aba Decisões no histórico + diário local.                                                                                                                                                                               |
| Dados publicados | `data/*.json`                                                                                     | Gerados pelos crons do GitHub Actions (`update-prices.yml`, notícias, fundamentos).                                                                                                                                                                                                  |
| API (Vercel)     | `api/*.js`                                                                                        | Proxies com prazo (`_http.js`): cotações (Yahoo → spark → Nasdaq), histórico, intraday, notícias, juros, análise, perfil, verificação, `push-alerts` (só cálculo).                                                                                                                   |
| Nuvem            | Supabase `iufliktjawnfawerwvtg`                                                                   | Login + carteira (RLS), push (`pendulo_push_*`), erros do app (`pendulo_client_errors`).                                                                                                                                                                                             |
| Tempo real       | Edge Function `quotes-feed` + `pg_cron` + Realtime                                                | A cada 15 s (pré, pregão e pós) / 1 min à noite (futuros): busca direto no Yahoo com o `api/quotes.js` empacotado (`quotes.bundle.js`, `npm run build:feed`; sem chamar a Vercel) (universo + carteiras da nuvem) e transmite no canal `pendulo-quotes`. App: `assets/live-feed.js`. |
| Push             | Edge Function `push` + `pg_cron`                                                                  | A cada 10 min: lê aparelhos/carteiras, pede `/api/push-alerts`, envia Web Push. Ver `supabase/PUSH.md`.                                                                                                                                                                              |

## Ciclo de atualização (front)

1. `load()` busca em paralelo: cotações ao vivo (sempre), histórico publicado (a cada 10 min ou Recarregar), histórico da carteira.
2. `rebuild()` aplica o modo On/Off (`offmarket.js`) e recalcula snapshot, sinais e carteira, sem rede.
3. `render()` desenha só a aba ativa. Feeds (notícias, juros, fundamentos) têm ritmo próprio em `feeds.js`.
4. Tempo real: `live-feed.js` assina o canal público `pendulo-quotes` (Supabase Realtime, Broadcast) com o app na tela e
   algo negociando (pré, pregão, pós ou futuros à noite, `feedSession`). Cada pacote entra em `applyFeed()` →
   `rebuild()` → `render()` sem rede. Não há mais busca minuto a minuto: com o canal no ar, `load()` só roda a cada
   10 min (histórico publicado, extras da carteira); se o canal cair ou ficar mudo (90 s), a reserva aperta para 2 min
   no pregão e 5 min no pré/pós até ele voltar (`STEPS` em `refresh.js`). O pacote do canal é enxuto (sem 52 semanas,
   médias de volume, valor de mercado e nome: ficam da busca normal).
5. Fim de semana: nada roda; a busca de reserva dorme até o próximo pré-mercado (`refresh.js`).
6. Redesenho em duas velocidades (`assets/app.js`): ação do usuário (toque, digitação) desenha na hora; o que chega de
   carga em segundo plano (`hooks.render()`: cotações do universo, varredura, análises, matriz de retornos) é agrupado
   em 1 redesenho a cada ~350 ms no máximo, e nada roda com o app escondido (ao voltar, `visibilitychange` redesenha).
   `hooks.renderNow()` força o imediato. O redesenho preserva campo em edição (texto, cursor, foco) e menus `<details>`
   abertos. Tabelas grandes (Sinais de hoje → 🌐 Todas, ~920) desenham 60 linhas e trazem mais ao rolar.
   Na mesma aba, o HTML novo (gerado inteiro, a partir do estado) é aplicado só nas diferenças (`assets/morph.js`):
   resultado idêntico à troca completa, mas uma mudança de preços custa ~5 ms em vez de ~16 ms. Abas com gráfico
   (`<canvas>`) continuam com a troca completa (o Chart.js guarda estado no elemento).
7. Mercado inteiro: decisão do universo pré-calculada no fechamento (`data/market-scan.json`); cotações do universo em
   blocos estáveis de 60 (`stableLots`, cache de borda 60 s + SWR), um bloco por vez (Yahoo responde 429 em rajada);
   correlação com a carteira a partir de `data/returns.json` (120 pregões × ~920, gerado à noite por
   `scripts/build-returns.mjs`), calculada no aparelho e guardada até a carteira ou a matriz mudar.

## Vigia de regime da carteira

- Regras puras em `assets/regime-rules.js` (decisão rebaixada, perda da MM200, médio prazo desfavorável).
- App aberto: `assets/regime-watch.js` (memória do pregão anterior no aparelho; faixa laranja, linha no topo, aviso).
- App fechado: `regimeAlerts` em `scripts/lib/push-alerts.mjs`, chamado por `api/push-alerts.js` (Edge Function `push`),
  compara a varredura do fechamento anterior e a MM200 de ontem com o estado de agora. 1 aviso por ativo por dia.

## Aprendizado do modelo (Simulador)

- Todo pregão às 22:50 UTC, `train-model.yml` roda `scripts/train-model.mjs`: refaz a aba Decisões nos ativos do Pêndulo + carteira e
  watchlists da nuvem (`pendulo_portfolio`, `pendulo_watchlists`; segredo `SUPABASE_SERVICE_ROLE_KEY` no GitHub), grava os gatilhos do dia
  em `data/model-journal.json` e, 5 pregões depois, o resultado. `assets/learner.js` decide: lógica < 60% (30+ dias) é eliminada,
  pesos da decisão andam devagar a cada 5 pregões, e o modelo final exige 60 pregões, 3+ aprovadas (2+ que operam) e 4 retreinos estáveis.
- Modo sombra: a aba Decisões não usa o modelo em treino. O aviso de modelo final sai de `data/model.json` (`assets/model-status.js`).

## Quant Aberto (aba Análise)

- Todo pregão às 22:40 UTC, `update-quant.yml` roda `scripts/update-quant.mjs`: lista do S&P 500 (Wikipédia) + resumo e
  gráfico semanal do Yahoo por ação → `data/quant.json` (notas por fator, nota 1–5, Top 20) e, no 1º dia do mês,
  `data/quant-journal.json`. Cálculo em `assets/quant.js`; tela em `assets/quant-view.js`. Ver `docs/QUANT-ABERTO.md`.

## Observabilidade

- Erros de JavaScript dos usuários vão para `pendulo_client_errors` (`assets/telemetry.js`, até 5 por sessão).
  Consulta: `select at, tab, message from pendulo_client_errors order by at desc limit 50;`
- Saúde das cotações: aba Verificação (`api/verify`, Nasdaq como segunda fonte).

## Regras

- Lógica nova = função pura + teste. Módulo novo no front = `npm run preload`.
- Antes de push: `npm run lint`, `npm run format:check`, `npm test`.
- Segredos só no servidor (Supabase/Vercel). Nada de chave privada no repositório.

## Deploy

- A Vercel publica só a `main` (`ignoreCommand` em `vercel.json`): branches de PR não geram prévia, para não estourar
  o limite do plano gratuito (100 deploys/dia). Validação de PR = CI do GitHub (lint, formato, testes).
- Desde 12/10/2026 os ramos de trabalho (`claude/**`, `feat/**`, `fix/**`, `chore/**`, `docs/**`, `refactor/**`) têm o
  deploy automático DESLIGADO em `vercel.json` (`git.deploymentEnabled`): o `ignoreCommand` só cancelava o deploy
  depois de criado, e cancelado também conta na cota de 100/dia (estourou em 12/10 com várias sessões em paralelo).
