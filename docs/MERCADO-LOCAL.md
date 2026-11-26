# Mercado › Local (Brasil)

Pedido do usuário (28/10/2026): "agora que estou exposto em IBOV, quero acompanhar de perto o mercado brasileiro".
Exceção à regra "Mercado: só EUA" apenas para **acompanhar** (monitor); estudos, modelos e alertas seguem só EUA.

- Tela: `assets/local-view.js` (mesmo visual do Visão geral: barra de resumo, quadros `.dp`, mini-gráficos).
- Lógica pura: `assets/br.js` (universo, séries com preço ao vivo, regime, setores, altas/baixas, amplitude,
  volatilidade, sessão da B3, nota macro). Testes: `tests/br.test.js`.
- Tempo real: `BR_SYMBOLS` (`assets/br-universe.js`) faz parte do universo de `api/quotes`, então a B3 vai no
  pacote do canal `pendulo-quotes` (Edge Function `quotes-feed`, 15 s no pré/pregão/pós de NY, que cobre o pregão
  da B3). Cada pacote redesenha a tela e os preços piscam (`flashTicks`). A busca própria só entra com o canal mudo.
- Carga: `loadLocal` em `assets/feeds.js`, chamada pelo relógio com a aba aberta: histórico de 1 ano por
  `api/history` (a cada 30 min), cotações por `api/quotes?only=1` (1 min no pregão, 5 min fora) e macro por
  `api/yields?br=1` (`api/_bcb.js`: SGS e Focus do Banco Central; sem função nova por causa do limite do plano).
- Regime Brasil: 7 razões que sobem com apetite a risco (BOVA11/LFTS11, SMAL11/BOVA11, real, IRFM11/LFTS11,
  EWZ/EEM, doméstico/exportadoras, cíclico/defensivo). Risk-on ≥ 70% em alta, Risk-off ≤ 30%; Estresse quando o
  dólar sobe mais de 1,5%·√h e os prefixados caem mais de 0,4%·√h contra o Tesouro Selic.
- Setores: cestas de peso igual das maiores ações (`BR_SECTORS`); ticker trocado ou deslistado só some da cesta.
- Macro: juro real (Selic − IPCA esperado 12 m), Selic esperada, IPCA × meta de 3%, expectativa, IBC-Br,
  desemprego, PIB do Focus, dívida bruta e dólar esperado; cada um de −2,5 a +2,5, nota = média dos pilares.
- Limites: sem feriados da B3; sem curva de DI (os ETFs IRFM11/IMAB11 servem de termômetro dos juros).

## De-para com o Visão geral (offshore), 28/10/2026

| Visão geral (offshore)                              | Local (Brasil)                                                                                              |
| --------------------------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| Preço pelo canal de tempo real, piscando            | Igual: B3 no universo do `quotes-feed` (15 s); `freshestQuotes` pega o preço mais novo                      |
| Barra: regime, carteira, valor, fora da curva, news | Regime Brasil, Ibovespa, dólar, juros, B3 aberta/fechada, exposição Brasil, fora da curva, amplitude, macro |
| Prévia do regime fora do pregão (futuros, pré/pós)  | Prévia pelo EWZ no pré/pós de NY quando a B3 está fechada                                                   |
| Faixa rolante com ativos-chave + carteira           | Igual (`BR_TAPE` + posições brasileiras da carteira)                                                        |
| Faixa de manchetes (troca a cada 5 s)               | Igual, só manchetes brasileiras                                                                             |
| Arrastar quadros, "–" recolhe, restaurar layout     | Igual, com layout próprio (`localLayout`; o do Visão geral fica intacto)                                    |
| "+" inclui ativo no quadro, × tira                  | Igual nos 5 quadros de cotação; "PETR4" vira PETR4.SA                                                       |
| "!" fora da curva (σ de 60 pregões) e popup         | Igual; o popup diz "Brasil" e a linha abre a página do ativo                                                |
| "!" de notícia ligada ao ativo                      | Igual: nomes das maiores empresas da B3 em `ASSET_WORDS`                                                    |
| Mini-gráfico com dica por ponto                     | Igual (calendário da B3)                                                                                    |
| Horizonte 1D/5D/1M/3M                               | Igual (o mesmo botão vale para as duas telas)                                                               |
| Juros soberanos (fontes oficiais)                   | Macro Brasil (SGS + Focus) com pilares e nota                                                               |
| Clique na linha abre o gráfico (Mapa de fluxo)      | Abre a página do ativo (o Mapa de fluxo não tem a B3)                                                       |
| Futuros de índice (ES, NQ) e mês do contrato        | Sem equivalente gratuito (WIN/IND e DI1 não estão no Yahoo); EWZ e IRFM11 fazem o papel                     |

## Pré/pós-mercado dos ativos da B3 (28/10/2026)

