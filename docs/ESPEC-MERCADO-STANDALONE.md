# Especificação: Mercado como app autônomo (back to front)

> Scripts citados aqui e removidos do repo em 21/11/2026 (estudo encerrado; conclusões abaixo valem): `extract-mercado-css.mjs`. Para rodar de novo: `git show a3845cf:scripts/<nome>.mjs > scripts/<nome>.mjs`.

Documento para transpor a seção **Mercado** do Pêndulo (sub-abas **Visão geral, Macro, Notícias, Agenda e Fluxo**) para
um app novo, isolado, sem nenhuma dependência das outras seções (Carteira, Oportunidades, Laboratório, nuvem, push).

Escrito em 14/10/2026 a partir do código em produção (`main`). Todo caminho citado (`assets/…`, `api/…`, `scripts/…`) é
do repositório original `leandrocolis-dotcom/etf-portfolio`. Material educacional; não é recomendação de investimento.

**Como usar este documento.** A seção 2 é o mapa (o que entra, o que sai). As seções 3 a 6 montam o servidor e os dados.
As seções 7 a 13 montam a tela. A seção 14 é a ordem de execução e a 15, o checklist de aceite. Siga na ordem: cada
fase só começa com a anterior validada.

**Validado em 14/10/2026:** o app foi montado do zero numa pasta separada seguindo só este documento (cópias,
EDIÇÕES por substituição exata e os arquivos do anexo extraídos daqui). Resultado: lint e formatação limpos, 57 testes
portados passando, `update_flow.py` gerando o mesmo `flow.json` de produção (274 séries, 300 pregões, 240 volumes) e as
5 sub-abas abertas no navegador em 1280 px e 390 px sem erro de JavaScript nem arquivo 404.

Regra de ouro: **quase tudo é cópia literal** de arquivos que já estão em produção e testados. Onde há edição, ela está
descrita linha a linha (procure "EDIÇÃO"). Código novo só existe onde o original dependia de outras abas, e está
escrito por inteiro aqui. Não reescreva a lógica dos motores: as fórmulas, limites e constantes já foram validados.

---

## Índice

1. Visão geral do produto
2. Segregação: o que entra, o que sai e por quê
3. Arquitetura e stack
4. Estrutura de pastas do app novo
5. Dados publicados (crons) e contratos dos arquivos
6. APIs (funções serverless) e contratos
7. Shell do front (HTML, estado, ciclo de carga, eventos)
8. Sub-aba Visão geral (Painel)
9. Sub-aba Macro
10. Sub-aba Notícias
11. Sub-aba Agenda
12. Sub-aba Fluxo
13. Componentes comuns (painel do ativo, popups, faixa, piscar, tema, CSS)
14. Ordem de execução (fases)
15. Testes e checklist de aceite
16. Armadilhas conhecidas (leia antes de depurar)
17. Anexo: código novo completo

---

## 1. Visão geral do produto

Uma página única (SPA estática, sem build) com 5 sub-abas, todas respondendo "Como está o mercado agora?":

| Sub-aba (id)         | Pergunta                                       | Fonte principal                                  |
| -------------------- | ---------------------------------------------- | ------------------------------------------------ |
| Visão geral (`dash`) | Como estão bolsas, juros, moedas, commodities? | `data/flow.json` + `/api/quotes` + `/api/yields` |
| Macro (`macro`)      | Em que regime econômico estamos?               | `data/macro.json` + `data/macro-releases.json`   |
| Notícias (`news`)    | O que está saindo agora?                       | `/api/news` + `data/news.json`                   |
| Agenda (`calendar`)  | Que dado econômico sai e o que já saiu?        | `/api/calendar`                                  |
| Fluxo (`flow`)       | Para onde o dinheiro está indo?                | `data/flow.json` + `/api/quotes`                 |

Frases de cada sub-aba (aparecem sob a navegação; `TAB_INFO`):

- `dash`: "Cotações de bolsas, juros, moedas, commodities e cripto, com o regime de risco do dia."
- `macro`: "Economia dos EUA e do mundo hoje: crescimento, inflação, juros, crédito e geopolítica, o regime e os setores que a história favorece; agenda com projeção × resultado."
- `news`: "Manchetes classificadas por assunto, das fontes de mercado, atualizadas a cada 2 minutos." (texto novo: a original falava da carteira)
- `calendar`: "Indicadores econômicos da semana, com projeção, valor divulgado e histórico." (texto novo: a original falava de resultados dos seus ativos)
- `flow`: "Para onde o dinheiro está indo: grupos que ganham e perdem força hoje (inferido por preço e volume)."

Tudo em português do Brasil. Horários exibidos em Brasília (`America/Sao_Paulo`); lógica de pregão em Nova York
(`America/New_York`).

---

## 2. Segregação: o que entra, o que sai e por quê

### 2.1 Dependências que a seção Mercado tem hoje das outras abas (e o destino de cada uma)

| Dependência no original                                                                | Onde aparece                                                                                | Destino no app novo                                                                                                                        |
| -------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| `assets/universe.js` (47 ativos dos pares do Pêndulo)                                  | `api/quotes`, `api/intraday`, `live.js`, `update_prices.py`                                 | **Sai.** O universo único passa a ser `assets/flow-universe.js` (274 símbolos). Todos os 84 símbolos do Painel já estão nele (verificado). |
| `data/prices.json` + `engine.js` (pares, snapshot)                                     | `app.js load()/rebuild()`                                                                   | **Sai.** Só `data/flow.json` é carregado.                                                                                                  |
| Carteira (`state.portfolio`, `valuation`, `portfolio.js`)                              | Painel (botão Carteira, faixa ●), Notícias ("Sua carteira"), Agenda (resultados/dividendos) | **Sai.** Os blocos são removidos (ver EDIÇÕES em 8, 10 e 11).                                                                              |
| Aba Valor (`fa.js` `valueCards`, `data/fundamentals.json`)                             | Painel (botão "Valor")                                                                      | **Sai.**                                                                                                                                   |
| Listas/watchlists (`desk.js` `lists()`)                                                | `feeds.js loadCalendar`                                                                     | **Sai.** A agenda é pedida sem `symbols`.                                                                                                  |
| Sinais, notificações, push, Supabase (nuvem, tempo real)                               | `app.js`, `feeds.js notifyNews`, `live-feed.js`                                             | **Sai.** Cotações por busca periódica (`/api/quotes`, seção 7.5).                                                                          |
| `help.js` (`hq()`, ícone "?" de ajuda)                                                 | `asset-pop.js`                                                                              | **Sai** (EDIÇÃO em 13.1).                                                                                                                  |
| `market.js` (`mkt.quotes`, mercado inteiro ~920)                                       | `asset-pop.js`                                                                              | **Sai** (EDIÇÃO em 13.1).                                                                                                                  |
| `fold.js` (`watchDrawer`)                                                              | `charts.js`                                                                                 | **Sai** (EDIÇÃO em 13.6).                                                                                                                  |
| `ta-signals.js` (`sessionInfo`, calendário da NYSE)                                    | `offmarket.js`, `refresh.js`                                                                | **Vira arquivo novo** `assets/nyse.js` (anexo 17.1).                                                                                       |
| `verify.js` (`nasdaq()`, 3ª fonte de cotação)                                          | `api/quotes.js`                                                                             | **Vira arquivo novo** `api/_nasdaq.js` (anexo 17.6).                                                                                       |
| `state.js`, `app.js`, `events.js`, `views.js`, `contexts.js`, `feeds.js`, `widgets.js` | orquestração do app inteiro                                                                 | **Reescritos enxutos** (anexo 17).                                                                                                         |
| `scripts/update_prices.py` (gera prices + flow + ohlc)                                 | cron                                                                                        | **Vira** `scripts/update_flow.py` (anexo 17.8), só `flow.json`.                                                                            |

### 2.2 Manifesto de arquivos

Legenda: **C** = copiar literal; **E** = copiar e aplicar a EDIÇÃO indicada; **N** = novo (código completo no anexo).

**Front (`assets/`)**

| Arquivo                                         | Ação | Observação                                                                      |
| ----------------------------------------------- | ---- | ------------------------------------------------------------------------------- |
| `flow-universe.js`                              | C    | Universo único (grupos e símbolos). Fonte da verdade do cron, da API e da tela. |
| `flow-engine.js`                                | C    | Motor do Fluxo (z, volume relativo, grupos, narrativa, rotação, treemap).       |
| `flow-view.js`                                  | E    | 1 frase (12.7).                                                                 |
| `dash.js`                                       | E    | Remove Carteira, Valor e faixa da carteira; muda o botão News (8.6).            |
| `asset-news.js`                                 | C    | "!" de notícia e de fora da curva no Painel.                                    |
| `asset-pop.js`                                  | E    | Remove `hq` e `mkt` (13.1).                                                     |
| `macro.js`                                      | E    | Abas que redesenham (9.3).                                                      |
| `macro-view.js`                                 | C    |                                                                                 |
| `macro-alerts.js`                               | C    | Normalização da agenda da Nasdaq (usada por `api/calendar`).                    |
| `notif-topics.js`                               | C    | Só porque `macro-alerts.js` importa `topicTitle` (arquivo de 15 linhas).        |
| `news.js`                                       | C    | RSS, junção, tags, relevância.                                                  |
| `news-impact.js`                                | C    | Só para o cron do macro (`THEMES`, `toneOf`). Não é carregado pela tela.        |
| `news-view.js`                                  | E    | Remove "Sua carteira" (10.6).                                                   |
| `translate.js`                                  | C    | Tradução para pt-BR (servidor).                                                 |
| `calendar.js`                                   | C    |                                                                                 |
| `calendar-view.js`                              | E    | Remove "Resultados e dividendos" e a frase de avisos (11.5).                    |
| `offmarket.js`                                  | E    | Import de `sessionInfo` (7.6).                                                  |
| `refresh.js`                                    | E    | Import de `sessionInfo` (7.5).                                                  |
| `live.js`                                       | E    | Remove `ASSETS` e `applyLiveToPrices` (7.4).                                    |
| `charts.js`                                     | E    | Remove `fold.js` e `seriesOf` (13.6).                                           |
| `format.js`, `flash.js`, `marquee.js`, `net.js` | C    |                                                                                 |
| `theme.js`                                      | E    | Troca a chave do localStorage (13.5).                                           |
| `themes.css`                                    | C    | Variáveis de cor dos 6 temas.                                                   |
| `mercado.css`                                   | N    | Gerado pelo extrator (13.7), não escrito à mão.                                 |
| `nyse.js`                                       | N    | Anexo 17.1.                                                                     |
| `state.js`                                      | N    | Anexo 17.2.                                                                     |
| `widgets.js`                                    | N    | Anexo 17.3 (só o `toast`).                                                      |
| `feeds.js`                                      | N    | Anexo 17.4.                                                                     |
| `app.js`                                        | N    | Anexo 17.5 (orquestração + eventos).                                            |

**Servidor (`api/`)**

| Arquivo       | Ação | Observação                                              |
| ------------- | ---- | ------------------------------------------------------- |
| `_http.js`    | C    | `httpFetch` com prazo, `memo`.                          |
| `_eco.js`     | C    | Agenda econômica da Nasdaq (valor divulgado).           |
| `_nasdaq.js`  | N    | Anexo 17.6 (extraído de `api/verify.js`).               |
| `quotes.js`   | E    | Universo = `FLOW_ASSETS`; import do `_nasdaq.js` (6.1). |
| `intraday.js` | E    | Lista permitida = `FLOW_ASSETS` (6.2).                  |
| `history.js`  | C    |                                                         |
| `yields.js`   | C    |                                                         |
| `news.js`     | E    | Só a URL do `UA_BOT` (6.5).                             |
| `calendar.js` | C    |                                                         |

**Cron e raiz**

| Arquivo                                                                                         | Ação | Observação                                                                |
| ----------------------------------------------------------------------------------------------- | ---- | ------------------------------------------------------------------------- |
| `scripts/update_flow.py`                                                                        | N    | Anexo 17.8.                                                               |
| `scripts/verify-flow.mjs`                                                                       | N    | Anexo 17.9.                                                               |
| `scripts/update-news.mjs`                                                                       | C    |                                                                           |
| `scripts/update-macro.mjs`                                                                      | C    |                                                                           |
| `scripts/requirements.txt`                                                                      | C    | `yfinance>=0.2.50`, `requests>=2.31`, `pandas>=2.0` (o `xlrd` pode sair). |
| `scripts/copy_vendor.mjs`                                                                       | E    | Tirar o bloco do `lightweight-charts` (não usado).                        |
| `scripts/dev-server.mjs`                                                                        | N    | Anexo 17.14 (servidor local: estáticos + `api/`).                         |
| `.github/workflows/update-flow.yml`                                                             | N    | Anexo 17.10.                                                              |
| `.github/workflows/update-macro.yml`                                                            | C    |                                                                           |
| `.github/workflows/ci.yml`                                                                      | N    | Anexo 17.11.                                                              |
| `index.html`                                                                                    | N    | Anexo 17.7.                                                               |
| `vercel.json`                                                                                   | N    | Anexo 17.12.                                                              |
| `package.json`, `eslint.config.mjs`, `.prettierrc.json`, `.prettierignore`, `vitest.config.mts` | C/E  | `package.json` E: anexo 17.13.                                            |

---

## 3. Arquitetura e stack

```
                 GitHub Actions (cron, grátis)                         Vercel (Hobby)
  ┌──────────────────────────────────────────────┐   commit    ┌──────────────────────────────────┐
  │ update-flow.yml  (*/30 13-21 UTC + 22:20 UTC) │ ─────────▶ │ Site estático (index.html,        │
  │   update_flow.py  → data/flow.json            │  data/*.json│ assets/*.js, data/*.json)         │
  │   update-news.mjs → data/news.json            │            │                                   │
  │ update-macro.yml (11:17,14:17,18:17,21:17 UTC)│ ─────────▶ │ Funções Node (api/*.js):          │
  │   update-macro.mjs → data/macro*.json         │            │ quotes, intraday, history, yields,│
  └──────────────────────────────────────────────┘            │ news, calendar                    │
                                                               └──────────────┬───────────────────┘
                                                                              │ fetch (JSON)
                                                               ┌──────────────▼───────────────────┐
                                                               │ Navegador (ES modules, sem build) │
                                                               │ load() → rebuild() → render()     │
                                                               └───────────────────────────────────┘
```

- **Front:** HTML + ES modules puros, sem bundler, sem framework. Chart.js 4.5.1 (UMD, servido de `vendor/`).
- **Servidor:** Vercel Functions, Node 22 (o `fetch` global e `AbortSignal.timeout` são usados). Formato
  `export default async function handler(req, res)` (Node, não Edge).
- **Dados de base:** JSON gerados por cron no GitHub Actions e commitados no repo; a Vercel publica a cada commit.
- **Sem chaves de API.** Todas as fontes são públicas: Yahoo Finance, Nasdaq, FRED, Eurostat, Forex Factory
  (faireconomy), BCE, MoF do Japão, Banco da Inglaterra, feeds RSS e Google Translate público.
- **Sem banco de dados.** Preferências do usuário em `localStorage` (chaves `mercado.prefs` e `mercado.ui`).

Versões: Node 22, Python 3.12, `chart.js@4.5.1`, `vitest@^2.1.8`, `eslint@^9.17.0`, `prettier@^3.4.2`,
`@fontsource/instrument-sans@^5.3.0`, `@fontsource/geist-mono@^5.3.0`.

---

## 4. Estrutura de pastas do app novo

