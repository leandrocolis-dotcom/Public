# Roadmap: busca de ativo (🔍) e página do ativo

Pedido (10/10/2026): ícone de lupa no cabeçalho, junto de 🔔/⚙️. O usuário digita, a busca sugere ativos
enquanto ele digita (autocomplete) e, ao clicar numa sugestão, abre a **página do ativo** no estilo da
Bloomberg (DES/GP): ticker/ISIN, bolsa, volumes, preço, faixas, resumo da empresa, gráfico com janelas
selecionáveis e o que mais costuma vir. Material educacional; textos em português.

Status (10/10/2026): **S1–S3 entregues; S4 parcial.** Pendente: pré-busca ao destacar sugestão, janela 1D intradiária e "Máx" no gráfico, ação "Adicionar à carteira" (entregue 10/10: cartão "Acompanhar" com "+ Adicionar à carteira" e "+ Adicionar à lista", que usa as watchlists da aba Decisões via `addToList` em `assets/desk.js`). Código: `api/search.js`, `assets/search.js` (ranqueamento puro), `assets/search-view.js` (caixa e página, rota `#/ativo/SYM`), `api/profile.js` (bloco `quote`). Continue da primeira fase pendente, sem pedir
confirmação. Antes de push: `npm run lint`, `npm run format:check`, `npm test`, `npm run preload` (módulo novo).
Ao terminar cada fase: merge no `main` e push (ver `CLAUDE.md`).

## O que já existe (reaproveitar, não duplicar)

- `index.html` ~linha 151: `.top-ctl` com botões `icon-btn` (`data-action="bell"`, `data-tab="settings"`).
  Ícones são desenhados por CSS/JS (ver como `data-gear` e o sino são preenchidos em `assets/app.js`/`styles.css`).
- `api/profile.js`: `GET /api/profile?symbol=X` → perfil (resumo, setor, país, funcionários, site, diretores),
  analistas, resultados, financeiros, ETF (`fundProfile`, `topHoldings`), notícias. Cache 6 h.
- `api/quotes.js` (`SYMBOL_RE`, `getSession`), `api/history.js`, `api/intraday.js`, `api/news.js` (`yahooSearch`).
- `assets/asset-pop.js`: `WINDOWS` (1M…5A), `rangePos`, `liquidityOf`, `quoteFromBars`, `assetPanelHtml`,
  `mountAssetPanel` — painel de ativo já usado na aba Análise. `assets/ta-chart.js`/`charts.js`: gráficos.
- `assets/analysis-view.js`: detalhe do ativo da aba Análise (resumo, manchetes, analistas, financeiros).
- `assets/drawers.js`: gavetas/sobreposições.

## Fases

### S1 — API de sugestões `api/search.js` (pendente)

- `GET /api/search?q=texto` → `{ q, items: [{ symbol, name, exch, exchDisp, type, isin? }] }`.
- Fonte: Yahoo `https://query2.finance.yahoo.com/v1/finance/search?q=…&quotesCount=10&newsCount=0`
  (mesmo cliente/cabeçalhos de `yahooSearch` em `api/news.js`; usar `httpFetch` + `deadlineIn` de `_http.js`).
  Filtrar `quoteType` ∈ EQUITY, ETF, INDEX, MUTUALFUND, CRYPTOCURRENCY, CURRENCY, FUTURE.
- ISIN: se `q` casar `/^[A-Z]{2}[A-Z0-9]{9}\d$/`, a própria busca do Yahoo aceita ISIN; devolver `isin: q`.
- Validar `q` (1–40 chars, sem controle), cache de borda 1 dia (`s-maxage=86400`).
- Testes em `tests/` com JSON fixo do Yahoo (parse puro exportado: `parseSearch(json)`).

### S2 — Lupa + caixa de busca com autocomplete (pendente)

- Novo botão em `.top-ctl`, antes do sino: `class="btn ghost icon-btn" data-action="search"
title="Buscar ativo (/)" aria-label="Buscar ativo"`; ícone de lupa em SVG/CSS no mesmo padrão dos outros.
- Módulo novo `assets/search-view.js`: abre sobreposição (reusar `drawers.js` se couber) com `<input
role="combobox" aria-autocomplete="list">` e `<ul role="listbox">`.
- Predição em duas camadas:
  1. **Local, instantânea**: universo conhecido (carteira, `flow-universe.js`, `sectors.js`, buscas recentes)
     com pontuação: ticker exato > prefixo do ticker > prefixo do nome > substring; sem acento/caixa.
  2. **Remota**: `/api/search` com debounce de 200 ms, `AbortController` para cancelar a anterior, cache
     em memória por `q`. Mesclar sem duplicar (chave = símbolo).
