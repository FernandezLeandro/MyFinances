-- Un fijo "recurrente" (bolsa mensual) reemplaza "marcar una vez por mes" por "registrar N pagos
-- sueltos contra un presupuesto" (nafta, gastos de mamá). `amount` en la plantilla pasa a significar
-- "presupuesto del mes" en vez de "importe a pagar" cuando `is_recurring`.
alter table public.fixed_expenses
  add column is_recurring boolean not null default false;

-- Copia desnormalizada del flag de la plantilla, seteada por el RPC al insertar. Existe sólo para
-- poder conservar la garantía de unicidad donde todavía tiene sentido (ver más abajo): un índice
-- parcial no puede mirar `fixed_expenses.is_recurring` desde otra tabla. Que quede "vieja" si
-- alguien convierte una plantilla de un tipo al otro es inocuo — las filas históricas mantienen su
-- flag y el índice sólo mira las que se crearon como únicas.
alter table public.fixed_expense_payments
  add column is_recurring boolean not null default false;

-- El `unique (fixed_expense_id, period)` original evitaba que un doble click (o una pestaña PWA
-- vieja) duplicara el pago de un alquiler. Con bolsas, varios pagos por período son el caso normal
-- — la garantía pasa a aplicar sólo a los fijos de una sola vez.
alter table public.fixed_expense_payments
  drop constraint fixed_expense_payments_fixed_expense_id_period_key;

create unique index fixed_expense_payments_single_per_period_idx
  on public.fixed_expense_payments (fixed_expense_id, period)
  where not is_recurring;

-- Índice de apoyo para sumar los pagos de una bolsa en un período (usado por `rpc_projected_balance`
-- y por la pantalla de Fijos).
create index fixed_expense_payments_fe_period_idx
  on public.fixed_expense_payments (fixed_expense_id, period);

-- Marcar pagado: ahora copia `is_recurring` a la fila de pago, y sólo reescribe la plantilla cuando
-- NO es recurrente. En una bolsa cada carga es una fracción del presupuesto — pisar `amount` con el
-- importe de una sola carga dejaría el presupuesto de nafta valiendo lo que costó la última carga.
create or replace function public.rpc_mark_fixed_expense_paid(p_fixed_expense_id uuid, p_period date, p_amount numeric default null)
returns void
language plpgsql
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_fe record;
  v_amount numeric;
  v_tx_id uuid;
  v_payment_id uuid;
begin
  select * into v_fe from public.fixed_expenses where id = p_fixed_expense_id and user_id = v_uid;
  if not found then
    raise exception 'fixed_expense_not_found';
  end if;

  v_amount := coalesce(p_amount, v_fe.amount);

  insert into public.transactions (user_id, type, amount, occurred_on, category_id, description)
  values (v_uid, 'expense', v_amount, current_date, v_fe.category_id, v_fe.name)
  returning id into v_tx_id;

  insert into public.fixed_expense_payments (user_id, fixed_expense_id, period, amount_paid, transaction_id, is_recurring)
  values (v_uid, p_fixed_expense_id, date_trunc('month', p_period)::date, v_amount, v_tx_id, v_fe.is_recurring)
  returning id into v_payment_id;

  update public.transactions set fixed_expense_payment_id = v_payment_id where id = v_tx_id;

  if not v_fe.is_recurring and date_trunc('month', p_period)::date >= date_trunc('month', current_date)::date then
    update public.fixed_expenses set amount = v_amount where id = p_fixed_expense_id and user_id = v_uid;
  end if;
end;
$$;

-- Desmarcar por id de pago, no por (fijo, período): con varias filas por período (bolsas), la vieja
-- firma `(fixed_expense_id, period)` no puede saber cuál sacar. El cliente siempre tiene el id de
-- pago en la mano (viene de `useFixedExpensePayments`/`useFixedExpensePaymentHistory`), así que no
-- hace falta ambigüedad. Misma lógica que la función que reemplaza: borra la transacción enlazada
-- (no sólo el pago), porque el saldo tiene que volver exactamente a como estaba antes de marcar.
create or replace function public.rpc_unmark_fixed_expense_payment(p_payment_id uuid)
returns void
language plpgsql
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_payment record;
begin
  select * into v_payment from public.fixed_expense_payments
  where id = p_payment_id and user_id = v_uid;

  if not found then
    return;
  end if;

  delete from public.transactions where id = v_payment.transaction_id and user_id = v_uid;
  delete from public.fixed_expense_payments where id = v_payment.id;
end;
$$;

drop function public.rpc_unmark_fixed_expense_paid(uuid, date);

grant execute on function public.rpc_unmark_fixed_expense_payment(uuid) to authenticated;
