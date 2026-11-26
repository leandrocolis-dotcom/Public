# Análise fundamentalista no Pêndulo: base teórica para a nova funcionalidade

Documento de pesquisa (fase 0) para embasar uma aba de **fundamentos** dos ativos do universo. Complementa `docs/ANALISE-TECNICA.md`: a análise gráfica responde **quando** entrar; a fundamentalista responde **se o preço está caro ou barato** e **o que já está precificado**. Material educacional, não é recomendação de investimento.

> **Implementado:** a Fase 1 está na aba **Valor** (`assets/fa.js`, `assets/value-view.js`, `scripts/update_fundamentals.py`). Plano e decisões em `docs/PLANO-VALOR-FASE1.md`.

## 0. Resumo executivo

- O universo do Pêndulo é de **ETFs**, não de empresas. Fundamentos de ETF = fundamentos **agregados** das carteiras (P/L, lucro, dividendos), mais métricas próprias de cada classe (juros, crédito, commodities, câmbio).
- Proposta: um **placar de valor** por ativo (caro / neutro / barato) baseado em **percentil histórico do próprio ativo** e em **spreads contra os juros**, usado como **filtro de prazo longo** sobre os pares do pêndulo, e não como gatilho de entrada.
- A evidência é clara num ponto: valuation **explica bem o retorno de 5–10 anos** e **quase nada do retorno de 1–12 meses**. A funcionalidade deve deixar isso explícito na tela.
- Maior risco do projeto: **dados**. Sem chave de API, só existem fontes gratuitas instáveis para P/L de ETF. Recomendo começar pelas métricas que já vêm de séries de preços/juros (rendimentos, spreads, curva, real) e só depois o P/L agregado.

## 1. Princípios (o que a teoria diz)

| Escola / conceito                                      | Ideia central                                                                                                    | Como vira métrica no app                                                       |
| ------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------ |
| **Valor intrínseco** (Graham e Dodd, 1934)             | O preço oscila em torno de um valor dado pelos fluxos de caixa futuros; a "margem de segurança" protege do erro. | Distância entre preço e uma faixa de valor justo (percentil histórico).        |
| **Fluxo de caixa descontado** (Williams, 1938)         | Valor = soma dos fluxos futuros trazidos a valor presente pela taxa de desconto.                                 | Base teórica; DCF por ativo é inviável em ETF, usa-se a forma reduzida abaixo. |
| **Modelo de Gordon** (1959)                            | `P = D₁ / (k − g)` ⇒ `k = D/P + g`: retorno esperado ≈ rendimento + crescimento.                                 | Retorno implícito = dividend yield + crescimento de lucro.                     |
| **Rendimento do lucro e prêmio de risco** (Fed model)  | `E/P` da bolsa comparado ao juro do Tesouro mede o prêmio pago para correr risco de ação.                        | ERP = `E/P − juro real 10a` (ou `− TNX` na versão nominal).                    |
| **CAPE / Shiller P/E** (Campbell e Shiller, 1988/1998) | P/L sobre o lucro real médio de 10 anos remove o ciclo; CAPE alto prevê retorno baixo em 10 anos.                | CAPE e `1/CAPE` (rendimento cíclico) para SPY e regiões.                       |
| **Fatores** (Fama e French, 1992/1993; Asness et al.)  | Valor (preço baixo vs. fundamentos), qualidade e momentum explicam retornos de longo prazo.                      | Value vs. growth nos pares (ex.: XLK × XLF, QQQ × IWM).                        |
| **Paridade de juros e de poder de compra** (PPC/UIP)   | Moedas tendem ao valor de PPC no longo prazo; diferencial de juros explica o carrego.                            | Desvio da taxa de câmbio real; diferencial de juros (carry) em UUP, FXY, EMLC. |
| **Curva de juros** (expectativas + prêmio de prazo)    | Inclinação da curva antecipa ciclo; prêmio de prazo paga quem alonga.                                            | `TNX − IRX`, juro real, inclinação 10a–3m para TLT/TBF.                        |
| **Spread de crédito** (Merton, 1974)                   | O spread remunera perda esperada + prêmio de risco; abre antes de recessões.                                     | Spread de HYG/EMB contra Treasuries e seu percentil.                           |
| **Estrutura a termo de commodities** (Keynes, Kaldor)  | Backwardation (contango) indica escassez (excesso); o carrego da rolagem domina o retorno de ETFs de futuros.    | Roll yield de USO/DBC; preço real vs. média longa para GLD/SLV/COPX.           |

## 2. Métricas por classe do universo