```
/
├─ index.html                 (anexo 17.7)
├─ vercel.json                (anexo 17.12)
├─ package.json               (anexo 17.13)
├─ eslint.config.mjs  .prettierrc.json  .prettierignore  vitest.config.mts   (copiados)
├─ vendor/chart.umd.min.js    (npm run vendor)
├─ fonts/*.woff2              (npm run vendor)
├─ icons/icon.svg             (qualquer ícone; o original serve)
├─ assets/
│  ├─ app.js  state.js  feeds.js  widgets.js  nyse.js                 (novos)
│  ├─ dash.js  macro.js  macro-view.js  news-view.js  calendar-view.js  flow-view.js  asset-pop.js
│  ├─ flow-universe.js  flow-engine.js  asset-news.js  news.js  news-impact.js  translate.js
│  ├─ calendar.js  macro-alerts.js  notif-topics.js  offmarket.js  refresh.js  live.js
│  ├─ charts.js  theme.js  format.js  flash.js  marquee.js  net.js
│  └─ themes.css  mercado.css
├─ api/
│  ├─ _http.js  _eco.js  _nasdaq.js
│  └─ quotes.js  intraday.js  history.js  yields.js  news.js  calendar.js
├─ data/
│  ├─ flow.json  news.json  macro.json  macro-releases.json   (gerados pelos crons)
├─ scripts/
│  ├─ update_flow.py  verify-flow.mjs  update-news.mjs  update-macro.mjs  copy_vendor.mjs  dev-server.mjs  requirements.txt
└─ .github/workflows/
   ├─ update-flow.yml  update-macro.yml  ci.yml
```

Arquivos com `_` no início dentro de `api/` **não viram rota** na Vercel (são módulos compartilhados). Não renomeie.

---

## 5. Dados publicados (crons) e contratos dos arquivos

### 5.1 `data/flow.json` (base do Painel e do Fluxo)

Gerado por `scripts/update_flow.py` (anexo 17.8). ~750 KB.

```jsonc
{
  "dates": ["2025-08-04", "...", "2026-10-12"],        // 300 pregões (calendário do SPY), ordem crescente
  "close": { "SPY": [773.93, ...], "^TNX": [4.12, ...], "EURUSD=X": [1.17, ...] }, // 300 valores por símbolo
  "vol":   { "SPY": [40431100, ...] },                   // últimos 60 pregões; só quem tem volume > 0
  "last_real": { "SPY": "2026-10-12", ... }              // última data com preço REAL (não preenchido)
}
```

Regras de geração (não mudar):

- Calendário = datas do SPY (só pregões dos EUA). Cada série é reindexada nesse calendário com **forward fill**.
- Janela: 300 fechamentos (`FLOW_ROWS`), 60 volumes (`FLOW_VOL_ROWS`).
- Série com qualquer buraco dentro da janela depois do ffill (só acontece no começo) é **descartada**.
- Arredondamento: 6 casas se o valor < 1, senão 4.
- **Câmbio à vista (`=X`)**: o Yahoo carimba a barra diária D com o fechamento de D−1. A função `fix_fx_dates`
  recua cada valor uma data. Sem isso, toda moeda fica um pregão atrasada (ver 16).
- Taxas de juros (`^IRX`, `^FVX`, `^TNX`, `^TYX`) vêm em % (ex.: 4,12 = 4,12% a.a.).
- Moedas marcadas `inv` em `flow-universe.js` ficam **como o Yahoo cota** (moeda local por US$); a inversão é feita na
  tela (`seriesOf` do `flow-engine.js`).

Validação antes de publicar: `scripts/verify-flow.mjs` (anexo 17.9). Se falhar, o job falha e nada é commitado.

### 5.2 `data/news.json` (reserva de manchetes)

Gerado por `scripts/update-news.mjs` (cópia literal), no mesmo workflow do flow. Lê FT, Economist, Yahoo, WSJ,
Business Insider e BBC **por `curl`** (esses sites recusam o IP da Vercel; ver 16).

```jsonc
{
  "updated_at": "2026-10-14T13:30:12.000Z",
  "items": [
    {
      "title": "Dow Jones Futures: Stock Market Holds Up As Meta, AMD Lead Buys", // original (inglês)
      "link": "https://finance.yahoo.com/...",
      "source": "Yahoo Finance",
      "region": "int", // "int" | "br"
      "t": 1791940592, // Unix (s) ou null
      "d": "The stock market edged lower Tuesday...", // resumo do feed (opcional)
      "id": "lyez4r", // hash do título normalizado
      "titlePt": "Dow Jones Futures: Mercado de ações se mantém...", // tradução (opcional)
      "dPt": "O mercado de ações caiu na terça-feira...", // tradução do resumo (opcional)
    },
  ],
  "errors": ["Financial Times: vazio"],
}
```

Também é **entrada do cron do macro** (pilar Geopolítica e temas). Por isso o workflow do flow precisa existir antes
do macro produzir o pilar `geo` completo.

### 5.3 `data/macro.json` e `data/macro-releases.json`

Gerados por `scripts/update-macro.mjs` (cópia literal) 4 vezes por dia útil. Fontes: FRED (CSV público), Eurostat,
Yahoo (gráfico diário e mensal), Forex Factory e `data/news.json`. O script lê o `macro.json` anterior (`newsHist`) e
o `macro-releases.json` anterior (acumula a agenda): **commite os dois sempre**.

`macro.json` (campos usados pela tela):

```jsonc
{
  "updated_at": "ISO",
  "overall": -12,                         // nota macro para ações, −100 a +100 (inteiro)
  "regime": {
    "id": "desac",                        // "recup" | "super" | "estag" | "desac"
    "label": "Desaceleração", "text": "crescimento e inflação desacelerando",
    "month": "2026-08",                   // mês do dado (produção industrial e CPI)
    "growthMom": -0.0024, "inflMom": -0.0056,
    "probs": { "recup": 0.35, "super": 0.09, "estag": 0.11, "desac": 0.45 }
  },
  "pillars": {                            // score = média dos indicadores do pilar (−2,5 a +2,5)
    "growth": { "label": "Crescimento", "score": 0.12, "n": 6 },
    "inflation": {...}, "policy": {...}, "financial": {...}, "geo": {...},
    "global": { "label": "Mundo (Europa, Japão, China)", "score": -0.16, "n": 16 }
  },
  "indicators": [                         // EUA
    { "pillar": "growth", "id": "INDPRO", "label": "Produção industrial", "value": 1.42,
      "unit": "% a/a", "score": 0.26, "read": "crescendo", "date": "2026-08-01" }
  ],
  "world": {
    "regions": { "eu": { "label": "Zona do euro", "score": -0.42, "n": 6 }, "jp": {...}, "cn": {...} },
    "indicators": [ { "region": "eu", "id": "HICP", "label": "Inflação (HICP)", "value": 3.23,
                      "unit": "% a/a", "score": -1.23, "read": "acima da meta do BCE", "date": "2026-08-01" } ]
  },
  "surprises": { "index": -1, "n": 4 },  // média de good (+1/−1) das divulgações dos últimos 30 dias
  "news": { "n": 129, "geoShare": 0.124,
            "themes": [ { "k": "mideast", "label": "Conflito no Oriente Médio", "geo": true, "n": 6 } ] },
  "tilts": [                              // 13 setores/classes, ordenados por score desc
    { "sym": "XLE", "name": "Energia", "hist": 0.0004,
      "histRegime": { "n": 91, "avg": 0.0011, "t": 0.17, "hit": 0.505 },  // ou null
      "news": 1, "score": 0.54 }
  ],
  "history": { "since": "1999-01", "regimes": { "recup": { "label": "...", "text": "..." }, ... },
               "bySector": { "desac": { "XLE": { "n", "avg", "t", "hit" }, ... }, ... } },
  "newsHist": [ { "day": "2026-10-14", "n": 129, "geo": 16, "themes": { "mideast": 6 } } ],  // até 400 dias
  "errors": ["FRED HOUST: HTTP 500"]
}
```

`macro-releases.json`:

```jsonc
{
  "events": {
    "Core CPI m/m|2026-10-14": {
      "title": "Core CPI m/m",
      "date": "2026-10-14T08:30:00-04:00",
      "impact": "High",
      "forecast": "0.2%",
      "previous": "0.3%",
      "actual": 0.33,
      "series": "CPILFESL",
      "surprise": 0.13,
      "good": -1, // os 4 últimos só depois do FRED
    },
  },
}
```

O algoritmo completo (pilares, regra de Sahm, regime, tilts, agenda) está comentado no próprio `update-macro.mjs`;
resumo na seção 9.2. Não reimplemente: copie.

### 5.4 Agenda dos crons (UTC)

| Workflow           | Quando (cron)                          | Gera                                          |
| ------------------ | -------------------------------------- | --------------------------------------------- |
| `update-flow.yml`  | `*/30 13-21 * * 1-5` e `20 22 * * 1-5` | `data/flow.json`, `data/news.json`            |
| `update-macro.yml` | `17 11,14,18,21 * * 1-5`               | `data/macro.json`, `data/macro-releases.json` |

Por que não mais frequente: cada commit gera um deploy na Vercel; o plano Hobby limita 100 deploys/dia. A cada 30
minutos dá ~20/dia. O preço "ao vivo" não depende do cron (vem de `/api/quotes`).

---

## 6. APIs (funções serverless) e contratos

Todas: `GET`, resposta JSON, `Cache-Control` de borda definido pela própria função, erro = `{ error, fetched_at }`
com status 400 (parâmetro inválido) ou 502 (fonte falhou). Cliente HTTP comum: `api/_http.js` (`httpFetch` com
`timeout` e `deadline` absoluto: a função responde com o que tem antes do teto da Vercel em vez de virar 504 vazio).
`maxDuration: 30` em todas (vercel.json).

### 6.1 `GET /api/quotes[?extra=AAA,BBB][&only=1]`

Cotações ao vivo do universo (`FLOW_ASSETS`, 274 símbolos) + até 60 extras.

EDIÇÃO em `api/quotes.js` (só as 2 primeiras importações e a constante `SYMBOLS`):

```js
// ANTES
import { ASSETS } from "../assets/universe.js";
import { FLOW_ASSETS } from "../assets/flow-universe.js";
...
import { nasdaq } from "./verify.js";

export const SYMBOLS = [
  ...new Set([...Object.values(ASSETS).map((a) => a.yahoo), ...FLOW_ASSETS.map((a) => a.sym)]),
];

// DEPOIS
import { FLOW_ASSETS } from "../assets/flow-universe.js";
...
import { nasdaq } from "./_nasdaq.js";

export const SYMBOLS = [...new Set(FLOW_ASSETS.map((a) => a.sym))];
```

Resposta:

```jsonc
{
  "fetched_at": "ISO",
  "version": "abc1234",
  "source": "Yahoo Finance",
  "market_state": "REGULAR", // marketState do SPY: PRE | REGULAR | POST | POSTPOST | CLOSED
  "count": 272,
  "total": 274,
  "quotes": {
    "SPY": {
      "p": 778.1, // regularMarketPrice
      "t": 1791999999, // regularMarketTime (Unix s)
      "ms": "REGULAR", // marketState
      "v": 18685000, // volume do dia
      "dh": 779.2,
      "dl": 774.0,
      "h52": 790,
      "l52": 590,
      "av3": 60000000,
      "av": 55000000, // médias de volume 3 meses e 10 dias
      "mc": null, // market cap
      "pc": 778.57, // fechamento anterior
      "xk": "post",
      "xp": 777.9,
      "xt": 1792000500,
      "xc": -0.0003, // pré/pós (só se mais novo que o regular)
      "n": "SPDR S&P 500", // nome: só para os extras
    },
  },
  "missing": ["XYZ=F"],
  "errors": [],
}
```

Cascata de fontes (não mudar a ordem):

1. **Yahoo v7/quote** com sessão `cookie + crumb` (`fc.yahoo.com` → `v1/test/getcrumb`), blocos de 60 símbolos em
   paralelo. Sessão reaproveitada por 30 min na instância quente. 401/403 = renova o crumb uma vez.
2. **Yahoo v7/spark** (sem crumb, blocos de 20) para quem faltou: só `p`, `t`, `pc`.
3. **Nasdaq** (`api.nasdaq.com/api/quote/{SYM}/info?assetclass=etf|stocks`) para tickers simples dos EUA ainda
   faltando, no máximo 15.

Cache de borda: `public, s-maxage=60, stale-while-revalidate=120` (no máximo 1 consulta ao Yahoo por minuto, qualquer
que seja o número de usuários). Sem nenhuma cotação: 502 `no-store`. Prazo interno: 22 s.

### 6.2 `GET /api/intraday?symbol=SPY[&prepost=1]`

Barras de 5 min dos últimos 5 pregões (Yahoo v8/chart `range=5d&interval=5m`).

EDIÇÃO em `api/intraday.js`:

```js
// ANTES
import { ASSETS } from "../assets/universe.js";
...
export const ALLOWED = new Set(Object.values(ASSETS).map((a) => a.yahoo));
// DEPOIS
import { FLOW_ASSETS } from "../assets/flow-universe.js";
...
export const ALLOWED = new Set(FLOW_ASSETS.map((a) => a.sym));
```

Resposta: `{ symbol, fetched_at, source, market_state, gmtoffset, prev_close, bars: { t[], o[], h[], l[], c[], v[], s[]? } }`
(`s` = `"pre" | "reg" | "post"` com `prepost=1`). Cache 60 s.

### 6.3 `GET /api/history?symbols=AAA[,BBB][&range=1y|2y|5y|10y]`

Fechamentos diários ajustados (Yahoo v8/chart `interval=1d`), até 40 símbolos. O painel do ativo pede `range=5y` para
as janelas longas (2A, 5A). Resposta `{ fetched_at, series: { SYM: { dates[], close[], name } }, missing, errors }`.
Memo de 30 min por símbolo/range na instância; cache de borda 1 h. Cópia literal.

### 6.4 `GET /api/yields`

Juros soberanos fora dos EUA, de fontes oficiais (o Yahoo não cobre): BCE (curva AAA 2/10/30 anos), Banco da
Inglaterra (5/10/20 anos + Bank Rate), MoF do Japão (2/10/30 anos). Resposta
`{ fetched_at, rows: [{ id, country, tenor, value, prev, date, source }], errors }`. Cache 1 h (5 min se alguma fonte
falhou). Cópia literal. O MoF alterna 404/200 no arquivo do mês: a função tenta 2 vezes.

### 6.5 `GET /api/news[?symbols=AAA,BBB]`

Manchetes de 25 feeds RSS (Bloomberg, Yahoo, WSJ, Business Insider, Forbes, Fortune, Nasdaq, BBC, FT, CNBC,
MarketWatch, Investing, Seeking Alpha, Economist; e 8 brasileiros com `region: "br"`). Só título, link, fonte, horário
e resumo do próprio feed. Junta, tira repetidas (`mergeItems`: título normalizado), descarta > 36 h e datas no futuro,
corta em 160 e traduz (`translateItems`, prazo da função). O app novo chama **sem `symbols`**.

EDIÇÃO única em `api/news.js`: troque o domínio dentro de `UA_BOT` pelo do app novo
(`"Mozilla/5.0 (compatible; PenduloNews/1.0; +https://SEU-DOMINIO)"`). FT e Economist às vezes recusam navegador
simulado e aceitam leitor de RSS identificado: a função tenta com `UA` e, em 401/403, com `UA_BOT`.

Resposta `{ fetched_at, items: [...mesmo formato do news.json], sources: [nomes que responderam], errors }`.
Cache 5 min (`s-maxage=300, stale-while-revalidate=600`); sem itens = 502.

### 6.6 `GET /api/calendar[?symbols=AAA]`

Agenda da semana (Forex Factory: `ff_calendar_thisweek.json` + `ff_calendar_nextweek.json`, este último às vezes 404)

- valor divulgado dos últimos 14 dias pela Nasdaq (`api/_eco.js`), casado por indicador e horário
  (`attachActuals`). Resposta:

```jsonc
{
  "fetched_at": "ISO",
  "events": [ { "t": 1791999000, "cc": "USD", "title": "Core CPI m/m", "titlePT": "Inflação núcleo (CPI) m/m",
                "impact": "high", "forecast": "0.2%", "previous": "0.3%", "actual": "0.3%" } ],
  "corporate": [],          // vazio no app novo (sem symbols)
  "errors": [],
  "eco": { "n": 312, "error": null },
  "released": [ { "t", "date", "cc", "sub", "id": "USD:cpi:core:mm", "label", "name", "actual", "consensus", "previous" } ]  // 50 últimos
}
```

Cache 30 min (2 min se houver erro). Cópia literal.

---

## 7. Shell do front (HTML, estado, ciclo de carga, eventos)

### 7.1 HTML

`index.html` completo no anexo 17.7. Elementos com id obrigatório (o código procura por eles):

