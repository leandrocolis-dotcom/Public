# Avisos push (celular e Apple Watch com o app fechado)

Tudo roda sem configuração manual:

- **Envio**: Edge Function `push` do Supabase (`supabase/functions/push`), que já roda com a service key do projeto: lê aparelhos e carteiras, calcula o que avisar e envia. **Desde 22/11/2026 o cálculo roda dentro da função** (`push.bundle.js` = `api/push-alerts.js` → `computeAlerts` + `api/quotes`, `intraday`, `history` e `analyze`, chamados na memória por `scripts/lib/push-local.mjs`, com cache na instância): nada de função da Vercel a cada minuto. Da Vercel só lê `data/*.json` (estático, sem CPU) e `api/verify?version` uma vez por deploy. A 1ª chamada de uma instância nova pula a varredura de liderança (sem cache passaria do limite de 2 s de CPU; medido: frio 1,85 s com liderança, quente 0,35–0,57 s). Como o pacote chega à função: ela baixa `https://etf-portfolio-ten.vercel.app/supabase/functions/push/push.bundle.js` (arquivo estático do site) uma vez por instância e o carrega na memória (`import` de `data:`); o Supabase não aceita `import` de URL fora da lista dele e o pacote (229 KB) não sobe pelo conector. Por isso **mudou uma regra de aviso, `api/push-alerts.js` ou algo que ele importa? Basta `npm run build:push` e publicar o `main`**: a função pega o pacote novo sozinha quando uma instância nova sobe (não precisa reimplantar). Se o pacote não carregar, a função cai na rota antiga `POST /api/push-alerts` (reserva); a resposta diz `via: local` ou `via: vercel (motivo)`. Teste: `…/functions/v1/push?dry`. Implantada assim em 22/11/2026 (versão 9): `?dry` respondeu `via: local` e o cron seguiu com 200. O agendamento roda no próprio Supabase: `pg_cron` (job `pendulo-push`) chama a função a cada minuto (`?tick`): no pré, pregão e pós de NY (seg–sex, 4h–20h) ela calcula e envia a cada minuto; fora disso, tudo de 10 em 10 min e, nos outros minutos, só o regime do mercado (`?only=mkt`, cálculo leve) enquanto os futuros da CME negociam (domingo 18h a sexta 17h de NY). Desde 20/11/2026; antes era a cada 10 min sempre, e os avisos chegavam acumulados. Quem não tem carteira também recebe os avisos que valem para todos (regime do mercado, dados macro). O workflow _Enviar avisos push (manual)_ só dispara à mão. Mudou `supabase/functions/push/index.ts`? Reimplante a função.
- **Chaves VAPID**: geradas pela própria função no primeiro uso e guardadas na tabela `pendulo_push_keys` (RLS sem policy: só a service key lê). O app busca só a pública em `…/functions/v1/push?key`.
- **Tabelas**: `pendulo_push_subscriptions`, `pendulo_push_sent`, `pendulo_push_keys` (ver `schema.sql`).

O que cada aparelho precisa (uma vez): entrar na nuvem (Configurações › Conta) e tocar em **Ativar** em Configurações › Avisos.

- **iPhone**: o app precisa estar na Tela de Início (Compartilhar › Adicionar à Tela de Início, iOS 16.4+) e ser ativado abrindo pelo ícone.
- **Apple Watch**: espelha as notificações do iPhone (Watch › Notificações › Pêndulo › Espelhar o iPhone).

Teste: Actions › _Enviar avisos push_ › Run workflow, ou abra `https://iufliktjawnfawerwvtg.supabase.co/functions/v1/push?dry` (simula sem enviar).
**Virada do regime** (🔄, pref `reversal`, `assets/regime-reversal.js`): radar de virada do pêndulo na mesma chamada do 🧭 (também na leve da madrugada); ⚠ tendência, ‼ confirmada (fica na tela e vibra pelo `sw.js`), ↩ não confirmou. Sem mudança na Edge Function. Ver `docs/RADAR-VIRADA.md`.

**Regime do mercado** (🧭, pref `mktregime`, `assets/mkt-regime-alerts.js`): nota do pêndulo da Início agora × 60 min
atrás, pela mesma conta (`regimePair` de `assets/regime-history.js`, barras de 5 min + preço ao vivo). Avisa quando
troca de faixa com ≥ 5 pontos de folga e ≥ 8 de movimento (1 por troca por dia) ou quando andou ≥ 10 pontos em 1 h e está a ≤ 6 da
próxima fronteira (ou acabou de cruzá-la sem folga; 1 por fronteira e sentido a cada 3 h). Com o app aberto e sem
push, o próprio app checa a cada minuto (`assets/mkt-regime-watch.js`).

