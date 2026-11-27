# Fiel da Balança — Carteira › Duplas L/S

Movimento derivado do "Prumo Noturno" (`FILOSOFIA.md`), aplicado ao painel das duplas long × short em 27/11/2026.
Canvas: `duplas-canvas.png` (gerado por `build-duplas.py`, valores de EXEMPLO).

Toda balança tem um fiel: a agulha fina que mostra, de longe e sem número, para que lado o peso pende. Este
movimento faz de cada dupla uma balança. Uma barra só, dividida entre o lado comprado e o vendido, em que o ponto da
divisão _é_ a agulha. Sobre ela fica uma marca fina para onde a agulha deveria estar e uma faixa tênue para a folga
aceita. O olho entende a postura antes de ler qualquer algarismo: perto da marca, em paz; longe da marca, há trabalho.
A interface não explica a inclinação, ela a mostra.

A hierarquia segue a ordem em que a mão trabalha. Primeiro, o estado: quanto a dupla ganha, num número grande e
sozinho. Depois, a postura: a balança. Em seguida, uma única ação em destaque, escrita como ordem de corretora
("Vender 12 SOXS"), com o valor e o que ela realiza. Por fim, os preços a deixar na corretora, em algarismos
tabulares grandes o bastante para copiar sem errar. O que é contexto (parâmetros, explicações, a segunda opção) desce
para o fundo, em tipo pequeno, ou se recolhe. Ninguém precisa ler um parágrafo para agir.

A cor tem um sentido por vez e nunca dois. Verde e vermelho só aparecem em resultado e variação. O comprado e o
vendido usam o azul de informação em dois pesos, cheio e esmaecido, porque a posição na barra já diz o lado. O acento
marca o alvo e a ação recomendada, e nada mais. O âmbar aparece só quando algo pede a mão agora: dupla fora da folga,
reserva de caixa furada ou regime virando contra a postura. Se nada estiver âmbar, nada está pedindo nada.

O progresso até o alvo é uma régua, não uma frase. Ela vai de zero ao alvo, com uma marca para a trava. O
preenchimento anda conforme o resultado e fica verde e cheio quando o alvo é batido. A régua do caixa é igual, com o
caixa contra a reserva: o mesmo desenho, que se aprende uma vez e se lê em todo lugar. Repetição é vocabulário.

O espaço trabalha mais que as bordas. Os blocos se separam por respiro e por um único fio. Os números se alinham
pela direita e não dançam quando mudam. Os alvos de toque têm 40 px ou mais, e nenhum texto é cortado com
reticências. Cada régua, cada marca e cada alinhamento numa grade de 4 px precisa parecer feito à mão, com o cuidado
paciente de quem lapidou o painel por horas, e não com o descuido de um painel gerado. A execução é de ofício:
nada sobra, nada falta e tudo está no lugar onde o olho procura.

## Como isso vira interface

1. **Faixa de comando** (topo): pêndulo (nota, faixa, 1 h) · balança do total das duplas (agora × alvo do regime) ·
   régua do caixa × reserva · contador "N duplas pedem ajuste" (âmbar) ou "Tudo na folga".
2. **Cartão por dupla**, de cima para baixo:
   - nome + resultado grande (US$ e %, desde o médio ou hoje);
   - **balança**: barra comprado | vendido, divisão = inclinação, marca do alvo e faixa da folga; rótulos
     "62% comprado · 38% vendido" e "agora +24% → alvo +40%";
   - **próxima ação** (caixa de acento): ★ ordem pronta (ex.: "Vender 12 SOXS"), valor, quanto realiza ou quanto
     usa do caixa; a outra opção em uma linha pequena; "Na folga · nada a fazer" quando dentro;
   - **régua do alvo de saída**: resultado ÷ alvo, marca da trava; batido = 🎯 ordem da ponta vencedora;
   - **ordens na corretora**: por ponta, preço agora, 🎯 alvo (limitada, se subir) e 🔒 trava (stop, se cair), com a
     distância em %;
   - **pontas**: cotas, médio → preço, andou, resultado e exposição, em tabela compacta;
   - ajustes (alvo % e inclinação manual) numa linha pequena no rodapé.
3. **Parâmetros** (reserva, inclinação máxima, trava, custo, base, + dupla) recolhidos num `<details>`; o texto de
   como ler também.
4. Sem parágrafos explicativos na leitura principal; detalhes em `title` e no "Como ler".
