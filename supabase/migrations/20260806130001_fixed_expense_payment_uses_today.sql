-- La transacción que genera "marcar como pagado" queda fechada con el día de vencimiento del
-- fijo, lo cual puede caer en el futuro dentro del mes (p.ej. vence el 20 y hoy es 6) — esa fecha
-- futura quedaba fuera del rango "Este mes" de Análisis (que corta en hoy, no en fin de mes), así
-- que el gasto no aparecía. Además es conceptualmente más correcto: la plata sale el día que se
-- marca como pagado, no el día teórico de vencimiento. Se usa `current_date`.
create or replace function public.rpc_mark_fixed_expense_paid(p_fixed_expense_id uuid, p_period date)
returns void
language plpgsql
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_fe record;
  v_tx_id uuid;
  v_payment_id uuid;
begin
  select * into v_fe from public.fixed_expenses where id = p_fixed_expense_id and user_id = v_uid;
  if not found then
    raise exception 'fixed_expense_not_found';
  end if;

  insert into public.transactions (user_id, type, amount, occurred_on, category_id, description)
  values (v_uid, 'expense', v_fe.amount, current_date, v_fe.category_id, v_fe.name)
  returning id into v_tx_id;

  insert into public.fixed_expense_payments (user_id, fixed_expense_id, period, amount_paid, transaction_id)
  values (v_uid, p_fixed_expense_id, date_trunc('month', p_period)::date, v_fe.amount, v_tx_id)
  returning id into v_payment_id;

  update public.transactions set fixed_expense_payment_id = v_payment_id where id = v_tx_id;
end;
$$;
