-- N2 del re-test de QA: con ciclo quincenal o semanal, un fijo de una sola vez que venció en un
-- ciclo ANTERIOR del mismo mes (ej. vence el 15, hoy es 22, ciclo 16-30) no se restaba del
-- proyectado — la condición sólo restaba fijos cuyo vencimiento cae DENTRO de `[p_from, p_to]`, y ese
-- rango es el ciclo que se está mirando, no el mes entero. En Hoy y en Fijos pasaba lo mismo (ver
-- migración del bloque D del front, `src/lib/cycle.ts` / `src/features/fixed-expenses/period.ts`):
-- el fijo directamente desaparecía de la lista y de "Atrasado", en vez de arrastrarse.
--
-- Mismo cuerpo que `20260919010001_cuentas_saldo_y_reajuste.sql`, cambiando sólo el límite inferior
-- de la comprobación de fecha: en vez de `p_from` (el arranque del ciclo navegado) se usa el
-- arranque del MES de `p_from`. Un fijo vencido antes de eso (de un mes anterior) sigue sin
-- arrastrarse — ese es el comportamiento ya esperado y cubierto por tests existentes
-- (`fixed-expenses/aggregate.test.ts`). En ciclo mensual `p_from` ya es el primer día del mes, así
-- que esta migración no cambia nada ahí.
create or replace function public.rpc_projected_balance_range(p_from date, p_to date)
returns numeric
language sql
stable
set search_path = public
as $$
  select
    public.rpc_current_balance()
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
          when not fe.is_recurring then greatest(
            fe.amount - coalesce((
              select sum(fes.amount)
              from public.fixed_expense_savings fes
              where fes.fixed_expense_id = fe.id
                and fes.period = months.m
                and fes.transaction_id is not null
            ), 0),
            0
          )
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
            public.due_date_in_month(months.m, fe.due_day) between date_trunc('month', p_from)::date and p_to
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
