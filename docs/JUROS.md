# Mercados › Juros (curva de juros)

Sub-aba nos dois lados de Mercados (`rates` no Offshore, `brrates` no Onshore). Mostra a curva de juros a mercado
com todos os vértices e as curvas de datas passadas para comparar.

Opção 🏦 Fed (caminho do Fed implícito nos futuros de Fed Funds): ver `docs/FED.md`.

## O que a tela mostra

- **Métricas no topo**: vértices-chave (EUA: 3m, 2a, 10a, 30a; Brasil: 1a, 2a, 5a, 10a) com a variação em bp contra o
  fechamento anterior, e a inclinação principal (EUA: 10a − 2a) com o formato (inclinada, plana, invertida).
- **Gráfico**: curva de agora (grossa), último fechamento (tracejada, quando há ao vivo) e uma linha por data de
  comparação. Eixo do prazo em escala de raiz. Toque num ponto para ver a taxa.
- **Tabelas**: taxa por vértice de cada curva, variação até agora (bp) contra cada data e inclinações.
- **Nominal · Real · Inflação implícita** (só EUA e Brasil; `prefs.rateMode.{off,on}`): a mesma tela com a curva
  real (EUA: TIPS; Brasil: NTN-B) ou a inflação implícita, com as mesmas datas de comparação. Real e implícita mostram
  só o fechamento (não há cotação ao vivo gratuita de TIPS/NTN-B).
- **Comparar com**: atalhos (ontem, 1 semana, 1/3/6 meses, início do ano, 1 e 2 anos) ou data livre; até 6.
  Salvo em `prefs.rateCmp.{off,on}`; curva escolhida no Offshore em `prefs.rateCurve.off`.

## Fontes (`GET /api/yields?curve=…&date=AAAA-MM-DD[&live=1]`, código em `api/_curves.js`)

| Curva                        | Fonte                                                                                                                                                                                                                                                        | Atualização                             |
| ---------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------- |
| `us` EUA                     | Tesouro americano, par yield 1m–30a                                                                                                                                                                                                                          | fechamento oficial (fim da tarde de NY) |
| `us` ao vivo                 | fechamento + variação do dia (p − pc) de ^IRX, ^FVX, ^TNX, ^TYX (Yahoo), interpolada                                                                                                                                                                         | tempo real (central de cotações)        |
| `eu` Zona do euro            | BCE, curva à vista AAA 3m–30a                                                                                                                                                                                                                                | diária, 1 dia de defasagem              |
| `gb` Reino Unido             | Banco da Inglaterra: Bank Rate + zero cupom 5/10/20a                                                                                                                                                                                                         | 1-2 dias                                |
| `jp` Japão                   | MoF, JGB 1–40a                                                                                                                                                                                                                                               | 1 dia                                   |
| `br` Brasil (fechamento)     | B3: ajuste do DI1 no pregão anterior (vem junto da cotação ao vivo)                                                                                                                                                                                          | diário                                  |
| `br` Brasil (datas passadas) | `data/br-curve.json` do robô `update-br-curve.yml` (`scripts/update-br-curve.mjs`): DI1 guardado todo dia útil (11:41 e 21:41 UTC); antes de 18/11/2026, Tesouro Prefixado (LTN e NTN-F depois do último LTN) como referência, marcado na legenda            | 3 anos                                  |
| `usr` EUA real (TIPS)        | Tesouro americano, par real yield 5–30a (`daily_treasury_real_yield_curve`)                                                                                                                                                                                  | fechamento oficial                      |
| `brr` Brasil real (NTN-B)    | `data/br-real.json`, gravado pelo mesmo robô `update-br-curve.yml`: Tesouro IPCA+ com juros semestrais (NTN-B) e, onde não há NTN-B com cupom a menos de 9 meses, Tesouro IPCA+ (principal); taxa de compra da manhã do Tesouro Direto. Educa+ e Renda+ fora | diário (D-1), 3 anos                    |
| `br` ao vivo                 | B3, futuros DI1 (`cotacao.b3.com.br`)                                                                                                                                                                                                                        | ~15 min de atraso, renova a cada 60 s   |

**Inflação implícita** (calculada no app, `breakeven` em `assets/rates.js`): nos vencimentos da curva real e nos
vértices padrão, com as duas curvas interpoladas no prazo e sem extrapolar. EUA: nominal − TIPS (convenção do
breakeven). Brasil: (1 + pré) ÷ (1 + real) − 1, com o pré da curva DI × pré do mesmo dia da NTN-B (por isso vai só até
o último DI1, ~10 anos, e começa no primeiro vencimento de NTN-B do Tesouro Direto, ~3 anos). Inclui prêmio de risco
de inflação (e, nos EUA, de liquidez dos TIPS): não é a previsão pura do IPCA/CPI.

**Implícita × Focus** (só Brasil › Inflação implícita): `GET /api/yields?focus=ipca` (`fetchFocusIpca` em
`api/_bcb.js`) traz a última mediana do IPCA de cada ano no Focus (ano corrente até +4). `focusCurve` transforma em
inflação média anualizada de hoje até 1, 2, 3 e 4 anos (resto do ano corrente + anos cheios + fração do último ano);
aparece como linha tracejada vermelha no gráfico (fora das tabelas de variação). `inflationPremium` = implícita −
Focus em bp nos prazos que a implícita cobre (hoje ~3 e 4 anos, porque a NTN-B mais curta do Tesouro Direto tem ~2,5
anos). Prêmio alto: NTN-B ganha do prefixado se a inflação vier como o Focus; baixo ou negativo: prefixado mais
protegido. Focus sai uma vez por semana; cache de 6 h.

Data sem curva (feriado, fim de semana) usa o último dia útil anterior. `&debug=1` devolve o começo da resposta bruta
da fonte (para conferir o formato quando um parser quebra). Contas puras e gráfico SVG em `assets/rates.js`; tela em
`assets/rates-view.js`; testes em `tests/rates.test.js`.

A página antiga de taxas referenciais da B3 (www2.bmf.com.br) estava fora do ar em 18/11/2026 (erro no banco deles); fica só como último recurso.

Limites: a NTN-B vem do Tesouro Direto (taxa da manhã), não da ANBIMA (fechamento do mercado secundário); diferença
típica de poucos bp. O ao vivo dos EUA é estimado (o Yahoo só tem 4 vértices); o Reino Unido tem poucos vértices na fonte
gratuita. Material educacional; não é recomendação de investimento.
