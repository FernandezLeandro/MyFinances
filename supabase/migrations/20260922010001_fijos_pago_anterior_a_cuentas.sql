-- QA de la rama `accounts` (informe en la memoria del proyecto): un pago de fijo hecho ANTES de
-- crear la primera cuenta ya está descontado del saldo con el que esa cuenta arrancó (la "foto" de
-- `rpc_current_balance()` en `rpc_create_account`). Su movimiento tiene `account_id is null` y no
-- suma al saldo actual (ver `20260919010001_cuentas_saldo_y_reajuste.sql`). Si se lo desmarca y se
-- vuelve a pagar, el nuevo pago SÍ tiene cuenta y resta de nuevo: la misma plata sale dos veces.
--
-- No podemos prohibirlo (a veces el usuario de verdad quiere corregir un pago viejo), así que la
-- base lo frena por default y deja pasar con una confirmación explícita del cliente.

-- Se dropea en vez de `create or replace`: agregar un parámetro con default crea una sobrecarga
-- nueva y PostgREST no sabría cuál de las dos llamar por nombre de función.
drop function public.rpc_unmark_fixed_expense_payment(uuid);

create function public.rpc_unmark_fixed_expense_payment(p_payment_id uuid, p_force boolean default false)
returns void
language plpgsql
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_payment record;
  v_account_id uuid;
begin
  select * into v_payment from public.fixed_expense_payments
  where id = p_payment_id and user_id = v_uid;

  if not found then
    return;
  end if;

  if not p_force then
    select account_id into v_account_id
    from public.transactions
    where id = v_payment.transaction_id and user_id = v_uid;

    if v_account_id is null and exists (select 1 from public.balance_locations where user_id = v_uid) then
      raise exception 'payment_before_accounts';
    end if;
  end if;

  delete from public.transactions where id = v_payment.transaction_id and user_id = v_uid;
  delete from public.fixed_expense_payments where id = v_payment.id;
end;
$$;

grant execute on function public.rpc_unmark_fixed_expense_payment(uuid, boolean) to authenticated;
