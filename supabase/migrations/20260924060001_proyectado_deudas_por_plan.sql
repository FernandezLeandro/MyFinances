-- ---------------------------------------------------------------------------------------------
-- HO-12 del QA de Hoy (docs/qa/hoy.md), con D2 (decisión de Lean, 2026-09-24): en Test, el
-- proyectado restaba las cuotas de una tarjeta con `Deudas por pagar (N) -$X`, pero ese plan no
-- tiene "Mis deudas" ni ningún otro lugar donde ver esa tarjeta o pagarla — la plata quedaba
-- descontada sin que el plan ofreciera cómo resolverlo.
--
-- El plan es interfaz, no seguridad (`CLAUDE.md`): esto no es una regla de negocio nueva, es
-- "datos en pausa" — mismo criterio que ya tienen las cuentas archivadas de Básico al bajar de
-- plan. `p_include_debts` deja la decisión en manos de quien llama: el cliente pasa `false` cuando
-- el plan de la cuenta no tiene `mis-deudas` (ver `useCan('mis-deudas')` en `src/features/access/
-- plan.ts`), y `true` (el default) en cualquier otro caso — Mis Deudas, que sólo se monta con el
-- plan que sí puede verla, no necesita pasar nada.
--
-- Redefine `rpc_projected_balance_range` (última versión: `20260923100001_fijos_bolsa_paid_on.sql`)
-- sumando el parámetro nuevo — cambia la firma, así que hace falta `drop` antes de `create`. Sin
-- más cambios al cuerpo.
-- ---------------------------------------------------------------------------------------------

drop function public.rpc_projected_balance_range(date, date, date);

create function public.rpc_projected_balance_range(
  p_from date,
  p_to date,
  p_today date default null,
  p_include_debts boolean default true
)
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
      ),
      today as (
        select least(greatest(coalesce(p_today, current_date), current_date - 1), current_date + 1) as d
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
          when months.m < date_trunc('month', (select d from today)) then 0
          else greatest(
            fe.amount - coalesce((
              select sum(fep.amount_paid)
              from public.fixed_expense_payments fep
              where fep.fixed_expense_id = fe.id
                and fep.period = months.m
                and (
                  fe.bag_frequency = 'monthly'
                  or months.m <> date_trunc('month', (select d from today))
                  or fep.paid_on between public.bag_cycle_from(fe.bag_frequency, (select d from today), (select v from week_starts_on))
                                      and public.bag_cycle_to(fe.bag_frequency, (select d from today), (select v from week_starts_on))
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
            and public.due_date_in_month(months.m, fe.due_day) >= fe.starts_on
            and not exists (
              select 1 from public.fixed_expense_payments fep
              where fep.fixed_expense_id = fe.id and fep.period = months.m
            )
          )
        )
    )
    -
    (
      case when not p_include_debts then 0 else coalesce((
        select sum(vci.amount)
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
      ), 0) end
    )
$$;

grant execute on function public.rpc_projected_balance_range(date, date, date, boolean) to authenticated;
