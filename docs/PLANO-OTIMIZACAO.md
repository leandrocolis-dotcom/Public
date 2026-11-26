# Pêndulo: análise heurística e plano de otimização

Data: 13/11/2026. Base: commit `0cd44e7` da `main`. Autor da análise: agente; executor previsto: Opus.

**Conclusão em uma frase:** o app já tem a arquitetura certa (canal único empurrado pelo servidor, cache de borda,
funções puras testadas); o desperdício está em três pontos: o robô de cotações trabalha igual com ou sem alguém
olhando, manda o universo inteiro a cada 15 s, e cada tela mantém a sua própria busca de 1 em 1 minuto. Corrigir
isso derruba as consultas ao Yahoo em ~65% (sem mudar o que o usuário vê) e em ~95% num dia típico de uso
pessoal, com o preço tão atual quanto hoje. A conclusão deixa de valer se o app passar a ter muitos usuários
simultâneos o dia todo (aí o ganho do item "sob demanda" some; os demais permanecem).

## Status da execução (13/11/2026)

| Fase | Feito                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     | Pendente                                                                                                                                                                                                                                                                                                                                    |
| ---- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 0    | `scripts/perf-probe.mjs`; linha de base em `docs/PERF-BASELINE.md`; contadores `stats` na função                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          | Medir em produção (ambiente do agente bloqueia o Yahoo)                                                                                                                                                                                                                                                                                     |
| 1    | `sessions.js`, `feed-tiers.js`, `feed-delta.js` + testes; `quotes-feed` v2 (v1 em `index.v1.ts`); SQL aditivo validado em Postgres 16; presença no app                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    | **Implantado no Supabase em 15/11/2026**: SQL (presença, `pendulo_touch`, `pendulo_snapshot`, `stats`), função v2 (versão 7) e cron com `where exists` na presença. Teste no domingo: a função responde e pula com o mercado fechado. Pendente: medir os critérios "Pronto quando" no próximo pregão (contadores em `pendulo_quotes.stats`) |
| 2    | Central `quote-hub.js` + 7 telas migradas (só a central e a reserva do `app.js` chamam `api/quotes`); presença com ativos visíveis; abertura pela foto (`pendulo_snapshot`); notícias 2/5 min com `s-maxage=120`; 2.6 `bars-hub.js` (barras intraday: 1 cache, validade = barra, Fluxo/Watchlist/painel/radar)                                                                                                                                                                                                                                                                                                                                            | agendador único no lugar do `tick()`; 2.8 foto do universo no servidor (Sinais/Screener ainda buscam 7 blocos via central)                                                                                                                                                                                                                  |
| 3    | 3.3 medida e descartada: a cópia rasa saiu mais lenta (7–8 ms contra 4–5 ms por pacote; `structuredClone` é nativo). O overlay inteiro custa ~4 ms, não é ele que trava. Ficou a correção do `last_real` (custo quadrático) e o teste `tests/live-overlay.test.js`                                                                                                                                                                                                                                                                                                                                                                                        | 3.1/3.2/3.4: antes, perfilar um pacote real no celular (precisa de cotações ao vivo, bloqueadas no ambiente do agente); suspeito: desenho do Fluxo/mapa                                                                                                                                                                                     |
| 4    | 4.3 parcial: dados (`data/`) com espera de 3 s no service worker                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          | 4.1/4.2 e "cópia primeiro" do código só com nomes com hash (sem eles, módulos de versões diferentes se misturam após um deploy); medir a abertura em 4G antes (condição do próprio plano)                                                                                                                                                   |
| 5    | 5.2 avisos de rotina = contador âmbar no selo (`status-issues.js`); 5.3 zoom, piso de 12 px, toque de 40 px; 5.5 sub-abas; 5.6 Fluxo recolhido no celular e bloco fechado não desenhado (DOM 4.364 → 475; altura 13.164 → 2.831 px); 5.1 selo único por sessão (`sealLabel`: "Pré-mercado · ao vivo", "Mercado fechado"; cor pelo frescor; pílula "Off market" só com Off forçado no pregão); 5.4 topo compacto no celular (título fora da vista, Offshore/Onshore em 1 linha, frase da aba some após 3 visitas: conteúdo da Visão geral de ~55% para ~40% da tela, ~33% sem a frase); 5.7 cartões em 2 linhas e "?" de regime, fluxo (σ) e fora da curva | Rebaixar o botão Recarregar (U2). Exceção: texto do mapa de calor escala com o quadro                                                                                                                                                                                                                                                       |

Como ler: a Parte 1 é o diagnóstico (com o que foi medido, inferido e suposto); a Parte 2 é o desenho da
solução de dados em tempo real; a Parte 3 é o plano por fases, pronto para execução; a Parte 4 é o prompt de
partida para o Opus.

---

## Parte 1: diagnóstico

### 1.1 Método e limites

- **Verificado (medido nesta sessão):** leitura do código (`assets/`, `api/`, `supabase/functions/`, `sw.js`,
  `vercel.json`); app rodando em `npm run dev` com Chromium (desktop 1440×900 e iPhone 13), contagem de
  requisições, tamanho de respostas, nós de DOM, tamanho de fonte e de alvo de toque; tamanho do pacote de
  cotações em três formatos.
- **Inferido (do código, sem medir em produção):** volume diário de chamadas do robô, tráfego do canal por
  aparelho, custo de CPU do `rebuild()` por pacote.
