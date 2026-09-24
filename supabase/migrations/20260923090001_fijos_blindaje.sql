-- Bloque 5 del plan de arreglo de Fijos (docs/qa/fijos.md), FI-14: blindaje contra datos armados a
-- mano por API directa, con la sesión de la propia cuenta (nunca sobre datos ajenos — RLS ya lo
-- impide). Nada de esto cambia una firma de función, así que va todo con `create or replace`/`alter
-- table`, sin dropear ni volver a otorgar permisos.
--
-- Deliberadamente AFUERA de este bloque: sacar las policies de insert/update directas de
-- `fixed_expense_payments` (lo que proponía el plan original). Las RPC que escriben esa tabla
-- (`rpc_mark_fixed_expense_paid`, `rpc_unmark_fixed_expense_payment`, `rpc_add_fixed_expense_saving`)
-- y el trigger `transactions_sync_linked_fixed_expense` (bloque 1) NO son `security definer` — corren
-- con el permiso de quien llama, apoyados en esas mismas policies. Sacarlas rompería el flujo normal
-- de "Marcar pagado" para cualquier usuario, no sólo el acceso directo por API. Hacerlo bien requeriría
-- convertir esas funciones a `security definer` con una revisión aparte (cada una ya valida
-- `user_id = auth.uid()` puertas adentro, pero es un cambio de superficie de seguridad real, no un
-- ajuste chico) — se deja pendiente, no se improvisa acá.

-- ---------------------------------------------------------------------------------------------
-- 1. `fixed_expenses`: incoherencias que hoy sólo evita el form, no la base.
-- ---------------------------------------------------------------------------------------------

alter table public.fixed_expenses
  add constraint fixed_expenses_name_not_blank check (btrim(name) <> '' and char_length(name) <= 80);

-- Una bolsa (`is_recurring`) no tiene vencimiento; un fijo de una sola vez sí lo necesita — hoy la API
-- podía guardar una bolsa con `due_day` o un fijo de una sola vez sin él (FI-14: "«una vez al mes» sin
-- día" se veía «Vence el —» en la UI).
alter table public.fixed_expenses
  add constraint fixed_expenses_due_day_matches_recurring check (is_recurring = (due_day is null));

-- ---------------------------------------------------------------------------------------------
-- 2. `rpc_mark_fixed_expense_paid`: paga un fijo pausado, y acepta una fecha futura (el front ya
--    manda `max={today}` en el input, esto es la misma regla del lado del servidor). Mismo cuerpo que
--    `20260923080001_fijos_alta_y_deshacer_importe.sql`, con los dos chequeos nuevos apenas se
--    encuentra el fijo.
-- ---------------------------------------------------------------------------------------------

create or replace function public.rpc_mark_fixed_expense_paid(
  p_fixed_expense_id uuid,
  p_period date,
  p_amount numeric default null,
  p_note text default null,
  p_account_id uuid default null,
  p_occurred_on date default null,
  p_today date default null
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
  v_today date := least(greatest(coalesce(p_today, current_date), current_date - 1), current_date + 1);
  v_date date := coalesce(p_occurred_on, v_today);
  v_tx_id uuid;
  v_payment_id uuid;
  v_covered numeric := 0;
  v_tx_amount numeric;
  v_updates_template boolean;
begin
  select * into v_fe from public.fixed_expenses where id = p_fixed_expense_id and user_id = v_uid;
  if not found then
    raise exception 'fixed_expense_not_found';
  end if;

  if not v_fe.is_active then
    raise exception 'fixed_expense_inactive';
  end if;

  if p_occurred_on is not null and p_occurred_on > v_today then
    raise exception 'fixed_expense_payment_future_date';
  end if;

  v_amount := coalesce(p_amount, v_fe.amount);
  v_note := nullif(btrim(p_note), '');
  v_updates_template := not v_fe.is_recurring and date_trunc('month', p_period)::date >= date_trunc('month', v_today)::date;

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

  insert into public.fixed_expense_payments (
    user_id, fixed_expense_id, period, amount_paid, transaction_id, is_recurring, note, paid_at, previous_template_amount
  )
  values (
    v_uid, p_fixed_expense_id, date_trunc('month', p_period)::date, v_amount, v_tx_id, v_fe.is_recurring, v_note,
    case when p_occurred_on is null or p_occurred_on = v_today then now() else p_occurred_on + time '12:00' end,
    case when v_updates_template then v_fe.amount else null end
  )
  returning id into v_payment_id;

  if v_tx_id is not null then
    update public.transactions set fixed_expense_payment_id = v_payment_id where id = v_tx_id;
  end if;

  if v_updates_template then
    update public.fixed_expenses set amount = v_amount where id = p_fixed_expense_id and user_id = v_uid;
  end if;
end;
$$;

-- ---------------------------------------------------------------------------------------------
-- 3. `rpc_unmark_fixed_expense_payment`: un id que no existe (o de otra cuenta, ya cubierto por RLS
--    en el `where`) respondía OK sin hacer nada — ahora es un error, igual que cualquier otra RPC de
--    esta pantalla que no encuentra lo que le piden (`fixed_expense_not_found`,
--    `account_not_found`). Mismo cuerpo que `20260923030001_desmarcar_pago_sin_movimiento.sql`.
-- ---------------------------------------------------------------------------------------------

create or replace function public.rpc_unmark_fixed_expense_payment(p_payment_id uuid, p_force boolean default false)
returns void
language plpgsql
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_payment record;
  v_account_id uuid;
  v_has_tx boolean;
begin
  select * into v_payment from public.fixed_expense_payments
  where id = p_payment_id and user_id = v_uid;

  if not found then
    raise exception 'fixed_expense_payment_not_found';
  end if;

  if not p_force and v_payment.transaction_id is not null then
    select account_id, true into v_account_id, v_has_tx
    from public.transactions
    where id = v_payment.transaction_id and user_id = v_uid;

    if v_has_tx and v_account_id is null and exists (select 1 from public.balance_locations where user_id = v_uid) then
      raise exception 'payment_before_accounts';
    end if;
  end if;

  if v_payment.previous_template_amount is not null then
    update public.fixed_expenses
    set amount = v_payment.previous_template_amount
    where id = v_payment.fixed_expense_id and user_id = v_uid and amount = v_payment.amount_paid;
  end if;

  delete from public.transactions where id = v_payment.transaction_id and user_id = v_uid;
  delete from public.fixed_expense_payments where id = v_payment.id;
end;
$$;
