-- Compras a crédito sueltas: el mismo concepto que una compra de tarjeta (cuotas derivadas de
-- first_period, ver 20260808020001), sólo que sin tarjeta padre — comprar algo a crédito en un
-- comercio sin que exista una tarjeta real detrás. Se extiende credit_purchases en vez de crear una
-- tabla paralela: category_id ya vive por compra desde 20260808030001, así que lo único que falta
-- es el día de vencimiento (hoy vive sólo en credit_cards, del que una compra suelta no tiene).
alter table public.credit_purchases alter column card_id drop not null;

alter table public.credit_purchases
  add column due_day int check (due_day between 1 and 31),
  add constraint credit_purchases_card_or_due_day check (card_id is not null or due_day is not null);

-- v_credit_installments (20260808020001, redefinida en 20260808030001) ya selecciona sólo de
-- credit_purchases sin joinear credit_cards, así que devuelve card_id = null para estas filas sin
-- que haga falta tocar la vista.

-- Mismo contrato que fixed_expense_payments: la EXISTENCIA de esta fila es el estado "pagada" de
-- una compra suelta en un período — no un flag. A diferencia de credit_card_payments (que agrupa
-- todas las compras de una tarjeta bajo un solo pago de período), acá no hay nada que agrupar: cada
-- compra suelta es su propio ítem, así que el pago es uno por compra por período, igual que un fijo.
create table public.credit_purchase_payments (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  purchase_id uuid not null references public.credit_purchases (id) on delete cascade,
  period date not null check (period = date_trunc('month', period)::date),
  paid_at timestamptz not null default now(),
  amount_paid numeric(12, 2) not null check (amount_paid > 0),
  transaction_id uuid references public.transactions (id) on delete set null,
  unique (purchase_id, period)
);

create index credit_purchase_payments_user_period_idx on public.credit_purchase_payments (user_id, period);

alter table public.credit_purchase_payments enable row level security;

create policy "credit_purchase_payments_select_own" on public.credit_purchase_payments
  for select using (user_id = auth.uid());

create policy "credit_purchase_payments_insert_own" on public.credit_purchase_payments
  for insert with check (user_id = auth.uid());

create policy "credit_purchase_payments_update_own" on public.credit_purchase_payments
  for update using (user_id = auth.uid());

create policy "credit_purchase_payments_delete_own" on public.credit_purchase_payments
  for delete using (user_id = auth.uid());
