# Plano de implementação — Tela Long & Short do Pêndulo

Versão 1.0 · 27/11/2026 · especificação de referência: doc "Pêndulo — Regras de bolso para Long/Short com ETFs alavancados", `docs/long-short/pendulo-regras.json` (schema v4) e `docs/long-short/pendulo_motor_ref.py`, no repositório `leandrocolis-dotcom/etf-portfolio`.

> **Pronto quando:** a tela Long & Short mostra, para cada par e para a carteira, a ordem certa (ativo, lado, quantidade, limite, stop, motivo), atualizada a cada preço coletado e a cada mudança na Carteira, das 4:00 às 20:00 ET; todos os testes de `docs/long-short/pendulo_motor_ref.py` passam também contra o código do app (porte em vitest); cada número da tela tem tooltip com "o que é / como ler / o que fazer"; deploy publicado e URL conferida.

---

## 0. Como usar este arquivo com o Claude Code

1. Os arquivos já estão no repositório `leandrocolis-dotcom/etf-portfolio` (branch `main`): este plano em `docs/PLANO-LONG-SHORT.md`, as regras em `docs/long-short/pendulo-regras.json` e o motor de referência em `docs/long-short/pendulo_motor_ref.py`. O `CLAUDE.md` aponta para eles.
2. Abra o Claude Code no repositório e cole o prompt abaixo.
3. Uma fase por vez. Cada fase termina com testes passando, commit e push no `main` (convenção do repositório) e, quando o site muda, deploy conferido.

### Prompt para colar no Claude Code

```
OBJETIVO
Implementar a tela Long & Short do Pêndulo seguindo docs/PLANO-LONG-SHORT.md, fase por fase, na ordem. A tela calcula e mostra, para cada par e para a carteira, qual ordem executar (ativo, lado, quantidade, preço limite, stop, motivo), lendo dados das abas que o app já tem.

CONTEXTO
- Sou leigo em programação; você executa e entrega pronto. Pergunte só antes de algo irreversível (apagar dados reais, DROP/DELETE em massa, force push).
- A especificação de regras está em docs/long-short/pendulo-regras.json (parâmetros, métricas, motor, 33 alertas). A implementação de referência e os testes estão em docs/long-short/pendulo_motor_ref.py (Python, rode com python3). O app deve produzir os mesmos resultados.
- Siga o CLAUDE.md do repositório: módulos puros em assets/ + view separada, vitest, sessão única em assets/sessions.js, cotações só por fetchQuotes (assets/quote-hub.js), números por num/pct (separador decimal), edições na nuvem (assets/settings-sync.js), linguagem visual Prumo Noturno (docs/design/FILOSOFIA.md), lint/format:check/test antes de push, push direto no main e conferência do deploy na Vercel.
- A antiga tela Pares e seu motor foram removidos a meu pedido em 25/11/2026. Long & Short é um módulo novo: não ressuscite o código antigo.
- O app não envia ordens à corretora: eu executo manualmente e registro.

O QUE TORNA ISSO DIFÍCIL
- Fórmula errada vira ordem errada com dinheiro real: sinais (dir, tipo), arredondamentos e limites precisam bater com a referência.
- Dados persistidos são contrato: as abas atuais já têm dados reais.
- A tela precisa ser legível em segundos, no celular, com o mercado andando.

REGRAS (com o porquê)
1. Comece pela Fase 0: leia docs/ARQUITETURA.md, o código relevante e escreva docs/long-short/MAPEAMENTO.md antes de mudar qualquer coisa. Porque os nomes do plano são sugestões e o app real manda.
2. Mudanças de dados só aditivas, com versão e migração que lê o formato antigo; backup antes de qualquer UPDATE em massa; RLS ativo se for Supabase. Porque há dados reais.
3. O motor é código puro (sem UI, sem rede, sem relógio implícito): recebe estado + parâmetros + horário e devolve ordens e alertas. Porque assim dá para testar com os mesmos casos da referência.
4. Porte o motor de docs/long-short/pendulo_motor_ref.py para um módulo JS puro e os testes para vitest, mantendo-os passando a cada commit. Porque são a prova de que o motor está certo.
5. Parâmetros vêm de docs/long-short/pendulo-regras.json (copiado para um módulo de config do app ou espelhado em pendulo_settings), nunca números soltos no código. Porque vou ajustar parâmetros sem mexer em lógica.
6. Toda métrica, botão e alerta tem tooltip vindo de um único arquivo de textos (seção 9 do plano). Porque preciso saber interpretar e agir em cada campo.
7. Não esconda erro com try/catch genérico nem valor padrão; dado inválido gera o alerta EXE-01 e nenhuma quantidade. Porque um zero silencioso vira ordem errada.
8. Menor mudança que resolve; não reescreva arquivos inteiros sem necessidade; avise se a mudança afetar outra parte do app.
9. Antes de dizer "pronto": build, lint, testes e o fluxo principal testado no navegador (desktop e celular). Diga exatamente o que ficou sem teste.
10. Ao concluir cada fase: npm run lint, npm run format:check, npm test; commit pequeno em português, push no main e confirmação do deploy (conector Vercel, projeto etf-portfolio, SHA em READY + rota aberta). Nunca force push.

FORMATO DE SAÍDA AO FIM DE CADA FASE
3 a 5 bullets para leigo: o que mudou, link do deploy, como testar, riscos, próximo passo.
```

---

## 1. Princípios de implementação

| Princípio                                                                                        | Por quê                                                            |
| ------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------ |
| Motor puro e determinístico: `calcular(estado, parametros, agora) → {ordens, alertas, metricas}` | Mesmo insumo, mesma saída: testável e auditável                    |
| Paridade com a referência: os casos de `pendulo_motor_ref.py` rodam contra o código do app       | Garante que fórmulas, sinais e arredondamentos batem               |
| Tudo em America/New_York internamente; exibição em America/Sao_Paulo                             | Horário de verão muda em datas diferentes nos dois países          |
| Bloqueio por finalidade (entrar/aumentar), nunca por lado                                        | Cobertura de short é compra que reduz risco e não pode ser travada |
| Dados aditivos e versionados (`schema_version` 4)                                                | O app já tem dados reais                                           |
| Decisão em fonte grande, contexto recolhível                                                     | Operar em segundos, no celular                                     |
| Cor nunca sozinha: cor + ícone + texto                                                           | Legibilidade sob pressão e acessibilidade                          |
| Tooltip em tudo, de um único arquivo de textos                                                   | Interpretação consistente e fácil de revisar                       |

### 1.1 Encaixe no Pêndulo atual (lido no repositório em 27/11/2026)

