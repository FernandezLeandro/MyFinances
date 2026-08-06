-- Serie mensual para el Bloque 4: ingresos/gastos por mes y saldo acumulado (running balance) al
-- cierre de cada uno. `running_balance` arranca del saldo ya acumulado antes de `p_from`, así el
-- área de tendencia no arranca de cero aunque el rango elegido sea "últimos 3 meses".
create or replace function public.rpc_monthly_series(p_from date, p_to date)
returns table (period date, total_income numeric, total_expense numeric, net numeric, running_balance numeric)
language sql
stable
as $$
  with months as (
    select generate_series(date_trunc('month', p_from), date_trunc('month', p_to), interval '1 month')::date as period
  ),
  monthly as (
    select
      date_trunc('month', occurred_on)::date as period,
      sum(amount) filter (where type = 'income') as total_income,
      sum(amount) filter (where type = 'expense') as total_expense
    from public.transactions
    where user_id = auth.uid()
      and occurred_on >= date_trunc('month', p_from)
      and occurred_on < (date_trunc('month', p_to) + interval '1 month')
    group by 1
  ),
  base as (
    select coalesce(sum(case when type = 'income' then amount else -amount end), 0) as base_balance
    from public.transactions
    where user_id = auth.uid()
      and occurred_on < date_trunc('month', p_from)
  )
  select
    m.period,
    coalesce(mo.total_income, 0) as total_income,
    coalesce(mo.total_expense, 0) as total_expense,
    coalesce(mo.total_income, 0) - coalesce(mo.total_expense, 0) as net,
    (select base_balance from base)
      + sum(coalesce(mo.total_income, 0) - coalesce(mo.total_expense, 0)) over (order by m.period)
      as running_balance
  from months m
  left join monthly mo on mo.period = m.period
  order by m.period
$$;

grant execute on function public.rpc_monthly_series(date, date) to authenticated;
