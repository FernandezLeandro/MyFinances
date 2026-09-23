-- QA de la rama `accounts`: dos bugs con la última cuenta activa.
--
--   * Eliminarla mientras queda una archivada deja el saldo en $0 PARA SIEMPRE: los movimientos
--     nuevos caen en silencio en esa archivada (`trg_transactions_account` ordena por `is_archived`,
--     así que la elige cuando no hay ninguna activa), y nada en la UI lo avisa. Se agrega el mismo
--     freno que ya tiene archivar (`archiveBlocker`, hoy sólo en el cliente) también para eliminar,
--     y se lleva a la base: archivar es hoy un `update` directo a `balance_locations`, sin RPC.
--   * Eliminar la ÚLTIMA cuenta del usuario (sin ninguna archivada) hace que el saldo "vuelva a ser
--     la suma de los movimientos" — pero esa suma NO incluye los movimientos que se cargaron con
--     esta cuenta, porque `rpc_delete_account` los borra. El saldo salta a un número viejo y se
--     pierde historial. Se agrega `rpc_stop_using_accounts`: guarda el saldo actual, borra las
--     cuentas (sin tocar movimientos: quedan sin cuenta, como historial) y corrige la diferencia con
--     un movimiento de ajuste — el saldo queda igual que antes. "Eliminar igual" sigue existiendo
--     como salida secundaria para quien de verdad quiere borrar ese historial.

-- ---------------------------------------------------------------------------------------------
-- 1. Archivar la última cuenta activa se rechaza también en la base
-- ---------------------------------------------------------------------------------------------

-- Mismo criterio que `archiveBlocker(activeCount)` en el cliente (`aggregate.ts`): activeCount <= 1
-- bloquea, sin importar si hay archivadas de por medio. El trigger corre ANTES del update, así que
-- todavía ve esta fila con su `is_archived` viejo — el `count` la incluye a ella misma.
create function public.trg_block_archive_last_active()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.is_archived and not old.is_archived then
    if (select count(*) from public.balance_locations where user_id = old.user_id and not is_archived) <= 1 then
      raise exception 'account_last_active';
    end if;
  end if;
  return new;
end;
$$;

create trigger balance_locations_block_archive_last_active
before update of is_archived on public.balance_locations
for each row
when (new.is_archived and not old.is_archived)
execute function public.trg_block_archive_last_active();

-- ---------------------------------------------------------------------------------------------
-- 2. Eliminar la última activa se rechaza SÓLO si queda otra (archivada) huérfana
-- ---------------------------------------------------------------------------------------------

-- A diferencia de archivar: si esta es la ÚNICA cuenta del usuario (no queda ninguna archivada),
-- eliminarla sigue permitido — es la salida secundaria "Eliminar igual" del diálogo, y ahí el saldo
-- no queda congelado: vuelve a ser la suma de movimientos, que es exactamente lo que dice el texto
-- de siempre. El caso que se bloquea es el que dejaba el saldo en $0 sin arreglo.
create or replace function public.rpc_delete_account(p_account_id uuid)
returns void
language plpgsql
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_was_default boolean;
  v_is_archived boolean;
  v_active_count integer;
  v_total_count integer;
begin
  select is_default, is_archived into v_was_default, v_is_archived
  from public.balance_locations
  where id = p_account_id and user_id = v_uid
  for update;
  if not found then
    raise exception 'account_not_found';
  end if;

  select count(*) filter (where not is_archived), count(*)
  into v_active_count, v_total_count
  from public.balance_locations
  where user_id = v_uid;

  if not v_is_archived and v_active_count = 1 and v_total_count > 1 then
    raise exception 'account_last_active';
  end if;

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

  delete from public.transactions where account_id = p_account_id and user_id = v_uid;
  delete from public.balance_locations where id = p_account_id and user_id = v_uid;

  if v_was_default then
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

-- ---------------------------------------------------------------------------------------------
-- 3. Dejar de usar Cuentas: vuelve al saldo-suma-de-movimientos SIN perder plata ni historial
-- ---------------------------------------------------------------------------------------------

-- Anota el saldo de hoy, borra TODAS las cuentas del usuario (los movimientos no se tocan: la FK es
-- `on delete set null`, así que quedan sin cuenta, como el historial de antes de Cuentas — y las
-- transferencias se van solas en cascada) y corrige la diferencia con UN movimiento de ajuste, igual
-- que `rpc_adjust_account_balance` en modo 'movement'. El insert va DESPUÉS de borrar las cuentas
-- para que `trg_transactions_account` no le asigne ninguna.
create function public.rpc_stop_using_accounts(p_occurred_on date default null)
returns void
language plpgsql
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_pre numeric;
  v_remaining numeric;
  v_diff numeric;
begin
  if not exists (select 1 from public.balance_locations where user_id = v_uid) then
    raise exception 'no_accounts_to_stop';
  end if;

  v_pre := public.rpc_current_balance();

  delete from public.balance_locations where user_id = v_uid;

  select coalesce(sum(case when type = 'income' then amount else -amount end), 0)
  into v_remaining
  from public.transactions
  where user_id = v_uid;

  v_diff := v_pre - v_remaining;

  if v_diff <> 0 then
    -- Mismo tope que `numeric(12, 2)` — ver `rpc_adjust_account_balance`.
    if abs(v_diff) >= 10000000000 then
      raise exception 'account_adjust_invalid_amount';
    end if;

    insert into public.transactions (user_id, type, amount, occurred_on, category_id, description, is_adjustment)
    values (
      v_uid,
      case when v_diff > 0 then 'income' else 'expense' end,
      abs(v_diff),
      coalesce(p_occurred_on, current_date),
      null,
      'Saldo al dejar de usar Cuentas',
      true
    );
  end if;
end;
$$;

grant execute on function public.rpc_stop_using_accounts(date) to authenticated;