- **Não testado:** produção na Vercel (o conector Vercel não conectou nesta sessão e o curl direto é bloqueado);
  tamanho comprimido (gzip/brotli) dos arquivos; consumo real das cotas do Supabase e da Vercel; comportamento
  com leitor de tela; contraste de cores por tema. O que depende disso está marcado como "a confirmar".

### 1.2 Números medidos

| Medida                                                         | Valor                                                       | Onde                        |
| -------------------------------------------------------------- | ----------------------------------------------------------- | --------------------------- |
| Módulos JS carregados na abertura                              | 134 arquivos, 1.667 KB (sem compressão)                     | qualquer aba                |
| Requisições na abertura                                        | 153 (5 de API, 4 de `data/`)                                | qualquer aba                |
| `data/flow.json` + `data/prices.json` na abertura              | 769 KB + 359 KB                                             | qualquer aba                |
| Universo do canal em tempo real                                | 374 símbolos = 7 consultas ao Yahoo                         | `api/quotes.js` (`SYMBOLS`) |
| Composição do universo                                         | 191 EUA, 94 B3, 37 futuros, 32 índices, 15 moedas, 5 cripto | idem                        |
| Pacote do canal (como vai hoje, "enxuto")                      | 43,9 KB                                                     | `quotes-feed/index.ts`      |
| Mesmo pacote só com preço, hora e volume                       | 12,7 KB (34 bytes por ativo)                                | simulação                   |
| Abrir "Sinais de hoje"                                         | +27 chamadas de API (32 no total)                           | `assets/market.js`          |
| Aba Fluxo no celular                                           | 14.885 px de altura, 4.535 nós de DOM                       | iPhone 13                   |
| Aba Fluxo: textos menores que 12 px                            | 479 (celular) e 598 (desktop)                               | idem                        |
| Aba Fluxo: controles com menos de 36 px                        | 188 de 235                                                  | idem                        |
| Visão geral: textos < 12 px / controles < 36 px                | 181 / 66 de 117                                             | iPhone 13                   |
| Tarefas longas com a aba Fluxo parada 15 s (CPU 4x mais lenta) | 2 (502 ms e 218 ms)                                         | iPhone 13 emulado           |

### 1.3 Dados em tempo real: onde está o esforço

Fluxo atual (verificado no código): `pg_cron` chama a Edge Function `quotes-feed` a cada 15 s → ela busca os 374
símbolos no Yahoo (7 consultas) → transmite o pacote inteiro pelo canal `pendulo-quotes` → grava a foto completa
em `pendulo_quotes` → o app faz `mergeLive` → `rebuild()` → `render()`.

| #   | Achado                                                                                                                                               | Evidência                                                                   | Efeito                                                                                   |
| --- | ---------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------- |
| R1  | O robô busca com ou sem alguém com o app aberto: 16 h por dia útil a cada 15 s e a noite a cada 1 min.                                               | `minGap()` em `quotes-feed/index.ts`                                        | ~30 mil consultas ao Yahoo por dia útil (3.840 rodadas × 7 + noite 480 × 7). Inferido.   |
| R2  | Todo ativo tem a mesma cadência: SPY e um ETF de nicho, B3 fechada, futuro agrícola fora de sessão.                                                  | `fetchAll(SYMBOLS, ex)` sem camadas                                         | 7 consultas por rodada quando 1 ou 2 bastariam para o que está na tela.                  |
| R3  | À noite só futuros, moedas e cripto negociam (57 símbolos), mas a busca traz os 374.                                                                 | sessão `night` usa o mesmo `fetchAll`                                       | 7 consultas por minuto em vez de 1.                                                      |
| R4  | O pacote leva todos os ativos, mesmo os que não mudaram.                                                                                             | `broadcast(slim)`                                                           | 43,9 KB × 240 por hora ≈ 10,5 MB por hora por aparelho aberto.                           |
| R5  | A cada rodada: 1 leitura de todas as carteiras (`extras()`) e 1 gravação de ~67 KB em `pendulo_quotes`.                                              | `run()`                                                                     | 3.840 leituras + 3.840 regravações de linha grande por dia (inchaço de WAL no Postgres). |
| R6  | Cada tela tem o seu relógio de 1 min e a sua URL de cotações: Visão geral, Local, Sinais/Screener, Watchlist, nomes puros do Fluxo, painel do ativo. | `feeds.js`, `market.js`, `watch-view.js`, `leaders-view.js`, `asset-pop.js` | URLs diferentes para os mesmos ativos = cache de borda acerta menos; 6 caches paralelos. |
| R7  | Sinais/Screener: 16 lotes de cotações por minuto por aparelho (um por vez) + 16 lotes de histórico na abertura.                                      | `loadMarketQuotes()`, medido: +27 chamadas                                  | É o maior consumidor de função da Vercel com o app aberto.                               |
| R8  | Ritmo do cliente menor que o cache do servidor: notícias a cada 2 min contra `s-maxage=300`; barras intraday de 5 min rebuscadas a cada 1 min.       | `feeds.js:201`, `api/news.js:145`, `flow-view.js`, `asset-pop.js`           | Mais da metade dessas chamadas devolve exatamente a mesma resposta.                      |
| R9  | Cada pacote refaz tudo: clona as tabelas de preços e de fluxo (1,1 MB), recalcula snapshot, sinais e carteira e redesenha.                           | `rebuild()` em `app.js`; `overlay()` em `live.js` (`structuredClone`)       | CPU a cada 15 s mesmo quando nada visível mudou; trava perceptível em celular lento.     |
| R10 | Na abertura o app chama `/api/quotes` (função da Vercel) embora a última foto já exista no Supabase.                                                 | `load()`                                                                    | 1 execução de função por abertura e a cada 10 min que poderia ser leitura de cache.      |
| R11 | A regra de sessão existe em 3 lugares que precisam andar juntos; só o cliente conhece os feriados.                                                   | `refresh.js`, `live-feed.js`, `quotes-feed/index.ts`                        | Em feriado o robô só descobre depois de buscar; risco de divergência a cada mudança.     |

