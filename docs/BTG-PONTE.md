# Ponte BTG → aba Carteira

O MCP do BTG usa o login do usuário no Claude; o app na Vercel não o acessa e não guarda credencial do BTG.

**Fluxo:** tarefa agendada do Claude `btg-carteira-diaria` (dias úteis, 20h30, com o app do Claude aberto; se estiver fechado, roda ao abrir) → lê o BTG (só leitura) → `pendulo_btg_apply(user, snapshot)` no Supabase → o app lê em `syncCloud`.

- `pendulo_portfolio.holdings`: ações e ETFs do exterior (`source = "BTG"`). Posição digitada à mão fora do BTG é mantida.
- `pendulo_broker`: foto das contas (CDB, fundos, trânsito, caixa, PTAX), backup `prev_holdings` e status. RLS: o usuário só lê a própria linha; só a função grava.
- `pendulo_btg_apply`: sem acesso para `anon`/`authenticated`. Recusa snapshot vazio, com campo inválido, ticker repetido, mais antigo que o atual ou cuja soma difira mais de 1% do total investido; nesses casos a carteira não muda e o cartão mostra o aviso.
- Não gravar número de conta, CGE, CNPJ ou nome do titular.
- Tela: `assets/btg.js` (puro), bloco "Contas BTG" no topo da Carteira (23/11/2026): cartões (patrimônio total, Brasil, internacional, resultado internacional sobre custo, dia ao vivo, desde a foto anterior), barra por classe (renda fixa, fundos, caixa, ações/ETFs EUA, caixa US$) e as duas carteiras por ativo. Internacional usa o preço ao vivo da carteira (`*` = preço da foto). Brasil: classe pelo nome (`onshoreClass`), vencimento tirado do nome; coluna "Aplicado · resultado" só aparece quando a leitura traz `cost` (valor aplicado, opcional; pedido ao robô desde 23/11/2026). Aberto/recolhido de cada carteira em `prefs.btgOpen`.
- Tempo real (23/11/2026): o MCP do BTG é uma foto sob pedido (cada leitura passa por um modelo e leva 1 a 2 min no Mac), não um fluxo de preços. Por isso o bloco mantém as **quantidades** da última foto e reprecifica o internacional com as cotações ao vivo do app (as mesmas da tabela de posições, `quoteOf`/robô de 15 s) e converte para reais pelo dólar ao vivo (`BRL=X`); sem dólar ao vivo, usa o câmbio implícito da foto. O topo mostra "● ao vivo N/M ativos às hh:mm · dólar …". Brasil segue a foto (renda fixa e fundos são precificados uma vez por dia). **Pré e pós-mercado (23/11/2026):** a carteira inteira (e o bloco BTG) usa o último negócio estendido do próprio ativo (`xp`, mais novo que o regular) em qualquer modo On/Off, inclusive acima do implícito pelo futuro; a foto do BTG só dá quantidade e preço médio. O app avisa presença ao robô de cotações a cada 5 min mesmo sem o canal em tempo real conectado (antes, sem o canal, o robô sob demanda não rodava e o preço ficava parado). Operação feita depois da foto só entra na próxima leitura.
- **Posição histórica** (25/11/2026): `pendulo_broker_daily` guarda uma foto COMPLETA por dia de Brasília (gatilho em `pendulo_broker`: a última leitura do dia vence); pg_cron `pendulo-broker-daily` às 23h59 de Brasília (02:59 UTC) fecha o dia sem leitura com a foto vigente (`carried = true`). Carteira › Histórico (sub-aba `phist`; `assets/pf-history.js`, puro): ◀ data ▶ mostra patrimônio, variação contra o dia anterior, resultado e as posições daquela foto; dia sem foto usa a última antes dele; dias antes de 25/11/2026 só têm o total (`pendulo_broker_hist`). SQL em `supabase/btg-bridge.sql`.
- **Rentabilidade real do exterior** (25/11/2026): `get_offshore_performance` do MCP gravado por `pendulo_offperf_apply(user, kind, resposta)` em `pendulo_offshore_perf` (kind `d` = diário do CURRENT_MONTH com retorno do dia em % sem aportes, resultado US$, aportes/saques e Nasdaq/MSCI World; kind `m` = fim de cada mês desde a abertura, do INCEPTION_TO_DATE, com acumulado TWR). No mensal, `value`/`yield`/fluxos são só do último dia do mês: usar `acc`/`acc_pl`. Carteira › Histórico: cartão "Exterior · rentabilidade real" (Mês, Ano, 12 meses, Desde o início × Nasdaq e MSCI World + gráfico base 100) e "Exterior no dia" ao escolher uma data (dias sem foto das posições, desde jul/2024, mostram o último saldo do BTG). `assets/offshore-perf.js` (puro). Carga inicial em 25/11/2026 (27 meses + 7 dias de novembro); o BTG publica com atraso (dados até 10/11 na carga). Para manter em dia, a rotina agendada precisa do passo 5 (ver abaixo); a instrução da rotina só pode ser mudada na conversa dela.
- Histórico: `pendulo_broker_hist` (um ponto por foto aceita, só totais), gravado por gatilho em `pendulo_broker`; alimenta "Desde a foto anterior" e "Em N fotos". A variação inclui aportes, resgates e câmbio. Sem a tabela, o app segue sem esses cartões.
- O BTG não abre a carteira dos fundos do Brasil (só o saldo de cada fundo); a quebra mais fina disponível é por produto.

