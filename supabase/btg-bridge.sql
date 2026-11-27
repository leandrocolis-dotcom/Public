-- Ponte BTG → Carteira (aplicado no projeto em 22/11/2026; seguro rodar de novo). Ver docs/BTG-PONTE.md.
create table if not exists public.pendulo_broker (
  user_id uuid primary key references auth.users (id) on delete cascade,
  broker text not null default 'BTG',
  as_of timestamptz,
  summary jsonb not null default '{}'::jsonb,
  syms text[] not null default '{}',
  prev_holdings jsonb,
  status text not null default 'ok',
  status_detail text,
  synced_at timestamptz not null default now()
);
alter table public.pendulo_broker enable row level security;
drop policy if exists "pendulo_broker_select_own" on public.pendulo_broker;
create policy "pendulo_broker_select_own" on public.pendulo_broker
  for select to authenticated using ((select auth.uid()) = user_id);
revoke all on public.pendulo_broker from anon;
revoke insert, update, delete, truncate on public.pendulo_broker from authenticated;

create or replace function public.pendulo_btg_apply(p_user uuid, p_snap jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  pos jsonb := p_snap #> '{offshore,positions}';
  -- foto parcial (27/11/2026): o conector do BTG deixou de trazer as posições do exterior; vem só o total.
  -- As posições ficam as da última foto completa (carregadas no summary) e a carteira não é reescrita.
  stale boolean := coalesce((p_snap #>> '{offshore,positionsStale}')::boolean, false);
  invested numeric;
  total numeric;
  as_of timestamptz;
  why text;
  cur jsonb;
  old public.pendulo_broker%rowtype;
  fresh jsonb;
  manual jsonb;
  new_syms text[];
  today text;
begin
  select * into old from public.pendulo_broker where user_id = p_user for update;
  begin
    as_of := (p_snap->>'asOf')::timestamptz;
    invested := (p_snap #>> '{offshore,investedUsd}')::numeric;
    if stale then
      pos := old.summary #> '{offshore,positions}';
      if jsonb_typeof(pos) <> 'array' or jsonb_array_length(pos) = 0 then
        why := 'foto parcial sem posições anteriores para manter';
      elsif invested is null or invested < 0 then
        why := 'total investido do exterior inválido';
      end if;
    elsif jsonb_typeof(pos) <> 'array' or jsonb_array_length(pos) = 0 then
      why := 'leitura sem posições';
    elsif exists (
      select 1 from jsonb_array_elements(pos) e
      where coalesce(e->>'sym', '') !~ '^[A-Z0-9][A-Z0-9.-]{0,14}$'
         or (e->>'qty')::numeric <= 0 or (e->>'avg')::numeric < 0
         or (e->>'price')::numeric <= 0 or (e->>'value')::numeric <= 0
    ) then
      why := 'posição com campo inválido';
    elsif (select count(*) <> count(distinct e->>'sym') from jsonb_array_elements(pos) e) then
      why := 'ticker repetido';
    else
      select sum((e->>'value')::numeric) into total from jsonb_array_elements(pos) e;
      if invested is null or abs(total - invested) > greatest(1, invested * 0.01) then
        why := format('soma das posições (%s) não bate com o total investido (%s)', total, invested);
      end if;
    end if;
  exception when others then
    why := 'snapshot malformado';
  end;

  if why is null and as_of is null then why := 'sem data'; end if;
  if why is null and old.as_of is not null and as_of < old.as_of then why := 'snapshot mais antigo que o atual'; end if;

  if why is not null then
    -- recusa não apaga a foto boa: fica anotada como tentativa (try_at), a foto vigente segue 'ok'
    update public.pendulo_broker set try_at = now(), try_detail = why where user_id = p_user;
    return jsonb_build_object('ok', false, 'why', why);
  end if;

  if stale then
    p_snap := jsonb_set(p_snap, '{offshore,positions}', pos);
    p_snap := jsonb_set(p_snap, '{offshore,positionsAsOf}',
      to_jsonb(coalesce(old.summary #>> '{offshore,positionsAsOf}', old.as_of::text)));
    update public.pendulo_broker set as_of = (p_snap->>'asOf')::timestamptz, summary = p_snap, status = 'ok', status_detail = null,
      try_at = null, try_detail = null, synced_at = now()
    where user_id = p_user;
    return jsonb_build_object('ok', true, 'positions', jsonb_array_length(pos), 'positionsStale', true);
  end if;

  select holdings into cur from public.pendulo_portfolio where user_id = p_user for update;
  cur := coalesce(cur, '[]'::jsonb);
  today := to_char(as_of at time zone 'America/New_York', 'YYYY-MM-DD');
  select array_agg(e->>'sym') into new_syms from jsonb_array_elements(pos) e;

  select jsonb_agg(jsonb_strip_nulls(jsonb_build_object(
    'sym', e->>'sym', 'qty', (e->>'qty')::numeric, 'avg', (e->>'avg')::numeric,
    'invPrice', (e->>'price')::numeric, 'invValue', (e->>'value')::numeric,
    'openedOn', case when c.h is not null then c.h->>'openedOn' when old.user_id is not null then today end
  )) order by (e->>'value')::numeric desc) into fresh
  from jsonb_array_elements(pos) e
  left join lateral (select h from jsonb_array_elements(cur) h where h->>'sym' = e->>'sym' limit 1) c on true;

  -- posição digitada à mão fora do BTG continua; o que saiu do BTG sai da carteira
  select coalesce(jsonb_agg(h), '[]'::jsonb) into manual from jsonb_array_elements(cur) h
  where not (h->>'sym' = any(new_syms)) and not (h->>'sym' = any(coalesce(old.syms, '{}')))
    and old.user_id is not null and old.as_of is not null;

  insert into public.pendulo_portfolio (user_id, holdings, source, imported_at, updated_at)
  values (p_user, fresh || manual, 'BTG', now(), now())
  on conflict (user_id) do update set holdings = excluded.holdings, source = 'BTG', imported_at = now(), updated_at = now();

  insert into public.pendulo_broker (user_id, as_of, summary, syms, prev_holdings, status, status_detail, synced_at)
  values (p_user, as_of, p_snap, new_syms, cur, 'ok', null, now())
  on conflict (user_id) do update set as_of = excluded.as_of, summary = excluded.summary, syms = excluded.syms,
    prev_holdings = excluded.prev_holdings, status = 'ok', status_detail = null, try_at = null, try_detail = null,
    synced_at = now();
  return jsonb_build_object('ok', true, 'positions', jsonb_array_length(fresh), 'manualKept', jsonb_array_length(manual));
end $$;
revoke all on function public.pendulo_btg_apply(uuid, jsonb) from public, anon, authenticated;

-- Botão "Atualizar BTG": fila de pedidos e processo local (aplicado em 22/11/2026).
create table if not exists public.pendulo_btg_worker (
  id int primary key default 1 check (id = 1),
  user_id uuid not null references auth.users (id) on delete cascade,
  key_hash text not null,
  last_seen timestamptz
);
alter table public.pendulo_btg_worker enable row level security;
revoke all on public.pendulo_btg_worker from anon, authenticated;

create table if not exists public.pendulo_btg_req (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  status text not null default 'pending' check (status in ('pending','running','done','error')),
  detail text,
  requested_at timestamptz not null default now(),
  started_at timestamptz,
  finished_at timestamptz
);
create index if not exists pendulo_btg_req_open on public.pendulo_btg_req (requested_at) where status in ('pending','running');
create index if not exists pendulo_btg_req_user on public.pendulo_btg_req (user_id, id desc);
alter table public.pendulo_btg_req enable row level security;
drop policy if exists "pendulo_btg_req_select_own" on public.pendulo_btg_req;
create policy "pendulo_btg_req_select_own" on public.pendulo_btg_req
  for select to authenticated using ((select auth.uid()) = user_id);
revoke all on public.pendulo_btg_req from anon;
revoke insert, update, delete, truncate on public.pendulo_btg_req from authenticated;

create or replace function public.pendulo_btg_expire()
returns void language sql security definer set search_path = public as $$
  update public.pendulo_btg_req set status = 'error', detail = 'tempo esgotado', finished_at = now()
  where (status = 'pending' and requested_at < now() - interval '2 minutes')
     or (status = 'running' and started_at < now() - interval '5 minutes');
$$;
revoke all on function public.pendulo_btg_expire() from public, anon, authenticated;

create or replace function public.pendulo_btg_request()
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  uid uuid := auth.uid();
  w public.pendulo_btg_worker%rowtype;
  r public.pendulo_btg_req%rowtype;
begin
  select * into w from public.pendulo_btg_worker where id = 1;
  if uid is null or w.user_id is distinct from uid then
    return jsonb_build_object('ok', false, 'why', 'sem permissão');
  end if;
  perform public.pendulo_btg_expire();
  -- durante uma leitura o processo não dá sinal de vida: o pedido em andamento vale antes do teste de Mac ligado
  select * into r from public.pendulo_btg_req
  where user_id = uid and status in ('pending','running') order by id desc limit 1;
  if found then
    return jsonb_build_object('ok', true, 'id', r.id, 'status', r.status);
  end if;
  if w.last_seen is null or w.last_seen < now() - interval '90 seconds' then
    return jsonb_build_object('ok', false, 'why', 'mac_offline');
  end if;
  insert into public.pendulo_btg_req (user_id) values (uid) returning * into r;
  return jsonb_build_object('ok', true, 'id', r.id, 'status', r.status);
end $$;
revoke all on function public.pendulo_btg_request() from public, anon;
grant execute on function public.pendulo_btg_request() to authenticated;

create or replace function public.pendulo_btg_worker_claim(p_key text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  w public.pendulo_btg_worker%rowtype;
  rid bigint;
begin
  select * into w from public.pendulo_btg_worker where id = 1
    and key_hash = encode(sha256(convert_to(coalesce(p_key, ''), 'UTF8')), 'hex');
  if not found then raise exception 'chave inválida' using errcode = '28000'; end if;
  update public.pendulo_btg_worker set last_seen = now() where id = 1;
  perform public.pendulo_btg_expire();
  if exists (select 1 from public.pendulo_btg_req where status = 'running') then
    return jsonb_build_object('id', null);
  end if;
  select id into rid from public.pendulo_btg_req
  where status = 'pending' and user_id = w.user_id order by id limit 1 for update skip locked;
  if rid is null then return jsonb_build_object('id', null); end if;
  update public.pendulo_btg_req set status = 'running', started_at = now() where id = rid;
  return jsonb_build_object('id', rid);
end $$;
revoke all on function public.pendulo_btg_worker_claim(text) from public, authenticated;
grant execute on function public.pendulo_btg_worker_claim(text) to anon;

create or replace function public.pendulo_btg_worker_finish(p_key text, p_id bigint, p_snap jsonb, p_error text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  w public.pendulo_btg_worker%rowtype;
  res jsonb;
begin
  select * into w from public.pendulo_btg_worker where id = 1
    and key_hash = encode(sha256(convert_to(coalesce(p_key, ''), 'UTF8')), 'hex');
  if not found then raise exception 'chave inválida' using errcode = '28000'; end if;
  if not exists (select 1 from public.pendulo_btg_req where id = p_id and user_id = w.user_id and status = 'running') then
    return jsonb_build_object('ok', false, 'why', 'pedido não está em execução');
  end if;
  if p_snap is null then
    res := jsonb_build_object('ok', false, 'why', left(coalesce(p_error, 'falha na leitura'), 200));
  else
    res := public.pendulo_btg_apply(w.user_id, p_snap);
  end if;
  update public.pendulo_btg_req
  set status = case when (res->>'ok')::boolean then 'done' else 'error' end,
      detail = left(res->>'why', 200), finished_at = now()
  where id = p_id;
  return res;
end $$;
revoke all on function public.pendulo_btg_worker_finish(text, bigint, jsonb, text) from public, authenticated;
grant execute on function public.pendulo_btg_worker_finish(text, bigint, jsonb, text) to anon;

-- Histórico das fotos (aplicado em 23/11/2026): um ponto por foto aceita, para os cartões de evolução.
-- Gravado por gatilho em pendulo_broker (a função de carga não muda). Só totais; nada identificável.
create table if not exists public.pendulo_broker_hist (
  user_id uuid not null references auth.users (id) on delete cascade,
  as_of timestamptz not null,
  total_brl numeric,
  onshore_brl numeric,
  offshore_usd numeric,
  invested_usd numeric,
  ptax numeric,
  primary key (user_id, as_of)
);
alter table public.pendulo_broker_hist enable row level security;
drop policy if exists "pendulo_broker_hist_select_own" on public.pendulo_broker_hist;
create policy "pendulo_broker_hist_select_own" on public.pendulo_broker_hist
  for select to authenticated using ((select auth.uid()) = user_id);
revoke all on public.pendulo_broker_hist from anon;
revoke insert, update, delete, truncate on public.pendulo_broker_hist from authenticated;

create or replace function public.pendulo_broker_hist_add()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.status = 'ok' and new.as_of is not null then
    insert into public.pendulo_broker_hist (user_id, as_of, total_brl, onshore_brl, offshore_usd, invested_usd, ptax)
    values (new.user_id, new.as_of,
      (new.summary #>> '{onshore,total}')::numeric + (new.summary #>> '{offshore,totalBrl}')::numeric,
      (new.summary #>> '{onshore,total}')::numeric, (new.summary #>> '{offshore,totalUsd}')::numeric,
      (new.summary #>> '{offshore,investedUsd}')::numeric, (new.summary #>> '{fx,ptax}')::numeric)
    on conflict (user_id, as_of) do nothing;
  end if;
  return new;
end $$;
revoke all on function public.pendulo_broker_hist_add() from public, anon, authenticated;
drop trigger if exists pendulo_broker_hist_t on public.pendulo_broker;
create trigger pendulo_broker_hist_t after insert or update on public.pendulo_broker
  for each row execute function public.pendulo_broker_hist_add();

-- ponto inicial com a foto atual
insert into public.pendulo_broker_hist (user_id, as_of, total_brl, onshore_brl, offshore_usd, invested_usd, ptax)
select user_id, as_of, (summary #>> '{onshore,total}')::numeric + (summary #>> '{offshore,totalBrl}')::numeric,
  (summary #>> '{onshore,total}')::numeric, (summary #>> '{offshore,totalUsd}')::numeric,
  (summary #>> '{offshore,investedUsd}')::numeric, (summary #>> '{fx,ptax}')::numeric
from public.pendulo_broker where status = 'ok' and as_of is not null
on conflict (user_id, as_of) do nothing;

-- Botão "Atualizar BTG" pela nuvem (23/11/2026): hora do último disparo da rotina, gravada só pela função btg-fire.
create table if not exists public.pendulo_btg_fire (
  user_id uuid primary key references auth.users (id) on delete cascade,
  fired_at timestamptz not null
);
alter table public.pendulo_btg_fire enable row level security;
revoke all on public.pendulo_btg_fire from anon, authenticated;

-- Posição histórica (aplicado em 25/11/2026): uma foto COMPLETA (posições) por dia de Brasília.
create table if not exists public.pendulo_broker_daily (
  user_id uuid not null references auth.users (id) on delete cascade,
  day date not null,
  as_of timestamptz not null,
  summary jsonb not null,
  carried boolean not null default false,
  saved_at timestamptz not null default now(),
  primary key (user_id, day)
);
alter table public.pendulo_broker_daily enable row level security;
drop policy if exists "pendulo_broker_daily_select_own" on public.pendulo_broker_daily;
create policy "pendulo_broker_daily_select_own" on public.pendulo_broker_daily
  for select to authenticated using ((select auth.uid()) = user_id);
revoke all on public.pendulo_broker_daily from anon;
revoke insert, update, delete, truncate on public.pendulo_broker_daily from authenticated;

-- cada foto aceita vira a foto do dia dela (a mais nova do dia vence)
create or replace function public.pendulo_broker_daily_add()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.status = 'ok' and new.as_of is not null and new.summary is not null then
    insert into public.pendulo_broker_daily (user_id, day, as_of, summary, carried)
    values (new.user_id, (new.as_of at time zone 'America/Sao_Paulo')::date, new.as_of, new.summary, false)
    on conflict (user_id, day) do update
      set as_of = excluded.as_of, summary = excluded.summary, carried = false, saved_at = now()
      where public.pendulo_broker_daily.carried or excluded.as_of >= public.pendulo_broker_daily.as_of;
  end if;
  return new;
end $$;
revoke all on function public.pendulo_broker_daily_add() from public, anon, authenticated;
drop trigger if exists pendulo_broker_daily_t on public.pendulo_broker;
create trigger pendulo_broker_daily_t after insert or update on public.pendulo_broker
  for each row execute function public.pendulo_broker_daily_add();

-- virada do dia (23h59 de Brasília): dia sem leitura leva a última foto, marcada "carried"
create or replace function public.pendulo_broker_daily_close()
returns void language plpgsql security definer set search_path = public as $$
begin
  insert into public.pendulo_broker_daily (user_id, day, as_of, summary, carried)
  select user_id, (now() at time zone 'America/Sao_Paulo')::date, as_of, summary, true
  from public.pendulo_broker where status = 'ok' and as_of is not null and summary is not null
  on conflict (user_id, day) do nothing;
end $$;
revoke all on function public.pendulo_broker_daily_close() from public, anon, authenticated;
select cron.unschedule(jobid) from cron.job where jobname = 'pendulo-broker-daily';
select cron.schedule('pendulo-broker-daily', '59 2 * * *', 'select public.pendulo_broker_daily_close()');

-- Edições do usuário na nuvem (aplicado em 25/11/2026; ver assets/settings-sync.js).
create table if not exists public.pendulo_settings (
  user_id uuid primary key references auth.users (id) on delete cascade,
  data jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);
alter table public.pendulo_settings enable row level security;
drop policy if exists "pendulo_settings_own" on public.pendulo_settings;
create policy "pendulo_settings_own" on public.pendulo_settings
  for all to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);
revoke all on public.pendulo_settings from anon;
grant select, insert, update on public.pendulo_settings to authenticated;

-- Rentabilidade real do exterior (aplicado em 25/11/2026): ver docs/BTG-PONTE.md e assets/offshore-perf.js.
create table if not exists public.pendulo_offshore_perf (
  user_id uuid not null references auth.users (id) on delete cascade,
  kind char(1) not null check (kind in ('d','m')),
  day date not null,
  bal numeric, r numeric, acc numeric, pl numeric, acc_pl numeric,
  flow_in numeric, flow_out numeric, taxes numeric,
  bench jsonb,
  saved_at timestamptz not null default now(),
  primary key (user_id, kind, day)
);
alter table public.pendulo_offshore_perf enable row level security;
drop policy if exists "pendulo_offshore_perf_select_own" on public.pendulo_offshore_perf;
create policy "pendulo_offshore_perf_select_own" on public.pendulo_offshore_perf
  for select to authenticated using ((select auth.uid()) = user_id);
revoke all on public.pendulo_offshore_perf from anon;
revoke insert, update, delete, truncate on public.pendulo_offshore_perf from authenticated;

create or replace function public.pendulo_offperf_apply(p_user uuid, p_kind text, p_perf jsonb)
returns int language plpgsql security definer set search_path = public as $$
declare arr jsonb := coalesce(p_perf->'performance', p_perf); n int;
begin
  if p_kind not in ('d','m') then raise exception 'kind inválido'; end if;
  with src as (
    select e, ((e->>'date')::timestamptz at time zone 'America/Sao_Paulo')::date as day
    from jsonb_array_elements(arr) e
  )
  insert into public.pendulo_offshore_perf as t
    (user_id, kind, day, bal, r, acc, pl, acc_pl, flow_in, flow_out, taxes, bench, saved_at)
  select p_user, p_kind, day, (e->>'actualBalance')::numeric, (e->>'value')::numeric,
    (e->>'accumulatedValue')::numeric, (e->>'yield')::numeric, (e->>'accumulatedYield')::numeric,
    (e->>'transactionIn')::numeric, (e->>'transactionOut')::numeric, (e->>'taxesAndFees')::numeric,
    (select jsonb_object_agg(b->>'name', jsonb_build_object('r', (b->>'value')::numeric, 'acc', (b->>'accumulatedValue')::numeric))
       from jsonb_array_elements(e->'benchmarks') b),
    now()
  from src
  on conflict (user_id, kind, day) do update set
    bal = excluded.bal, r = excluded.r, acc = excluded.acc, pl = excluded.pl, acc_pl = excluded.acc_pl,
    flow_in = excluded.flow_in, flow_out = excluded.flow_out, taxes = excluded.taxes, bench = excluded.bench, saved_at = now();
  get diagnostics n = row_count;
  return n;
end $$;
revoke all on function public.pendulo_offperf_apply(uuid, text, jsonb) from public, anon, authenticated;

-- Última tentativa da rotina do BTG (27/11/2026): a rotina anota quando NÃO consegue gravar a foto (conector
-- desconectado, ferramenta mudou, conferência recusou) sem mexer na foto vigente nem no status 'ok'. O app lê
-- try_at/try_detail e avisa na hora, em vez de esperar o prazo do botão. pendulo_btg_apply também anota aqui a recusa.
alter table public.pendulo_broker add column if not exists try_at timestamptz;
alter table public.pendulo_broker add column if not exists try_detail text;

create or replace function public.pendulo_btg_note(p_user uuid, p_detail text)
returns jsonb language plpgsql security definer set search_path = public as $$
begin
  update public.pendulo_broker set try_at = now(), try_detail = left(coalesce(p_detail, ''), 300)
  where user_id = p_user;
  return jsonb_build_object('ok', found);
end $$;
revoke all on function public.pendulo_btg_note(uuid, text) from public, anon, authenticated;
