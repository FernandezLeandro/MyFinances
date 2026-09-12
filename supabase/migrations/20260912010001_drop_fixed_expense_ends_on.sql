-- Bloque 1 del plan "BASIC centrado en fijos": saca "De baja desde" (`ends_on`). El usuario que ya
-- no necesita un fijo lo elimina directamente (ver `useDeleteFixedExpense`) en vez de darlo de baja
-- — la baja quedaba poco usada y complicaba `eligibleFixedExpenses`/`rpc_projected_balance_range`
-- sin necesidad real.
--
-- Los fijos que ya tenían una baja vencida (antes de este mes) se eliminan acá — decisión de Lean:
-- no tiene sentido dejarlos "activos de nuevo" al borrar la columna. Los que tenían una baja futura
-- sólo pierden la fecha y quedan activos (nunca llegaron a dejar de contar). El `on delete cascade`
-- de `fixed_expense_payments` se lleva su historial; los movimientos ya generados no se tocan
-- (`transactions.fixed_expense_payment_id` es `on delete set null`).
delete from public.fixed_expenses
where ends_on is not null and ends_on < date_trunc('month', current_date);

alter table public.fixed_expenses drop column ends_on;

-- Redefine `rpc_projected_balance_range` (última versión: `20260911050001_bag_frequency_weekly.sql`)
-- sin la condición de `ends_on`, que ya no existe.
create or replace function public.rpc_projected_balance_range(p_from date, p_to date)
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
      with months as (
        select generate_series(date_trunc('month', p_from), date_trunc('month', p_to), interval '1 month')::date as m
      ),
      week_starts_on as (
        select coalesce((select p.cycle_week_starts_on from public.profiles p where p.id = auth.uid()), 1) as v
      )
      select coalesce(sum(
        case
          when not fe.is_recurring then fe.amount
          when months.m < date_trunc('month', current_date) then 0
          else greatest(
            fe.amount - coalesce((
              select sum(fep.amount_paid)
              from public.fixed_expense_payments fep
              where fep.fixed_expense_id = fe.id
                and fep.period = months.m
                and (
                  fe.bag_frequency = 'monthly'
                  or months.m <> date_trunc('month', current_date)
                  or fep.paid_at::date between public.bag_cycle_from(fe.bag_frequency, current_date, (select v from week_starts_on))
                                           and public.bag_cycle_to(fe.bag_frequency, current_date, (select v from week_starts_on))
                )
            ), 0),
            0
          )
        end
      ), 0)
      from months
      cross join public.fixed_expenses fe
      where fe.user_id = auth.uid()
        and fe.is_active
        and fe.starts_on <= (months.m + interval '1 month - 1 day')::date
        and (
          fe.is_recurring
          or (
            public.due_date_in_month(months.m, fe.due_day) between p_from and p_to
            and not exists (
              select 1 from public.fixed_expense_payments fep
              where fep.fixed_expense_id = fe.id and fep.period = months.m
            )
          )
        )
    )
    -
    (
      select coalesce(sum(vci.amount), 0)
      from public.v_credit_installments_range(p_from, p_to) vci
      where case
        when vci.card_id is not null then not exists (
          select 1 from public.credit_card_payments ccp
          where ccp.card_id = vci.card_id and ccp.period = vci.period
        )
        else not exists (
          select 1 from public.credit_purchase_payments cpp
          where cpp.purchase_id = vci.purchase_id and cpp.period = vci.period
        )
      end
    )
$$;

grant execute on function public.rpc_projected_balance_range(date, date) to authenticated;

-- `rpc_projected_balance(p_period)` (versión por mes, sin rango) queda sin usos en el cliente desde
-- que `useProjectedBalance` fue reemplazado por `useProjectedBalanceRange` — se borra junto con el
-- hook (ver `src/features/fixed-expenses/api.ts`).
drop function if exists public.rpc_projected_balance(date);
