# Contexto macro (12/10/2026)

Antes, o "contexto de mercado" (`marketContext` em `assets/ta-data.js`) era só S&P × MM200 + momentum. Agora soma
o contexto macro, atualizado 4 vezes por dia útil (`.github/workflows/update-macro.yml` → `scripts/update-macro.mjs`).

- **Pilares** (cada indicador vira nota −2,5 a +2,5, + bom para ações):
  crescimento (produção industrial, payroll, regra de Sahm, seguro-desemprego, varejo, confiança),
  inflação (CPI, núcleo 3m anualizado, inflação implícita, petróleo), juros e Fed (variação do juro, 2a − Fed,
  curva 10a−3m), condições financeiras (spread high yield, dólar), geopolítica (peso dos temas geopolíticos
  nas manchetes, ouro).
- **Regime** pelo relógio do investimento (ritmo do crescimento × ritmo da inflação, com atraso de publicação),
  com probabilidade de cada quadrante.
- **Setores**: retorno acima do S&P no mês seguinte em cada regime desde 1999 (Yahoo mensal ajustado), ponderado
  pela probabilidade e encolhido por amostra + efeito dos temas das notícias do dia.
- **Agenda**: projeção do Forex Factory guardada antes; resultado do FRED depois; surpresa e índice de 30 dias.
- **Tela**: Mercado › Macro. **Decisão**: aviso "Macro (modo sombra)" em `edgeOf`, sem mudar nota nem tamanho até
  o diário medir acerto (regra 3 do `docs/OBJETIVO.md`). `newsHist` em `data/macro.json` acumula os temas por dia.

## Mundo (12/10/2026)

Pilar "Mundo" (15% da nota) com 3 regiões: **zona do euro** (HICP, juro do BCE, Bund 10a, desemprego do Eurostat,
euro × dólar, Euro Stoxx 50), **Japão** (desemprego, juro do BoJ, JGB 10a, dólar × iene com alerta de desmonte do
carry trade, Nikkei) e **China** (exportações, dólar × yuan, cobre, Xangai, Hang Seng). Inflação de Japão/China e
produção industrial fora: sem fonte gratuita atualizada.
