# Estudo: pares do pêndulo nas últimas 52 semanas

Janela: 08/10/2025 a 09/10/2026 (252 pregões, `data/prices.json`). Material educacional; não é recomendação de investimento.

## Método

- **Retorno A / B**: variação de preço de cada ponta no período.
- **ρ**: correlação dos retornos diários. **β alta / β queda** realizados (B contra A nos dias em que A subiu / caiu), ao lado do β de cadastro em `assets/universe.js`.
- **Sinal semanal**: a cada 5 pregões, favorito = ponta com maior retorno de 3 meses (63 pregões), como em `computePair`; posição comprado no favorito e vendido no outro, pesos iguais, por 5 pregões. Sem custos, sem timing de entrada, sem filtros de regime. **Acerto** = semanas positivas; **Acum.** = resultado composto; **DD** = pior queda; **Trocas** = vezes que o favorito mudou.

## Resultado por driver

| Driver       | Pares | Acum. médio | Acerto médio | Pares positivos |
| ------------ | ----- | ----------- | ------------ | --------------- |
| Volatilidade | 8     | +29.2%      | 61%          | 8/8             |
| Inflação     | 2     | +18.7%      | 55%          | 2/2             |
| Curva        | 2     | +5.4%       | 54%          | 2/2             |
| Juros        | 7     | -6.8%       | 53%          | 3/7             |
| Dólar        | 17    | -8.1%       | 47%          | 4/17            |
| Petróleo     | 1     | -11.5%      | 46%          | 0/1             |

## Todos os pares (ordem do acumulado)

