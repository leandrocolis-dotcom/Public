# Coerência dos números (30/10/2026)

Regra: **um mesmo ativo mostra a mesma variação do dia em todas as telas.** Variação do dia = preço da cotação ÷
fechamento anterior oficial da cotação (`p / pc` de `api/quotes`).

## O caso que motivou

Brent em 30/10: tabela −0,19%, painel do ativo +1,88%, botão 1D +2,6%. Cotação real: 113,54 ÷ 110,80 = +2,47%.

1. **Base gravada errada (tabela).** Depois das 18:00 de NY o Yahoo carimba a sessão que acabou de abrir (pregão
   de amanhã) às 18:00 do mesmo dia; o cron da noite gravou 113,84 como "fechamento de 29/10" (o ajuste foi
   110,80). Afetava todos os futuros (WTI −0,08% × +2,78% real, ouro, prata, cobre…).
2. **Painel com outra conta.** O 1D sobrescrevia o preço grande com o último ponto do contínuo do Yahoo contra um
   "fechamento anterior" da sessão de ações (9:30–16:00), que não existe em futuro.
3. **Botão 1D** usava a cotação (certo), por isso o terceiro número.

## Correções (três camadas)

- **Fonte:** `isEveningFutBar`/`isFutMeta` (`assets/futures.js`) descartam a última barra diária de futuro
  carimbada às 17:00+ (`api/history` → também `scripts/fut-adjust.mjs` e o painel; `api/analyze` →
  `scripts/update-hist.mjs`). O cron de depois do fechamento (`update-prices.yml`) passou para 21:20 UTC, antes
  das 18:00 de NY.
- **App:** `applyLiveToPrices/Flow` (`assets/live.js`) e `mergeLive` (`assets/br.js`) trocam o ponto anterior da
  série pelo `pc` da cotação (diferença > 25% = dado quebrado, não mexe). Tabelas, regime, fluxo, Screener,
  carteira e Onshore passam a dar o mesmo número.
- **Painel do ativo e busca:** `quoteOf` (`assets/asset-pop.js`) é a cotação única (canal ao vivo → mercado
  inteiro → busca própria); preço grande, botão 1D e a linha "Fechamento anterior" do gráfico saem dela.
  `api/intraday` usa o contrato vigente do futuro (o mesmo de `api/quotes`) e só marca pré/pós em ações e ETFs.
- **Verificação:** Laboratório › Verificação › "Variação do dia igual em todas as telas" lista os ativos em que a
  base divergiu do fechamento oficial (o app já corrigiu na tela).
- Testes: `tests/coerencia.test.js` reproduz o caso do Brent.
