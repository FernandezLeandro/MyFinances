-- Bloques 3 y 4 del arreglo de Movimientos (docs/qa/movimientos.md): hasta acá, borrar o editar
-- desde Movimientos el movimiento de un pago de tarjeta, de una cuota o de una deuda no avisaba
-- nada y dejaba el origen desincronizado —
--
--   * MO-02/MO-04: borrar el movimiento de un pago de tarjeta o de una cuota deja la tarjeta/cuota
--     "pagada" igual (el FK es `on delete set null`, nada recalcula el período);
--   * MO-05/MO-06: borrar «Descontado: X» no reabre la deuda (riesgo de doble ingreso en el próximo
--     abono); borrar «Me devolvió X» deja el abono registrado sin el ingreso real;
--   * MO-03: editar la categoría de un pago de tarjeta no actualiza el detalle del período;
--   * MO-07: editar el importe de "tu parte" de un gasto compartido no mueve la deuda — el 50/50
--     original deja de describir la plata real.
--
-- La solución: un `delete` directo de un movimiento vinculado a una tarjeta/cuota/deuda queda
-- bloqueado (`transactions_block_delete_linked`) — el front pasa a usar la RPC de "deshacer" que ya
-- tiene la pantalla de origen (Bloque 3, `TransactionFormDialog`). Un `update` de importe o tipo
-- sobre esos mismos orígenes también queda bloqueado (`transactions_lock_linked`, Bloque 4): no hay
-- ningún trigger que reparta ese cambio del lado del origen, así que la única forma de cambiarlo es
-- deshacer el vínculo y volver a cargarlo. `fixed_expense_payment_id`/`fixed_expense_savings` NO
-- entran acá — ya tienen su propio blindaje del Bloque 1 del QA de Fijos.
--
-- `app.linked_delete_ok`: las RPC de "deshacer" (y `rpc_delete_account`, que deja esos pagos como
-- pagados a propósito, ver `20260919010001_cuentas_saldo_y_reajuste.sql`) prenden esta bandera de
-- sesión antes de borrar — `set_config(..., true)` con `is_local = true` la apaga sola al terminar
-- la transacción, así que no hace falta un `reset` explícito ni se filtra a la próxima consulta.
-- `auth.uid() is distinct from old.user_id` cubre la baja de un usuario desde el admin (cascada por
-- `on delete cascade` de `transactions.user_id`): ahí el que corre es el admin, no el dueño de la
-- fila, y bloquear esa cascada rompería `rpc_admin_delete_user` sin ningún beneficio real.

-- MO-16 (Bloque 1): mismo tope que ya pone el form (`min`/`max` en `TransactionFormDialog`). Si
-- alguna fila real fuera anterior a esta fecha, Postgres rechaza agregar el `check` con un error
-- claro al aplicar la migración — no corrompe nada; en ese caso se ajusta la fecha antes de
-- reintentar, no se baja el tope.
alter table public.transactions
  add constraint transactions_occurred_on_min check (occurred_on >= '2000-01-01');

create function public.trg_transactions_block_delete_linked()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if auth.uid() is distinct from old.user_id then
    return old;
  end if;
  if current_setting('app.linked_delete_ok', true) = 'on' then
    return old;
  end if;

  if exists (select 1 from public.credit_card_payment_items where transaction_id = old.id)
    or exists (select 1 from public.credit_purchase_payments where transaction_id = old.id)
    or exists (select 1 from public.receivables where expense_transaction_id = old.id)
    or exists (select 1 from public.receivable_payments where transaction_id = old.id)
  then
    raise exception 'linked_movement_use_origin';
  end if;

  return old;
end;
$$;

create trigger transactions_block_delete_linked
before delete on public.transactions
for each row execute function public.trg_transactions_block_delete_linked();

create function public.trg_transactions_lock_linked()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.amount is not distinct from old.amount and new.type is not distinct from old.type then
    return new;
  end if;
  if current_setting('app.linked_delete_ok', true) = 'on' then
    return new;
  end if;

  if exists (select 1 from public.credit_card_payment_items where transaction_id = old.id)
    or exists (select 1 from public.credit_purchase_payments where transaction_id = old.id)
    or exists (select 1 from public.receivables where expense_transaction_id = old.id)
    or exists (select 1 from public.receivable_payments where transaction_id = old.id)
  then
    raise exception 'linked_movement_locked';
  end if;

  return new;
end;
$$;

create trigger transactions_lock_linked
before update of amount, type on public.transactions
for each row execute function public.trg_transactions_lock_linked();