| O que já existe                                                                           | Como usar                                                                                            |
| ----------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| `assets/sessions.js` (regra de sessão única do app e do robô)                             | Base do relógio PRÉ/REGULAR/PÓS/FECHADO; acrescentar só o que faltar (fechamento antecipado, marcos) |
| `assets/quote-hub.js` (`fetchQuotes`) e o robô `quotes-feed` (15 s, pré/pregão/pós)       | Única fonte de cotação da tela; nunca chamar `api/quotes` direto                                     |
| `api/intraday` (barras de 5 min com pré/pós) e `data/hist/<ATIVO>.csv` (diário de 2 anos) | Insumos de VWAP, ATR, faixa de abertura, MM20, beta e correlação                                     |
| `pendulo_portfolio` / Ponte BTG (`assets/btg.js`)                                         | Posições da Carteira; vínculo a pares e campos novos em tabela própria, sem mexer na foto do BTG     |
| Carteira › 📒 Diário (`assets/journal.js`, nuvem `pendulo_journal`)                       | Registrar execuções e "seguida/ignorada" no diário existente, com motivo = ID do alerta              |
| `assets/settings-sync.js` (`pendulo_settings`, `WHOLE`/`FIELDS`)                          | Parâmetros e Plano do dia sincronizados na nuvem                                                     |
| `assets/format.js` (`num`, `pct`, `decSep`)                                               | Todo número da tela                                                                                  |
| Edge Function `push` (`alertsFor`, pg_cron a cada minuto)                                 | Fase posterior: alertas críticos do Long & Short como push com o app fechado                         |
| `assets/state.js` (`TABS`, `GROUPS`, `TAB_INFO`)                                          | Aba nova `longshort` na seção Carteira, com frase no `TAB_INFO`                                      |
| `docs/design/FILOSOFIA.md` (Prumo Noturno) e `assets/themes.css`                          | Cores, fontes e medidas da tela (seção 8)                                                            |

---

## 2. Arquitetura

```
Abas existentes (Carteira, Preços, Ativos)        Abas novas (Calendário, Parâmetros, Plano do dia, Câmbio, Diário)
                 \                                   /
                  ▼                                 ▼
            [1 Leitura e validação de dados]  → EXE-01 se inválido
                           │
            [2 Relógio e sessão]  PRE / REGULAR / POS / FECHADO, calendário NYSE
                           │
            [3 Indicadores de mercado]  VWAP, VWAP estendida, ATR_intra, ATR_d, MM20, faixa de abertura, PMH/PML, gap, cruzamentos, volume relativo, beta/correlação 60d
                           │
            [4 Métricas]  posição → par → carteira
                           │
            [5 Motor]  classificação, prioridades P0–P8, quantidades, limites, bloqueios
                           │
            [6 Alertas e travas]  33 alertas, dedupe 15 min
                           │
            [7 Livro de ordens e diário]  estados manuais, idempotência, seguida/ignorada
                           │
            [8 Persistência e reconciliação]
                           │
            [9 Tela Long & Short]  6 blocos + tooltips
```

Arquivos sugeridos, no padrão do repositório (módulo puro + view; confirmar na Fase 0):

```
assets/ls-params.js      parâmetros (espelho de docs/long-short/pendulo-regras.json) + leitura de pendulo_settings
assets/ls-tooltips.js    todos os textos de tooltip (seção 9)
assets/ls-clock.js       marcos do dia e fechamento antecipado, por cima de assets/sessions.js (puro)
assets/ls-market.js      indicadores: VWAP, ATR, faixa de abertura, gap, beta, correlação (puro)
assets/ls-metrics.js     métricas de posição, par e carteira (puro)
assets/ls-engine.js      motor: lado, cenário, prioridades, quantidades, limites, bloqueios (puro)
assets/ls-alerts.js      33 alertas + dedupe (puro)
assets/ls-orders.js      ciclo de vida manual das ordens + idempotência (puro)
assets/ls-view.js        tela Long & Short (seção 8)
tests/ls-*.test.js       porte de docs/long-short/pendulo_motor_ref.py + casos da seção 10
supabase/                tabelas novas pendulo_ls_* com RLS por usuário
```

---

## 3. Modelo de dados (tudo aditivo)

| Aba / tabela                                             | Campos novos                                                                                                                                                                                                                                     | Observação                                                                    |
| -------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------- |
| `pendulo_ls_positions` (vínculo às posições da Carteira) | `ticker`, `par_id`, `perna` (long/short), `dir` (+1/−1), `stop_vigente`, `hwm`, `parcial_feita`, `aluguel_confirmado`, `taxa_aluguel_aa`, `aluguel_data_ref`, `aluguel_fonte`, `recall_registrado`                                               | Posições sem `par_id` aparecem no grupo "Sem par"                             |
| `pendulo_ls_orders` (nova)                               | `id`, `par_id`, `ticker`, `finalidade` (ENTRAR/AUMENTAR/REDUZIR/ZERAR), `lado`, `qtd_sugerida`, `qtd_executada`, `preco_limite`, `preco_medio_exec`, `stop_proposto`, `motivo` (ID do alerta/prioridade), `status`, `criado_em`, `atualizado_em` | Status: SUGERIDA, ENVIADA, PARCIAL, EXECUTADA, CANCELADA, REJEITADA, EXPIRADA |
| `pendulo_ls_fills` (nova)                                | `id_unico`, `ordem_id`, `qtd`, `preco`, `custos`, `ts`                                                                                                                                                                                           | Cada registro aplicado no máximo uma vez                                      |
| Preços                                                   | `quote_ts`, `bid`, `ask`, candles de 5 min com volume das 4:00 às 20:00 ET, candles diários, coleta do subjacente de cada ETF, VIX, SPY                                                                                                          | Sem volume: VWAP vira média por tempo, com aviso "VWAP aproximada"            |
| Ativos                                                   | `id_permanente`, `alavancagem`, `tipo` (bull/bear), `subjacente`, `beta_60d`                                                                                                                                                                     | `id_permanente` não muda com o ticker                                         |
| Calendário (nova)                                        | feriados e fechamentos antecipados NYSE, eventos macro e balanços (`data`, `hora_et`, `evento`, `ativos_afetados`, `fonte`)                                                                                                                      | Validado antes das 4:00 ET                                                    |
| Parâmetros (`pendulo_settings`)                          | espelho de `parametros` do JSON, com `versao` e histórico                                                                                                                                                                                        | Incluir as chaves em `WHOLE`/`FIELDS` de `assets/settings-sync.js`            |
| Plano do dia (`pendulo_settings`)                        | por par: `vies`, `gatilho_entrada`, `exposicao_direcional_planejada`; `capital_dia`; `preenchido_em`                                                                                                                                             | Sem plano, compras bloqueadas (PRE-01)                                        |
| Câmbio (nova)                                            | `data`, `usd_brl`, `fonte`                                                                                                                                                                                                                       | Só para o diário em reais                                                     |
| Diário (existente, `pendulo_journal`)                    | acrescentar `alerta_id`, `seguido`, `pnl_r_resultante`, `justificativa`                                                                                                                                                                          | Base do teste de 2 semanas; não criar diário paralelo                         |
| `pendulo_ls_state` (nova)                                | contadores do dia, alertas ignorados em 30 min, entradas do dia, stops por ativo, pico de capital, `schema_version`, `versao_parametros`                                                                                                         | Reconciliado ao abrir o app                                                   |

