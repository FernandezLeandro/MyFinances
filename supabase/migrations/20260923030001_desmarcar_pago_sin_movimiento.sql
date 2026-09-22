-- N3 del re-test de QA: el freno de `payment_before_accounts` (`20260922010001`) también saltaba
-- sobre pagos que NO son anteriores a las cuentas — simplemente ya no tienen movimiento porque la
-- cuenta con la que se pagaron se eliminó después (`fixed_expense_payments.transaction_id` es
-- `on delete set null`, y `rpc_delete_account` borra los movimientos de la cuenta que se va).
--
-- La condición original leía `account_id` de un `transaction_id` que podía ser null: con
-- `transaction_id` null, el `select ... where id = null` no encuentra nada, `v_account_id` queda
-- null igual que en el caso real, y el freno saltaba igual. Repagar uno de estos pagos NO descuenta
-- dos veces (el movimiento original ya no existe), así que frenarlo era un aviso falso que además
-- aconsejaba "editá el movimiento" sobre un movimiento que no existe.
--
-- El freno real sólo tiene sentido cuando el pago SÍ tiene un movimiento vivo y ese movimiento no
-- tiene cuenta — el caso de un pago de antes de la primera cuenta, que es el que puede descontarse
-- dos veces.
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
    return;
  end if;

  if not p_force and v_payment.transaction_id is not null then
    select account_id, true into v_account_id, v_has_tx
    from public.transactions
    where id = v_payment.transaction_id and user_id = v_uid;

    if v_has_tx and v_account_id is null and exists (select 1 from public.balance_locations where user_id = v_uid) then
      raise exception 'payment_before_accounts';
    end if;
  end if;

  delete from public.transactions where id = v_payment.transaction_id and user_id = v_uid;
  delete from public.fixed_expense_payments where id = v_payment.id;
end;
$$;

grant execute on function public.rpc_unmark_fixed_expense_payment(uuid, boolean) to authenticated;
