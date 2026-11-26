# Pouso Amortecido

Uma filosofia de movimento derivada do Prumo Noturno. Peça de referência: `movimento-canvas.png`.

## O gesto

Tudo o que aparece na tela chega como um peso que desce na ponta de um fio: cai rápido, passa um pouco do
ponto, volta e assenta. Uma oscilação só, já amortecida, e depois silêncio. Nada quica duas vezes, nada gira
por enfeite. O movimento existe para dizer de onde a coisa veio e para onde vai, e termina assim que diz.
Cada curva é ajustada à mão, quadro a quadro, com o cuidado de quem passou horas medindo um único pouso.

## Exposição estroboscópica

O tempo é desenhado como repetição. Silhuetas idênticas, espaçadas a passo constante, registram o caminho do
aviso como uma foto de longa exposição: só a última é nítida. A distância entre duas silhuetas é a
velocidade. Perto do fim elas se amontoam, e esse acúmulo é a desaceleração. A prancha é um instrumento de
medida, desenhado com a precisão de bancada de quem domina a disciplina.

## Quatro saídas, uma física

O aviso sai de quatro jeitos e todos obedecem à mesma regra. Por tempo, ele afunda e esmaece, e um fio fino
na base, que se esvazia da direita para a esquerda, avisa o fim antes de ele chegar. Pelo ×, ele encolhe para
dentro de si e some. Pelo dedo, ele segue a mão sem atraso, inclina levemente no sentido do arrasto e, ao
soltar, continua com a velocidade que recebeu, para qualquer um dos quatro lados. Abaixo do limite, volta ao
centro pelo mesmo pouso amortecido da entrada.

## Cor e matéria

O chão continua quase preto, azul de madrugada. O aviso é uma lâmina um tom acima, com uma única borda de cor
à esquerda: menta para concluído, rosa para falha, âmbar só para o que pede atenção. O periwinkle marca o
toque: o × e o rastro do dedo. Nenhuma outra cor entra. A sombra é curta e fria, como luz de lua sobre metal.

## Medida da mão

O × mora no canto superior direito e o alvo dele é um quadrado de 44 px, cotado na prancha como desenho
técnico, mesmo que o glifo desenhado ocupe só um terço disso. O texto nunca corre por baixo do alvo. O limite
de arrasto, um terço da largura ou 80 px, aparece como uma régua tracejada. Cada número da prancha é a
especificação do produto, executada com o rigor obsessivo de um mestre do ofício.

## Como isso vira interface

- **Entrada:** 420 ms, desce 14 px com leve passagem do ponto (`cubic-bezier(.34,1.32,.64,1)`), opacidade em 180 ms.
- **Saída por tempo:** fio de progresso na base; ao terminar, afunda 8 px e esmaece em 240 ms (`ease-in`).
- **Saída pelo ×:** encolhe a 92% e esmaece em 200 ms. Alvo de toque de 44 × 44 px no canto superior direito.
- **Deslizar:** segue o dedo em x e y, inclina até 6°; solta acima de 1/3 da largura, 80 px ou 0,5 px/ms → voa
  para o lado do gesto em 220 ms; abaixo disso volta com o pouso da entrada. Passar o dedo pausa o fio.
- **Movimento reduzido:** só opacidade, sem deslocamento.
