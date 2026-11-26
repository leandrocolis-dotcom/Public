# Plano de implementação do pêndulo (pós-P1, 20/11/2026)

Plano para outras sessões continuarem. Ler antes: `docs/ROADMAP-PENDULO.md` (pesquisa e P1) e
`docs/ESTUDO-PENDULO.md` (resultado). Material educacional; não é recomendação de investimento.

## Objetivo

O pêndulo da Início passa a ter **duas leituras**, sem trocar o motor oficial:

1. **Regime por janela** (a nota atual, `regime()` de `assets/dash.js`): **1D = regime do dia (padrão)**, 5D, 1M e 3M,
   as mesmas janelas da Visão geral (`DASH_H`). O usuário escolhe a janela para olhar o curto ou o longo prazo.
2. **Pano de fundo (longo prazo)**: linha fixa embaixo do pêndulo, igual em qualquer janela, com o que o estudo P1
   mostrou ter mais poder para "deixar de perder": SPY × MM200 e crédito (HYG/IEF).

Por quê (P1, fora da amostra 2012–2026, alvo = queda > 10% em 63 pregões): MM200 simples skill 0,091; crédito
HYG/IEF 0,074–0,079; regime atual h=21 0,042 > h=1 0,034. O 2.0 de 6 forças (0,032) foi reprovado e **não** entra.

## Regras que valem em todas as fases

- **Oficial não muda sem ordem do usuário:** avisos 🧭 (`assets/mkt-regime-alerts.js`, push), "Como andou o regime"
  (`assets/regime-history.js`), pêndulo da carteira (`assets/port-pendulum.js`), `views.js:80` e a decisão continuam
  em `h=1`. A janela escolhida só muda o que a Início **mostra**.
- Prévia fora do pregão (futuros e pré/pós) só vale no 1D, como na Visão geral (`assets/dash.js:565-567`):
  `regime(close, h, h === 1 && preview ? quotes : null, { world: h === 1 ? quotes : null })`.
- Lógica nova em módulo **puro** com testes em `tests/`; tela só monta HTML. Nada pesado na Vercel (regra do projeto).
- Antes de push: `npm run lint`, `npm run format:check`, `npm test` (e `npm run preload` se criar módulo). Merge no
  `main`, push e conferir o deploy (conector Vercel, projeto `etf-portfolio`, SHA em READY).
- Hipótese nova só com regra e critério registrados **antes** de rodar (cabeçalho do script), como no P1.

## Fases

| Fase                      | Entrega                                                                        | Depende de  | Status                  |
| ------------------------- | ------------------------------------------------------------------------------ | ----------- | ----------------------- |
| J1 Janela do pêndulo      | Seletor 1D/5D/1M/3M no pêndulo da Início                                       | —           | entregue 20/11          |
| J2 Pano de fundo          | Linha de longo prazo: SPY × MM200 + crédito 60d                                | —           | entregue 20/11          |
| J3 Estudo P1b (HP6)       | MM200 + crédito × MM200 sozinha; regime h=63                                   | —           | reprovada 20/11         |
| J4 Probabilidade de queda | % de queda > 10% em 3 meses no pano de fundo                                   | J3 aprovada | não sai (HP6 reprovada) |
| J5 Diário fora da amostra | Cron grava a leitura diária; ≥ 2 meses antes de qualquer uso em aviso/carteira | J2          | entregue 20/11          |

J1, J2 e J3 são independentes (podem rodar em paralelo). Ordem sugerida: J1 → J2 → J3 → J4 → J5.

### J1: janela do pêndulo (1D regime do dia + 5D/1M/3M)

Arquivos: `assets/home-view.js` (`viewHome`, `rgMemo` na linha ~699), `assets/events.js` (clique), `assets/state.js`
(pref nova), testes em `tests/home-view*.test.js`.

1. Pref nova `prefs.pendH` (padrão `"1d"`), separada de `prefs.dashH` para a Início e a Visão geral não se puxarem.
2. `viewHome`: `const hk = ctx.prefs?.pendH in DASH_H ? … : "1d"`, `h = DASH_H[hk]`; o memo passa a guardar `h`
   (`rgMemo.h !== h` refaz). Chamada como na regra acima (prévia só no 1D).
3. Botões no cartão do pêndulo: `1D Hoje · 5D · 1M · 3M` (`data-pend-h`, `aria-pressed`), botões grandes no celular.
   Rótulo da leitura: 1D "Regime do dia", 5D "Últimos 5 pregões", 1M "Último mês", 3M "Últimos 3 meses".
4. `events.js`: `d.pendH && DASH_H[d.pendH]` → grava `state.prefs.pendH`, `savePrefs()`, `render()` (como `dashH`).
5. Fora do 1D, esconder o selo "prévia"/sessão e dizer "fechamentos" (não há prévia de 3 meses).
6. Dados: `data/flow.json` tem 300 pregões; `sdChange(s, 63)` usa 250 + 63 → 237 variações (≥ 20, ok). Se faltar
   série, mostrar "sem dados para 3M" em vez de nota.

Testes: nota existe em cada janela com `flow.close` de 300 pontos; 1D com `quotes` usa a prévia e 3M não; trocar a
pref não muda a nota que vai para `mkt-regime-alerts` (continua h=1).
Aceite: no app, clicar 1D/5D/1M/3M move a agulha; recarregar mantém a janela; avisos 🧭 iguais aos de antes.

