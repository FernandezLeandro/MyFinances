create table public.categories (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  name text not null,
  kind text not null check (kind in ('income', 'expense')),
  color text not null,
  icon text,
  is_archived boolean not null default false,
  created_at timestamptz not null default now()
);

create index categories_user_idx on public.categories (user_id);

alter table public.categories enable row level security;

create policy "categories_select_own" on public.categories
  for select using (user_id = auth.uid());

create policy "categories_insert_own" on public.categories
  for insert with check (user_id = auth.uid());

create policy "categories_update_own" on public.categories
  for update using (user_id = auth.uid());

create policy "categories_delete_own" on public.categories
  for delete using (user_id = auth.uid());
