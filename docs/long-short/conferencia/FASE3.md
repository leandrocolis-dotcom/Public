# Conferência da Fase 3 com um dia real do coletor

Fonte: `api/intraday` (Yahoo, barras de 5 min com pré/pós), SOXX, baixada em 27/11/2026. Planilha:
`soxx-5m-2026-11-24-25.csv` (24 e 25/11; abrir com separador `,`). Cálculo do app (`assets/ls-market.js`)
comparado com um cálculo independente em Python, linha a linha da mesma série.

| Indicador (25/11/2026, fechamento 16:00 ET)                         | App                | Independente       | Diferença |
| ------------------------------------------------------------------- | ------------------ | ------------------ | --------- |
| VWAP regular (9:30–16:00, típico × volume)                          | 121,88395525690278 | 121,88395525690278 | 0         |
| ATR intradiário (14 candles de 15 min, média simples do true range) | 1,3657079424176897 | 1,3657079424176897 | 0         |

Na planilha: VWAP = `SOMARPRODUTO((H+L+C)/3; V) / SOMA(V)` nas linhas `reg` de 25/11.

## Achado: o Yahoo não tem volume no pré e no pós

Contagem das barras de 5 dias (27/11/2026): SOXX, SOXL, SQQQ e QQQ têm **0** barras com volume no pré (~330) e no
pós (~146); no regular, ~90% têm volume (as sem volume ficam fora da média). Consequência no app:

- VWAP estendida (desde 4:00) no PRÉ e no PÓS = média por tempo, marcada **"VWAP aproximada"** (`approx: true`).
- No pregão regular a estendida pesa só as barras com volume (na prática, a regular) e também sai como aproximada.
- O filtro de volume (rompimento, `vol_rel`) só funciona no pregão regular; no pré/pós nunca confirma.
