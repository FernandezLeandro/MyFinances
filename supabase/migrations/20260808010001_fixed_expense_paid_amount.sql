-- Marcar un fijo como pagado pasa a aceptar un importe distinto del de la plantilla (aumentos,
-- ajustes por inflación) — hasta ahora `amount_paid` existía en el esquema pero siempre era una
-- copia exacta de `fixed_expenses.amount`, nunca se cableó a un valor propio.
--
-- El `drop` de acá abajo NO es prolijidad: la identidad de una función en Postgres es
-- (nombre, tipos de argumento). Un `create or replace` con un argumento nuevo CREA UNA SOBRECARGA
-- al lado de la `(uuid, date)` existente, no la reemplaza. Con las dos vivas, una llamada de
-- PostgREST que matchee ambas falla con PGRST203 ("Could not choose the best candidate function").
-- Si en algún momento "prolijan" este archivo sacando el drop, van a romper el flujo actual.
drop function if exists public.rpc_mark_fixed_expense_paid(uuid, date);

-- El importe de la plantilla sólo se actualiza si el período pagado es el mes en curso o uno
-- futuro. Si se actualizara siempre: pagás agosto con un aumento (plantilla → nuevo importe),
-- después marcás julio atrasado con el importe viejo → la plantilla vuelve para atrás y el
-- proyectado de septiembre queda optimista en silencio. La guarda va acá, no sólo en el cliente,
-- porque es una PWA: una pestaña vieja abierta que cruza el cambio de mes podría mandar un cálculo
-- hecho con el "hoy" de ayer.
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

  insert into public.fixed_expense_payments (user_id, fixed_expense_id, period, amount_paid, transaction_id)
  values (v_uid, p_fixed_expense_id, date_trunc('month', p_period)::date, v_amount, v_tx_id)
  returning id into v_payment_id;

  update public.transactions set fixed_expense_payment_id = v_payment_id where id = v_tx_id;

  if date_trunc('month', p_period)::date >= date_trunc('month', current_date)::date then
    update public.fixed_expenses set amount = v_amount where id = p_fixed_expense_id and user_id = v_uid;
  end if;
end;
$$;

grant execute on function public.rpc_mark_fixed_expense_paid(uuid, date, numeric) to authenticated;