### J2: pano de fundo (longo prazo)

Arquivos: `assets/backdrop.js` (puro, novo) + `tests/backdrop.test.js`; linha no cartão do pêndulo em
`assets/home-view.js`; frase em `TAB_INFO`/ajuda se couber.

`backdrop(close)` com `flow.close` (SPY, HYG, IEF já estão lá):

- `trend`: SPY ÷ MM200 − 1 (distância %) e lado (acima/abaixo); dias desde o último cruzamento.
- `credit`: variação de 60 pregões de HYG/IEF (%) e lado (alargando = negativo).
- `state`: `"defesa"` se SPY abaixo da MM200 **e** crédito alargando; `"atenção"` se só um dos dois; `"favorável"`
  se nenhum. Histerese de 2 pregões para não piscar na fronteira (entra/sai só depois de 2 fechamentos seguidos).
- Texto curto: "Longo prazo: SPY 4,2% abaixo da MM200 · crédito −1,8% em 60d → defesa".

Fica igual em qualquer janela do J1. Modo sombra: só leitura, não gera aviso nem mexe na carteira.
Testes: série sintética acima/abaixo da MM200, crédito subindo/caindo, histerese, série curta (< 200) → `null`.

### J3: estudo P1b (HP6), antes de pôr número de probabilidade na tela

Script `scripts/backdrop-study.mjs` (pronto em 20/11/2026) + opção `backdrop` em `.github/workflows/model-study.yml` → `data/backdrop-study.json`
e `docs/ESTUDO-PANO-DE-FUNDO.md`. Rodar no Actions (Yahoo é bloqueado no ambiente das sessões).

Registrar no cabeçalho ANTES de rodar:

- **HP6:** logística com [SPY/MM200 − 1, variação 60d de HYG/IEF] tem Brier skill > MM200 sozinha (0,091) e
  bootstrap em blocos de 63 com p ≤ 0,10.
- **HP7:** regime atual com h=63 tem skill > h=1 (registro para a escolha da janela padrão de longo prazo).
- Mesmo protocolo do P1 (2008–2026, ano a ano desde 2011, expurgo de 63, mesma taxa base, mesmos quintis).
- Gravar os coeficientes do último treino (expansivo até hoje) em `data/backdrop-model.json`.

Reprovada → J4 não sai; o J2 continua só como leitura de lados (sem %).

### J4: probabilidade de queda (só se J3 aprovada)

`assets/backdrop.js` ganha `dropProb(close, model)` com os coeficientes de `data/backdrop-model.json`; a linha do pano
de fundo mostra "chance de queda > 10% em 3 meses: 18% (base 11%)". Atualização do modelo uma vez por ano (cron).

### J5: diário fora da amostra

Cron diário existente (`train-model.yml`) acrescenta `scripts/backdrop-journal.mjs` → `data/backdrop-journal.json`
(data, estado do J2, nota por janela h=1/5/21/63, % do J4). Depois de ≥ 2 meses, relatório na mesma tela do
aprendizado. Usar o pano de fundo em avisos 🧭, no alvo de beta da carteira ou na decisão **só por ordem do usuário**.

## Status em 20/11/2026

- **J1 e J2 em produção:** seletor 1D (regime do dia)/5D/1M/3M no pêndulo da Início (`prefs.pendH`, `PEND_WIN`/`pendWin`
  em `assets/home-view.js`) e linha "Longo prazo" (`assets/backdrop.js`, `backdropHtml`). Avisos, histórico e
  pêndulo da carteira seguem em h=1.
- **J3 reprovada** (`docs/ESTUDO-PANO-DE-FUNDO.md`): MM200 + crédito 0,060 × MM200 sozinha 0,071 (p = 0,85); h=63 ≈
  h=1 (0,023 × 0,024). O estado do pano de fundo separa bem o risco (queda > 10% em 63d: defesa 18,2%, atenção
  16,7%, favorável 8,2%; base 11,6%), então a linha fica na tela como leitura, **sem** porcentagem (J4 não sai).
- **J5 em produção:** `scripts/backdrop-journal.mjs` no cron `train-model.yml` → `data/backdrop-journal.json` (notas
  das 4 janelas + estado do pano de fundo por pregão; resultado de 63 pregões anotado depois). Revisar a partir de
  fev/2027 (≥ 2 meses com resultado só em fev/2027 + 63 pregões).
- **HP8 reprovada** (`docs/ESTUDO-PANO-DE-FUNDO-HP8.md`): estado só pela MM200 0,030 × estado de 3 níveis 0,037
  (p = 0,54). A tela fica com o estado de 3 níveis.
- **Plano encerrado em 20/11/2026.** Pendente só a revisão do diário (J5) a partir de fev/2027; mudar avisos,
  carteira ou decisão com base nele só por ordem do usuário. Hipótese nova exige registro antes de rodar.

## Riscos

- Janela longa atrasa em fundos em V (2020): por isso o 1D continua padrão e o pano de fundo é separado.
- 3M com 300 pregões fica no limite: se `data/flow.json` encolher, a nota de 3M some (tratar `null`).
- Duas notas na mesma tela podem confundir: o pano de fundo é texto curto, não uma segunda agulha.
