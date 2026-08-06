-- Marcar un fijo como pagado crea la transacción enlazada y el pago, en una sola transacción de
-- Postgres. SECURITY INVOKER (el default): el usuario ya es dueño de todo lo que toca, así que las
-- políticas RLS existentes alcanzan — no hace falta bypasear nada.
create or replace function public.rpc_mark_fixed_expense_paid(p_fixed_expense_id uuid, p_period date)
returns void
language plpgsql
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_fe record;
  v_occurred_on date;
  v_tx_id uuid;
  v_payment_id uuid;
begin
  select * into v_fe from public.fixed_expenses where id = p_fixed_expense_id and user_id = v_uid;
  if not found then
    raise exception 'fixed_expense_not_found';
  end if;

  -- El día de vencimiento puede no existir en todos los meses (31 en febrero): se recorta al
  -- último día real del período.
  v_occurred_on := least(
    date_trunc('month', p_period)::date + (v_fe.due_day - 1),
    (date_trunc('month', p_period) + interval '1 month - 1 day')::date
  );

  insert into public.transactions (user_id, type, amount, occurred_on, category_id, description)
  values (v_uid, 'expense', v_fe.amount, v_occurred_on, v_fe.category_id, v_fe.name)
  returning id into v_tx_id;

  insert into public.fixed_expense_payments (user_id, fixed_expense_id, period, amount_paid, transaction_id)
  values (v_uid, p_fixed_expense_id, date_trunc('month', p_period)::date, v_fe.amount, v_tx_id)
  returning id into v_payment_id;

  update public.transactions set fixed_expense_payment_id = v_payment_id where id = v_tx_id;
end;
$$;

-- Desmarcar revierte las dos filas: borra la transacción enlazada (no sólo el pago), porque el
-- saldo tiene que volver exactamente a como estaba antes de marcar. Idempotente: si ya no está
-- pagado, no hace nada.
create or replace function public.rpc_unmark_fixed_expense_paid(p_fixed_expense_id uuid, p_period date)
returns void
language plpgsql
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_payment record;
begin
  select * into v_payment from public.fixed_expense_payments
  where fixed_expense_id = p_fixed_expense_id
    and period = date_trunc('month', p_period)::date
    and user_id = v_uid;

  if not found then
    return;
  end if;

  delete from public.transactions where id = v_payment.transaction_id and user_id = v_uid;
  delete from public.fixed_expense_payments where id = v_payment.id;
end;
$$;

grant execute on function public.rpc_mark_fixed_expense_paid(uuid, date) to authenticated;
grant execute on function public.rpc_unmark_fixed_expense_paid(uuid, date) to authenticated;
