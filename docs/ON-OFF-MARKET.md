# Modo On market / Off market

Switch no topo do app (On | Off, com indicação "auto" ou "manual"). Vale para o app inteiro.

- **Automático (padrão):** On no pregão regular (9:30–16:00 Nova York); Off no pré (4:00–9:30), no pós (16:00–20:00), à noite, nos fins de semana e nos feriados da NYSE.
- **Manual:** tocar no outro modo força a escolha; tocar no modo que o automático escolheria volta ao automático. Preferência em `state.prefs.mktMode` (`auto` | `on` | `off`).

## Como o preço Off é escolhido (`assets/offmarket.js`)

1. **Futuro com proxy exato** (SPY↔ES, QQQ↔NQ, IWM↔RTY, GLD↔GC, SLV↔SI, USO↔CL, FXY↔6J…): preço implícito = base × (futuro / ajuste do futuro).
   - Base = fechamento anterior do ativo enquanto o futuro ainda não virou de sessão (antes das 18:00 NY); depois disso, o último fechamento regular.
2. **Pré/pós-mercado do próprio ativo** (ações, setores, ETFs sem futuro exato).
3. **Futuro com proxy aproximado** (setores pelo S&P/Nasdaq, TLT pelo T-bond, UUP pelo euro invertido…), só quando não há pré/pós.
4. **Último preço regular.**

O fechamento anterior (`pc`) não muda: a variação do dia continua contra o último fechamento oficial. A tabela de proxies fica em `PROXY` (fator negativo = relação inversa).

## Onde aparece

- `assets/app.js`: `rebuild()` recalcula tudo (pares, sinais, carteira, fluxo, painéis) com as cotações On ou Off, sem buscar dados de novo. No modo Off o histórico de mudanças dos pares não é gravado.
- Painel: as mesmas tabelas do On (Bolsas EUA, Juros EUA, Europa, Moedas...), com o preço Off de cada linha, a variação desde o último fechamento regular e a fonte sob o nome (futuro, pré/pós, "aberto" quando o próprio mercado do ativo está negociando, "fechado"). Juros usam o futuro do Treasury e a duration; Ibovespa e México usam o pré/pós do EWZ/EWW.
- Selo "Off market" ao lado do horário da cotação.

## Tempo real no Off (09/10/2026)

O canal `pendulo-quotes` (Edge Function `quotes-feed`) empurra o pacote a cada ~15 s também no pré e no pós-mercado, com os
campos estendidos de cada ação/ETF (`xk`, `xp`, `xt`, `xc`) e os futuros. À noite (bolsa fechada, futuros da CME abertos) o
pacote sai a cada 1 min, então o modo Off continua andando com os futuros. O app aplica cada pacote e `offQuotes()` recalcula
o preço Off na hora, sem busca por intervalo. Fim de semana: nada (futuros fechados).

## Limitações

- O Yahoo atualiza o pré/pós de cada ação na hora do último negócio: papel pouco negociado pode ficar minutos sem mudar, mesmo com o canal em tempo real.
- Pré/pós de ações tem pouco volume: sinais e pares calculados no modo Off são indicativos.
- Proxies aproximados usam fator fixo (beta aproximado), não estimado.
- Futuros da CME param das 17:00 às 18:00 e de sexta 17:00 a domingo 18:00 (Nova York).

## Fontes de cotação (07/10/2026)

1. Yahoo `quote` (principal) → 2. Yahoo `spark` (reserva) → 3. **Nasdaq** `api.nasdaq.com/api/quote/SYM/info` para ações/ETFs dos EUA ainda faltando (até 15, campo `src:"nasdaq"`).
   Testadas e descartadas (bloqueio/vazio a partir de servidor): Stooq, CBOE delayed quotes, CNBC. Futuros, índices e moedas seguem só no Yahoo.

## Gráfico 1D/5D com pré e pós (12/10/2026)

