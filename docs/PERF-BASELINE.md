# Linha de base de desempenho (plano de otimização)

Referência: `docs/PLANO-OTIMIZACAO.md`. Roteiro: `node scripts/perf-probe.mjs [--url …] [--tabs …] [--json saida.json]`
(Playwright + Chromium; desktop 1440×900 e iPhone 13 com CPU 4x mais lenta; 8 s parado em cada aba).

Colunas: `requests` (todas), `api` (/api/…), `data` (/data/…), `js` (módulos), `kb` (transferido, sem
compressão), `dom` (nós), `height` (px de rolagem), `small` (textos visíveis < 12 px), `tiny` (controles
visíveis < 40 px), `ctrls` (controles visíveis), `longTasks`/`longMax` (tarefas > 50 ms e a maior, ms).

## 13/11/2026 — antes (commit dbd7552, servidor local)

Limite desta medição: o ambiente do agente bloqueia o Yahoo, então as APIs de cotação respondem com erro e as
abas que dependem de cotação (Sinais, Screener, Carteira, Watchlist) desenham menos do que com dados. Os
números de abertura (requisições, JS, KB) não dependem disso; DOM e textos dessas abas estão subestimados.

| profile | tab       | requests | api | data | js  | kb   | dom  | height | small | tiny | ctrls | longTasks | longMax |
| ------- | --------- | -------- | --- | ---- | --- | ---- | ---- | ------ | ----- | ---- | ----- | --------- | ------- |
| desktop | home      | 153      | 5   | 4    | 135 | 3039 | 459  | 2766   | 5     | 39   | 44    | 3         | 216     |
| desktop | dash      | 153      | 5   | 4    | 135 | 3039 | 1544 | 2618   | 192   | 60   | 92    | 5         | 265     |
| desktop | local     | 155      | 8   | 4    | 135 | 3044 | 311  | 900    | 1     | 16   | 23    | 3         | 130     |
| desktop | flow      | 152      | 3   | 4    | 135 | 3038 | 4181 | 4962   | 576   | 155  | 183   | 3         | 536     |
| desktop | watch     | 151      | 4   | 4    | 135 | 3039 | 342  | 1130   | 1     | 26   | 33    | 2         | 185     |
| desktop | signals   | 161      | 4   | 12   | 135 | 3039 | 420  | 1805   | 7     | 20   | 30    | 2         | 233     |
| desktop | screener  | 153      | 2   | 8    | 135 | 3037 | 302  | 900    | 1     | 16   | 21    | 2         | 161     |
| desktop | portfolio | 149      | 2   | 4    | 135 | 3037 | 303  | 900    | 1     | 14   | 19    | 2         | 208     |
| mobile  | home      | 152      | 5   | 4    | 135 | 3022 | 458  | 4801   | 11    | 32   | 41    | 3         | 750     |
| mobile  | dash      | 152      | 5   | 4    | 135 | 3022 | 1534 | 5972   | 179   | 53   | 89    | 9         | 1186    |
| mobile  | local     | 154      | 8   | 4    | 135 | 3027 | 311  | 769    | 7     | 9    | 20    | 3         | 685     |
| mobile  | flow      | 152      | 3   | 4    | 135 | 3021 | 4364 | 13164  | 500   | 148  | 182   | 4         | 2187    |
| mobile  | watch     | 150      | 4   | 4    | 135 | 3022 | 342  | 1762   | 7     | 18   | 30    | 3         | 889     |
| mobile  | signals   | 158      | 2   | 12   | 135 | 3020 | 420  | 2586   | 13    | 13   | 27    | 2         | 938     |
| mobile  | screener  | 152      | 2   | 8    | 135 | 3020 | 302  | 695    | 7     | 9    | 18    | 2         | 882     |
| mobile  | portfolio | 151      | 5   | 4    | 135 | 3022 | 303  | 830    | 7     | 7    | 16    | 3         | 638     |

## Robô de cotações (quotes-feed): antes e depois da Fase 1 (calculado, não medido em produção)

Medido em produção: depende de reimplantar a função e aplicar o SQL (contadores em `pendulo_quotes.stats`).
Cálculo com o universo atual (374 símbolos + 44 contratos vigentes de futuros = 418 vagas = 7 consultas):

| Situação                            | v1 (consultas/h) | v2 (consultas/h)                         | Variação |
| ----------------------------------- | ---------------- | ---------------------------------------- | -------- |
| Pregão, app aberto                  | 1.680            | 600 (morna 7/min + quente 1 a cada 15 s) | −64%     |
| Pré/pós, app aberto                 | 1.680            | 540 (morna 6/min + quente)               | −68%     |
| Noite (futuros), app aberto         | ~460             | 180 (morna 3/min, sem quente)            | −61%     |
| Qualquer hora, app fechado > 10 min | 1.680 / ~460     | 0 (pg_cron não chama a função)           | −100%    |
| Pacote do canal por hora            | ~10,5 MB         | ~1 MB (delta; completo a cada 5 min)     | ~−90%    |
| Gravações de `pendulo_quotes`       | 240/h            | 60/h                                     | −75%     |

Divergência do plano (explicada): o plano estimava a noite em 60 consultas/h (1 por minuto) contando 57 símbolos.
São 89 (44 futuros + 20 moedas + 5 cripto + 20 bolsas do mundo) e cada futuro ocupa 2 vagas (contínuo +
contrato vigente), o que dá 3 consultas por minuto. Cortar o contínuo exigiria mudar a regra de futuros do
`api/quotes.js`, fora do escopo.
