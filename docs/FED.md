# Mercados › Offshore › Juros › 🏦 Fed (caminho do Fed implícito)

Opção `fed` do seletor de curvas da aba Juros do Offshore (`prefs.rateCurve.off = "fed"`). Mostra quanto o mercado
precifica de cortes ou altas do Fed em cada reunião do FOMC, a partir dos futuros de Fed Funds.

## O que a tela mostra

- **Métricas**: EFFR (juro efetivo) e banda-alvo; próxima reunião (movimento esperado em bp e chance de 25 bp);
  acumulado até o fim do ano e até a última reunião coberta pelos contratos.
- **Gráfico mês a mês**: juro médio esperado de cada mês (100 − preço do futuro) agora e nas datas de comparação
  (mesmos atalhos da aba Juros; os preços guardados vão até 6 meses atrás).
- **Reunião a reunião**: juro depois da decisão, movimento, chance, acumulado e número de movimentos de 25 bp.
- **Mês a mês**: juro implícito e variação em bp contra cada data de comparação.

## Fontes (`GET /api/yields?fed=1[&debug=1]`, código em `api/_fed.js`)

| Dado                 | Fonte                                                                     | Cache |
| -------------------- | ------------------------------------------------------------------------- | ----- |
| Futuros de Fed Funds | Yahoo, contratos `ZQ<mês><ano>.CBT` (18 meses, fechamentos de 6 meses)    | 5 min |
| EFFR e banda-alvo    | Fed de Nova York (`markets.newyorkfed.org`)                               | 1 h   |
| Datas do FOMC        | Página de calendário do Fed; reserva em `FOMC_FALLBACK` (`assets/fed.js`) | 1 dia |

## Método (`assets/fed.js`, puro; testes em `tests/fed.test.js`)

Cada contrato liquida em 100 − média da EFFR do mês. Para cada reunião: juro antes = juro depois da reunião anterior
(na primeira, a EFFR); juro depois = o mês seguinte, se ele não tiver reunião; senão,
`(média do mês − dia/N × antes) ÷ (1 − dia/N)`. Chance = |movimento| ÷ 25 bp (acima de 100% = parte de um movimento
de 50 bp). É o método do CME FedWatch simplificado: não separa cenários de 0, 25 e 50 bp.

## Limites

Preços do Yahoo com ~10 min de atraso e meses distantes com pouca liquidez (mais ruído). A EFFR fica uns bp abaixo do
meio da banda; por isso o "juro depois" não cai exatamente em múltiplos de 25. Material educacional; não é
recomendação de investimento.
