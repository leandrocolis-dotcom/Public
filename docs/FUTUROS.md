# Futuros: rolagem automática do contrato vigente

O Yahoo publica futuros como contínuos (`ES=F`, `CL=F`, `HE=F`…), que falham perto do vencimento:

- **congelam**: `CNH=F` ficou ~2 meses parado depois de cada vencimento trimestral de 2026
  (13/03→15/05, 12/06→14/08, 11/09→15/10);
- **saltam na troca de contrato**: `HE=F` +14% em 17/08 e +12% em 15/10, `KC=F` +15% em 06/07, sem
  movimento real (diferença entre o contrato que venceu e o seguinte).

## Como o app resolve

`assets/futures.js` (puro, testado em `tests/futures.test.js`) sabe, para cada raiz (`ES`, `CL`, `HE`…),
a bolsa no Yahoo, os meses listados e a regra de vencimento/primeiro aviso. `activeContract("HE=F", data)`
devolve o contrato vigente (`HEZ26.CME`), que **rola sozinho** alguns dias antes do vencimento, como faz
quem opera. Não há lista de contratos para manter.

- **Ao vivo** (`api/quotes`): para cada `XX=F` pedido, busca também o contrato vigente e devolve a cotação
  dele com o mesmo nome e o campo `fut` (`"HEZ26"`). Sem cotação do contrato, fica o contínuo. O feed do
  Supabase (`quotes-feed`) usa essa mesma função.
- **Histórico** (`api/history` e `scripts/fut-adjust.mjs` no workflow `update-prices.yml`, depois do
  `update_prices.py`): série do contrato vigente onde ele tem preço (o Yahoo guarda ~1 ano de cada contrato)
  e, antes disso, o contínuo ajustado por razão na emenda; pregões congelados do contínuo são descartados.
  O preço mais recente é o do contrato vigente e a troca nunca vira variação.
- **Tela**: o Mercado mostra o vencimento acompanhado ao lado do horário (`· dez/26`).

## Limites

- O Yahoo apaga contratos vencidos (HTTP 404): rolagens antigas não são reconstruídas; antes do início do
  histórico do contrato vigente a série é o contínuo do Yahoo (ajustado na emenda).
- Feriados não entram no calendário: a rolagem pode cair um dia antes ou depois.
- `data/ohlc.json` (velas da análise gráfica do WTI) segue no contínuo.
