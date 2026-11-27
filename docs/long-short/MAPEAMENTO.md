# Long & Short — Fase 0: mapeamento do app real (27/11/2026)

Lido no `main` (8fac47f): `docs/ARQUITETURA.md`, `docs/ON-OFF-MARKET.md`, `docs/BTG-PONTE.md`, `assets/sessions.js`,
`assets/quote-hub.js`, `assets/journal.js`, `assets/settings-sync.js`, `assets/portfolio.js`, `assets/feed-delta.js`,
`api/quotes.js`, `api/intraday.js`, `api/history.js`, `supabase/schema.sql`, `data/hist/`. Nenhum arquivo do app alterado.

## 1. Respostas objetivas

| Pergunta                         | Resposta (verificado no código)                                                                                                                                                                                                                                                                                 |
| -------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| De onde vêm as **posições**?     | `state.portfolio.holdings` = `[{ sym, qty, avg, invPrice?, invValue?, manual?, openedOn? }]`. Nuvem: `pendulo_portfolio.holdings` (jsonb, 1 linha por usuário, RLS) + `manual` (ajuste por cima da foto). Com conta BTG a foto vem da Ponte (`pendulo_btg_apply`, 5x por dia útil) e o app reprecifica ao vivo. |
| Posição vendida (short real)?    | **Não existe.** `parseHoldings`/`upsertHolding` exigem `qty > 0`; o diário (`makeEntry`) é "só compra". Short hoje = ETF inverso comprado (`dir = +1`, `tipo = −1`).                                                                                                                                            |
| Data/hora de entrada e lotes?    | Não há `entrada_ts` nem `lotes[]`. Só `openedOn` (dia) em posição criada no app.                                                                                                                                                                                                                                |
| **Cotação ao vivo**              | Só por `fetchQuotes` (`assets/quote-hub.js`): canal Realtime `pendulo-quotes` (Edge Function `quotes-feed`, **15 s** no pré/pregão/pós, 1 min à noite com futuros) e, fora dele, `api/quotes?only=1&extra=` em blocos de 60 com validade de 60 s.                                                               |
| Campos da cotação                | `p` (último regular), `t` (horário do último regular, s Unix), `pc` (fechamento anterior), `v` (volume do dia), `dh`/`dl`, `ms` (estado do mercado) e, no pré/pós, `xk` ("pre"/"post"), `xp` (preço estendido), `xt` (horário, s), `xc`.                                                                        |
| **bid/ask?**                     | **Não.** O Yahoo devolve `bid`/`ask` no endpoint de cotação, mas `api/quotes.js` não os repassa. Falta no coletor.                                                                                                                                                                                              |
| Horário da cotação (`quote_ts`)? | **Sim**, indireto: `t` (regular) e `xt` (estendido). `quote_ts` = `xt` se o estendido for o vigente, senão `t`. Idade = agora − `quote_ts`. Ressalva: o Yahoo carimba o **último negócio**, não a última consulta; papel parado parece "velho" mesmo com o robô em dia.                                         |
| Pré e pós?                       | **Sim**: cotação (`xk/xp/xt`) e barras (`api/intraday?prepost=1`, `bars.s` = "pre"/"reg"/"post", 4:00–20:00 ET). Noite (20:00–4:00): só `api/quotes?night=` para a carteira; fora do escopo do L&S (FECHADO).                                                                                                   |
| **Barras de 5 min**              | `api/intraday?symbol=X&prepost=1` → `{ bars: { t, o, h, l, c, v, s } }`, 5 pregões, 5 min, cache de borda 60 s. Qualquer ticker válido (não só o universo). Passar sempre pela central `assets/bars-hub.js`.                                                                                                    |
| Volume por candle?               | **Sim** (`bars.v`). No pré/pós o volume do Yahoo existe mas é ralo; vela sem volume vem `0` → VWAP cai no fallback por tempo quando a soma é 0.                                                                                                                                                                 |
| Lote de vários ativos            | `api/intraday?symbols=…&win=short` devolve **só fechamento** (sem OHLCV): não serve para VWAP/ATR. Usar uma chamada por ativo (até ~8 por par/carteira).                                                                                                                                                        |
| **Histórico diário**             | `data/hist/<ATIVO>.csv` (`date,o,h,l,c,v`, ~508 pregões, 937 ativos; inclui SPY, QQQ, SOXL, SQQQ, TQQQ, SOXX, SMH, VIXY), atualizado 22:05 UTC. **Sem `^VIX`.** Fora da base: `api/history` devolve **só fechamento** (+ volume com `vol=1`), sem máxima/mínima → ATR_d impossível por ele.                     |
| VIX                              | Cotação ao vivo: `^VIX` está no universo (`assets/universe.js`). Histórico diário: não há CSV (só VIXY).                                                                                                                                                                                                        |
| Relógio/sessão                   | `assets/sessions.js`: `nyClock` (Intl, fuso por nome), `usSession` → "pre"/"open"/"post"/"closed", `sessionInfo(date)` com feriados NYSE 2026–2027 e `EARLY_CLOSE` (13:00, pós até 17:00). Faltam: marcos do dia do L&S (fim da faixa, 15:00, 15:45, 19:45) e contagem regressiva.                              |
| Diário                           | `pendulo_journal.entries` (jsonb, 1 linha por usuário). Entrada: `{ id, sym, openDate, openPrice, qty, stop, fees, reason, note, closeDate, closePrice, at }`. Só long.                                                                                                                                         |
| Parâmetros/edições na nuvem      | `pendulo_settings` via `assets/settings-sync.js`: chave nova do `localStorage` entra em `WHOLE` (inteira) ou `FIELDS` (campo a campo).                                                                                                                                                                          |
| Abas                             | `assets/state.js`: `TABS`, `GROUPS` (seção `wallet` = portfolio, journal, risk, rebal, phist, rfix) e `TAB_INFO`.                                                                                                                                                                                               |
| Números                          | `assets/format.js` (`num`, `pct`, `intTxt`, `decSep`).                                                                                                                                                                                                                                                          |

