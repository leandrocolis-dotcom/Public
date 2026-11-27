# Long & Short — status por fase (27/11/2026)

| Fase                           | Situação                                                                                                                                                    | Onde                                                                         |
| ------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------- |
| 0 Descoberta                   | Feita                                                                                                                                                       | `docs/long-short/MAPEAMENTO.md`                                              |
| 1 Dados e migração             | Feita: parâmetros espelhados do JSON, cadastro de 32 ETFs, migração v1/v3→v4 na leitura, tabela `pendulo_ls` (RLS) criada em 27/11/2026, bid/ask no coletor | `assets/ls-params.js`, `ls-etfs.js`, `ls-data.js`, `supabase/long-short.sql` |
| 2 Relógio                      | Feita: sessão, marcos (pregão encurtado desloca), reset 4:00 ET, CAL-01, referência do pós                                                                  | `assets/ls-clock.js`                                                         |
| 3 Indicadores                  | Feita e conferida com 1 dia real (VWAP e ATR idênticos ao cálculo independente)                                                                             | `assets/ls-market.js`, `docs/long-short/conferencia/FASE3.md`                |
| 4 Motor                        | Feita: paridade integral com a referência + 2.000 cenários de propriedade + revisão independente (12 correções)                                             | `assets/ls-core.js`, `ls-metrics.js`, `ls-engine.js`                         |
| 5 Alertas                      | Feita: 33 alertas, dedupe 15 min, RSK-01 trava o dia                                                                                                        | `assets/ls-alerts.js`                                                        |
| 6 Design                       | Feita: 8 mockups; decisões tomadas a pedido do usuário (ver `docs/design/LONG-SHORT.md`)                                                                    | `docs/design/long-short/`                                                    |
| 7 Tela                         | Feita                                                                                                                                                       | `assets/ls-view.js`, CSS `.ls-*` em `assets/styles.css`                      |
| 8 Execução e diário            | Feita: Executei/Ignorar, parcial com saldo, idempotência, diário seguidas × ignoradas, P&L em reais pelo dólar do dia                                       | `assets/ls-book.js`                                                          |
| 9 Persistência e reconciliação | Feita: grava a cada mudança (aparelho + nuvem), reconcilia ao abrir e bloqueia compras com pendência (REC)                                                  | `assets/ls-book.js` (`reconcile`)                                            |
| 10 Modo registro               | Ferramenta pronta (relatório no Diário do dia); depende de 2 semanas de uso real                                                                            | `registerReport`                                                             |

## Limitações conhecidas (o que falta para "tudo")

- **bid/ask no canal ao vivo:** a função `quotes-feed` do Supabase ainda roda o pacote antigo; a tela busca bid/ask
  na API a cada 8 s enquanto aberta. Reimplantar `supabase/functions/quotes-feed` (index.ts + quotes.bundle.js).
- **Short real (dir −1):** a Carteira só tem posição comprada; a aposta na queda é o ETF inverso comprado.
- **Volume no pré/pós:** o Yahoo não traz; VWAP estendida sai como aproximada e rompimento só confirma no pregão.
- **bid/ask de outra sessão:** o Yahoo às vezes devolve oferta velha no pós (SQQQ bid 38,31 com o pós em 45,78
  em 27/11/2026). Meio do bid/ask a mais de 2% do preço vigente é descartado (`sanePair` em `assets/ls-input.js`).
- **Idade da cotação:** é a hora do último negócio no Yahoo; papel parado pode acionar EXE-01 sem erro do robô.
- **Diário:** fica dentro de `pendulo_ls` (a tabela `pendulo_journal` não existe no projeto Supabase).
- **Eventos macro:** agenda de alto impacto dos EUA de `api/calendar` (P2, PRE-02); balanços de ETFs não se aplicam.
