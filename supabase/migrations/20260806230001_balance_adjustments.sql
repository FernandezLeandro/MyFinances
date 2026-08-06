-- "Ajustar saldo": cuando el saldo de la app no coincide con la plata real, se corrige con un
-- movimiento normal marcado como ajuste — no un número de saldo aparte (el saldo es 100% derivado,
-- no hay ninguno guardado). Arranca en `false` para todo lo ya cargado: cero migración de datos.
alter table public.transactions add column is_adjustment boolean not null default false;

-- "Ingresos/gastos del mes" no debe inflarse con un reset a $0 de fin de mes — pero `balance` sigue
-- sumando todo (ajustes incluidos): es la plata real, y ahí el ajuste cuenta a propósito.
create or replace function public.v_monthly_summary(p_period date)
returns table (total_income numeric, total_expense numeric, balance numeric)
language sql
stable
as $$
  select
    coalesce(sum(amount) filter (where type = 'income' and not is_adjustment), 0) as total_income,
    coalesce(sum(amount) filter (where type = 'expense' and not is_adjustment), 0) as total_expense,
    coalesce(sum(case when type = 'income' then amount else -amount end), 0) as balance
  from public.transactions
  where user_id = auth.uid()
    and occurred_on >= date_trunc('month', p_period)::date
    and occurred_on < (date_trunc('month', p_period) + interval '1 month')::date
$$;

-- Esta función alimenta DOS gráficos con criterios opuestos, y es la parte sutil de todo el cambio:
--   - total_income / total_expense / net → SIN ajustes (evolución mensual: un reset no es un gasto).
--   - running_balance → CON ajustes (tendencia de saldo: si ajustaste a $0, la línea cae a $0).
-- Por eso `monthly` calcula dos cosas separadas por mes — los totales ya filtrados, y `all_delta`
-- (el neto real, ajustes incluidos) que sólo se usa para el acumulado. `base_balance` (el saldo
-- previo al rango) también incluye ajustes, por la misma razón.
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
      sum(amount) filter (where type = 'income' and not is_adjustment) as total_income,
      sum(amount) filter (where type = 'expense' and not is_adjustment) as total_expense,
      sum(case when type = 'income' then amount else -amount end) as all_delta
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
      + sum(coalesce(mo.all_delta, 0)) over (order by m.period)
      as running_balance
  from months m
  left join monthly mo on mo.period = m.period
  order by m.period
$$;

-- rpc_current_balance, rpc_projected_balance y v_spend_by_category NO cambian a propósito:
-- el saldo actual/proyectado debe incluir los ajustes (es el punto de la feature), y el donut de
-- categorías ya excluye cualquier transacción sin categoría vía su `left join` — un ajuste siempre
-- se crea sin categoría, así que ya queda afuera sin tocar esa función.
