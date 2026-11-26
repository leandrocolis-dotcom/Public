# Candidatos a liderança e nomes puros (Fluxo › Rotação relativa)

Pauta de estudo, não recomendação. Objetivo (`docs/OBJETIVO.md`): achar cedo o tema que ganha tração no dia e só avisar
quando o regime e os nomes concordam.

## Nomes puros (`assets/theme-names.js`)

- Cada uma das 279 linhas da rotação (todos os grupos) tem 3+ ETFs/ações negociados nos EUA (`THEME_NAMES`).
- `-SYM` = anda contra o tema (ETF inverso ou comprador da commodity, ex.: `-HSY` no cacau). Na tela aparece com ↕.
- `PROXY`: linhas sem papel próprio nos EUA (Áustria, Tailândia, Golfo…) usam os ETFs mais próximos ("aprox.").
- Perfil para o regime (`profileOf`): `risk` (cíclico/crescimento), `def` (defensivo) ou `neutral`; padrão por grupo e exceções por linha.
- Validação: todos os tickers com cotação no Yahoo em 03/11/2026 (SPLG→SPYM, SPVU→VONV, TEF→GRFS, GLPG→VGK trocados).
- Na aba: "Nomes puros por linha" abaixo do gráfico, para o grupo aberto, com a variação do dia (`api/quotes?only=1`, 1 min) e
  quantos andam acima do benchmark do grupo. Tocar abre a página do ativo.

## Candidatos (`assets/leaders.js`, `api/_leaders.js` (servido por `api/intraday?leaders=1`: o plano Hobby da Vercel aceita só 12 funções))

- `api/intraday?leaders=1` varre a janela **Hoje** de todos os grupos (barras de 5 min, `ext` = pré/pós conforme o switch On/Off ou o relógio),
  com cache de 2 min na borda; o app e o push dividem a mesma varredura.
- Pré-candidato (`preCandidates`): cabeça em Ganhando força ou Liderando, momento > 100, força subindo nos 2 últimos intervalos,
  ritmo (espessura média dos 2 últimos trechos) ≥ 30% e posição atualizada (até 90 min atrás da varredura). Até 3 por grupo.
  Pontuação = força e momento padronizados no grupo + ritmo + 0,5 se acabou de virar ("virou Liderando", "saiu de Atrasado").
- Confirmação dos nomes (`namesConfirm`): ≥ 60% dos nomes (mín. 2) andando melhor que o benchmark do grupo no dia.
- Regime (`regimeFit`): o mesmo `regime()` da Visão geral, com o preço de agora. +1 = a favor e intensidade ≥ 40 (Moderada+);
  0,5 = a favor mas fraco; 0 = Misto ou tema neutro; −1 = contra.
- Confiança (`confidenceOf`): **alta** = regime +1 e nomes confirmam; **média** = só um dos dois (ou regime fraco/neutro com nomes);
  **baixa** = o resto (contra o regime).
- Avisos: só **alta**, 1 por tema por dia, tipo "Candidatos a liderança" em Configurações › Avisos (`leaders`).
  App fechado: `leaderAlerts` em `scripts/lib/push-alerts.mjs` (Edge Function `push`, a cada 10 min).
  App aberto sem push ativado: `notifyLeader` (`assets/contexts.js`). Link do aviso: `?tab=flow&rot=<grupo>&focus=<linha>`.
- Tocar num candidato abre o grupo na janela Hoje com o tema em foco. "desde HH:MM" = primeira vez que apareceu hoje no aparelho.

## Limitações

- Ritmo é relativo ao gráfico (a espessura), não volume negociado.
- Pré/pós com pouco volume pode gerar candidato que se desfaz na abertura.
- Os nomes são escolha manual (revisar quando um ETF fecha ou muda de ticker).
