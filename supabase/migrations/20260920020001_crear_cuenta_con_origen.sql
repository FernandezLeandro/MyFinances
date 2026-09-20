-- Crear una cuenta sin mover el saldo.
--
-- Desde `20260919010001_cuentas_saldo_y_reajuste.sql` el saldo cambia de definición en cuanto existe
-- la primera cuenta: antes es la suma de los movimientos, después la suma de las cuentas. Quien
-- declara en su primera cuenta menos de lo que la app creía que tenía ve caer el saldo de golpe, y
-- para cargar la segunda cuenta tiene que acordarse solo de cuánto sobraba. Lo mismo al revés más
-- adelante: la apertura de una cuenta nueva SIEMPRE sube el total, aunque el usuario esté repartiendo
-- plata que ya tenía en otra.
--
-- Este RPC da las dos salidas, y de paso se lleva a la base lo que el cliente hacía en tres viajes
-- sueltos (contar activas → apagar `is_default` → insertar):
--
--   * `p_hold_rest`: al crear la PRIMERA cuenta, el sobrante (`saldo previo − apertura`) queda en una
--     segunda cuenta «Sin repartir». El saldo no se mueve. Después se la renombra, se transfiere
--     desde ella o se la elimina.
--   * `p_from_account_id`: la cuenta nueva nace en cero y recibe su apertura por transferencia desde
--     otra cuenta. El saldo no se mueve, sólo cambia de lugar.
--   * Sin ninguna de las dos: la apertura suma al saldo, como hasta ahora (plata que la app no
--     conocía).
--
-- El sobrante lo calcula la base y no el cliente, por el mismo motivo que la diferencia de
-- `rpc_adjust_account_balance`: un saldo viejo en caché haría guardar de más o de menos, y acá el
-- error queda escrito en la apertura de una cuenta.

create function public.rpc_create_account(
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

  -- Mismo tope que `numeric(12, 2)`: mejor un error claro que un overflow del tipo.
  if p_opening is null or p_opening <> round(p_opening, 2) or abs(p_opening) >= 10000000000 then
    raise exception 'account_invalid_amount';
  end if;

  if p_hold_rest and p_from_account_id is not null then
    raise exception 'account_invalid_source';
  end if;

  -- ANTES de insertar nada: con la primera cuenta, `rpc_current_balance` cambia de definición.
  v_pre := public.rpc_current_balance();

  select exists (select 1 from public.balance_locations where user_id = v_uid),
         not exists (select 1 from public.balance_locations where user_id = v_uid and not is_archived)
    into v_had_accounts, v_is_first_active;

  if p_from_account_id is not null then
    -- `account_transfers.amount` tiene `check (amount > 0)`: una apertura en cero o negativa no puede
    -- salir de otra cuenta.
    if p_opening <= 0 then
      raise exception 'account_invalid_amount';
    end if;
    if not exists (
      select 1 from public.balance_locations
      where id = p_from_account_id and user_id = v_uid and not is_archived
    ) then
      raise exception 'account_not_found';
    end if;
    -- La plata entra por la transferencia, no por la apertura: si fuera las dos, contaría doble.
    v_opening := 0;
  else
    v_opening := p_opening;
  end if;

  -- El índice único parcial de `is_default` también cuenta las archivadas: si una quedó como
  -- predeterminada (el cliente viejo archivaba sin apagarlo), hay que soltarla antes.
  if v_is_first_active then
    update public.balance_locations
    set is_default = false
    where user_id = v_uid and is_default;
  end if;

  insert into public.balance_locations (user_id, name, kind, opening_amount, is_default)
  values (v_uid, v_name, p_kind, v_opening, v_is_first_active)
  returning id into v_new_id;

  if p_from_account_id is not null then
    -- `p_occurred_on` viene del cliente (fecha local): `current_date` de Supabase es UTC y en
    -- Argentina, desde las 21 h, ya es mañana.
    insert into public.account_transfers (user_id, from_account_id, to_account_id, amount, occurred_on, description)
    values (v_uid, p_from_account_id, v_new_id, p_opening, coalesce(p_occurred_on, current_date),
            left('Apertura de ' || v_name, 140));
  end if;

  -- Sólo tiene sentido en la primera cuenta de todas (archivadas incluidas: es el umbral que usa
  -- `rpc_current_balance` para cambiar de definición). Un sobrante negativo —declaró más de lo que la
  -- app sabía— es plata nueva, no algo para guardar aparte.
  if p_hold_rest and not v_had_accounts then
    v_rest := v_pre - p_opening;
    if v_rest > 0 then
      insert into public.balance_locations (user_id, name, kind, opening_amount, is_default)
      values (v_uid, 'Sin repartir', 'cash', v_rest, false);
    end if;
  end if;

  return v_new_id;
end;
$$;

grant execute on function public.rpc_create_account(text, text, numeric, boolean, uuid, date) to authenticated;