**Migração v1→v4:** posições antigas recebem `dir` = +1, `hwm` = máximo(preço médio, preço atual) (mínimo se dir = −1), `stop_vigente` = stop atual ou vazio (gera alerta para definir). Testar com um registro antigo antes de aplicar a todos.

---

## 4. Fases

Cada fase termina com: testes da fase passando, build e lint limpos, commit em português. Deploy a partir da Fase 6.

### Fase 0 — Descoberta (sem mudar código)

- Ler `docs/ARQUITETURA.md`, `docs/ON-OFF-MARKET.md`, `docs/BTG-PONTE.md`, `assets/sessions.js`, `assets/quote-hub.js`, `assets/journal.js` e a seção 1.1 deste plano: de onde vêm posições, cotações ao vivo, barras de 5 min e histórico diário.
- Responder no `docs/long-short/MAPEAMENTO.md`: nomes reais de abas e campos; o coletor guarda **volume** por candle? guarda **bid/ask** e horário da cotação? coleta pré e pós-mercado? qual intervalo de coleta?
- Listar campos novos necessários (seção 3) com o nome que terão no app.

**Aceite:** `docs/long-short/MAPEAMENTO.md` com respostas objetivas; lista do que falta no coletor; nenhum arquivo do app alterado.

### Fase 1 — Dados, cadastro e migração

- Criar campos e tabelas novos (aditivos) e a migração v1→v4, com backup prévio.
- Telas simples de cadastro: Ativos (alavancagem, tipo, subjacente), Parâmetros (valores do JSON), Plano do dia, vincular posições a pares.
- Ajustar o coletor, se a Fase 0 apontar falta: subjacentes, VIX, SPY, volume, bid/ask, `quote_ts`, sessão estendida.

**Aceite:** um registro antigo migrado corretamente e conferido; leitura de todas as abas sem erro; backup salvo.

### Fase 2 — Relógio, sessão e calendário

- `sessao(agora)` → PRE / REGULAR / POS / FECHADO, em America/New_York, com feriados e fechamento antecipado.
- Próximo marco e contagem regressiva (faixa de abertura, 15:00, 15:45, 16:00, 19:45, 20:00, e os equivalentes em dia de fechamento antecipado).
- Reset dos contadores às 4:00 ET; preço de referência do dia = último preço do pós anterior.

**Aceite:** testes com datas de troca de horário de verão (1/nov/2026, 14/mar/2027, 7/nov/2027), um feriado e um dia de fechamento às 13:00.

### Fase 3 — Indicadores de mercado

- VWAP (desde 9:30) e VWAP estendida (desde 4:00), ATR_intra (14, candles de 15 min agregados dos de 5), ATR_d (14), MM20 e inclinação, viés, PMH/PML, faixa de abertura, gap em % e em ATR, cruzamentos da VWAP, volume relativo, rompimento, beta e correlação 60d contra SPY.
- Fallback sem volume: média por tempo + aviso.

**Aceite:** testes com série sintética de valores conhecidos; comparação com 1 dia real do coletor (VWAP e ATR conferidos em planilha).

### Fase 4 — Métricas e motor (o núcleo)

- Métricas de posição, par e carteira conforme `metricas` do JSON.
- Motor: lado da ordem por finalidade e `dir`; classificação de cenário; prioridades P0–P8; arredondamento; fórmulas de entrada e pyramiding (sem crédito de lucro); exposição depois da ordem; teto de risco; stop monótono; devolução por preço; coerência direcional; bloqueios por finalidade; preço limite por sessão.
- Portar **todos** os testes de `docs/long-short/pendulo_motor_ref.py` (exemplo numérico, casos-limite, 20.000 testes de propriedade, controles da revisão 2) e os casos da seção 10.

**Aceite:** 100% dos testes portados passando; o exemplo devolve 154 / 277 / reduz 92 / soma 46 / stop 30,36 / líquida +7.786,50 / bruta 29.653,50.

### Fase 5 — Alertas e travas

- 33 alertas do JSON, com prioridade, bloqueio e mensagem com variáveis preenchidas.
- Dedupe de 15 min por alerta e posição, exceto se a prioridade subir.
- Travas de carteira (RSK, BEH, CAL, EXE) e bloqueio sem desbloqueio manual para RSK-01.

**Aceite:** um teste por alerta disparando e não disparando; teste de que nenhuma trava bloqueia REDUZIR/ZERAR.

### Fase 6 — Design no canvas (antes de codar a tela)

Ver seção 8. Produzir no canvas de design as telas listadas, em celular e desktop, nos estados descritos; validar com você; só então codar.

**Aceite:** você aprova os mockups dos 6 blocos, do card de par, da folha "Executei" e do estado crítico.

### Fase 7 — Tela Long & Short (código)

- Componentes da seção 8, com tokens de design, tooltips da seção 9, estados de carregamento, vazio, dado velho e crítico.
- Atualização a cada preço e a cada mudança na Carteira, sem recarregar a página.

**Aceite:** fluxo principal testado no navegador em celular (390 px) e desktop (1440 px); todos os campos com tooltip; deploy publicado e URL conferida.

### Fase 8 — Livro de ordens, execução e diário

- Botões "Executei" (folha com quantidade e preço efetivos, custos) e "Ignorar" (com justificativa para alertas não críticos).
- Estados manuais da ordem; pergunta do saldo em execução parcial; idempotência por `id_unico`.
- Diário: seguidas vs ignoradas, P&L de cada grupo, P&L líquido, P&L em reais por fluxo.

**Aceite:** testes de duplicidade, parcial com saldo aberto e encerrado; diário batendo com os registros.

### Fase 9 — Persistência e reconciliação

- Gravar estado no momento da mudança; ao abrir o app, reconciliar Carteira, ordens abertas, stops e preços antes de liberar compras.
- Divergência ou migração incompleta → compras bloqueadas com aviso claro.

**Aceite:** fechar o app no meio de uma ordem parcial e reabrir: estado idêntico, compras bloqueadas até reconciliar.

### Fase 10 — Modo registro (2 semanas) e ajuste de parâmetros

