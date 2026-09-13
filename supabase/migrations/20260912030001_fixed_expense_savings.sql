-- Bloque 3 del plan "BASIC centrado en fijos": registrar que ya se guardó plata para un fijo, sin
-- que eso genere un movimiento — es un aparte de la plantilla, no un pago. Aplica sólo a fijos "una
-- vez al mes" (`not is_recurring`): una bolsa ya se va cargando de a partes como gasto real, guardar
-- "para" ella no tendría sentido (ver la discusión en el plan).
--
-- Ledger, no un valor único por período (a diferencia de `credit_card_savings`, que es un monto
-- editable) — mismo criterio que `fixed_expense_payments`/`savings_entries`: cada guardado es su
-- propia fila, se puede quitar de a uno sin perder los demás. `period` es el mismo "día 1 del mes"
-- que ya usa `fixed_expense_payments.period`.
create table public.fixed_expense_savings (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  fixed_expense_id uuid not null references public.fixed_expenses (id) on delete cascade,
  period date not null,
  amount numeric(12, 2) not null check (amount > 0),
  saved_at timestamptz not null default now(),
  note text
);

create index fixed_expense_savings_fe_period_idx on public.fixed_expense_savings (fixed_expense_id, period);

alter table public.fixed_expense_savings enable row level security;

create policy "fixed_expense_savings_select_own" on public.fixed_expense_savings
  for select using (user_id = auth.uid());

create policy "fixed_expense_savings_insert_own" on public.fixed_expense_savings
  for insert with check (user_id = auth.uid());

create policy "fixed_expense_savings_delete_own" on public.fixed_expense_savings
  for delete using (user_id = auth.uid());

grant select, insert, delete on public.fixed_expense_savings to authenticated;
