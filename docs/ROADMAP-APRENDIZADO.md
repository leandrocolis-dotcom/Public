# Roadmap: aprendizado do modelo 2.0 (vantagem em R, excesso, regime, horizonte por tipo)

> Scripts citados aqui e removidos do repo em 21/11/2026 (estudo encerrado; conclusões abaixo valem): `backfill-model.mjs`, `trend-study.mjs`. Para rodar de novo: `git show a3845cf:scripts/<nome>.mjs > scripts/<nome>.mjs`.

> **Para quem continuar (outra conta/sessão):** leia este arquivo, `assets/learner.js`, `scripts/train-model.mjs`,
> `assets/edge.js` e `docs/ANALISE-TECNICA.md` §4.1. Continue da **primeira fase não marcada [x]**, sem parar e sem
> pedir confirmação, até a última. Ao terminar cada fase: `npm run lint`, `npm run format:check`, `npm test`
> (e `npm run preload` se criar módulo), commit, merge no `main` e push (deploy). Atualize o status abaixo.

## Autorização do usuário (09/10/2026)

O usuário pediu explicitamente: "implemente todas [as 7 melhorias] em seguida e só pare quando entregar em produção;
faça um extensivo estudo retroativo com os ativos das listas". Isso **autoriza mudar os limites e o critério de
aprovação** do aprendizado (CLAUDE.md exige pedido do usuário). **NÃO autoriza** aplicar o modelo na aba Decisões:
o modelo continua em **modo sombra**.

## Por que (resumo da crítica)

1. Aprovação por % de acerto (Atingiu/Parcial) ignora payoff, stop e custo → elimina tendência boa (40% de acerto, 3R)
   e aprova lógica que acerta pouco e perde muito.
2. Acerto contra zero num mercado de alta: lógicas de compra "acertam" por inércia; pesos premiam o otimismo.
3. Horizonte único de 5 pregões: decisões de tendência precisam de ~20 (teste: −0,01R em 10 pregões × +0,25R em 20).
4. Dezenas de lógicas testadas a 90% → ~4 aprovadas por sorte (falta correção para testes múltiplos).
5. Sem separação por regime: o diário começou em alta; lógica aprovada só em alta pode quebrar na queda.
6. O filtro de vantagem (assets/edge.js) não é validado pelo diário.
7. Pesos por acerto de direção, não por correlação com o retorno em excesso.

## Fases

- [x] **F1. Diário enriquecido (só grava, compatível com o antigo).** Em cada gatilho novo do `train-model.mjs`:
      `k` = risco por unidade (2,5 × ATR14 ÷ preço), `g` = regime (1 = S&P acima da MM200, 0 = abaixo),
      nas decisões `eg` = nota A–D e `eb` = 1 se o filtro bloquearia (decisionEdge com dados até o dia),
      `h` = horizonte da lógica (dec = 20, sig = 5, level = 5). No fechamento (`settleJournal`): `ret` (5 pregões, como hoje),
      `ret20`, `rR` = resultado em R com stop (2,5 ATR, intradiário pela mínima/máxima quando houver, senão fechamento),
      custo 0,05% por perna, no horizonte da lógica, e `xR` = rR menos o R médio do universo no mesmo dia/horizonte (excesso).
      Entradas antigas sem esses campos continuam válidas (só ficam fora das métricas novas).
- [x] **F2. Métricas novas em `learner.js`:** por lógica e por DIA: expectativa em R (`exR`), excesso (`exX`), erro-padrão
      e limites (t de Student, 90%), acerto em R, separação por regime (alta/baixa), e o acerto antigo (mantido como info).