O que já está certo e deve ser preservado: canal único por Broadcast (sem conexão por ativo), reserva automática
quando o canal cai, desligar com a tela escondida, blocos estáveis para o cache de borda, deduplicação de pedidos
iguais (`inflight`), fila de 6 para cargas de fundo, varredura do universo pré-calculada no fechamento.

### 1.4 Código e sistema

| #   | Achado                                                                                                                                                  | Severidade | Recomendação                                                                                            |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------- | ------------------------------------------------------------------------------------------------------- |
| C1  | 134 módulos sem empacotamento, todos pré-carregados em qualquer aba; cache `max-age=0, must-revalidate` = 134 revalidações a cada abertura.             | Alta       | Empacotar por seção com nome com hash (ver Fase 4). É a maior alavanca de tempo de abertura.            |
| C2  | Service worker "rede primeiro" para tudo, com espera de até 6 s antes de usar a cópia local.                                                            | Alta       | Código e fontes: "cópia primeiro, atualiza por trás". Dados: como hoje.                                 |
| C3  | `flow.json` (769 KB) é baixado na abertura mesmo em abas que não usam fluxo.                                                                            | Média      | Baixar depois do primeiro desenho; abas que não usam não esperam por ele.                               |
| C4  | Seis caches de dados independentes com TTLs próprios (`intra`, `intraCache`, `ownQuote`, `ownQ`, `cached`, `mkt.quotes`).                               | Média      | Um único módulo de cotações e um de barras (Fase 2).                                                    |
| C5  | `tick()` roda a cada 1 s e chama 4 carregadores que quase sempre retornam sem fazer nada.                                                               | Baixa      | Um agendador com "próxima execução" por recurso; o relógio de 1 s só atualiza o texto da contagem.      |
| C6  | Erros engolidos em cargas de fundo (`.catch(() => null)` em vários módulos): a tela fica sem dado e sem aviso.                                          | Média      | Registrar no estado ("sem cotação há X min") e mostrar no selo; contraria a regra de não esconder erro. |
| C7  | Versão do app por `?v=28` manual só no `app.js` e no CSS.                                                                                               | Média      | Some com o hash da Fase 4.                                                                              |
| C8  | Módulos muito grandes: `ta-signals.js` 1.329 linhas, `flow-view.js` 1.178, `events.js` 828, `app.js` 810; `styles.css` 142 KB em um arquivo.            | Baixa      | Dividir só quando tocar no arquivo; não é prioridade.                                                   |
| C9  | `quotes-feed?force` é URL pública (protegida só pela trava de 10 s).                                                                                    | Baixa      | Exigir cabeçalho com segredo no `force`.                                                                |
| C10 | Pontos fortes: 93 arquivos de teste, lint e formatação no CI, funções de cálculo puras, documentação por tema, RLS ativo, segredos fora do repositório. | n/a        | Manter. Toda lógica nova do plano entra como função pura com teste.                                     |

### 1.5 UX e UI (heurísticas de Nielsen)

| #   | Heurística                   | Achado (evidência)                                                                                                                                                                            | Severidade | Recomendação                                                                                                                  |
| --- | ---------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------- | ----------------------------------------------------------------------------------------------------------------------------- |
| U1  | Estado do sistema visível    | Quatro indicadores de "quão atual está": selo "Fechamento" verde (em pleno pré-mercado), "há 10 min", "Off market", "próxima em 5:00". O verde diz "tudo certo" para um dado de 10 min atrás. | Alta       | Um único selo: sessão + frescor + fonte. Ex.: "Pré-mercado · ao vivo · 11:01". Cor pelo frescor, não pela sessão.             |
| U2  | Estado do sistema visível    | Botão "Recarregar" em destaque num app que se atualiza sozinho ensina o usuário a recarregar.                                                                                                 | Média      | Rebaixar para ícone discreto dentro do selo (toque no selo = detalhes + atualizar agora).                                     |
| U3  | Prevenção e tom do erro      | Faixa vermelha "Preço defasado (pares suprimidos): EWW, EMLC, BWX, VNQI" no topo de todas as abas, para algo rotineiro em 4 ETFs de baixo giro.                                               | Alta       | Vira contador âmbar no selo, com lista ao tocar; vermelho só para falha que afeta decisão (sem cotação do SPY, canal fora).   |
| U4  | Estética e minimalismo       | No iPhone 13 o conteúdo da Visão geral começa a ~55% da tela: cabeçalho, faixa, Offshore/Onshore, sub-abas e frase explicativa vêm antes.                                                     | Alta       | Offshore/Onshore vira alternador de 1 linha; frase da aba some depois da 3ª visita (ou vira "?"); faixa vira selo (U3).       |
| U5  | Estética e minimalismo       | Aba Fluxo no celular = ~18 telas de rolagem, 4.535 nós de DOM.                                                                                                                                | Alta       | Blocos fechados por padrão no celular (só "Entrando e saindo" e "Rotação" abertos) e conteúdo do bloco desenhado só ao abrir. |
| U6  | Acessibilidade               | Zoom bloqueado (`user-scalable=no, maximum-scale=1`) com 181 a 598 textos abaixo de 12 px por tela.                                                                                           | Alta       | Liberar o zoom; piso de 12 px para texto e 13 px para número em tabela no celular.                                            |
| U7  | Acessibilidade               | 56% a 80% dos controles com menos de 36 px (o mínimo recomendado para toque é 44 px).                                                                                                         | Média      | Área de toque mínima de 40 px em botões, chips e cabeçalhos de bloco, sem mudar o tamanho visual.                             |
| U8  | Reconhecer em vez de lembrar | Título da página truncado no celular ("M. :…", "I…"); cartões de resumo cortados ("Misto · Muit…", "Tom misto -…").                                                                           | Média      | No celular o título sai do cabeçalho (a barra inferior já diz onde estou); cartões com 2 linhas ou rolagem lateral.           |
| U9  | Reconhecer em vez de lembrar | Sub-abas roláveis sem indicação: "Fluxo" aparece cortado e "Watchlist" fica invisível.                                                                                                        | Média      | Degradê na borda direita + rolar a aba ativa para o centro.                                                                   |
| U10 | Linguagem do usuário         | Jargão sem legenda nos resumos: "−1,2σ", "Fora da curva", "Tom misto", "Off".                                                                                                                 | Baixa      | Texto de apoio já existe no glossário: ligar por toque longo ou "?" no cartão.                                                |
| U11 | Consistência                 | Ícones em SVG na navegação e emojis nos títulos (🌎 🇧🇷 🏆 🧠 💻).                                                                                                                             | Baixa      | Manter emoji só como rótulo de conteúdo; controles sempre com ícone SVG.                                                      |
| U12 | Controle do usuário          | Pontos fortes: 5 seções por pergunta do usuário, "Primeiros passos" no Início, barra inferior no celular, temas e densidade, busca global, blocos que abrem e recolhem com memória.           | n/a        | Manter.                                                                                                                       |