| #   | Par                                         | A   | B    | Ret. A  | Ret. B | ρ     | β alta (cad.)  | β queda (cad.) | Acerto | Acum.  | DD   | Trocas | Favorito hoje |
| --- | ------------------------------------------- | --- | ---- | ------- | ------ | ----- | -------------- | -------------- | ------ | ------ | ---- | ------ | ------------- |
| 5   | Semicondutores x VIX                        | SMH | VIXY | +74.9%  | -49.5% | -0.58 | -0.83 (-0.60)  | -0.82 (-1.56)  | 60%    | +54.5% | -50% | 2      | SMH           |
| 14  | Dólar ↑ x Brasil                            | UUP | EWZ  | +7.8%   | +52.3% | -0.35 | -1.22 (-2.26)  | -2.32 (-2.51)  | 50%    | +41.6% | -11% | 2      | EWZ           |
| 8   | Brasil x VIX                                | EWZ | VIXY | +52.3%  | -49.5% | -0.43 | -0.80 (-0.26)  | -0.98 (-1.64)  | 56%    | +40.7% | -49% | 4      | EWZ           |
| 1   | Ações x VIX                                 | SPY | VIXY | +16.9%  | -49.5% | -0.81 | -3.17 (-1.85)  | -3.87 (-4.51)  | 64%    | +32.3% | -40% | 2      | SPY           |
| 2   | Nasdaq x VIX                                | QQQ | VIXY | +23.4%  | -49.5% | -0.70 | -1.83 (-1.44)  | -2.14 (-3.35)  | 58%    | +30.6% | -43% | 2      | QQQ           |
| 6   | High yield x VIX                            | HYG | VIXY | +1.6%   | -49.5% | -0.69 | -10.08 (-2.96) | -9.90 (-7.00)  | 64%    | +28.6% | -35% | 2      | HYG           |
| 33  | Commodities x Treasuries longos             | DBC | TLT  | +49.7%  | -8.6%  | -0.42 | -0.19 (-0.19)  | -0.19 (-0.27)  | 54%    | +24.0% | -20% | 7      | DBC           |
| 3   | Small caps x VIX                            | IWM | VIXY | +14.2%  | -49.5% | -0.70 | -1.97 (-1.13)  | -2.26 (-4.13)  | 62%    | +20.7% | -42% | 2      | IWM           |
| 18  | Dólar ↑ x Prata                             | UUP | SLV  | +7.8%   | +22.9% | -0.45 | -5.50 (-1.86)  | -4.49 (-2.06)  | 52%    | +19.1% | -48% | 7      | UUP           |
| 4   | Bancos x VIX                                | XLF | VIXY | +3.9%   | -49.5% | -0.56 | -2.03 (-1.48)  | -2.21 (-3.99)  | 64%    | +18.0% | -44% | 2      | XLF           |
| 29  | Juros ↑ x Ouro                              | TBF | GLD  | +15.2%  | +3.3%  | -0.13 | -0.45 (-0.64)  | -0.31 (-0.17)  | 62%    | +15.5% | -23% | 3      | TBF           |
| 34  | Energia x Treasuries longos                 | XLE | TLT  | +50.5%  | -8.6%  | -0.33 | -0.13 (-0.15)  | -0.16 (-0.15)  | 56%    | +13.5% | -17% | 7      | XLE           |
| 7   | Emergentes x VIX                            | EEM | VIXY | +25.0%  | -49.5% | -0.60 | -1.37 (-1.08)  | -1.26 (-4.12)  | 60%    | +8.5%  | -51% | 4      | EEM           |
| 36  | Financeiros x Treasuries longos             | XLF | TLT  | +3.9%   | -8.6%  | +0.15 | +0.12 (-0.18)  | +0.07 (-0.13)  | 54%    | +7.8%  | -12% | 5      | XLF           |
| 22  | Dólar ↑ x Commodities amplas                | UUP | DBC  | +7.8%   | +49.7% | +0.05 | +0.63 (-1.46)  | -0.22 (-0.74)  | 46%    | +6.9%  | -17% | 7      | DBC           |
| 28  | Juros EUA ↑ x Bonds EM (USD)                | TBF | EMB  | +15.2%  | +1.0%  | -0.70 | -0.45 (-0.53)  | -0.42 (+0.11)  | 58%    | +4.7%  | -11% | 5      | TBF           |
| 20  | Dólar ↑ x Materiais                         | UUP | XLB  | +7.8%   | +12.0% | -0.31 | -1.03 (-1.56)  | -0.92 (-1.10)  | 54%    | +4.5%  | -12% | 10     | UUP           |
| 35  | Bancos regionais x Treasuries longos        | KRE | TLT  | +11.7%  | -8.6%  | +0.10 | +0.07 (-0.08)  | +0.01 (-0.10)  | 54%    | +3.1%  | -21% | 7      | KRE           |
| 26  | Juros EUA ↑ x Iene                          | TBF | FXY  | +15.2%  | -3.9%  | -0.28 | -0.26 (-0.48)  | -0.23 (-0.30)  | 56%    | +1.1%  | -7%  | 6      | TBF           |
| 15  | Dólar ↑ x México                            | UUP | EWW  | +7.8%   | +13.2% | -0.49 | -1.97 (-2.29)  | -1.93 (-1.49)  | 44%    | -2.7%  | -25% | 9      | UUP           |
| 27  | Juros EUA ↑ x Bonds globais                 | TBF | BWX  | +15.2%  | -4.5%  | -0.56 | -0.46 (-0.61)  | -0.44 (-0.02)  | 60%    | -3.1%  | -17% | 7      | TBF           |
| 31  | Juros ↑ x Utilities                         | TBF | XLU  | +15.2%  | -6.2%  | -0.32 | -0.69 (-0.59)  | -0.32 (-0.01)  | 48%    | -4.9%  | -24% | 7      | TBF           |
| 11  | Dólar ↑ x Bonds de emergentes (USD)         | UUP | EMB  | +7.8%   | +1.0%  | -0.41 | -0.47 (-1.09)  | -0.41 (-0.85)  | 50%    | -9.0%  | -17% | 9      | UUP           |
| 13  | Dólar ↑ x Emergentes                        | UUP | EEM  | +7.8%   | +25.0% | -0.38 | -1.68 (-1.84)  | -1.81 (-2.16)  | 48%    | -10.7% | -24% | 9      | UUP           |
| 37  | Petróleo x Iene                             | USO | FXY  | +101.6% | -3.9%  | -0.25 | -0.04 (+0.03)  | -0.04 (-0.03)  | 46%    | -11.5% | -47% | 12     | USO           |
| 21  | Dólar ↑ x Mineradoras de cobre              | UUP | COPX | +7.8%   | +37.3% | -0.49 | -4.21 (-3.06)  | -4.08 (-3.20)  | 48%    | -12.7% | -42% | 12     | COPX          |
| 12  | Dólar ↑ x Ações desenvolvidas ex-EUA        | UUP | EFA  | +7.8%   | +12.9% | -0.56 | -1.47 (-1.65)  | -1.71 (-1.60)  | 46%    | -13.3% | -19% | 13     | UUP           |
| 32  | Juros ↑ x Imobiliário (REITs)               | TBF | VNQ  | +15.2%  | +4.8%  | -0.36 | -0.61 (-0.72)  | -0.41 (+0.41)  | 46%    | -15.7% | -30% | 11     | TBF           |
| 19  | Dólar ↑ x Mineradoras de ouro               | UUP | GDX  | +7.8%   | +13.6% | -0.51 | -4.91 (-2.15)  | -4.37 (-2.13)  | 46%    | -16.3% | -41% | 4      | GDX           |
| 10  | Dólar ↑ x Bonds de emergentes (moeda local) | UUP | EMLC | +7.8%   | +4.0%  | -0.69 | -0.92 (-1.05)  | -0.92 (-1.00)  | 42%    | -16.5% | -21% | 18     | UUP           |
| 9   | Dólar ↑ x Bonds globais (não-EUA)           | UUP | BWX  | +7.8%   | -4.5%  | -0.82 | -1.08 (-1.00)  | -1.13 (-1.04)  | 48%    | -16.8% | -20% | 8      | UUP           |
| 17  | Dólar ↑ x Ouro                              | UUP | GLD  | +7.8%   | +3.3%  | -0.45 | -2.61 (-1.22)  | -2.19 (-0.82)  | 52%    | -17.3% | -36% | 9      | UUP           |
| 23  | Dólar ↑ x Imobiliário internacional         | UUP | VNQI | +7.8%   | -6.7%  | -0.57 | -1.55 (-1.56)  | -1.30 (-1.44)  | 40%    | -18.0% | -24% | 13     | UUP           |
| 25  | Dólar ↑ x Energia                           | UUP | XLE  | +7.8%   | +50.5% | +0.09 | +0.87 (-1.36)  | -0.12 (-0.24)  | 48%    | -18.3% | -28% | 11     | XLE           |
| 24  | Dólar ↑ x S&P 500                           | UUP | SPY  | +7.8%   | +16.9% | -0.30 | -0.61 (-1.18)  | -0.74 (-0.78)  | 44%    | -20.5% | -23% | 10     | SPY           |
| 16  | Dólar ↑ x China                             | UUP | FXI  | +7.8%   | -15.1% | -0.26 | -1.16 (-1.93)  | -0.75 (-2.21)  | 34%    | -38.3% | -38% | 15     | UUP           |
| 30  | Juros ↑ x Mineradoras de ouro               | TBF | GDX  | +15.2%  | +13.6% | -0.20 | -1.16 (-1.15)  | -0.95 (-0.10)  | 42%    | -45.5% | -61% | 8      | GDX           |