O detalhe do ativo (`assets/asset-pop.js`) busca `api/intraday?prepost=1`, que inclui as barras de 5 min do pré (4:00–9:30) e do
pós-mercado (16:00–20:00) com a sessão em `bars.s`. No gráfico, o pré aparece em azul e o pós em violeta, tracejados; o pregão
regular mantém a cor da variação. A referência continua sendo o último fechamento regular. Sinais e o gráfico Pro seguem só com o
pregão regular (sem `prepost`), para não distorcer VWAP e indicadores.

## Pré e pós-mercado nos gráficos intradiários (30/10/2026)

Como no 1D do Investing: os gráficos de 5 min mostram o horário estendido junto do pregão.

- **Quando entrar › Hoje** (`assets/pro-chart.js`): `api/intraday?prepost=1`; `splitSessions` (`assets/ta-data.js`)
  separa o regular (`e.data`, usado na análise: VWAP, abertura, níveis, plano) do estendido (`e.ext`, só desenho).
  `extBars` acrescenta o pós da véspera, o pré e o pós do dia (e, com a bolsa fechada, o pré da manhã seguinte):
  velas mais claras, volume mais fraco, faixa de fundo azul (pré) e violeta (pós) e o rótulo na legenda do ponto.
- **Painel do ativo, 1D** (`intradaySeries` em `assets/asset-pop.js`): entra também o pós da véspera; a
  referência continua o último fechamento regular.

## Rotação relativa intraday segue o switch (03/11/2026)

Fluxo › Rotação relativa, janelas intraday (`assets/rot-intraday.js`, opção `ext` de `rotationIntraday`):

- **Off market:** entram as barras de pré (4:00–9:30) e pós-mercado (16:00–20:00) e o preço estendido ao vivo (`xp`).
  A janela **Hoje** começa no pós da véspera ("ontem 18:30 (pós)": a reação ao fechamento de ontem) e vai até o pós de hoje.
  Trechos que chegam num ponto de pré/pós ficam tracejados.
- **On market:** só o pregão regular; o negócio de fechamento das 16:00 conta como fim do pregão.
- O ponto ao vivo usa o preço real do próprio ativo (`regP`/`regT` ou `xp`/`xt`), nunca o implícito pelo futuro do modo Off,
  para não misturar estimativa com negócio.
- Onshore (B3) não tem pré/pós: tudo é pregão (`sessions: false`).

## Bolsas de fora sem futuro (desde 20/11/2026)

O Yahoo só tem futuros da CME: do resto do mundo, só o Nikkei (`NKD=F`). Para as outras bolsas a regra é
**bolsa aberta → preço dela; fechada → futuro; sem futuro → ETF do país negociado em NY** (4h–20h de NY), tipo
`"cty"` em `PROXY` (`assets/offmarket.js`): Euro Stoxx 50 ← EZU, Stoxx 600 ← VGK, DAX ← EWG, FTSE ← EWU,
CAC ← EWQ, IBEX ← EWP, FTSE MIB ← EWI, Hang Seng ← EWH, Xangai/Shenzhen ← ASHR, Kospi ← EWY, Taiex ← EWT,
Nifty/Sensex ← INDA, ASX 200 ← EWA.

- Só entra se o ETF negociou DEPOIS do último negócio local (`impliedByCountryEtf`).
- Índice ≈ fechamento local anterior × (ETF agora ÷ fechamento anterior do ETF): a variação fica medida desde o
  último fechamento de NY, sem contar duas vezes a sessão local (o preço do ETF já a embute).
- Aproximado (fonte `fut~`, "~EWY hh:mm"): o ETF está em dólar (inclui o câmbio) e o pré/pós dele tem pouca
  liquidez.
- No regime, o bloco Mundo usa essa regra em qualquer sessão, inclusive no pregão de NY (a Europa fecha às
  11h30 de NY e a Ásia só abre à noite).
