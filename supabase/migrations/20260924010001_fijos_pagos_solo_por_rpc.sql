-- Resto de FI-14 del QA de Fijos (docs/qa/fijos.md), dejado pendiente a propósito en el Bloque 5
-- (`20260923090001_fijos_blindaje.sql`): `fixed_expense_payments` seguía aceptando un insert/update
-- directo por API, sin pasar por `rpc_mark_fixed_expense_paid`/`rpc_unmark_fixed_expense_payment` —
-- alguien con la sesión de su propia cuenta podía marcar dos pagos del mismo período con
-- `is_recurring = true` (esquivando el índice único) o pisar `amount_paid` a cualquier valor, sin que
-- ningún `check` lo audite. Nunca afectó datos de otra cuenta (RLS ya lo impedía).
--
-- De paso, FI-26 (hallazgo nuevo, encontrado por lectura de código al planear este bloque y confirmado
-- en vivo): `fixed_expense_savings` tiene RLS y nunca tuvo policy de `update`. El trigger
-- `trg_transactions_sync_linked_fixed_expense` (Bloque 1) SÍ actualiza esa tabla al editar el importe
-- del movimiento de un guardado, y no era `security definer`: bajo RLS, ese `update` no falla — afecta
-- 0 filas en silencio, y el trigger lo lee como `not found` → `linked_movement_amount_invalid`. Editar
-- el importe de un guardado desde Movimientos quedaba siempre rechazado, con un error engañoso.
--
-- La solución a los dos problemas es la misma: las funciones y el trigger que escriben en
-- `fixed_expense_payments`/`fixed_expense_savings` pasan a `security definer`, y se sacan las
-- policies/grants de escritura directa — de ahora en más sólo se escribe a través de ellas. Cada una
-- ya filtraba por `user_id = auth.uid()` en sus propias consultas (el patrón que exige el checklist de
-- seguridad de CLAUDE.md); acá se suma el chequeo de sesión (`auth.uid() is not null`) al principio de
-- cada una, mismo criterio que el resto de las funciones `security definer` del repo (ver
-- `has_profile()`/`rpc_redeem_invite_code`). Ninguna cambia de firma: todo `create or replace`.
--
-- Confirmado antes de este cambio (grep sobre `src/features/fixed-expenses/api.ts`): el front sólo
-- hace `select` directo sobre estas dos tablas — todo insert/update/delete pasa por una RPC. La
-- validación de que `account_id` sea de la propia cuenta ya la hace el trigger `trg_transactions_
-- account` (`20260919010001_cuentas_saldo_y_reajuste.sql`) sobre CUALQUIER insert/update de
-- `transactions`, sea cual sea el `security` de la función que lo dispara — no hace falta repetirla
-- acá.

-- ---------------------------------------------------------------------------------------------
-- 1. Sacar la escritura directa. `select` y `delete` se quedan: `delete` no arma datos falsos (y la
--    cascada de borrar un fijo la necesita), y no había ningún caso de la UI que dependiera de un
--    delete directo distinto de la RPC de todos modos.
-- ---------------------------------------------------------------------------------------------

drop policy "fixed_expense_payments_insert_own" on public.fixed_expense_payments;
drop policy "fixed_expense_payments_update_own" on public.fixed_expense_payments;
revoke insert, update on public.fixed_expense_payments from authenticated;

drop policy "fixed_expense_savings_insert_own" on public.fixed_expense_savings;
-- `update` nunca tuvo policy (RLS ya lo bloqueaba), pero el privilegio de tabla sí estaba (FI-26):
-- se revoca también, para que la tabla diga explícitamente que sólo se escribe por RPC.
revoke insert, update on public.fixed_expense_savings from authenticated;