---

## Parte 2: desenho da solução de dados em tempo real

Princípio: **preço atual é o que muda na tela de quem está olhando.** O servidor só trabalha quando há
alguém olhando, só busca com frequência o que está na tela de alguém, e só transmite o que mudou.

### 2.1 As cinco alavancas

| Alavanca                   | O que muda                                                                                                                                                                 | Ganho estimado                                                                      | Risco                                                                       |
| -------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------- | --------------------------------------------------------------------------- |
| A. Sob demanda             | O `pg_cron` só chama a função se algum app avisou presença nos últimos 10 min.                                                                                             | Proporcional ao tempo sem ninguém: com 2 h de uso por dia, −88% das rodadas.        | Primeiro preço ao abrir vem da foto (até 15 s para o primeiro pacote novo). |
| B. Camadas de cadência     | Quente (15 s): o que alguém tem aberto + referências (SPY, QQQ, VIX, 10 anos, dólar). Morna (60 s): resto do universo com mercado aberto. Fria: mercado fechado não busca. | Pregão: de 1.680 para ~600 consultas por hora (−64%). Noite: de 420 para 60 (−86%). | Ativo morno com até 60 s de atraso (hoje as reservas já são de 60 s).       |
| C. Só o que mudou          | O pacote leva apenas os ativos cujo preço, hora, volume ou estado mudou desde o último envio.                                                                              | De ~10,5 MB para ~1 MB por hora por aparelho (−90%).                                | Aparelho que entra no meio precisa da foto (já é assim: `load()`).          |
| D. Central única no app    | Um módulo recebe os pedidos de todas as telas, junta, tira o que o canal já entrega e faz 1 busca.                                                                         | Elimina 5 relógios e 5 caches; cache de borda acerta mais.                          | Refatoração em 6 telas: precisa de teste de regressão por tela.             |
| E. Duas velocidades no app | Preço na tela na hora (troca só o número); cálculo pesado (pares, sinais, fluxo) no máximo 1 vez por minuto ou quando o preço andou de verdade.                            | CPU por pacote cai de "recalcular tudo" para "trocar texto".                        | Sinal pode sair até 60 s depois do preço (hoje: 15 s).                      |

Conferência de ordem de grandeza (segunda rota): 374 ativos ÷ 60 por consulta = 7 consultas; 3.600 s ÷ 15 s = 240
rodadas por hora; 240 × 7 = 1.680. Com camadas: 240 × 1 (quente) + 60 × 6 (morna) = 600. Pacote: 34 bytes por
ativo × 60 ativos quentes ≈ 2 KB a cada 15 s + ~10,7 KB por minuto da camada morna ≈ 1,1 MB por hora. Batem com a
tabela.

### 2.2 Decisão que cabe ao usuário

**Você precisa decidir:** aceitar que sinais e pares sejam recalculados a cada 60 s em vez de 15 s (alavanca E).

- Variável que decide: se algum gatilho do app depende de reagir em menos de 1 minuto.
- Onde a resposta inverte: os gatilhos atuais usam fechamento, MM200, RSI e janelas de 5 min ou mais; nenhum
  depende de 15 s. Se um dia houver gatilho de segundos, a alavanca E precisa de exceção para ele.
- Custo de desfazer: uma constante (`DERIVED_EVERY_MS`). Barato; o plano segue com 60 s.

Suposição declarada: uso pessoal, 1 a 3 aparelhos, poucas horas por dia. É ela que sustenta a alavanca A.

### 2.3 Protocolo do canal (compatível com o app atual)

O `mergeLive()` de hoje já junta por ativo (`{ ...antigo, ...novo }`). Logo, um pacote com menos ativos e menos
campos funciona **sem mudar o cliente**: dá para publicar o servidor primeiro e voltar atrás sem quebrar ninguém.