- [x] **F3. Critério novo de aprovação** (autorizado): lógica que manda operar é aprovada se, com ≥ 30 dias,
      o excesso médio em R > 0 e passa a correção de Benjamini-Hochberg (FDR 10%) entre todas as lógicas avaliadas;
      eliminada se o limite otimista do excesso < 0 (antecipada com ≥ 15 dias) ou, com ≥ 30 dias, excesso ≤ 0.
      Lógicas de "esperar" continuam pelo critério antigo (acerto ≥ 60%), porque não têm R. Revive com excesso > +0,05R.
      Modelo final: além dos critérios atuais, exige que nenhuma aprovada tenha excesso claramente negativo no regime de
      baixa (≥ 10 dias e limite otimista < 0) e marca "testado só em alta" quando o regime de baixa tiver < 10 dias.
      `model.v = 2`: migração recalcula os status a partir do diário.
- [x] **F4. Pesos por correlação:** alvo de cada sub-análise pela correlação de postos (Spearman) entre a opinião
      (sub.dir) e o excesso em R da decisão (horizonte 20), com ≥ 50 decisões; IC 0 = peso original; cada +0,05 de IC =
      +20% de peso, limites 0,5×–1,5×, passo de 25% (como hoje).
- [x] **F5. Validação do filtro de vantagem:** no diário real e no estudo retroativo, comparar excesso em R das decisões
      com `eb = 1` (bloqueadas) × `eb = 0`, e por nota A/B/C/D. Mostrar na tela.
- [x] **F6. Estudo retroativo extenso** (`scripts/retro-study.mjs` → `data/model-retro.json` +
      `docs/ESTUDO-RETROATIVO.md`): ativos do Pêndulo + carteira e watchlists da nuvem (Supabase:
      `pendulo_portfolio.holdings`, `pendulo_watchlists.lists`). Replay ponto-a-ponto (sem olhar o futuro) de ~2 anos:
      decisões do trader, sinais e níveis, com R, excesso, regime, horizonte por tipo, nota de vantagem calculada só com
      trades encerrados até o dia. Saídas: métricas por lógica (antigas e novas), por regime, validação do filtro, IC das
      sub-análises, o que o critério novo aprovaria/eliminaria. É **prévia** (as regras foram escolhidas com esses anos):
      não aprova nada no modelo real.
- [x] **F7. Tela (Simulador → 🧠 Aprendizado):** colunas novas (expectativa e excesso em R, por regime, horizonte),
      bloco "O filtro de vantagem funciona?", pesos por correlação e aba/bloco "Estudo retroativo".
- [x] **F8. Fechamento:** testes (`tests/learner.test.js`, `tests/edge.test.js`), docs (`docs/ANALISE-TECNICA.md`,
      `CLAUDE.md`), workflow diário rodando o script novo, deploy, conferência na tela.

## Fase 2 (autorizada em 09/10/2026: "faça o que você recomenda e implemente")

Muda decisões AO VIVO da Decisão do trader (abas Análise e Decisões). O modelo em treino segue em modo sombra.

- [x] **F9. Momentum 12-1 na Decisão do trader:** nova sub-análise `trend` (momentum de série temporal,
      Moskowitz-Ooi-Pedersen; Jegadeesh-Titman): retorno de 12 meses sem o último mês, dir = clamp(m ÷ 20%),
      confiança pela consistência (6 e 12 meses no mesmo sentido). Pesos: técnica 30%, momentum 20%, fundamentos 20%,
      mercado 15%, situações parecidas 15%.
- [x] **F10. "Comprar em partes / no recuo" só a favor da tendência:** se o momentum 12-1 não for positivo, a decisão
      vira "Aguardar" (comprar recuo de ativo sem tendência foi a pior lógica do estudo: −0,19R/dia).
- [x] **F11. Validação:** rodar `scripts/retro-study.mjs` antes/depois e registrar a comparação em
      `docs/estudo-conclusoes.md`. Escolha feita pela teoria, testada uma vez (sem otimizar parâmetros). Se piorar, reverter.
- [x] **F12. Fechamento:** testes, textos da tela (pesos citados na nota da Decisão do trader), deploy.

## Fase 3 (pedido do usuário em 09/10/2026: "pegue dados históricos de 60 dias, faça testes e salve os aprendizados")

