# Roadmap: notícias com nota de impacto no ativo (−10 a +10)

> Pedido do usuário (12/10/2026): na análise do ativo, vasculhar as notícias da empresa, do setor, do ETF (composição),
> da região, de macro e de **geopolítica**, dar a cada uma uma nota de −10 a +10 pelo impacto provável no ativo, montar
> um ranking e incorporar à análise do trader. Escolhas do usuário: **regras agora, IA depois**; na Decisão do trader,
> **modo sombra primeiro**. Objetivo geral: `docs/OBJETIVO.md`. Material educacional; não é recomendação.

## Status

| Fase | O que entrega                                                                                       | Status   |
| ---- | --------------------------------------------------------------------------------------------------- | -------- |
| N1   | Motor de regras `assets/news-impact.js` + cartão "Notícias e impacto" na página do ativo            | entregue |
| N2   | Linha "Notícias (modo sombra)" no cartão da Decisão do trader (aparece, não pesa)                   | entregue |
| N3   | Diário: nota diária das notícias dos campeões/carteira gravada pelo cron, para medir contra o preço | pendente |
| N4   | Motor por IA (Claude) numa função da Vercel, com cache; precisa da chave `ANTHROPIC_API_KEY`        | pendente |
| N5   | Se N3 mostrar acerto fora da amostra, a nota entra na Decisão com peso (hipótese registrada antes)  | pendente |

## Como a nota é calculada (N1)

- **Fontes:** manchetes do Yahoo para o ticker (ou para o ativo de referência, nos alavancados/inversos) + o feed de
  mercado do app (Bloomberg, FT, WSJ, CNBC, Investing etc., já marcado por assunto). Últimos 7 dias; opinião e ruído
  ficam de fora.
- **Relevância:** cita a empresa (1,0); notícia do ticker no Yahoo sem citar o nome (0,7); cita uma posição ≥ 3% do
  ETF (0,4–0,8 pelo peso); fala do setor (0,6); da região (0,5); macro ou geopolítica com efeito no ativo (0,6).
- **Tom:** dicionário financeiro (supera estimativas, eleva projeção, rebaixamento, investigação, recall…), −1 a +1.
- **Exposição:** setor e indústria do Yahoo, país, setores do ETF e o rótulo da lista do usuário dão um vetor de
  exposição (energia, petróleo, ouro, juros, defesa, aéreas, navios, chips, China, Taiwan, Europa…). Cada tema
  (Oriente Médio, Rússia–Ucrânia, EUA–China/Taiwan, tarifas, sanções, trégua, petróleo, Fed, inflação, recessão,
  investimento em IA, defesa, cripto) tem um efeito por exposição: o mesmo tema ajuda um setor e prejudica outro.
- **Nota** = tom (ou efeito do tema) × relevância × 10, com o sinal trocado em inversos. **Saldo** = média ponderada
  pelo frescor (meia-vida de 2 dias; notícia da empresa pesa 1,5×).
- **Limites conhecidos:** lê só o título; não entende ironia, contexto, nem "notícia já esperada". Daí o modo sombra.

## N3: como medir (registrar antes de rodar)

Todo pregão, gravar o saldo de notícias de cada ativo da lista 🏆 e da carteira. Medir o retorno em excesso de 5
pregões por faixa de saldo (≤ −3, neutro, ≥ +3). Aprovação para N5: excesso dos positivos > negativos com t ≥ 2 e na
mesma direção na alta e na baixa do S&P 500.
