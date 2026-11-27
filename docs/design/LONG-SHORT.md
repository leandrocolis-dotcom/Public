# Ordens Agora: a tela Long & Short

Mockups da Fase 6 de `docs/PLANO-LONG-SHORT.md` (seção 8.7), na linguagem "Prumo Noturno" (`FILOSOFIA.md`). Prancha: `long-short/long-short-canvas.png`. Fonte editável: `long-short/mockups.html` (HTML estático, fontes de `fonts/`). Uma PNG por tela: `long-short/tela-1.png` … `tela-8.png`. Os números são de exemplo: capital US$ 25.000, 1R = US$ 125,00, limite diário 4R.

**Status: aguardando aprovação do usuário.**

## Decisões visuais

1. **A resposta manda.** Cada ordem abre com seta + AÇÃO + quantidade + ativo em Instrument Serif 28 px. Limite, stop e R vêm logo abaixo em Geist Mono tabular. O motivo fica em Instrument Sans. São três tempos de leitura e nenhum outro texto compete com a ação.
2. **A cor nunca vem sozinha.** ▼ rosa = reduz risco, ▲ verde-menta = aumenta risco, ⊘ cinza com borda tracejada = bloqueado, ＝ cinza = manter, ◆ âmbar = atenção (pré-mercado, execução parcial, spread), ‼ rosa = crítico. Na escala de cinza continua legível pelo ícone, pela palavra e pelo tipo de borda (cheia, tracejada ou sem faixa lateral).
3. **"Ok" é cinza.** Travas e Plano aparecem como fichas cinzas com ✓, e a venda já registrada vira uma linha cinza. O verde fica só para ordens que aumentam exposição e para P&L positivo.
4. **Periwinkle = mão.** Executei (cheio), Ignorar/Voltar (contorno), ⓘ, dobras "▸ Detalhes" e opção selecionada. Botões com 46 px de altura, ⓘ com área de toque de 44 px (o círculo de 18 px fica centrado).
5. **Exposição não tem cor.** Bruta, líquida e risco aberto ficam em texto neutro com sinal explícito e barra cinza. Só o P&L leva rosa ou verde.
6. **Pré-mercado = âmbar.** A pílula PRÉ, a faixa "só ordem limitada" e a etiqueta "LIMITADA · 50% do tamanho" na ordem. No REGULAR a pílula é neutra.
7. **Crítico cobre tudo.** RSK-01 ocupa a tela com fundo quase opaco e borda rosa. Mostra o título em serifa, P&L e limite, as ordens de zerar e um único botão "Li e entendi". As ordens continuam na lista com Executei/Ignorar, então fechar o aviso não executa nada.
8. **Desktop 40/60.** À esquerda: métricas (4 em linha + risco aberto), Ordens agora, Alertas e Diário. À direita: pares em 2 colunas, abertos por padrão (pontas, subjacentes, checklist).

## Mapa componente → tela

| Componente (8.5)      | Telas                                                |
| --------------------- | ---------------------------------------------------- |
| `StatusBar`           | todas (REGULAR 1–5, 7, 8; PRÉ 6)                     |
| `MetricCard`          | 1, 2, 5 (com tooltip), 6, 7, 8                       |
| `ExposureGauge`       | 1, 2, 5, 6, 7, 8 (cartão Exposição líquida)          |
| `OrderRow`            | 1 (VENDER + BLOQUEADO), 2 (COMPRAR), 6 (limitada), 7 |
| `ExecuteSheet`        | 3 (parcial 40 de 92 + status do saldo)               |
| `CriticalOverlay`     | 4                                                    |
| `InfoTooltip`         | 5 (`pnl_dia`: O que é · Como ler · O que fazer)      |
| `PairCard`/`LegRow`   | 1, 2, 6, 8 (recolhido); 7 (aberto, 3 pares)          |
| `UnderlyingPanel`     | 7                                                    |
| `PyramidChecklist`    | 7 (aberto); 1, 2, 6, 8 (contagem na dobra)           |
| `AlertFeed`           | 7                                                    |
| `Journal`             | 7, 8                                                 |
| Estado "Nada a fazer" | 8                                                    |

`IgnoreSheet` ainda não foi desenhada (segue o mesmo padrão da folha da tela 3).

## Checklist de aprovação (8.7)

- [x] Decisão legível em menos de 3 s: a ação em serifa de 28 px é o maior texto do bloco Ordens agora e fica antes de qualquer número.
- [x] Nenhuma métrica sem ⓘ: cartões, P&L e direcional do par, pontas, limite/stop/motivo, campos da folha, seções e barra de status.
- [x] Distinguível em escala de cinza: ícone + palavra + tipo de borda (cheia, tracejada, sem faixa).
- [x] Uma cor = um sentido: nenhum verde para "ok"; âmbar só no pré-mercado, na execução parcial e no spread perto do limite.
- [x] Ações destrutivas com confirmação: Executei abre a folha (Confirmar), Ignorar abre a folha de motivo, o crítico só fecha com "Li e entendi".
- [x] Contraste ≥ 4,5:1 (medido com os valores do tema Meia-noite): `--text-3` sobre `--surface` 4,99 e sobre `--surface-2` 4,64; `--text-2` sobre `--sell-soft` 6,79; `--sell`/`--sell-soft` 6,2; `--buy`/`--buy-soft` 8,54; `--wait`/`--wait-soft` 8,29; `--accent` sobre `--surface` 7,15; `--on-accent` sobre `--accent` 7,42.

## Decisões tomadas (27/11/2026, delegadas pelo usuário)

1. **Pílula PRÉ cinza.** O âmbar fica só na faixa "só ordem limitada, tamanho 50%" (uma cor = um sentido).
2. **Ordem bloqueada recolhida numa linha** ("⊘ BLOQUEADO · ação qtd ativo" + motivo); toque abre o detalhe e a
   prévia. Não disputa atenção com a ordem executável.
3. **Crítico fecha só com "Li e entendi".** Cada zeragem é registrada uma a uma com Executei (nada registrado sem
   execução de fato).
4. **Pares = duplas de Duplas L/S** (`prefs.pairs`), sem cadastro paralelo.