- [x] **F13. Backfill do diário (`scripts/backfill-model.mjs`):** reconstrói os 60 pregões anteriores ao início do
      diário real, um por um e só com os dados até cada data (sem fundamentos antigos), gravando os gatilhos com `bf: 1`.
      Treina em caminhada para frente: a cada pregão, fecha só os resultados já conhecidos naquela data e roda `trainStep`
      (retreinos a cada 5 pregões, como seria ao vivo). Depois junta o diário real e retreina até hoje.
      `model.startDate` passa a ser o 1º dia do backfill; `model.backfill` registra período e ressalvas.
- [x] **F14. Aprendizados:** relatório `docs/APRENDIZADO-BACKFILL.md` (status das lógicas, filtro de vantagem, pesos,
      critérios do modelo final) e aviso na tela do Aprendizado de que parte do diário é reconstruída.
- Ressalva: o backfill não é tão limpo quanto o diário ao vivo (regras criadas em 2026 já "viram" esse período; sem
  fundamentos antigos). Por isso os gatilhos levam a marca `bf` e a tela mostra quantos dias são reconstruídos.

## Fase 4 (pedido do usuário em 09/10/2026: estudo retroativo com a lista de ativos setoriais)

Não há lista setorial salva na nuvem (pendulo_watchlists vazia). Universo usado: os 46 ETFs setoriais do Mapa de
fluxo (us_sectors, us_ind, gl_sectors).

- [x] **F15. Estudo retroativo setorial:** `scripts/retro-study.mjs --only=<46 setoriais> --out=setores` (10 anos),
      mesmas regras do estudo geral, para ver se as lógicas se comportam diferente em setores.
- [x] **F16. Rotação setorial (sistema-semente da lição 17):** `scripts/sector-study.mjs`, mensal, com custos.
      Regras definidas ANTES do teste: (a) top 3 dos 11 setores SPDR por retorno de 6 meses, só com o S&P acima da MM200,
      senão caixa (T-bill); (b) a mesma regra com momentum 12-1; (c) top 3 sem o filtro da MM200. Comparar com o S&P
      comprar e segurar e com os 11 setores em pesos iguais: CAGR, volatilidade, Sharpe, drawdown máximo e Calmar.
      Período fora da amostra principal: também separado em 2016–2020 × 2021–2026. Nada vai para as decisões ao vivo
      sem ordem do usuário.
- [x] **F17. Aprendizados** em `docs/ESTUDO-SETORIAL.md`.

## Fase 5 (09/10/2026: estudo com o "Universo de Setores" enviado pelo usuário)

Lista salva em `data/universo-setores.json` (rótulo → ETF, LEV, INV, SINGLE). Perguntas definidas antes do teste:

- [x] **F18. Lógicas por tipo de ativo:** estudo retroativo (10 anos ou o histórico que houver) separado em ETF 1x,
      alavancados (LEV), inversos (INV) e ações individuais (SINGLE). Hipótese: alavancados e inversos têm excesso pior
      (decaimento), o que validaria a marca de decaimento do filtro de vantagem.
- [x] **F19. Lógicas por bloco:** IA, Tecnologia/Comunicação, Consumo, Saúde, Financeiro, Industrial, Materiais,
      Energia/Utilities, Imobiliário, Commodities, Cripto, Mercado amplo, Juros. Só leitura (sem correção de testes
      múltiplos entre blocos: é exploratório e será dito assim).
- [x] **F20. Aprendizados** em `docs/ESTUDO-UNIVERSO-SETORES.md`; nada muda nas decisões ao vivo sem ordem do usuário.

## Fase 6 (09/10/2026: trend following como na pesquisa)

