# Estudo: o que negocia no fim de semana antecipa a segunda?

Script: `scripts/weekend-study.mjs` (workflow `model-study.yml`, `study: weekend`) → `data/weekend-study.json`.
Rodado em 21/11/2026.

## Pergunta

O pêndulo usa a prévia pelo cripto no vão do fim de semana (`assets/weekend-pulse.js`). Essa prévia antecipa o
SPY na segunda? Algum outro sinal 24/7 acrescenta?

## Como foi medido

- **Sinais:** de sexta 16h até domingo 17h de NY, **antes** de os futuros reabrirem (assim o sinal não "cola"
  dos futuros). Desvio e correlação calculados só com o passado até a sexta.
  - `btc`, `eth`: variação no fds.
  - `cry`: z combinado (Bitcoin 2/3 + Ether 1/3); `cry50`: meio a meio.
  - `paxg`: ouro tokenizado (PAXG).
  - `vol`: volatilidade do Bitcoin no fds ÷ mediana dos 12 fds anteriores.
  - `score`: nota do pêndulo (com a assimetria, alta pesa 0,25); `scoreSym`: sem assimetria; `score50`: nota com 50/50.
- **Alvos:** SPY abertura de segunda ÷ fechamento de sexta (**gap**) e fechamento de segunda ÷ sexta (**dia**).
- **Bases:**
  - **A**: barras de 1 h, janela exata, 104 fins de semana (nov/2024 a nov/2026).
  - **B**: diário, 502 fins de semana (abr/2017 a nov/2026), janela sáb 00h → seg 00h UTC (acaba 19h de NY no
    domingo, 1 h depois dos futuros: leve contaminação, serve de robustez).
- **Testes:** correlação com p por permutação (4.000 sorteios), gap médio no 1º × 5º quintil do sinal, acerto de
  direção nos dias com |movimento| ≥ 0,25% contra a "base" (chutar sempre o lado mais comum).

## Resultados

| Sinal                      | Base A, gap: corr (p) | Base B, gap: corr (p) | Base A, dia  | Base B, dia   |
| -------------------------- | --------------------- | --------------------- | ------------ | ------------- |
| Bitcoin                    | 0,34 (0,001)          | 0,18 (<0,001)         | 0,05 (0,57)  | 0,23 (<0,001) |
| Ether                      | **0,41** (<0,001)     | **0,29** (<0,001)     | 0,04 (0,67)  | 0,28 (<0,001) |
| Nota do pêndulo, 2/3 + 1/3 | 0,33 (0,002)          | 0,30 (<0,001)         | 0,08 (0,44)  | 0,31 (<0,001) |
| **Nota do pêndulo, 50/50** | **0,34 (0,001)**      | **0,32 (<0,001)**     | 0,06 (0,53)  | 0,32 (<0,001) |
| Ouro tokenizado (PAXG)     | −0,15 (0,14)          | 0,03 (0,54)           | −0,10 (0,30) | 0,06 (0,26)   |
| Volatilidade do cripto     | −0,02 (0,85)          | sem dado por hora     | 0,00 (0,98)  | —             |

- **Quintis (nota, base B):** 20% piores fins de semana do cripto → gap médio −34 pb; 20% melhores → +30 pb (t = 3,9).
- **Acerto de direção da nota:** 61–67%, contra 58–61% de chutar sempre alta. Vantagem modesta no dia a dia.
- **Assimetria confirmada:** na base B a correlação vem do lado da queda (0,28–0,33); do lado da alta é 0,12.
- **Queda forte do cripto (z ≤ −1,5σ):** base B, 24 fins de semana: gap médio **−0,98%**, segunda **−1,20%**,
  fechou em queda **71%** das vezes (resto: 41%). Base A: 5 casos, gap médio −1,1%. **Alta forte (≥ +1,5σ):**
  35 casos, gap −0,02%, nada.
- **Abertura × fechamento:** na base limpa (A) o cripto antecipa a **abertura** e não o fechamento da segunda
  (o gap devolve durante o dia). Na base B antecipa os dois, mas ela tem 1 h de futuros dentro da janela.

## Decisão

- **Fica:** cripto, agora **Bitcoin e Ether meio a meio** (o Ether antecipou melhor nas duas bases; a diferença
  é pequena, mas tem o mesmo sinal em 104 e em 502 fins de semana). Assimetria mantida (alta pesa 0,25).
- **Novo aviso no pêndulo:** queda forte do cripto (z ≤ −1,5σ) mostra o resultado do estudo (abertura média −1,0%).
  Modo sombra: não gera push.
- **Texto:** a prévia é da **abertura** de segunda, não do dia inteiro.
- **Rejeitados:** ouro tokenizado (sem efeito, sinal troca de lado entre bases) e volatilidade do cripto no fds
  (nem direção, nem tamanho do gap: corr com |gap| 0,12, p = 0,22).
- **Não testáveis com histórico:** nota das notícias do fds (o arquivo `data/news-weekend.json` só tem semanas
  recentes) e bolsas do Golfo (Yahoo não tem histórico do `^TASI.SR`). Ficam para um diário prospectivo, se valer.

Amostra pequena na base limpa (104). Rever com o workflow (`study: weekend`) a cada trimestre. Material
educacional, não é recomendação.