- Rodar com dinheiro real só seguindo ou ignorando alertas, sem mudar regras.
- Relatório ao fim: P&L e drawdown de seguidas vs ignoradas, alertas mais ignorados, travas mais acionadas.

**Aceite:** relatório gerado; decisão de manter ou ajustar parâmetros registrada.

---

## 5. Ordem de prioridade se o tempo apertar

1. Fases 0, 1, 4 e 5 (dados, motor, alertas): sem elas a tela mostra números errados.
2. Fases 6 e 7 (design e tela): sem elas o motor não ajuda na hora de operar.
3. Fases 8 e 9 (execução e estado): sem elas a posição diverge da realidade com o tempo.
4. Fases 2 e 3 completas em sessão estendida, calendário especial e beta/correlação podem entrar numa segunda passada, desde que o motor bloqueie compras quando o dado faltar.

---

## 6. Riscos de implementação e mitigação

| Risco                                     | Mitigação                                                                    |
| ----------------------------------------- | ---------------------------------------------------------------------------- |
| Coletor sem volume ou sem bid/ask         | Fallback documentado + alerta; corrigir coletor na Fase 1                    |
| Sinal invertido em ETF bear ou short real | Testes de paridade e de propriedade obrigatórios                             |
| Dados antigos quebrados pela migração     | Backup, migração aditiva, teste com registro antigo                          |
| Tela poluída, decisão escondida           | Design no canvas antes do código; regra "decisão em fonte grande"            |
| Relógio errado em troca de horário        | Fuso por nome (America/New_York), nunca soma fixa; testes nas datas de troca |
| Operar sem plano ou com dado velho        | PRE-01 e EXE-01 bloqueiam compras                                            |

---

## 7. Fora do escopo desta versão

Envio automático de ordens à corretora; apuração fiscal (o diário só exporta os fluxos); backtest histórico; notificações push fora do app (avaliar depois da Fase 10).

---

## 8. Design da tela

### 8.1 Princípios visuais

1. **Uma pergunta por tela:** "o que eu faço agora?". O bloco "Ordens agora" é o protagonista.
2. **Hierarquia por tamanho:** ação, quantidade e ativo em 24–28 px; métricas em 18–20 px; contexto em 13–14 px.
3. **Mobile-first:** coluna única em 390 px; em desktop, duas colunas (ordens e carteira à esquerda, pares à direita).
4. **Linguagem do app: Prumo Noturno** (`docs/design/FILOSOFIA.md`), com os temas já existentes em `assets/themes.css`. Nenhuma cor nova em hex: só variáveis do tema.
5. **Números tabulares** (`font-variant-numeric: tabular-nums`) e alinhados à direita, para comparar de relance.
6. **Uma cor, um sentido (regra do app), sempre com ícone e texto:** verde-menta = risco/alta, rosa = defesa/queda, âmbar = só atenção, periwinkle = interação, cinza = parado/bloqueado. Nunca verde para "tudo certo" ou "fechado".
7. **Contexto recolhível:** detalhes de ponta e subjacente começam fechados no celular.
8. **Três tempos de leitura (regra do app):** primeiro a resposta (a ação, em Instrument Serif), depois o número (Geist Mono), depois o detalhe (Instrument Sans).
9. **Botões grandes:** alvo mínimo de 44 × 44 px; ações destrutivas pedem confirmação.

### 8.2 Tokens de design (variáveis de `assets/themes.css`)

| Significado na tela             | Variável                                                                       | Uso                                                    |
| ------------------------------- | ------------------------------------------------------------------------------ | ------------------------------------------------------ |
| Fundo e cartões                 | `--bg`, `--surface`, `--surface-2`, `--surface-3`, `--line`                    | Estrutura                                              |
| Texto                           | `--text`, `--text-2`, `--text-3` (≥ 4,5:1)                                     | Resposta, número, detalhe                              |
| ENTRAR / AUMENTAR (risco, alta) | `--buy` / `--buy-soft` (verde-menta)                                           | Ordens que aumentam exposição; P&L positivo            |
| REDUZIR / ZERAR (defesa, queda) | `--sell` / `--sell-soft` (rosa)                                                | Ordens que reduzem risco; P&L negativo; crítico        |
| Atenção                         | `--wait` / `--wait-soft` (âmbar)                                               | Alertas de atenção, travas perto do limite, dado velho |
| Interação                       | `--accent` / `--accent-soft` (periwinkle)                                      | Botões Executei/Ignorar, ⓘ, links, foco                |
| Parado / bloqueado / manter     | `--text-3`, `--tile-neutral` (cinza)                                           | BLOQUEADO, MANTER, mercado fechado, travas ok          |
| Raio e espaçamento              | os do app (`assets/styles.css`)                                                | Sem valores novos                                      |
| Fontes                          | Instrument Serif (resposta), Instrument Sans (interface), Geist Mono (números) | Três tempos de leitura                                 |

P&L positivo e negativo usam `--buy` e `--sell`, sempre com sinal (+/−) explícito. Crítico = `--sell` com ícone ‼ e texto, nunca só a cor.

### 8.3 Layout — celular (390 px)

```
┌──────────────────────────────────────┐
│ ● REGULAR  10:15 ET · 12:15 BRT   ⓘ  │  Barra de status (fixa)
│ Faixa de abertura encerrada · 15:00 em 4h45 │
│ Travas: ✓ ok (cinza)  Plano: ✓     ⓘ  │
├──────────────────────────────────────┤
│ P&L dia   +US$ 101,70  +0,81R  ⓘ     │  4 cards em grade 2×2
│ Limite    ████████░░ US$ 601 ⓘ        │
│ Bruta 1,23x / 2,0  ⓘ │ Líquida −0,08x ⓘ │
│ Risco aberto 2,0R / teto 4R  ⓘ        │
├──────────────────────────────────────┤
│ ORDENS AGORA                      ⓘ  │  Protagonista
│ ┌──────────────────────────────────┐ │
│ │ ▼ VENDER 92 SQQQ                  │ │  28 px serif, --sell (rosa)
│ │ limite 19,69 · P3 reduzir perdedora ⓘ│
│ │ [ Executei ]        [ Ignorar ]   │ │
│ └──────────────────────────────────┘ │
│ ┌──────────────────────────────────┐ │
│ │ ⊘ BLOQUEADO · aumentar SOXL       │ │  cinza (--text-3)
│ │ aguarda reduzir a perdedora (P6) ⓘ │ │
│ │ após executar a venda: COMPRAR 46 │ │
│ └──────────────────────────────────┘ │
├──────────────────────────────────────┤
│ PARES                                 │
│ ┌ Semis vs Nasdaq · Cenário 1 ⓘ ────┐ │
│ │ P&L par +0,82R ⓘ  Direcional +0,31x / plano 0 ⓘ │
│ │ LONG  SOXL 3x bull  154 · +1,48R ⓘ │ │
│ │ SHORT SQQQ 3x bear  277 · −0,66R ⓘ │ │
│ │ ▸ Detalhes das pontas e subjacentes │ │  recolhido
│ │ ▸ Checklist de pyramiding (5/7) ⓘ  │ │
│ └────────────────────────────────────┘ │
├──────────────────────────────────────┤
│ ALERTAS (20)                       ⓘ  │
│ 10:14 DEC-01 Mercado confirmou SOXL…  │
├──────────────────────────────────────┤
│ DIÁRIO DO DIA  seguidas 4 · ignoradas 1 ⓘ │
└──────────────────────────────────────┘
```