- [x] **F21. `scripts/trend-study.mjs`:** momentum de série temporal (Moskowitz, Ooi e Pedersen 2012; Hurst, Ooi e
      Pedersen 2017) em ETFs de várias classes: ações (SPY, EFA, EEM), juros (IEF, TLT), ouro (GLD), commodities (DBC),
      dólar (UUP). Regras definidas ANTES: sinal = sinal do retorno de 12 meses; comprado ou vendido; cada ativo com
      volatilidade-alvo de 10% a.a. (vol de 60 dias), carteira em risco igual, alavancagem bruta máx. 3x; rebalanceio
      mensal; custo 0,05% no giro; caixa rende T-bill (BIL). Variante: só comprado. Comparar com SPY e 60/40 (SPY/IEF):
      CAGR, vol, Sharpe, queda máxima, correlação com SPY e resultado nas crises (2008, 2020, 2022).
- [x] **F22.** Relatório `docs/ESTUDO-TENDENCIA.md`.

## Fase 7 (09/10/2026: nova direção, docs/OBJETIVO.md — gatilhos medidos em dinheiro absoluto)

Regras definidas ANTES do teste. Universo: ETFs do Pêndulo (47) + inversos −1x reais (SH, PSQ, RWM, DOG, TBF, EFZ,
SEF, REK). 10 anos, Yahoo ajustado. Horizonte 20 pregões; também 5 e 60. Estatística por data (cada pregão vale 1).

- [x] **F23. Saída/proteção (já alocado) vs continuar segurando:** gatilhos S1 placar técnico ≤ −20 ("reduzir"),
      S2 fechamento < MM200, S3 fechamento < MM50, S4 queda de 3 ATR desde a máxima de 60 dias (stop móvel), S5 queda além
      do ruído (sinal "breakdown"). Serve se o retorno médio depois do gatilho for < 0 (sair evita perda) E a chance de
      queda > 5% for maior que num dia qualquer. Mede também a alta perdida.
- [x] **F24. Entrada (ganhar dinheiro) vs dia qualquer e vs caixa:** E1 placar ≥ +45 ("comprar"), E2 rompimento da
      máxima de 55 dias, E3 recuo em tendência (acima da MM200 e RSI(2) < 10), E4 momentum 12-1 no top 20% do universo.
      Serve se o retorno médio depois do gatilho (com 0,1% de custo de ida e volta) > retorno de um dia qualquer.
- [x] **F25. Inverso depois de um gatilho de saída:** quando S1–S5 disparam no ativo, comprar o inverso −1x real dá
      lucro absoluto em 20 pregões? Hipótese do usuário; registrada para teste.
- [x] **F26. Pares do Pêndulo:** medir em dinheiro a regra de entrada dos pares (comprar a líder no recuo / vender a
      outra) em 10 anos, e acompanhar os pares ativos na tela.
- [x] **F27.** Relatório `docs/ESTUDO-GATILHOS.md`; gatilhos aprovados viram alertas; reprovados saem da tela. **Entregue em 09/10/2026:** nenhum aprovado; ver `docs/ESTUDO-GATILHOS.md`.

## Status