- Teclado: ↑/↓, Enter abre o destacado, Esc fecha, `/` abre de qualquer lugar (fora de inputs).
- Linha da sugestão: ticker em negrito, nome, bolsa e tipo (chip). Realçar o trecho casado.
- Guardar as 8 últimas escolhas em `localStorage` (try/catch) para mostrar com o campo vazio.
- Testes da função pura de ranqueamento (`rankLocal(q, universo)`).

### S3 — Página do ativo (pendente)

- Rota por hash `#/ativo/SYMBOL` (voltar do navegador funciona; link compartilhável). Tela cheia como as abas.
- Dados: `/api/quotes` (preço/variação/sessão), `/api/history` (barras), `/api/intraday` (1D), `/api/profile`.
  Estender `api/profile.js` (módulos `price,summaryDetail,defaultKeyStatistics,quoteType`) para obter:
  bolsa, moeda, ISIN quando houver, market cap, volume e volume médio (3M/10D), bid/ask, abertura, máx/mín
  do dia, faixa 52 sem, P/L, LPA, dividend yield, beta, ações em circulação, data do próximo resultado.
- Layout (inspirado em DES + GP da Bloomberg):
  1. **Cabeçalho**: ticker, nome, bolsa, moeda, tipo, ISIN; preço, variação abs/%, estado do mercado (on/off,
     ver `docs/ON-OFF-MARKET.md`), hora da cotação.
  2. **Faixas**: barra do dia e de 52 semanas com `rangePos`.
  3. **Gráfico**: janelas 1D, 5D, 1M, 3M, 6M, YTD, 1A, 5A, Máx (estender `WINDOWS`); linha + volume;
     reusar `ta-chart.js`. Botão "Abrir na Técnica".
  4. **Estatísticas** (grade 2–3 colunas): abertura, fech. anterior, volume, vol. médio, liquidez
     (`liquidityOf`), market cap, P/L, LPA, DY, beta, ações, próximo resultado.
  5. **Empresa**: resumo, setor/indústria, país, funcionários, site, diretores. ETF: gestora, taxa,
     patrimônio, top holdings e setores.
  6. **Analistas, resultados e financeiros**: reaproveitar os blocos de `analysis-view.js` (extrair em
     funções compartilhadas em vez de copiar).
  7. **Notícias** (`asset-news.js`).
  8. Ações: "Adicionar à carteira/watchlist", "Ver na Análise", "Ver no Valor".
- Estados de carregamento por bloco (cada bloco falha sozinho, mostra "indisponível").
- Mobile: uma coluna, gutter 16 px, sem rolagem horizontal.

### S4 — Acabamento (pendente)

- Lupa também no menu mobile se o cabeçalho esconder ícones em telas pequenas.
- Pré-busca do `/api/profile` ao destacar sugestão (hover/seta) para abrir mais rápido.
- Atualizar `docs/ARQUITETURA.md` e o status deste arquivo e do `CLAUDE.md`.
- `sw.js`: incluir `search-view.js` no preload (`npm run preload`).

## Critérios de aceite

- Digitar "app" mostra AAPL entre as 3 primeiras em < 300 ms (camada local) e completa com remotas.
- Digitar um ISIN (ex.: US0378331005) sugere AAPL.
- Clicar abre `#/ativo/AAPL` com todos os blocos; um bloco com falha não derruba os outros.
- lint, format:check e testes verdes.

## S5 — Além do Yahoo: bonds, Treasuries, fundos não listados, OTC e futuros (entregue 10/10/2026)

- `api/instrument.js`: OpenFIGI (identificadores da Bloomberg, sem chave: ISIN, CUSIP, FIGI ou texto) e
  TreasuryDirect (leilões dos Treasuries pelo CUSIP). `?q=` sugere; `?id=` dá o detalhe.
- `api/search.js` junta Yahoo (cotado: ações, ETFs, fundos, OTC, futuros, índices, moedas, cripto) e OpenFIGI
  (identificador sempre; texto livre só quando o Yahoo acha menos de 3, por causa do limite sem chave).
- `assets/instrument-view.js`: página de instrumento (rota `#/ativo/ISIN|CUSIP|FIGI`) com identificadores,
  dados do Treasury (emissão, vencimento, cupom, leilões com taxa, preço, demanda) e referência de juros do
  Treasury de prazo parecido. Fundos e títulos privados: identificadores + aviso de que preço de balcão não é público.
- Validado em produção: US912810TM09 (Treasury), US037833DT41 (bond da Apple), LU0996182563 (fundo), "crude oil".
- Próximos: chave da OpenFIGI (env `OPENFIGI_KEY`) para subir o limite; fundos brasileiros por CNPJ (dados abertos da CVM).
