-- Patrimonio: fondo de emergencia, ahorros y jubilación. Deliberadamente aislado de
-- transactions/fixed_expenses — es información de stock (lo que está guardado), no de flujo (lo que
-- entra y sale del mes). Nunca genera una transacción ni entra al saldo actual/proyectado.

create table public.savings_buckets (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  name text not null,
  -- 'emergency' | 'savings' | 'retirement' en los 3 ítems sembrados; null en los que crea el
  -- usuario a mano. Sirve para no re-sembrar duplicados y darle copy propio a cada uno conocido.
  slug text,
  -- El fondo de emergencia vive sólo en la moneda principal por decisión del usuario, no técnica:
  -- ahorros/jubilación sí pueden repartirse entre ARS y USD.
  single_currency boolean not null default false,
  sort_order int not null default 0,
  is_archived boolean not null default false,
  created_at timestamptz not null default now(),
  unique (user_id, slug) -- Postgres permite múltiples NULL: los ítems creados a mano no chocan entre sí.
);

create index savings_buckets_user_idx on public.savings_buckets (user_id);

alter table public.savings_buckets enable row level security;

create policy "savings_buckets_select_own" on public.savings_buckets
  for select using (user_id = auth.uid());

create policy "savings_buckets_insert_own" on public.savings_buckets
  for insert with check (user_id = auth.uid());

create policy "savings_buckets_update_own" on public.savings_buckets
  for update using (user_id = auth.uid());

create policy "savings_buckets_delete_own" on public.savings_buckets
  for delete using (user_id = auth.uid());

-- El total de un ítem es Σ depósitos − Σ retiros, no un número editable a mano: así se conserva la
-- fecha y la cotización de compra de cada aporte, que es la base de la comparativa de ganancia.
create table public.savings_entries (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  bucket_id uuid not null references public.savings_buckets (id) on delete cascade,
  kind text not null check (kind in ('deposit', 'withdrawal')),
  currency text not null check (currency in ('ARS', 'USD')),
  amount numeric(14, 2) not null check (amount > 0),
  -- Cuántos ARS costó una unidad de `currency` el día del aporte. Null en ARS (no aplica) y en
  -- aportes en USD de los que no se cargó la cotización de compra.
  rate_to_main numeric(14, 4),
  occurred_on date not null default current_date,
  note text,
  created_at timestamptz not null default now()
);

create index savings_entries_user_bucket_idx on public.savings_entries (user_id, bucket_id, occurred_on desc);

alter table public.savings_entries enable row level security;

create policy "savings_entries_select_own" on public.savings_entries
  for select using (user_id = auth.uid());

create policy "savings_entries_insert_own" on public.savings_entries
  for insert with check (user_id = auth.uid());

create policy "savings_entries_update_own" on public.savings_entries
  for update using (user_id = auth.uid());

create policy "savings_entries_delete_own" on public.savings_entries
  for delete using (user_id = auth.uid());
