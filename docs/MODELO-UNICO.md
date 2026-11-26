# Modelo único do Pêndulo (v1, proposta de 12/10/2026)

> Scripts citados aqui e removidos do repo em 21/11/2026 (estudo encerrado; conclusões abaixo valem): `combo-study.mjs`, `spy-guard-study.mjs`, `trend-study.mjs`, `triggers-study.mjs`. Para rodar de novo: `git show a3845cf:scripts/<nome>.mjs > scripts/<nome>.mjs`.

> Substitui a seção 5 de `docs/ESTUDO-MODELOS-SINAIS-2.md`. Junta em **uma só máquina de decisão** o que as pesquisas
> externas (`ESTUDO-FERRAMENTAS-SINAIS.md`, `ESTUDO-MODELOS-SINAIS-2.md`) e as medições do próprio app
> (`ESTUDO-GATILHOS.md`, `ESTUDO-TENDENCIA.md`, `estudo-conclusoes.md`, `ESTUDO-RETROATIVO*.md`) sustentam.
> **É especificação para avaliar, não está aplicada:** nenhuma tela, limite do aprendizado ou aba Decisões muda sem ordem
> do usuário (`CLAUDE.md`). Material educacional; não é recomendação de investimento.

## 1. Objetivo e princípio

Objetivo (`docs/OBJETIVO.md`): **poucos gatilhos confiáveis** para (1) ganhar dinheiro ao entrar e (2) deixar de perder
quando já alocado. Comparação sempre em dinheiro absoluto, contra a alternativa real: caixa e **segurar o índice**.

**Princípio que sai das evidências:** o que sobrevive nas duas fontes (literatura e medição própria) é
**tendência longa conferida em ritmo lento** (fim do mês). Ela serve para **cair menos**, não para render mais. Regras de
curto prazo e "timing de recuo" não bateram um dia qualquer. Logo o modelo é um **seguro + seletor**, não um caçador de
topo e fundo.

## 2. O que a evidência permite e o que não permite

| Afirmação                                                    | Evidência (app)                                                     | Evidência (externa)                               | Status no modelo                        |
| ------------------------------------------------------------ | ------------------------------------------------------------------- | ------------------------------------------------- | --------------------------------------- |
| Sair quando o índice fecha o mês abaixo da MM200 reduz queda | SPY 33 anos: queda −24% × −55%, retorno 10,7% × 10,9% a.a.          | Faber (−46% → <10%), Dual Momentum                | **Núcleo** (camada 1 e 4)               |
| Esse seguro custa caro em quedas rápidas com volta em V      | 10 anos: 9,5% × 15,5% a.a.                                          | Faber 2018: perdeu em 6 de 8 anos                 | **Declarado ao usuário** como custo     |
| Momentum 12-1 escolhe melhor dentro do universo              | Top 20%: 11,3% × 9,2% a.a. (t 0,8 em 20 pregões, sem significância) | Dual Momentum, TSMOM, SCTR, IBD RS                | **Candidato** (camada 2), em observação |
| Comprar recuo/"timing" ganha                                 | **Não**: −0,19R, pior na baixa                                      | Connors: acerto 71%, mas perde do buy and hold    | **Fora** do modelo                      |
| Rompimento de máxima (55 dias) ganha em ETFs                 | **Não** (−0,41% de excesso)                                         | Tartarugas: funcionava em futuros diversificados  | **Fora**                                |
| Inverso após sinal de saída ganha                            | **Não** (−0,4% a −1,7%)                                             | —                                                 | **Fora**                                |
| "Reduzir" (Decisão do trader) tem vantagem                   | +0,10R em 487 dias, passa em testes múltiplos                       | Saída por stop/catraca é regra comum              | **Mantém** como alerta (camada 4)       |
| Tendência multiclasse protege em 2008/2022                   | +7,0% e +7,3% (corr. 0,02 com S&P), retorno baixo                   | TSMOM (mas parte vem da escala por volatilidade)  | **Complemento** 10–20%, fora do núcleo  |
| Tamanho pela volatilidade ajuda                              | Não medido isolado                                                  | Tartarugas, TSMOM (críticas: é o grosso do ganho) | **Hipótese H5** a testar                |

Conclusão honesta: **nenhuma regra de entrada bateu o S&P 500 em dinheiro em 10 anos**. O modelo não promete lucro
extra na entrada; promete **perder menos** e **escolher melhor entre alternativas**.

## 3. Arquitetura: cinco camadas, uma pergunta cada

```
CAMADA 1  Regime do mercado   → posso ter risco agora?           (liga/desliga entradas)
CAMADA 2  Seleção             → qual ativo entre os candidatos?   (top 20% por força)
CAMADA 3  Entrada             → como e quanto comprar?            (mensal, tamanho por risco)
CAMADA 4  Proteção/saída      → quando reduzir ou sair?           (stop que só sobe + tendência)
CAMADA 5  Validação           → o gatilho merece existir?         (dinheiro, regime, testes múltiplos, ao vivo)
```

