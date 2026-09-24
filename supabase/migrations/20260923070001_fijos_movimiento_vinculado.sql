-- QA de Fijos (docs/qa/fijos.md), Bloque 1: el pago/guardado de un fijo y su movimiento en
-- Movimientos se desincronizaban en tres formas (FI-02, FI-03, FI-05):
--
--   * editar el IMPORTE del movimiento de un pago no tocaba `fixed_expense_payments.amount_paid` —
--     Fijos y el historial seguían mostrando el importe viejo, aunque salió (o entró) otra plata;
--   * pasar el TIPO de Gasto a Ingreso dejaba el fijo "pagado" con un movimiento que ahora SUMA al
--     saldo, en vez de restar — la plata queda contada dos veces, con el signo cambiado;
--   * borrar el movimiento de un GUARDADO cuyo mes ya está pagado (el guardado cubría todo o parte
--     del fijo, y el pago ya se registró) dejaba el fijo "pagado" con menos plata de la que salió —
--     mismo freno que ya tiene `rpc_remove_fixed_expense_saving`, pero ausente cuando se borra desde
--     Movimientos en vez de desde el detalle del fijo.
--
-- La solución: dos triggers en `transactions` que actúan SÓLO cuando el movimiento está vinculado a
-- un pago (`fixed_expense_payment_id`) o a un guardado (`fixed_expense_savings.transaction_id`) —
-- cualquier otro movimiento pasa de largo sin costo. Cubren tanto el camino nuevo (editar/borrar
-- desde `TransactionFormDialog`) como cualquier camino futuro que toque `transactions` directo.

-- Índice de apoyo: el trigger de UPDATE/DELETE necesita, por cada movimiento que se toca, saber SI
-- es el movimiento de un guardado — sin esto sería un seq scan de `fixed_expense_savings` por fila.
create index fixed_expense_savings_transaction_idx
  on public.fixed_expense_savings (transaction_id)
  where transaction_id is not null;

-- ---------------------------------------------------------------------------------------------
-- 1. Editar el movimiento de un pago o de un guardado sincroniza el importe, y bloquea el tipo.
-- ---------------------------------------------------------------------------------------------

create function public.trg_transactions_sync_linked_fixed_expense()
returns trigger
language plpgsql
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

    -- Una bolsa quincenal/semanal ubica su carga en el sub-período por `paid_at` (`aggregate.ts`,
    -- `bag_cycle_from`/`bag_cycle_to`); un fijo "una vez al mes" no tiene sub-período, sólo `period`
    -- (el mes que se pagó), que no se toca al mover la fecha — sigue siendo el pago de ese mes.
    if new.occurred_on is distinct from old.occurred_on then
      update public.fixed_expense_payments
      set paid_at = new.occurred_on + time '12:00'
      where id = old.fixed_expense_payment_id and is_recurring;
    end if;

    return new;
  end if;

  select * into v_saving from public.fixed_expense_savings where transaction_id = old.id;
  if found then
    if new.type is distinct from old.type then
      raise exception 'linked_movement_type_locked';
    end if;

    -- Mismo freno que `rpc_remove_fixed_expense_saving`: con el mes ya pagado, el pago pudo haberse
    -- calculado restando este guardado — tocar su importe (o borrarlo, trigger de abajo) desincroniza
    -- el saldo. Hay que desmarcar el pago primero.
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

create trigger transactions_sync_linked_fixed_expense
before update on public.transactions
for each row
execute function public.trg_transactions_sync_linked_fixed_expense();

-- ---------------------------------------------------------------------------------------------
-- 2. Borrar el movimiento de un guardado de un mes ya pagado se frena — mismo criterio que arriba,
--    ahora para DELETE. El caso de un pago (`transactions_unmark_fixed_payment`, ya existente,
--    `20260916010001_fixed_expense_payment_fecha.sql`) no necesita freno simétrico: un pago SIEMPRE
--    se puede desmarcar (es la acción misma de "deshacer el pago"), a diferencia de un guardado
--    aparte, que sólo tiene sentido tocarlo si el fijo sigue sin pagar.
-- ---------------------------------------------------------------------------------------------

create function public.trg_transactions_block_delete_paid_saving()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_saving record;
begin
  select * into v_saving from public.fixed_expense_savings where transaction_id = old.id;
  if found and exists (
    select 1 from public.fixed_expense_payments
    where fixed_expense_id = v_saving.fixed_expense_id and period = v_saving.period
  ) then
    raise exception 'fixed_expense_saving_period_paid';
  end if;
  return old;
end;
$$;

create trigger transactions_block_delete_paid_saving
before delete on public.transactions
for each row
execute function public.trg_transactions_block_delete_paid_saving();

-- ---------------------------------------------------------------------------------------------
-- 3. `rpc_delete_account` (última versión: `20260923020001_eliminar_cuenta_solo_lo_suyo.sql`) ya
--    reinserta una copia SIN movimiento de cada guardado de la cuenta que se borra, antes de borrar
--    sus movimientos — para que el guardado sobreviva como "guardado sin movimiento" en vez de irse
--    en cascada. Con el trigger nuevo del punto 2, hay que borrar también la fila ORIGINAL a mano acá
--    (no alcanza con dejar que el `on delete cascade` de `fixed_expense_savings.transaction_id` se la
--    lleve al borrar la transacción): si no, el trigger la encuentra todavía vinculada al mes ya
--    pagado y bloquea la eliminación de una cuenta entera por un guardado que, en este camino
--    puntual, ya está a salvo en su copia.
-- ---------------------------------------------------------------------------------------------

create or replace function public.rpc_delete_account(p_account_id uuid)
returns void
language plpgsql
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_was_default boolean;
  v_is_archived boolean;
begin
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

grant execute on function public.rpc_delete_account(uuid) to authenticated;
