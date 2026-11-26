# Pêndulo

Site **estático** (HTML, CSS e JavaScript no navegador) que mostra o regime macro, o fluxo por região e setor dos ETFs dos EUA, o momentum de cada ETF e um ranking de **37 pares bidirecionais** ("pêndulo"): qual ponta comprar (▲), qual vender ou reduzir (▼), em que proporção e se é hora de entrar.

Sem servidor, sem banco, sem chave de API. Material educacional; não é recomendação de investimento.

## Estrutura

```
index.html            abas e containers
assets/universe.js    47 ativos e 37 pares com os parâmetros do backtest
assets/engine.js      todos os cálculos (funções puras, testadas)
assets/app.js         carga de dados, renderização e atualização automática
assets/state.js       estado da página, preferências salvas e constantes das abas
assets/views.js       mapa aba -> tela; contexts.js: contexto que cada aba recebe
assets/charts.js      gráficos (Chart.js) e painel lateral; drawers.js: painéis de par, ativo e atualização manual
assets/widgets.js     componentes visuais puros (tags, balança) e aviso na tela
assets/events.js      cliques, teclado, mouse e redimensionamento
assets/feeds.js       notícias e juros: carga, ligação com a carteira e avisos
assets/cloud-sync.js  carteira: gravação local e sincronia com a nuvem
assets/signal-center.js  sinais da carteira e dos ativos; avisos do sistema
assets/checks-center.js  verificação dos dados (segunda fonte): carga, selo e tela
assets/site-update.js    detecção de versão nova, limpeza de cache e recarga
assets/live.js        cotações ao vivo sobre o histórico e avisos de atraso
assets/ta.js          indicadores de análise gráfica (RSI, MACD, Bollinger, ADX, VWAP, pivôs, candles...)
assets/ta-signals.js  placar de sinais gráficos, plano de entrada/saída, leitura do pregão e histórico do sinal
assets/ta-view.js     aba "Quando entrar": radar, detalhe e explicações simples
assets/ta-data.js     dados da aba (barras diárias e de 5 min, cache da análise, ativos vigiados)
assets/ta-chart.js    configuração dos gráficos da aba (candles, VWAP, níveis, subpainéis)
assets/ta-glossary.js textos didáticos de cada ferramenta e seção "Aprenda"
assets/integrated.js  aba Análise: nota integrada por ticker (técnico, momentum, fundamentos, analistas) e escala
assets/analysis-*.js  aba Análise: carga (api/analyze) e tela
api/analyze.js        função da Vercel: 2 anos de barras + fundamentos de até 15 tickers quaisquer
assets/fa.js          aba Valor: placar fundamentalista (prêmio de risco, spreads, juro real, ouro)
assets/value-view.js  aba Valor: cards, tabela por ETF e "Aprenda"
assets/fa-glossary.js textos didáticos da aba Valor
scripts/update_fundamentals.py  data/fundamentals.json (FRED + P/L do SPY, 1x por dia)
assets/flow-*.js      mapa de fluxo: universo, cálculos e visualização
api/quotes.js         função da Vercel: cotações ao vivo do Yahoo (api/_http.js: cliente HTTP comum, não vira rota)
api/intraday.js       função da Vercel: barras de 5 min de um ativo (leitura do pregão)
assets/themes.css     cores dos 5 temas (Meia-noite, Grafite, Âmbar, Papel, Névoa) + daltonismo
assets/styles.css     componentes (casca do app, cartões, tabelas, movimento)
assets/theme.js       preferências de aparência e paleta para os gráficos
assets/ui.js          logo, navegação (lateral/dock) e painel de aparência
assets/motion.js      animações dos números (entrada, contagem, destaque do que mudou)
data/prices.json      histórico do Pêndulo (gerado pelo script abaixo)
data/flow.json        histórico do mapa de fluxo
data/ohlc.json        abertura/máxima/mínima/fechamento/volume diários (análise gráfica)
scripts/              update_prices.py, copy_vendor.mjs
tests/                testes do motor (Vitest)
vendor/, fonts/       Chart.js, Instrument Sans e Geist Mono, hospedados junto (sem CDN)
vercel.json           cabeçalhos de cache
```

