-- Bloque 4 del plan de ciclos configurables: cada bolsa (`fixed_expenses.is_recurring`) declara su
-- propia frecuencia de reseteo, independiente del ciclo de caja de la cuenta (`profiles.cycle_kind`)
-- — ver "2. Las bolsas no entran en el eje B" en el plan. Sólo 'monthly'/'biweekly' por ahora:
-- 'weekly' puede cruzar el borde del mes (agujero #3 del plan) y el cliente sólo tiene los pagos del
-- mes que está mirando — la misma plomería multi-mes que el bloque 5 (ciclo semanal de cuenta) va a
-- construir de todos modos. Se agrega ahí.
--
-- Irrelevante para un fijo de una sola vez (`not is_recurring`): no se lee ni se muestra, pero se
-- deja con el mismo default por simplicidad de columna (mismo criterio que `cycle_week_starts_on` en
-- `profiles`, que sólo aplica a 'weekly' y aun así se guarda siempre).
--
-- Default 'monthly' preserva el comportamiento actual de TODA bolsa existente — cero cambio visible
-- hasta que alguien la edite y elija otra cosa.
alter table public.fixed_expenses
  add column bag_frequency text not null default 'monthly' check (bag_frequency in ('monthly', 'biweekly'));

grant update (bag_frequency) on public.fixed_expenses to authenticated;

-- ---------------------------------------------------------------------------------------------
-- Espejo SQL de `cycleContaining({kind:'biweekly'}, today)` en `src/lib/cycle.ts`, sólo la mitad de
-- mes que contiene HOY (no la que contiene `months.m`) — la bolsa quincenal es "en vivo": su
-- remanente en el mes en curso es siempre el de la quincena vigente, nunca la suma de las dos. Ver
-- el comentario largo en `rpc_projected_balance_range` más abajo.
-- ---------------------------------------------------------------------------------------------

create or replace function public.bag_cycle_from(p_frequency text, p_today date)
returns date
language sql
immutable
as $$
  select case
    when p_frequency = 'biweekly' and extract(day from p_today) > 15
      then (date_trunc('month', p_today) + interval '15 days')::date
    else date_trunc('month', p_today)::date
  end
$$;

create or replace function public.bag_cycle_to(p_frequency text, p_today date)
returns date
language sql
immutable
as $$
  select case
    when p_frequency = 'biweekly' and extract(day from p_today) <= 15
      then (date_trunc('month', p_today) + interval '14 days')::date
    else (date_trunc('month', p_today) + interval '1 month - 1 day')::date
  end
$$;

-- ---------------------------------------------------------------------------------------------
-- Redefine `rpc_projected_balance_range` (de `20260911030001`) para que el término de bolsas deje
-- de ser 100% mensual: una bolsa quincenal, mientras `months.m` es el mes EN CURSO, sólo cuenta lo
-- cargado (`paid_at`) dentro de la quincena que contiene hoy — no todo el mes. Mes cerrado (0) y mes
-- futuro (presupuesto completo, sin pagos todavía) siguen igual que antes, para cualquier frecuencia:
-- la "vida" de la bolsa sólo importa mientras se mira el mes de hoy.
--
-- `rpc_projected_balance(p_period)` (la versión NO range, sin llamadores en el cliente hoy) queda
-- intacta a propósito — mismo criterio que el bloque 3: es el snapshot del comportamiento anterior,
-- se compara antes de colapsarlas, no se edita en cada bloque.
-- ---------------------------------------------------------------------------------------------

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
                  fe.bag_frequency <> 'biweekly'
                  or months.m <> date_trunc('month', current_date)
                  or fep.paid_at::date between public.bag_cycle_from(fe.bag_frequency, current_date)
                                           and public.bag_cycle_to(fe.bag_frequency, current_date)
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
        and (fe.ends_on is null or fe.ends_on >= months.m)
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