- 09/10/2026: F1 a F8 entregues e em produção.
  - Diário real grava k, g, eg, eb e h desde 09/10/2026 (as 124 entradas anteriores ficam só na regra antiga).
  - Estudo retroativo: 10 anos, 50 ativos (Pêndulo + carteira), 51 mil gatilhos. Nenhuma lógica que manda operar
    passou na correção de testes múltiplos; "Comprar em partes / no recuo" foi a pior (−0,19R por dia); o filtro de
    vantagem separa bloqueadas × liberadas na direção certa, mas as notas A/B não ordenam o resultado. Ver
    `docs/ESTUDO-RETROATIVO.md` e `docs/estudo-conclusoes.md`.
  - Workflow semanal `.github/workflows/retro-study.yml` refaz o estudo com as listas da nuvem.
  - Fase 2 (09/10/2026): F9 e F10 testados no estudo de 10 anos e **revertidos** (pioraram as compras). Aplicado:
    "Comprar em partes / no recuo" vira "Aguardar" nas decisões ao vivo (gate); Simulador e treino seguem medindo.
    Detalhes em `docs/estudo-conclusoes.md`.
  - Fase 3 (09/10/2026): backfill de 60 pregões (14/07 a 06/10) gravado no modelo e no diário (13 versões).
    Aprendizados em `docs/APRENDIZADO-BACKFILL.md`. Vendas > compras; "Queda além do ruído → vender" aprovada.
  - Fase 4 (09/10/2026): estudo setorial em `docs/ESTUDO-SETORIAL.md`. A rotação setorial perdeu para o S&P
    comprado e parado (7,9% × 14,8% ao ano, 2009–2026); o card de regime e a lição 17 foram corrigidos. "Reduzir"
    aprovada também em setores.
  - Fase 5 (09/10/2026): universo de 508 ativos do usuário em `docs/ESTUDO-UNIVERSO-SETORES.md`. O tipo de ativo
    inverte o resultado (ETFs: reduzir ganha, comprar perde; ações: comprar ganha, reduzir perde). "Comprar em partes"
    → "Aguardar" restrito a ETFs/fundos. Correção do risco mínimo (minK = 1%) para medir em R; backfill refeito.
  - Fase 6 (09/10/2026): trend following multiclasse em `docs/ESTUDO-TENDENCIA.md`: retorno baixo (2,8%–3,6% a.a.), correlação ≈ 0 com o S&P, ganhou em 2008 e 2022.
  - Pendências que dependem do usuário: rever "Comprar em partes" na Decisão do trader; testar momentum 12-1 como
    parte da decisão; aplicar o modelo na aba Decisões (só com ordem dele).

## Fase 8 (12/10/2026, autorizada pelo usuário e entregue): modelo único

Especificação em `docs/MODELO-UNICO.md`. Regras e critérios devem ser registrados antes de cada rodada; nada altera a aba
Decisões nem os limites do aprendizado sem autorização.

- [x] **F28 (H1).** Catraca + MM200 mensal do ativo × stop fixo de 8% (40 ETFs, 10 anos, por regime). **12/10/2026: reprovada** (queda máx. −5,4% × −23,2%, mas ganho 5,5% × 7,6% a.a.); fica o stop 2,5 ATR. `docs/ESTUDO-CATRACA.md`.
- [x] **F29 (H2).** Score estilo SCTR (60/30/10) × momentum 12-1 como ordenador de excesso. **12/10/2026: reprovada** (IC ≈ 0,03 nos dois em 20 pregões; nenhum passa no BH; SCTR inverte no regime de baixa). Fica o 12-1. `docs/ESTUDO-SCTR.md`.
- [x] **F30 (H3/H4).** Top 20% + regime mensal × SPY + MM200 mensal (o satélite só existe se ganhar do núcleo protegido). **12/10/2026: reprovada** (retorno/queda 0,37 × 0,39; ganho 8,8% × 9,4% a.a.); sem satélite. Obs.: segurar SPY teve retorno/queda 0,46, acima dos dois. `docs/ESTUDO-SATELITE.md`.
- [x] **F31 (H5).** Risco igual por ativo (peso ∝ 1/ATR) × pesos iguais. **12/10/2026: reprovada** (Sharpe 0,80 × 0,82). `docs/ESTUDO-RISCO-IGUAL.md`.
- [x] **F32 (H6).** Núcleo-satélite 70/30 × 100% núcleo × 100% satélite. **12/10/2026: aprovada sem efeito** (Sharpe 0,79 × 0,78 × 0,64; H3 reprovada, sem satélite). `docs/ESTUDO-NUCLEO-SATELITE.md`.
- [x] **F33 (H7).** Brasil (BOVA11/B3) com imposto de 15% sobre a venda. **12/10/2026:** MM200 mensal no BOVA11 perde 4,7 p.p. a.a. líquido (não girar); satélite B3 ganha +2,9 p.p. **Fora de escopo: o usuário não opera Brasil (só registro).** `docs/ESTUDO-BRASIL.md`.
- [x] **F34.** Relatório `docs/ESTUDO-MODELO-UNICO.md` com as decisões; só o que passar na camada 5 vira alerta. **12/10/2026: nenhum alerta novo.**