## Aparência

Layout de app (barra lateral no computador, dock no celular) feito para sessões longas. O botão **Aparência** (atalho `T`) troca de tema e ajusta a leitura; as escolhas ficam salvas no navegador.

- **5 temas:** Meia-noite (padrão, escuro), Grafite (preto neutro), Âmbar (escuro quente, pouca luz azul), Papel e Névoa (claros), mais **Automático** (segue o sistema).
- **Leitura:** modo para daltonismo (azul = alta, laranja = baixa), 4 tamanhos de texto, espaçamento confortável ou compacto.
- **Animações que explicam os números:** a página entra em sequência ao abrir uma aba; os indicadores contam de 0 até o valor; barras, anéis e termômetros crescem a partir da origem; ao atualizar, o número que mudou pisca em verde/azul (subiu) ou vermelho/laranja (caiu). Respeitam "Animações" no painel e o movimento reduzido do sistema.
- **Contraste conferido por teste:** `tests/themes.test.js` mede o contraste (WCAG) de texto, alta/baixa/espera e realces em cada tema, com e sem daltonismo (texto principal ≥ 7:1, demais ≥ 4,5:1).
- Direção visual em [`docs/design/`](docs/design/kinetic-nocturne-philosophy.md) (filosofia, placa em SVG/PNG e o gerador).

## Recursos de terminal (inspirados em TradingView, Investing e Bloomberg)

- **Barra de comandos** (`/` ou Ctrl+K): ativo por ticker/ISIN ou mnemônico de aba (`PORT`, `NEWS`, `CAL`, `RISK`, `SCR`, `MESA`, `FLOW`, `VAL`) e funções de ativo (`SPY TA`, `AAPL AN`, `QQQ DES`). Lógica pura em `assets/command.js`.
- **Gráfico pro** na aba Quando entrar: Lightweight Charts do TradingView (Apache 2.0, `vendor/`, carregado sob demanda) com zoom preservado entre atualizações, cruz com OHLC, volume e níveis do plano no eixo. Configurações › Dados › Gráfico do ativo volta ao Clássico. `assets/pro-chart.js`.
- **Agenda** (`api/calendar` → aba Agenda): eventos econômicos da semana (Forex Factory/faireconomy, sem chave) e resultados/dividendos da carteira e das listas (Yahoo). Evento de alto impacto dos EUA nas próximas 2 h gera aviso na aba Quando entrar. `assets/calendar.js`.
- **Risco** (aba Risco): volatilidade, beta vs SPY, VaR/CVaR histórico 95% de 1 dia, queda máxima, parte do risco por posição, correlação e posições efetivas, sobre 1 ano de retornos diários. `assets/risk.js`.
- **Screener**: filtros rápidos (tendência, RSI, perto da máxima, recuo em alta), grupo, faixa de RSI e ordenação sobre o universo. `assets/screener.js`.
- **Mesa**: até 4 painéis lado a lado (Carteira, News, Agenda, Risco, Screener, Decisões, Verificação), escolha salva nas preferências. `assets/mesa-view.js`.

## Análise gráfica ("Quando entrar")

Aba para quem não conhece análise técnica: um **radar** com semáforo (comprar, aguardar, vender/reduzir) para 40 ativos e, ao abrir um ativo, a resposta numa frase com o **motivo**, o **plano** (entrada, stop e metas), o gráfico (velas, VWAP, médias, bandas, pisos e tetos), a leitura **de hoje** por fase do pregão e quanto o sinal **já acertou** no passado do ativo. Cada indicador tem um botão "O que é isso?". Dá para **vigiar até 5 ativos** e receber aviso na tela quando a resposta mudar durante o pregão. Teoria, fórmulas, pesos e limites em [`docs/ANALISE-TECNICA.md`](docs/ANALISE-TECNICA.md).

