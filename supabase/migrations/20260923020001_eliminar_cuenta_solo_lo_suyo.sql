-- Eliminar una cuenta se lleva SÓLO LO SUYO: su propio saldo y sus propios movimientos. Las demás
-- cuentas quedan exactamente igual — ni su saldo ni su historial cambian.
--
-- Hasta acá, `account_transfers.from_account_id`/`to_account_id` son `on delete cascade`
-- (`20260904020001_cuentas_y_medios_de_pago.sql`): borrar una cuenta se llevaba también las
-- transferencias que la ligaban a otras, así que la cuenta que había financiado o recibido plata de
-- la eliminada cambiaba de saldo sin que nadie la tocara (crítico C1 del primer QA). El aviso que se
-- agregó después para explicar ese cambio (`rpc_account_delete_preview`,
-- `20260922020001_eliminar_cuenta_aviso.sql`) invertía los signos del cálculo (N1 del re-test):
-- prometía que el saldo subía cuando bajaba, y al revés.
--
-- La solución no es corregir el cálculo del aviso: es que la cuenta eliminada deje de afectar a las
-- demás. Antes de borrar sus transferencias, esta versión PLIEGA su efecto en la apertura de la otra
-- punta de cada transferencia — la misma plata que esa transferencia había movido, ahora vive en la
-- apertura de la cuenta que la recibió o la mandó — así que el saldo de esa otra cuenta no cambia ni
-- un centavo. El aviso deja de necesitar una fórmula aparte: sólo tiene que decir el saldo propio de
-- la cuenta que se está por borrar, que el cliente ya tiene de `rpc_account_balances`.
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

  -- Pliegue: se borran las transferencias de esta cuenta y, en el mismo statement, se suma su efecto
  -- a la apertura de la otra punta. Una transferencia D→A (D es la que se borra) le había sumado
  -- `amount` a A: A.opening_amount sube esa `amount`. Una transferencia A→D le había restado `amount`
  -- a A: A.opening_amount baja esa `amount`. Sale igual en el mismo `update ... from` para que no haya
  -- ventana entre "leer las transferencias" y "borrarlas" en la que otra transacción pudiera insertar
  -- una nueva contra esta cuenta (ya bloqueada arriba, así que en la práctica no puede pasar, pero el
  -- `delete ... returning` en un solo paso lo vuelve imposible por construcción).
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

-- El preview ya no hace falta: con el pliegue, ninguna otra cuenta cambia de saldo. El diálogo de
-- confirmación (`DeleteAccountDialog`) sólo necesita el saldo propio de la cuenta (`rpc_account_balances`,
-- que ya pide) y un conteo de sus movimientos — datos que el cliente ya tiene o puede pedir sin una
-- fórmula aparte que pueda desalinearse de la real, que es justo lo que causó N1.
drop function if exists public.rpc_account_delete_preview(uuid);
