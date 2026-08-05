create table public.fixed_expenses (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  name text not null,
  amount numeric(12, 2) not null check (amount > 0),
  category_id uuid references public.categories (id) on delete set null,
  due_day int not null check (due_day between 1 and 31),
  is_active boolean not null default true,
  starts_on date not null default current_date,
  ends_on date,
  notes text,
  created_at timestamptz not null default now()
);

create index fixed_expenses_user_idx on public.fixed_expenses (user_id);

alter table public.fixed_expenses enable row level security;

create policy "fixed_expenses_select_own" on public.fixed_expenses
  for select using (user_id = auth.uid());

create policy "fixed_expenses_insert_own" on public.fixed_expenses
  for insert with check (user_id = auth.uid());

create policy "fixed_expenses_update_own" on public.fixed_expenses
  for update using (user_id = auth.uid());

create policy "fixed_expenses_delete_own" on public.fixed_expenses
  for delete using (user_id = auth.uid());

-- El pago de un fijo se modela como fila por período, no como flag `is_paid`: un flag se rompe
-- el mes siguiente, esto conserva el historial completo.
create table public.fixed_expense_payments (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  fixed_expense_id uuid not null references public.fixed_expenses (id) on delete cascade,
  period date not null, -- siempre día 1 del mes
  paid_at timestamptz not null default now(),
  amount_paid numeric(12, 2) not null check (amount_paid > 0),
  transaction_id uuid references public.transactions (id) on delete set null,
  unique (fixed_expense_id, period)
);

create index fixed_expense_payments_user_period_idx on public.fixed_expense_payments (user_id, period);

alter table public.fixed_expense_payments enable row level security;

create policy "fixed_expense_payments_select_own" on public.fixed_expense_payments
  for select using (user_id = auth.uid());

create policy "fixed_expense_payments_insert_own" on public.fixed_expense_payments
  for insert with check (user_id = auth.uid());

create policy "fixed_expense_payments_update_own" on public.fixed_expense_payments
  for update using (user_id = auth.uid());

create policy "fixed_expense_payments_delete_own" on public.fixed_expense_payments
  for delete using (user_id = auth.uid());