```
{ fetched_at, market_state, feed: { session, at, seq, kind: "delta" | "full", tier: "hot" | "warm" },
  count, total, quotes: { SPY: { p, t, v, ms, xk?, xp?, xt?, xc? }, ... }, missing: [] }
```

- `kind: "full"` a cada 5 min e na primeira rodada após ficar parado (a função guarda o último envio em memória;
  memória vazia = manda completo).
- `seq` cresce de 1 em 1. O cliente novo, ao ver um salto, pede a foto (não espera o próximo completo).
- `count` passa a ser o número de ativos no pacote; pacote vazio não é enviado (o cliente trata silêncio pelo
  `STALE_MS`, então em mercado parado manda-se um "pulso" de 1 ativo de referência a cada 60 s).

### 2.4 Presença e ativos quentes

Tabela nova `pendulo_demand` (aditiva, RLS ativo, sem leitura pública):

```
device text primary key, at timestamptz, syms text[], tab text
```

- Função `pendulo_touch(device, syms, tab)` (`security definer`, chamável pela chave pública): grava a linha,
  corta `syms` em 80, valida o formato do símbolo. Sem dado pessoal: `device` é um identificador aleatório do
  aparelho já existente no app.
- O app chama ao abrir o canal, ao trocar de aba ou de lista e a cada 5 min visível.
- O `pg_cron` passa a ser: `select net.http_post(...) where exists (select 1 from pendulo_demand where at > now() - interval '10 minutes')`.
  Sem ninguém, a função nem é chamada.
- Camada quente da rodada = referências fixas + união de `syms` das linhas recentes (limite de 60 = 1 consulta).
  A leitura das carteiras (`extras()`) passa a acontecer 1 vez a cada 5 min, guardada em memória.
- Push com o app fechado não muda: ele usa `/api/push-alerts` a cada 10 min, independente do canal.

### 2.5 Foto para quem chega

`pendulo_quotes.data` já guarda a última foto. Expor por função `pendulo_snapshot()` (`security definer`,
somente leitura, devolve `data` e `at`). O app passa a abrir com ela; `/api/quotes` da Vercel vira reserva
(foto com mais de 2 min ou falha). A gravação da foto cai de cada rodada para 1 vez por minuto.

### 2.6 Central de cotações no app (`assets/quote-hub.js`, novo)

```
watch(id, syms, { every })   // tela registra o que precisa (id = "watch", "names", "panel"...)
unwatch(id)
get(sym)                     // substitui quoteOf / quoteFor / ownQ / ownQuote / mkt.quotes
```

- Junta os pedidos de todas as telas; o que o canal entrega não é buscado.
- O que sobra vai em blocos estáveis (`stableLots`) com 1 relógio, pausado com a tela escondida e com o mercado
  do ativo fechado (EUA, B3, futuros: uma função pura `marketOpen(sym, agora)`).
- Informa a presença (2.4) com os ativos visíveis, que viram quentes no servidor: a tela aberta passa a receber
  pelo canal em vez de buscar.
- Erro de busca fica registrado por ativo (idade do preço) e alimenta o selo único (U1), em vez de ser engolido.

Barras intraday: um `bars-hub` equivalente, com validade igual ao tamanho da barra (5 min → revalida a cada
5 min, alinhado ao relógio) e a última barra completada pelo preço ao vivo do canal, que é o que as telas de
rotação já fazem com `rot-intraday.js`.

---

## Parte 3: plano de implementação (para o Opus)

Regras gerais (valem para todas as fases):

1. Ordem fixa das fases; cada fase termina com `npm run lint`, `npm run format:check`, `npm test`, merge na
   `main`, push e conferência do deploy, como manda o `CLAUDE.md`.
2. Antes de cada fase, registrar a linha de base com o roteiro de medição da Fase 0 e, ao fim, o depois. Sem
   antes/depois a fase não está pronta.
3. Lógica nova = função pura + teste. Módulo novo no front = `npm run preload` (até a Fase 4).
4. Coerência dos números: variação do dia continua `p / pc` em todas as telas (`docs/COERENCIA.md`). A central
   de cotações deve devolver o mesmo objeto que `quoteOf` devolve hoje; teste de regressão obrigatório.
5. Nada de mudar limites ou critérios do aprendizado, do modelo ou dos gatilhos. Este plano é de transporte de
   dados, desempenho e interface.
6. Supabase: só mudanças aditivas; RLS ativo nas tabelas novas; ao mudar `api/quotes.js`, rodar
   `npm run build:feed` e reimplantar a função.
7. Se o resultado medido divergir do esperado (pior ou muito melhor), parar e explicar antes de seguir.

### Fase 0: medir (meio dia)

| Passo | O que fazer                                                                                                                                                                              | Arquivos                             |
| ----- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------ |
| 0.1   | Roteiro `scripts/perf-probe.mjs` (Playwright já instalado): abre cada aba em desktop e iPhone 13 e grava requisições, KB, nós de DOM, textos < 12 px, controles < 40 px, tarefas longas. | novo                                 |
| 0.2   | Contadores na `quotes-feed`: devolver no JSON `yahoo_calls`, `bytes_sent`, `symbols_sent` por rodada e somar por dia em `pendulo_quotes` (colunas novas).                                | `quotes-feed/index.ts`, `schema.sql` |
| 0.3   | Gravar a linha de base em `docs/PERF-BASELINE.md` (a tabela 1.2 deste documento é o ponto de partida).                                                                                   | novo                                 |

