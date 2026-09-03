-- Un fijo recurrente (bolsa mensual) no vence: es un presupuesto que se va llenando a lo largo del
-- mes, no una obligación con fecha. Hasta ahora `due_day` era obligatorio igual y se usaba sólo para
-- ordenar la lista — un dato inventado. Pasa a ser nullable y los recurrentes quedan sin vencimiento;
-- el orden de la pantalla los pone primero (ver `compareFixedExpenses` en `aggregate.ts`).
alter table public.fixed_expenses alter column due_day drop not null;

update public.fixed_expenses set due_day = null where is_recurring;

-- El `check (due_day between 1 and 31)` original no hace falta tocarlo: con `due_day` nulo evalúa a
-- NULL, y un check que no es falso pasa.

-- Detalle libre de cada carga: una bolsa "Comida" con cuatro cargas en el mes generaba cuatro
-- movimientos llamados todos "Comida", indistinguibles en /movimientos. El detalle es lo que se lee
-- ahí ("Chino del barrio"); la categoría sigue siendo el vínculo con el fijo.
alter table public.fixed_expense_payments add column note text;

-- Firma nueva (suma `p_note`), así que va drop + create y no `create or replace`: replace dejaría
-- vivo el overload de 3 args y las llamadas de 3 parámetros quedarían ambiguas. Mismo patrón que
-- `20260808010001_fixed_expense_paid_amount.sql` cuando sumó `p_amount`.
drop function public.rpc_mark_fixed_expense_paid(uuid, date, numeric);

create function public.rpc_mark_fixed_expense_paid(
  p_fixed_expense_id uuid,
  p_period date,
  p_amount numeric default null,
  p_note text default null
)
returns void
language plpgsql
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_fe record;
  v_amount numeric;
  v_note text;
  v_tx_id uuid;
  v_payment_id uuid;
begin
  select * into v_fe from public.fixed_expenses where id = p_fixed_expense_id and user_id = v_uid;
  if not found then
    raise exception 'fixed_expense_not_found';
  end if;

  v_amount := coalesce(p_amount, v_fe.amount);
  v_note := nullif(btrim(p_note), '');

  -- Sin detalle, la descripción sigue siendo el nombre del fijo (comportamiento de siempre).
  insert into public.transactions (user_id, type, amount, occurred_on, category_id, description)
  values (v_uid, 'expense', v_amount, current_date, v_fe.category_id, coalesce(v_note, v_fe.name))
  returning id into v_tx_id;

  insert into public.fixed_expense_payments (user_id, fixed_expense_id, period, amount_paid, transaction_id, is_recurring, note)
  values (v_uid, p_fixed_expense_id, date_trunc('month', p_period)::date, v_amount, v_tx_id, v_fe.is_recurring, v_note)
  returning id into v_payment_id;

  update public.transactions set fixed_expense_payment_id = v_payment_id where id = v_tx_id;

  if not v_fe.is_recurring and date_trunc('month', p_period)::date >= date_trunc('month', current_date)::date then
    update public.fixed_expenses set amount = v_amount where id = p_fixed_expense_id and user_id = v_uid;
  end if;
end;
$$;

-- Obligatorio: el drop se llevó el grant de la firma vieja.
grant execute on function public.rpc_mark_fixed_expense_paid(uuid, date, numeric, text) to authenticated;
