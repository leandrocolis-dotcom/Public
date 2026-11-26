# Roadmap: aba "Análise" (análise integrada por ticker)

> **Para o agente que continuar (outra sessão ou conta):** siga **sem parar e sem pedir confirmação** até entregar todas as fases; o dono autorizou. Ache a primeira fase `[ ]` no Status, faça, marque `[x]`, commit e push na hora. Antes de cada push: `npm run preload` (módulo novo), `npx prettier --write .`, `npm run lint`, `npm run format:check`, `npm test`; conferir no navegador (`npm run dev`, `?tab=analysis`). Textos em português. Material educacional.

## Objetivo (pedido do dono)

Dar **qualquer lista de tickers** (ou usar os da **carteira**) e receber, numa aba só, uma **análise integrada** com **escala de compra e venda**, juntando o que o app já sabe fazer: análise gráfica (placar de `ta-signals.js`), momentum (`engine.js`), fundamentos (novo, por ticker) e risco. Uso principal: **antes de comprar**, e revisar o que já está na carteira.

## Status

| Fase | Entrega                                                                                 | Estado |
| ---- | --------------------------------------------------------------------------------------- | ------ |
| A    | `api/analyze.js`: barras diárias (2 anos) + fundamentos de até 15 tickers quaisquer     | [x]    |
| B    | `assets/integrated.js`: notas por pilar + nota final + escala (funções puras, testadas) | [x]    |
| C    | Aba "Análise": caixa de tickers, botão "Carteira", ranking e detalhe por ativo          | [x]    |
| D    | Integração: link "Analisar" na carteira/sinais, docs, README                            | [x]    |

## Fase A: dados por ticker (`api/analyze.js`)

- `GET /api/analyze?symbols=AAPL,MSFT,VOO` (até 15, formato validado com `SYMBOL_RE` de `api/quotes.js`). Cache de borda 1 h (`s-maxage=3600`).
- Por símbolo, em paralelo:
  - **Barras**: `v8/finance/chart/{sym}?range=2y&interval=1d` (sem crumb) → `{dates,o,h,l,c,v}` (mesmo formato de `data/ohlc.json`, usado por `prepareDaily`).
  - **Fundamentos**: `v10/finance/quoteSummary/{sym}?modules=price,summaryDetail,defaultKeyStatistics,financialData,quoteType` **com crumb** (reaproveitar `getSession` de `api/quotes.js`, exportando-a). Campos: tipo (EQUITY/ETF), nome, setor, P/L passado e futuro, PEG, P/VP, EV/EBITDA, dividend yield, margens, ROE, crescimento de receita e lucro, dívida/patrimônio, FCF, beta, preço-alvo médio e recomendação média dos analistas.
  - Falha de fundamentos **não** derruba o ticker (vem só com barras e `fundError`).
- Não é proxy aberto: só GET dos dois endpoints acima, símbolos validados, limite 15.

## Fase B: notas (`assets/integrated.js`)

Cada pilar dá 0–100 (50 = neutro). **Nota final = média ponderada dos pilares disponíveis** (pesos renormalizados se faltar algum):

| Pilar       | Peso | Fonte                                                                                                                                                               |
| ----------- | ---- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Técnico     | 30%  | `analyzeDaily(bars)` de `ta-signals.js`: placar −100..+100 → `(score+100)/2`                                                                                        |
| Momentum    | 25%  | `momentumOf()` de `engine.js` (preço vs. MM50/MM200, retornos 1/3/6m, RSI)                                                                                          |
| Fundamentos | 35%  | Ações: valor (rend. lucro, PEG, FCF yield) + qualidade (ROE, margem, dívida) + crescimento. ETFs: P/L vs. SPY e dividend yield. Faixas fixas documentadas no código |
| Analistas   | 10%  | Potencial até o preço-alvo médio e recomendação média (1 = compra forte … 5 = venda)                                                                                |

- **Risco** não entra na nota: aparece como aviso (volatilidade anual > 40%, queda > 30% do topo de 1 ano, beta > 1,5, ETF alavancado via `isLeveraged`).
- **Escala** (5 níveis): ≥ 75 **Nota muito favorável** · 60–75 **Nota favorável** · 40–60 **Nota neutra** · 25–40 **Nota desfavorável** · < 25 **Nota muito desfavorável** (em 12/10/2026 os rótulos deixaram de usar palavras de ação; a ação é só a da Decisão do trader).
- **Confiança**: alta se os 4 pilares existem e concordam (desvio-padrão < 15), baixa se faltam pilares ou eles brigam. Mostrar "pilares em conflito" quando técnico e fundamentos divergem > 40 pontos.
- Cada pilar devolve também 2–4 **motivos** em português (ex.: "P/L 32, acima de 25: caro").

## Fase C: aba "Análise"

- `TABS`: `["analysis", "Análise"]` logo após "Carteira". Ícone em `assets/ui.js`.
- Topo: caixa de texto "Tickers separados por vírgula" + botões **Analisar**, **Usar carteira** (lê `state.portfolio.holdings`) e **Limpar**. Lista salva em `state.prefs.anList`.
- Ranking: Ticker · Nome · Nota · Escala (tag colorida) · Técnico · Momentum · Fundamentos · Analistas · Confiança · Avisos. Ordenado pela nota. Mobile: nota e escala logo após o ticker.
- Clique na linha → detalhe: os 4 pilares com motivos, plano de entrada/saída do técnico (`plan` de `scoreDailyAt`: entrada, stop, alvos), métricas fundamentais e riscos.
- Carregamento: `assets/analysis-data.js` com cache em memória (1 h) por símbolo; lote único para a API.

## Fase D: integração e acabamento

- Na carteira, botão "Analisar carteira" que abre a aba já com os tickers.
- README, este arquivo e `CLAUDE.md` atualizados.

## Registro de decisões

- 07/10/2026: Fases C e D entregues. Aba "Análise" (`assets/analysis-view.js`, `assets/analysis-data.js`), botão "Analisar carteira" na aba Carteira, Enter na caixa analisa. Ideias futuras: histórico da nota por ativo; alerta quando a escala mudar; ajustar pesos nas Configurações.
- 07/10/2026: Fases A e B entregues. Teste real: AAPL 68 (Compra), VOO 63 (Compra), PETR4.SA 78 (Compra forte), TLT 21 (Venda, só técnico+momentum), NVDA 80 (Compra forte). Ações brasileiras funcionam com sufixo `.SA`.

- 07/10/2026: escopo definido a pedido do dono (lista livre de tickers + carteira; uma nota integrada com escala).
