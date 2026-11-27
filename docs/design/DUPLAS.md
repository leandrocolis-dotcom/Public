# Leme e Escada — Carteira › Duplas L/S

Movimento derivado do "Prumo Noturno" (`FILOSOFIA.md`) e do "Instrumento Frio" (27/11/2026, que ele substitui).
Canvas: `duplas-canvas.png` (gerado por `build-duplas.py`, valores de EXEMPLO).

Quem conduz um barco não pensa em velas e remos separados: pensa no rumo do conjunto e nos degraus que o
trazem de volta ao porto. Este movimento organiza a superfície em torno de dois gestos só, o **leme** (para que
lado o conjunto aponta) e a **escada** (os degraus de saída que guardam o que já foi conquistado). Tudo o mais
é instrumento de leitura. A forma é severa, de cabine noturna, e cada elemento foi desenhado com o cuidado
meticuloso de quem lapidou a mesma régua por dias até ela parecer óbvia.

O espaço desce do todo para a parte, como um mapa que começa pelo oceano e termina no cais. Primeiro a frota
inteira, num algarismo grande e sozinho; depois o rumo somado, numa única barra horizontal com a agulha no
centro do zero; por fim cada embarcação, com o seu próprio leme e a sua própria escada. A escala é a única
hierarquia: o resultado grande, os preços médios em algarismos tabulares, os rótulos minúsculos em versalete
espaçado. Nenhum parágrafo; o que precisa de explicação mora escondido sob o dedo, num sussurro de dica. A
execução tem de parecer obra de mestre, de alguém no topo do ofício, sem um pixel fora da grade de 4.

O que se edita é visivelmente editável e mora onde é usado: campos com borda no acento periwinkle, no topo de
cada cartão, para que a mão mude o leme ou a altura de um degrau sem procurar. O que é leitura não tem borda.
Essa fronteira entre o que se toca e o que se lê é a regra mais rígida do movimento, calibrada com atenção
paciente até que nenhum número calculado pareça um campo e nenhum campo pareça um número.

A cor carrega um sentido por vez. Verde e vermelho só para dinheiro ganho ou perdido. O azul frio veste a
direção (comprado cheio, vendido esmaecido). O periwinkle marca o que o usuário define e o que a máquina devolve
como ordem: o alvo do leme, os degraus da escada. Os degraus são entalhes repetidos sobre a régua de preço, em
intensidade crescente, como marcas de maré num pilar; o preço de agora é um círculo claro que desliza entre
eles. Repetição é vocabulário, e vocabulário é velocidade.

O fim de cada cartão responde à única pergunta que importa numa virada: "se tudo executar, com quanto eu
fico?". Um número, com borda de acento, sem adjetivo. O painel inteiro é o produto de horas de refinamento
silencioso, e o que sobra é só a medida, nítida, fria e confiável.

## Como isso vira interface

1. **Carteira das duplas** (topo): resultado total (US$ e % sobre o investido), comprado, vendido, líquido no
   ativo-base (US$ e % da conta), caixa, **garantido pelas travas** (soma das duplas) e a barra do rumo somado.
   Padrões globais na mesma faixa: base (médio/hoje), travas padrão (%) e custo (%). Pêndulo em uma linha, só
   leitura.
2. **Cartão por dupla**: nome + resultado; **controles da dupla** (Realizar %, Postura-alvo %, Travas %, em
   níveis "50 70"); barra de postura (agora × alvo); pontas com régua de preço (médio, degraus da trava, agora);
   **ordens prontas**: inclinar (vender a ponta contrária ou comprar a ponta a favor, com caixa), venda parcial,
   escada de stops; **"se as travas executarem, a dupla fica com"**.
3. Postura = exposição líquida ÷ exposição bruta no ativo-base (valor × alavancagem): −100% todo vendido, +100%
   todo comprado. Trava de cada degrau: `stop = médio + reter × (agora − médio)` na ponta no lucro; cotas da
   ponta divididas igualmente entre os degraus.
4. Toda explicação em dica (`title`); nada de texto solto na tela.
