-- `20260902040003_projected_balance_standalone_purchases.sql` arregló el `not exists` de cuotas
-- sueltas, pero partió por error del cuerpo viejo de `rpc_projected_balance` (el de
-- `20260808020003`, previo a bolsas) en vez de partir de `20260902010001_drop_spending_budgets.sql`
-- (la versión vigente en ese momento). Eso hizo desaparecer la lógica de bolsas del segundo término:
-- un fijo recurrente con CUALQUIER pago parcial este período (p.ej. "Comida" con $51.213,50 de
-- $400.000) dejaba de descontar el remanente ($348.786,50) del saldo proyectado, en vez de descontar
-- `amount − pagado` como corresponde. Esta migración junta lo correcto de las dos: el término de
-- fijos/bolsas de `20260902010001` + el término de cuotas (con el `case` por compras sueltas) de
-- `20260902040003`. `spending_budgets` sigue sin término — se sacó sin reemplazo en `20260902010001`.
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
      select coalesce(sum(
        case
          when not fe.is_recurring then fe.amount
          when date_trunc('month', p_period) < date_trunc('month', current_date) then 0
          else greatest(
            fe.amount - coalesce((
              select sum(fep.amount_paid)
              from public.fixed_expense_payments fep
              where fep.fixed_expense_id = fe.id
                and fep.period = date_trunc('month', p_period)::date
            ), 0),
            0
          )
        end
      ), 0)
      from public.fixed_expenses fe
      where fe.user_id = auth.uid()
        and fe.is_active
        and fe.starts_on <= (date_trunc('month', p_period) + interval '1 month - 1 day')::date
        and (fe.ends_on is null or fe.ends_on >= date_trunc('month', p_period)::date)
        -- El `not exists` (ya pagado, no descontar nada) sólo aplica a los fijos de una sola vez:
        -- una bolsa con pagos sigue contando, por el remanente.
        and (fe.is_recurring or not exists (
          select 1 from public.fixed_expense_payments fep
          where fep.fixed_expense_id = fe.id
            and fep.period = date_trunc('month', p_period)::date
        ))
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