-- ---------------------------------------------------------------------------------------------
-- 2. `rpc_mark_fixed_expense_paid` — mismo cuerpo que `20260923100001_fijos_bolsa_paid_on.sql`, con
--    `security definer` y el chequeo de sesión.
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
security definer
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
  if v_uid is null then
    raise exception 'not_authenticated';
  end if;

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
    user_id, fixed_expense_id, period, amount_paid, transaction_id, is_recurring, note, paid_at, paid_on, previous_template_amount
  )
  values (
    v_uid, p_fixed_expense_id, date_trunc('month', p_period)::date, v_amount, v_tx_id, v_fe.is_recurring, v_note,
    case when p_occurred_on is null or p_occurred_on = v_today then now() else p_occurred_on + time '12:00' end,
    v_date,
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
-- 3. `rpc_unmark_fixed_expense_payment` — mismo cuerpo que `20260923090001_fijos_blindaje.sql`.
-- ---------------------------------------------------------------------------------------------

create or replace function public.rpc_unmark_fixed_expense_payment(p_payment_id uuid, p_force boolean default false)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_payment record;
  v_account_id uuid;
  v_has_tx boolean;
begin
  if v_uid is null then
    raise exception 'not_authenticated';
  end if;

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

-- ---------------------------------------------------------------------------------------------
-- 4. `rpc_add_fixed_expense_saving` — mismo cuerpo que `20260923100001_fijos_bolsa_paid_on.sql`,
--    firma sin cambios así que alcanza con `create or replace` (a diferencia de esa migración, que
--    sí cambiaba la firma y necesitaba `drop` + `create`).
-- ---------------------------------------------------------------------------------------------

create or replace function public.rpc_add_fixed_expense_saving(
  p_fixed_expense_id uuid,
  p_period date,
  p_amount numeric,
  p_generate_movement boolean default false,
  p_note text default null,
  p_account_id uuid default null,
  p_occurred_on date default null,
  p_today date default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_fe record;
  v_note text;
  v_today date := least(greatest(coalesce(p_today, current_date), current_date - 1), current_date + 1);
  v_date date := coalesce(p_occurred_on, v_today);
  v_tx_id uuid;
begin
  if v_uid is null then
    raise exception 'not_authenticated';
  end if;

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

-- ---------------------------------------------------------------------------------------------
-- 5. `rpc_remove_fixed_expense_saving` — mismo cuerpo que `20260913010001_fixed_expense_savings_
--    movimiento.sql`.
-- ---------------------------------------------------------------------------------------------

create or replace function public.rpc_remove_fixed_expense_saving(p_saving_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_saving record;
begin
  if v_uid is null then
    raise exception 'not_authenticated';
  end if;

  select * into v_saving from public.fixed_expense_savings where id = p_saving_id and user_id = v_uid;
  if not found then
    return;
  end if;

  if exists (
    select 1 from public.fixed_expense_payments
    where fixed_expense_id = v_saving.fixed_expense_id and period = v_saving.period
  ) then
    raise exception 'fixed_expense_saving_period_paid';
  end if;

  if v_saving.transaction_id is not null then
    delete from public.transactions where id = v_saving.transaction_id and user_id = v_uid;
  else
    delete from public.fixed_expense_savings where id = v_saving.id;
  end if;
end;
$$;

-- ---------------------------------------------------------------------------------------------
-- 6. `rpc_delete_account` — mismo cuerpo que `20260923070001_fijos_movimiento_vinculado.sql`. Ya
--    inserta y borra en `fixed_expense_savings` (reinserta una copia sin movimiento antes de borrar
--    los movimientos de la cuenta); con el punto 1 de arriba, necesita `security definer` para seguir
--    andando.
-- ---------------------------------------------------------------------------------------------

create or replace function public.rpc_delete_account(p_account_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_was_default boolean;
  v_is_archived boolean;
begin
  if v_uid is null then
    raise exception 'not_authenticated';
  end if;

  select is_default, is_archived into v_was_default, v_is_archived
  from public.balance_locations
  where id = p_account_id and user_id = v_uid
  for update;
  if not found then
    raise exception 'account_not_found';
  end if;

  perform pg_advisory_xact_lock(hashtextextended('balance_locations:' || v_uid::text, 0));

  if not v_is_archived and not exists (
    select 1 from public.balance_locations
    where user_id = v_uid and not is_archived and id <> p_account_id
  ) then
    raise exception 'account_last_active';
  end if;

  with gone as (
    delete from public.account_transfers
    where user_id = v_uid and (from_account_id = p_account_id or to_account_id = p_account_id)
    returning from_account_id, to_account_id, amount
  ), net as (
    select
      case when from_account_id = p_account_id then to_account_id else from_account_id end as other_id,
      sum(case when from_account_id = p_account_id then amount else -amount end) as delta
    from gone
    group by 1
  )
  update public.balance_locations a
  set opening_amount = a.opening_amount + net.delta, updated_at = now()
  from net
  where a.id = net.other_id and a.user_id = v_uid and net.delta <> 0;

  update public.transactions
  set fixed_expense_payment_id = null
  where account_id = p_account_id and user_id = v_uid and fixed_expense_payment_id is not null;

  insert into public.fixed_expense_savings (user_id, fixed_expense_id, period, amount, saved_at, note, transaction_id)
  select s.user_id, s.fixed_expense_id, s.period, s.amount, s.saved_at, s.note, null
  from public.fixed_expense_savings s
  where s.user_id = v_uid
    and s.transaction_id in (
      select t.id from public.transactions t where t.account_id = p_account_id and t.user_id = v_uid
    );

  delete from public.fixed_expense_savings
  where user_id = v_uid
    and transaction_id in (
      select t.id from public.transactions t where t.account_id = p_account_id and t.user_id = v_uid
    );

  delete from public.transactions where account_id = p_account_id and user_id = v_uid;
  delete from public.balance_locations where id = p_account_id and user_id = v_uid;

  if v_was_default and not exists (select 1 from public.balance_locations where user_id = v_uid and is_default) then
    update public.balance_locations
    set is_default = true, updated_at = now()
    where id = (
      select id from public.balance_locations
      where user_id = v_uid and not is_archived
      order by created_at, id
      limit 1
    );
  end if;
end;
$$;

-- ---------------------------------------------------------------------------------------------
-- 7. `trg_transactions_sync_linked_fixed_expense` (Bloque 1) — mismo cuerpo que `20260923100001_
--    fijos_bolsa_paid_on.sql`. FI-26: es el que de verdad necesitaba `security definer` para poder
--    actualizar `fixed_expense_savings` (sin policy de `update`, bajo RLS afectaba 0 filas) — hasta
--    acá sólo funcionaba para un pago (`fixed_expense_payments` sí tenía policy de `update`, por el
--    problema original de FI-14) y para un guardado terminaba en `linked_movement_amount_invalid`.
--
--    Sigue sin filtrar por `user_id` en sus propios `update`: `old`/`new` son la fila de `transactions`
--    que el usuario ya está editando bajo `transactions_update_own` (`user_id = auth.uid()`), así que
--    `old.fixed_expense_payment_id` y el guardado que apunta a `old.id` como `transaction_id` sólo
--    pueden ser de ese mismo usuario — no hace falta repetir el filtro.
-- ---------------------------------------------------------------------------------------------

create or replace function public.trg_transactions_sync_linked_fixed_expense()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_saving record;
  v_delta numeric;
begin
  if old.fixed_expense_payment_id is not null then
    if new.type is distinct from old.type then
      raise exception 'linked_movement_type_locked';
    end if;

    v_delta := new.amount - old.amount;
    if v_delta <> 0 then
      update public.fixed_expense_payments
      set amount_paid = amount_paid + v_delta
      where id = old.fixed_expense_payment_id
        and amount_paid + v_delta > 0;

      if not found then
        raise exception 'linked_movement_amount_invalid';
      end if;
    end if;

    -- Una bolsa quincenal/semanal ubica su carga en el sub-período por `paid_on` (`aggregate.ts`,
    -- `bag_cycle_from`/`bag_cycle_to`); un fijo "una vez al mes" no tiene sub-período, sólo `period`
    -- (el mes que se pagó), que no se toca al mover la fecha — sigue siendo el pago de ese mes.
    if new.occurred_on is distinct from old.occurred_on then
      update public.fixed_expense_payments
      set paid_at = new.occurred_on + time '12:00', paid_on = new.occurred_on
      where id = old.fixed_expense_payment_id and is_recurring;
    end if;

    return new;
  end if;

  select * into v_saving from public.fixed_expense_savings where transaction_id = old.id;
  if found then
    if new.type is distinct from old.type then
      raise exception 'linked_movement_type_locked';
    end if;

    if exists (
      select 1 from public.fixed_expense_payments
      where fixed_expense_id = v_saving.fixed_expense_id and period = v_saving.period
    ) then
      raise exception 'fixed_expense_saving_period_paid';
    end if;

    v_delta := new.amount - old.amount;
    if v_delta <> 0 then
      update public.fixed_expense_savings
      set amount = amount + v_delta
      where id = v_saving.id and amount + v_delta > 0;

      if not found then
        raise exception 'linked_movement_amount_invalid';
      end if;
    end if;
  end if;

  return new;
end;
$$;