**Carteira única (23/11/2026):** com foto do BTG, ela substitui a carteira manual na tela: cartões do BTG no topo, tabela 🌎 Internacional e tabela 🇧🇷 Brasil no mesmo desenho (`.pf-t`, `brazilTable`), com filtro, ordenação e Colunas. Ativos da foto não têm ✎; somem + Ativo e Importar da barra. Peso = valor ÷ conta com caixa.

**Leitura na nuvem (23/11/2026):** o conector BTGPactual está no claude.ai e a leitura funciona numa sessão na nuvem (teste gravado: 6 posições, `pendulo_broker_hist` com 2 pontos). Tarefa agendada `BTG carteira na nuvem` (recriada em 23/11/2026: `trig_01SCyK3DEDybNNMbWADitqac`, dias úteis 10h41, 13h41, 16h41, 19h41 e 22h41 de Brasília, nova sessão por disparo; a anterior `trig_018xpRKNFk1XgWK8ZEB9jhpT` tinha sumido): lê o BTG, monta a foto, roda `checkSnapshot` e grava por `pendulo_btg_apply` via Supabase `execute_sql`. Criada sem conectores (esta organização não aceita escolher conectores pela ferramenta; teste de 23/11/2026 09h42 UTC confirmou: "BTG indisponível na sessão agendada"): se a sessão disparada não receber BTG/Supabase, ela responde "BTG indisponível na sessão agendada"; nesse caso recriar a rotina pela tela de rotinas do claude.ai marcando os conectores BTGPactual e Supabase. Renda fixa grava `cost = totalInitialInvestment`; fundos não trazem valor aplicado.

**Como roda de fato (23/11/2026, 09h51 UTC):** rotinas novas criadas pela ferramenta não carregam conectores nesta organização (testado duas vezes: "BTG indisponível na sessão agendada"). A leitura agendada passou a disparar **na própria sessão do Claude que tem BTGPactual e Supabase** (`trig_01DFLyF3dauFDZrB2J7xWjMV`, "BTG carteira na nuvem (nesta sessão)", dias úteis 10h41/13h41/16h41/19h41/22h41 de Brasília, sessão `session_01TGcyGMzvduYrjJmNumfYc4`). Primeira foto por esse caminho: 23/11/2026 06h50 de Brasília, 8 posições, aprovada por `checkSnapshot` e por `pendulo_btg_apply`. Se essa sessão for arquivada, recriar a rotina pela tela de rotinas do claude.ai com os conectores marcados.

**Situação em 24/11/2026:** a rotina ativa é `trig_018xpRKNFk1XgWK8ZEB9jhpT` ("BTG carteira na nuvem"), agora em dias úteis 10h41/13h41/16h41/19h41/22h41 de Brasília, mas **sem conectores** (a ferramenta segue recusando `connectors` nesta organização), então responde "BTG indisponível". A foto de 23/11 22h43 ficou velha (ANT, QQQ, SQQQ e CORD já vendidos); foto de 24/11 13h00 gravada à mão por uma sessão com BTG + Supabase (8 posições). Para voltar a rodar sozinha: claude.ai › rotinas › "BTG carteira na nuvem" › Editar › marcar BTGPactual e Supabase (mantém a URL/token do botão).

