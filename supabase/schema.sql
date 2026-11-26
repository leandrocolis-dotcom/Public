-- Pêndulo · tabelas do Supabase. Já aplicado no projeto (carteira em 2026-05, push em 2026-10-08); seguro rodar de novo.
-- Dica: no SQL Editor, rode por blocos se um lote grande demorar.
-- Cada usuário só enxerga as próprias linhas (RLS). O envio de push usa a service key, que ignora o RLS.

-- ───────────── Carteira (uma linha por usuário) ─────────────
create table if not exists public.pendulo_portfolio (
  user_id uuid primary key references auth.users (id) on delete cascade,
  holdings jsonb not null default '[]'::jsonb,
  source text,
  imported_at timestamptz,
  updated_at timestamptz not null default now()
);
-- ajuste manual sobre a foto do BTG (23/11/2026; assets/btg.js withManual)
alter table public.pendulo_portfolio add column if not exists manual jsonb;
alter table public.pendulo_portfolio enable row level security;

drop policy if exists "pendulo_portfolio_select_own" on public.pendulo_portfolio;
drop policy if exists "pendulo_portfolio_insert_own" on public.pendulo_portfolio;
drop policy if exists "pendulo_portfolio_update_own" on public.pendulo_portfolio;
drop policy if exists "pendulo_portfolio_delete_own" on public.pendulo_portfolio;
create policy "pendulo_portfolio_select_own" on public.pendulo_portfolio
  for select to authenticated using (user_id = (select auth.uid()));
create policy "pendulo_portfolio_insert_own" on public.pendulo_portfolio
  for insert to authenticated with check (user_id = (select auth.uid()));
create policy "pendulo_portfolio_update_own" on public.pendulo_portfolio
  for update to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy "pendulo_portfolio_delete_own" on public.pendulo_portfolio
  for delete to authenticated using (user_id = (select auth.uid()));

-- ───────────── Notificações push: um registro por aparelho ─────────────
create table if not exists public.pendulo_push_subscriptions (
  endpoint text primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  p256dh text not null,
  auth text not null,
  label text,
  prefs jsonb not null default '{"sig": true, "news": "all"}'::jsonb,
  updated_at timestamptz not null default now()
);
create index if not exists pendulo_push_subscriptions_user_idx on public.pendulo_push_subscriptions (user_id);
alter table public.pendulo_push_subscriptions enable row level security;

drop policy if exists "pendulo_push_subscriptions_select_own" on public.pendulo_push_subscriptions;
drop policy if exists "pendulo_push_subscriptions_insert_own" on public.pendulo_push_subscriptions;
drop policy if exists "pendulo_push_subscriptions_update_own" on public.pendulo_push_subscriptions;
drop policy if exists "pendulo_push_subscriptions_delete_own" on public.pendulo_push_subscriptions;
create policy "pendulo_push_subscriptions_select_own" on public.pendulo_push_subscriptions
  for select to authenticated using (user_id = (select auth.uid()));
create policy "pendulo_push_subscriptions_insert_own" on public.pendulo_push_subscriptions
  for insert to authenticated with check (user_id = (select auth.uid()));
create policy "pendulo_push_subscriptions_update_own" on public.pendulo_push_subscriptions
  for update to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy "pendulo_push_subscriptions_delete_own" on public.pendulo_push_subscriptions
  for delete to authenticated using (user_id = (select auth.uid()));

-- ───────────── Avisos já enviados (para não repetir) ─────────────
-- Só o servidor (service key) usa esta tabela; sem policy = nenhum usuário comum acessa.
create table if not exists public.pendulo_push_sent (
  user_id uuid not null references auth.users (id) on delete cascade,
  key text not null,
  sent_at timestamptz not null default now(),
  primary key (user_id, key)
);
alter table public.pendulo_push_sent enable row level security;

-- ───────────── Chaves VAPID do Web Push (geradas pela função Edge Function push no primeiro uso) ─────────────
-- Sem policy: só a service key (servidor) lê. A chave privada nunca vai para o app.
create table if not exists public.pendulo_push_keys (
  id int primary key default 1 check (id = 1),
  public_key text not null,
  private_key text not null,
  created_at timestamptz not null default now()
);
alter table public.pendulo_push_keys enable row level security;