| id                     | Para quê                                                   |
| ---------------------- | ---------------------------------------------------------- |
| `freshness`            | Selo de frescor da cotação + `#countdown`                  |
| `mktSwitch`            | Botões On/Off market                                       |
| `view`                 | Onde cada sub-aba é desenhada                              |
| `toasts`               | Avisos curtos                                              |
| `drawer`, `drawerBody` | Painel lateral do ativo (classe `.drawer-box`, botão `.x`) |

Scripts: `vendor/chart.umd.min.js` (global `Chart`) **antes** de `<script type="module" src="assets/app.js">`.

### 7.2 Navegação

Uma faixa de sub-abas no topo (`.subnav > .subtabs > .subtab[data-tab]`), com a frase `TAB_INFO` da aba aberta em
`.subnav-q`. Tecla `1`–`5` troca de aba; `R` recarrega; `Esc` fecha painel/popup. Aba inicial: a última aberta
(`prefs.tab`), padrão `dash`. Link direto: `?tab=flow` abre a aba (o app lê e limpa a query).

### 7.3 Estado e preferências

`assets/state.js` (anexo 17.2). Preferências em `localStorage["mercado.prefs"]`:

| Chave         | Padrão                    | Usada por                                                         |
| ------------- | ------------------------- | ----------------------------------------------------------------- |
| `tab`         | `"dash"`                  | aba aberta                                                        |
| `dashH`       | `"1d"`                    | horizonte do Painel: `1d` `5d` `1m` `3m`                          |
| `mktMode`     | `"auto"`                  | `auto` \| `on` \| `off` (7.6)                                     |
| `newsF`       | `"top"`                   | Notícias: `top` \| `int` \| `br` \| `all`                         |
| `newsTags`    | `null` (= `DEFAULT_TAGS`) | Notícias: tags ligadas                                            |
| `newsOpen`    | `{}`                      | Notícias: seções recolhidas (`all`)                               |
| `calMin`      | `"medium"`                | Agenda: `high` \| `medium` \| `all`                               |
| `calCc2`      | `"USD,EUR,GBP,JPY,CNY"`   | Agenda: `USD` \| essa lista \| `all`                              |
| `calHistCc`   | `"all"`                   | Agenda, histórico: `all` `USD` `EUR` `DE` `GBP` `JPY` `CNY`       |
| `calHistKind` | `"all"`                   | Agenda, histórico: `all` `juros` `inflacao` `emprego` `atividade` |
| `flowHorizon` | `"1d"`                    | Fluxo: `1d` `5d` `1m` `3m`                                        |
| `flowGroup`   | `"all"`                   | Fluxo: `all` ou id de grupo                                       |
| `flowSize`    | `"liq"`                   | Fluxo: tamanho do bloco `liq` \| `eq`                             |
| `flowStrong`  | `false`                   | Fluxo: apagar \|z\| < 1                                           |
| `rotGroup`    | `"regions"`               | Fluxo: grupo da rotação                                           |

Estado em memória (não persistido): `flowBase` (flow.json), `liveRaw` (resposta de `/api/quotes`), `live` (cotações
no modo On/Off), `flow` (flow.json + cotações), `mode`, `late`, `back` (replay), `playing`, `news`, `cal`, `yields`,
`charts`, `nextAt`, `loading`.

### 7.4 Cotações sobre o histórico (`live.js`)

EDIÇÃO em `assets/live.js`: apague a linha `import { ASSETS } from "./universe.js";` e a função inteira
`applyLiveToPrices` (com seu comentário). O resto fica igual. Comportamento de `applyLiveToFlow(flow, live)`:

- Pregão de referência = data (Nova York) da cotação do SPY.
- Se essa data é **posterior** à última de `flow.dates`: acrescenta uma linha (repete o último preço de quem não tem
  cotação; volume 0).
- Para cada símbolo com cotação do mesmo pregão: troca o último ponto pelo preço ao vivo e o último volume pelo
  volume do dia; atualiza `last_real`.
- **Desdobramento não refletido na base** (`splitFactor`): se `pc` (fechamento anterior informado pelo Yahoo) difere
  do penúltimo ponto por um fator típico (2, 3, 4, 5, 8, 10, 15, 20, 25, 50 ou o inverso, ±4%), reescala a série.
- Cotação com data anterior ao pregão de referência não é aplicada.
- Nunca altera o objeto recebido (`structuredClone`).

`lateQuotes(live, symbols)`: com o SPY em `REGULAR`, lista quem está `REGULAR` com última negociação mais velha que a
tolerância (`toleranceMin`: 20 min ações/ETFs; 20 min VIX; 75 min índices `^`; 25 min futuros `=F`; 300 min agrícolas
que fecham cedo; 60 min câmbio `=X`; `^SKEW` nunca, o Yahoo só publica no fechamento). Ignora ativo pouco negociado
(`illiquid`: volume médio < 200 mil/dia), porque ficar sem negócio não é atraso da fonte (17/11/2026: 15 falsos
"atrasados" como EIRL, ENZL, CEW, CNH=F). Esses blocos ganham borda tracejada no Fluxo.

### 7.5 Ritmo de atualização (`refresh.js`)

EDIÇÃO em `assets/refresh.js`: `import { sessionInfo } from "./ta-signals.js";` → `import { sessionInfo } from "./nyse.js";`.

- `usSession(ms)`: `"open"` (9:30–16:00 NY), `"pre"` (4:00–9:30), `"post"` (16:00–20:00), `"closed"` (resto, fins de
  semana e feriados da NYSE via `sessionInfo`).
- O app novo usa sempre `STEPS.degraded`: **2 min no pregão, 5 min no pré/pós**, e nenhuma busca com o mercado fechado
  (a próxima fica marcada para as 4:00 NY do próximo dia útil, `nextPreOpen`). Não existe o canal de tempo real.
- Com a aba escondida (`document.hidden`) não busca; ao voltar, busca se já passou da hora.
- `data/flow.json` é rebaixado no máximo a cada 10 min (ou no Recarregar manual); `/api/quotes` vem sempre.
- Notícias: a cada 2 min com a aba Notícias aberta, 4 min fora dela (`loadNews` controla). Agenda: 30 min. Juros: 30 min.
  Macro: 30 min (só quando a aba Macro é desenhada).

### 7.6 Modo On / Off market (`offmarket.js`)

EDIÇÃO: `import { sessionInfo } from "./ta-signals.js";` → `import { sessionInfo } from "./nyse.js";`.

- `effectiveMode(pref, session)`: `auto` = `on` no pregão, `off` fora; `on`/`off` forçam.
- No modo Off, `offQuotes(quotes)` troca o preço de cada ativo pelo melhor dado fora do pregão, nesta ordem:
  1. proxy **exato** por futuro (`PROXY`, ex.: SPY ↔ ES=F; ^TNX pela taxa implícita do ZN=F com duration 6,5);
  2. pré/pós-mercado do próprio ativo, se da sessão atual;
  3. proxy **aproximado** por futuro (ex.: XLF ↔ ES=F × 1);
  4. último preço regular.
     O fechamento anterior (`pc`) não muda; campos extras `regP`, `regT`, `offSrc` (`fut` `fut~` `pre` `post` `live`
     `reg`), `offFut` são usados pelo Painel para mostrar a origem.
- Ativo cujo próprio mercado está aberto (Europa no pré dos EUA, Ásia à noite, moedas, cripto) mantém o preço
  (`offSrc: "live"`). Futuros (`=F`) passam direto.
- Trocar o switch **não busca de novo**: só `rebuild()` + `render()`.

### 7.7 Ciclo `load → rebuild → render`

Código completo no anexo 17.5. Resumo:

```
load({notify})
  ├─ em paralelo: data/flow.json (se > 10 min ou notify) e api/quotes
  ├─ guarda flowBase e liveRaw (ou liveError)
  ├─ rebuild(): mode → live (On/Off) → flow = applyLiveToFlow(flowBase, live) → late
  ├─ nextAt = nextAuto(agora, STEPS.degraded)
  ├─ render()
  ├─ toast se notify ou se o problema mudou
  └─ loadYields(), loadNews(), loadCalendar()  (cada um com seu ritmo)
render()
  ├─ destrói gráficos da tela, guarda foco/<details> abertos
  ├─ #freshness, #mktSwitch
  ├─ #view = subnav + VIEWS[tab]()
  ├─ aba flow: drawFlowDynamic + drawRotation (pintam depois do HTML)
  └─ flashTicks (piscar dos preços que mudaram)
```

Redesenho pedido por carga de fundo é agrupado em 1 a cada 350 ms; ação do usuário desenha na hora (`scheduleRender`).

### 7.8 Selo de frescor

Regra do app novo (baseada na cotação do SPY; o original usava o `prices.json`):

| Situação                                | Selo                | Nível |
| --------------------------------------- | ------------------- | ----- |
| Sem `/api/quotes` e com flow.json       | "Arquivo publicado" | warn  |
| Sem nada                                | "Sem dados"         | bad   |
| SPY `ms === "REGULAR"` e idade ≤ 10 min | "Ao vivo"           | ok    |
| SPY `REGULAR`, idade 11–30 min          | "Cotação de N min"  | warn  |
| SPY `REGULAR`, idade > 30 min           | "Atrasado N min"    | bad   |
| Fora do pregão                          | "Fechamento"        | ok    |

Mais o texto "Cotação de dd/mm hh:mm (Brasília) · há N min · ao vivo · 272/274 cotações", "Off market" quando no modo
Off, e a contagem "· próxima em m:ss" (ou "· mercado fechado: próxima ter. 05:00").

---

## 8. Sub-aba Visão geral (`dash`, arquivo `assets/dash.js`)

Painel estilo terminal: quadros densos por tema, leitura de regime e faixa rolante. Só HTML/SVG (sem Chart.js).

### 8.1 Entrada (`dashCtx`)

`{ flow: state.flow, quotes: state.live?.quotes, newsHits, assetNews: newsByAsset(state.news?.items), horizon: prefs.dashH, yields: state.yields, mode: state.mode, session: usSession() }`.
`newsHits` no app novo = número de manchetes de **hoje** (Brasília) com `impact === true` (anexo 17.5).

### 8.2 Layout (de cima para baixo)

1. **Barra** (`.dash-bar`): veredito do regime (`.sb-item.verdict` up/dn/mid) · "Fora da curva" (só no 1D) · "News N
   relevantes hoje" (leva à aba Notícias) · seletor de horizonte `1D 5D 1M 3M` (`[data-dash-h]`).
2. **Faixa rolante** (`.tape[data-tape]`): S&P, Nasdaq, 10a EUA, DXY, EUR, BRL, WTI, Ouro, BTC, VIX. Duplicada para
   rodar em loop (13.4). Clique pausa/retoma; clique num item abre o gráfico.
3. **Grade** (`.dash-grid`) na ordem: [Prévia do regime, só fora do pregão no 1D] · Bolsas EUA · Juros EUA · Juros
   soberanos · [Regime, quando não há prévia] · Bolsas Europa · Bolsas Ásia-Pacífico · Bolsas Américas · Moedas ·
   Commodities · Crédito e renda fixa · Setores EUA · Risco e volatilidade · Cripto.
4. Nota de rodapé (fontes e atraso).

Quadros e símbolos (`PANELS`, cópia literal; rótulo exibido entre aspas):

| Quadro               | Linhas                                                                                      |
| -------------------- | ------------------------------------------------------------------------------------------- |
| Bolsas EUA           | ^GSPC, ^NDX, ^DJI, ^RUT, ES=F, NQ=F                                                         |
| Bolsas Europa        | ^STOXX50E, ^STOXX, ^GDAXI, ^FTSE, ^FCHI, FTSEMIB.MI, ^IBEX                                  |
| Bolsas Ásia-Pacífico | ^N225, ^HSI, 000001.SS, ^KS11, ^TWII, ^NSEI, ^AXJO                                          |
| Bolsas Américas      | ^BVSP, EWZ, ^MXX, ^GSPTSE, ^MERV, ILF                                                       |
| Juros EUA (tipo yld) | ^IRX, ^FVX, ^TNX, ^TYX, CURVE (= ^TNX − ^IRX), ZN=F (preço), TLT (preço)                    |
| Moedas               | DX-Y.NYB, EURUSD=X, JPY=X, GBPUSD=X, BRL=X, MXN=X, CNY=X, AUDJPY=X                          |
| Commodities          | CL=F, BZ=F, NG=F, GC=F, SI=F, HG=F, ZS=F, ZC=F, KC=F                                        |
| Crédito e renda fixa | SHY, IEF, LQD, HYG, EMB, EMLC, TIP                                                          |
| Risco e volatilidade | ^VIX, ^VIX3M, ^VVIX, ^MOVE, ^SKEW, ^OVX                                                     |
| Cripto               | BTC-USD, ETH-USD, SOL-USD, XRP-USD, IBIT, BTC=F                                             |
| Setores EUA          | XLK, XLC, XLY, XLF, XLI, XLV, XLE, XLB, XLP, XLU, XLRE (ordenados pela variação, com barra) |
| Juros soberanos      | EUA 10 anos (^TNX, Yahoo) + linhas de `/api/yields` (variação = último × anterior, em bps)  |

Cada linha: nome (+ selos "!") e carimbo de horário · último valor · variação · mini-gráfico de 30 pregões (SVG).
Clique na linha (`data-sym`) abre o painel do ativo (13.1). A linha CURVE não é clicável.

### 8.3 Regras de cálculo

- **Variação no horizonte `h`** (`change`): `h` = 1, 5, 21, 63 pregões. Preço: `s[-1]/s[-1-h] − 1`. Taxa (`yld`):
  `(s[-1] − s[-1-h]) × 100` em **bps**.
- **Modo Off no 1D** (`rowChange`): variação desde o último fechamento regular usando o preço fora do pregão
  (`p/regP − 1`); futuros de índice usam a variação do índice à vista correspondente (`FUT_CASH`); CURVE usa ^TNX e
  ^IRX fora do pregão.
- **Cores**: convenção de terminal, verde = subiu, vermelho = caiu, para **todo** ativo (inclusive juros, VIX e
  USD/xxx). A leitura "bom/ruim para risco" fica no quadro Regime.
- **Casas decimais** (`px`): ≥ 1000 → 0; ≥ 1 e < 10 → 3; < 1 → 4; resto 2; taxas 2 casas com "%".
- **Carimbo** (`stamp`): "ter 06/10 17:00" do horário da cotação; pré/pós do ativo em linha extra; no modo Off, a
  origem ("ES=F 05:12", "~ES=F", "pré 08:41", "aberto · 10:02", "fechado · ter 06/10 17:00"); sem cotação ao vivo,
  "fech. dd/mm" do `last_real`.

### 8.4 Regime (quadro e veredito)

14 razões que **sobem com apetite a risco** (`RATIOS`), em 3 blocos de peso igual (EUA, mundo, câmbio/commodities); ver `docs/REGIME-INTENSIDADE.md`.
Para cada uma, variação da razão no horizonte. `share = (razões em alta) / (razões com dado)`.
Veredito: `share ≥ 0,7` → "Risk-on"; `≤ 0,3` → "Risk-off"; senão "Misto". **Estrutura do VIX**: `VIX / VIX3M > 1` →
"Estresse (VIX invertido)" (sobrepõe o veredito). Linha extra "VIX ÷ VIX 3m" (invertido/normal).

**Prévia do regime** (modo Off + 1D): cada razão usa o preço fora do pregão das duas pontas desde o último fechamento;
só conta quem tem preço fora do pregão; razão cujas duas pontas são estimadas pelo **mesmo futuro** (ex.: RSP e SPY
pelo ES=F) fica fora ("mesmo futuro nas duas pontas"). Título "Prévia do regime · pré-mercado|pós-mercado|mercado
fechado". A função `regime(close, h, quotes)` é pura e testada (`tests/offmarket.test.js`).

### 8.5 Selos "!" (`asset-news.js`)

- **Fora da curva** (só 1D): `zMove` = variação de hoje ÷ desvio-padrão das variações diárias dos 60 pregões anteriores.
  `|z| ≥ 2,5` (`Z_ALERT`) → botão vermelho "!" (`.aout`). O item "Fora da curva" da barra lista os 3 maiores; clique
  abre o popup global (`outliersPopHtml`) ordenado por `|z|`.
