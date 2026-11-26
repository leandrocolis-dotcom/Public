# Pêndulo 2.0: lógica financeira, decomposição e validação (20/11/2026)

Status (20/11/2026): **P0 entregue; P1 rodada e REPROVADA pelo critério fixado antes** (`docs/ESTUDO-PENDULO.md`,
`data/pendulum-study.json`). P2–P5 não começam; o pêndulo atual segue oficial. Não reajustar as forças para "passar"
(superajuste): uma nova rodada exige hipótese nova registrada antes.

Resultado fora da amostra (2012–2026, taxa base de queda > 10% em 63d = 10,7%):

- Brier skill: **MM200 simples 0,091** > crédito sozinho (HYG/IEF, 0,074–0,079) > Tendência + Vol 0,055 > 2.0 0,032 ≈
  atual (h=1) 0,034. O 2.0 não bate o atual nem a MM200 (p = 0,85 contra a MM200).
- Quintis: o 2.0 é perfeitamente monotônico (22,9% → 3,6% de queda; Spearman −1) e o atual também; a MM200 concentra
  mais no quintil de baixo (32%, 2,98× a base) mas não é monotônica (o quintil de cima volta a 8,5%).
- Faixa de defesa do 2.0 (19% dos dias) teve 24% de queda > 10% contra 3,7% na faixa de risco: **útil como leitura**,
  não melhor que a MM200 para decidir.
- HP1 não (2,13× mas o atual já faz 1,73×); HP2 não; HP3 sim; HP4 sim (Crescimento não ajuda); HP5 não pelo CAGR
  (queda máx. de −52% para −17%, mas CAGR 8,7% × 10,8%, 2,1 p.p. abaixo do limite de 1,5 p.p.).
- Leitura prática: para "deixar de perder", a regra simples (SPY × MM200, com crédito como segunda opinião) é o que
  o estudo sustenta. Candidata a hipótese nova: MM200 + crédito (variação de 60d), registrada antes de testar.
- **Plano de implementação seguinte: `docs/PLANO-PENDULO.md`** (janela do pêndulo + pano de fundo).

## 1. Diagnóstico do pêndulo atual

| Ponto           | Hoje                                                                                  | Problema                                                                                                                                                  |
| --------------- | ------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Horizonte       | Início usa `regime(close, h=1)`: variação de **1 pregão** de cada razão, em desvios   | Mede o _movimento do dia_, não o _regime_. Um dia de alta forte vira "Risco" mesmo com mercado em tendência de baixa.                                     |
| Redundância     | 14 razões: SPY/TLT, XLY/XLP, IWM/SPY, RSP/SPY, EEM/EFA, 4 bolsas, AUDJPY, cobre/ouro… | ~10 delas são o mesmo fator (beta de ações). A literatura mostra que pouco acrescentam além de tendência + vol; o sinal é contado várias vezes.           |
| O que falta     | Vol entra só com 15% (VIX nível e VIX/VIX3M)                                          | Faltam os indicadores com evidência mais forte: vol realizada, tendência longa (MM200/10 meses), crédito em _variação_, curva 3m10y, prêmio de variância. |
| Nível × mudança | Tudo é mudança curta                                                                  | Crédito e estresse informam no nível (percentil longo) **e** na mudança de 20–60 dias; hoje não há "estado".                                              |
| Validação       | Só uma checagem de 14 meses: SPY 5d por faixa, não monotônica                         | Nenhum teste de queda/vol futura, de faixas negativas ou fora da amostra.                                                                                 |
| Carteira        | Beta de 252 dias; sinergia com "alfa de hoje" (20%)                                   | Beta de alavancados deve ser diário e curto (60d); defesa pede **beta de queda**; alfa de 1 dia é ruído.                                                  |

## 2. O que a pesquisa diz (resumo; fontes no fim)

1. **Prever risco funciona; prever retorno, quase não.** Goyal–Welch: quase nenhum preditor bate a média fora da
   amostra. O que sobrevive: vol (agrupa e persiste), tendência, crédito (risco de recessão/queda) e combinações de
   muitos sinais fracos. Logo, o pêndulo deve ser um **medidor de risco que dirige a exposição**, com leve inclinação
   direcional, não um "acertador de topo/fundo".