-- ───────────── Erros do app (telemetria, assets/telemetry.js) ─────────────
-- Qualquer visitante só INSERE (sem leitura pública); mensagens curtas. Consulta: SQL Editor.
create table if not exists public.pendulo_client_errors (
  id bigint generated always as identity primary key,
  at timestamptz not null default now(),
  version text, tab text, message text not null, stack text, ua text
);
alter table public.pendulo_client_errors enable row level security;
drop policy if exists "pendulo_client_errors_insert" on public.pendulo_client_errors;
create policy "pendulo_client_errors_insert" on public.pendulo_client_errors for insert to anon, authenticated
  with check (char_length(message) <= 500 and char_length(coalesce(stack,'')) <= 2000
    and char_length(coalesce(ua,'')) <= 300 and char_length(coalesce(tab,'')) <= 40 and char_length(coalesce(version,'')) <= 40);

-- ───────────── Agendamento do push (pg_cron + pg_net) ─────────────
-- A cada minuto; a função (?tick) roda sempre no pré/pregão/pós de NY e, fora disso, só de 10 em 10 min.
-- select cron.schedule('pendulo-push', '* * * * *',
--   $$select net.http_get(url := 'https://iufliktjawnfawerwvtg.supabase.co/functions/v1/push?tick', timeout_milliseconds := 60000)$$);

-- ───────────── Watchlists da aba Decisões (uma linha por usuário) ─────────────
-- O treino diário do Simulador (scripts/train-model.mjs, com a service key) lê os tickers daqui.
create table if not exists public.pendulo_watchlists (
  user_id uuid primary key references auth.users (id) on delete cascade,
  lists jsonb not null default '[]'::jsonb,
  updated_at timestamptz not null default now()
);
alter table public.pendulo_watchlists enable row level security;
drop policy if exists "pendulo_watchlists_select_own" on public.pendulo_watchlists;
drop policy if exists "pendulo_watchlists_insert_own" on public.pendulo_watchlists;
drop policy if exists "pendulo_watchlists_update_own" on public.pendulo_watchlists;
drop policy if exists "pendulo_watchlists_delete_own" on public.pendulo_watchlists;
create policy "pendulo_watchlists_select_own" on public.pendulo_watchlists
  for select to authenticated using (user_id = (select auth.uid()));
create policy "pendulo_watchlists_insert_own" on public.pendulo_watchlists
  for insert to authenticated with check (user_id = (select auth.uid()));
create policy "pendulo_watchlists_update_own" on public.pendulo_watchlists
  for update to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy "pendulo_watchlists_delete_own" on public.pendulo_watchlists
  for delete to authenticated using (user_id = (select auth.uid()));

-- ───────────── 👍 Meus trades (uma linha por usuário) ─────────────
-- Oportunidades em que o usuário marcou que entrou; o app acompanha e critica o modelo. O treino diário lê os ativos.
create table if not exists public.pendulo_trades (
  user_id uuid primary key references auth.users (id) on delete cascade,
  trades jsonb not null default '[]'::jsonb,
  updated_at timestamptz not null default now()
);
alter table public.pendulo_trades enable row level security;
drop policy if exists "pendulo_trades_select_own" on public.pendulo_trades;
drop policy if exists "pendulo_trades_insert_own" on public.pendulo_trades;
drop policy if exists "pendulo_trades_update_own" on public.pendulo_trades;
drop policy if exists "pendulo_trades_delete_own" on public.pendulo_trades;
create policy "pendulo_trades_select_own" on public.pendulo_trades
  for select to authenticated using (user_id = (select auth.uid()));
create policy "pendulo_trades_insert_own" on public.pendulo_trades
  for insert to authenticated with check (user_id = (select auth.uid()));
create policy "pendulo_trades_update_own" on public.pendulo_trades
  for update to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy "pendulo_trades_delete_own" on public.pendulo_trades
  for delete to authenticated using (user_id = (select auth.uid()));

-- ───────────── 📒 Diário de operações reais (uma linha por usuário) ─────────────
-- Compras e vendas reais com tamanho, stop e motivo; o app compara com o mesmo dinheiro no SPY.
create table if not exists public.pendulo_journal (
  user_id uuid primary key references auth.users (id) on delete cascade,
  entries jsonb not null default '[]'::jsonb,
  updated_at timestamptz not null default now()
);
alter table public.pendulo_journal enable row level security;
drop policy if exists "pendulo_journal_select_own" on public.pendulo_journal;
drop policy if exists "pendulo_journal_insert_own" on public.pendulo_journal;
drop policy if exists "pendulo_journal_update_own" on public.pendulo_journal;
drop policy if exists "pendulo_journal_delete_own" on public.pendulo_journal;
create policy "pendulo_journal_select_own" on public.pendulo_journal
  for select to authenticated using (user_id = (select auth.uid()));