- **Notícia que explica**: se há manchete de hoje ligada ao ativo (`newsByAsset`, palavras de `ASSET_WORDS`, só
  manchetes com `marketScore > 0`) **e** o ativo se moveu (`moved`: ≥ 0,4% em preço, ≥ 3 bps em taxa) → ícone de
  jornal (`.anews`); clique abre "Por que está variando" (`assetNewsPopHtml`) com até 3 manchetes.

### 8.6 EDIÇÕES em `assets/dash.js`

1. Apague `import { valueCards } from "./fa.js";`.
2. Apague a função `tapePortfolio` inteira (com o comentário acima dela).
3. Em `viewDash`, apague o bloco que começa em `const v = ctx.valuation;` e termina no `: "";` que fecha
   `const valueItem = …` (variáveis `v`, `pf`, `vc`, `vby`, `valueItem`).
4. Troque `const tapeItems = tape(close, h) + tapePortfolio(close, h, ctx.valuation?.rows);` por
   `const tapeItems = tape(close, h);`.
5. No `return`, apague as linhas `${pf}` e `${valueItem}`.
6. No botão News, troque `<span class="dim">sobre a carteira</span>` por `<span class="dim">relevantes hoje</span>`.

Nada mais muda (o comentário `ctx: {...}` pode ficar).

---

## 9. Sub-aba Macro (`macro-view.js`, `macro.js`)

### 9.1 Tela

1. **Cabeçalho** (`.mc-head`): nota macro grande (−100 a +100; verde > 15, vermelha < −15) · "Regime: Desaceleração"
   com a frase e o mês do dado · chips de probabilidade de cada regime (o atual em destaque) · "Surpresas da agenda
   (30 dias)" e "Temas nas manchetes (3 dias)" (chip vermelho = geopolítico).
2. **Pilares (EUA)**: um `<details open>` por pilar (Crescimento, Inflação, Juros e Fed, Condições financeiras,
   Geopolítica) com nota e barra; tabela de indicadores (rótulo, leitura, data · valor + unidade · nota · barra).
3. **Mundo**: zona do euro, Japão e China no mesmo formato (pilar `global`, 15% da nota).
4. **Setores no regime atual**: 13 linhas (XLB…EEM, TLT, GLD, IWM) com Inclinação, média no regime atual (%/mês acima
   do S&P), meses acima do S&P (acerto e n), estatística t e efeito das notícias. Clique no código abre o painel do
   ativo (todos estão no `flow-universe`).
5. **Agenda dos EUA: projeção × resultado** (`releasesHtml`): 60 divulgações mais recentes de `macro-releases.json`,
   data em Brasília, projeção, anterior, resultado ("a divulgar" / "aguardando FRED"), surpresa com "▲ bom p/ ações"
   ou "▼ ruim p/ ações". Linhas futuras com `.mc-future`.
6. Nota de rodapé (fontes, modo sombra) e falhas da última carga (`errors`).

Cores: `tone(x)` = `pos` se > 0,25, `neg` se < −0,25, senão `muted`. Barra `mc-bar` com escala ±2,5.

### 9.2 Como o cron calcula (resumo; código em `scripts/update-macro.mjs`)

- Cada indicador vira nota −2,5 a +2,5 (**+ é bom para ações**), em geral pelo z do valor atual contra a própria série
  (`zNow`, até 120 observações) ou por uma régua fixa (ex.: CPI: `−(a/a − 2%)/1%`).
- Regra de Sahm: média de 3 meses do desemprego − mínima dos 12 meses anteriores ≥ 0,5 = sinal de recessão.
- **Regime** (relógio do investimento): crescimento = variação em 3 meses do a/a da produção industrial; inflação =
  idem do CPI; usa o mês anterior (publicação atrasada). Quadrantes: recup (g ≥ 0, p < 0), super (g ≥ 0, p ≥ 0),
  estag (g < 0, p ≥ 0), desac (g < 0, p < 0). Probabilidade por logística da distância ao eixo (escalas 0,01 e 0,004).
- **Setores**: retorno mensal ajustado (Yahoo) acima do SPY no mês seguinte, por regime, desde 1999; inclinação =
  Σ prob(regime) × média × n/(n+24) ÷ 1% + efeito das notícias × 0,5, limitada a ±3.
- **Nota geral** = Σ pesos × nota do pilar ÷ 2,5 × 100, pesos: crescimento 0,25; inflação 0,20; juros 0,15;
  financeiro 0,15; geopolítica 0,10; mundo 0,15.
- **Agenda**: guarda projeção/anterior do Forex Factory (EUA, impacto alto e médio); depois da divulgação busca o
  valor no FRED (série e unidade mapeadas em `MAP`, só se a observação tiver até 75 dias antes da divulgação);
  `surprise = actual − forecast`; `good = sinal(surprise) × GOOD[série]` (inflação e desemprego acima = ruim).
- O FRED **recusa User-Agent de navegador** e derruba conexões paralelas: o script busca uma série por vez, sem UA.

### 9.3 EDIÇÃO em `assets/macro.js`

Troque `if (["macro", "home", "signals", "entry"].includes(state.prefs.tab)) hooks.render();` por
`if (state.prefs.tab === "macro") hooks.render();`. O import `import { hooks, state } from "./state.js";` continua
válido com o `state.js` novo. `macroTilt` e `PROXY` podem ficar (não são usados pela tela).

---

## 10. Sub-aba Notícias (`news-view.js`, `news.js`, `translate.js`, `feeds.js`)

### 10.1 Origem e acúmulo

`loadNews()` (anexo 17.4) busca em paralelo `/api/news` e `data/news.json`, junta (`mergeItems`), marca carteira
(`matchNews` com lista vazia: nenhum `hits`), classifica (`tagNews`) e **acumula** com o que já estava na tela
(`accumulate`): mantém o `seen` (horário em que a manchete apareceu no app; 0 na primeira carga), descarta > 36 h,
ordena por horário, máximo 600. Assim o feed é contínuo mesmo que as fontes devolvam só as últimas N.

### 10.2 Classificação (`classifyNews`)

Tags de assunto por expressões (`TAG_RES`): macro, geo, commod, stocks, earnings, bonds, fx, crypto, corp; mais
`opinion` (perguntas retóricas, colunas, "should you buy…") e `noise` (escritórios de advocacia, releases
corporativos sem efeito de preço, estilo de vida). Sem nenhuma → `other`.
`impact = true` quando não é opinião nem ruído e tem assunto de mercado (geo sozinho só com palavra de conflito:
sanction, war, strike, missile, attack, tanker, hormuz, invasion, ceasefire, tariff).
Filtro padrão (`DEFAULT_TAGS`): tudo menos Outros, Opinião e Ruído. Lista vazia volta ao padrão (`toggleTag`).

### 10.3 Relevância (`marketScore`)

Conta quantas palavras de `MARKET_WORDS` (EN e PT) aparecem no título. 0 = provavelmente não é notícia de mercado.

### 10.4 Tela (formato terminal, `.bb`)

1. **Faixa de comando** (`.bb-cmd`): "NEWS" · abas `Destaques | Internacional | Brasil | Todas` (`[data-news-f]`) ·
   "+N" novas (aparecidas há < 20 min) · total · hora da busca (BRT).
2. **Tags** (`.bb-tags`): um botão por tag com contagem (`[data-news-tag]`, `aria-pressed`) + "N ocultas pelo filtro".
3. **Mais relevantes** (exceto em "Todas"): 5 maiores `marketScore`.
4. **Por horário** (`<details data-news-sec="all">`, estado lembrado em `prefs.newsOpen`): até 150, mais novas primeiro.
5. Rodapé: fontes que responderam e explicação.

Linha: `n)` · título em português (`ptTitle`) · chips de tag · código da fonte (`srcCode`: BBG, WSJ, FT…) · hora
(só hh:mm se for hoje; senão dd/mm hh:mm). Selo "novo" por 20 min. Clique abre o popup (`openNewsPop`) com fonte,
hora, título, resumo traduzido (ou "A fonte não publica resumo"), tags e botão "Abrir matéria ↗" (`target=_blank`,
`rel="noopener noreferrer"`). Destaques = manchetes com `marketScore > 0`; Internacional/Brasil = idem filtradas
por `region`.

### 10.5 Tradução

No servidor (`/api/news` e cron), Google Translate público (`translate.googleapis.com/translate_a/single?client=gtx`),
lotes de até 4.000 caracteres (uma linha por texto), cache na instância, e ajustes de pt-PT para pt-BR (`ptBR`). Se a
tradução embaralhar o número de linhas, fica o original. Manchetes `region: "br"` não são traduzidas. O original
(`title`, `d`) fica no item para a classificação por palavras em inglês.

### 10.6 EDIÇÃO em `assets/news-view.js`

Em `viewNews`, substitua o bloco inteiro `const pf = ctx.hasPortfolio ? … : …;` por `const pf = "";`
(as variáveis `mine`, `direct`, `pfList` podem ficar: com `hits` sempre ausente, ficam vazias). Nada mais.

---

## 11. Sub-aba Agenda (`calendar-view.js`, `calendar.js`, `macro-alerts.js`)

### 11.1 Dados

`loadCalendar()` (anexo 17.4): `GET /api/calendar` a cada 30 min; em erro, mantém o anterior e tenta de novo em ~5 min.

### 11.2 Aviso de risco de evento (`eventRiskHtml`)

Evento de impacto **alto** dos EUA entre 30 min atrás e 2 h à frente → cartão "⚠ Evento de alto impacto em N min
(hh:mm): …" com botão "Ver agenda". Mostrado no topo da Agenda.

### 11.3 Agenda econômica

Filtros (`[data-setpref][data-val]`): Impacto `Alto | Médio+ | Todos` (`calMin`) e Países `EUA | Principais | Todos`
(`calCc2`). Lista: daqui para a frente + o que saiu hoje com valor divulgado (`e.t >= agora` ou `actual` e mesmo dia),
agrupada por dia (Brasília, `groupByDay`). Colunas: Hora · País · Impacto (Alto/Médio/Baixo/Feriado) · Evento (título
traduzido por `titlePT`, original em cinza quando difere) · Atual (verde acima da projeção, vermelho abaixo) ·
Projeção · Anterior. O próximo evento ganha `.next`; os que já passaram, `.past`. Falhas da fonte em nota.

### 11.4 Últimos dados divulgados (`releasedHtml`)

`<details id="cal-released">` com os 50 últimos (`released` da API), filtros País (`calHistCc`) e Tipo
(`calHistKind`: Juros, Inflação, Emprego, Atividade pelo `kindOf`). Cada item: rótulo em português, nome original,
quando · onde, "Atual" colorido contra a projeção, "Proj." e "Ant.". Fonte: Nasdaq.

Detalhe que importa: a Nasdaq publica dados da Ásia no **dia local** com a **hora da véspera em Nova York**; `fixT`
recua 1 dia quando o dado já divulgado tem hora no futuro. Já está no código; não remova.

### 11.5 EDIÇÕES em `assets/calendar-view.js`

1. No `return` de `viewCalendar`, apague a `<section class="card">` inteira de "Resultados e dividendos (carteira e
   listas)" e, acima, a variável `corp` que a monta.
2. Na nota da agenda, apague a frase `Ligue "Calendário macro" em Configurações → Avisos para receber o dado no celular
assim que sair.`

---

## 12. Sub-aba Fluxo (`flow-view.js`, `flow-engine.js`, `flow-universe.js`)

Fluxo **inferido por preço e volume**, não por captação real dos ETFs (não há fonte gratuita). Deixe isso escrito na
tela, como está.

### 12.1 Universo

21 grupos e 274 símbolos em `flow-universe.js` (copie literal). Cada símbolo: `[código Yahoo, rótulo curto, nome,
grupo, opções]`. Opções: `inv` (cotado em moeda local por US$: a tela inverte para "moeda contra o dólar"), `yld`
(taxa: variação em bps, taxa subindo = saída de títulos = vermelho), `risk` (sobe com aversão a risco: alta =
vermelho). Grupos com `bench` (SPY, ACWI, AGG, DBC) usam esse benchmark na rotação; `noRotation` (juros, vol) não
aparecem na rotação.

### 12.2 Métrica de cada ativo (`assetFlow`)

Para o horizonte `h` (1, 5, 21, 63) no pregão `end` (último, ou anterior no replay):

```
move  = s[end]/s[end−h] − 1            (taxa: s[end] − s[end−h], em p.p.)
daily = variações diárias dos 60 pregões até end (mesma unidade)
z     = move / (desvio(daily) × √h)
z     = −z  se yld ou risk              (taxa ou VIX subindo = dinheiro saindo)
value = move × 100   (% ou bps)
```

Precisa de `end − 61 ≥ 0`. Mostrado como "+1,2%" / "+8 bps" e "+1,5σ".

**Volume relativo** (`relVolume`): volume do pregão ÷ média dos 20 anteriores (só dias com volume > 0, mínimo 10),
dividido pela **fração decorrida do pregão** (`sessionFraction`, 9:30–16:00 NY, mínimo 0,05) quando é o pregão de hoje.
`≥ 1,5` = "quente" (◆).

**Liquidez** (tamanho do bloco): média de US$ negociados nos últimos 20 pregões (`volume × preço`; cripto `-USD` já vem
em US$). Tamanho do bloco = `max(0,6; log10(liquidez) − 5)`; sem volume (moedas, índices) = mediana dos tamanhos × 0,8.
Modo "igual" = todos 1.

### 12.3 Grupos e manchete

`groupFlows`: por grupo, z médio (peso igual), amplitude (% com z > 0), 3 mais fortes e 3 mais fracos; ordenado por z.
`flowHeadline`: "Saindo de" (até 3 grupos com z < −0,25) → "Entrando em" (até 3 com z > 0,25).

### 12.4 Narrativa do dia (`flowNarrative`, sempre no horizonte 1D)

- **Fase** (`flowPhase`): pré, pós, fechado, replay; no pregão: abertura (fração < 0,15), meio, última hora (> 0,85),
  cada uma com título e texto próprios (copiados do código).
- **Tom**: média do z dos grupos futuros de índices, estilos EUA, volatilidade, cripto e emergentes. `> 0,4` "Apetite a
  risco", `< −0,4` "Aversão a risco", senão "Tom misto".
- **Mercados**: grupo "ganhando força" se z ≥ 0,5; "perdendo" se ≤ −0,5; até 6 de cada com 2 ativos de exemplo.
- **Para observar entrada**: até 6 ativos negociáveis (fora índices à vista, taxas, vol e câmbio à vista) com z ≥ 1,
  ordenados por `z + 0,5 (se volume ≥ 1,5x no pregão) + 0,3 (se o grupo também ≥ 0,5)`.
- **Fracos**: até 5 com z ≤ −1.
- **O que mudou hoje** (só no pregão atual): a cada atualização compara com a narrativa anterior (`narrativeChanges`):
  fase, tom, grupo que mudou de estado, ativo que entrou nos fortes; guarda os 14 últimos com horário. Reinicia quando
  o pregão muda. Vive em memória (some ao recarregar a página), como no original.

### 12.5 Tela (de cima para baixo)

1. `#flowHeadline` (manchete com chips de grupo; clique filtra o mapa).
2. `#flowStory` (narrativa, 12.4).
3. Barra: horizonte `Hoje | 5 dias | 1 mês | 3 meses` (`[data-fh]`), grupo (`<select data-pref="flowGroup">`),
   tamanho `liquidez | igual` (`[data-fsize]`), **Replay** (botão + `<input type=range id=flowBack>` de 0 a 19 +
   data).
4. Grade: **Para onde vai o dinheiro, por grupo** (`#groupBars`: barra divergente com |z| até 2 = 50% da largura, % em
   alta; clique filtra) e **Mapa de calor** (`#treemap`).
5. **Rotação relativa** (`#rotChart`, Chart.js scatter + `#rotChips`).
6. "Ver em tabela" (`<details>` com `#flowTable`: ativo, grupo, variação, σ, volume relativo, preço; ordenada por z).
7. `#tip` (tooltip do mapa, segue o mouse).