- Sem `data/ohlc.json` (antes da primeira execução do workflow), a aba funciona só com fechamentos e avisa.
- Rode o workflow **Atualizar preços** uma vez após publicar para gerar `data/ohlc.json`.

## Dados: ao vivo e histórico (tudo gratuito)

| Camada               | De onde vem                                                                                                                                                                            | Frequência                                                                                                                                                                 |
| -------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Pregão de hoje**   | Função `api/intraday.js` devolve barras de 5 min dos últimos 5 pregões de um ativo (só do universo), com cache de 60 s na borda                                                        | Ao abrir o ativo na aba Quando entrar e a cada 60 s enquanto aberto                                                                                                        |
| **Cotações ao vivo** | Função `api/quotes.js` (Vercel) consulta o Yahoo Finance para os ~186 símbolos do universo                                                                                             | A cada carga da página; a página se atualiza sozinha a cada 5 min (ajustável) e no botão **Recarregar**. Cache de 60 s na borda: no máximo 1 consulta ao Yahoo por minuto. |
| **Histórico**        | `scripts/update_prices.py` gera `data/prices.json` (Pêndulo, 1.000 pregões), `data/flow.json` (mapa de fluxo, 300 pregões + volume) e `data/ohlc.json` (análise gráfica, ~520 pregões) | Workflow `.github/workflows/update-prices.yml`: a cada 30 min no pregão e após o fechamento.                                                                               |

- O preço ao vivo substitui o último pregão do histórico, então momentum, RSI, z e entrada dos pares são recalculados ao longo do dia.
- Se a função falhar, a página usa o histórico publicado e mostra o aviso em vermelho.
- **Por que não um cron a cada 5 min no GitHub:** cada execução vira commit e deploy; seriam ~90 deploys por pregão, perto do limite de 100/dia da Vercel Hobby, e o GitHub atrasa ou pula agendamentos curtos. A função ao vivo entrega dados mais frescos sem deploy.
- **Avisos de atraso:** selo amarelo acima de 10 min e vermelho acima de 30 min no intradiário; ativos com última negociação além da tolerância (20 min para ETFs e moedas, 25 min para futuros da CME, que já têm ~10 min de atraso na fonte, 75 min para índices de juros) aparecem no aviso do topo e com borda tracejada no mapa.
- O universo do mapa está em `assets/flow-universe.js` (grupo, rótulo e convenções: moedas contra o US$, juros em bps).
- Limites: o Yahoo não tem SLA; juros de outros países não existem na fonte gratuita (usamos ETFs de títulos soberanos como proxy); fluxo é inferido por preço e volume, não por captação.

Rodar manualmente no seu computador:

```bash
pip install -r scripts/requirements.txt
python scripts/update_prices.py
```

## Desenvolvimento

```bash
npm install
npm run dev      # http://localhost:8080 (site + /api/quotes ao vivo)
npm test         # testes do motor
npm run lint
npm run preload  # atualiza os modulepreload do index.html (o teste avisa se estiver desatualizado)
npm run golden   # regrava o gabarito numérico: só se uma mudança de resultado for INTENCIONAL
npm run vendor   # recopia Chart.js e as fontes de node_modules
```

## Carteira (parser do Investing)

Aba **Carteira**: cole a tabela de _Holdings_ do Investing.com (com cabeçalho). O parser (`assets/portfolio.js`) aceita colunas separadas por tab ou espaços, números em formato en-US ou pt-BR, soma lotes repetidos e detecta posições compradas no dia (Daily P/L% = Net P/L%), para medir o resultado do dia como o Investing. Preços ao vivo vêm de `/api/quotes?extra=…` e o histórico de 1 ano de `/api/history?symbols=…`.