O que é avisado: sinais de saída/risco/entrada das posições do universo do Mapa de fluxo e manchetes das últimas 12 h
que afetam a carteira, respeitando Configurações › Avisos. Cada aviso é enviado uma vez (`pendulo_push_sent`).

## Aviso de versão nova ("Pêndulo atualizado")

- (Desligado em 26/11/2026; antes era o workflow `release-push.yml`.) Disparo manual: `COMMIT_SHA=… COMMIT_MESSAGE=… node scripts/release-push.mjs` depois de um push no `main` que muda o app (`index.html`, `sw.js`, `assets/`, `api/`, `vendor/`) espera o deploy de produção da Vercel desse commit e chama `POST …/functions/v1/push?release` com `{ sha }` via `scripts/release-push.mjs`. Sem segredo: a função só avisa se esse sha for o que está no ar (`api/verify?version` do app) e monta o texto ela mesma.
- Texto vem da mensagem do commit (`scripts/lib/release-notice.mjs`): `feat` → "Novidade: …", `fix` → "Correção: …"; `chore/docs/test/ci/build/style`, `[skip ci]` (robôs de dados) ou `[skip push]` não avisam.
- Um aviso por usuário e versão (`release:<sha>` em `pendulo_push_sent`).
- Ao tocar, o `sw.js` limpa o cache (menos o histórico de avisos), atualiza o service worker e recarrega a janela já na versão nova; o app mostra o toast "Pêndulo atualizado".

## Cotações em tempo real (`quotes-feed`)

v2 desde 13/11/2026 (`docs/PLANO-OTIMIZACAO.md`, Fase 1). A v1 está guardada em `index.v1.ts`.

- **Sob demanda**: o app avisa presença a cada 5 min com o canal aberto (`pendulo_touch`, tabela
  `pendulo_demand`, sem dado pessoal). O `pg_cron` (job `pendulo-quotes-feed`, `15 seconds`) só chama a função
  se alguém avisou nos últimos 10 min. App fechado = robô parado (o push com o app fechado é outra função).
- **Camadas** (`assets/feed-tiers.js`): quente a cada 15 s (referências + ativos que os aparelhos têm na tela,
  até 1 consulta ao Yahoo), morna a cada 60 s (universo + carteiras, só dos mercados abertos), fria = mercado
  fechado não é buscado; à noite só a morna. Regra de sessão única em `assets/sessions.js` (com feriados).
- **Só o que mudou** (`assets/feed-delta.js`): pacote completo na 1ª rodada da instância e a cada 5 min; nos
  outros, só os ativos com algum campo diferente; `seq` crescente; pulso de 1 ativo após 60 s sem envio. O app
  junta por ativo (`mergeLive`) e nunca volta um preço no tempo.
- **Foto e contadores**: `pendulo_quotes.data` (foto completa) e `stats` (por dia de NY: `runs`,
  `yahoo_calls`, `packets`, `bytes_sent`, `symbols_sent`, 14 dias) gravados no máximo 1 vez por minuto.
  Ver os números: `select stats from pendulo_quotes;`. Foto pública só pela função `pendulo_snapshot()`.
- **Teste manual**: `?force` só com o cabeçalho `x-feed-secret` igual ao segredo `FEED_SECRET` da função
  (sem segredo cadastrado, o `force` fica desligado):
  `select net.http_get('https://iufliktjawnfawerwvtg.supabase.co/functions/v1/quotes-feed?force', headers := jsonb_build_object('x-feed-secret', '…'));`
  e leia `net._http_response` (a resposta traz `tier`, `kind`, `seq`, `yahoo_calls`, `bytes_sent`).
- **Implantação (nesta ordem, para não ficar sem preço)**: (a) SQL de `schema.sql` (bloco "Presença" +
  coluna `stats`); (b) app no ar com o `pendulo_touch` (já no `main`); (c) esperar 1 dia; (d) `npm run build:feed`
  e reimplantar `index.ts` + `quotes.bundle.js`; (e) reagendar o cron com o `where exists` (comentado no
  `schema.sql`).
- **Voltar atrás**: reagende o cron sem o `where exists`, renomeie `index.v1.ts` para `index.ts` e reimplante.
  Pausar: `select cron.unschedule('pendulo-quotes-feed');`.
- A busca roda na própria função, direto no Yahoo → spark → Nasdaq, com o `api/quotes.js` empacotado em
  `quotes.bundle.js` (`npm run build:feed`), junto com `assets/sessions.js`, `feed-tiers.js` e `feed-delta.js`.
  Não chama a Vercel. Mudou algum deles, o universo ou `assets/futures.js`? Rode `npm run build:feed` e
  reimplante (o teste `tests/quotes-feed-bundle.test.js` acusa pacote velho; `tests/quotes-feed-fn.test.js`
  roda a função inteira com Supabase e Yahoo simulados).