### 12.6 Mapa de calor (`drawTreemap`)

- Treemap **squarified** (Bruls et al., `squarify`) em dois níveis: grupos (tamanho = soma dos blocos) e ativos.
- Cabeçalho do grupo (18 px) se o grupo tiver > 44 px de altura e > 60 de largura; clique amplia/volta.
- Altura: celular (< 640 px) 980 px; senão entre 560 e 900 (62% da largura). **Celular com todos os grupos**: cada grupo
  vira uma faixa empilhada (`perRow = max(3, floor(W/92))`, 54 px por linha), porque 274 blocos em 390 px ficam
  ilegíveis.
- Cor (`zColor`): interpola do `--tile-neutral` do tema até `--buy` (z ≥ 0) ou `--sell`, com `t = min(|z|/2,5; 1)^0,85`;
  texto preto ou branco pelo maior contraste (`readableOn`).
- Texto proporcional ao bloco (`tileBody`): fonte entre 9 e 20 px; mostra valor e "◆ 1,8x" só se couber.
- Classes: `.late` (cotação atrasada, borda tracejada), `.hot` (volume ≥ 1,5x), `.dim` (fora da busca ou "só fortes"),
  `.found` (bate com a busca `#flowFind`, que só apaga/acende sem redesenhar).
- Animação FLIP: cada bloco nasce onde estava e desliza até a posição/cor nova (desligada com
  `prefers-reduced-motion`).
- Redesenha no `resize` (com espera de 200 ms) e no `mousemove` atualiza o tooltip.

### 12.7 Rotação relativa (`rotation`, `drawRotation`)

Inspirada em RRG: `RS = 100 × ativo/benchmark`; `rsRatio = 100 × MM10(RS)/MM50(RS)`;
`rsMom = 100 × rsRatio(t)/rsRatio(t−10)`. Cauda de 8 pontos, 1 a cada 5 pregões. Sem benchmark, usa a média do grupo
(peso igual, normalizada). Quadrantes: Liderando (x ≥ 100, y ≥ 100, verde), Perdendo força (x ≥ 100, y < 100,
âmbar), Atrasado (x < 100, y < 100, vermelho), Ganhando força (x < 100, y ≥ 100, azul). O plugin desenha o fundo dos
quadrantes com contagem e rótulos sem sobreposição. Foco: passar o mouse realça; tocar fixa (vários); chips por
quadrante com "Limpar foco".

EDIÇÃO única em `flow-view.js`, na última nota de `drawStory`: troque
`confirme com o gatilho da aba Decisões e use stop.` por `confirme com a sua própria análise e use stop.`

### 12.8 Replay

`REPLAY_DAYS = 20`. O range vai de 0 (19 pregões atrás) a 19 (hoje); `back = 19 − valor`. **▶ Replay** começa em 19
pregões atrás e avança 1 pregão a cada 700 ms até hoje; mexer no range ou trocar de aba pausa. No replay só as partes
dinâmicas são repintadas (`drawFlowDynamic`), não a página inteira. A narrativa vira "Replay" e não registra mudanças.

### 12.9 Painel do ativo no Fluxo (`openFlowAsset`)

Abre o drawer com nome, grupo, preço (ou taxa / "moeda por US$"), variação e σ em cada horizonte, volume relativo,
último preço real e as notas de `inv`/`yld`, seguido do painel comum (13.1) com `{ dates, close }` do flow.json.
É também o que abre ao clicar em **qualquer** `[data-sym]` do app novo (Painel, Macro, popups).

---

## 13. Componentes comuns

### 13.1 Painel do ativo (`asset-pop.js`)

Um balão no drawer: preço grande e variação do dia · "Histórico de preço" com selo "live" (pregão regular e cotação
< 20 min) ou "Último preço: dd/mm hh:mm" · gráfico (Chart.js linha) · janelas `1D 5D 1M 3M 6M 1A 2A 5A` com a
rentabilidade de cada uma · faixa do dia e de 52 semanas · liquidez (volume hoje, médias 10 d e 3 m, volume relativo,
giro em US$ e nota Alta ≥ 100 mi / Média ≥ 10 mi / Baixa).

- 1D/5D: barras de 5 min de `/api/intraday?prepost=1` (pré em azul tracejado, pós em violeta tracejado, linha do
  fechamento anterior), atualizadas a cada 60 s enquanto aberto.
- 1M a 1A: fechamentos locais (flow.json) com MM50 e MM200. 2A e 5A: `/api/history?range=5y` (buscado uma vez por
  ativo).
- Preço grande relido a cada 15 s da cotação do app; ativo sem cotação busca a sua (`/api/quotes?only=1&extra=SYM`) a
  cada minuto.
- Índice, futuro ou moeda: sem giro nem nota de liquidez (o volume não é dinheiro num papel).

EDIÇÕES em `assets/asset-pop.js`:

1. Apague `import { hq } from "./help.js";` e `import { mkt } from "./market.js";`.
2. Em `assetPanelHtml`, troque `${rangeBar(\`Faixa de 52 semanas ${hq("range52", { sym, price, h52, l52 })}\`, l52, h52, price, d)}`por`${rangeBar("Faixa de 52 semanas", l52, h52, price, d)}`.
3. Em `paintLegend`, apague `${key ? hq(key, ctx) : ""}` e troque a desestruturação `([l, color, key, ctx, dash]) =>`
   por `([l, color, , , dash]) =>` (sem isso o lint acusa `key` e `ctx` sem uso).
4. Em `paintPrice`, troque `state.live?.quotes?.[sym] ?? mkt.quotes[sym] ?? ownQuote.get(sym)` por
   `state.live?.quotes?.[sym] ?? ownQuote.get(sym)`.
5. Em `mountAssetPanel` (função `pt`), troque `state.live?.quotes?.[sym] ?? mkt.quotes[sym]` por
   `state.live?.quotes?.[sym]`.

### 13.2 Popups (`.npop-back` / `.npop`)

Usados por: matéria (Notícias), "Por que está variando", "Fora da curva hoje". Sempre um por vez (abrir remove o
anterior). Fecham com clique fora (`.npop-back[data-npop-close]`), no ✕ (`.npop-x`) ou `Esc`. Linha do popup "Fora da
curva" (`.out-tbl tr[data-sym]`) fecha o popup e abre o painel do ativo.

### 13.3 Piscar de preço (`flash.js`)

Todo preço na tela leva `data-tick` (chave) e `data-tv` (valor) via `tickAttr`. Depois de cada `render`, `flashTicks`
compara com o último valor visto: subiu → `.tick-up`, caiu → `.tick-dn` (animação curta no CSS).

### 13.4 Faixa rolante (`marquee.js`)

Desliza a 40 px/s em loop (`requestAnimationFrame`), posição guardada no módulo (continua depois de redesenhar).
Para com o mouse em cima, foco no teclado, aba escondida ou clique (`held`; outro clique retoma). Com "reduzir
movimento" fica parada. Chamar `initMarquee()` uma vez no boot.

### 13.5 Tema (`theme.js`, `themes.css`)

6 temas por variáveis CSS (`midnight` padrão, `graphite`, `ember`, `terminal`, `paper`, `mist`), aplicados em
`<html data-theme data-mode data-cb data-density data-motion>` por `applyUi(loadUi())`. Os gráficos leem as cores com
`pal()` / `cssVar()`. EDIÇÃO: em `theme.js`, `const KEY = "pendulo.ui";` → `const KEY = "mercado.ui";`. Seletor de tema
na tela é opcional (não faz parte da seção Mercado); sem ele, vale o padrão (`midnight`).

Variáveis que o código lê diretamente: `--buy --sell --wait --info --violet --accent --text --text-2 --text-3
--surface --surface-2 --surface-3 --line --line-2 --bg --ui --mono --tile-neutral`.

### 13.6 Gráficos e drawer (`charts.js`)

EDIÇÕES: apague `import { watchDrawer } from "./fold.js";`, a chamada `watchDrawer();` dentro de `openDrawer`, e a linha
`export const seriesOf = (code) => state.prices.series[code];`.

Regras que existem por bug real (não remova): destruir o gráfico **e** zerar `canvas.width/height` (o Safari do iPhone
tem teto de memória somado de canvas); `devicePixelRatio` máximo 2; gráfico do drawer só depois de 2 frames
(`requestAnimationFrame` duplo) e `resize` aos 450 ms (canvas criado antes do layout sai em branco no iOS); sem
animação no Chart.js (dados ao vivo + gráfico destruído no meio do quadro quebravam).

### 13.7 CSS

Não escreva CSS à mão. Gere `assets/mercado.css` a partir do original com o extrator
`scripts/extract-mercado-css.mjs` (já está no repositório original):

```bash
# na raiz do repositório ORIGINAL
node scripts/extract-mercado-css.mjs assets/styles.css > /caminho/do/app-novo/assets/mercado.css
cp assets/themes.css /caminho/do/app-novo/assets/themes.css
# no app novo (o extrator não formata; sem isto o "npm run format:check" falha)
npx prettier --write assets/mercado.css
```

Ele remove comentários, mantém `@font-face`, `@keyframes`, regras globais de elemento (html, body, button, table…) e
toda regra (inclusive dentro de `@media`) cujo seletor cite uma das classes ou ids usados pela seção Mercado. Saída
validada: ~3.200 linhas, CSS válido (o Prettier analisa sem erro). As fontes são referenciadas como
`../fonts/*.woff2` (relativas a `assets/`), por isso `fonts/` fica na raiz.

Depois de gerar, abra cada sub-aba e procure elemento sem estilo; se faltar alguma classe, acrescente-a na lista
`CLASSES` do extrator e gere de novo (não edite o `mercado.css` à mão, para poder regenerar).

---

## 14. Ordem de execução (fases)

Cada fase termina com `npm run lint`, `npm run format:check` e `npm test` verdes.

**F1. Esqueleto e dados de base**

1. Repositório novo com `package.json`, configs de lint/format/test, `npm install`, `npm run vendor`.
2. Copiar `flow-universe.js`, `scripts/update_flow.py`, `scripts/verify-flow.mjs`, `scripts/requirements.txt`.
3. Rodar `python scripts/update_flow.py && node scripts/verify-flow.mjs` localmente; commitar `data/flow.json`.
4. Workflow `update-flow.yml` sem o passo de notícias por enquanto; rodar pelo botão "Run workflow".
   Aceite: `data/flow.json` com 300 datas e > 250 séries; o job commita sozinho.

**F2. APIs de cotação**

1. `api/_http.js`, `api/_nasdaq.js`, `api/quotes.js` (E), `api/intraday.js` (E), `api/history.js`, `vercel.json`.
2. Deploy; `GET /api/quotes` com `count` perto de 274; `GET /api/intraday?symbol=SPY&prepost=1` com barras;
   `GET /api/history?symbols=SPY&range=5y` com ~1.250 pontos.

**F3. Shell + Visão geral**

1. `index.html`, `state.js`, `widgets.js`, `nyse.js`, `refresh.js` (E), `offmarket.js` (E), `live.js` (E),
   `format.js`, `net.js`, `theme.js` (E), `themes.css`, `mercado.css`, `charts.js` (E), `flash.js`, `marquee.js`,
   `asset-pop.js` (E), `asset-news.js`, `dash.js` (E), `feeds.js`, `app.js` (com as outras views ainda como
   "em construção" se quiser).
2. `api/yields.js`.
   Aceite: seção 15.2.

**F4. Fluxo**: `flow-engine.js`, `flow-view.js` (E). Aceite 15.6.

**F5. Notícias**: `news.js`, `translate.js`, `news-view.js` (E), `api/news.js` (E), `scripts/update-news.mjs`; passo de
notícias no `update-flow.yml`. Aceite 15.4.

**F6. Agenda**: `calendar.js`, `calendar-view.js` (E), `macro-alerts.js`, `notif-topics.js`, `api/_eco.js`,
`api/calendar.js`. Aceite 15.5.

**F7. Macro**: `news-impact.js`, `scripts/update-macro.mjs`, `update-macro.yml`, `macro.js` (E), `macro-view.js`.
Rodar o workflow uma vez pelo botão. Aceite 15.3.

**F8. Testes portados e CI** (15.1) e revisão final do checklist.

---

## 15. Testes e checklist de aceite

### 15.1 Testes portados (Vitest)

Copiar **literal** (funcionam sem mudança com os arquivos acima):
`tests/calendar.test.js`, `tests/news.test.js`, `tests/translate.test.js`, `tests/offmarket.test.js`,
`tests/refresh.test.js`, `tests/asset-news.test.js`, `tests/asset-pop.test.js`, `tests/asset-intraday.test.js`.

Copiar **parcialmente** (apagar os `describe`/`it` que usam módulos que não existem no app novo):

- `tests/live-flow.test.js`: manter os testes de `flow-engine.js`, `applyLiveToFlow`, `nyDate`, `brtISO`,
  `lateQuotes`, `toleranceMin`, `splitFactor`/`rescale`; apagar os que usam `applyLiveToPrices`, `ASSETS`,
  `computeSnapshot`, `validatePrices` e `helpers.js` (e os imports correspondentes).
- `tests/macro-alerts.test.js`: apagar o que usa `alertsFor` (push).
- Não portar: `macro.test.js` (`edge.js`), `news-impact.test.js` (`analysis-context.js`).

Teste novo obrigatório (contrato do cron): `node scripts/verify-flow.mjs` no CI.

### 15.2 Visão geral

- [ ] Barra mostra veredito do regime, "Fora da curva" (só 1D), "News N relevantes hoje" e horizonte 1D/5D/1M/3M.
- [ ] Os 13 quadros aparecem na ordem da seção 8.2 com nome, carimbo, valor, variação e mini-gráfico.
- [ ] Juros em % com 2 casas e variação em bps; preços com casas pela regra de 8.3; verde = subiu para todo ativo.
- [ ] Trocar o horizonte muda todas as variações e o título "Regime (5D)".
- [ ] No pré-mercado (ou forçando Off): quadro "Prévia do regime · pré-mercado" no topo e carimbos com a origem.
- [ ] Clique em qualquer linha (exceto Curva) abre o painel do ativo; 1D mostra barras de 5 min.
- [ ] Juros soberanos com BCE, BoE e MoF (ou a nota "Fontes oficiais indisponíveis agora").
- [ ] Faixa rola, para com o mouse e com clique.

### 15.3 Macro

- [ ] Nota, regime, probabilidades, surpresas e temas no cabeçalho.
- [ ] 5 pilares dos EUA e 3 regiões do mundo com indicadores e barras.
- [ ] Tabela de 13 setores; clique no código abre o painel.
- [ ] Agenda dos EUA com projeção, anterior, resultado e surpresa colorida.

### 15.4 Notícias

- [ ] Abas Destaques/Internacional/Brasil/Todas; tags com contagem; "N ocultas pelo filtro".
- [ ] Títulos em português; selo "novo" por 20 min; código da fonte e hora.
- [ ] Clique abre o popup com resumo e "Abrir matéria ↗" (nova aba).
- [ ] Com a aba aberta, novas manchetes entram sozinhas a cada ~2 min sem perder a rolagem.
- [ ] Nenhuma menção a "carteira".

### 15.5 Agenda

- [ ] Filtros de impacto e países funcionam e são lembrados.
- [ ] Eventos de hoje já divulgados mostram "Atual" verde/vermelho contra a projeção.
- [ ] "Últimos dados divulgados" com filtros de país e tipo.
- [ ] Aviso de evento de alto impacto dos EUA nas 2 h anteriores.
- [ ] Sem seção de resultados/dividendos.

### 15.6 Fluxo

- [ ] Manchete "Saindo de → Entrando em", narrativa com fase/tom/mercados/candidatos/fracos.
- [ ] Mapa de calor com cores do tema, ◆ de volume, busca que destaca, "Só fortes (≥1σ)".
- [ ] Celular (390 px): grupos empilhados e legíveis.
- [ ] Clique no grupo filtra; clique de novo volta a todos.
- [ ] Rotação com 4 quadrantes, cauda, chips; trocar o grupo da rotação.
- [ ] Replay percorre 20 pregões e pausa ao mexer no range.
- [ ] Tabela ordenada por σ.

### 15.7 Geral

