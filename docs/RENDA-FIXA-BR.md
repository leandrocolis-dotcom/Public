# Comparador de renda fixa BR (Carteira › Renda fixa BR, `?tab=rfix`)

Compara CDB, LC/RDB, LCI, LCA, CRI, CRA, debênture (comum e incentivada), Tesouro Selic/Prefixado/IPCA+, fundo DI e poupança
no MESMO valor e prazo: rendimento bruto (R$ e %), impostos e custos, líquido (R$, % no período, % a.a. e % do CDI) e,
para os isentos, o "CDB equivalente" (taxa em % do CDI que um CDB precisa pagar para empatar no líquido).

- Contas puras: `assets/fixed-income.js` (testes em `tests/fixed-income.test.js`). Tela: `assets/fixed-income-view.js`.
- Dados: CDI (SGS 4389), Selic (SGS 432) e IPCA esperado 12 m (Focus) de `api/yields?br=1`; todos editáveis; TR é estimativa.
- Preferências: `prefs.rfx` = { amount, days, products[], over{cdi,selic,ipca,tr}, conv }.

## Regras (PF, nov/2026)

- IR regressivo: ≤180 d 22,5%; 181–360 20%; 361–720 17,5%; >720 15% (CDB, LC, Tesouro, debênture comum, fundos).
- IOF regressivo antes de 30 dias (96% → 0%), descontado antes do IR.
- Isentos: LCI, LCA, CRI, CRA, debênture incentivada, poupança. Carência mínima de LCI/LCA: aviso abaixo de 270 dias.
- Fundo DI: come-cotas 15% a cada 182 dias + complemento no resgate (aproximação; taxa já líquida de administração).
- Tesouro: custódia B3 0,20% a.a. sobre o saldo médio (Tesouro Selic isento até R$ 10 mil).
- Poupança: 0,5% a.m. + TR. Dias úteis = dias corridos × 252/365. Títulos levados ao vencimento.
- A MP 1.303/2025 (IR único de 17,5% e LCI/LCA tributadas) caducou em 08/10/2025: se uma lei nova mudar as regras, atualizar `irRate`/`KINDS`.

Material educacional; não é recomendação de investimento.

## Preço → taxa: YTM e YTW (24/11/2026)

Cartão "📐 Preço → taxa" na mesma tela: para debênture, CRI, CRA ou LF negociada no secundário, o preço em % do PU par
vira taxa até o vencimento (YTM), até cada resgate antecipado (YTC) e o **YTW** (a menor delas). Mostra também PU de
compra, prazo em DU, duration de Macaulay e os fluxos do pior cenário.

- Contas puras: `assets/bond-yield.js` (testes em `tests/bond-yield.test.js`); entradas em `prefs.rfx.ytw`.
- Indexadores: prefixado, IPCA+ (termos reais; o VNA atualizado já está no PU par), CDI + spread e % do CDI (CDI do
  topo da tela, constante).
- Convenção ANBIMA de debêntures: DU pelo calendário de feriados nacionais (Páscoa calculada; Consciência Negra desde
  2024), base 252, juros por período = saldo × (fator − 1), pagamento no próximo dia útil, preço em % do PU par.
- Resgate antecipado: juros do período + saldo × preço de resgate (% do saldo). Amortizações em % do valor nominal.
- Colagem (`parseSchedule`): aceita data e valor na mesma linha, em linhas alternadas (data numa linha, "5,86%" na
  seguinte, como sai do site da emissora/ANBIMA) ou linhas de tabela com índice e colunas extras; cada data fica com o
  primeiro número depois dela. Vírgula sozinha é sempre decimal (`schedNum`: "33,333%" = 33,333). Abaixo do campo, a
  conferência (quantas datas, soma, quantas já pagas e saldo) fica sempre na tela (`data-keep`, não vira "i").
- Conferido por segunda rota: título sem cupom pela fórmula fechada; no par, taxa = cupom em todos os indexadores;
  variação da taxa ≈ variação do preço ÷ duration.
- Limites: taxas brutas (antes de IR); Tesouro NTN-B/NTN-F usa cupom fixo por semestre (pode diferir na 2ª casa);
  primeiro período irregular e resgate com prêmio por fórmula (make-whole, prêmio × prazo) não são modelados (digite o
  preço de resgate de cada data).
