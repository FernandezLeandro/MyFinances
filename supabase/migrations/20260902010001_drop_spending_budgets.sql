-- Sacamos el "gasto variable estimado" (`spending_budgets`, hoy sólo "Comida"): quedó redundante
-- con las bolsas mensuales de Gastos fijos (`fixed_expenses.is_recurring`, ver
-- 20260814010001_fixed_expense_recurring.sql) — mismo caso de uso, mejor resuelto: se carga como un
-- fijo más, se marca pagado parcialmente y descuenta el remanente real en vez de un promedio diario
-- que no mira lo que ya se gastó.
--
-- Cuarto término de `rpc_projected_balance` (ver 20260808060001_spending_budgets.sql para su
-- historia): se saca sin reemplazo, quedan los tres términos anteriores intactos (transacciones,
-- fijos/bolsas, cuotas de tarjeta) — mismo cuerpo que 20260814020001_projected_balance_con_bolsas.sql
-- pero sin el término de `spending_budgets`.
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
      where not exists (
        select 1 from public.credit_card_payments ccp
        where ccp.card_id = vci.card_id
          and ccp.period = date_trunc('month', p_period)::date
      )
    )
$$;

grant execute on function public.rpc_projected_balance(date) to authenticated;

drop table if exists public.spending_budgets;
