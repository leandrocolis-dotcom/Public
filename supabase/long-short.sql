-- Long & Short (docs/PLANO-LONG-SHORT.md, docs/long-short/MAPEAMENTO.md): estado do motor por usuário.
-- data = { schemaVersion: 4, paramsVersion, legs[], orders[], fills[], day } (assets/ls-data.js, migrateLs).
-- Aditivo: não toca em pendulo_portfolio nem na foto do BTG. Parâmetros, plano do dia, pares e cadastro de
-- ativos ficam em pendulo_settings (chaves pendulo.ls.*).
create table if not exists public.pendulo_ls (
  user_id uuid primary key references auth.users (id) on delete cascade,
  data jsonb not null default '{"schemaVersion": 4}'::jsonb,
  updated_at timestamptz not null default now()
);
alter table public.pendulo_ls enable row level security;
drop policy if exists "pendulo_ls_select_own" on public.pendulo_ls;
drop policy if exists "pendulo_ls_insert_own" on public.pendulo_ls;
drop policy if exists "pendulo_ls_update_own" on public.pendulo_ls;
drop policy if exists "pendulo_ls_delete_own" on public.pendulo_ls;
create policy "pendulo_ls_select_own" on public.pendulo_ls
  for select to authenticated using (user_id = (select auth.uid()));
create policy "pendulo_ls_insert_own" on public.pendulo_ls
  for insert to authenticated with check (user_id = (select auth.uid()));
create policy "pendulo_ls_update_own" on public.pendulo_ls
  for update to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy "pendulo_ls_delete_own" on public.pendulo_ls
  for delete to authenticated using (user_id = (select auth.uid()));
comment on table public.pendulo_ls is 'Pêndulo Long & Short: legs, ordens, execuções e contadores do dia (schema v4); acesso só ao dono via RLS.';
