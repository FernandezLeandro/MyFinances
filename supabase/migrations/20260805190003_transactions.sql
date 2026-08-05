create table public.transactions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  type text not null check (type in ('income', 'expense')),
  amount numeric(12, 2) not null check (amount > 0),
  occurred_on date not null,
  category_id uuid references public.categories (id) on delete set null,
  description text,
  -- La FK a fixed_expense_payments se agrega en una migración posterior: esa tabla todavía no existe.
  fixed_expense_payment_id uuid,
  created_at timestamptz not null default now()
);

create index transactions_user_date_idx on public.transactions (user_id, occurred_on desc);

alter table public.transactions enable row level security;

create policy "transactions_select_own" on public.transactions
  for select using (user_id = auth.uid());

create policy "transactions_insert_own" on public.transactions
  for insert with check (user_id = auth.uid());

create policy "transactions_update_own" on public.transactions
  for update using (user_id = auth.uid());

create policy "transactions_delete_own" on public.transactions
  for delete using (user_id = auth.uid());
