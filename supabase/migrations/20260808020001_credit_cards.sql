-- Créditos: deudas de tarjeta, en cuotas. La clave del diseño es que NO hay un contador de cuotas
-- restantes ni se borran filas al pagar — qué cuota de una compra cae en un período P se deriva de
-- `first_period` + `installments`. Una compra de 1 cuota deja de matchear al mes siguiente sola; una
-- de 12 se apaga sola en el mes 13. Volver a mirar un mes viejo muestra exactamente lo que había.

create table public.credit_cards (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  name text not null,
  due_day int not null check (due_day between 1 and 31),
  -- Prellenada al pagar, para que el movimiento generado entre al donut de Análisis (que excluye
  -- transacciones sin categoría) sin tener que elegirla todos los meses.
  category_id uuid references public.categories (id) on delete set null,
  created_at timestamptz not null default now()
);

create index credit_cards_user_idx on public.credit_cards (user_id);

alter table public.credit_cards enable row level security;

create policy "credit_cards_select_own" on public.credit_cards
  for select using (user_id = auth.uid());

create policy "credit_cards_insert_own" on public.credit_cards
  for insert with check (user_id = auth.uid());

create policy "credit_cards_update_own" on public.credit_cards
  for update using (user_id = auth.uid());

create policy "credit_cards_delete_own" on public.credit_cards
  for delete using (user_id = auth.uid());

-- Se guarda el monto de CADA CUOTA, no el total de la compra — es lo que hay que sumar para saber
-- cuánto se debe en un mes dado. El total (para mostrar) es `installment_amount * installments`.
create table public.credit_purchases (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  card_id uuid not null references public.credit_cards (id) on delete cascade,
  description text not null,
  installment_amount numeric(12, 2) not null check (installment_amount > 0),
  installments int not null check (installments between 1 and 120),
  -- Siempre día 1: es el mes del primer resumen en el que cae la compra. La restricción no es
  -- cosmética — es lo que permite que la aritmética de meses de v_credit_installments sea exacta.
  first_period date not null check (first_period = date_trunc('month', first_period)::date),
  notes text,
  created_at timestamptz not null default now()
);

create index credit_purchases_user_card_idx on public.credit_purchases (user_id, card_id);

alter table public.credit_purchases enable row level security;

create policy "credit_purchases_select_own" on public.credit_purchases
  for select using (user_id = auth.uid());

create policy "credit_purchases_insert_own" on public.credit_purchases
  for insert with check (user_id = auth.uid());

create policy "credit_purchases_update_own" on public.credit_purchases
  for update using (user_id = auth.uid());

create policy "credit_purchases_delete_own" on public.credit_purchases
  for delete using (user_id = auth.uid());

-- Lo guardado existe ANTES del pago — es el dato que responde "cuánto me falta juntar del sueldo".
-- Un monto editable por tarjeta y período, no un libro de aportes: se pisa con upsert, no se
-- acumula fila por fila (eso queda para si algún día hace falta un historial).
create table public.credit_card_savings (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  card_id uuid not null references public.credit_cards (id) on delete cascade,
  period date not null check (period = date_trunc('month', period)::date),
  amount numeric(12, 2) not null check (amount >= 0),
  updated_at timestamptz not null default now(),
  unique (card_id, period)
);

create index credit_card_savings_user_period_idx on public.credit_card_savings (user_id, period);

alter table public.credit_card_savings enable row level security;

create policy "credit_card_savings_select_own" on public.credit_card_savings
  for select using (user_id = auth.uid());

create policy "credit_card_savings_insert_own" on public.credit_card_savings
  for insert with check (user_id = auth.uid());

create policy "credit_card_savings_update_own" on public.credit_card_savings
  for update using (user_id = auth.uid());

create policy "credit_card_savings_delete_own" on public.credit_card_savings
  for delete using (user_id = auth.uid());