**Diagnóstico do tempo de retorno (24/11/2026, 20h):** o botão disparava a rotina, a sessão subia em ~5 s, não
achava os conectores e terminava em 11 s com "BTG indisponível"; o app esperava `synced_at` mudar por 8 min e só
então avisava. Ou seja: não era lentidão, a leitura nunca gravava. Mudanças: espera máxima de 4 min com o motivo
provável e onde resolver (`CLOUD_LIMIT_MS`, `BTG_SLOW_MSG` em `assets/btg-sync.js`); botão mostra o relógio da espera
("Lendo o BTG na nuvem… 1:23"); roteiro da rotina pede as 3 leituras do BTG em paralelo e baixa só o verificador
(`https://etf-portfolio-ten.vercel.app/scripts/btg-snapshot.mjs`, estático; o repositório é privado, então o link
raw do GitHub dá 404) em vez de clonar o repositório inteiro, com o clone como reserva. Sem os conectores marcados na
rotina (claude.ai › Rotinas › Editar), nada disso faz a foto chegar. Medida em 24/11/2026 20h23 numa sessão com os
conectores: 3 leituras do BTG em paralelo ≈ 5 s, foto montada e conferida ≈ 15 s, gravação ≈ 5 s; ≈ 26 s do início
à gravação. Com a subida da sessão na nuvem (~5–10 s), o botão deve voltar em menos de 1 min quando a rotina tiver os
conectores. Mesmo dia, 20h21: ativar o conector só na conta NÃO bastou; a rotina disparada seguiu sem ele (11 s,
"BTG indisponível"): é preciso marcar BTGPactual e Supabase na própria rotina.

**Botão Atualizar BTG pela nuvem (23/11/2026):** no cabeçalho do bloco Contas BTG. O app chama a Edge Function `btg-fire` (`supabase/functions/btg-fire`, exige login; só o dono da linha em `pendulo_broker`; 1 disparo a cada 3 min, hora em `pendulo_btg_fire`), que faz POST no endereço de API da rotina `BTG carteira na nuvem` (`/v1/claude_code/routines/trig_…/fire`). A sessão disparada lê, confere e grava; o app espera `pendulo_broker.synced_at` mudar (até 8 min) e avisa ok ou recusa. Segredos da função: `BTG_ROUTINE_URL` (Fire URL) e `BTG_ROUTINE_TOKEN` (token gerado em claude.ai/code/routines › rotina › Editar › Trigger + › API › Generate token; aparece uma vez). Sem os segredos a função responde `nuvem_off` e o botão avisa os horários da leitura automática na nuvem. **Desde 23/11/2026 o botão nunca usa o Mac** (pedido do usuário: sempre na nuvem).

**Mac desvinculado (23/11/2026):** chave do processo removida de `pendulo_btg_worker` (cópia em `pendulo_btg_worker_bak_20261123`); mesmo ligado, o launchd do Mac não lê nem grava mais. Registro do fluxo antigo: o app chama `pendulo_btg_request` → o launchd `com.pendulo.btg-worker` (`~/.pendulo/btg-worker`, a cada 15 s) pega o pedido → Claude headless só com ferramentas de leitura do BTG → `scripts/btg-snapshot.mjs` recalcula cada posição e os totais → `pendulo_btg_worker_finish` grava. Leva cerca de 1 a 2 min e exige o Mac ligado; sem ele, o app avisa e mantém a última foto. Usa o binário do Claude do app desktop (a CLI 2.1.296 recusa a resposta do conector). A chave fica no Chaves do macOS (`pendulo-btg-worker`); no banco, só o hash.

Instalar/atualizar: `zsh scripts/btg-worker-install.sh`. Remover: `launchctl bootout gui/$UID/com.pendulo.btg-worker`, apagar o plist e a linha de `pendulo_btg_worker`.

**Desfazer a última carga:**

```sql
update public.pendulo_portfolio p set holdings = b.prev_holdings, updated_at = now()
from public.pendulo_broker b where b.user_id = p.user_id and p.user_id = '<uuid>';
```

Material educacional; não é recomendação de investimento.

## Ajuste manual quando a leitura falha (23/11/2026)

Carteira › ✎ edita posições internacionais (qtd, PM), inclui/remove ativo, edita o caixa US$ e os produtos do Brasil (+ Produto, ✎, Remover). O ajuste fica em `pendulo_portfolio.manual` (`{ baseAsOf, at, items, cashUsd }`, nuvem) e as posições em `holdings`; `withManual` (`assets/btg.js`) aplica por cima da foto e recalcula totais, pesos e mistura. Vale enquanto `pendulo_broker.as_of <= baseAsOf`: a próxima leitura boa do BTG descarta o ajuste sozinha (e já reescreve `holdings`). "Descartar ajustes" volta à foto na hora. Testes: `tests/btg-manual.test.js`.