### 8.4 Layout — desktop (1440 px)

```
┌───────────────────────────── Barra de status (largura total) ─────────────────────────────┐
├──────────────── Coluna esquerda (40%) ─────────────┬──────── Coluna direita (60%) ────────┤
│ Métricas da carteira (4 cards em linha)            │ Cards de pares, 2 por linha,          │
│ ORDENS AGORA (lista completa)                      │ detalhes abertos por padrão           │
│ Alertas                                            │                                       │
│ Diário do dia                                      │                                       │
└────────────────────────────────────────────────────┴───────────────────────────────────────┘
```

### 8.5 Componentes

| Componente         | Conteúdo                                                                                                                         | Estados                                                                                                    |
| ------------------ | -------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| `StatusBar`        | Sessão (pílula), relógio ET e BRT, próximo marco com contagem, estado das travas (cinza ✓ / âmbar / rosa), botão do Plano do dia | PRE, REGULAR, POS, FECHADO, dia especial (CAL-01)                                                          |
| `MetricCard`       | Rótulo, valor grande, subvalor (R ou %), barra ou marcador, ⓘ                                                                    | Normal, âmbar (> 80% do limite), rosa (limite)                                                             |
| `ExposureGauge`    | Marcador entre −1,5x e +1,5x com zona segura                                                                                     | Dentro, perto do limite, fora                                                                              |
| `OrderRow`         | Seta + AÇÃO + quantidade + ativo (grande); limite, stop, motivo (pequeno); Executei/Ignorar                                      | Normal, BLOQUEADO (cinza, com o motivo do bloqueio), PARCIAL (residual), crítico                           |
| `ExecuteSheet`     | Folha inferior: quantidade e preço efetivos (pré-preenchidos), custos, status do saldo se parcial                                | Confirmar desabilitado até quantidade > 0                                                                  |
| `IgnoreSheet`      | Motivo obrigatório para alertas de risco; aviso de contagem BEH-01                                                               | —                                                                                                          |
| `PairCard`         | Nome, cenário, P&L do par, direcional efetiva × planejada, correlação, 2 `LegRow`, áreas recolhíveis                             | Normal, mesmo subjacente (aviso estrutural), fora do plano (PAR-01)                                        |
| `LegRow`           | Perna, ticker, L e tipo, quantidade, P&L em R, stop vigente, lado da VWAP                                                        | Expandida: preço médio, preço, HWM, devolução, concentração, decaimento, pregões, spread, idade da cotação |
| `UnderlyingPanel`  | Preço vs VWAP, faixa de abertura, PMH/PML, gap, cruzamentos, viés, ATR                                                           | VWAP aproximada (aviso)                                                                                    |
| `PyramidChecklist` | 7 gatilhos com ✓/✗ e o valor atual de cada um                                                                                    | Todos ✓ = botão de aumento habilitado na ordem P6                                                          |
| `AlertFeed`        | Hora, ID, mensagem, cor por prioridade                                                                                           | Crítico fixa no topo até ser lido                                                                          |
| `CriticalOverlay`  | Cobre a tela em RSK-01, RSK-02, BEH, EXE-01 em massa e falha de estado                                                           | Só fecha com "Li e entendi"                                                                                |
| `Journal`          | Seguidas vs ignoradas, P&L de cada grupo, ajustes por ponta                                                                      | —                                                                                                          |
| `InfoTooltip` (ⓘ)  | Ver 9.1                                                                                                                          | Hover (desktop), toque (celular)                                                                           |

### 8.6 Estados globais da tela

| Estado                       | Como aparece                                                             |
| ---------------------------- | ------------------------------------------------------------------------ |
| Carregando                   | Esqueleto dos cards; nenhuma ordem até os dados estarem completos        |
| Sem plano do dia             | Faixa vermelha no topo "Preencha o plano para liberar compras" + botão   |
| Dado velho / VWAP aproximada | Selo amarelo no card afetado, com tooltip explicando o efeito            |
| Nada a fazer                 | Card cinza "Nada a fazer: manter" no lugar das ordens                    |
| Trava ativa                  | Travas em rosa; entradas e aumentos aparecem como BLOQUEADO com o motivo |
| Mercado fechado              | Tela em modo revisão: diário, plano de amanhã, nenhuma ordem             |

### 8.7 Roteiro para o canvas de design (Fase 6)

Prompt para o canvas de design:

```
Desenhe a tela "Long & Short" de um app pessoal de trading (Pêndulo), na linguagem visual Prumo Noturno (docs/design/FILOSOFIA.md: fundo azul de madrugada; verde-menta = risco/alta, rosa = defesa/queda, âmbar só atenção, periwinkle = interação, cinza = parado; Instrument Serif para a resposta, Geist Mono para números, Instrument Sans para a interface), mobile-first (390 px) e versão desktop (1440 px). A tela responde a uma pergunta: "o que eu faço agora?". Use as variáveis, o layout e os componentes da seção 8 do plano anexo. Telas a desenhar:
1. Celular, pregão regular, 2 ordens (VENDER 92 SQQQ em rosa; aumento de SOXL BLOQUEADO em cinza, com o motivo "aguarda reduzir a perdedora"), 1 par com cenário 1.
2. Celular, logo depois de registrar a venda: COMPRAR 46 SOXL em verde-menta, com novo stop 30,36.
3. Celular, folha "Executei" aberta, com execução parcial e pergunta sobre o saldo.
4. Celular, estado crítico (limite diário atingido) cobrindo a tela.
5. Celular, tooltip aberto num MetricCard, mostrando "O que é / Como ler / O que fazer".
6. Celular, pré-mercado (pílula PRÉ, aviso de só ordem limitada).
7. Desktop, duas colunas, 3 pares.
8. Celular, "Nada a fazer: manter".
Regras: ação + quantidade + ativo em 28 px; números tabulares; cor sempre com ícone e texto; alvos de toque ≥ 44 px; nada de gráficos decorativos.
```