| Classe                        | Ativos                                                                          | Métricas fundamentais                                                                                        | O que significa "barato"                                    |
| ----------------------------- | ------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------- |
| Ações EUA (índices e setores) | SPY, QQQ, IWM, XLK, XLF, XLE, XLV, XLY, XLP, XLI, XLU, XLB, XLC, SMH, KRE, SPXL | P/L futuro e passado, CAPE, E/P, dividend yield, P/VP, ERP, crescimento esperado de lucro, revisões de lucro | P/L abaixo do percentil 30 do próprio histórico; ERP alto.  |
| Ações internacionais          | EFA, VGK, EWJ, EEM, EWZ, EWW, FXI, INDA                                         | P/L, CAPE regional, dividend yield, **desconto relativo ao SPY**, câmbio real                                | Desconto vs. SPY maior que a média histórica do par.        |
| Imobiliário                   | VNQ, VNQI                                                                       | Dividend yield (proxy de FFO yield), spread vs. TNX                                                          | Spread do yield sobre o 10a acima da média.                 |
| Treasuries                    | TLT, TBF                                                                        | Juro nominal e real 10a/30a, inclinação da curva, juro real vs. crescimento                                  | Juro real alto e curva positivamente inclinada.             |
| Crédito                       | HYG, EMB, EMLC, BWX                                                             | Yield to worst, spread contra Treasuries, duration; EMLC/BWX: + carry cambial                                | Spread no percentil alto (risco já pago).                   |
| Commodities                   | GLD, SLV, USO, DBC, COPX, GDX                                                   | Preço real (deflacionado), estrutura a termo (roll), ouro vs. juro real, GDX: P/L e custo de extração        | Preço real abaixo da média longa; backwardation.            |
| Moedas                        | UUP, FXY (DXY, BRL, JPY)                                                        | Câmbio real (PPC), diferencial de juros (carry)                                                              | Moeda abaixo do valor de PPC com carry não negativo.        |
| Volatilidade                  | VIX, VIXY                                                                       | Não há fundamento de valor; contango do VIX gera perda estrutural                                            | Fora do placar de valor (mostrar só o aviso de decaimento). |

## 3. Fórmulas propostas (`assets/fa.js`, funções puras e testáveis como `ta.js`)

- **Rendimento do lucro**: `EY = 1 / PL` (usar P/L futuro 12m e passado).
- **Prêmio de risco de ação (ERP)**: `ERP = EY − juro real 10a`. Na falta do juro real (TIPS), usar `EY − TNX + inflação implícita` ou a versão nominal, sinalizando qual foi usada.
- **CAPE**: `P_real / média(L_real, 10 anos)`; `rendimento cíclico = 1 / CAPE`.
- **Retorno implícito (Gordon)**: `r ≈ DY + g`, com `g` = crescimento de lucro esperado limitado ao PIB nominal longo (~4–5%) para não explodir.
- **Retorno esperado de 10 anos (forma reduzida)**: `r₁₀ ≈ DY + g_real + inflação + (ln(CAPE_médio/CAPE_atual)/10)` (componente de reversão de múltiplo; mesma lógica de GMO e Research Affiliates).
- **Desconto relativo**: `desc = PL_ativo / PL_SPY − 1`; comparar com a média do par.
- **Spread de crédito**: `spread = YTW_fundo − juro do Treasury de mesma duration`.
- **Curva**: `incl = TNX − IRX` (já disponível no app).
- **Roll yield**: `(F₁ − F₂) / F₂ × (12 / meses entre vencimentos)`.
- **Percentil e z-score** de qualquer métrica sobre a janela disponível (mínimo 5 anos; idealmente 10–20): `z = (x − média) / desvio`.
- **Placar de valor**: média dos percentis das métricas da classe, invertidos quando "alto = caro" → 0–100. `≥ 70` barato · `30–70` neutro · `≤ 30` caro.

## 4. Do indicador à decisão (como encaixa no pêndulo)

1. **Filtro, não gatilho.** O fundamento muda devagar (mensal/trimestral). Ele deve ajustar **a proporção** dos pares e a cor da recomendação, nunca disparar compra sozinho. O gatilho continua sendo a aba **Quando entrar**.
2. **Por par:** `valor relativo = placar(▲) − placar(▼)`. Se a ponta comprada estiver mais barata que a vendida, o sinal ganha confirmação; se estiver mais cara, rebaixa para "momentum contra o valor" (aviso, não veto).
3. **Matriz momentum × valor** (Asness, Moskowitz e Pedersen, 2013): os dois fatores têm correlação negativa, então combinar os dois melhora o risco. Quatro quadrantes na tela: barato com momentum (melhor), caro com momentum (seguir com stop curto), barato sem momentum (esperar), caro sem momentum (evitar).
4. **Horizonte declarado:** cada número de valuation vem com a frase "explica retorno de 5–10 anos, não de semanas".

## 5. Evidência e limites