- [ ] On/Off muda os preços sem nova busca; "auto" segue a sessão.
- [ ] Selo de frescor e contagem até a próxima atualização; nada é buscado com o mercado fechado.
- [ ] `Esc` fecha painel/popup; teclas 1–5 trocam de aba; `R` recarrega.
- [ ] Nenhum erro no console em nenhuma aba; sem chamadas a arquivos/rotas do app original.

---

## 16. Armadilhas conhecidas (leia antes de depurar)

- **Yahoo exige cookie + crumb** no v7/quote; sem eles responde 401. Sessão vale ~30 min; em 401/403 renove uma vez.
  Em rajada responde **429**: por isso cache de borda de 60 s em `/api/quotes` e blocos de 60.
- **Câmbio `=X` atrasado 1 dia** no diário do Yahoo: `fix_fx_dates` no cron (5.1). Sem ela, a variação de moedas sai no
  dia errado.
- **Futuros da CME**: o fechamento de referência (`pc`) só "vira" às 18:00 de Nova York; `impliedByFuture` trata isso
  (`rolled`). Não compare futuro com o fechamento do ativo antes desse horário.
- **Agrícolas** fecham antes das 16:00 mas o Yahoo segue marcando `REGULAR`: tolerância de atraso de 300 min
  (`EARLY_CLOSE` em `live.js`), senão viram "atrasados" todo dia.
- **FT, Economist** recusam a Vercel: vêm pelo cron com `curl` (`data/news.json`). Outros sites recusam o UA de bot e
  aceitam o de navegador (e vice-versa): `api/news.js` tenta os dois.
- **FRED** recusa User-Agent de navegador e conexões em paralelo: uma série por vez, sem UA (o `update-macro.mjs` já faz).
- **Forex Factory `nextweek`** às vezes devolve 404 no começo da semana: é tratado como opcional.
- **Nasdaq (agenda)**: Ásia no dia local com hora da véspera de NY (`fixT`).
- **MoF do Japão** alterna 404/200 no CSV do mês: 2 tentativas.
- **Vercel Hobby**: 100 deploys/dia; cada commit de dados é um deploy. Não aumente a frequência dos crons. Funções com
  `maxDuration: 30`; todas usam `deadline` para responder antes do teto.
- **iOS Safari**: memória de canvas (destruir e zerar), canvas em branco se criado antes do layout (2 frames), gesto de
  pinça (o app bloqueia `gesturestart/gesturechange`).
- **Feriados da NYSE** em `assets/nyse.js` vão até 2027: **atualizar todo ano** (senão o app busca em feriado e o
  `usSession` erra).
- `localStorage` pode estar bloqueado (aba anônima, Safari): `store.get/set` engolem o erro; o app funciona sem memória.

---

## 17. Anexo: código novo completo

### 17.1 `assets/nyse.js`

```js
// Calendário da NYSE (atualizar todo ano): feriados com a bolsa fechada e pregões encerrados às 13:00.
// Extraído de assets/ta-signals.js do Pêndulo (sessionInfo).
const CLOSE = 16 * 60;

const HOLIDAYS = {
  "2026-01-01": "Ano Novo", "2026-01-19": "Martin Luther King", "2026-02-16": "Dia dos Presidentes",
  "2026-04-03": "Sexta-feira Santa", "2026-05-25": "Memorial Day", "2026-06-19": "Juneteenth",
  "2026-07-03": "Independência (observado)", "2026-09-07": "Dia do Trabalho", "2026-11-26": "Ação de Graças",
  "2026-12-25": "Natal",
  "2027-01-01": "Ano Novo", "2027-01-18": "Martin Luther King", "2027-02-15": "Dia dos Presidentes",
  "2027-03-26": "Sexta-feira Santa", "2027-05-31": "Memorial Day", "2027-06-18": "Juneteenth (observado)",
  "2027-07-05": "Independência (observado)", "2027-09-06": "Dia do Trabalho", "2027-11-25": "Ação de Graças",
  "2027-12-24": "Natal (observado)",
}; // prettier-ignore
const EARLY_CLOSE = new Set(["2026-11-27", "2026-12-24", "2027-11-26"]);

/** Situação da bolsa dos EUA numa data (AAAA-MM-DD): { open, closeMin, reason }. */
export function sessionInfo(date) {
  const wd = new Date(`${date}T12:00:00Z`).getUTCDay();
  if (wd === 0 || wd === 6) return { open: false, closeMin: CLOSE, reason: "fim de semana" };
  if (HOLIDAYS[date])
    return { open: false, closeMin: CLOSE, reason: `feriado nos EUA (${HOLIDAYS[date]})` };
  const early = EARLY_CLOSE.has(date);
  return {
    open: true,
    closeMin: early ? 13 * 60 : CLOSE,
    reason: early ? "pregão encurtado (fecha às 13:00 em Nova York)" : null,
  };
}
```

### 17.2 `assets/state.js`

```js
// Estado único do app Mercado + preferências persistidas.
export const TABS = [
  ["dash", "Visão geral"],
  ["macro", "Macro"],
  ["news", "Notícias"],
  ["calendar", "Agenda"],
  ["flow", "Fluxo"],
];

export const TAB_INFO = {
  dash: "Cotações de bolsas, juros, moedas, commodities e cripto, com o regime de risco do dia.",
  macro:
    "Economia dos EUA e do mundo hoje: crescimento, inflação, juros, crédito e geopolítica, o regime e os setores que a história favorece; agenda com projeção × resultado.",
  news: "Manchetes classificadas por assunto, das fontes de mercado, atualizadas a cada 2 minutos.",
  calendar: "Indicadores econômicos da semana, com projeção, valor divulgado e histórico.",
  flow: "Para onde o dinheiro está indo: grupos que ganham e perdem força hoje (inferido por preço e volume).",
};

export const store = {
  get(k, d) {
    try {
      const v = localStorage.getItem(k);
      return v === null ? d : JSON.parse(v);
    } catch {
      return d;
    }
  },
  set(k, v) {
    try {
      localStorage.setItem(k, JSON.stringify(v));
    } catch {
      /* sem armazenamento: a página funciona igual */
    }
  },
};

const PREFS_KEY = "mercado.prefs";
const prefsDefault = {
  tab: "dash", dashH: "1d", mktMode: "auto",
  newsF: "top", newsTags: null, newsOpen: {},
  calMin: "medium", calCc2: "USD,EUR,GBP,JPY,CNY", calHistCc: "all", calHistKind: "all",
  flowHorizon: "1d", flowGroup: "all", flowSize: "liq", flowStrong: false, rotGroup: "regions",
}; // prettier-ignore

export const state = {
  prefs: { ...prefsDefault, ...store.get(PREFS_KEY, {}) },
  flowBase: null, baseAt: 0, liveRaw: null, live: null, liveError: null, flow: null,
  mode: "on", late: [], back: 0, playing: null, fctx: null,
  news: null, newsAt: 0, newsLoading: false,
  cal: null, calAt: 0, calLoading: false,
  yields: null, yieldsAt: 0,
  charts: [], nextAt: null, loading: false, lastProblems: "", error: null,
}; // prettier-ignore

if (!TABS.some(([id]) => id === state.prefs.tab)) state.prefs.tab = "dash";

export const savePrefs = () => store.set(PREFS_KEY, state.prefs);

/** render: redesenho pedido por dados de fundo (agrupado); renderNow: imediato. */
export const hooks = { render: () => {}, renderNow: () => {} };
```

### 17.3 `assets/widgets.js`

```js
// Aviso curto na tela. Com `onClick`, tocar no aviso executa a ação.
export function toast(msg, tone = "ok", ms = 9000, onClick = null) {
  const box = document.getElementById("toasts");
  if (!box) return;
  const el = document.createElement("div");
  el.className = `toast ${tone}${onClick ? " link" : ""}`;
  el.textContent = msg;
  el.addEventListener("click", () => {
    el.remove();
    onClick?.();
  });
  box.prepend(el);
  const small = matchMedia("(max-width: 860px)").matches;
  while (box.children.length > (small ? 1 : 4)) box.lastChild.remove(); // celular: um aviso por vez
  setTimeout(() => el.remove(), small ? Math.min(ms, 6000) : ms);
}
```

### 17.4 `assets/feeds.js`

```js
// Notícias, agenda e juros soberanos: carga com ritmo próprio de cada feed.
import { matchNews, mergeItems, tagNews } from "./news.js";
import { hooks, state } from "./state.js";
import { fetchJSON } from "./net.js";

/** Agenda econômica (a cada 30 min; em erro, tenta de novo em ~5 min). */
export async function loadCalendar(force = false) {
  if (state.calLoading || (!force && Date.now() - state.calAt < 30 * 60000)) return;
  state.calLoading = true;
  state.calAt = Date.now();
  try {
    state.cal = await fetchJSON("api/calendar");
  } catch (e) {
    state.cal ??= { events: [], corporate: [], released: [], errors: [e.message] };
    state.calAt = Date.now() - 25 * 60000;
  }
  state.calLoading = false;
  if (state.prefs.tab === "calendar") hooks.render();
}

/** Manchetes: função (fontes que aceitam a Vercel) + arquivo do cron (FT, Economist e reservas). */
export async function loadNews() {
  const gap = state.prefs.tab === "news" ? 2 * 60000 : 4 * 60000;
  if (state.newsLoading || Date.now() - state.newsAt < gap) return;
  state.newsLoading = true;
  state.newsAt = Date.now();
  const [api, cron] = await Promise.allSettled([
    fetchJSON("api/news"),
    fetchJSON("data/news.json"),
  ]);
  const a = api.status === "fulfilled" ? api.value : null;
  const c = cron.status === "fulfilled" ? cron.value : null;
  const fresh = tagNews(matchNews(mergeItems([a?.items ?? [], c?.items ?? []]), []));
  const items = accumulate(state.news?.items, fresh, Date.now() / 1000, !state.news);
  state.news = {
    items,
    fetched_at: a?.fetched_at ?? c?.updated_at ?? null,
    sources: [...new Set([...(a?.sources ?? []), ...(c?.items ?? []).map((x) => x.source)])],
    error: !a && !c ? (api.reason?.message ?? "indisponível") : null,
  };
  state.newsLoading = false;
  if (["news", "dash"].includes(state.prefs.tab)) renderKeepingScroll();
}

/** Re-renderiza sem perder a rolagem das listas (o feed chega com o usuário lendo). */
function renderKeepingScroll() {
  const y = window.scrollY;
  hooks.renderNow();
  window.scrollTo(0, y);
}

/**
 * Feed contínuo: junta as manchetes novas às já vistas, marca a hora em que cada uma apareceu (seen)
 * e descarta as de mais de 36 h. Na primeira carga nada é marcado como novo.
 */
export function accumulate(prev, fresh, now, first = false) {
  const old = new Map((prev ?? []).map((x) => [x.id, x]));
  const out = fresh.map((x) => ({ ...x, seen: old.get(x.id)?.seen ?? (first ? 0 : now) }));
  const ids = new Set(out.map((x) => x.id));
  for (const x of prev ?? []) if (!ids.has(x.id)) out.push(x);
  return out
    .filter((x) => !x.t || now - x.t < 36 * 3600)
    .sort((a, b) => (b.t ?? 0) - (a.t ?? 0))
    .slice(0, 600);
}

/** Juros soberanos de fontes oficiais: no máximo a cada 30 min. */
export async function loadYields() {
  if (Date.now() - state.yieldsAt < 30 * 60000) return;
  state.yieldsAt = Date.now();
  try {
    state.yields = await fetchJSON("api/yields");
  } catch (e) {
    state.yields = { rows: state.yields?.rows ?? [], error: e.message };
  }
  if (state.prefs.tab === "dash") hooks.render();
}
```

### 17.5 `assets/app.js` (orquestração + eventos)

```js
// App Mercado: carga, recálculo On/Off, desenho da aba ativa e eventos. Os cálculos ficam nos motores.
import { FLOW_ASSETS, FLOW_BY_SYM } from "./flow-universe.js";
import { applyLiveToFlow, lateQuotes } from "./live.js";
import { effectiveMode, offQuotes } from "./offmarket.js";
import { STEPS, nextAuto, usSession } from "./refresh.js";
import { sessionFraction } from "./flow-engine.js";
import { fetchJSON } from "./net.js";
import { ago, esc, fmtDT, fmtTime } from "./format.js";
import { TABS, TAB_INFO, hooks, savePrefs, state } from "./state.js";
import { toast } from "./widgets.js";
import { DASH_H, OUT, BADGED, viewDash } from "./dash.js";
import { viewMacro } from "./macro-view.js";
import { viewNews, openNewsPop, toggleTag } from "./news-view.js";
import { viewCalendar } from "./calendar-view.js";
import {
  REPLAY_DAYS,
  drawFlowDynamic,
  drawRotation,
  flowTooltip,
  openFlowAsset,
  viewFlow,
} from "./flow-view.js";
import { assetNewsPopHtml, newsByAsset, outliersPopHtml } from "./asset-news.js";
import { loadCalendar, loadNews, loadYields } from "./feeds.js";
import {
  closeDrawer,
  destroyCharts,
  drawerChart,
  mkChart,
  openDrawer,
  refreshCharts,
} from "./charts.js";
import { redrawAssetPanel } from "./asset-pop.js";
import { flashTicks } from "./flash.js";
import { initMarquee } from "./marquee.js";
import { applyUi, loadUi } from "./theme.js";

const ALL_SYMBOLS = FLOW_ASSETS.map((a) => a.sym);
applyUi(loadUi());

// ───────── contextos das telas ─────────
const DAY = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" });
const today = () => DAY.format(new Date());
const newsHitsToday = () =>
  (state.news?.items ?? []).filter((x) => x.impact && x.t && DAY.format(new Date(x.t * 1000)) === today()).length; // prettier-ignore

const dashCtx = () => ({
  flow: state.flow,
  quotes: state.live?.quotes,
  newsHits: newsHitsToday(),
  assetNews: newsByAsset(state.news?.items),
  horizon: state.prefs.dashH,
  yields: state.yields,
  mode: state.mode,
  session: usSession(),
});

const flowCtx = () => ({
  flow: state.flow,
  prefs: state.prefs,
  back: state.back,
  playing: !!state.playing,
  live: !!state.live,
  session: usSession(),
  sessionFrac: state.live?.market_state === "REGULAR" ? sessionFraction() : 1,
  late: new Set(state.late.map((l) => l.sym)),
  lateMap: Object.fromEntries(state.late.map((l) => [l.sym, l.lagMin])),
  mkChart,
  openDrawer,
  drawerChart,
});

const VIEWS = {
  dash: () => viewDash(dashCtx()),
  macro: () => viewMacro(),
  news: () =>
    viewNews({
      news: state.news,
      filter: state.prefs.newsF,
      tags: state.prefs.newsTags ?? undefined,
      hasPortfolio: false,
      open: state.prefs.newsOpen ?? {},
    }),
  calendar: () =>
    viewCalendar({
      cal: state.cal,
      min: state.prefs.calMin,
      ccs: state.prefs.calCc2,
      histCc: state.prefs.calHistCc,
      histKind: state.prefs.calHistKind,
    }),
  flow: () =>
    state.flow
      ? viewFlow(flowCtx())
      : `<div class="card empty">Dados do mapa de fluxo indisponíveis.</div>`,
};

// ───────── frescor e switch On/Off ─────────
function freshness() {
  const q = state.live?.quotes?.SPY;
  if (!q?.t)
    return state.flowBase
      ? { level: "warn", label: "Arquivo publicado", at: null }
      : { level: "bad", label: "Sem dados", at: null };
  const at = new Date(q.t * 1000);
  const age = Math.max(0, Math.round((Date.now() - at) / 60000));
  if (q.ms === "REGULAR") {
    if (age > 30) return { level: "bad", label: `Atrasado ${age} min`, at };
    if (age > 10) return { level: "warn", label: `Cotação de ${age} min`, at };
    return { level: "ok", label: "Ao vivo", at };
  }
  return { level: "ok", label: "Fechamento", at };
}

function renderFreshness() {
  const f = freshness();
  const src = state.live
    ? `ao vivo · ${state.live.count}/${state.live.total} cotações`
    : `arquivo publicado${state.liveError ? " (ao vivo indisponível)" : ""}`;
  document.getElementById("freshness").innerHTML =
    `<span class="pill ${f.level}">${esc(f.label)}</span>${f.at ? `<span>Cotação de <b>${fmtDT(f.at)}</b> (Brasília) · ${ago(f.at)}</span>` : ""}<span class="muted">${esc(src)}</span>${state.mode === "off" ? `<span class="pill warn" title="Preços de pré/pós-mercado e futuros como proxy">Off market</span>` : ""}<span id="countdown" class="muted"></span>`; // prettier-ignore
}

function renderModeSwitch() {
  const el = document.getElementById("mktSwitch");
  if (!el) return;
  const pref = state.prefs.mktMode ?? "auto";
  const sess = { open: "pregão aberto", pre: "pré-mercado", post: "pós-mercado", closed: "mercado fechado" }[usSession()]; // prettier-ignore
  el.innerHTML = `<button data-mkt="on" aria-pressed="${state.mode === "on"}" title="On market: preços do pregão regular">On</button><button data-mkt="off" aria-pressed="${state.mode === "off"}" title="Off market: pré/pós-mercado e futuros como proxy">Off</button><span class="mkt-auto" title="${pref === "auto" ? `Automático (${sess})` : "Escolha manual: toque no outro modo para voltar ao automático"}">${pref === "auto" ? "auto" : "manual"}</span>`; // prettier-ignore
  el.classList.toggle("is-off", state.mode === "off");
}

// ───────── desenho ─────────
const subNavHtml = (cur) =>
  `<div class="subnav"><nav class="subtabs" role="tablist" aria-label="Mercado">${TABS.map(
    ([id, label]) =>
      `<button class="subtab" role="tab" data-tab="${id}" aria-selected="${id === cur}">${esc(label)}</button>`,
  ).join("")}</nav><p class="subnav-q">${esc(TAB_INFO[cur] ?? "")}</p></div>`;

/** Seletor estável de um elemento (id ou 1º data-*), para achá-lo de novo depois do redesenho. */
function keyOf(el) {
  if (el.id) return `#${CSS.escape(el.id)}`;
  const a = [...el.attributes].find((x) => x.name.startsWith("data-"));
  return a ? `${el.tagName.toLowerCase()}[${a.name}="${CSS.escape(a.value)}"]` : null;
}
/** Guarda campo em edição e <details> abertos; devolve quem restaura. */
function keepUi(view) {
  const el = document.activeElement;
  const typing = el && view.contains(el) && /^(INPUT|TEXTAREA)$/.test(el.tagName) && !/^(checkbox|radio|button|submit|range)$/.test(el.type); // prettier-ignore
  const focus = typing ? { key: keyOf(el), v: el.value, a: el.selectionStart, b: el.selectionEnd } : null; // prettier-ignore
  const open = [...view.querySelectorAll("details[open]")].map(keyOf).filter(Boolean);
  return () => {
    for (const k of open) view.querySelector(k)?.setAttribute("open", "");
    const f = focus?.key && view.querySelector(focus.key);
    if (!f) return;
    if (f.value !== focus.v) f.value = focus.v;
    f.focus({ preventScroll: true });
    try {
      f.setSelectionRange(focus.a, focus.b);
    } catch {
      /* campo sem cursor */
    }
  };
}