2. **Ranking por evidência**
   - A (forte): vol realizada 20–60d; tendência (MM200 / 10 meses / retorno 12-1); spread de crédito high yield
     (nível + alargamento; HYG/IEF); curva 3m10y (pano de fundo de 6–18 meses, peso baixo).
   - B (condicional): prêmio de variância (VIX² − vol realizada²), estrutura do VIX (VIX/VIX3M > 1 = estresse que
     persiste, não sinal de venda), índice de turbulência (Kritzman), razão de absorção (PCA dos setores, na
     variação), ΔNFCI (só a variação semanal, pelas revisões), correlação ações × títulos (diz se TLT protege).
   - C (popular, fraco fora da amostra): cobre/ouro, XLY/XLP, IWM/SPY, RSP/SPY (estruturalmente negativo pela
     concentração), EEM/EFA, amplitude isolada, dólar (sinal muda de lado), MOVE fora de extremos, Markov.
3. **Montagem:** agrupar primeiro em fatores interpretáveis, depois combinar com peso igual por fator (sem
   regressão conjunta, que superajusta). Padronizar por percentil/z de janela longa (3–5 anos, só dados até t).
   Separar **estado** (nível) de **impulso** (mudança). Assimetria e histerese: o estresse empurra rápido para a
   defesa e a volta ao risco é lenta (ex.: entra em defesa < −30, sai > −10).
4. **Validação honesta:** walk-forward, alvos = vol realizada futura 21/63d, probabilidade de queda > 10% em 63d
   (Brier e calibração contra a taxa base), Sharpe e drawdown por quintil do pêndulo (precisa ser monotônico);
   comparar com MM200 simples e com vol targeting simples; contar todas as variantes testadas (Sharpe deflacionado).
   Ganho realista: Sharpe +0,1 a +0,3 e drawdown máximo de 1/3 a 1/2 menor, pagando atraso em fundos em V. Mais que
   isso é suspeito.
5. **Exposição:** beta-alvo = (vol-alvo ÷ vol prevista) × inclinação do regime, com teto; corte extra quando o S&P
   está abaixo da MM200; rebalancear só se o desvio passar de ~0,15 de beta. Alavancados/inversos: beta diário
   ≈ L × beta do subjacente, janela curta, e mostrar o custo de decaimento (≈ −L(L−1)σ²/2) quando mantidos por dias.

## 3. Arquitetura proposta: 6 forças do pêndulo

Cada força tem **estado** (percentil de 3–5 anos, −100 a +100) e **impulso** (variação de 20 dias), e aparece numa
linha própria no detalhamento.

| Força                 | Indicadores (tickers Yahoo/FRED já disponíveis)                                                    | Peso inicial                           |
| --------------------- | -------------------------------------------------------------------------------------------------- | -------------------------------------- |
| Tendência             | SPY, ACWI e EEM contra a MM200 e a MM50; retorno 12-1 do SPY; % de setores acima da MM200          | 1/6                                    |
| Volatilidade/estresse | vol realizada 20d do SPY (percentil), ^VIX, ^VIX/^VIX3M, prêmio de variância, turbulência da cesta | 1/6                                    |
| Crédito/liquidez      | HYG/IEF e JNK/IEF (nível + 20/60d), BAMLH0A0HYM2 (quando houver), ΔNFCI                            | 1/6                                    |
| Crescimento           | PC1 (ou média) de XLY/XLP, XLI/XLU, IWM/SPY, cobre/ouro; T10Y3M lento                              | 1/6                                    |
| Inflação/juros        | TIP/IEF (implícita), tendência de DBC e USO, variação do juro real 10a                             | 1/6 (entra no quadrante, não no sinal) |
| Global/dólar          | UUP/DXY (tendência), EEM/SPY, EFA/SPY, iene (FXY)                                                  | 1/6                                    |

Saídas na tela:

- **Pêndulo (−100 a +100)** = média das forças, com histerese nas faixas.
- **Probabilidade de queda > 10% em 3 meses** e **vol prevista** (camada logística simples, uma variável por
  força, reestimada uma vez por ano em janela crescente). É a leitura principal de "deixar de perder".
- **Quadrante crescimento × inflação** (pela variação, não pelo nível), que diz também se títulos protegem.
- **Movimento de hoje:** a conta atual (h=1) continua, rebaixada a "o que mudou hoje", sem decidir a faixa.

Pêndulo da carteira: beta diário de 60d (com encolhimento para 1 nos nomes soltos) + **beta de queda**; alvo =
vol-alvo ÷ vol prevista × inclinação do regime, entre 0,2 e 1,2; sinergia troca o "alfa de hoje" pelo alfa de 20d.

## 4. Fases