Pronto quando: `node scripts/perf-probe.mjs` gera a tabela e o painel do Supabase mostra consultas e bytes do dia.

### Fase 1: servidor do canal (maior ganho, cliente intocado)

| Passo | O que fazer                                                                                                                                                                                                    | Arquivos                                  |
| ----- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------- |
| 1.1   | Regra de sessão única e pura em `assets/sessions.js` (EUA com feriados, B3, futuros, "o que negocia agora"); `refresh.js`, `live-feed.js` e a função passam a importar dela (entra no pacote do `build:feed`). | novo + 3 existentes                       |
| 1.2   | Seleção por camada: `pickTier(agora, quentes)` devolve os símbolos da rodada (quente a cada 15 s; morna a cada 60 s; à noite só futuros, moedas e cripto; B3 só no horário da B3).                             | `assets/feed-tiers.js` (novo, puro)       |
| 1.3   | Só o que mudou: `diffQuotes(anterior, atual)` + completo a cada 5 min + `seq` + pulso de 60 s.                                                                                                                 | `assets/feed-delta.js` (novo, puro)       |
| 1.4   | `extras()` em memória por 5 min; foto em `pendulo_quotes` 1 vez por minuto (não a cada rodada); `force` exige segredo.                                                                                         | `quotes-feed/index.ts`                    |
| 1.5   | Presença: tabela `pendulo_demand`, função `pendulo_touch`, função `pendulo_snapshot`, e o `pg_cron` condicionado à presença.                                                                                   | `supabase/schema.sql`, `supabase/PUSH.md` |
| 1.6   | No app, só o mínimo: chamar `pendulo_touch` ao abrir o canal e a cada 5 min visível (sem lista de ativos ainda).                                                                                               | `assets/live-feed.js`, `assets/cloud.js`  |

Testes: sessões (feriado, horário de verão, sexta à noite, domingo 18 h); camadas (limite de 60, B3 fechada);
delta (nada mudou → pulso; ativo novo; preço igual com hora nova); `mergeLive` com pacote delta fora de ordem.

Ordem de publicação (para não ficar sem preço): (a) SQL aditivo; (b) app com `pendulo_touch`; (c) esperar 1 dia
para os aparelhos atualizarem; (d) função nova; (e) `pg_cron` condicionado. Voltar atrás = reagendar o cron
antigo e reimplantar a função anterior (guardar o `index.ts` atual como `index.v1.ts`).

Pronto quando: em um pregão, consultas ao Yahoo por hora ≤ 650 com o app aberto e 0 com o app fechado há mais de
10 min; bytes por hora por aparelho ≤ 1,5 MB; idade do preço do SPY na tela ≤ 20 s em 95% das leituras (medida
pelo `perf-probe` contra o `t` da cotação); aba Verificação sem regressão.

### Fase 2: central de cotações e de barras no app

| Passo | O que fazer                                                                                                                                                                                   | Arquivos                                                                                  |
| ----- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------- |
| 2.1   | `assets/quote-hub.js` (API da seção 2.6) com testes: união de pedidos, exclusão do que o canal cobre, blocos estáveis, pausa com tela escondida e mercado fechado, erro por ativo.            | novo                                                                                      |
| 2.2   | Migrar uma tela por commit, com teste de regressão de `p / pc`: painel do ativo → Watchlist → nomes puros → Visão geral (`loadDashExtra`) → Local (`loadLocal`) → rebalanceamento/mesa.       | `asset-pop.js`, `watch-view.js`, `leaders-view.js`, `feeds.js`, `rebalance.js`, `desk.js` |
| 2.3   | `quoteOf` vira `hub.get` (mesma assinatura, mesma ordem de prioridade: canal → universo → busca própria).                                                                                     | `asset-pop.js`                                                                            |
| 2.4   | A central envia os ativos visíveis no `pendulo_touch` (viram quentes): a tela aberta passa a receber pelo canal.                                                                              | `quote-hub.js`, `live-feed.js`                                                            |
| 2.5   | Abrir com a foto do Supabase (`pendulo_snapshot`); `/api/quotes` só como reserva.                                                                                                             | `app.js` (`load`)                                                                         |
| 2.6   | `assets/bars-hub.js`: um cache de barras, validade = tamanho da barra, última barra completada pelo canal. Migrar Fluxo, Watchlist, painel do ativo, radar técnico.                           | novo + `flow-view.js`, `watch-view.js`, `asset-pop.js`, `ta-data.js`                      |
| 2.7   | Alinhar ritmos ao cache do servidor: notícias 5 min (2 min só com a aba Notícias aberta e `s-maxage=120`), líderes 2 min, calendário 30 min. Agendador único no lugar do `tick()` de 1 s.     | `feeds.js`, `app.js`, `api/news.js`                                                       |
| 2.8   | Mercado inteiro (Sinais/Screener): foto do universo gerada pelo servidor na camada "universo" (a cada 2 min, só com alguém nessas abas, gravada em `pendulo_quotes` id 2) e lida em 1 pedido. | `quotes-feed/index.ts`, `market.js`                                                       |

Pronto quando: `grep -n "api/quotes" assets/` só encontra `quote-hub.js` e a reserva em `app.js`; abrir Sinais de
hoje faz no máximo 3 chamadas de cotação (hoje 16); com Watchlist aberta por 10 min, chamadas de função da
Vercel ≤ 5 (hoje ~20 a 30); todos os testes de coerência passam.

### Fase 3: duas velocidades no app