- **Campbell e Shiller (1988, 1998):** CAPE e dividend yield explicam ~30–40% da variação do retorno real de 10 anos do S&P 500; para 1 ano, quase zero.
- **Goyal e Welch (2008):** a maioria dos preditores de valuation não bate a média histórica **fora da amostra** em horizontes curtos. Reforça o uso como filtro de longo prazo.
- **Fama e French (1992):** prêmio de valor robusto por décadas, mas com um longo período negativo em 2007–2020 (crescimento ganhou). Valor pode ficar "barato" por anos.
- **Asness (2003), "Fight the Fed Model":** comparar E/P com juro **nominal** é teoricamente fraco (inflação afeta os dois lados); usar juro real.
- **Mudança estrutural:** recompras no lugar de dividendos, mais intangíveis e margens maiores elevam o "normal" do P/L; percentil de janela muito longa pode marcar "caro" para sempre (crítica de Siegel ao CAPE). Por isso, mostrar também o percentil de 10 anos.
- **Concentração:** P/L de ETF ponderado por valor de mercado é dominado pelas maiores posições (QQQ, XLK, SMH). O correto é o **P/L harmônico** (`Σ preço / Σ lucro`), não a média simples dos P/L.
- **Lucro negativo:** setores cíclicos (XLE, COPX, GDX, KRE) têm lucros que vão a zero; o P/L explode e engana. Usar P/VP ou P/L normalizado nesses casos.

## 6. Dados (o ponto crítico)

| Necessidade                      | Fonte gratuita candidata                                   | Risco                                                                                                                                                     |
| -------------------------------- | ---------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Juros (TNX, IRX), curva          | Já no app (Yahoo)                                          | Baixo.                                                                                                                                                    |
| Juro real e inflação implícita   | FRED (DFII10, T10YIE), CSV público sem chave               | Baixo; atualização diária.                                                                                                                                |
| Spreads de crédito               | FRED (BAMLH0A0HYM2, BAMLEMCBPIOAS)                         | Baixo. Uso de séries ICE/BofA tem restrição de redistribuição: verificar.                                                                                 |
| CAPE e dividend yield do S&P 500 | Planilha pública de Shiller (Yale), atualização mensal     | Médio: formato muda; requer parser no workflow.                                                                                                           |
| P/L e dividend yield de cada ETF | Yahoo `quoteSummary` (summaryDetail, defaultKeyStatistics) | **Alto:** não oficial, campos faltam para ETF, sujeito a 429 (já vivido nas notícias).                                                                    |
| P/L histórico por ETF            | Nenhuma fonte gratuita confiável                           | **Alto:** precisaremos **montar o histórico nós mesmos** gravando um ponto por dia em `data/fundamentals.json`. Percentis só ficam úteis depois de meses. |
| Preço real de commodities, PPC   | FRED (CPIAUCSL), OCDE (PPC)                                | Baixo/médio.                                                                                                                                              |

**Arquitetura recomendada:** igual à de `data/ohlc.json` — um script no workflow (`scripts/update_fundamentals.py`) grava `data/fundamentals.json` uma vez por dia; a página só lê o arquivo. Nada de chamada ao vivo para fundamentos.

## 7. MVP proposto (fases)

1. **Fase 1 — macro de valor (dados confiáveis):** ERP do SPY (E/P do Yahoo − juro real FRED), CAPE de Shiller, spreads de HYG/EMB, juro real e curva para TLT, ouro vs. juro real. Um card por classe com percentil e texto simples.
2. **Fase 2 — placar por ativo:** P/L, dividend yield e desconto vs. SPY para os ETFs de ações, com histórico gravado diariamente.
3. **Fase 3 — integração com os pares:** coluna "valor relativo" no ranking e matriz momentum × valor.
4. **Fase 4 — "Aprenda":** textos didáticos de cada métrica em `fa-glossary.js`, como em `ta-glossary.js`.

**Fora do escopo de propósito:** DCF por ETF, análise de balanço empresa a empresa e preço-alvo. Exigem dados que não temos e dariam falsa precisão.

## 8. Fontes

- Graham e Dodd, _Security Analysis_ (1934); Graham, _The Intelligent Investor_ (1949).
- Williams, _The Theory of Investment Value_ (1938).
- Gordon (1959), _Dividends, Earnings, and Stock Prices_, Review of Economics and Statistics.
- Campbell e Shiller (1988), _Stock Prices, Earnings, and Expected Dividends_, Journal of Finance; Shiller, _Irrational Exuberance_. Dados: <http://www.econ.yale.edu/~shiller/data.htm>
- Fama e French (1992), _The Cross-Section of Expected Stock Returns_, Journal of Finance.
- Asness (2003), _Fight the Fed Model_, Journal of Portfolio Management.
- Asness, Moskowitz e Pedersen (2013), _Value and Momentum Everywhere_, Journal of Finance.
- Goyal e Welch (2008), _A Comprehensive Look at the Empirical Performance of Equity Premium Prediction_, Review of Financial Studies.
- Damodaran, _Equity Risk Premiums_ (atualização anual) e dados: <https://pages.stern.nyu.edu/~adamodar/>
- Merton (1974), _On the Pricing of Corporate Debt_, Journal of Finance.
- Erb e Harvey (2006), _The Strategic and Tactical Value of Commodity Futures_, Financial Analysts Journal.
- Erb e Harvey (2013), _The Golden Dilemma_ (ouro e juro real).
- CFA Institute, currículo Level I/II: Equity Valuation e Fixed Income.
- FRED (Federal Reserve Bank of St. Louis): <https://fred.stlouisfed.org/>