A B3 não tem pós-mercado (o after-market foi extinto) e o Yahoo não traz pré/pós dos papéis `.SA`. Fora do pregão,
o mesmo esquema do Off market do offshore usa o espelho em Nova York (`BR_NY` em `assets/br-universe.js`: EWZ
para Ibovespa/BOVA11, EWZS para SMAL11 e o ADR de cada ação com ADR). `brExtQuotes` (`assets/br.js`) aplica a
variação do espelho no pré/pós ao último preço da B3 e a tela mostra "pós ~PBR-A R$ x +y%" sob o nome. Só vale
se o dado estendido for mais novo que o último preço da B3; o câmbio não é ajustado (aproximação).

## Onshore completo (28/10/2026)

A antiga aba Local virou **Mercados › Onshore › Visão geral**, ao lado de Macro, Notícias, Agenda e Fluxo do Brasil.
Ver `docs/ROADMAP-NAVEGACAO.md` (N6).

## Fluxo Onshore igual ao Offshore (30/10/2026)

Pedido do usuário: "não vejo mapa de calor, rotação relativa e Fluxo agora: meio de pregão na visão de Fluxo do mercado
brasileiro igual temos no offshore". **Mercados › Onshore › Fluxo** passou a usar o mesmo motor e o mesmo desenho do
Fluxo Offshore (`assets/flow-engine.js` e `assets/flow-view.js`, agora com o universo como parâmetro):

- Universo: `assets/br-flow.js` (`BR_UNI`): Índices e ETFs da B3, as 11 cestas de setores (cada ação um bloco), juros
  (IRFM11, IMAB11, B5P211; benchmark LFTS11), Brasil em NY (benchmark EWZ), real e emergentes, commodities. Rotação padrão:
  **Setores da B3 × Ibovespa** (cestas `S:<setor>`, só na rotação); cada setor também gira as suas ações contra o Ibovespa.
- Dados: `brFlowTable` monta `{ dates, close, vol }` do histórico de 1 ano **com volume** (`api/history?vol=1`) + cotação
  ao vivo. Coerência: o fechamento anterior é o `pc` da cotação, então a variação do dia = p ÷ pc (igual às outras telas);
  o volume de hoje é o `v` da cotação.
- Fluxo agora: fases do pregão da B3 (`brPhase`: pré-abertura, 1ª hora, meio do pregão, última hora, fechado) pela
  fração do pregão (`b3Session().frac`, 10:00 às 17:00/18:00). Candidatos só entre o que se negocia na B3 (Ibovespa à
  vista, câmbio e commodities contam só para o tom).
- Volume relativo do dia = volume até agora ÷ (média de 20 pregões × parcela do volume que costuma sair até esta hora).
  A parcela vem da curva medida no estudo (`volShare`); sem estudo, linear. A tabela de pressão por setor usa o mesmo número.
- Preferências próprias (`brFlowHorizon`, `brFlowGroup`, `brFlowSize`, `brRotGroup`, `brFlowStrong`); o Offshore fica intacto.
  Toque num bloco abre a página do ativo.
- Assertividade com dados reais: `scripts/br-flow-study.mjs` (cron `br-flow-study.yml`, sexta 22:37 UTC) refaz a leitura
  da tela em 6 horas de cada pregão dos últimos ~60 dias (barras de 5 min do Yahoo, mesmo código do app) e mede, em excesso
  sobre o Ibovespa, se o setor "ganhando força" fecha acima do Ibovespa e quanto os fortes/fracos rendem no resto do dia e
  no dia seguinte → `data/br-flow-study.json`, mostrado no "Fluxo agora" e no cartão "Assertividade do Fluxo agora".
  Modo sombra: é medição, não alerta.

### Resultado do estudo com dados reais (rodado em 30/10/2026: 59 pregões, 06/08 a 29/10/2026, 80 ativos)

- **Curva de volume da B3** (parcela do volume do dia até cada fração do pregão): 10% → 9,5%, 30% → 31%, 50% → 45%,
  70% → 60%, 90% → 79% (o leilão de fechamento concentra ~20%). A conta linear antiga superestimava a parcela da tarde e
  **subestimava o volume relativo em até ~14%** na última hora; o app agora usa a curva medida.
- **Ler o dia: confiável.** No meio do pregão, o setor "ganhando força" fechou acima do Ibovespa em 85% dos casos (166) e
  o "perdendo força" fechou abaixo em 80% (130); na última hora, 86% e 83%.
- **Gatilho de entrada: sem vantagem comprovada.** Meio do pregão: fortes +8,6 bps até o fechamento (t 0,76) e +19 bps no
  dia seguinte (t 0,91); fracos +15 bps até o fechamento (t 1,44) e +27 bps no dia seguinte (t 1,18), isto é, os fracos
  tenderam a **repicar**, não a seguir caindo. Nada com t ≥ 2 em nenhuma hora. Conclusão (docs/OBJETIVO.md): o Fluxo
  Onshore serve para entender para onde o dia vai, não como gatilho; vender só porque o ativo está fraco no Fluxo não se
  pagou nesse período. A tela mostra esse veredito automaticamente (`studyVerdict`, só chama de vantagem o que tem t ≥ 2) e
  ele é refeito toda semana.
