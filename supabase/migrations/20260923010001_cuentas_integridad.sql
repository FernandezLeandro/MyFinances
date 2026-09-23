-- Integridad de Cuentas antes de convertirla en algo que el usuario prende y apaga (QA de la rama
-- `accounts`, 2.ª pasada, https://claude.ai/artifact/2nDX8TZttYDQpv4svrNPvs): nombres duplicados
-- (N6), una carrera que podía dejar 0 cuentas activas (N5), el trigger de movimientos que podía
-- imputar a una archivada, y una cuenta predeterminada perdida.
--
-- Precondición verificada en producción antes de esta migración (sólo lectura, `db query --linked`):
-- ningún usuario tiene dos cuentas activas o archivadas con el mismo nombre (case/espacios
-- insensible), ningún usuario tiene cuentas sin ninguna activa, y ninguna cuenta huérfana de
-- `is_default`. Los pasos 2-3 de abajo son reparaciones genéricas de todos modos (no hacen nada si
-- los datos ya están sanos) por si una PWA vieja en caché vuelve a producir alguno de estos casos
-- entre el chequeo y el push.

-- ---------------------------------------------------------------------------------------------
-- 1. N6: nombres únicos por usuario, sin distinguir mayúsculas ni espacios
-- ---------------------------------------------------------------------------------------------

-- Sólo entre cuentas ACTIVAS: una archivada no se ofrece en ningún selector (`AccountSelect` sólo la
-- muestra si es el valor ya elegido), así que no hay ambigüedad si comparte nombre con otra cuenta,
-- activa o archivada. Excluirlas también evita romper esta migración con historial real (reactivar
-- o crear de nuevo con el mismo nombre que una cuenta que ya se archivó es un caso válido).
create unique index balance_locations_user_name_idx
  on public.balance_locations (user_id, lower(btrim(name)))
  where not is_archived and btrim(name) <> '';

-- ---------------------------------------------------------------------------------------------
-- 2. Reparación genérica: nadie se queda sin cuenta predeterminada activa
-- ---------------------------------------------------------------------------------------------

-- Ninguna archivada predeterminada (el índice único parcial de `is_default` las cuenta a todas; una
-- archivada nunca debería ganar ese lugar).
update public.balance_locations set is_default = false, updated_at = now()
where is_archived and is_default;

-- Todo usuario con al menos una cuenta activa pero ninguna marcada predeterminada recibe la más
-- vieja: es la misma regla que ya usa `effectiveDefaultAccountId` en el cliente
-- (`src/features/accounts/aggregate.ts`) y la que promueve `rpc_delete_account`.
update public.balance_locations set is_default = true, updated_at = now()
where id in (
  select distinct on (x.user_id) x.id
  from public.balance_locations x
  where not x.is_archived
    and not exists (
      select 1 from public.balance_locations y where y.user_id = x.user_id and y.is_default
    )
  order by x.user_id, x.created_at, x.id
);

-- Una cuenta archivada nunca puede ser la predeterminada, de ahora en más.
alter table public.balance_locations
  add constraint balance_locations_default_is_active check (not (is_default and is_archived));

-- ---------------------------------------------------------------------------------------------
-- 3. N5: bloquear archivar/eliminar la última cuenta activa, serializado por usuario
-- ---------------------------------------------------------------------------------------------

-- La versión anterior (`20260922030001_ultima_cuenta_activa.sql`) sólo bloqueaba ARCHIVAR, y contaba
-- las activas sin bloquear las otras filas: dos archivados en paralelo sobre las dos últimas activas
-- podían pasar los dos (reproducido 5 de 20 intentos en el re-test). Esta versión:
--   * toma un lock consultivo por usuario ANTES de contar, así una segunda transacción concurrente
--     espera a que la primera termine en vez de contar sobre una foto vieja;
--   * también corre en DELETE, así "eliminar" queda protegido igual que "archivar" (antes sólo
--     `rpc_delete_account` lo comprobaba, con su propio conteo sin lock);
--   * al archivar, suelta `is_default` (antes quedaba una archivada predeterminada hasta el próximo
--     alta, que la soltaba recién ahí).
--
-- Se deja pasar sin bloquear en tres casos, todos sin usuario "haciendo click" del otro lado:
--   * `auth.uid()` nulo (service role, SQL de mantenimiento) o de otro usuario (la cascada de borrar
--     una cuenta de auth.users no es "el usuario archivando su última cuenta");
--   * la fila ya estaba archivada (no es una transición que el trigger deba mirar);
--   * `rpc_stop_using_accounts`, que necesita borrar TODAS las cuentas del usuario a propósito, marca
--     `saldo.accounts_teardown = on` sólo alrededor de ese delete.
create or replace function public.trg_block_archive_last_active()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_user_id uuid := old.user_id;
begin
  -- Reactivar (is_archived true → false) no toca esta rama: la WHEN clause del UPDATE sólo dispara
  -- en transiciones de `is_archived`, y acá sólo nos importa la que va HACIA archivada.
  if tg_op = 'UPDATE' then
    new.is_default := false;
  end if;

  if v_uid is null or v_uid <> v_user_id
     or (tg_op = 'DELETE' and current_setting('saldo.accounts_teardown', true) = 'on') then
    if tg_op = 'DELETE' then return old; end if;
    return new;
  end if;

  perform pg_advisory_xact_lock(hashtextextended('balance_locations:' || v_user_id::text, 0));

  if not exists (
    select 1 from public.balance_locations
    where user_id = v_user_id and not is_archived and id <> old.id
  ) then
    raise exception 'account_last_active';
  end if;

  if tg_op = 'DELETE' then return old; end if;
  return new;
end;
$$;

drop trigger if exists balance_locations_block_archive_last_active on public.balance_locations;
create trigger balance_locations_block_archive_last_active
before update of is_archived on public.balance_locations
for each row
when (new.is_archived and not old.is_archived)
execute function public.trg_block_archive_last_active();

-- Eliminar una cuenta ya archivada nunca pasa por acá (`when` la excluye): archivada no cuenta como
-- "activa" para nadie, así que borrarla no puede dejar "cero activas" — ya estaba en cero para esa
-- cuenta.
create trigger balance_locations_block_delete_last_active
before delete on public.balance_locations
for each row
when (not old.is_archived)
execute function public.trg_block_archive_last_active();

-- ---------------------------------------------------------------------------------------------
-- 4. Un movimiento sin cuenta nunca cae en una archivada
-- ---------------------------------------------------------------------------------------------

-- Antes elegía `order by is_archived, is_default desc, created_at, id`: con cero cuentas activas,
-- caía en la archivada más vieja y el saldo quedaba congelado en $0 para siempre sin avisar (el
-- crítico C2 del primer QA). Con el bloqueo del paso 3, llegar a "cero activas" ya no debería pasar
-- por la UI normal; este `where` es la segunda barrera. Sin ninguna cuenta activa, el movimiento
-- queda con `account_id` null, como si el usuario no tuviera cuentas.
create or replace function public.trg_transactions_account()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if tg_op = 'INSERT' and new.account_id is null then
    select a.id into new.account_id
    from public.balance_locations a
    where a.user_id = new.user_id and not a.is_archived
    order by a.is_default desc, a.created_at, a.id
    limit 1;
  elsif new.account_id is not null and not exists (
    select 1 from public.balance_locations a
    where a.id = new.account_id and a.user_id = new.user_id
  ) then
    raise exception 'account_not_found';
  end if;
  return new;
end;
$$;

-- ---------------------------------------------------------------------------------------------
-- 5. `rpc_create_account`: lock por usuario + nombre duplicado con mensaje propio
-- ---------------------------------------------------------------------------------------------

-- Mismo cuerpo que `20260920030001_crear_cuenta_sin_sobregiro.sql`. Cambios:
--   * el lock consultivo va ANTES de leer `rpc_current_balance()`, para que dos altas de la primera
--     cuenta en paralelo no tomen la misma foto del saldo previo;
--   * `account_duplicate_name` con mensaje propio en vez de dejar que el 23505 del índice llegue
--     crudo (el front lo traduce igual, esto es sólo más claro para quien lea los logs).
create or replace function public.rpc_create_account(
  p_name text,
  p_kind text,
  p_opening numeric,
  p_hold_rest boolean default false,
  p_from_account_id uuid default null,
  p_occurred_on date default null
)
returns uuid
language plpgsql
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_name text := btrim(coalesce(p_name, ''));
  v_pre numeric;
  v_rest numeric;
  v_had_accounts boolean;
  v_is_first_active boolean;
  v_opening numeric;
  v_from_opening numeric;
  v_from_balance numeric;
  v_new_id uuid;
begin
  if v_uid is null then
    raise exception 'not_authenticated';
  end if;

  if v_name = '' or length(v_name) > 60 then
    raise exception 'account_invalid_name';
  end if;

  if p_kind is null or p_kind not in ('cash', 'wallet', 'bank') then
    raise exception 'account_invalid_kind';
  end if;

  if p_opening is null or p_opening <> round(p_opening, 2) or abs(p_opening) >= 10000000000 then
    raise exception 'account_invalid_amount';
  end if;

  if p_hold_rest and p_from_account_id is not null then
    raise exception 'account_invalid_source';
  end if;

  perform pg_advisory_xact_lock(hashtextextended('balance_locations:' || v_uid::text, 0));

  if exists (
    select 1 from public.balance_locations
    where user_id = v_uid and not is_archived and lower(btrim(name)) = lower(v_name)
  ) then
    raise exception 'account_duplicate_name';
  end if;

  -- ANTES de insertar nada: con la primera cuenta, `rpc_current_balance` cambia de definición.
  v_pre := public.rpc_current_balance();

  select exists (select 1 from public.balance_locations where user_id = v_uid),
         not exists (select 1 from public.balance_locations where user_id = v_uid and not is_archived)
    into v_had_accounts, v_is_first_active;

  if p_from_account_id is not null then
    if p_opening <= 0 then
      raise exception 'account_invalid_amount';
    end if;

    select opening_amount into v_from_opening
    from public.balance_locations
    where id = p_from_account_id and user_id = v_uid and not is_archived
    for update;
    if not found then
      raise exception 'account_not_found';
    end if;

    select b.derived into v_from_balance
    from public.rpc_account_balances() b
    where b.account_id = p_from_account_id;
    if p_opening > coalesce(v_from_balance, v_from_opening) then
      raise exception 'account_insufficient_funds';
    end if;

    v_opening := 0;
  else
    v_opening := p_opening;
  end if;

  if v_is_first_active then
    update public.balance_locations
    set is_default = false
    where user_id = v_uid and is_default;
  end if;

  insert into public.balance_locations (user_id, name, kind, opening_amount, is_default)
  values (v_uid, v_name, p_kind, v_opening, v_is_first_active)
  returning id into v_new_id;

  if p_from_account_id is not null then
    insert into public.account_transfers (user_id, from_account_id, to_account_id, amount, occurred_on, description)
    values (v_uid, p_from_account_id, v_new_id, p_opening, coalesce(p_occurred_on, current_date),
            left('Apertura de ' || v_name, 140));
  end if;

  if p_hold_rest and not v_had_accounts then
    v_rest := v_pre - p_opening;
    if v_rest > 0 then
      if exists (
        select 1 from public.balance_locations
        where user_id = v_uid and not is_archived and lower(btrim(name)) = lower('Sin repartir')
      ) then
        raise exception 'account_duplicate_name';
      end if;
      insert into public.balance_locations (user_id, name, kind, opening_amount, is_default)
      values (v_uid, 'Sin repartir', 'cash', v_rest, false);
    end if;
  end if;

  return v_new_id;
end;
$$;

grant execute on function public.rpc_create_account(text, text, numeric, boolean, uuid, date) to authenticated;

-- ---------------------------------------------------------------------------------------------
-- 6. `rpc_stop_using_accounts`: lock por usuario + bandera de teardown
-- ---------------------------------------------------------------------------------------------

-- Mismo cuerpo que `20260922030001_ultima_cuenta_activa.sql`. El lock evita que esto corra a la vez
-- que un archivado o una eliminación del mismo usuario; la bandera `saldo.accounts_teardown` avisa
-- al trigger del paso 3 que este delete de TODAS las cuentas es intencional, no el bug que bloquea.
create or replace function public.rpc_stop_using_accounts(p_occurred_on date default null)
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

  perform pg_advisory_xact_lock(hashtextextended('balance_locations:' || v_uid::text, 0));

  v_pre := public.rpc_current_balance();

  perform set_config('saldo.accounts_teardown', 'on', true);
  delete from public.balance_locations where user_id = v_uid;
  perform set_config('saldo.accounts_teardown', 'off', true);

  select coalesce(sum(case when type = 'income' then amount else -amount end), 0)
  into v_remaining
  from public.transactions
  where user_id = v_uid;

  v_diff := v_pre - v_remaining;

  if v_diff <> 0 then
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

-- ---------------------------------------------------------------------------------------------
-- 7. `account_transfers` ya no acepta UPDATE
-- ---------------------------------------------------------------------------------------------

-- El cliente sólo inserta y elimina transferencias (`src/features/accounts/transfers-api.ts`); la
-- policy de UPDATE quedaba sin uso y sin el trigger de sobregiro (`before insert` únicamente), así
-- que una edición directa por API podía mover plata sin el tope de `account_insufficient_funds`.
drop policy if exists "account_transfers_update_own" on public.account_transfers;