## Leitura

1. **Volatilidade (8 pares x VIXY) foi o único grupo 100% positivo** (acerto 56–64%). O motivo é estrutural: VIXY perdeu 49,5% no ano (decaimento de futuros de VIX) e o sinal ficou do lado das ações quase o ano todo (2 trocas). Mas o DD de 35–51% mostra que os picos de volatilidade machucam muito; o aviso "Tático: VIXY decai" segue válido no sentido inverso.
2. **Dólar (17 pares com UUP) foi o pior grupo**: 4 de 17 positivos, acerto médio abaixo de 50%. O dólar subiu pouco (+7,8%) e o favorito trocou muito (até 18 vezes em UUP x EMLC): momentum de 3 meses gerou serrote. Exceções que funcionaram: UUP x EWZ (+41,6%, Brasil disparou) e UUP x SLV.
3. **Inflação/Curva (ações e commodities x TLT)**: todos positivos e com DD moderado (12–21%), puxados por DBC e XLE (+50%) contra TLT (−8,6%).
4. **Juros (TBF)**: misto. TBF x GLD bom (+15,5%); TBF x GDX foi o pior do estudo (−45,5%, DD −61%).
5. **β de cadastro x realizado**: vários pares de dólar perderam a assimetria (ex.: UUP x XLE e UUP x DBC com β alta positivo, ou seja, a relação inversa não se sustentou no ano). Nos pares de VIX, o β realizado ficou bem mais simétrico do que o cadastro (a "B reage mais na queda de A" quase não apareceu).
6. **Petróleo x Iene (β≈0)**: confirmado como só direção: USO +101,6%, mas o sinal semanal perdeu 11,5% com 12 trocas.

**Para o objetivo (poucos gatilhos confiáveis)**: no último ano o sinal de momentum de 3 meses só teve vantagem quando havia tendência longa e unilateral (VIXY caindo, commodities x TLT, Brasil). Pares com 9 ou mais trocas de favorito: 1 de 14 positivo; com menos de 9: 18 de 23 positivos; isso sugere testar um filtro de estabilidade do favorito antes de considerar o par. Estudo de uma janela só, sem custos: não autoriza mudar limites.
