# Watchlist

Mercados › Offshore › **Watchlist** e Mercados › Onshore › **Watchlist** (6ª tela dos dois lados, as mesmas
listas). Listas em abas como no Investing.com, com a decisão do app e a velocidade do fluxo de cada ativo.

## Como usar

1. **＋ Nova lista** cria uma aba (Renomear / Excluir lista no topo do cartão). Sempre existe ao menos uma.
2. **Colar ativos**: cole os tickers soltos (`AAPL, MSFT NVDA; PETR4`) ou a tabela da watchlist do Investing
   copiada (Name, Symbol, Last, High, Low, Chg., Chg. %, Vol., Time). Também aceita uma tabela própria com
   Ticker / Nome / Nota, ou "TICKER nota" por linha. **Ler colagem** mostra a prévia; depois
   **Adicionar** (junta) ou **Substituir a lista**.
3. Toque numa linha para abrir a análise completa; ✕ tira o ativo da lista. Cabeçalhos ordenam; a caixa
   "Filtrar…" filtra.

Conversões: códigos de índice do Investing viram os do Yahoo (VIX → ^VIX, SPX → ^GSPC, NDX → ^NDX, DJI → ^DJI,
RUT → ^RUT); ações da B3 sem sufixo ganham `.SA` (PETR4 → PETR4.SA); classe de ação BRK.B → BRK-B. Sem limite de ativos
por lista (até 8 listas).

## Colunas

| Coluna                                    | Fonte                                                                                                                                                                                                                                        |
| ----------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Preço, Dia %                              | cotação ao vivo (`quoteOf`; fora do canal, `api/quotes?only=1&extra=` a cada 1 min); dia = p / pc                                                                                                                                            |
| Quadrante, Velocidade, Força, Momento     | mesma conta da Rotação relativa (Fluxo), cada ativo contra o seu benchmark                                                                                                                                                                   |
| Decisão do trader, Nota, Confiança, Setor | `api/analyze` (como a aba Análise; dados até 10 min)                                                                                                                                                                                         |
| Contra                                    | benchmark: S&P 500 (SPY) ou Ibovespa (ações da B3)                                                                                                                                                                                           |
| Sessão atual (Pré, Pregão ou Pós)         | só a coluna da sessão que está acontecendo agora em NY (`currentSession`: pré 4h–9h30, pregão até 16h/13h, pós até 20h; fora do horário, fim de semana e feriado = último pós, sem ●); velocidade em barras de 5 min (`latestSessionSpeeds`) |

Velocidade (ver `docs/VELOCIDADE-FLUXO.md`): janelas **Hoje** e **5 dias** pelas barras intraday
(`api/intraday`, pré/pós seguem o switch On/Off); **8 sem** e **3 meses** pelo diário (`dailyTail`: MM10/MM50 da
razão ativo/benchmark, igual ao Fluxo). O "ritmo típico" é o dos ativos da própria lista. B3 no diário usa o
BOVA11 como Ibovespa (o índice não tem histórico na `api/analyze`).

Código: `assets/watchlist.js` (puro: parser, listas, `dailyTail`, testes em `tests/watchlist.test.js`) e
`assets/watch-view.js` (tela e cargas). São as MESMAS listas da aba Sinais de hoje (`prefs.watchlists` = `[{ id, name, syms, meta? }]`; `meta` guarda nome e nota colados), salvas no navegador e na nuvem (`pendulo_watchlists`, que o treino diário do Simulador também lê). A aba ativa fica em `prefs.watchActive`. Material educacional; não é recomendação de investimento.

## Abertura do pregão (06/11/2026)

No modo On market a janela "Hoje" só usa barras do pregão em pontos de 30 min: entre 9h30 e ~10h de NY havia 1 ponto e a Watchlist e o Fluxo ficavam sem quadrante, velocidade, força e momento. Agora, com menos de 4 pontos no dia, a janela completa com o fim do pregão anterior ("ontem 15:30…") (`MIN_PTS` em `assets/rot-intraday.js`).

## Filtros por coluna (11/11/2026)

Chips acima da tabela: **Quadrante** (Liderando, Ganhando força, Perdendo força, Atrasado), **Velocidade** (muito rápido, rápido, normal, lento) e **Momento** (Acelerando = momento > 0, Freando = momento < 0). Dentro de um grupo vale qualquer um dos marcados (OU); entre grupos, todos (E). Ativo sem o dado da coluna filtrada fica de fora. Estado em `prefs.watchFilter` (`normFilter`, `toggleFilter`, `passFilter` em `assets/watchlist.js`, puros). O clique no cabeçalho continua ordenando.
