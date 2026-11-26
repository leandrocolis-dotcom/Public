# Roadmap da aba Valor: todas as fases (documento de continuidade)

> **Para o agente que continuar este trabalho (outra sessão ou outra conta):**
>
> **Todas as fases foram entregues em 07/10/2026 (PR #50).** Próximos passos possíveis estão em "Ideias futuras".
>
> 1. **Siga sem parar até entregar todas as fases.** O dono do projeto autorizou executar tudo **sem pedir confirmação**. Não pare para perguntar; decida pelo que está escrito aqui e registre a decisão neste arquivo.
> 2. Leia nesta ordem: este arquivo → `docs/PLANO-VALOR-FASE1.md` → `docs/ANALISE-FUNDAMENTALISTA.md`.
> 3. Ache a primeira fase com caixa `[ ]` no **Status** abaixo e continue dela. Ao terminar cada passo: marque `[x]`, faça commit e push **na hora** (os tokens podem acabar a qualquer momento).
> 4. Antes de cada push: `npm run preload` (se criou módulo novo), `npx prettier --write .`, `npm run lint`, `npm run format:check`, `npm test`. Tudo verde. Conferir no navegador (`npm run dev` e `?tab=value`) quando mudar a interface.
> 5. Respostas e textos do app em **português**. Material educacional; nunca recomendação.

## Status

| Fase | O que entrega                                               | Estado            |
| ---- | ----------------------------------------------------------- | ----------------- |
| 1    | Aba Valor com 5 cards (SPY, HYG, EMB, TLT, GLD)             | [x] feito, PR #50 |
| 1b   | CAPE de Shiller e retorno esperado de 10 anos               | [x] feito         |
| 2    | P/L e dividend yield de cada ETF de ações; tabela por ativo | [x] feito         |
| 3    | Valor nos pares do Pêndulo e matriz momentum × valor        | [x] feito         |
| 4    | "Aprenda" (glossário), validação de dados e acabamento      | [x] feito         |

## Regras do projeto (valem para todas as fases)

- **Git:** trabalhar no branch `feat/valor-fase1` enquanto o PR #50 estiver aberto (atualizar título/descrição do PR a cada fase). Se o PR #50 já tiver sido incorporado, criar `feat/valor-faseN` a partir da `main` e abrir um PR novo em rascunho.
- **Dados: reaproveitar antes de chamar.** Preços, juros nominais (`US10Y`, `US3M`), câmbio e VIX já estão em `data/prices.json`. Fundamentos ficam em `data/fundamentals.json`, gerado por `scripts/update_fundamentals.py` **1x por dia** (cron `20 22 * * 1-5` ou botão manual no workflow `update-prices.yml`). O navegador nunca chama fonte externa para fundamentos.
- **Falha de fonte nunca apaga dado:** o script mantém a série anterior e grava o erro em `meta.errors`.
- **Histórico acumulado:** séries sem histórico grátis (P/L) e as ICE (3 anos no FRED) são **somadas** dia a dia (`merge()` no script).
- **FRED:** não mandar User-Agent próprio (o FRED derruba conexões que se declaram robô). Um pedido por série (vários ids juntos devolvem ZIP).
- **Código:** funções puras em `assets/fa.js` com testes em `tests/fa.test.js`; interface em `assets/value-view.js`; carga em `assets/feeds.js` (`loadFundamentals`). Seguir o estilo dos arquivos vizinhos (comentários curtos em português, `// prettier-ignore` em arrays longos).
- **Placar:** 0–100; ≥ 70 "Barato", ≤ 30 "Caro"; "Sem dado" quando faltar; "Relação quebrada" quando o modelo não vale (ex.: ouro com beta positivo). Sempre mostrar a janela do percentil ("N anos").

## Fase 1b: CAPE de Shiller

**Por quê:** é a única medida de valuation da bolsa com décadas de histórico grátis. Resolve a falta de histórico do P/L do SPY (hoje o card usa faixas fixas).

**Como ficou (implementado):** a planilha de Yale parou em set/2023; a atual está em `https://shillerdata.com/`, com link que muda a cada versão. O script lê a página, acha `.../ie_data.xls` e baixa (com 3 tentativas: o site derruba conexões às vezes). Colunas `Date`, `CAPE` e `Yield` (= Excess CAPE Yield, em fração; gravado em %). Datas como número: `2026.1` = outubro. Percentil e placar usam o ECY **da própria planilha** (definição de Shiller: juro de 10a menos inflação passada) para não misturar definições; o ECY com `DFII10` aparece só como informação (`ecyNow`). O card SPY passa a usar o placar do CAPE (`method: "CAPE"`).

**Dados (plano original):** `http://www.econ.yale.edu/~shiller/data/ie_data.xls` (≈1,6 MB, mensal desde 1871, atualizado ~1x por mês; testado 07/10/2026: HTTP 200). Aba `Data`, cabeçalho perto da linha 8. Colunas usadas: `Date` (formato 1871.01), `CAPE` e, se existir, `Excess CAPE Yield`.

- **Evitar chamada sem sentido:** só baixar se o CAPE salvo tiver mais de 25 dias (`meta.cape_fetched`); senão manter.
- Requer `xlrd` (adicionar em `scripts/requirements.txt`) e `pandas.read_excel(..., sheet_name="Data", header=7)`; achar as colunas pelo nome, não pela posição (o formato muda).
- Gravar em `fundamentals.json`: `"cape": { "dates": ["1881-01", ...], "values": [...], "ecy": [...] }` (mensal; descartar linhas sem CAPE).

**Cálculos (`fa.js`):**

- `capeCard(cape, real)`: `cy = 100 / CAPE` (rendimento cíclico); `ecy = cy − juro real 10a` (Excess CAPE Yield; usar a coluna de Shiller para o histórico e `DFII10` para o último ponto). Placar = percentil do ECY em todo o histórico × 100 (ECY alto = barato).
- Retorno real esperado de 10 anos (forma simples, Shiller/Siegel): `r10_real ≈ cy`. Mostrar com faixa "± 3 p.p." e a frase "estimativa grosseira".
- O card SPY passa a usar o placar do CAPE quando houver CAPE; o ERP com P/L atual continua como linha informativa.

**Interface:** novo card "Retorno esperado 10 anos (S&P 500)" com CAPE, percentil histórico desde 1881, ECY e retorno real esperado. Teste com série sintética.

**Checklist 1b:** [x] script + requirements · [x] gerar dado real · [x] `capeCard` + testes · [x] card na aba · [x] docs/status · [x] commit/push

## Fase 2: valuation por ETF de ações

**Por quê:** comparar os ETFs do universo entre si (setores, regiões) e alimentar os pares (Fase 3).

**Ativos:** os ETFs de ações e imobiliário de `assets/universe.js`: SPY, QQQ, IWM, XLK, SMH, XLC, XLY, XLF, KRE, XLI, XLB, XLE, XLP, XLV, XLU, VNQ, VNQI, EFA, VGK, EWJ, EEM, FXI, INDA, EWZ, EWW (ler a lista do arquivo, não fixar no script; excluir SPXL, que é alavancado).

**Dados:** `yfinance.Ticker(t).info` → `trailingPE`, `dividendYield` (vem em %), `priceToBook` (pode faltar). Testado 07/10/2026 (ex.: QQQ 29,0; IWM 16,3; XLE 18,0; EWZ 12,3; EFA 17,0). ~25 chamadas/dia, com `time.sleep(0.5)` entre elas e uma nova tentativa em erro 429. Reaproveitar o P/L do SPY da Fase 1 (mesma rotina).

- Gravar em `fundamentals.json`: `"etf": { "XLK": { "dates": [...], "pe": [...], "dy": [...] }, ... }` acumulando 1 ponto por dia (mesma lógica do `spy`, que deve migrar para `etf.SPY`, mantendo compatibilidade de leitura com `spy` antigo).
- P/L ≤ 0 ou > 200: gravar `null` (lucro negativo distorce).

**Cálculos (`fa.js`):**

- `etfValuation(etf)` por ativo: `ey = 100/PE`, `dy`, `desc = PE/PE_SPY − 1`.
- Placar: se o ativo tiver ≥ 250 pontos de histórico → percentil do próprio EY (EY alto = barato); senão → **percentil do EY entre os pares do mesmo grupo** (EUA setores/estilos vs. internacionais), marcado como "relativo aos pares". Setores cíclicos (XLE, XLB, KRE, COPX se entrar) recebem aviso "P/L cíclico engana".

**Interface:** tabela "Valuation por ETF" abaixo dos cards: Ativo · P/L · Rend. lucro · Dividend yield · vs. SPY · Placar · Base (histórico/pares). Ordenável por placar. Mobile: rolagem horizontal dentro da tabela (classe `tw`, como a tabela dos pares).

**Checklist 2:** [x] script (lista do universo, sleep, merge) · [x] gerar dado real · [x] `etfValuation` + testes · [x] tabela na aba · [x] docs/status · [x] commit/push

**Como ficou:** 27 ETFs (inclui GDX e COPX como ações; SPXL fora). `fundamentals.json` ganhou `etf.{SYM}.{dates,pe,dy,pb}`; `spy` continua gravado (cópia de `etf.SPY`) para compatibilidade. Grupos de comparação em `peerGroup()` (`fa.js`): "EUA" = grupos "Ações EUA" e "Setores" do universo; "Global" = o resto. Tabela com Placar e Leitura logo após o ativo (no celular a tabela rola de lado).

## Fase 3: valor nos pares do Pêndulo

**Por quê:** é o uso prático. O fundamento vira **filtro**, não gatilho (ver `docs/ANALISE-FUNDAMENTALISTA.md`, seção 4).

**Mapa de placar por ativo** (`valueScoreMap(fund, prices)` em `fa.js`): ETFs de ações da Fase 2; HYG, EMB, TLT, GLD dos cards; `TBF` = 100 − placar do TLT (posição vendida em Treasuries); demais (moedas, petróleo, VIX) = sem placar.

**Nos pares** (`assets/views.js`, tabela do Pêndulo, e o detalhe do par):

- Coluna "Valor" = `placar(▲ comprar) − placar(▼ vender)`, formatado com sinal; vazio quando faltar um dos lados.
- Tag: ≥ +20 "Valor confirma" (buy); ≤ −20 "Valor contra" (sell); senão neutra. **Não altera** o ranking, o Top 5 nem as entradas (o motor `engine.js` e os testes "golden" ficam intactos).
- Matriz momentum × valor no detalhe do par: quadrante a partir de (`r.strength` ≥ 50 ou não) × (diferença de valor ≥ 0 ou não): "Barato com momentum", "Caro com momentum (stop curto)", "Barato sem momentum (esperar)", "Caro sem momentum (evitar)".
- Achar o ponto de renderização do detalhe do par com `grep -n "data-pair" assets/*.js`.

**Checklist 3:** [x] `valueScoreMap` + testes · [x] coluna e tag na tabela · [x] quadrante no detalhe · [x] testes golden intactos · [x] docs/status · [x] commit/push

**Como ficou:** coluna "Valor" (ordenável) entre Confluência e Δ mom na tabela do Pêndulo (`assets/views.js`); card "Momentum × valor" no topo do detalhe do par (`assets/drawers.js`). `loadFundamentals` re-renderiza também a aba `pairs`. Limitação: a maioria dos pares tem uma ponta sem placar (UUP, VIXY, FXY, DBC, USO, BWX, EMLC, SLV), então só ~8 de 37 pares mostram valor. Escalas misturadas (ações por pares vs. renda fixa por histórico) estão avisadas na nota.

## Fase 4: aprender, validar e acabar

- `assets/fa-glossary.js`: textos curtos de cada métrica (P/L, rendimento do lucro, prêmio de risco, CAPE, ECY, OAS, juro real, curva, ouro × juro real, valor × momentum), no padrão de `assets/ta-glossary.js`. Seção recolhível "Aprenda" no fim da aba Valor.
- `scripts/verify-data.mjs`: validar `data/fundamentals.json` se existir (datas crescentes, números finitos, `updated_at` com no máximo 7 dias úteis; aviso, não erro, se faltar).
- Card-resumo no Painel (`assets/dash.js`): "Valor: SPY caro · Treasuries barato…" com link para a aba (opcional, só se couber sem poluir).
- Atualizar `README.md`, `docs/ANALISE-FUNDAMENTALISTA.md` e este arquivo (Status todo `[x]`).
- PR final pronto para revisão (tirar do rascunho só se o dono pedir).

**Checklist 4:** [x] glossário · [x] verify-data · [x] resumo no Painel · [x] docs · [x] commit/push

**Como ficou:** `assets/fa-glossary.js` (10 métricas) em seção "Aprenda" no fim da aba; `checkFundamentals()` em `fa.js`, chamado por `scripts/verify-data.mjs` (só alertas); item "Valor" na barra do Painel (`assets/dash.js`, dados via `dashCtx` em `assets/contexts.js`).

## Ideias futuras (não planejadas)

- Placar de valor para moedas (câmbio real/PPC) e commodities amplas (preço real), para cobrir mais pares.
- Em 2027, quando o P/L acumulado passar de 250 pontos, a base "pares" vira "próprio histórico" sozinha (nada a fazer).
- Gráfico do CAPE histórico no card (dados já no arquivo).

## Registro de decisões

- 07/10/2026: Fase 1 entregue (PR #50). Achados: bloqueio de User-Agent no FRED; ICE com 3 anos; ouro com beta positivo em 2022–26 (card mostra "Relação quebrada").
- 07/10/2026: Fase 1b entregue. CAPE 40,7 (percentil 99 desde 1881), ECY 0,56%, retorno real esperado ~2,5% a.a.
- 07/10/2026: Fase 2 entregue. Mais baratos entre pares: FXI, KRE, XLF, VNQI; mais caros: SMH, INDA, XLK, EFA.
- 07/10/2026: Fase 3 entregue. Ex.: "Juros ↑ x Utilities" (comprar TBF, vender XLU) aparece com "Valor contra" (−66) e quadrante "Caro com momentum".
- 07/10/2026: Fase 4 entregue. Todas as fases concluídas.
- 07/10/2026: dono pediu execução de todas as fases sem confirmação.
