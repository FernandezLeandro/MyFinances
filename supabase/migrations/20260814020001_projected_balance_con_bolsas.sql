-- Segundo término del saldo proyectado, adaptado a bolsas mensuales. Los términos 1, 3 y 4 quedan
-- intactos (ver 20260808060001_spending_budgets.sql para su historia); sólo cambia cómo se
-- calcula lo pendiente de los fijos:
--   - Fijo de una sola vez: como antes, `amount` completo si no hay pago este período.
--   - Bolsa (`is_recurring`) en el mes en curso o futuro: lo que falta del presupuesto,
--     `amount − pagado`, nunca negativo — pasado el presupuesto no se descuenta nada más (esa plata
--     ya bajó el saldo real vía las transacciones).
--   - Bolsa de un mes YA CERRADO: $0. Lo no gastado de un presupuesto pasado no se debe — mismo
--     criterio que ya usa el término de `spending_budgets` ("mes ya cerrado: no queda nada por
--     gastar"). Distinto del fijo de una sola vez, que sigue restando si quedó impago en el pasado
--     (ahí sí es una obligación real que no se pagó).
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
    -
    coalesce((
      select round(
        sb.amount * (
          case
            when date_trunc('month', p_period) < date_trunc('month', current_date) then 0
            when date_trunc('month', p_period) > date_trunc('month', current_date) then 1
            else (
              extract(day from (date_trunc('month', current_date) + interval '1 month - 1 day'))
              - extract(day from current_date) + 1
            ) / extract(day from (date_trunc('month', current_date) + interval '1 month - 1 day'))
          end
        ),
        2
      )
      from public.spending_budgets sb
      where sb.user_id = auth.uid()
    ), 0)
$$;

grant execute on function public.rpc_projected_balance(date) to authenticated;
