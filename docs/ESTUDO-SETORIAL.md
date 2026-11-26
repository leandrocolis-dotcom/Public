# Estudo setorial (09/10/2026)

> Pedido do usuário: estudo retroativo com a lista de ativos setoriais da conta. **Não há lista setorial salva na
> nuvem** (a tabela de watchlists do Pêndulo está vazia; listas criadas só no navegador não sincronizam). Por isso
> usamos o universo setorial do app: os **46 ETFs setoriais** do Mapa de fluxo (Setores EUA, Indústrias e temas EUA,
> Setores globais). Material educacional; não é recomendação de investimento.
> Reproduzir: `node scripts/sector-study.mjs` e `node scripts/retro-study.mjs --only=<setoriais> --out=setores`.

## 1. Rotação setorial (sistema-semente da lição 17)

Regras definidas **antes** do teste (docs/ROADMAP-APRENDIZADO.md, F16): rebalanceio mensal, 0,05% de custo sobre o
giro, preços ajustados por dividendos, caixa = BIL (T-bill), 11 setores SPDR, jul/2009 a out/2026.

| Estratégia                                              |  CAGR | Volatilidade | Sharpe | Queda máxima | Calmar | Giro/ano | Tempo em caixa |
| ------------------------------------------------------- | ----: | -----------: | -----: | -----------: | -----: | -------: | -------------: |
| Top 3 em 6 meses + filtro MM200                         |  7,9% |        13,7% |   0,53 |       -21,3% |   0,37 |    9,09x |            16% |
| Top 3 em momentum 12-1 + filtro MM200                   |  8,8% |        13,7% |   0,59 |       -22,2% |   0,40 |    7,35x |            16% |
| Top 3 em 6 meses, sempre investido                      | 12,0% |        17,0% |   0,67 |       -29,6% |   0,40 |    7,37x |             0% |
| S&P com filtro MM200 (diagnóstico extra, fora do plano) | 10,1% |        12,8% |   0,71 |       -24,9% |   0,40 |    3,26x |            16% |
| 11 setores em pesos iguais                              | 13,0% |        16,2% |   0,75 |       -36,2% |   0,36 |    0,30x |             0% |
| S&P 500 (SPY) comprar e segurar                         | 14,8% |        17,0% |   0,82 |       -33,7% |   0,44 |    0,00x |             0% |

| Estratégia                                              |           2009–2015 |           2016–2020 |           2021–2026 |
| ------------------------------------------------------- | ------------------: | ------------------: | ------------------: |
| Top 3 em 6 meses + filtro MM200                         |  9,5% (Sharpe 0,71) |  8,3% (Sharpe 0,60) |  6,2% (Sharpe 0,28) |
| Top 3 em momentum 12-1 + filtro MM200                   | 11,1% (Sharpe 0,81) |  6,1% (Sharpe 0,44) |  9,1% (Sharpe 0,48) |
| Top 3 em 6 meses, sempre investido                      | 11,4% (Sharpe 0,75) | 15,4% (Sharpe 0,81) | 10,2% (Sharpe 0,48) |
| S&P com filtro MM200 (diagnóstico extra, fora do plano) | 11,6% (Sharpe 0,88) |  9,7% (Sharpe 0,73) |  9,1% (Sharpe 0,52) |
| 11 setores em pesos iguais                              | 13,8% (Sharpe 0,91) | 12,7% (Sharpe 0,68) | 12,9% (Sharpe 0,70) |
| S&P 500 (SPY) comprar e segurar                         | 14,3% (Sharpe 0,93) | 15,4% (Sharpe 0,80) | 15,3% (Sharpe 0,75) |

**Leitura:**

1. **A rotação perdeu para o S&P comprado e parado em todas as janelas.** O sistema-semente rendeu 7,9% ao ano
   contra 14,8%, com Sharpe de 0,53 contra 0,82. Ele reduz a queda máxima (−21% × −34%), mas o Calmar (retorno por
   unidade de queda) também é pior (0,37 × 0,44).
2. **O filtro da MM200 custou caro** (diagnóstico extra, fora do plano, marcado como tal): o S&P com filtro rendeu
   10,1% ao ano. Em 2009–2026 as quedas foram rápidas e com volta em V (2011, 2015/16, 2018, 2020, 2022/23): o filtro
   mensal saía perto do fundo e voltava depois da alta.
3. **Escolher os setores mais fortes também custou:** "top 3 sempre investido" (12,0%) perdeu para os 11 setores em
   pesos iguais (13,0%). O momentum entre setores, nesta amostra, não agregou valor.
4. **Momentum 12-1 foi um pouco melhor que 6 meses** (8,8% × 7,9%), mas a diferença é pequena e muda de sinal entre
   as janelas (2016–2020: 6,1% × 8,3%).
5. **Por que isso não contradiz a literatura:** a evidência forte de seguir tendência (Hurst, Ooi e Pedersen) vem de
   futuros **diversificados entre classes de ativo** (ações, juros, moedas, commodities), com vendas a descoberto e
   volatilidade-alvo. Alternar setores de ações americanas, só comprado, é outra coisa, e os dados mostram isso.

## 2. Lógicas do app em setores (estudo retroativo, 10 anos, 46 ETFs, 51 mil gatilhos)

Relatório completo: `docs/ESTUDO-RETROATIVO-SETORES.md`.

- **"Reduzir" foi aprovada** (+0,11R por dia em 443 dias, passa na correção de testes múltiplos). É o segundo universo
  em que ela se mantém positiva.
- **Nenhuma lógica de compra teve excesso positivo.** "Comprar em partes": −0,08R.
- **O filtro de vantagem não ajudou em setores** (bloqueadas +0,00R × liberadas −0,03R).

## O que mudou no app

- **Card "Regime do mercado" (aba Decisões):** a rotação deixou de ser apresentada como estratégia ("comprar os 3
  setores...") e virou "força relativa dos setores", com o resultado do teste ao lado.
- **Lição 17 (Aprenda):** "Por onde começar" virou "Teste antes de usar", com os números e a lição de que todo sistema
  precisa bater o comprar e segurar ajustado ao risco.
- **Nada mudou no motor de decisão** (modo sombra).

## Recomendações (dependem do usuário)

1. Para a parte de ações, a referência a bater é o **S&P comprado e parado**. Nenhuma regra técnica testada aqui bateu.
2. A única lógica com evidência consistente é **reduzir o que perde força relativa** ("Reduzir" da Decisão do trader).
   Vale acompanhar no diário ao vivo antes de dar mais peso a ela.
3. Para testar trend following "de verdade", o caminho seria um conjunto diversificado de classes (ações, Treasuries,
   ouro, commodities, dólar) com volatilidade-alvo. Fica como próximo estudo.
4. Se existe uma lista setorial sua só no navegador, faça login no app para sincronizar; o estudo semanal passa a
   incluí-la automaticamente.
