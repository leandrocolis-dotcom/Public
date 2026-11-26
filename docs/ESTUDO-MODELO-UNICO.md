# Estudo F34: decisões da Fase 8 (modelo único)

> Consolida F28–F33 (`docs/ROADMAP-APRENDIZADO.md`, especificação em `docs/MODELO-UNICO.md`). Cada hipótese teve a regra
> e o critério registrados no cabeçalho do script **antes** de rodar; 10 anos de Yahoo ajustado, custo 0,05% por perna,
> caixa a T-bill (EUA) ou CDI (B3). Material educacional; não é recomendação de investimento nem orientação tributária.

## Resultado por hipótese

| ID          | Pergunta                              | Resultado-chave                                                                 | Veredito                 | Decisão                                                      |
| ----------- | ------------------------------------- | ------------------------------------------------------------------------------- | ------------------------ | ------------------------------------------------------------ |
| H1 (F28)    | Catraca + MM200 mensal × stop fixo 8% | Queda máx. −5,4% × −23,2%, mas ganho 5,5% × 7,6% a.a.                           | Reprovada                | Fica o stop 2,5 ATR do simulador                             |
| H2 (F29)    | SCTR 60/30/10 × momentum 12-1         | IC ≈ 0,03 nos dois (20 pregões); nenhum passa no BH; SCTR inverte na baixa      | Reprovada                | Fica o 12-1 (fraco)                                          |
| H3/H4 (F30) | Top 20% 12-1 + regime × SPY + MM200   | Retorno/queda 0,37 × 0,39; segurar SPY: 0,46                                    | Reprovada                | Sem satélite nos EUA                                         |
| H5 (F31)    | Risco igual (1/ATR) × pesos iguais    | Sharpe 0,80 × 0,82; queda −22,2% × −25,9%                                       | Reprovada                | Pesos iguais                                                 |
| H6 (F32)    | Núcleo-satélite 70/30                 | Sharpe 0,79 × 0,78 (núcleo) × 0,64 (satélite)                                   | Aprovada, sem efeito     | O satélite não existe sem H3                                 |
| H7 (F33)    | B3 com imposto de 15%                 | Satélite B3 +2,9 p.p. a.a. líquido sobre segurar BOVA11; MM200 mensal −4,7 p.p. | Aprovada (só o satélite) | Não girar BOVA11 pela MM200; satélite B3 vai para observação |

Detalhes: `ESTUDO-CATRACA.md`, `ESTUDO-SCTR.md`, `ESTUDO-SATELITE.md`, `ESTUDO-RISCO-IGUAL.md`,
`ESTUDO-NUCLEO-SATELITE.md`, `ESTUDO-BRASIL.md`.

## Camada 5: o que vira alerta

Um gatilho só vai para a tela se cumprir **todos**: (1) ganhar em dinheiro e queda contra segurar o índice, líquido de
custos; (2) funcionar na alta e na baixa; (3) passar no Benjamini-Hochberg.

- **Nenhuma regra da Fase 8 vira alerta.** H1, H2, H3 e H5 falharam no próprio critério. H6 depende de um satélite que
  não existe.
- **Satélite B3 (H7, regra S):** cumpre (1) (15,0% × 12,1% a.a. líquido; queda −16,8% × −46,9%) e (2) (positivo na alta,
  23,7%, e perde bem menos na baixa, −9,8% × −37,9%), mas **não passou por (3)**: são 5 ETFs, uma escolha por mês e um
  único caminho histórico. Também é provável que parte do ganho venha do IVVB11 (S&P em reais) num período de real
  fraco. Fica **em observação**, não em alerta.

## Lições que mudam o modelo

1. **Segurar o índice dos EUA ganhou de todas as proteções** em retorno por queda (0,46). A MM200 mensal cortou a queda
   máxima (−24,3% × −33,7%), mas custou 6 p.p. ao ano. Proteção é seguro, não fonte de lucro: tem que ser declarada
   assim na tela.
2. **Escolher ETF por força relativa não deu vantagem** nos 40 ETFs do Pêndulo (IC ≈ 0,03). A camada 2 do modelo
   único não tem base estatística hoje.
3. **No Brasil, o imposto pune o giro mensal do BOVA11** (a MM200 mensal perdeu 4,7 p.p. ao ano depois do imposto). A
   única coisa que pagou o imposto foi trocar de classe (Brasil/EUA/dividendos/small) pelo momentum.
4. **Stop fixo abaixo da entrada quase nunca dispara depois de uma alta longa** (o stop de 2,5 ATR no BOVA11 teve a
   mesma queda de segurar). Só stop que sobe (catraca) protege, e cobra caro em retorno.

## Próximos passos (só com ordem do usuário)

- **12/10/2026: o usuário não opera Brasil.** A F33 fica só como registro; o satélite B3 sai da observação e nada será
  implementado com base na B3. Estudos futuros usam apenas ETFs e ações dos EUA.
- Nada foi aplicado na aba Decisões nem nos limites do aprendizado.
