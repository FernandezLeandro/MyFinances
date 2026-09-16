-- Dos cambios pedidos por Lean sobre Movimientos:
--
-- 1. Fecha elegible al pagar/cargar/guardar un fijo — hasta ahora `rpc_mark_fixed_expense_paid` y
--    `rpc_add_fixed_expense_saving` siempre usaban `current_date` para el movimiento y `now()` para
--    `paid_at`. Si el pago se carga un día después de haberlo hecho, el movimiento quedaba con la
--    fecha de carga, no la real. Se agrega `p_occurred_on date default null` a las dos — `null`
--    (el caso de siempre) sigue siendo "hoy".
--
-- 2. Borrar un movimiento de pago desmarca el fijo — ya funcionaba al revés (desmarcar borra el
--    movimiento, `rpc_unmark_fixed_expense_payment`), pero borrar el movimiento directamente desde
--    Movimientos dejaba el pago (`fixed_expense_payments.transaction_id` es `on delete set null`)
--    con el fijo todavía marcado como pagado. Un trigger en `transactions` cierra el otro sentido.

-- ---------------------------------------------------------------------------------------------
-- 1a. Pagar un fijo de una sola vez / registrar una carga de bolsa, con fecha elegible.
-- ---------------------------------------------------------------------------------------------

drop function public.rpc_mark_fixed_expense_paid(uuid, date, numeric, text, uuid);

create function public.rpc_mark_fixed_expense_paid(
  p_fixed_expense_id uuid,
  p_period date,
  p_amount numeric default null,
  p_note text default null,
  p_account_id uuid default null,
  p_occurred_on date default null
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
  v_date date := coalesce(p_occurred_on, current_date);
  v_tx_id uuid;
  v_payment_id uuid;
  v_covered numeric := 0;
  v_tx_amount numeric;
begin
  select * into v_fe from public.fixed_expenses where id = p_fixed_expense_id and user_id = v_uid;
  if not found then
    raise exception 'fixed_expense_not_found';
  end if;

  v_amount := coalesce(p_amount, v_fe.amount);
  v_note := nullif(btrim(p_note), '');

  if not v_fe.is_recurring then
    select coalesce(sum(amount), 0) into v_covered
    from public.fixed_expense_savings
    where fixed_expense_id = p_fixed_expense_id
      and period = date_trunc('month', p_period)::date
      and transaction_id is not null;
  end if;

  v_tx_amount := greatest(v_amount - v_covered, 0);

  if v_tx_amount > 0 then
    insert into public.transactions (user_id, type, amount, occurred_on, category_id, description, account_id)
    values (v_uid, 'expense', v_tx_amount, v_date, v_fe.category_id, coalesce(v_note, v_fe.name), p_account_id)
    returning id into v_tx_id;
  end if;

  -- `paid_at` ubica una bolsa quincenal/semanal en su sub-período (`aggregate.ts`,
  -- `bag_cycle_from`/`bag_cycle_to`) — con fecha de hoy, `now()` (igual que antes); con una fecha
  -- pasada elegida a mano, esa fecha al mediodía, para no cruzar de día al convertir a hora local.
  insert into public.fixed_expense_payments (user_id, fixed_expense_id, period, amount_paid, transaction_id, is_recurring, note, paid_at)
  values (
    v_uid, p_fixed_expense_id, date_trunc('month', p_period)::date, v_amount, v_tx_id, v_fe.is_recurring, v_note,
    case when p_occurred_on is null or p_occurred_on = current_date then now() else p_occurred_on + time '12:00' end
  )
  returning id into v_payment_id;

  if v_tx_id is not null then
    update public.transactions set fixed_expense_payment_id = v_payment_id where id = v_tx_id;
  end if;

  if not v_fe.is_recurring and date_trunc('month', p_period)::date >= date_trunc('month', current_date)::date then
    update public.fixed_expenses set amount = v_amount where id = p_fixed_expense_id and user_id = v_uid;
  end if;
end;
$$;

grant execute on function public.rpc_mark_fixed_expense_paid(uuid, date, numeric, text, uuid, date) to authenticated;

-- ---------------------------------------------------------------------------------------------
-- 1b. Guardar (con o sin movimiento) para un fijo de una sola vez, con fecha elegible — sólo
--     importa cuando genera movimiento; un guardado "aparte" no tiene fecha propia.
-- ---------------------------------------------------------------------------------------------

drop function public.rpc_add_fixed_expense_saving(uuid, date, numeric, boolean, text, uuid);

create function public.rpc_add_fixed_expense_saving(
  p_fixed_expense_id uuid,
  p_period date,
  p_amount numeric,
  p_generate_movement boolean default false,
  p_note text default null,
  p_account_id uuid default null,
  p_occurred_on date default null
)
returns void
language plpgsql
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_fe record;
  v_note text;
  v_date date := coalesce(p_occurred_on, current_date);
  v_tx_id uuid;
begin
  select * into v_fe from public.fixed_expenses where id = p_fixed_expense_id and user_id = v_uid;
  if not found then
    raise exception 'fixed_expense_not_found';
  end if;

  if v_fe.is_recurring then
    raise exception 'fixed_expense_saving_not_applicable';
  end if;

  if p_amount is null or p_amount <= 0 then
    raise exception 'fixed_expense_saving_invalid_amount';
  end if;

  v_note := nullif(btrim(p_note), '');

  if p_generate_movement then
    insert into public.transactions (user_id, type, amount, occurred_on, category_id, description, account_id)
    values (v_uid, 'expense', p_amount, v_date, v_fe.category_id, coalesce(v_note, 'Guardado · ' || v_fe.name), p_account_id)
    returning id into v_tx_id;
  end if;

  insert into public.fixed_expense_savings (user_id, fixed_expense_id, period, amount, note, transaction_id)
  values (v_uid, p_fixed_expense_id, date_trunc('month', p_period)::date, p_amount, v_note, v_tx_id);
end;
$$;

grant execute on function public.rpc_add_fixed_expense_saving(uuid, date, numeric, boolean, text, uuid, date) to authenticated;

-- ---------------------------------------------------------------------------------------------
-- 2. Borrar un movimiento de pago (desde Movimientos, o por cualquier otro camino futuro) desmarca
--    el fijo — simétrico a `rpc_unmark_fixed_expense_payment`, que ya borra el movimiento al
--    desmarcar. No choca con esa RPC: borra el movimiento primero, este trigger se lleva el pago, y
--    el `delete from fixed_expense_payments` que sigue en la RPC ya no encuentra la fila (no rompe).
--    Borrar un fijo entero no dispara esto: sus pagos se van por `on delete cascade`
--    (`fixed_expense_id`) antes de que la columna de `transactions` importe, y los movimientos
--    quedan con `fixed_expense_payment_id = null` (`on delete set null`), sin borrarse.
-- ---------------------------------------------------------------------------------------------

create function public.trg_transactions_unmark_fixed_payment()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  delete from public.fixed_expense_payments where id = old.fixed_expense_payment_id;
  return old;
end;
$$;

create trigger transactions_unmark_fixed_payment
after delete on public.transactions
for each row
when (old.fixed_expense_payment_id is not null)
execute function public.trg_transactions_unmark_fixed_payment();