-- Mismo contrato que fixed_expense_payments: la EXISTENCIA de esta fila es el estado "pagado" de
-- una tarjeta en un período — no un flag, que se rompería el mes siguiente. Deliberadamente
-- separada de credit_card_savings: son ciclos de vida distintos (lo guardado se edita N veces en
-- el mes, el pago es un evento único con una transacción atada), y separarlas es lo que permite que
-- desmarcar un pago no toque un centavo de lo guardado.
create table public.credit_card_payments (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  card_id uuid not null references public.credit_cards (id) on delete cascade,
  period date not null check (period = date_trunc('month', period)::date),
  paid_at timestamptz not null default now(),
  amount_paid numeric(12, 2) not null check (amount_paid > 0),
  transaction_id uuid references public.transactions (id) on delete set null,
  unique (card_id, period)
);

create index credit_card_payments_user_period_idx on public.credit_card_payments (user_id, period);

alter table public.credit_card_payments enable row level security;

create policy "credit_card_payments_select_own" on public.credit_card_payments
  for select using (user_id = auth.uid());

create policy "credit_card_payments_insert_own" on public.credit_card_payments
  for insert with check (user_id = auth.uid());

create policy "credit_card_payments_update_own" on public.credit_card_payments
  for update using (user_id = auth.uid());

create policy "credit_card_payments_delete_own" on public.credit_card_payments
  for delete using (user_id = auth.uid());

-- Foto de qué se abonó en un pago. `description`/`installment_no` van denormalizados y
-- `purchase_id` es `on delete set null`: borrar o editar una compra meses después no puede
-- reescribir lo que ya se pagó — misma razón por la que fixed_expense_payments guarda
-- `amount_paid` en vez de leer la plantilla al mostrar el historial.
create table public.credit_card_payment_items (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  payment_id uuid not null references public.credit_card_payments (id) on delete cascade,
  purchase_id uuid references public.credit_purchases (id) on delete set null,
  description text not null,
  installment_no int not null,
  installments int not null,
  amount numeric(12, 2) not null check (amount > 0)
);

create index credit_card_payment_items_payment_idx on public.credit_card_payment_items (payment_id);

alter table public.credit_card_payment_items enable row level security;

create policy "credit_card_payment_items_select_own" on public.credit_card_payment_items
  for select using (user_id = auth.uid());

create policy "credit_card_payment_items_insert_own" on public.credit_card_payment_items
  for insert with check (user_id = auth.uid());

create policy "credit_card_payment_items_update_own" on public.credit_card_payment_items
  for update using (user_id = auth.uid());

create policy "credit_card_payment_items_delete_own" on public.credit_card_payment_items
  for delete using (user_id = auth.uid());

-- La única definición de "qué cuotas caen en el período P" — la consumen tres cosas que necesitan
-- la misma respuesta: esta vista (para la página), rpc_mark_credit_card_paid (para armar el pago) y
-- rpc_projected_balance (para descontar del saldo proyectado). Mismo criterio que v_spend_by_category:
-- lectura agregada parametrizada, security invoker (no hace falta bypasear RLS, el usuario ya es
-- dueño de todo lo que toca).
create or replace function public.v_credit_installments(p_period date)
returns table (
  card_id uuid,
  purchase_id uuid,
  description text,
  installment_no int,
  installments int,
  amount numeric
)
language sql
stable
set search_path = public
as $$
  select
    cp.card_id,
    cp.id,
    cp.description,
    (
      (date_part('year', date_trunc('month', p_period)) - date_part('year', cp.first_period)) * 12
      + (date_part('month', date_trunc('month', p_period)) - date_part('month', cp.first_period))
    )::int + 1 as installment_no,
    cp.installments,
    cp.installment_amount
  from public.credit_purchases cp
  where cp.user_id = auth.uid()
    and date_trunc('month', p_period)::date >= cp.first_period
    and date_trunc('month', p_period)::date < (cp.first_period + make_interval(months => cp.installments))::date
$$;

grant execute on function public.v_credit_installments(date) to authenticated;