### Camada 1: regime (liga/desliga)

- **Referência:** SPY (EUA); IBOV/BOVA11 para ativos da B3.
- **Regra:** no **último pregão do mês**, `fechamento > MM200` → regime **LIGADO**; senão **DESLIGADO**. Só muda no
  fim do mês (a versão diária vendeu perto do fundo; a mensal foi a melhor em 33 anos).
- **Efeito:** DESLIGADO = nenhum sinal novo de entrada; ativos já alocados seguem as regras da camada 4.
- Sem faixa de histerese na v1 (a faixa de 2% ficou pior no Covid). Reavaliar só se o estudo H1 pedir.

### Camada 2: seleção (qual ativo)

- **Score de força (estilo SCTR, pesos públicos 60/30/10):**
  - longo prazo 60%: distância da MME200 (30%) + retorno de 125 pregões (30%)
  - médio prazo 30%: distância da MME50 (15%) + retorno de 20 pregões (15%)
  - curto prazo 10%: inclinação do histograma PPO (5%) + RSI (5%)
- **Alternativa medida no app:** momentum 12-1 (retorno de 12 meses ignorando o último mês). H2 compara os dois.
- Cada componente vira **percentil dentro do universo** do usuário (ETFs com ETFs, ações com ações: o tipo de ativo
  inverte resultados, `ESTUDO-UNIVERSO-SETORES.md`).
- **Candidato** = top 20% do score **e** fechamento do ativo > própria MM200 (momentum absoluto, como no Dual Momentum).
- **Rótulos de armadilha** (só informativos): barato sem momentum = "armadilha de valor"; forte e esticado = "perseguição".

### Camada 3: entrada

- **Quando:** só se regime LIGADO e ativo candidato; avaliação **mensal** (fim do mês). Sem gatilho de recuo, sem rompimento.
- **Quanto (risco fixo):** `quantidade = (patrimônio × risco_por_posição) ÷ (2,5 × ATR20)`. Risco por posição padrão
  **1%** do patrimônio (mesmo 2,5 ATR que o simulador já usa). Teto de posição por ativo e por classe definido pelo usuário.
- **Núcleo-satélite (hipótese H6):** núcleo = índice (SPY/IVV/BOVA11) sob a camada 1; satélite = candidatos da camada 2.
  Se o satélite não bater o núcleo protegido, o satélite cai para zero e fica só o núcleo.

### Camada 4: proteção e saída (já alocado)

1. **Stop inicial:** 2,5 × ATR abaixo da entrada.
2. **Catraca:** o stop **só sobe** (mínimo das últimas N máximas − 3 × ATR22, estilo Chandelier). Nunca desce.
3. **Saída de tendência:** fechamento do mês do **ativo** abaixo da MM200 → reduzir/zerar no mês seguinte (Faber).
4. **"Reduzir" da Decisão do trader:** mantém-se como **alerta** (única lógica com vantagem medida), não como ordem.
5. **Regime DESLIGADO:** nenhuma compra nova; posições existentes continuam sob 1–3.
6. **Caixa:** em T-bill/renda fixa curta (o estudo mediu com juros; sem juros o custo do seguro é maior).
7. **Imposto (Brasil):** vendas realizam ganho (15% em renda variável comum). **Medir antes de recomendar giro**; o
   custo fiscal pode apagar o benefício da saída mensal (ver H7).

### Camada 5: validação (quem manda no modelo)

Um gatilho só vai para a tela de decisão se cumprir **todos**:

1. Resultado em **dinheiro e queda máxima** contra segurar o índice, líquido de custos (0,05% por perna) e com caixa rendendo.
2. Funciona no **regime de baixa** e no de alta (não pode só funcionar em um).
3. Passa na **correção de testes múltiplos** (Benjamini-Hochberg do learner v2).
4. **Fora da amostra**: diário ao vivo (60+ pregões) confirma. Antes disso, fica em **modo sombra**.
5. Regra e critério **registrados antes de rodar**; se piorar, reverte.

## 4. Máquina de estados por ativo

```
        regime LIGADO + candidato (fim do mês)
FORA ───────────────────────────────────────────▶ ALOCADO
 ▲                                                   │
 │  stop atingido / MM200 do ativo perdida (mês)     │ "Reduzir" do trader, ou regime DESLIGADO
 └───────────────────────────────────────────────────┤ + ativo abaixo da MM200
                                                      ▼
                                                  REDUZINDO ──▶ FORA
```

Saídas visíveis ao usuário: **ENTRAR** (candidato, regime ligado), **MANTER**, **REDUZIR** (alerta), **SAIR** (stop/MM200)
e **AGUARDAR** (regime desligado ou fora do top 20%). Cada estado mostra o **porquê** (qual camada) e o
**histórico medido** da regra.

## 5. Mapeamento para o que já existe no código

