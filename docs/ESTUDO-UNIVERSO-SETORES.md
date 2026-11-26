# Estudo do "Universo de Setores" (09/10/2026)

> Lista enviada pelo usuário ("Universo de Setores — Vencedores Relativos e ETFs", salva em
> `data/universo-setores.json`): 104 rótulos, 510 tickers. Estudados **508** (CLDL e MMC sem dados no Yahoo).
> Reproduzir: `node scripts/retro-study.mjs --out=universo --groups=data/universo-setores-grupos.json --only=<tickers>`.
> Relatório automático por lógica: `docs/ESTUDO-RETROATIVO-UNIVERSO.md`. Material educacional; não é recomendação.

## Amostra e método

- 10 anos de histórico (ou o que existir), out/2017 a out/2026, **502.697 gatilhos encerrados**, refeitos pregão a
  pregão sem olhar o futuro (Decisão do trader, sinais de curto prazo e níveis), com as mesmas regras do diário.
- Medida: resultado em R (stop de 2,5 ATR, 0,05% de custo por perna) no horizonte da lógica, **em excesso sobre a média
  dos 508 ativos** no mesmo dia. Ativos com risco menor que 1% do preço (T-bills, flutuantes) ficam fora da medida em R.
- Tipos: 156 ETFs 1x, 75 alavancados, 54 inversos, 220 ações individuais. Blocos conforme a lista do usuário.
- Recortes por tipo e bloco são **exploratórios** (sem correção de testes múltiplos entre eles). Leia-os como pistas.

## 1. Resultado geral (todas as lógicas, 508 ativos)

- **"Reduzir" aprovada de novo** (+0,06R por dia em 1.577 dias, passa na correção de testes múltiplos). É o quarto
  universo em que ela se mantém positiva.
- Todas as outras lógicas que mandam operar ficaram entre −0,05R e +0,02R: sem vantagem.
- **Filtro de vantagem:** não ordenou o resultado (bloqueadas −0,02R × liberadas −0,00R; nota A −0,00R, B −0,06R,
  C +0,11R).

## 2. O tipo de ativo inverte o resultado (achado principal)

Excesso em R por dia da Decisão do trader (✓ = faixa de 90% acima de zero; ✗ = abaixo):

| Decisão                      |      ETF 1x | Alavancado |     Inverso | Ação individual |
| ---------------------------- | ----------: | ---------: | ----------: | --------------: |
| Comprar                      |     −0,05 ✗ |    −0,05 ✗ |     −0,21 ✗ |     **+0,04 ✓** |
| Comprar em partes / no recuo |     −0,17 ✗ |      −0,02 |     −0,28 ✗ |     **+0,08 ✓** |
| Reduzir                      | **+0,19 ✓** |      +0,02 | **+0,29 ✓** |         −0,07 ✗ |
| Vender / evitar              |       +0,03 |      −0,02 | **+0,28 ✓** |         −0,09 ✗ |

**Leitura:**

1. **Em ETFs, a técnica do app acerta ao reduzir e erra ao comprar.** Comprar o ETF "que está bem no gráfico" perdeu
   para a média; sair do que perde força ganhou.
2. **Em ações individuais, é o contrário: as compras técnicas funcionaram e as vendas atrapalharam.** Bate com a
   literatura: o momentum de Jegadeesh e Titman é um efeito de **ações**. Vender uma ação forte cedo demais custa caro.
3. **Inversos: comprar foi sempre ruim** (−0,21R a −0,28R). O decaimento e a alta do mercado jogam contra. Isso valida a
   marca de "decaimento" do filtro de vantagem. Vender ou reduzir um inverso funcionou (+0,28R).
4. **Alavancados: quase tudo perto de zero.** Medidos em R (risco do próprio alavancado), as regras não têm vantagem nem
   desvantagem: o alavancado só amplia o que o ativo de referência faz.

## 3. Por bloco (exploratório)

| Bloco                               |         Compras |      Vendas | Destaque                                                                 |
| ----------------------------------- | --------------: | ----------: | ------------------------------------------------------------------------ |
| Cripto                              |     **+0,10 ✓** |       −0,03 | Única área em que comprar funcionou com folga (Decisão "comprar" +0,17R) |
| Inteligência artificial             |     **+0,02 ✓** |     −0,02 ✗ | Comprar força em IA funcionou; vender cedo atrapalhou                    |
| Tecnologia (XLK, VGT e alavancados) |           +0,00 | **+0,10 ✓** | Reduzir na fraqueza ajudou                                               |
| Juros / renda fixa                  |         −0,28 ✗ | **+0,16 ✓** | Ciclo de alta de juros 2021–2023: vender duration ganhou                 |
| Mercado amplo                       |         −0,08 ✗ | **+0,04 ✓** | Igual aos ETFs em geral                                                  |
| Commodities                         |         −0,06 ✗ | **+0,05 ✓** | Idem                                                                     |
| Consumo básico, Saúde, Imobiliário  | −0,07 a −0,09 ✗ |         ≈ 0 | Comprar setor defensivo pelo gráfico perdeu                              |
| Utilities                           |           −0,04 |     −0,07 ✗ | Nem compra nem venda funcionaram                                         |

## O que mudou no app

- **"Comprar em partes / no recuo" → "Aguardar" agora vale só para ETFs e fundos.** Em ações individuais a decisão
  segue valendo (+0,08R no estudo). Aplicar a troca a ações tinha sido extrapolação dos estudos anteriores, feitos quase
  só com ETFs.
- **Medida em R com risco mínimo de 1%** no aprendizado (modelo ao vivo, backfill e estudos), o que corrige a distorção
  dos ativos que quase não oscilam.
- Nada mais muda nas decisões ao vivo.

## Recomendações (dependem do usuário)

1. **Tratar ETFs e ações de forma diferente na Decisão do trader:** em ETFs, dar mais peso a "Reduzir" e ser mais
   exigente para "Comprar"; em ações, o contrário. É a mudança com mais evidência até aqui, mas mexe no motor de decisão.
   Proposta: testar como hipótese registrada (estudo antes/depois, critério "se piorar, reverter"), como na fase 2.
2. **Inversos:** desaconselhar a compra pela técnica (só como proteção tática curta), o que já é o espírito da marca de
   decaimento.
3. **Filtro de vantagem:** não usar a nota A como sinal forte. Vale como disciplina (não operar contra expectativa
   negativa), não como previsão.
4. Os recortes por bloco são pistas, não regras: confirmar no diário ao vivo antes de agir.
