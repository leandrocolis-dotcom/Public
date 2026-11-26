# Ordem de Leitura — o topo da Carteira

Movimento derivado do "Prumo Noturno" (`FILOSOFIA.md`), aplicado ao topo da Carteira › Posições em 25/11/2026. Canvas: `carteira-topo-canvas.png` (gerado por `build-carteira-topo.py`).

O olho lê de cima para baixo uma vez só. Por isso o topo não é uma grade de números iguais: é uma descida. Primeiro vem um número grande, o patrimônio, sozinho e com espaço em volta. Logo abaixo, uma linha fina diz para onde ele andou. Depois o número se divide numa régua de duas cores, Brasil e exterior, e cada metade ganha seu cartão. Por último, numa faixa baixa e silenciosa, aparece o que está acontecendo agora no pregão. A hierarquia é o conteúdo: o que é maior importa mais, e o que é menor responde a uma pergunta que só surge depois.

A cor tem um sentido por vez. Verde e vermelho só aparecem em variação, nunca em valor parado. O Brasil usa o tom do acento e o exterior usa o azul de informação, os mesmos da barra de classes logo abaixo, para que a régua e a barra falem a mesma língua. O âmbar fica de fora, porque aqui nada pede atenção. O relógio do pregão não é métrica e por isso não ganha número grande: vira legenda.

O espaço trabalha mais que as bordas. Os grupos se separam por respiro e por um único fio, não por caixas dentro de caixas. Nenhum texto é cortado com reticências. Se uma frase não cabe, ela fica mais curta: "em 16 fotos" vira "desde 22/11", e "foto anterior" vira a data. Quem lê não precisa saber como o dado foi coletado, só de quando ele é.

Cada ajuste precisa parecer feito à mão, com cuidado de ofício: alinhamento em grade de 4 px, números tabulares que não dançam quando mudam, alvos de toque de 40 px ou mais, contraste terciário de pelo menos 4,5:1. O resultado deve dar a impressão de horas de lapidação, e não de painel gerado.

## Como isso vira interface

1. **Um herói**: patrimônio em reais, grande, com variação desde a foto anterior e desde a primeira, ambas com data.
2. **Régua Brasil × exterior**: barra dividida pelo peso de cada lado, nas cores da barra de classes.
3. **Dois cartões lado a lado**: Brasil (R$, rendimento) e Exterior (US$, resultado sobre o custo e o valor em reais).
4. **Faixa "Exterior hoje"**: último pregão (ou "ao vivo" com o pregão aberto), pré/pós e o relógio do pregão como legenda.
5. **Sem reticências**: textos curtos o bastante para caber em 360 px.
