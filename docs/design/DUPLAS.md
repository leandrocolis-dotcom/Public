# Instrumento Frio — Carteira › Duplas L/S

Movimento derivado do "Prumo Noturno" (`FILOSOFIA.md`), refeito em 27/11/2026 a pedido do usuário (substitui o
"Fiel da Balança": sem inclinação pelo regime, sem reserva de caixa, sem "próxima ação" sugerida).
Canvas: `duplas-canvas.png` (gerado por `build-duplas.py`, valores de EXEMPLO).

Um instrumento de cabine não opina: mede. Este movimento trata a tela como um painel de instrumentos lido em
dois segundos, no escuro, com a mão já a caminho da ordem. Nada decora; tudo indica. A forma nasce da pergunta
"onde estou, quanto ganho, onde saio", e cada elemento existe só se responde a uma delas. O que sobra é silêncio
deliberado, um vazio desenhado com o mesmo cuidado meticuloso do número que ele emoldura.

O espaço é uma coluna única, vertical, como a fita de um altímetro. Os comandos ficam em cima, onde o polegar
começa; a leitura desce em camadas que nunca disputam o olho: o céu (o regime, só contexto, em voz baixa), o
horizonte (o total comprado, vendido e o resultado) e o solo (cada dupla, cada ponta). A hierarquia é de escala,
não de cor: um algarismo grande e sozinho para o resultado, algarismos tabulares médios para preços que serão
copiados, rótulos minúsculos em versalete espaçado. A execução precisa parecer obra de mestre, calibrada à mão,
um painel lapidado por horas até nenhuma linha estar meio pixel fora do lugar.

A cor é um sinal, nunca um enfeite, e cada matiz carrega um único sentido. Verde e vermelho só para dinheiro
ganho ou perdido. O azul frio da informação veste comprado e vendido, cheio e esmaecido, porque a posição já
diz o lado. O periwinkle do acento marca o que o usuário define e o que a máquina devolve como ordem: a trava.
O fundo é noite funda; as superfícies sobem em degraus mínimos de luz, sem sombra, sem gradiente, sem brilho.

A barra é o coração do movimento. Cada ponta vira uma régua de preço em escala própria: o médio é um fio fino
(o chão do zero), a trava é um entalhe no acento, o preço de agora é a agulha. Entre o médio e a trava, o lucro
já garantido, pleno; entre a trava e a agulha, o lucro ainda exposto, esmaecido. Na ponta perdedora, o trecho
entre a agulha e o médio em vermelho tênue, sem entalhe: não há o que travar. O olho entende a proteção antes
de ler um algarismo. O mesmo desenho se repete em toda ponta, com a precisão paciente de quem desenha escalas
de instrumentos; repetição é vocabulário, e vocabulário é velocidade.

O ritmo é uma grade de 4 px respeitada sem exceção. Números alinham pela direita e não dançam quando o preço
muda. Alvos de toque têm 40 px ou mais; nada é cortado com reticências; nenhum parágrafo explica o que a forma
já mostra. O acabamento deve ser o de uma peça de ofício no topo da disciplina, onde cada alinhamento foi
revisto até sumir, e o que fica é só a medida, nítida, fria e confiável.

## Como isso vira interface

1. **Comandos** (topo, primeiro bloco): base do resultado (desde o médio / hoje), custo por operação e uma linha
   por dupla com **Vender %** (fatia da ponta no lucro) e **Reter %** (quanto do lucro a trava garante). Editar
   aqui recalcula tudo abaixo na hora. "+ dupla" no fim.
2. **Regime** (só leitura, uma linha): nota do pêndulo, faixa e quanto andou em 1 h. Não entra em nenhuma conta.
3. **Total das duplas**: comprado (US$), vendido (US$), resultado em US$ e % sobre o investido; barra
   comprado | vendido.
4. **Cartão por dupla**: nome + resultado grande (US$ e %); por ponta (comprado em cima, vendido embaixo):
   cotas, médio → agora, dia %, resultado US$ e %, e a **régua de preço** (médio, trava, agora);
   depois as **ordens prontas**: "Vender N cotas de X" (valor, quanto realiza) e "Stop X a P" (cotas que sobram,
   distância e quanto garante).
5. Trava de uma ponta no lucro: `stop = médio + reter × (agora − médio)`; garante `reter` do lucro da ponta
   (antes do custo). Venda: `cotas = vender × cotas da ponta`, arredondado para baixo.