create policy "pendulo_journal_insert_own" on public.pendulo_journal
  for insert to authenticated with check (user_id = (select auth.uid()));
create policy "pendulo_journal_update_own" on public.pendulo_journal
  for update to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy "pendulo_journal_delete_own" on public.pendulo_journal
  for delete to authenticated using (user_id = (select auth.uid()));

-- ───────────── Cotações ao vivo empurradas pelo servidor (Realtime) ─────────────
-- Uma linha só (id = 1): a última foto que a Edge Function `quotes-feed` transmitiu pelo canal público
-- `pendulo-quotes`. Sem acesso público (RLS sem política): só a função, com a service key, lê e grava.
-- claimed_at é a trava que impede duas buscas ao mesmo tempo.
create table if not exists public.pendulo_quotes (
  id int primary key check (id = 1),
  data jsonb,
  market_state text,
  at timestamptz not null default 'epoch',
  claimed_at timestamptz not null default 'epoch'
);
insert into public.pendulo_quotes (id) values (1) on conflict (id) do nothing;
alter table public.pendulo_quotes enable row level security;

-- Contadores do robô por dia de Nova York ({ "AAAA-MM-DD": { runs, yahoo_calls, packets, bytes_sent,
-- symbols_sent } }, últimos 14 dias). Gravados pela função junto com a foto (1 vez por minuto).
alter table public.pendulo_quotes add column if not exists stats jsonb not null default '{}'::jsonb;

-- ───────────── Presença: robô de cotações sob demanda (docs/PLANO-OTIMIZACAO.md, Fase 1) ─────────────
-- Cada aparelho com o app aberto avisa a cada 5 min (pendulo_touch) e, da Fase 2 em diante, manda os ativos
-- que tem na tela (viram a camada quente da função). Sem dado pessoal: `device` é um id aleatório do app.
-- Sem política de RLS: ninguém lê nem grava direto; só a função security definer e a service key.
create table if not exists public.pendulo_demand (
  device text primary key check (device ~ '^[A-Za-z0-9_-]{8,64}$'),
  at timestamptz not null default now(),
  syms text[] not null default '{}',
  tab text
);
alter table public.pendulo_demand enable row level security;
create index if not exists pendulo_demand_at on public.pendulo_demand (at desc);

create or replace function public.pendulo_touch(dev text, wanted text[] default '{}', screen text default null)
returns void language plpgsql security definer set search_path = public as $$
declare clean text[];
begin
  if dev is null or dev !~ '^[A-Za-z0-9_-]{8,64}$' then raise exception 'aparelho inválido'; end if;
  -- só formatos de símbolo válidos, sem repetir, na ordem recebida (prioridade), no máximo 80
  select coalesce(array_agg(s order by o), '{}') into clean from (
    select s, min(o) as o from (
      select upper(trim(x)) as s, o from unnest(coalesce(wanted, '{}')) with ordinality as t(x, o)
    ) a where s ~ '^\^?[A-Z0-9][A-Z0-9.=^-]{0,14}$' group by s order by min(o) limit 80
  ) q;
  insert into public.pendulo_demand (device, at, syms, tab) values (dev, now(), clean, left(screen, 40))
  on conflict (device) do update set at = excluded.at, syms = excluded.syms, tab = excluded.tab;
  delete from public.pendulo_demand where at < now() - interval '1 day';
end $$;
revoke all on function public.pendulo_touch(text, text[], text) from public;
grant execute on function public.pendulo_touch(text, text[], text) to anon, authenticated;

-- Última foto para quem abre o app (Fase 2): leitura pública só por esta função, sem acesso à tabela.
create or replace function public.pendulo_snapshot()
returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object('at', at, 'data', data) from public.pendulo_quotes where id = 1
$$;
revoke all on function public.pendulo_snapshot() from public;
grant execute on function public.pendulo_snapshot() to anon, authenticated;

-- Agendamento: a cada 15 s, SÓ com alguém de app aberto nos últimos 10 min (a função decide a camada).
-- select cron.unschedule('pendulo-quotes-feed');
-- select cron.schedule('pendulo-quotes-feed', '15 seconds',
--   $$select net.http_get(url := 'https://iufliktjawnfawerwvtg.supabase.co/functions/v1/quotes-feed', timeout_milliseconds := 30000)
--     where exists (select 1 from public.pendulo_demand where at > now() - interval '10 minutes')$$);
-- Voltar atrás: reagende sem o "where exists" e reimplante index.v1.ts como index.ts.