| Fase        | Entrega                                                                                                                                                                                                                                                                      | Critério para seguir                                                                                |
| ----------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------- |
| P0          | Hipóteses registradas antes do teste (abaixo); correção do doc `REGIME-INTENSIDADE.md` (fórmula dos blocos desatualizada)                                                                                                                                                    | —                                                                                                   |
| P1 Estudo   | `scripts/pendulum-study.mjs` (workflow `model-study.yml`, `study: pendulum`) com 2007–2026 diário via `scripts/lib/study-data.mjs`: refaz o pêndulo atual (h=1, 5, 21) e as 6 forças; alvos e protocolo da seção 2.4 → `data/pendulum-study.json` + `docs/ESTUDO-PENDULO.md` | 2.0 bate o atual **e** a MM200 simples em Brier de queda e em drawdown por quintil, fora da amostra |
| P2 Motor    | `assets/pendulum2.js` (puro) + testes; dados de entrada em `data/pendulum-inputs.json` pelo cron diário; leitura em modo sombra lado a lado com o atual                                                                                                                      | P1 aprovada                                                                                         |
| P3 Tela     | Detalhamento com as 6 forças (estado e impulso em barrinhas), probabilidade de queda, quadrante, "movimento de hoje"; histórico e avisos 🧭 passam a usar a faixa com histerese                                                                                              | —                                                                                                   |
| P4 Carteira | Beta 60d diário + beta de queda, alvo por vol, custo de decaimento dos alavancados, sinergia sem alfa de 1 dia                                                                                                                                                               | P1 mostra que o alvo por vol reduz drawdown sem custo de retorno relevante                          |
| P5 Troca    | O pêndulo 2.0 vira o oficial só por ordem do usuário, depois de ≥ 2 meses de diário fora da amostra (regra do `OBJETIVO.md`)                                                                                                                                                 | ordem do usuário                                                                                    |

### Hipóteses registradas (P0)

- **HP1:** quintil inferior do pêndulo 2.0 concentra ≥ 2× a taxa base de quedas > 10% em 63d; o pêndulo atual (h=1)
  não (≤ 1,3×).
- **HP2:** a força Volatilidade prevê a vol realizada de 21d melhor que a vol de hoje sozinha (R² incremental > 0).
- **HP3:** Crédito em _variação_ de 60d tem mais poder que em nível para quedas de 63d.
- **HP4:** Crescimento (as razões de beta) acrescenta < 10% de explicação quando Tendência e Vol já estão no
  modelo; se confirmado, o peso dela cai pela metade.
- **HP5:** beta-alvo por vol + MM200 reduz o drawdown máximo do SPY em ≥ 30% com CAGR no máximo 1,5 p.p. abaixo.

## 5. Riscos

- **Dados:** `data/hist` tem só 2 anos e `flow.json` tem 300 pregões; o estudo precisa da série longa do Yahoo
  (HYG desde 2007, ^VIX3M desde 2007). O HY OAS do FRED só tem os últimos ~3 anos (licença da ICE): crédito usa
  HYG/IEF.
- **Superajuste:** 6 forças × variantes de janela. Limitar a ≤ 3 janelas por força e contar todas no Sharpe deflacionado.
- **Atraso:** a tendência atrasa em fundos em V (2020); daí a vol e o crédito com impulso rápido.
- **Custo de CPU:** cálculo pesado no cron (GitHub Actions), não na Vercel (regra do projeto).

## Fontes principais

Goyal & Welch (NBER w10483); Rapach, Strauss & Zhou (RFS 2010); Neely, Rapach, Tu & Zhou (2014); Moskowitz, Ooi &
Pedersen (2012) e Hurst, Ooi & Pedersen (AQR, século de tendência); Gilchrist & Zakrajšek (EBP, NBER w17021);
Engstrom & Sharpe (Fed, 2022); Bollerslev, Tauchen & Zhou (VRP, 2009); Kritzman & Li (turbulência, FAJ 2010);
Kritzman et al. (razão de absorção, 2011); Chicago Fed (revisões do NFCI); AQR (correlação ações × títulos, 2023);
Bridgewater (All Weather); Harvey et al. (vol targeting, 2018); Cederburg et al. (crítica a Moreira–Muir, 2020);
Ang, Chen & Xing (beta de queda, 2006); Cheng & Madhavan / Avellaneda & Zhang (ETFs alavancados); Bailey & López de
Prado (Sharpe deflacionado, PBO); State Street Risk Appetite (percentis, suavização de 20 dias).