let lastTab = null;
let rPending = false;
let lastRender = 0;
const RENDER_GAP = 350;
const USER_EVENTS = new Set(["click", "input", "change", "keydown", "submit", "pointerup", "touchend"]); // prettier-ignore

function render() {
  rPending = false;
  lastRender = performance.now();
  const view = document.getElementById("view");
  destroyCharts();
  renderFreshness();
  renderModeSwitch();
  const tab = state.prefs.tab;
  const enter = tab !== lastTab;
  if (enter && lastTab && !document.getElementById("drawer").hidden) closeDrawer();
  lastTab = tab;
  const restore = enter ? null : keepUi(view);
  view.innerHTML = subNavHtml(tab) + VIEWS[tab]();
  restore?.();
  document.title = `${TABS.find(([id]) => id === tab)[1]} · Mercado`;
  if (tab === "flow" && state.flow) {
    state.fctx = flowCtx();
    drawFlowDynamic(state.fctx);
    drawRotation(state.fctx);
  }
  if (enter) window.scrollTo({ top: 0, behavior: "instant" });
  flashTicks(view);
  tick();
}

/** Redesenho de fundo agrupado (1 a cada 350 ms); dentro de um toque do usuário, na hora. */
function scheduleRender() {
  const ev = globalThis.event;
  if (ev?.isTrusted && USER_EVENTS.has(ev.type)) return render();
  if (rPending) return;
  rPending = true;
  const wait = Math.max(16, RENDER_GAP - (performance.now() - lastRender));
  setTimeout(() => {
    if (!rPending) return;
    rPending = false;
    if (!document.hidden) render();
  }, wait);
}
hooks.render = scheduleRender;
hooks.renderNow = render;

// ───────── carga ─────────
function rebuild() {
  state.mode = effectiveMode(state.prefs.mktMode ?? "auto", usSession());
  state.live = state.liveRaw
    ? state.mode === "off"
      ? { ...state.liveRaw, quotes: offQuotes(state.liveRaw.quotes), mode: "off" }
      : { ...state.liveRaw, mode: "on" }
    : null;
  const lf = state.flowBase && state.live ? applyLiveToFlow(state.flowBase, state.live) : null;
  state.flow = lf ? lf.table : state.flowBase;
  state.late = state.live ? lateQuotes(state.live, ALL_SYMBOLS) : [];
}

async function load({ notify = false } = {}) {
  if (state.loading) return;
  state.loading = true;
  const problems = [];
  const fresh = state.flowBase && !notify && Date.now() - state.baseAt < 10 * 60000;
  const [flowR, liveR] = await Promise.allSettled([
    fresh ? Promise.resolve(state.flowBase) : fetchJSON("data/flow.json"),
    fetchJSON("api/quotes"),
  ]);
  if (flowR.status === "fulfilled") {
    if (!fresh) state.baseAt = Date.now();
    state.flowBase = flowR.value;
  } else problems.push(`histórico: ${flowR.reason.message}`);
  if (liveR.status === "fulfilled" && liveR.value?.count > 0) {
    state.liveRaw = liveR.value;
    state.liveError = null;
    if (liveR.value.errors?.length) problems.push(`cotações parciais: ${liveR.value.errors[0]}`);
  } else {
    state.liveRaw = null;
    state.liveError =
      liveR.status === "rejected" ? liveR.reason.message : "nenhuma cotação recebida";
    problems.push(`cotação ao vivo: ${state.liveError}`);
  }
  rebuild();
  state.loading = false;
  state.nextAt = nextAuto(Date.now(), STEPS.degraded);
  render();
  if (notify)
    toast(
      problems.length
        ? `Atualizado às ${fmtTime(new Date())}, com problema: ${problems.join(" · ")}`
        : `Atualizado às ${fmtTime(new Date())} · ${state.live.count}/${state.live.total} cotações.`,
      problems.length ? "warn" : "ok",
    );
  else if (problems.length && problems.join() !== state.lastProblems)
    toast(`Problema na atualização automática: ${problems.join(" · ")}`, state.live ? "warn" : "bad"); // prettier-ignore
  state.lastProblems = problems.join();
  loadYields();
  loadNews();
  loadCalendar();
}

// ───────── relógio (contagem, próxima busca) ─────────
const PAUSE_FMT = new Intl.DateTimeFormat("pt-BR", { timeZone: "America/Sao_Paulo", weekday: "short", hour: "2-digit", minute: "2-digit" }); // prettier-ignore
function tick() {
  const cd = document.getElementById("countdown");
  if (cd) {
    if (state.loading) cd.textContent = "· atualizando…";
    else if (state.nextAt) {
      const s = Math.max(0, Math.round((state.nextAt - Date.now()) / 1000));
      cd.textContent =
        s > 3600
          ? `· mercado fechado: próxima ${PAUSE_FMT.format(new Date(state.nextAt))}`
          : `· próxima em ${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
    }
  }
  if (state.prefs.tab === "news" && !document.hidden) loadNews();
  if (state.nextAt && Date.now() >= state.nextAt && !state.loading && !document.hidden) load();
}

// ───────── replay do Fluxo ─────────
function setBack(v) {
  state.back = Math.max(0, Math.min(REPLAY_DAYS - 1, v));
  if (state.prefs.tab !== "flow" || !state.fctx) return;
  state.fctx.back = state.back;
  drawFlowDynamic(state.fctx);
  const r = document.getElementById("flowBack");
  if (r) r.value = String(REPLAY_DAYS - 1 - state.back);
}
function toggleReplay() {
  if (state.playing) {
    clearInterval(state.playing);
    state.playing = null;
  } else {
    if (state.back === 0) setBack(REPLAY_DAYS - 1);
    state.playing = setInterval(() => {
      if (state.back <= 0) return toggleReplay();
      setBack(state.back - 1);
    }, 700);
  }
  const b = document.querySelector("[data-action=replay]");
  if (b) b.textContent = state.playing ? "⏸ Pausar" : "▶ Replay";
}

// ───────── eventos ─────────
const closePop = () => document.querySelector(".npop-back")?.remove();
const setPref = (k, v) => {
  state.prefs[k] = v;
  savePrefs();
  render();
};
const goTab = (tab) => {
  if (state.playing) toggleReplay();
  setPref("tab", tab);
};

// popups "!" do Painel (captura: não deixa o clique abrir o gráfico da linha)
document.addEventListener(
  "click",
  (e) => {
    const o = e.target.closest("[data-outlier],[data-outlier-list]");
    if (o) {
      e.stopPropagation();
      e.preventDefault();
      closePop();
      document.body.insertAdjacentHTML(
        "beforeend",
        outliersPopHtml(OUT, o.dataset.outlier ?? null),
      );
      return document.querySelector(".npop-x")?.focus();
    }
    const b = e.target.closest("[data-asset-news]");
    if (!b) return;
    e.stopPropagation();
    e.preventDefault();
    const sym = b.dataset.assetNews;
    const items = newsByAsset(state.news?.items)[sym] ?? [];
    if (!items.length) return;
    const m = BADGED[sym] ?? {};
    const chgText = !Number.isFinite(m.c)
      ? ""
      : m.kind === "yld"
        ? `${m.c > 0 ? "+" : "−"}${Math.abs(m.c).toFixed(0)} bps`
        : `${m.c > 0 ? "+" : "−"}${(Math.abs(m.c) * 100).toFixed(2).replace(".", ",")}%`;
    const label = b.closest("tr")?.querySelector(".nm")?.textContent?.trim() || sym;
    closePop();
    document.body.insertAdjacentHTML("beforeend", assetNewsPopHtml({ label, chgText, up: m.c > 0, items })); // prettier-ignore
    document.querySelector(".npop-x")?.focus();
  },
  true,
);

document.addEventListener("click", (e) => {
  // popups
  if (e.target.closest(".out-tbl tr[data-sym]")) closePop();
  const pop = e.target.closest("[data-news-pop]");
  if (pop) {
    const it = (state.news?.items ?? []).find((x) => x.link === pop.dataset.newsPop);
    if (it) openNewsPop(it);
    return;
  }
  if (e.target.matches("[data-npop-close]")) return closePop();
  // On/Off
  const mk = e.target.closest("[data-mkt]");
  if (mk) {
    const autoMode = effectiveMode("auto", usSession());
    state.prefs.mktMode = mk.dataset.mkt === autoMode ? "auto" : mk.dataset.mkt;
    savePrefs();
    rebuild();
    render();
    return toast(
      state.mode === "off"
        ? "Off market: preços de pré/pós-mercado e futuros (proxy) em todo o app."
        : "On market: preços do pregão regular.",
      "ok",
      4000,
    );
  }
  const t = e.target.closest(
    "[data-tab],[data-dash-h],[data-news-f],[data-news-tag],[data-setpref],[data-fh],[data-fsize],[data-group],[data-action],[data-sym]",
  );
  if (!t) return;
  const d = t.dataset;
  if (d.tab) goTab(d.tab);
  else if (d.dashH && DASH_H[d.dashH]) setPref("dashH", d.dashH);
  else if (d.newsF) setPref("newsF", d.newsF);
  else if (d.newsTag) setPref("newsTags", toggleTag(state.prefs.newsTags ?? undefined, d.newsTag));
  else if (d.setpref) setPref(d.setpref, d.val);
  else if (d.fh || d.fsize || d.group) {
    if (d.fh) state.prefs.flowHorizon = d.fh;
    if (d.fsize) state.prefs.flowSize = d.fsize;
    if (d.group) state.prefs.flowGroup = state.prefs.flowGroup === d.group ? "all" : d.group;
    state.prefs.tab = "flow";
    savePrefs();
    render();
  } else if (d.action === "flow-strong") setPref("flowStrong", !state.prefs.flowStrong);
  else if (d.action === "replay") toggleReplay();
  else if (d.action === "reload") load({ notify: true });
  else if (d.action === "close") closeDrawer();
  else if (d.sym && FLOW_BY_SYM[d.sym] && state.flow) openFlowAsset(flowCtx(), d.sym);
});

document.addEventListener("change", (e) => {
  const key = e.target.dataset?.pref;
  if (key) setPref(key, e.target.type === "checkbox" ? e.target.checked : e.target.value);
});

document.addEventListener("input", (e) => {
  if (e.target.id !== "flowBack") return;
  if (state.playing) toggleReplay();
  setBack(REPLAY_DAYS - 1 - Number(e.target.value));
});

// Notícias: lembra seções abertas/recolhidas ("toggle" não borbulha: captura)
document.addEventListener(
  "toggle",
  (e) => {
    const sec = e.target.dataset?.newsSec;
    if (!sec) return;
    state.prefs.newsOpen = { ...(state.prefs.newsOpen ?? {}), [sec]: e.target.open };
    savePrefs();
  },
  true,
);

document.addEventListener("keydown", (e) => {
  if (e.key === "Escape") {
    closePop();
    return closeDrawer();
  }
  if ((e.key === "Enter" || e.key === " ") && e.target.matches("[data-sym],[data-tab]") && e.target.tagName !== "BUTTON") {
    e.preventDefault();
    return e.target.click();
  } // prettier-ignore
  if (/^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName) || e.ctrlKey || e.metaKey || e.altKey) return; // prettier-ignore
  const n = Number(e.key);
  if (n >= 1 && n <= TABS.length) goTab(TABS[n - 1][0]);
  else if (e.key.toLowerCase() === "r") load({ notify: true });
});

document.addEventListener("mousemove", (e) => {
  if (state.prefs.tab === "flow" && state.fctx) flowTooltip(state.fctx, e);
});
let resizeTimer = null;
window.addEventListener("resize", () => {
  clearTimeout(resizeTimer);
  resizeTimer = setTimeout(() => state.prefs.tab === "flow" && state.fctx && drawFlowDynamic(state.fctx), 200); // prettier-ignore
});

// o sistema pode apagar os canvas com o app suspenso (iPhone): redesenha ao voltar
function redrawAll() {
  if (state.flowBase && !state.loading) render();
  refreshCharts();
  redrawAssetPanel();
}
document.addEventListener("visibilitychange", () => {
  if (document.hidden) return;
  if (state.nextAt && Date.now() >= state.nextAt && !state.loading) load();
  else redrawAll();
});
window.addEventListener("pageshow", (e) => e.persisted && redrawAll());
for (const ev of ["gesturestart", "gesturechange"])
  document.addEventListener(ev, (e) => e.preventDefault(), { passive: false });

// ───────── boot ─────────
const q = new URLSearchParams(location.search).get("tab");
if (q && TABS.some(([id]) => id === q)) {
  state.prefs.tab = q;
  savePrefs();
  history.replaceState(null, "", location.pathname);
}
initMarquee();
setInterval(tick, 1000);
load();
```

Notas sobre este arquivo:

- `DASH_H`, `OUT` e `BADGED` já são exportados por `dash.js`; `toggleTag` e `openNewsPop` por `news-view.js`;
  `flowTooltip` por `flow-view.js`. Confira com `grep -n "^export" assets/*.js` se o lint acusar import inexistente.
- O botão "Recarregar" (`data-action="reload"`) e o fechar do drawer (`data-action="close"`) estão no `index.html`.

### 17.6 `api/_nasdaq.js`

```js
// Nasdaq (fonte independente, gratuita, sem chave): último preço e fechamento anterior de ações/ETFs dos EUA.
// Usada como 3ª camada de /api/quotes. Extraído de api/verify.js do Pêndulo.
import { httpFetch } from "./_http.js";

const TIMEOUT_MS = 7000;

/** "$1,234.56" -> 1234.56 ; "+4.31" -> 4.31 ; "" -> null */
export function money(s) {
  const n = Number(String(s ?? "").replace(/[$,+\s]/g, ""));
  return String(s ?? "").trim() && Number.isFinite(n) ? n : null;
}

/** Último preço do pregão regular e fechamento anterior (fora do pregão, o oficial está em secondaryData). */
export function parseNasdaq(data) {
  if (!data?.primaryData) return null;
  const open = /market open/i.test(data.marketStatus ?? "");
  const closed = /closed at/i.test(data.secondaryData?.lastTradeTimestamp ?? "");
  const src = !open && closed ? data.secondaryData : data.primaryData;
  const price = money(src.lastSalePrice);
  const chg = money(src.netChange);
  if (!(price > 0)) return null;
  return {
    price,
    prevClose: chg != null ? Math.round((price - chg) * 10000) / 10000 : null,
    status: data.marketStatus ?? null,
    open,
  };
}

export async function nasdaq(sym, deadline = null) {
  for (const cls of ["etf", "stocks"]) {
    const q = await httpFetch(
      `https://api.nasdaq.com/api/quote/${encodeURIComponent(sym)}/info?assetclass=${cls}`,
      { timeout: TIMEOUT_MS, deadline, headers: { Accept: "application/json" } },
      async (r) => (r.ok ? parseNasdaq((await r.json())?.data) : null),
    );
    if (q) return q;
  }
  return null;
}
```

### 17.7 `index.html`

```html
<!doctype html>
<html lang="pt-BR" data-theme="midnight" data-mode="dark">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
    <meta name="theme-color" content="#070a12" />
    <title>Mercado</title>
    <link rel="icon" href="icons/icon.svg" type="image/svg+xml" />
    <link rel="stylesheet" href="assets/themes.css" />
    <link rel="stylesheet" href="assets/mercado.css" />
  </head>
  <body>
    <header class="topbar">
      <h1 id="pageTitle">Mercado</h1>
      <div id="freshness" class="fresh" role="status" aria-live="polite"></div>
      <div id="mktSwitch" class="mkt-sw" role="group" aria-label="Modo de mercado"></div>
      <button class="btn" data-action="reload"><span class="lb">Recarregar</span></button>
    </header>
    <div id="toasts" class="toasts" role="status" aria-live="polite"></div>
    <main id="view" tabindex="-1"></main>
    <aside id="drawer" class="drawer" hidden aria-modal="true" role="dialog">
      <div class="drawer-bg" data-action="close"></div>
      <div class="drawer-box">
        <button class="x" data-action="close" aria-label="Fechar">×</button>
        <div id="drawerBody"></div>
      </div>
    </aside>
    <p class="note" style="text-align: center">
      Material educacional; não é recomendação de investimento.
    </p>
    <script src="vendor/chart.umd.min.js"></script>
    <script type="module" src="assets/app.js"></script>
  </body>