A carteira fica **só no navegador** (localStorage). Use _Exportar backup_ para levar a outro aparelho.

## Sinais (`assets/signals.js`)

| Tipo    | Regra                                    | Histórico (47 ativos, ~4 anos, 5 pregões)                    |
| ------- | ---------------------------------------- | ------------------------------------------------------------ |
| Entrada | Reversão após queda forte                | +0,86% em média, acerto 59% (base: +0,31%, 55%)              |
| Entrada | Recuo em tendência de alta               | +0,80%, acerto 59%                                           |
| Saída   | Esticado: risco de devolução             | −0,01% (base +0,31%), caiu 49%                               |
| Saída   | Repique até a MM50 em tendência de baixa | +0,11%, caiu 50%                                             |
| Risco   | Perdeu a MM200 / Queda além do ruído     | não anteciparam queda no período (alerta de limite de perda) |

Regras com saída clássica (perdeu MM50, exaustão de RSI) foram descartadas: no histórico, o preço subiu depois. Cada sinal avisa uma vez por pregão, na tela e como notificação do navegador (com a página aberta). A amostra quase não tem mercado de baixa prolongado.

## Atualizar a versão do site

O botão **⟳** no topo baixa de novo todos os arquivos ignorando o cache e recarrega a página (a carteira e as preferências ficam). Quando um deploy novo é publicado com a página aberta, o ⟳ fica destacado e aparece um aviso no topo (a função informa o commit publicado).

## Cache dos arquivos

`assets/*` é servido com `max-age=0, must-revalidate` (o navegador confere a versão a cada carga, via ETag). O `index.html` carrega `app.js?v=N` e `styles.css?v=N`: ao mudar a interface de forma incompatível, suba o `N` para forçar o navegador a ignorar cópias antigas.

## Publicar na Vercel

Framework Preset = **Other**, sem build command, Output Directory = raiz (`.`). O `vercel.json` já traz os cabeçalhos de cache.
Todo link da Vercel é público para quem tiver a URL, a menos que a **Deployment Protection** esteja ativa.

## Pendências conhecidas

- `text` e `instruments` de cada par (explicações e ETFs alavancados/inversos) vêm do `universe.json` do simulador local e ainda não foram importados para `assets/universe.js`.
- Validar o `engine.js` contra o `engine.py` do simulador local com os mesmos preços (especificação, seção 13.1).
- Parâmetros do timing v2 não explícitos na especificação (janela do `vol60`, desvio amostral) estão documentados em `assets/engine.js`.

## App instalável (PWA)

- `manifest.webmanifest`, `icons/` e `sw.js` tornam o site instalável: iPhone/iPad (Safari › Compartilhar › Adicionar à Tela de Início), Android (Chrome › Instalar app), Mac (Safari › Arquivo › Adicionar ao Dock; Chrome/Edge › ícone de instalar) e Windows.
- Service worker com **rede primeiro**: online sempre roda o código e os dados mais recentes; offline abre com a última cópia (o selo mostra a idade real).
- O botão ⟳ também apaga o cache do service worker.
- No iOS/Safari o app instalado tem armazenamento próprio: leve a carteira com Exportar/Restaurar backup.

## Verificação dos dados

Aba **Verificação** e selo no cabeçalho ("✓ Dados conferidos"). Três camadas:

1. **Navegador** (`assets/checks.js`), a cada atualização: integridade da base, saltos anormais, idade da base, cobertura e validade das cotações, emenda cotação × base, recálculo independente de retornos/MM/RSI, regras do Top 5 e contas da carteira (valor, custo, pesos, totais, posições iguais às importadas).
2. **Segunda fonte** (`api/verify.js`): preço e fechamento anterior do Yahoo comparados com a Nasdaq (amostra + ações/ETFs da carteira), a cada 15 min. Futuros, moedas e índices não têm segunda fonte gratuita.
3. **Publicação** (`scripts/verify-data.mjs`): o cron valida `data/*.json` antes de commitar; erro bloqueia a publicação. Também roda no CI (`npm run verify:data`).