| Passo | O que fazer                                                                                                                                                                                       | Arquivos                    |
| ----- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------- |
| 3.1   | Caminho rápido: pacote chega → atualiza `state.liveRaw` → troca na tela só os elementos marcados com `data-q="SYM"` (preço, variação, hora). Sem `rebuild()`.                                     | `app.js`, `flash.js`, views |
| 3.2   | Caminho lento: `rebuild()` no máximo a cada 60 s (`DERIVED_EVERY_MS`), ou antes se algum ativo do universo de pares andou mais de 0,15% desde o último cálculo, ou na troca de aba/modo.          | `app.js`                    |
| 3.3   | Tirar o `structuredClone` das tabelas a cada pacote: cópia de trabalho criada 1 vez por carga do histórico; o pacote só reescreve a última linha. Teste: resultado idêntico ao `overlay()` atual. | `live.js`                   |
| 3.4   | Avisos (`notifySignals`, `watchLevels`) seguem o caminho lento, exceto alerta de nível de preço, que compara direto no caminho rápido.                                                            | `app.js`, `level-alerts.js` |

Pronto quando: com a aba Fluxo aberta e CPU 4x mais lenta, nenhuma tarefa acima de 100 ms causada por pacote do
canal; teste "golden" (`npm run golden`) idêntico antes e depois; preço na tela muda em até 1 s após o pacote.

### Fase 4: abertura do app

| Passo | O que fazer                                                                                                                                                                                                                 | Arquivos                                         |
| ----- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------ |
| 4.1   | Empacotar com `esbuild` (já é dependência): `--bundle --splitting --format=esm`, entrada `assets/app.js`, saída `dist/` com hash no nome; seções pesadas (Laboratório, Radar técnico, Fluxo) por `import()` ao abrir a aba. | `scripts/build.mjs`, `vercel.json`, `index.html` |
| 4.2   | Cabeçalhos: arquivos com hash `immutable, max-age=31536000`; `index.html` `no-cache`. Remover os 132 `modulepreload` e o `?v=`.                                                                                             | `vercel.json`                                    |
| 4.3   | Service worker: código, fontes e ícones "cópia primeiro, atualiza por trás"; `data/` rede primeiro com espera de 3 s; navegação como hoje.                                                                                  | `sw.js`                                          |
| 4.4   | `flow.json` depois do primeiro desenho; abas que não usam fluxo não esperam por ele.                                                                                                                                        | `app.js`                                         |
| 4.5   | `npm run dev` continua servindo os módulos soltos (sem build) para desenvolvimento.                                                                                                                                         | `scripts/dev-server.mjs`                         |

Decisão embutida: isso quebra a regra "site estático sem build". Variável que decide: tempo de abertura em rede de
celular. Inverte se a abertura medida em 4G já for menor que 2 s (a confirmar na Fase 0, não medido aqui). Custo
de desfazer: reverter `vercel.json` e `index.html` (1 commit). Se a medição não justificar, fazer só 4.2 a 4.4.

Pronto quando: requisições na abertura ≤ 25 (hoje 153); JS baixado na aba Início ≤ 40% do total; segunda
abertura sem rede funciona; aviso "Pêndulo atualizado" continua trocando de versão.

### Fase 5: interface (UX/UI)

| Passo | O que fazer                                                                                                                                              | Achado     | Arquivos                             |
| ----- | -------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------- | ------------------------------------ |
| 5.1   | Selo único de estado: sessão + frescor + fonte; cor pelo frescor (usa a idade por ativo da central); toque abre detalhes, atrasados e "atualizar agora". | U1, U2, U3 | `app.js`, `status.js`, `styles.css`  |
| 5.2   | Faixa vermelha só para falha que afeta decisão; "preço defasado" vira contador âmbar no selo.                                                            | U3         | `checks.js`, `app.js`                |
| 5.3   | Liberar zoom; piso de 12 px (texto) e 13 px (números em tabela no celular); área de toque mínima de 40 px.                                               | U6, U7     | `index.html`, `styles.css`           |
| 5.4   | Topo compacto no celular: sem título no cabeçalho, Offshore/Onshore em 1 linha, frase da aba recolhida após 3 visitas.                                   | U4, U8     | `views.js`, `styles.css`, `state.js` |
| 5.5   | Sub-abas com degradê de "tem mais" e aba ativa centralizada.                                                                                             | U9         | `styles.css`, `events.js`            |
| 5.6   | Fluxo no celular: blocos fechados por padrão (menos dois) e conteúdo do bloco desenhado só ao abrir.                                                     | U5         | `flow-view.js`, `fold.js`            |
| 5.7   | Cartões de resumo sem corte (2 linhas) e "?" ligado ao glossário.                                                                                        | U8, U10    | `dash.js`, `help.js`                 |

Pronto quando (iPhone 13, medido pelo `perf-probe`): conteúdo da Visão geral começa antes de 35% da tela (hoje
~55%); 0 textos abaixo de 12 px; ≥ 90% dos controles com 40 px ou mais; aba Fluxo com menos de 1.500 nós de DOM
na abertura (hoje 4.535); zoom por pinça funciona.

### Ordem, esforço e ganho