## 2. O que falta no coletor (Fase 1)

| Falta                                   | Efeito sem ele                                                        | Correção proposta                                                                                                                                                      |
| --------------------------------------- | --------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `bid`/`ask` na cotação                  | EXE-01 dispara sempre (`bid==null`): nenhuma entrada/aumento liberado | `api/quotes.js` repassa `b`/`a` (e `bt` = horário) do Yahoo; `npm run build:feed` + reimplantar `quotes-feed` para o canal levar junto. Reduções nunca dependem disso. |
| ATR_d de subjacente fora de `data/hist` | Sem ATR_d: gap em ATR e "esticado" indisponíveis                      | Usar `data/hist`; subjacente novo entra no universo do `update-hist` (sem robô novo).                                                                                  |
| Histórico do VIX                        | Filtro de overnight sem percentil de VIX                              | Overnight usa só o VIX ao vivo (`overnight_vix_max`); percentil fica para depois.                                                                                      |
| Short real na Carteira                  | Nenhuma posição com `dir = −1`                                        | Vínculo L&S guarda `dir` por posição; short real é cadastrado no L&S (quantidade negativa na Carteira não é aceita hoje).                                              |

## 3. Campos e tabelas novos (nome no app)

Decisão: seguir o padrão do repositório (1 linha jsonb por usuário com RLS, como `pendulo_journal`), em vez de
4 tabelas: menos SQL, mesma garantia. Tudo aditivo; nada muda em `pendulo_portfolio` nem na foto do BTG.

| Plano (seção 3)        | No app                                                                                                                                    | Onde                         |
| ---------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------- |
| `pendulo_ls_positions` | `ls.legs[]`: `{ sym, pairId, leg: "long"/"short", dir, stop, hwm, hwmAvg, partialDone, borrow: { ok, rateAa, ref, src }, recall }`        | `pendulo_ls.data`            |
| `pendulo_ls_orders`    | `ls.orders[]`: `{ id, pairId, sym, purpose, side, qtySug, qtyExec, limit, avgExec, stop, reason, status, createdAt, updatedAt }`          | `pendulo_ls.data`            |
| `pendulo_ls_fills`     | `ls.fills[]`: `{ uid, orderId, qty, price, fees, ts }` (idempotência por `uid`)                                                           | `pendulo_ls.data`            |
| `pendulo_ls_state`     | `ls.day`: `{ date, entries, stopsBySym, ignored[], adds, peak, lastAdj }` + `schemaVersion: 4`, `paramsVersion`                           | `pendulo_ls.data`            |
| Ativos                 | `assets/ls-etfs.js`: catálogo `{ sym: { L, type, under, pid } }` dos ETFs alavancados comuns + cadastro do usuário em `pendulo.ls.assets` | código + `pendulo_settings`  |
| Parâmetros             | `pendulo.ls.params` (só o que o usuário mudar; o resto vem de `assets/ls-params.js`, espelho do JSON v4)                                  | `pendulo_settings` (`WHOLE`) |
| Plano do dia           | `pendulo.ls.plan` = `{ date, capital, pairs: { [pairId]: { bias, trigger, dirPlan } }, filledAt }`                                        | `pendulo_settings` (`WHOLE`) |
| Pares                  | `pendulo.ls.pairs` = `[{ id, name, long, short }]`                                                                                        | `pendulo_settings` (`WHOLE`) |
| Calendário             | feriados/encurtados = `assets/sessions.js`; eventos macro já existem (`api/_eco.js`)                                                      | código                       |
| Câmbio                 | dólar do dia já vem de `BRL=X` (cotação) e PTAX da foto do BTG                                                                            | sem tabela nova              |
| Diário                 | entradas novas no mesmo `pendulo_journal` com `kind: "ls"`, `alertId`, `followed`, `pnlR`, `why`                                          | aditivo                      |

## 4. Consequências para as fases

- **Migração v1→v4:** não há registro antigo de L&S (módulo novo). A migração aplica-se às posições da Carteira
  ao serem vinculadas: `dir = +1`, `hwm = max(pm, P)` (mín. se `dir = −1`), `stop = null` (gera alerta). É feita na
  leitura (pura), sem UPDATE em massa.
- **Telas de cadastro (Fase 1):** entram dentro da tela L&S na Fase 7, depois do design aprovado na Fase 6
  (evita desenhar duas vezes). Até lá, o motor roda com o catálogo de ETFs e parâmetros padrão.
- **bid/ask:** enquanto o canal não levar `b`/`a`, a tela usa `fetchQuotes` (que passa por `api/quotes`) para os
  ativos do L&S; sem bid/ask válidos, EXE-01 bloqueia só entradas e aumentos.