Checklist de aprovação dos mockups: decisão legível em menos de 3 segundos; nenhuma métrica sem ⓘ; cores distinguíveis também em escala de cinza; uma cor = um sentido (nenhum verde para "ok"); ações destrutivas com confirmação; contraste mínimo de 4,5:1 nos textos. Salvar a prancha aprovada em `docs/design/LONG-SHORT.md` + `long-short-canvas.png`, como as outras telas do app.

---

## 9. Tooltips

### 9.1 Padrão de implementação

- Todos os textos num único arquivo (`assets/ls-tooltips.js`), chaveados pelo ID do campo. A tela nunca tem texto de tooltip escrito direto no componente.
- Estrutura fixa, três linhas curtas: **O que é** · **Como ler** · **O que fazer**. No máximo 280 caracteres no total.
- Valores dinâmicos entre chaves são preenchidos em tempo real (ex.: "Você está a {x}% do limite").
- Gatilho: ícone ⓘ ao lado do rótulo; hover no desktop, toque no celular; fecha ao tocar fora; acessível por teclado (foco abre) e por leitor de tela (`aria-describedby`).
- Teste automatizado: todo componente com métrica ou botão tem uma chave de tooltip existente.

### 9.2 Catálogo

#### Barra de status

| ID                | O que é                                                                                                   | Como ler                                                                               | O que fazer                                                       |
| ----------------- | --------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------- | ----------------------------------------------------------------- |
| `sessao`          | Fase do dia de negociação nos EUA: PRÉ (4:00–9:30 ET), REGULAR (9:30–16:00), PÓS (16:00–20:00) ou FECHADO | Cada sessão tem regras próprias de tamanho, tipo de ordem e aumentos                   | No PRÉ e no PÓS, use só ordem limitada; no PÓS, só reduza ou zere |
| `relogio`         | Hora em Nova York e em Brasília                                                                           | Regras são definidas em ET; a diferença muda com o horário de verão americano          | Guie-se pelo horário ET nas regras                                |
| `proximo_marco`   | Próximo horário que muda o que é permitido                                                                | Ex.: fim da faixa de abertura, 15:00 (fim dos aumentos), 15:45 (checagem de overnight) | Termine o que precisa antes do marco                              |
| `semaforo_travas` | Estado das travas de risco da carteira                                                                    | Cinza ✓: nada ativo; âmbar: algum indicador acima de 80% do limite; rosa: trava ativa  | Âmbar: não aumente risco; rosa: só reduza ou zere                 |
| `plano_dia`       | Seu plano escrito antes da primeira ordem                                                                 | Sem plano, o app bloqueia compras                                                      | Preencha viés, gatilho e exposição direcional de cada par         |
| `dia_especial`    | Feriado ou fechamento antecipado da bolsa                                                                 | As janelas do dia foram recalculadas                                                   | Confira os novos horários antes de operar                         |

#### Métricas da carteira

| ID                   | O que é                                                                                         | Como ler                                                        | O que fazer                                                   |
| -------------------- | ----------------------------------------------------------------------------------------------- | --------------------------------------------------------------- | ------------------------------------------------------------- |
| `pnl_dia`            | Resultado do dia desde as 4:00 ET, aberto + realizado, em US$, R e %                            | Inclui o gap da noite; 1R = US$ {R}                             | Se chegar a −4R (−2%), o app manda zerar tudo                 |
| `limite_restante`    | Quanto você ainda pode perder hoje antes do bloqueio                                            | Barra cheia = longe do limite                                   | Abaixo de 20%: não abra nada novo                             |
| `exp_bruta`          | Soma das exposições de todas as posições, já multiplicadas pela alavancagem, em vezes o capital | Mede o tamanho total da aposta; limite 2,0x                     | Perto do limite, reduza antes de aumentar qualquer coisa      |
| `exp_liquida`        | Exposição comprada menos vendida, ajustada pela alavancagem, em vezes o capital                 | Positivo = apostando na alta; negativo = na baixa; limite ±1,5x | Fora do que você planejou? Reduza o lado dominante            |
| `risco_aberto_total` | Quanto você perderia se todos os stops fossem atingidos agora, em R                             | Teto = menor entre 4R e o limite diário restante                | No teto, só reduções são permitidas (RSK-04)                  |
| `drawdown`           | Queda do capital desde o pico                                                                   | Limite −15%                                                     | Atingiu: pausa de 2 semanas para revisar o diário             |
| `R`                  | Valor de 1R: o quanto você aceita perder por ponta (0,5% do capital)                            | Todas as quantidades são calculadas a partir dele               | Para arriscar menos, reduza o 1R nos Parâmetros, nunca o stop |

#### Ordens agora

| ID              | O que é                                                                                            | Como ler                                                                   | O que fazer                                                          |
| --------------- | -------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------- | -------------------------------------------------------------------- |
| `ordens_agora`  | Lista do que fazer agora, por prioridade                                                           | De cima para baixo: risco primeiro, oportunidade depois                    | Execute na ordem; ignore só com motivo                               |
| `acao`          | O que fazer: VENDER, COMPRAR, COMPRAR PARA COBRIR, VENDER A DESCOBERTO, ZERAR, MANTER ou BLOQUEADO | Rosa reduz risco; verde-menta aumenta; cinza está bloqueado ou é manter    | Execute exatamente a ação e a quantidade indicadas                   |
| `quantidade`    | Número de cotas da ordem                                                                           | Calculado por risco (1R), concentração, exposição e teto de risco          | Não arredonde para cima                                              |
| `preco_limite`  | Preço máximo (compra) ou mínimo (venda) sugerido                                                   | Regular: ask/bid; pré e pós: com folga para executar                       | Use ordem limitada neste preço                                       |
| `stop_proposto` | Novo stop após a ordem                                                                             | O stop só se aproxima do preço, nunca se afasta                            | Atualize o stop na corretora ao executar                             |
| `motivo`        | Regra que gerou a ordem (ID do alerta ou prioridade)                                               | P0–P4 são saídas de risco; P5 parcial; P6 aumento; P7 entrada              | Toque para ver a regra completa                                      |
| `bloqueado`     | Ordem que as regras não permitem agora                                                             | O motivo mostra o limite que travou                                        | Não force; resolva o motivo ou espere                                |
| `executei`      | Registra o que você executou de fato                                                               | Quantidade menor que a sugerida vira execução parcial                      | Informe quantidade, preço e custos reais                             |
| `ignorar`       | Marca que você decidiu não seguir                                                                  | Conta no diário; 2 alertas de risco ignorados em 30 min bloqueiam entradas | Escreva o motivo; ele serve para revisar depois                      |
| `residual`      | Parte de uma ordem que ainda não foi executada                                                     | Enquanto o saldo estiver aberto, não surge nova ordem com o mesmo objetivo | Marque se o saldo ainda está aberto na corretora ou se foi cancelado |