</html>
```

O `.topbar` não existe no CSS extraído: estilize no `assets/mercado.css` no fim do arquivo (ou acrescente o seletor do
cabeçalho original à lista do extrator).

### 17.8 `scripts/update_flow.py`

```python
"""Gera data/flow.json (Mercado: Visão geral e Fluxo) a partir do Yahoo Finance.

Uso:   python scripts/update_flow.py
Requer: pip install -r scripts/requirements.txt

Se algo crítico falhar, o arquivo anterior é mantido (sai com código 1).
"""
import json
import re
import sys
import time
from pathlib import Path

import pandas as pd
import yfinance as yf

ROOT = Path(__file__).resolve().parent.parent
FLOW_OUT = ROOT / "data" / "flow.json"
FLOW_ROWS = 300  # fechamentos: 1 ano + folga para médias de 50 dias e janela de 60 pregões
FLOW_VOL_ROWS = 60  # volume: média de 20 dias e replay
MIN_SERIES = 200  # menos que isso = falha do Yahoo; não publica


def load_flow_symbols() -> list:
    """Símbolos do universo, lidos de assets/flow-universe.js (fonte única da verdade)."""
    src = (ROOT / "assets" / "flow-universe.js").read_text(encoding="utf-8")
    block = src.split("const RAW = [", 1)[1].split("];", 1)[0]
    return re.findall(r'^\s*\["([^"]+)",', block, flags=re.M)


def fix_fx_dates(close: pd.DataFrame) -> None:
    """Câmbio à vista (=X): a barra diária datada D traz o fechamento de D-1 (carimbo 00:00 de Londres).
    Recua cada valor para a data anterior da própria série; o último pregão vem da cotação ao vivo."""
    for s in [c for c in close.columns if str(c).endswith("=X")]:
        col = close[s].dropna()
        if len(col) > 1:
            close[s] = pd.Series(col.to_numpy()[1:], index=col.index[:-1]).reindex(close.index)


def with_retry(fn, tries=3, wait=5):
    """O Yahoo falha de vez em quando (429, timeout): tenta de novo antes de desistir."""
    for i in range(tries):
        try:
            return fn()
        except Exception as e:  # noqa: BLE001
            if i == tries - 1:
                raise
            print(f"Tentativa {i + 1} falhou ({e}); nova em {wait * (i + 1)}s", file=sys.stderr)
            time.sleep(wait * (i + 1))


def main() -> int:
    symbols = load_flow_symbols()
    if "SPY" not in symbols:
        print("SPY fora do universo: abortando", file=sys.stderr)
        return 1
    data = with_retry(
        lambda: yf.download(symbols, period="2y", progress=False, auto_adjust=True, group_by="column")
    )
    raw = data["Close"].copy()
    fix_fx_dates(raw)
    if "SPY" not in raw.columns or raw["SPY"].dropna().empty:
        print("SPY ausente: abortando (mantendo arquivo anterior)", file=sys.stderr)
        return 1
    cal = raw["SPY"].dropna().index  # calendário do SPY: só pregões dos EUA

    syms = [s for s in symbols if s in raw.columns and raw[s].notna().any()]
    close = pd.DataFrame({s: raw[s].dropna() for s in syms})
    close = close.reindex(close.index.union(cal)).ffill().loc[cal].tail(FLOW_ROWS)
    close = close.dropna(axis=1, how="any")
    if len(close.columns) < MIN_SERIES or len(close) < 250:
        print(f"Poucos dados ({len(close.columns)} séries, {len(close)} pregões): abortando", file=sys.stderr)
        return 1
    vol = data["Volume"].reindex(cal).loc[close.index].tail(FLOW_VOL_ROWS).fillna(0)
    out = {
        "dates": [d.strftime("%Y-%m-%d") for d in close.index],
        "close": {s: [round(float(v), 6 if v < 1 else 4) for v in close[s]] for s in close.columns},
        "vol": {s: [int(v) for v in vol[s]] for s in close.columns if s in vol.columns and vol[s].sum() > 0},
        "last_real": {s: raw[s].dropna().index.max().date().isoformat() for s in close.columns},
    }
    missing = sorted(set(symbols) - set(close.columns))
    if missing:
        print(f"Aviso: sem histórico para {missing}", file=sys.stderr)
    FLOW_OUT.parent.mkdir(exist_ok=True)
    FLOW_OUT.write_text(json.dumps(out, separators=(",", ":")), encoding="utf-8")
    print(f"OK fluxo: {len(close.columns)} ativos, {len(close)} pregões até {out['dates'][-1]}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
```

### 17.9 `scripts/verify-flow.mjs`

```js
// Valida data/flow.json antes de publicar (erro = o workflow falha e nada é commitado).
import { readFileSync } from "node:fs";

const f = JSON.parse(readFileSync(new URL("../data/flow.json", import.meta.url), "utf8"));
const n = f.dates?.length ?? 0;
const errs = [];
if (n < 250) errs.push(`poucos pregões: ${n}`);
if (!f.dates?.every((d, i) => /^\d{4}-\d{2}-\d{2}$/.test(d) && (!i || d > f.dates[i - 1])))
  errs.push("datas inválidas ou fora de ordem");
const series = Object.entries(f.close ?? {});
if (series.length < 200) errs.push(`poucas séries: ${series.length}`);
if (!f.close?.SPY) errs.push("sem SPY");
for (const [s, v] of series)
  if (v.length !== n || !v.every((x) => Number.isFinite(x) && x > 0))
    errs.push(`série inválida: ${s}`);
for (const [s, v] of Object.entries(f.vol ?? {}))
  if (v.length !== Math.min(60, n) || !v.every((x) => Number.isInteger(x) && x >= 0))
    errs.push(`volume inválido: ${s}`);
for (const s of Object.keys(f.close ?? {}))
  if (!/^\d{4}-\d{2}-\d{2}$/.test(f.last_real?.[s] ?? "")) errs.push(`sem last_real: ${s}`);
if (errs.length) {
  console.error(`flow.json REPROVADO:\n${errs.slice(0, 30).join("\n")}`);
  process.exit(1);
}
console.log(`flow.json OK: ${series.length} séries, ${n} pregões até ${f.dates.at(-1)}`);
```

### 17.10 `.github/workflows/update-flow.yml`

```yaml
name: Atualizar fluxo e notícias

# Histórico do Painel/Fluxo (data/flow.json) e manchetes de reserva (data/news.json).
# O preço ao vivo NÃO depende disto (vem de /api/quotes). A cada 30 min no pregão: ~20 deploys/dia (limite Hobby: 100).
on:
  schedule:
    - cron: "*/30 13-21 * * 1-5"
    - cron: "20 22 * * 1-5"
  workflow_dispatch:

permissions:
  contents: write

concurrency:
  group: update-flow
  cancel-in-progress: false

jobs:
  update:
    runs-on: ubuntu-latest
    timeout-minutes: 10
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-python@v5
        with:
          python-version: "3.12"
          cache: pip
          cache-dependency-path: scripts/requirements.txt
      - run: pip install -r scripts/requirements.txt
      - name: Gerar data/flow.json
        run: python scripts/update_flow.py
      - uses: actions/setup-node@v4
        with:
          node-version: "22"
      - name: Manchetes FT, Economist e reservas (data/news.json)
        run: 'node scripts/update-news.mjs || echo "noticias indisponiveis - segue sem elas"'
      - name: Validar antes de publicar
        run: node scripts/verify-flow.mjs
      - name: Commitar se mudou
        run: |
          if git diff --quiet -- data/ && [ -z "$(git ls-files --others --exclude-standard data/)" ]; then
            echo "Nada novo."
            exit 0
          fi
          git config user.name "mercado-bot"
          git config user.email "mercado-bot@users.noreply.github.com"
          git add data/flow.json data/news.json
          git commit -m "chore(dados): fluxo e notícias [skip ci]"
          git pull --rebase origin "${GITHUB_REF_NAME}"
          git push origin "HEAD:${GITHUB_REF_NAME}"
```

`update-macro.yml`: cópia literal do original (troque só `pendulo-bot` pelo nome do bot, se quiser).

Em Settings → Actions → General do repositório novo: "Workflow permissions" = **Read and write**.

### 17.11 `.github/workflows/ci.yml`

```yaml
name: CI
on:
  pull_request:
  push:
    branches: [main]
jobs:
  check:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: "22"
          cache: npm
      - run: npm ci
      - run: npm run lint
      - run: npm run format:check
      - run: npm test
      - run: node scripts/verify-flow.mjs
```

### 17.12 `vercel.json`

```json
{
  "$schema": "https://openapi.vercel.sh/vercel.json",
  "framework": null,
  "buildCommand": null,
  "outputDirectory": ".",
  "headers": [
    { "source": "/data/(.*)", "headers": [{ "key": "Cache-Control", "value": "no-cache" }] },
    {
      "source": "/assets/(.*)",
      "headers": [{ "key": "Cache-Control", "value": "public, max-age=0, must-revalidate" }]
    },
    {
      "source": "/(vendor|fonts)/(.*)",
      "headers": [{ "key": "Cache-Control", "value": "public, max-age=86400" }]
    }
  ],
  "functions": {
    "api/quotes.js": { "maxDuration": 30 },
    "api/intraday.js": { "maxDuration": 30 },
    "api/history.js": { "maxDuration": 30 },
    "api/yields.js": { "maxDuration": 30 },
    "api/news.js": { "maxDuration": 30 },
    "api/calendar.js": { "maxDuration": 30 }
  }
}
```

Projeto na Vercel: "Other" (sem framework), sem comando de build, diretório de saída `.`, Node 22. Não há variáveis
de ambiente obrigatórias (`VERCEL_GIT_COMMIT_SHA` é preenchida pela própria Vercel).

### 17.13 `package.json`

```json
{
  "name": "mercado",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "node scripts/dev-server.mjs",
    "lint": "eslint .",
    "format": "prettier --write .",
    "format:check": "prettier --check .",
    "test": "vitest run",
    "vendor": "node scripts/copy_vendor.mjs"
  },
  "devDependencies": {
    "@eslint/js": "^9.17.0",
    "@fontsource/geist-mono": "^5.3.0",
    "@fontsource/instrument-sans": "^5.3.0",
    "chart.js": "4.5.1",
    "eslint": "^9.17.0",
    "eslint-config-prettier": "^9.1.0",
    "globals": "^15.14.0",
    "prettier": "^3.4.2",
    "vitest": "^2.1.8"
  }
}
```

`scripts/copy_vendor.mjs`: copie o original e apague o bloco do `lightweight-charts` (o app novo não usa). O
`chart.umd.min.js` vai para `vendor/`; as fontes Instrument Sans (400–700) e Geist Mono (400–600) para `fonts/`.
Commite `vendor/` e `fonts/` (o site é servido sem build).

### 17.14 `scripts/dev-server.mjs`

```js
// Servidor local: arquivos estáticos + as funções de api/ (mesmo código da Vercel). Uso: npm run dev
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { extname, join, normalize } from "node:path";
import quotes from "../api/quotes.js";
import intraday from "../api/intraday.js";
import history from "../api/history.js";
import yields from "../api/yields.js";
import news from "../api/news.js";
import calendar from "../api/calendar.js";

const API = {
  "/api/quotes": quotes,
  "/api/intraday": intraday,
  "/api/history": history,
  "/api/yields": yields,
  "/api/news": news,
  "/api/calendar": calendar,
};
const ROOT = new URL("..", import.meta.url).pathname;
const TYPES = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript",
  ".css": "text/css",
  ".json": "application/json",
  ".woff2": "font/woff2",
  ".svg": "image/svg+xml",
};
const PORT = Number(process.env.PORT ?? 8080);

createServer(async (req, res) => {
  const url = new URL(req.url, "http://x");
  if (API[url.pathname]) {
    res.status = (c) => ((res.statusCode = c), res);
    res.json = (o) => (
      res.setHeader("Content-Type", "application/json"),
      res.end(JSON.stringify(o))
    );
    return API[url.pathname](req, res);
  }
  const path = normalize(join(ROOT, url.pathname === "/" ? "index.html" : url.pathname));
  if (!path.startsWith(ROOT)) return res.writeHead(403).end();
  try {
    const body = await readFile(path);
    res
      .writeHead(200, { "Content-Type": TYPES[extname(path)] ?? "application/octet-stream" })
      .end(body);
  } catch {
    res.writeHead(404).end("não encontrado");
  }
}).listen(PORT, () => console.log(`http://localhost:${PORT}`));
```

Uso: `npm run dev` e abrir `http://localhost:8080`. As funções de `api/` rodam com o mesmo código da Vercel (o
servidor só imita `res.status()` e `res.json()`). Sem internet para o Yahoo, o app abre com "Arquivo publicado"
(`data/flow.json`) e as abas que dependem só de `data/` (Visão geral, Fluxo, Macro, Notícias pelo `news.json`)
continuam funcionando.
