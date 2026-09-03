-- Las cuotas de compras sueltas (card_id null, ver 20260902040001) tienen que descontarse del saldo
-- proyectado igual que las de tarjeta, pero el `not exists` original comparaba contra
-- credit_card_payments por card_id — y en SQL `null = null` nunca es true, así que esas cuotas se
-- hubieran restado para siempre, incluso ya pagadas. Se reemplaza esa condición por un `case` que
-- usa credit_card_payments cuando hay tarjeta y credit_purchase_payments cuando no. Misma firma que
-- rpc_projected_balance, así que `create or replace` alcanza.
create or replace function public.rpc_projected_balance(p_period date)
returns numeric
language sql
stable
set search_path = public
as $$
  select
    (
      select coalesce(sum(case when type = 'income' then amount else -amount end), 0)
      from public.transactions
      where user_id = auth.uid()
    )
    -
    (
      select coalesce(sum(fe.amount), 0)
      from public.fixed_expenses fe
      where fe.user_id = auth.uid()
        and fe.is_active
        and fe.starts_on <= (date_trunc('month', p_period) + interval '1 month - 1 day')::date
        and (fe.ends_on is null or fe.ends_on >= date_trunc('month', p_period)::date)
        and not exists (
          select 1 from public.fixed_expense_payments fep
          where fep.fixed_expense_id = fe.id
            and fep.period = date_trunc('month', p_period)::date
        )
    )
    -
    (
      select coalesce(sum(vci.amount), 0)
      from public.v_credit_installments(p_period) vci
      where case
        when vci.card_id is not null then not exists (
          select 1 from public.credit_card_payments ccp
          where ccp.card_id = vci.card_id
            and ccp.period = date_trunc('month', p_period)::date
        )
        else not exists (
          select 1 from public.credit_purchase_payments cpp
          where cpp.purchase_id = vci.purchase_id
            and cpp.period = date_trunc('month', p_period)::date
        )
      end
    )
$$;
