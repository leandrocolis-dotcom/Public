# Erros nos dados: como corrigimos (diagnóstico de 20/11/2026)

## Mapa das correções (da fonte à tela)

| Camada            | Onde                                                         | O que corrige                                                                                                                             |
| ----------------- | ------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------- |
| Robô da base      | `scripts/update_prices.py` → `data/prices.json`, `flow.json` | Ativo sem dado repete o último preço e fica marcado (`last_real`); câmbio `=X` recua 1 dia (`fix_fx_dates`)                               |
| Robô da base      | `scripts/price_guard.py` (novo, 20/11)                       | A base nunca anda para trás: calendário mais curto não é gravado; ativo dos EUA que perdeu o último pregão mantém o valor publicado       |
| Robô da base      | `scripts/fut-adjust.mjs`                                     | Futuro contínuo trocado pelo contrato vigente (contínuo congelado, salto falso na rolagem); barra da noite descartada (`isEveningFutBar`) |
| Robô da base      | `scripts/update-hist.mjs` (`mergeBars`)                      | Fechamento antigo que mudou > tolerância = desdobramento: baixa os 2 anos de novo                                                         |
| Antes de publicar | `scripts/verify-data.mjs`                                    | Formato, datas, lacunas, saltos > 10 desvios, motor recalculado: erro (✗) impede o commit                                                 |
| App               | `assets/live.js` (`overlay`)                                 | Último pregão recebe o preço ao vivo; ponto anterior vira o `pc` oficial da cotação (se a diferença < 25%); split detectado e reescalado  |
| App               | `assets/live-feed.js` (`mergeLive`)                          | Pacote mais velho que o dado que o app já tem não sobrescreve                                                                             |
| App               | Laboratório › Verificação (`assets/checks.js`)               | Mostra o que divergiu: base × cotação, Yahoo × Nasdaq, variações > 15%, posições sem preço                                                |

Ver também `docs/COERENCIA.md` (variação do dia igual em todas as telas) e `docs/FUTUROS.md`.

## Diagnóstico de 20/11/2026 (cotações das 13:35 UTC × base publicada)

1. **Corrigido: a base perdia o último pregão à noite.** As rodadas do cron que o GitHub atrasa para depois da
   meia-noite UTC recebiam do Yahoo o histórico sem o pregão do dia. Em 40 publicações (03 a 20/11), 7 noites
   tiraram o último pregão de 183 a 194 ativos (ex.: 05/11 01:00 UTC, de 04/11 voltou a 03/11) e em 20/11 02:26
   UTC 36 ETFs voltaram a repetir o preço de 18/11 no lugar do de 19/11 (MTUM 65,21 em vez de 63,90). Na tela o
   app escondia o erro (preço ao vivo e fechamento anterior oficial por cima); robôs e estudos que leem a base
   gravavam o dado velho por horas. Correção: `scripts/price_guard.py`, testado nos dois casos reais.
2. **Aberto: bolsas da Ásia com data deslocada.** `^HSI`, `^TWII`, `^AXJO` guardam o fechamento local de 19/11 na
   linha de 18/11 e, na de 19/11, o preço do meio da sessão de 20/11 capturado na rodada da noite. O dia mostrado
   no app está certo (vem da cotação: `localMove` no regime e `pc` no overlay); o erro fica na série histórica
   (médias e desvios dessas razões). Precisa conferir a data das barras no Yahoo (fuso) antes de mexer, como foi
   feito com o câmbio.
3. **Aberto: `^MERV` parado desde 16/10/2026.** A cotação do Yahoo não atualiza há 35 dias e o ativo não tem
   histórico no `flow.json`; o quadro "Bolsas Américas" mostra um preço velho.
4. **Corrigido: falso alarme na Verificação:** UVIX (+24%) aparece em "variações acima de 15% sem alavancagem" porque o
   pacote do canal não traz o nome e o UVIX não estava em `KNOWN_LEVERAGED` (corrigido: UVIX 2x e SVIX inverso).
5. **Esperado, não é erro:** futuros de boi e porco (`LE=F`, `HE=F`: último negócio × ajuste oficial) e cripto
   (referência de 24 h × fechamento UTC) divergem da base todo dia; o app usa o `pc` oficial na tela.
