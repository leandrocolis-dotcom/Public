# Estudo: pesos do pêndulo e radar de virada (backtest no diário de assertividade)

> `node scripts/pend-backtest-study.mjs` → `data/pend-backtest.json` (cron diário, depois de `pend-accuracy-study.mjs`). Gerado em 2026-11-26 15:29 UTC.
> Amostra: 12048 pontos de 5 min, 42 pregões de referência; treino até 2026-11-06 (exclusive, 8184 pontos), teste depois (3864 pontos).
> Regras registradas em 26/11/2026, antes de rodar (cabeçalho de `assets/pend-backtest.js`). Modo sombra: aprovar não muda a nota; mudar pesos só por ordem do usuário.
> Material educacional; não é recomendação de investimento.

## HW: pesos dos blocos (Bolsas/Classes/VIX e vol) — **reprovada**

Atual 40/40/20. Melhor do treino (acerto 60 min): **80/20/0**. 66 combinações testadas (contam para superajuste).

- (a) ganho no teste ≥ 2 p.p.: **não** (-3.4 p.p.)
- (b) bootstrap por pregão p < 0,05: **não** (p = 0.926)
- (c) coerência no teste sem piorar > 0,05: **sim**
- (d) confirmação das trocas de faixa no teste sem piorar: **sim**

| Pesos (teste) | Acerto 60 min | ρ nota × SPY | Trocas de faixa | Confirma 30 min | Tarde à virada | Sobrava |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| Atual 40/40/20 | 59.1% | 0.89 | 35 | 50% | 90 min | 22% |
| Melhor do treino 80/20/0 | 55.7% | 0.89 | 52 | 62% | 87.5 min | 24.5% |
| Só Bolsas | 55.9% | 0.88 | 58 | 60.7% | 87.5 min | 26.5% |
| Só Classes | 56.5% | 0.84 | 53 | 48% | 80 min | 23% |
| Só VIX e vol | 56% | 0.56 | 56 | 52.7% | 65 min | 28.5% |

Referência "só o preço" (lado do SPY nos 30 min anteriores → 60 min seguintes, amostra toda): 50.6% em 10750 pontos.

Dez melhores no treino:

| Pesos | Acerto 60 min (treino) | ρ | Confirma 30 min |
| --- | ---: | ---: | ---: |
| 80/20/0 | 55.1% | 0.82 | 47.2% |
| 90/10/0 | 54.9% | 0.79 | 52.9% |
| 60/30/10 | 54.6% | 0.85 | 40.8% |
| 70/30/0 | 54.6% | 0.84 | 42.9% |
| 80/10/10 | 54.6% | 0.8 | 49.2% |
| 90/0/10 | 54.5% | 0.77 | 51.3% |
| 70/20/10 | 54.4% | 0.82 | 55% |
| 50/30/20 | 54.3% | 0.85 | 49.1% |
| 100/0/0 | 54.3% | 0.77 | 51.9% |
| 40/40/20 | 54.2% | 0.86 | 46.7% |

## HR: radar de virada × troca de faixa — **reprovada**

- (a) radar confirmado chega ≥ 15 min antes à virada do mercado: **sim**
- (b) sobra ≥ 10 p.p. a mais do movimento: **não**
- (c) confirma em 30 min em ≥ 55%, com ≥ 20 eventos: **não**

| Gatilho | Eventos | Confirma 30 min | Confirma 60 min | SPY 30 min no sentido (z médio) | Vai e volta | Tarde à virada | Sobrava |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| Troca de faixa | 80 | 48.1% | 55.1% | 0 | 7.5% | 90 min | 23% |
| Radar ⚠ tendência | 356 | 48.4% | 47.6% | -0.01 | — | 57.5 min | 25% |
| Radar ‼ confirmada | 134 | 51.9% | 52% | 0.03 | — | 62.5 min | 22% |

## Como ler

- Pontos vizinhos se sobrepõem; o bootstrap sorteia pregões inteiros para não contar o mesmo movimento várias vezes. Com poucas semanas, a tendência é reprovar: o diário cresce todo dia e o estudo se refaz sozinho.
- Radar no diário: trilha de 3 h dentro do mesmo pregão de referência (no app a referência fica fixa na de agora; perto das 16h os dois diferem) e preço do SPY aproximado (pesa 10% na força, fora das regras de confirmação).
- Aprovar não muda nada sozinho. Próximo passo, se aprovar com amostra maior: o usuário decide trocar os pesos de `STRENGTH_W_LIVE`/módulos ou passar a avisar pelo radar.