-- MO-03: la categoría de un pago de tarjeta se edita desde Movimientos (importe y tipo quedan
-- bloqueados por el trigger de arriba, pero categoría sí es editable) — sin esto,
-- `credit_card_payment_items.category_id` quedaba desactualizada y el detalle del período en Mis
-- Deudas seguía agrupando esa compra bajo la categoría vieja.
create function public.trg_credit_card_payment_items_sync_category()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  update public.credit_card_payment_items
  set category_id = new.category_id
  where transaction_id = new.id;

  return new;
end;
$$;

create trigger transactions_sync_card_item_category
after update of category_id on public.transactions
for each row
when (new.is_credit_card_payment)
execute function public.trg_credit_card_payment_items_sync_category();

-- Las 4 RPC de "deshacer" que el Bloque 3 conecta desde Movimientos, con `set_config` agregado —
-- mismo cuerpo que su última versión, `create or replace`.

create or replace function public.rpc_unmark_credit_card_paid(p_card_id uuid, p_period date)
returns void
language plpgsql
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_payment_id uuid;
begin
  select id into v_payment_id from public.credit_card_payments
  where card_id = p_card_id
    and period = date_trunc('month', p_period)::date
    and user_id = v_uid;

  if not found then
    return;
  end if;

  perform set_config('app.linked_delete_ok', 'on', true);

  delete from public.transactions
  where user_id = v_uid
    and id in (
      select transaction_id from public.credit_card_payment_items
      where payment_id = v_payment_id and transaction_id is not null
    );

  delete from public.credit_card_payments where id = v_payment_id;
  -- credit_card_payment_items se va solo por el on delete cascade de payment_id.
end;
$$;

create or replace function public.rpc_unmark_credit_purchase_paid(p_purchase_id uuid, p_period date)
returns void
language plpgsql
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_payment record;
begin
  select * into v_payment from public.credit_purchase_payments
  where purchase_id = p_purchase_id
    and period = date_trunc('month', p_period)::date
    and user_id = v_uid;

  if not found then
    return;
  end if;

  perform set_config('app.linked_delete_ok', 'on', true);

  delete from public.transactions where id = v_payment.transaction_id and user_id = v_uid;
  delete from public.credit_purchase_payments where id = v_payment.id;
end;
$$;

create or replace function public.rpc_unexpense_receivable(p_receivable_id uuid)
returns void
language plpgsql
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_receivable record;
  v_has_income_payments boolean;
begin
  select * into v_receivable from public.receivables where id = p_receivable_id and user_id = v_uid;
  if not found then
    raise exception 'receivable_not_found';
  end if;

  if not v_receivable.already_expensed then
    return; -- idempotente
  end if;

  select exists(
    select 1 from public.receivable_payments
    where receivable_id = p_receivable_id and user_id = v_uid and transaction_id is not null
  ) into v_has_income_payments;

  if v_has_income_payments then
    raise exception 'receivable_has_income_payments';
  end if;

  if v_receivable.expense_transaction_id is not null then
    perform set_config('app.linked_delete_ok', 'on', true);
    delete from public.transactions where id = v_receivable.expense_transaction_id and user_id = v_uid;
  end if;

  update public.receivables
  set already_expensed = false, expense_transaction_id = null, updated_at = now()
  where id = p_receivable_id;
end;
$$;

create or replace function public.rpc_delete_receivable_payment(p_payment_id uuid)
returns void
language plpgsql
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_payment record;
begin
  select * into v_payment from public.receivable_payments where id = p_payment_id and user_id = v_uid;

  if not found then
    return;
  end if;

  if v_payment.transaction_id is not null then
    perform set_config('app.linked_delete_ok', 'on', true);
    delete from public.transactions where id = v_payment.transaction_id and user_id = v_uid;
  end if;

  delete from public.receivable_payments where id = v_payment.id;
end;
$$;

-- `rpc_delete_account`: mismo cuerpo que la última versión (`20260924010001_fijos_pagos_solo_por_rpc.sql`),
-- con `set_config` agregado antes del `delete` masivo de movimientos de la cuenta — a propósito deja
-- esos pagos/deudas como "pagados"/"descontados" sin su movimiento real (ver el comentario original
-- de `20260919010001_cuentas_saldo_y_reajuste.sql`), borrar la cuenta entera no puede ponerse a
-- deshacer cada pago uno por uno.
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

  perform set_config('app.linked_delete_ok', 'on', true);
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