#### Card do par

| ID                     | O que é                                                                 | Como ler                                            | O que fazer                                                                        |
| ---------------------- | ----------------------------------------------------------------------- | --------------------------------------------------- | ---------------------------------------------------------------------------------- |
| `cenario`              | Situação do par (1 a 9) pela matriz de decisão                          | Ex.: 1 = long certo e short errado; 5 = dia lateral | Siga a ordem gerada; o rótulo é contexto                                           |
| `pnl_par`              | Soma do P&L das duas pontas, em R                                       | É o resultado da aposta de força relativa           | Devolveu 50% do máximo do dia: reduza; 75%: zere                                   |
| `direcional_efetiva`   | Exposição do par ajustada pelo beta de cada subjacente contra o S&P 500 | Mostra quanto o par aposta na direção do mercado    | Diferença acima de 0,25x do plano bloqueia aumentos: reequilibre ou revise o plano |
| `direcional_planejada` | A exposição direcional que você definiu no plano (0 = neutro)           | É a referência para a efetiva                       | Mude só no plano, de forma deliberada                                              |
| `correlacao`           | Correlação dos retornos diários dos dois subjacentes, 60 pregões        | Abaixo de 0,50 o par deixa de se proteger           | Abaixo do mínimo, sem aumentos (PAR-01)                                            |
| `mesmo_subjacente`     | Pontas no mesmo índice, uma bull e outra bear                           | Exposição perto de zero e decaimento em dobro       | Repense a estrutura: use subjacentes diferentes                                    |
| `checklist_pyramiding` | Os 7 gatilhos obrigatórios para aumentar a ponta vencedora              | Todos ✓ = aumento liberado                          | Um ✗ basta para não aumentar                                                       |

#### Ponta (posição)

| ID                   | O que é                                                                        | Como ler                                                             | O que fazer                                                        |
| -------------------- | ------------------------------------------------------------------------------ | -------------------------------------------------------------------- | ------------------------------------------------------------------ |
| `perna`              | Lado da ponta no par: long ou short                                            | Short pode ser compra de ETF inverso ou venda a descoberto           | Confira o tipo antes de operar                                     |
| `alavancagem_tipo`   | Multiplicador diário (2x/3x) e direção (bull/bear) do ETF                      | Bear sobe quando o subjacente cai                                    | —                                                                  |
| `quantidade_pos`     | Cotas que você tem                                                             | Vem da aba Carteira                                                  | Corrija na Carteira se divergir da corretora                       |
| `preco_medio`        | Custo médio da posição                                                         | Não entra na decisão; serve só para o P&L                            | Nunca aumente para "melhorar o preço médio"                        |
| `pnl_r_ponta`        | Resultado da ponta em R                                                        | +1R = ganhou o que aceitava perder                                   | Em +1R, suba o stop; em +2R, parcial de 1/3                        |
| `stop_vigente`       | Preço de saída obrigatória                                                     | Só se aproxima do preço; nunca se afasta                             | Mantenha a ordem de stop na corretora; fora do pregão, o app avisa |
| `hwm`                | Melhor preço a favor desde a última mudança de preço médio                     | Base para medir a devolução                                          | —                                                                  |
| `devolucao`          | Quanto do melhor movimento o preço já devolveu                                 | 50% = reduzir metade; 75% = zerar                                    | Siga a ordem gerada                                                |
| `lado_vwap`          | Se o subjacente está do lado que favorece a ponta, em relação à VWAP           | "A favor" sustenta a posição                                         | Contra a VWAP, não aumente                                         |
| `concentracao`       | Peso da posição no capital                                                     | Limite 25%                                                           | No limite, aumentos bloqueados                                     |
| `decaimento`         | Diferença entre o que o ETF rendeu e alavancagem × subjacente, desde a entrada | Acima de 3 p.p. contra você, a volatilidade está comendo o resultado | Saia (SWG-01)                                                      |
| `pregoes_carregados` | Fechamentos desde a entrada                                                    | Máximo 5 (3x) ou 10 (2x)                                             | Venceu: saia, ganhando ou perdendo                                 |
| `spread`             | Diferença entre compra e venda, em % do preço                                  | Acima de 0,30%, o custo de entrar é alto                             | Não entre agora; reduzir continua permitido                        |
| `idade_cotacao`      | Segundos desde a última cotação                                                | Acima de 10 s (regular) ou 30 s (pré/pós), o preço não é confiável   | Espere a atualização; entradas ficam bloqueadas                    |
| `aluguel`            | Custo diário de manter a venda a descoberto                                    | Valor vendido × taxa anual ÷ 360                                     | Taxa alta corrói o resultado de posições longas                    |
| `recall`             | Pedido da corretora para devolver as cotas alugadas                            | Gera ordem de cobertura imediata                                     | Cubra a posição já                                                 |

#### Subjacente

| ID                 | O que é                                                               | Como ler                                                 | O que fazer                                       |
| ------------------ | --------------------------------------------------------------------- | -------------------------------------------------------- | ------------------------------------------------- |
| `vwap`             | Preço médio do dia ponderado por volume, desde 9:30                   | Acima = compradores no controle; abaixo = vendedores     | Só aumente long acima; short (ou ETF bear) abaixo |
| `vwap_estendida`   | VWAP desde as 4:00, usada no pré e no pós                             | Referência quando o pregão regular não começou           | Mesma leitura da VWAP                             |
| `vwap_aproximada`  | Aviso de que o coletor não tem volume                                 | A VWAP vira média por tempo e o filtro de volume desliga | Dê menos peso aos sinais de rompimento            |
| `faixa_abertura`   | Máxima e mínima de 9:30 a 9:45                                        | Rompimento com volume indica a direção do dia            | Não opere dentro da faixa nos primeiros 15 min    |
| `pmh_pml`          | Máxima e mínima do pré-mercado                                        | Rompidas na abertura, reforçam o sinal                   | Use como confirmação extra                        |
| `gap`              | Distância entre o preço e o fechamento anterior, em % e em ATR diário | Acima de 1,5 ATR, a abertura tende a ser instável        | Entre só depois da faixa de abertura              |
| `cruzamentos_vwap` | Quantas vezes o preço trocou de lado da VWAP no dia                   | 4 ou mais = dia lateral                                  | Sem aumentos; o decaimento joga contra            |
| `atr_intra`        | Oscilação típica em candles de 15 min                                 | Define a distância do stop (1,5×)                        | —                                                 |
| `atr_d`            | Oscilação típica diária                                               | Mede gap e movimento esticado (1 ATR)                    | —                                                 |
| `vies`             | Tendência diária pela média de 20 dias e sua inclinação               | Alta, baixa ou neutro                                    | Neutro: metade do tamanho                         |
| `volume_relativo`  | Volume do candle contra a média da faixa de abertura                  | ≥ 1,5x confirma rompimento                               | Rompimento sem volume não conta                   |
| `beta`             | Sensibilidade do subjacente ao S&P 500 em 60 pregões                  | Beta 1,5 anda 1,5% para cada 1% do índice                | Usado na exposição direcional do par              |

