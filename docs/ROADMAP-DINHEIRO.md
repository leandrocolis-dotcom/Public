# Roadmap "dinheiro" (18/11/2026): medir o usuário, controlar o risco, testar só o que tem base

Pedido do usuário: "o que fazer para o app me ajudar a ganhar dinheiro, operando só ETFs americanos". Diagnóstico a
partir dos próprios estudos (`docs/ESTUDO-GATILHOS.md`, `docs/ESTUDO-MODELO-UNICO.md`): nenhum gatilho de entrada
bateu um dia qualquer, saídas só cortam queda (custando retorno) e segurar o índice ganhou de todas as proteções.
Conclusão: mais telas de sinal não viram dinheiro. As fases abaixo atacam o que ainda não era medido.

| Fase | O que                                                         | Status (18/11/2026)                      |
| ---- | ------------------------------------------------------------- | ---------------------------------------- |
| D1   | 📒 Diário de operações reais + placar contra o SPY            | Entregue (Carteira › Diário)             |
| D2   | Tamanho pelo risco + apostas independentes + exposição ao S&P | Entregue (Diário e Carteira › Risco)     |
| D3   | Estudos H9, H10, H11 (regras registradas antes)               | Script pronto; roda no Actions (`money`) |
| D4   | Custo de estrutura: retenção de dividendos e herança          | Entregue (Carteira › Risco)              |
| D5   | Congelar telas que não servem ao objetivo                     | Registrado (abaixo)                      |

## D1: Diário (`assets/journal.js` puro, `assets/journal-view.js`)

- Operação = ativo, data, preço, quantidade, stop, custos, motivo (qual tela/gatilho), nota; saída = data e preço.
- Placar: resultado líquido, **× SPY** (mesmo dinheiro, mesmas datas, fechamento do dia), acerto, ganho/perda média,
  expectativa em R (1R = distância até o stop), por motivo e por mês. Abertas marcadas pelo preço ao vivo (`quoteOf`).
- Menos de 20 operações fechadas: aviso de amostra pequena (não separa habilidade de sorte).
- Guarda em `pendulo.journal` (localStorage) e na nuvem `pendulo_journal` (uma linha por usuário, RLS; ver
  `supabase/schema.sql`). Exportar/importar JSON. Comando `DIARIO`.
- Diferença para os 👍 (`assets/trades.js`): os 👍 avaliam o MODELO (o sinal acertou?); o Diário avalia o USUÁRIO
  (o dinheiro real, com tamanho e saída, ganhou do SPY?).

## D2: risco

- `sizePosition` (journal.js): cotas = (patrimônio × risco%) ÷ (entrada − stop), teto de 20% por posição; sem stop,
  sugere 2,5 ATR (ATR aproximado por fechamentos, `closeAtr`).
- `portfolioRisk` (risk.js): `effBets` = (razão de diversificação)², apostas independentes descontada a correlação;
  `spyExposure` = beta × valor. Nota quando há muitas posições e poucas apostas.

## D3: estudos (`scripts/money-study.mjs` → `data/money-study.json`, `docs/ESTUDO-DINHEIRO.md`)

Regras e critério no cabeçalho do script (registrados antes de rodar): H9 volatilidade-alvo 16% no SPY; H10 SSO 2x só
com SPY > MM200 e vol. < 20%; H11 tendência entre 5 classes (SPY, EFA, IEF, GLD, DBC, média de 10 meses). Histórico
inteiro (cobre 2008, 2020, 2022), bootstrap em blocos + Benjamini-Hochberg. Este ambiente não alcança o Yahoo: rodar
pelo workflow `model-study.yml` com `study: money`. `--local` só testa o código.

## D4: custo de estrutura (`assets/structure-cost.js`)

Não residente sem tratado: 30% retido nos dividendos de ETF americano × ~15% num UCITS irlandês; ETF americano é
"US situs" (herança acima de US$ 60 mil, até 40%, se em nome da pessoa física). Conta educacional; depende da
estrutura (empresa offshore/trust). Dividend yield da `api/analyze`.

## D5: congelado (sem trabalho novo até o Diário ter 20 operações fechadas)

Mercados › Onshore (Brasil), Juros/curvas, Fed e Mesa ficam como estão. A tela Pares foi removida em 21/11/2026 (o motor de pares segue no `assets/engine.js`, com os avisos e o painel do par abertos a partir de Sinais de hoje). Trabalho novo só se servir a: (1) placar
do Diário, (2) controle de risco, (3) hipótese registrada antes com evidência fora da amostra.

Material educacional; não é recomendação de investimento nem orientação tributária.