| Peça do modelo                 | Já existe                                                             | Lacuna                                                       |
| ------------------------------ | --------------------------------------------------------------------- | ------------------------------------------------------------ |
| Regime SPY × MM200 mensal      | `scripts/spy-guard-study.mjs`; sinal `lost200` em `assets/signals.js` | Versão mensal na tela (proposta na aba Carteira, não criada) |
| Stop 2,5 ATR, R, custo 0,05%   | `retro-study.mjs`, `triggers-study.mjs`, simulador                    | Catraca (stop que só sobe) ainda não é regra medida          |
| Momentum 12-1                  | `triggers-study.mjs` (E4), `combo-study.mjs`                          | Score 60/30/10 estilo SCTR não existe                        |
| "Reduzir"                      | `assets/decision.js` (faixa `reduce`)                                 | —                                                            |
| Tendência multiclasse          | `scripts/trend-study.mjs`                                             | Fora do núcleo; só documentação                              |
| Validação (BH, sombra, diário) | `assets/learner.js`, `train-model.mjs`, `model-journal.json`          | Incluir as hipóteses H1–H7 como novos gatilhos medidos       |
| Tamanho por volatilidade       | R com ATR já é a unidade do app                                       | Pesos por risco igual não testados isolados                  |

## 6. Hipóteses a testar (ordem de valor; critério fixado antes de rodar)

Cada uma usa 40 ETFs do Pêndulo, 10 anos, custo 0,05% por perna, caixa a T-bill, por regime, e é comparada com
**segurar SPY** e **SPY + MM200 mensal**. Aprovada só se atender a camada 5.

| ID  | Hipótese                                                                                       | Métrica de aprovação                                                          | Se reprovar                             |
| --- | ---------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------- | --------------------------------------- |
| H1  | Catraca (stop que só sobe) + MM200 mensal do ativo corta a pior queda mais que stop fixo de 8% | Queda máxima menor e retorno ≥ stop fixo − 1 p.p. a.a.                        | Manter stop fixo 2,5 ATR                |
| H2  | Score 60/30/10 (SCTR) ordena o excesso melhor que momentum 12-1                                | Correlação de rank com o excesso em 20 e 60 pregões > a do 12-1 e BH aprovado | Ficar com 12-1                          |
| H3  | Top 20% (H2) + regime mensal bate "SPY + MM200 mensal" em retorno por queda máxima             | Retorno/queda máxima maior em 10 anos e em baixa, sem piorar na alta          | Núcleo = índice protegido, sem satélite |
| H4  | Satélite só entra se H3 aprovada                                                               | (depende de H3)                                                               | —                                       |
| H5  | Risco igual por ativo (peso ∝ 1/ATR) supera pesos iguais                                       | Sharpe e queda máxima melhores, custo de giro incluído                        | Pesos iguais                            |
| H6  | Núcleo-satélite 70/30 supera 100% satélite e 100% núcleo em retorno ajustado ao risco          | Sharpe maior que ambos                                                        | Só núcleo                               |
| H7  | Brasil: repetir H1 e H3 com BOVA11/B3 e **imposto de 15%** sobre a venda                       | Vantagem líquida de imposto > 0                                               | Não recomendar giro mensal na B3        |

Cada rodada vira `docs/ESTUDO-*.md` com a regra registrada **antes**, os resultados e a decisão (aprovar, observar,
reverter). Nada vai para a aba Decisões sem ordem do usuário.

## 7. O que ficou de fora de propósito (e por quê)

- **Votação de indicadores tipo TradingView:** 26 votos correlacionados não são 26 evidências, e o placar técnico não
  ordenou resultado (`ESTUDO-GATILHOS` E1).
- **Padrões gráficos, Raindrop, cavas e alças:** sem backtest público; difíceis de testar sem viés.
- **Scores proprietários (Zacks, Danelfin, Tickeron):** pesos e retornos autodeclarados; não replicáveis. Servem de ideia
  de **apresentação** (probabilidade calibrada, histórico de acerto visível, explicação por fator), não de sinal.
- **Fundamentalistas (Piotroski, Magic Formula, Graham/Bazin):** valem para **ações**, na aba Valor; não para ETFs. Entram
  como filtro de qualidade do satélite de ações, não como gatilho de timing.
- **Inversos e alavancados como sinal:** perdem (decaimento + sinais tardios).

## 8. Riscos conhecidos do modelo

- **Dependência do período:** 10 anos de alta do S&P 500 fazem o seguro parecer caro; 33 anos mostram que ele paga em
  baixas longas. O modelo é para quem prioriza **não passar por −50%**, não para quem quer o máximo de retorno.
- **Custo de oportunidade em V:** quedas rápidas com volta rápida (2018, Covid, 2025) geram venda perto do fundo.
- **Poucos dados:** mês a mês são ~120 observações em 10 anos; a significância das hipóteses será fraca. Por isso o
  diário ao vivo é obrigatório antes de aplicar.
- **Fontes externas secundárias:** parte dos limiares externos (Minervini 25% × 30%, Tartarugas saída 10 × 15 dias) diverge
  entre fontes; usamos só o que o próprio app medir.
- Não é recomendação de investimento.