| Fase | Esforço (estimado)                                                                                                                                                                                                                                                                                                                                                                                                           | Ganho principal                                                                                                                                                                                                                                                                                                                             | Depende de |
| ---- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------- |
| 0    | 0,5 dia                                                                                                                                                                                                                                                                                                                                                                                                                      | Linha de base e contadores                                                                                                                                                                                                                                                                                                                  | n/a        |
| 1    | 2 dias                                                                                                                                                                                                                                                                                                                                                                                                                       | **Implantado no Supabase em 15/11/2026**: SQL (presença, `pendulo_touch`, `pendulo_snapshot`, `stats`), função v2 (versão 7) e cron com `where exists` na presença. Teste no domingo: a função responde e pula com o mercado fechado. Pendente: medir os critérios "Pronto quando" no próximo pregão (contadores em `pendulo_quotes.stats`) | 0          |
| 2    | 3 dias                                                                                                                                                                                                                                                                                                                                                                                                                       | −70% de chamadas de função da Vercel com o app aberto                                                                                                                                                                                                                                                                                       | 1          |
| 3    | 1,5 dia                                                                                                                                                                                                                                                                                                                                                                                                                      | Fim das travadas a cada pacote                                                                                                                                                                                                                                                                                                              | 2          |
| 4    | 1,5 dia                                                                                                                                                                                                                                                                                                                                                                                                                      | Abertura com ~85% menos requisições                                                                                                                                                                                                                                                                                                         | 0          |
| 5    | 2 dias; 5.1 selo único por sessão (`sealLabel`: "Pré-mercado · ao vivo", "Mercado fechado"; cor pelo frescor; pílula "Off market" só com Off forçado no pregão); 5.4 topo compacto no celular (título fora da vista, Offshore/Onshore em 1 linha, frase da aba some após 3 visitas: conteúdo da Visão geral de ~55% para ~40% da tela, ~33% sem a frase); 5.7 cartões em 2 linhas e "?" de regime, fluxo (σ) e fora da curva | Rebaixar o botão Recarregar (U2). Exceção: texto do mapa de calor escala com o quadro                                                                                                                                                                                                                                                       | 2 (selo)   |

Estimativas de esforço são suposição minha, sem histórico de velocidade para calibrar.

### Riscos e como reconhecer

| Risco                                                                | Sinal                                                  | Resposta                                                                    |
| -------------------------------------------------------------------- | ------------------------------------------------------ | --------------------------------------------------------------------------- |
| Canal mudo por pacote delta vazio e o app cai na reserva             | "tempo real: último pacote há 90 s" com mercado aberto | Pulso de 60 s (2.3); teste dedicado.                                        |
| Ativo quente fora da lista (limite de 60)                            | Preço da Watchlist com idade > 60 s                    | Prioridade: carteira > lista aberta > painel; excedente vai na morna.       |
| Divergência de preço entre telas após a central                      | Teste de coerência falha; variação do dia diferente    | Reverter a tela migrada (1 commit por tela).                                |
| Memória da função some (instância fria) e o delta perde a referência | `seq` salta                                            | Memória vazia = pacote completo; cliente pede foto ao ver salto.            |
| Presença não gravada (rede ruim) e o robô para com o app aberto      | Canal mudo logo após abrir                             | Reserva atual (2 min) continua valendo; `pendulo_touch` com nova tentativa. |
| Empacotamento quebra o aviso de versão nova                          | App preso em versão antiga                             | Testar o fluxo "Pêndulo atualizado" antes do merge; rollback de 1 commit.   |

### Fora do escopo

Trocar de fonte de cotação (Yahoo segue principal), mudar modelo/gatilhos/aprendizado, reescrever em framework,
WebSocket por ativo. A tese deste plano deixa de valer se o Yahoo passar a bloquear a Edge Function: aí a
prioridade vira a fonte, não a cadência.

---

## Parte 4: prompt de partida para o Opus

```
Objetivo: executar docs/PLANO-OTIMIZACAO.md no repositório Pêndulo, da Fase 0 à Fase 5, em ordem, sem pedir
confirmação entre fases.

Contexto: app estático (ES modules) + funções Vercel + Supabase (Edge Function quotes-feed empurra cotações por
Realtime a cada 15 s). Leia antes: CLAUDE.md, docs/ARQUITETURA.md, docs/COERENCIA.md, docs/ON-OFF-MARKET.md e o
plano inteiro.

O que torna a tarefa difícil: (1) envolve dinheiro: a variação do dia tem de continuar igual (p / pc) em todas
as telas depois de cada migração; (2) há aparelhos com versão antiga do app no ar: o servidor novo precisa
funcionar com o cliente antigo; (3) cota grátis de Vercel e Supabase: nenhuma mudança pode aumentar chamadas.

Regras (com o porquê):
- Meça antes e depois de cada fase com scripts/perf-probe.mjs e grave em docs/PERF-BASELINE.md. Porquê: sem
  número, não há como saber se a fase ajudou ou piorou.
- Uma tela migrada por commit na Fase 2. Porquê: reverter uma tela não pode derrubar as outras.
- Lógica nova como função pura com teste. Porquê: é o padrão do projeto e o que protege os cálculos.
- Supabase só com mudança aditiva e RLS ativo; guarde a função atual como index.v1.ts. Porquê: voltar atrás em
  minutos se o canal ficar mudo no pregão.
- Não altere modelo, gatilhos, limites do aprendizado nem textos de sinais. Porquê: fora do escopo e exige
  ordem do usuário.
- Se uma medição vier diferente do critério "Pronto quando" (pior ou muito melhor), pare e explique. Porquê:
  resultado inesperado costuma ser erro de medição ou efeito colateral.
- Antes de push: npm run lint, npm run format:check, npm test; depois confirme o deploy. Porquê: CLAUDE.md.

Formato de saída ao fim de cada fase: tabela antes/depois dos critérios "Pronto quando", lista do que não foi
testado, e 3 a 5 linhas para leigo (o que mudou, como testar, risco, próximo passo).
```

---

Material técnico interno; não é recomendação de investimento.
