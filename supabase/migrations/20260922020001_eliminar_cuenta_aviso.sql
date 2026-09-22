-- QA de la rama `accounts`: eliminar una cuenta borra en cascada sus transferencias
-- (`account_transfers.from_account_id`/`to_account_id` son `on delete cascade`,
-- `20260904020001_cuentas_y_medios_de_pago.sql:84-85`), así que las cuentas que financió pierden esa
-- plata. El diálogo de eliminar (`DeleteAccountDialog`) hoy sólo dice cuántas transferencias se
-- borran (`useAccountDeleteImpact`), sin montos ni qué cuentas se ven afectadas.
--
-- Esta función calcula, ANTES de borrar nada, exactamente lo que va a pasar: se hace en la base y no
-- en el cliente porque el navegador no tiene todo el historial de movimientos ni de transferencias
-- (ventanas acotadas), y porque así comparte la fórmula del saldo con `rpc_current_balance` y
-- `rpc_account_balances` en vez de reimplementarla.
--
-- `bloqueada`: adelanta el freno que agrega `20260922030001_ultima_cuenta_activa.sql` (eliminar la
-- última cuenta activa mientras queda una archivada). Esta migración no impone el freno — sólo lo
-- anticipa acá para que el diálogo pueda avisar antes de que el usuario confirme y se encuentre con
-- el error. Si esa migración no se aplicó todavía, `bloqueada` siempre da `false`.
create function public.rpc_account_delete_preview(p_account_id uuid)
returns table (
  movimientos integer,
  transferencias integer,
  saldo_antes numeric,
  saldo_despues numeric,
  bloqueada boolean,
  afectadas jsonb
)
language plpgsql
stable
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_is_archived boolean;
  v_active_count integer;
  v_total_count integer;
  v_bloqueada boolean;
  v_saldo_antes numeric;
  v_saldo_despues numeric;
  v_saldo_delta numeric;
  v_movimientos integer;
  v_transferencias integer;
  v_afectadas jsonb;
begin
  select is_archived into v_is_archived
  from public.balance_locations
  where id = p_account_id and user_id = v_uid;
  if not found then
    raise exception 'account_not_found';
  end if;

  select count(*) filter (where not is_archived), count(*)
  into v_active_count, v_total_count
  from public.balance_locations
  where user_id = v_uid;

  -- Misma condición que el freno de `rpc_delete_account` en `20260922030001`: última activa, con
  -- al menos otra cuenta (archivada) que quedaría huérfana de selector.
  v_bloqueada := (not v_is_archived) and v_active_count = 1 and v_total_count > 1;

  select count(*) into v_movimientos
  from public.transactions
  where account_id = p_account_id and user_id = v_uid;

  select count(*) into v_transferencias
  from public.account_transfers
  where user_id = v_uid and (from_account_id = p_account_id or to_account_id = p_account_id);

  v_saldo_antes := public.rpc_current_balance();

  if v_bloqueada then
    v_saldo_despues := null;
    v_afectadas := '[]'::jsonb;
  elsif v_total_count = 1 then
    -- Única cuenta del usuario: se borra entera. El saldo vuelve a ser la suma de los movimientos
    -- que sobreviven (todo menos lo que estaba imputado acá, que se va con la cuenta).
    select coalesce(sum(case when type = 'income' then amount else -amount end), 0)
    into v_saldo_despues
    from public.transactions
    where user_id = v_uid and account_id is distinct from p_account_id;

    v_afectadas := '[]'::jsonb;
  else
    -- Las cuentas cuyo derivado cambia son las que tienen una transferencia hacia o desde ésta —
    -- se van con ella en cascada. `antes`/`despues` van como texto: son montos, y un jsonb numérico
    -- pierde precisión al pasar por JSON.parse en el cliente para valores grandes.
    with deltas as (
      select
        a.id,
        a.name,
        a.is_archived,
        b.derived as antes,
        b.derived
          + coalesce((
              select sum(tr.amount) from public.account_transfers tr
              where tr.from_account_id = p_account_id and tr.to_account_id = a.id
            ), 0)
          - coalesce((
              select sum(tr.amount) from public.account_transfers tr
              where tr.to_account_id = p_account_id and tr.from_account_id = a.id
            ), 0) as despues
      from public.balance_locations a
      join public.rpc_account_balances() b on b.account_id = a.id
      where a.user_id = v_uid and a.id <> p_account_id
    )
    select
      coalesce(
        jsonb_agg(
          jsonb_build_object('id', id, 'nombre', name, 'antes', antes::text, 'despues', despues::text)
          order by name
        ) filter (where antes <> despues),
        '[]'::jsonb
      ),
      coalesce(sum(despues - antes) filter (where not is_archived), 0)
    into v_afectadas, v_saldo_delta
    from deltas;

    v_saldo_despues := v_saldo_antes
      - (case when v_is_archived then 0 else coalesce((select b.derived from public.rpc_account_balances() b where b.account_id = p_account_id), 0) end)
      + v_saldo_delta;
  end if;

  return query select v_movimientos, v_transferencias, v_saldo_antes, v_saldo_despues, v_bloqueada, v_afectadas;
end;
$$;

grant execute on function public.rpc_account_delete_preview(uuid) to authenticated;
