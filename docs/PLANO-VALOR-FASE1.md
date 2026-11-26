# Plano: aba "Valor" (Fase 1 da análise fundamentalista)

Documento de continuidade. Quem pegar o trabalho no meio (outra sessão ou outra conta) deve ler este arquivo, depois `docs/ANALISE-FUNDAMENTALISTA.md`, e seguir o checklist do fim. Branch: `feat/valor-fase1`.

## Objetivo

Uma aba **Valor** com 5 cards (bolsa EUA, crédito high yield, crédito emergente, Treasuries, ouro). Cada card mostra um placar de 0 a 100 (barato, neutro ou caro), a métrica, o percentil histórico e uma frase simples. Horizonte declarado em todos os cards: valuation explica retorno de 5 a 10 anos, não de semanas. Material educacional.

## Regra de dados: reaproveitar antes de chamar

| Métrica                          | Fonte                                | Já existe no app?            |
| -------------------------------- | ------------------------------------ | ---------------------------- |
| Juro nominal 10a e 3m (curva)    | `data/prices.json` (`US10Y`, `US3M`) | **Sim**: zero chamadas novas |
| Preço de GLD, TLT, HYG, EMB, SPY | `data/prices.json`                   | **Sim**: zero chamadas novas |
| Juro real 10a (TIPS)             | FRED `DFII10`                        | Não: 1 chamada/dia           |
| Inflação implícita 10a           | FRED `T10YIE`                        | Não: 1 chamada/dia           |
| Spread high yield (OAS)          | FRED `BAMLH0A0HYM2`                  | Não: 1 chamada/dia           |
| Spread crédito emergente (OAS)   | FRED `BAMLEMCBPIOAS`                 | Não: 1 chamada/dia           |
| P/L e dividend yield do SPY      | Yahoo (`yfinance` `.info`)           | Não: 1 chamada/dia           |

Total: **5 chamadas por dia**, só no fechamento (cron `20 22 * * 1-5` e botão manual), nunca a cada 30 min. Nada é buscado pelo navegador: a página só lê `data/fundamentals.json`.

Descartado de propósito nesta fase: CAPE de Shiller (planilha de Yale com formato instável; fica para a Fase 1b) e P/L de cada ETF (Fase 2).

**Achados na implementação (07/10/2026):**

- O FRED derruba a conexão quando o User-Agent se declara robô (`compatible; ...`). O script usa o agente padrão do `requests`.
- As séries ICE (`BAMLH0A0HYM2`, `BAMLEMCBPIOAS`) só trazem **3 anos** no FRED (restrição de licença). O script **soma** o baixado ao que já está salvo, então o histórico cresce a cada dia. O card mostra "percentil de N anos" com o N real.
- `DFII10` e `T10YIE` trazem desde 2006.

Testado em 07/10/2026: `https://fred.stlouisfed.org/graph/fredgraph.csv?id=DFII10&cosd=AAAA-MM-DD` devolve CSV sem chave (várias séries num só pedido devolvem ZIP, por isso um pedido por série). `yf.Ticker("SPY").info` devolve `trailingPE` e `dividendYield` (em %).

## Arquivo `data/fundamentals.json`

```json
{
  "meta": { "updated_at": "2026-10-07", "source": "FRED, Yahoo Finance" },
  "fred": { "DFII10": { "dates": ["2006-01-06", "..."], "values": [1.9, "..."] }, "...": {} },
  "spy": { "dates": ["2026-10-07"], "pe": [24.6], "dy": [0.99] }
}
```

- FRED: histórico desde 2006 amostrado **semanal** (último dado de cada semana) + o último dia, para o arquivo ficar pequeno (~1.000 pontos por série).
- `spy`: um ponto por dia, **acumulado** (o script lê o arquivo anterior e acrescenta). Não há histórico grátis de P/L, então o percentil do prêmio de risco só fica útil com o tempo; até lá o card usa faixas fixas de referência.
- Se uma fonte falhar, o script mantém a série anterior (nunca grava vazio).

## Cálculos (`assets/fa.js`, funções puras, testes em `tests/fa.test.js`)

- `percentile(arr, x)`: fração dos valores ≤ x (0–1).
- **Bolsa EUA (SPY)**: `EY = 100/PE`; `ERP = EY − DFII10`. Placar por faixas: ERP ≥ 4 → 85 (barato); 2–4 → 50; ≤ 1 → 15 (caro), interpolação linear entre os pontos. Quando houver ≥ 500 pontos de histórico, passa a usar o percentil.
- **Crédito HY (HYG)**: placar = percentil do OAS desde 2006 × 100 (spread alto = barato).
- **Crédito emergente (EMB)**: idem com `BAMLEMCBPIOAS`.
- **Treasuries (TLT)**: placar = 0,7 × percentil do juro real + 0,3 × percentil da inclinação `US10Y − US3M` (curva positiva paga quem alonga).
- **Ouro (GLD)**: regressão semanal `ln(GLD) = a + b × DFII10` na janela comum; resíduo atual em z-score; placar = `50 − 15 × z` limitado a 0–100 (resíduo alto = ouro caro para o juro real).
- Rótulo: ≥ 70 "Barato", ≤ 30 "Caro", entre os dois "Neutro".

## Interface

- `assets/state.js`: aba `["value", "Valor"]` entre "Mapa de fluxo" e "Pêndulo".
- `assets/value-view.js`: `viewValue()` renderiza os cards (reaproveita classes `card`, `tag buy/sell/neutral`).
- `assets/feeds.js`: `loadFundamentals()` lê `data/fundamentals.json` uma vez (com fallback "sem dados").
- Rodapé da aba: horizonte de 5–10 anos, fontes e aviso educacional.

## Checklist

- [x] 1. Este plano commitado
- [x] 2. `scripts/update_fundamentals.py` + primeira geração de `data/fundamentals.json`
- [x] 3. Workflow: passo do script só no fechamento/manual; `git add data/fundamentals.json`
- [x] 4. `assets/fa.js` + `tests/fa.test.js`
- [x] 5. `loadFundamentals` + aba Valor (`value-view.js`, `state.js`, `views.js`)
- [ ] 6. (Opcional) validar `data/fundamentals.json` em `scripts/verify-data.mjs`. Não feito: o arquivo é opcional e a aba já mostra "sem dado" quando falta
- [x] 7. `npm run lint`, `npm run format:check`, `npm test` verdes; conferir no navegador
- [x] 8. README e `docs/ANALISE-FUNDAMENTALISTA.md` apontando para a aba
- [ ] 9. PR

## Leitura em 07/10/2026 (primeira geração)

SPY caro (prêmio de risco de 1,1%), HY neutro (57), emergente neutro (32), Treasuries baratos (juro real de 2,95%, máximo de 20 anos), ouro com relação quebrada (sobe junto com o juro real em 2022–2026).

## Próximas fases

- 1b: CAPE de Shiller (retorno esperado de 10 anos).
- 2: P/L e dividend yield de cada ETF de ações, desconto vs. SPY.
- 3: coluna "valor relativo" no ranking do Pêndulo e matriz momentum × valor.
