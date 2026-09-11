-- Bloque 5 del plan de ciclos configurables: habilita `bag_frequency: 'weekly'` — la plomería
-- multi-mes que este bloque construye (fetch de pagos por rango de meses, no un único período) es
-- exactamente lo que la bolsa semanal necesitaba y que el bloque 4 dejó pendiente a propósito (ver
-- `20260911040001_fixed_expense_bag_frequency.sql`).
--
-- A diferencia de la quincena (siempre 1–15 / 16–fin, no necesita nada del perfil), una semana
-- necesita saber DÓNDE arranca — `profiles.cycle_week_starts_on` (1=lunes…7=domingo ISO, igual
-- convención que `src/lib/cycle.ts`). Por eso `bag_cycle_from`/`bag_cycle_to` ganan un tercer
-- parámetro `p_week_starts_on`, con default 1 para no romper las dos llamadas existentes.
alter table public.fixed_expenses
  drop constraint fixed_expenses_bag_frequency_check,
  add constraint fixed_expenses_bag_frequency_check check (bag_frequency in ('monthly', 'biweekly', 'weekly'));

-- ---------------------------------------------------------------------------------------------
-- Espejo SQL de `cycleContaining({kind:'weekly', weekStartsOn}, today)` en `src/lib/cycle.ts` —
-- misma fórmula que la rama 'weekly' de ahí (día ISO 1..7, offset hacia atrás hasta calzar con
-- `p_week_starts_on`). `extract(dow from date)` en Postgres da 0=domingo..6=sábado, igual
-- convención que `Date.prototype.getDay()` en JS, así que la conversión a ISO es idéntica.
-- ---------------------------------------------------------------------------------------------

create or replace function public.bag_cycle_from(p_frequency text, p_today date, p_week_starts_on int default 1)
returns date
language sql
immutable
as $$
  select case
    when p_frequency = 'weekly' then
      p_today - (((((extract(dow from p_today)::int + 6) % 7) + 1) - p_week_starts_on + 7) % 7)
    when p_frequency = 'biweekly' and extract(day from p_today) > 15
      then (date_trunc('month', p_today) + interval '15 days')::date
    else date_trunc('month', p_today)::date
  end
$$;

create or replace function public.bag_cycle_to(p_frequency text, p_today date, p_week_starts_on int default 1)
returns date
language sql
immutable
as $$
  select case
    when p_frequency = 'weekly' then public.bag_cycle_from(p_frequency, p_today, p_week_starts_on) + 6
    when p_frequency = 'biweekly' and extract(day from p_today) <= 15
      then (date_trunc('month', p_today) + interval '14 days')::date
    else (date_trunc('month', p_today) + interval '1 month - 1 day')::date
  end
$$;

-- ---------------------------------------------------------------------------------------------
-- Redefine `rpc_projected_balance_range` (de `20260911040001`) para que una bolsa semanal también
-- quede "en vivo": el bug de la versión anterior es que el `where` sólo activaba el filtro para
-- `bag_frequency = 'biweekly'` (`<> 'biweekly'` como condición de salida) — una bolsa 'weekly'
-- pasaba por esa condición como si fuera mensual, sin recortar nunca a la semana vigente. Ahora la
-- condición de salida es `= 'monthly'` (positiva: sólo la mensual se salta el recorte), y el
-- recorte usa `cycle_week_starts_on` del perfil del dueño de la bolsa.
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

grant execute on function public.rpc_projected_balance_range(date, date) to authenticated;