#### Alertas e diário

| ID                   | O que é                                                               | Como ler                                                                  | O que fazer                                              |
| -------------------- | --------------------------------------------------------------------- | ------------------------------------------------------------------------- | -------------------------------------------------------- |
| `alertas`            | Últimos 20 avisos das regras                                          | Rosa ‼ crítico, periwinkle ação sugerida, âmbar atenção, cinza informação | Críticos primeiro; toque para ver a regra                |
| `prioridade_critico` | Alerta que bloqueia ou exige ação imediata                            | Fica fixo até você confirmar a leitura                                    | Aja antes de qualquer outra coisa                        |
| `diario`             | Registro de alertas seguidos e ignorados e do resultado de cada grupo | Comparação que mostra se as regras pagam                                  | Revise no fim do dia e no fim das 2 semanas              |
| `pnl_liquido`        | Resultado depois de corretagem, taxas e aluguel                       | É o número que importa                                                    | Custos altos? Opere menos vezes                          |
| `pnl_brl`            | Resultado em reais, cada fluxo pelo câmbio do seu dia                 | Diferente de multiplicar o total pelo câmbio de hoje                      | Use para o controle patrimonial, não para decidir ordens |

#### Folhas e formulários

| ID                   | O que é                                                        | Como ler                                                   | O que fazer                                                                          |
| -------------------- | -------------------------------------------------------------- | ---------------------------------------------------------- | ------------------------------------------------------------------------------------ |
| `exec_quantidade`    | Cotas executadas de fato                                       | Menor que a sugerida = execução parcial                    | Informe o número da nota da corretora                                                |
| `exec_preco`         | Preço médio executado                                          | Base do novo preço médio e do stop                         | Use o preço da nota, não o da tela                                                   |
| `exec_custos`        | Corretagem e taxas da execução                                 | Entram no P&L líquido                                      | Copie da nota da corretora                                                           |
| `saldo_status`       | Situação do restante de uma execução parcial                   | Aberto bloqueia nova ordem igual; encerrado libera o motor | Confira na corretora antes de responder                                              |
| `plano_vies`         | Sua leitura de direção para o par hoje                         | Alta, baixa ou neutro                                      | Baseie no gráfico diário, antes do mercado abrir                                     |
| `plano_gatilho`      | Preço ou condição que libera a entrada                         | Sem gatilho atingido, nada de entrada                      | Escreva um número, não uma intenção                                                  |
| `plano_direcional`   | Exposição direcional que o par pode ter (beta-ajustada)        | 0 = neutro; positivo = viés de alta                        | Defina antes de operar; mudar no meio do dia é sinal de impulso                      |
| `evento_corporativo` | Split, grupamento ou mudança de ticker detectado ou cadastrado | Ordens no ativo ficam suspensas                            | Confirme o fator pelo comunicado do emissor ou extrato; o app só ajusta depois disso |

#### Parâmetros

| ID                        | O que é                                           | Como ler                      | O que fazer                                                        |
| ------------------------- | ------------------------------------------------- | ----------------------------- | ------------------------------------------------------------------ |
| `param_r`                 | Percentual do capital arriscado por ponta         | Padrão 0,5%; faixa 0,25% a 1% | Reduza em fases ruins; aumente só com histórico positivo no diário |
| `param_perda_diaria`      | Perda máxima do dia                               | Padrão 2%                     | Não aumente depois de um dia ruim                                  |
| `param_stop_atr`          | Múltiplo do ATR que define o stop                 | Padrão 1,5                    | Stop mais largo = posição menor, mesmo risco                       |
| `param_spread`            | Spread máximo para entrar                         | Padrão 0,30%                  | Mais apertado no pré e no pós protege de execução ruim             |
| `param_desvio_direcional` | Desvio máximo entre exposição efetiva e planejada | Padrão 0,25x o capital        | Menor = disciplina maior no hedge                                  |
| `param_aluguel_base`      | Base de dias do custo de aluguel                  | Padrão 360                    | Ajuste para a convenção da sua corretora                           |

---

## 10. Testes de aceite finais

Além do porte integral de `docs/long-short/pendulo_motor_ref.py`:

| Caso                                      | Esperado                                                                          |
| ----------------------------------------- | --------------------------------------------------------------------------------- |
| Exemplo numérico da especificação         | 154 / 277 / reduz 92 / soma 46 / stop 30,36 / líquida +7.786,50 / bruta 29.653,50 |
| Zerar short real com compras suspensas    | COMPRAR PARA COBRIR liberado                                                      |
| Ordem que atravessa o zero (−1,4x + 3,0x) | Quantidade cortada até \|E_pos\| ≤ 1,5x                                           |
| Posição de 1 cota, parcial P5             | Nenhuma ordem                                                                     |
| Execução parcial 40/100, saldo aberto     | Bloqueia nova ordem com o mesmo objetivo                                          |
| Mesmo registro aplicado 2 vezes           | Posição muda uma vez                                                              |
| ETF −45%, subjacente −5%                  | Alerta ETF-01, carteira intacta                                                   |
| Desvio direcional +0,40x com plano 0      | Entradas e aumentos bloqueados                                                    |
| Aluguel US$ 20.000, 12% a.a., 10 dias     | US$ 66,67 (base 360)                                                              |
| Troca de horário 14/mar/2027              | Pré-mercado às 5:00 BRT                                                           |
| Fechamento antecipado às 13:00 ET         | Aumentos até 12:00, checagem às 12:45                                             |
| Cotação com 31 s no pré                   | EXE-01, compras bloqueadas                                                        |
| Tooltip em todos os campos                | Teste automatizado sem chaves faltando                                            |
| Celular 390 px                            | Ação, quantidade e ativo legíveis sem rolar, logo abaixo das métricas             |

---

## 11. Entrega de cada fase (para leigo)

Ao fim de cada fase, o Claude Code responde com:

- O que mudou, em uma frase.
- Link do deploy (https://etf-portfolio-ten.vercel.app, quando o site mudar) e confirmação de que abre.
- Como testar em 2 minutos.
- Riscos ou o que ficou sem teste.
- Próximo passo.