**Duas contas do Claude (25/11/2026, revisto no mesmo dia):** o conector BTGPactual só fica ativo numa conta do claude.ai por vez (conectar numa derruba a outra), e a rotina roda na conta que a criou. **A conta principal tem prioridade**: a rotina `BTG carteira na nuvem` (`trig_018xpRKNFk1XgWK8ZEB9jhpT`, conectores BTGPactual e Supabase marcados) nos segredos `BTG_ROUTINE_URL`/`BTG_ROUTINE_TOKEN`. A 2ª conta é reserva (`BTG_ROUTINE_URL_2`/`BTG_ROUTINE_TOKEN_2`, rotina igual): `btg-fire` a dispara na hora se a principal recusar o disparo, e o app pede `{ fallback: true }` se a foto não gravar em 90 s (`FALLBACK_AFTER_MS` em `assets/btg-sync.js`; leitura boa grava em ~50–60 s, sessão sem conector termina em ~11 s sem gravar). O fallback vale de 60 s a 6 min depois do disparo, uma vez por disparo; a sessão sem o conector não grava nada, então não sobrescreve a foto boa. Sem os segredos da 2ª conta, só a principal é usada e o aviso de falha manda reconectar o BTG nela. Para ligar a reserva: na 2ª conta, criar a rotina igual (mesmo roteiro, mesmos horários, conectores marcados), gerar o token da API e gravar os dois segredos na função `btg-fire` (Supabase › Edge Functions › Secrets). Testes: `tests/btg-fallback.test.js`. Caso de 25/11/2026 18h16 UTC: o botão disparou a principal, a sessão não gravou (conector BTG desconectado na hora, inferido: às 18h23 o conector respondia e a mesma rotina gravou 4 posições).

## Conector do BTG mudou (diagnóstico de 27/11/2026)

**Sintoma:** a Carteira parou em 25/11 18h25 mesmo com o BTG conectado; o botão dava erro.

**Causas, de ponta a ponta:**

1. **Conector BTG mudou em 26/11/2026:** saiu `get_offshore_position` (o exterior ativo a ativo) e `get_offshore_performance` virou `get_performance_offshore` (responde "Unkwown error" com qualquer período). Ferramentas que restam: `get_balances`, `get_allocations`, `get_performance_offshore`, `get_performance`, `get_heritage_evolution`, `get_funds`, `get_fund_details`, `get_account_statement` e outras sem dado do exterior. A rotina pedia a ferramenta antiga e recusava a foto inteira (16h41 e 19h41 de 26/11).
2. **Login do conector expirou** na conta do Claude da rotina (22h42 de 26/11 e 01h41 de 27/11: "connected again with its existing sign-in and was refused"). Reconectado pelo usuário em 27/11 ~01h45 UTC.
3. **Botão:** `btg-fire` recebia "Routine is paused." da rotina apontada em `BTG_ROUTINE_URL` (a rotina `BTG carteira na nuvem`, `trig_018xpRKNFk1XgWK8ZEB9jhpT`, está ativa: o segredo aponta para outra, pausada, ou o token é de outra rotina). O app só mostrava "HTTP 502".

**O que mudou:**

- **Foto parcial** (`keepPositions` + `offshore.positions: null`): Brasil completo + totais do exterior de `get_balances` (`offshore.accounts[type=INVESTMENT]`: `valueAmount` = total US$, `investedTotal`, `cashTotal`). `pendulo_btg_apply` mantém as posições da última foto completa no `summary` (`positionsStale`, `positionsAsOf`) e **não reescreve** a carteira. O cartão BTG avisa "ativo a ativo da foto de …"; operou depois disso, ajuste no ✎ (o ajuste manual agora vale até chegar foto **com posições** mais novas: `positionsAsOf` em `assets/btg.js`).
- **PTAX** do Banco Central (`node scripts/btg-snapshot.mjs ptax`, OData PTAX, volta até 7 dias), já que o BTG não manda mais o câmbio.
- **Falha sem esperar:** recusa não marca mais a foto como `rejected` (isso também travava o fechamento diário, que só copia `status = 'ok'`); vai para `pendulo_broker.try_at/try_detail` (`pendulo_btg_note`, também usada pela rotina quando o conector não conecta). O botão para na hora e mostra o motivo (`btgTryFailed` em `assets/btg-sync.js`).
- `btg-fire` (versão 11) repassa o motivo da recusa da rotina; "pausada" e "token recusado" viram aviso com o que fazer.
- Roteiro da rotina reescrito para as ferramentas novas; clone de reserva aponta para o repositório público (`leandrocolis-dotcom/Public`).

**Pendente do usuário:** acertar `BTG_ROUTINE_URL`/`BTG_ROUTINE_TOKEN` da função `btg-fire` para a rotina ativa (claude.ai › Code › Rotinas › BTG carteira na nuvem › API › gerar token; Supabase › Edge Functions › btg-fire › Secrets). Sem isso, o botão avisa "rotina pausada" e a foto segue pelos horários automáticos (10h41, 13h41, 16h41, 19h41 e 22h41 de Brasília, dias úteis).