## Abas (v3)

Painel (terminal com quadros por tema) · Carteira · Sinais · Quando entrar · Mapa de fluxo · Pêndulo · Verificação.
Removidas: Visão geral, Fluxo por região, Setores EUA, Ativos, Análise (prompt) e Como ler, cobertas pelo Painel e pelo Mapa de fluxo.

- **Painel**: bolsas (EUA, Europa, Ásia, Américas), juros EUA e curva, juros soberanos (BCE, MoF Japão, Banco da Inglaterra, BCB via `/api/yields`), moedas, commodities, crédito, setores, risco/volatilidade, cripto e leitura de regime (7 razões de risco + VIX/VIX3M), em 1D/5D/1M/3M.
- **Leveza**: sem `backdrop-filter`; animações desligadas por padrão (ligar em Aparência).
- **Câmbio**: o Yahoo data a barra diária de câmbio (=X) com o fechamento do dia anterior; `update_prices.py` recua as moedas um pregão e o `verify-data` confere spot × futuro CME no mesmo dia.

## Carteira na nuvem

- Login por e-mail e senha (Supabase Auth) na aba **Carteira**.
- Tabela `public.pendulo_portfolio` (uma linha por usuário) com RLS: cada usuário só lê e grava a própria carteira; `anon` sem acesso.
- Sincronização: ao entrar, a cada atualização (no máximo 1×/min) e em toda gravação. Vale a versão alterada por último; apagar grava uma carteira vazia (marca de exclusão) para não "ressuscitar" em outro aparelho.
- Sem login, a carteira continua só no aparelho (localStorage), como antes.
- Os aparelhos se atualizam sozinhos: ao voltar para o app, ao recuperar a rede e a cada minuto com o app visível (mesmo com o mercado fechado). Cada gravação é relida da nuvem para confirmar; se falhar, o app avisa o motivo e tenta de novo em 30 s. Se a sessão expirar, o app avisa em vez de salvar só localmente em silêncio.
- Tabelas e regras RLS: `supabase/schema.sql`.

## Avisos push (app fechado, celular e Apple Watch)

Service worker + Web Push + pg_cron no Supabase (Edge Function `push`). Passo a passo em `supabase/PUSH.md`.

## News

- Aba **News**: manchetes (só título, fonte, horário e link) de Bloomberg, CNBC, MarketWatch, Investing.com, Seeking Alpha, Yahoo Finance (por ticker da carteira), Valor Econômico e Valor Investe, InfoMoney, Money Times, Exame e Investing Brasil via `/api/news`, e de Financial Times e The Economist via cron (`scripts/update-news.mjs` → `data/news.json`, a cada 30 min), porque esses dois recusam a função da Vercel.
- **Destaques**: só manchetes com assunto de mercado (`marketScore`); "Todas" mostra tudo. Filtros Internacional / Brasil.
- **Carteira**: `matchNews` liga cada manchete às posições — direta (cita ticker ou empresa) ou por tema (setor, país, juros). Notícias novas que afetam a carteira geram aviso na tela e notificação, uma vez cada.
- Não disponíveis: WSJ (RSS público parado desde 2025), CNN Money (feed desativado), Valor (feed com erro).

## Gabarito numérico

`tests/fixtures/` guarda dados reais congelados (preços, fluxo, OHLC). `tests/golden.test.js` roda os motores (pares, regime, fluxo, sinais, análise gráfica diária e intradiária, carteira) sobre eles e compara com `tests/fixtures/golden.json`, incluindo um hash de todos os pregões de cada ativo. Qualquer refatoração que altere um número falha esse teste. Se a mudança for intencional, rode `npm run golden` e revise o diff do `golden.json`.