## 9. Riscos e decisões em aberto

- **Dependência do Yahoo para P/L:** se o campo falhar, o placar some. Mitigar com fallback "sem dado" explícito, nunca zero.
- **Histórico curto no início:** percentil com poucos meses de dados engana. Mostrar "histórico insuficiente" até 2 anos, ou usar só CAPE/spreads (que têm décadas) na Fase 1.
- **Mistura de horizontes:** usuário pode ler "barato" como "compre hoje". A tela precisa repetir o horizonte de 5–10 anos.
- **Licença de dados:** confirmar termos de uso das séries ICE/BofA no FRED antes de gravar no repositório público.

## 10. ETFs na aba Análise e na Decisão do trader (`assets/etf-fund.js`, 10/2026)

Até aqui, ETF só tinha nota quando o Yahoo informava P/L (SPY, QQQ, SCHD). Alavancados, inversos, renda fixa e ouro ficavam sem fundamentos. Princípio adotado: **o fundamento de um ETF é o fundamento do que ele carrega, menos o custo da estrutura.**

| Classe                           | Como pontua                                                                                                                                                                                                                                                                                      | Confiança |
| -------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------- |
| Ações (SPY, SCHD)                | Carteira do fundo (Yahoo `topHoldings`): P/L contra o S&P 500 (60%), crescimento do lucro em 3 anos (25%), dividend yield (15%); P/fluxo de caixa entra no valor. Sem look-through: P/L do resumo.                                                                                               | Média     |
| Alavancado/inverso (NVDL, TMV)   | Nota do ativo de referência (NVDA, TLT…), espelhada no inverso (100 − nota), menos o **custo de carregar** ≈ L(L−1)/2·σ² ao ano (σ do ativo de referência = σ do ETF ÷                                                                                                                           | L         | ) + taxa. 5% ao ano tira 4 pontos, 15% tira 12, 30% tira 22, 60% tira 35. | Baixa |
| Renda fixa (TLT, IEF, HYG)       | **Margem = taxa ÷ duration** (pontos-base que o juro pode subir em 12 meses sem prejuízo), prêmio sobre o caixa (taxa − T-bill) e juro real de 10 anos. Tesouro usa a taxa do trecho da curva (^IRX, ^TNX, ^TYX); crédito usa o yield do fundo. Duration: Yahoo, tabela ou faixa pela categoria. | Média     |
| Ouro (GLD, IAU)                  | Juro real de 10 anos (FRED DFII10): o custo de oportunidade de um ativo que não rende. Sem o real, estima 10 anos − 2,3%.                                                                                                                                                                        | Baixa     |
| Outras commodities, volatilidade | Sem fundamento calculável com dado gratuito (curva de futuros); só técnico e momentum, com o motivo na tela.                                                                                                                                                                                     | –         |

A taxa de administração passou a vir do `fundProfile` (antes vinha sempre vazia) e ETF acima de 0,75% ao ano ganha o alerta. O servidor (`api/analyze`) anexa a cada ETF o que ele precisa: `item.under` (fundamentos do ativo de referência, buscados à parte quando não estão na lista) e `item.macro` (juros). Na Decisão do trader, a confiança da sub-análise fundamentalista do ETF segue a da classe acima.

## Alavancados e cestas: ativo de referência, analistas e média ponderada

- O ativo de referência (NVDL → NVDA, UCYB → CIBR) é buscado sempre que o ticker é um alavancado conhecido, mesmo se o resumo do próprio ETF falhar (antes, sem o resumo, o trader ficava só com técnico e histórico).
- Analistas: sem cobertura própria, vale a do ativo de referência (potencial até o preço-alvo e recomendação), espelhada no inverso.
- Cestas de ações (ETF temático ou referência de alavancado): além do P/L da carteira do Yahoo, busca-se as 8 maiores posições e faz-se a **média ponderada pelo peso** da nota de fundamentos e dos analistas (exige 25% do fundo coberto). Os dois métodos pesam 50/50 nos fundamentos.
- Detalhe do ativo: manchetes, analistas e composição do ativo de referência aparecem abaixo do contexto do alavancado.
