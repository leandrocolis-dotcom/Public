# Trend following multiclasse (09/10/2026)

> Scripts citados aqui e removidos do repo em 21/11/2026 (estudo encerrado; conclusões abaixo valem): `trend-study.mjs`. Para rodar de novo: `git show a3845cf:scripts/<nome>.mjs > scripts/<nome>.mjs`.

> Reproduzir: `node scripts/trend-study.mjs` → `data/trend-study.json`. Regras registradas antes do teste
> (docs/ROADMAP-APRENDIZADO.md, F21). Material educacional; não é recomendação de investimento.

**Método (como em Moskowitz, Ooi e Pedersen, 2012):** 8 ETFs de classes diferentes (SPY, EFA, EEM, IEF, TLT, GLD, DBC,
UUP). Todo fim de mês, cada ativo fica comprado se subiu nos últimos 12 meses e vendido se caiu. O tamanho de cada
posição mira 10% de volatilidade ao ano (vol de 60 dias), com risco igual entre os ativos, alavancagem máxima de 3x,
0,05% de custo no giro e caixa rendendo T-bill. Período: jun/2008 a out/2026 (limitado pelo histórico do DBC e do UUP).

| Estratégia                                 |  CAGR | Volatilidade |  Sharpe* | Queda máxima | Correlação c/ S&P | 2008 (jun/08–mar/09) |  Covid |      2022 |
| ------------------------------------------ | ----: | -----------: | -------: | -----------: | ----------------: | -------------------: | -----: | --------: |
| Tendência multiclasse (comprado e vendido) |  2,8% |         5,3% |     0,55 |   **−10,8%** |          **0,02** |            **+7,0%** |  −0,2% | **+7,3%** |
| Tendência multiclasse (só comprado)        |  3,6% |         4,1% | **0,89** |    **−7,4%** |              0,37 |                +1,0% |  −4,3% |     +1,8% |
| 60/40 (SPY/IEF)                            |  8,7% |        11,1% |     0,81 |       −28,8% |              0,97 |               −27,4% | −18,9% |    −16,6% |
| S&P 500 comprar e segurar                  | 12,4% |        19,7% |     0,69 |       −47,2% |              1,00 |               −46,0% | −33,7% |    −18,6% |

\*Sharpe simplificado (retorno ÷ volatilidade, sem descontar o T-bill), igual para todas.

## Leitura

1. **Confirma o que a pesquisa diz, não o que o marketing promete.** Tendência multiclasse **não bate a bolsa em
   retorno** (2,8% a 3,6% × 12,4% ao ano), mas tem **correlação quase zero com o S&P** e **ganhou exatamente quando a
   bolsa e o 60/40 mais perderam**: +7,0% em 2008 e +7,3% em 2022, quando ações e títulos caíram juntos.
2. **O papel é de seguro de cauda, não de motor de retorno.** É o oposto do que vimos nas regras do app (rotação
   setorial, filtro MM200), que reduziam o retorno sem proteger de verdade.
3. **O retorno baixo vem do risco baixo:** com 8 ativos a 10% cada e correlações baixas, a carteira ficou com só 5% de
   volatilidade. Fundos reais miram 10% a 15% para a carteira inteira (cerca de 2x a 3x este nível). Escalar o risco
   escala o retorno, mas também os custos de alavancagem, que este teste simplifica.
4. **A versão só comprada** teve o melhor Sharpe (0,89) e a menor queda (−7,4%), mas protege menos nas crises, porque
   não ganha com as quedas.
5. **Limitações:** só 8 ETFs (os fundos usam 50 a 100 futuros); o histórico começa em jun/2008 e pega só parte da crise
   de 2008; vender ETFs a descoberto tem custo de aluguel não modelado.

## Como usar (educacional)

Como **complemento** de uma carteira de ações (ex.: 10% a 20%), não como substituto. Em 2008 e 2022, essa fatia teria
compensado parte da queda. Na prática, o acesso mais simples são fundos de managed futures listados nos EUA (ex.: DBMF,
KMLM, CTA) ou UCITS equivalentes: avaliar taxa, histórico e tributação antes.
