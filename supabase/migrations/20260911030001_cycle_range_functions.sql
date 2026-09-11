-- Bloque 3 del plan de ciclos configurables: las funciones "por rango" que permiten mirar la app en
-- una ventana que no es el mes calendario. Todo lo que sigue es ADITIVO — ninguna función existente
-- se toca ni se reemplaza. `rpc_projected_balance(p_period date)`, `v_monthly_summary(p_period date)`
-- y `v_credit_installments(p_period date)` siguen intactas y siguen siendo lo que usa cualquier
-- pantalla que todavía no migró.
--
-- Ver `src/lib/cycle.ts` para el porqué de la separación entre el ciclo de caja (configurable) y la
-- periodicidad real de cada obligación (mensual, fija): estas funciones traducen entre los dos ejes,
-- no reemplazan la aritmética mensual de cuotas ni de fijos.

-- ---------------------------------------------------------------------------------------------
-- 1. La regla de materialización de vencimiento — espejo exacto de `dueDateInMonth` en TS
--    (`src/lib/cycle.ts`). Con `least()` clampea a fin de mes (31 en febrero → 28 o 29): la misma
--    regla escrita en los dos lenguajes con la MISMA semántica de overflow — es el riesgo #3 que
--    marcó el plan (en JS, construir la fecha directo con el día desborda al mes siguiente en vez de
--    clampear; acá se evita enteramente construyendo con offset de días sobre el día 1).
-- ---------------------------------------------------------------------------------------------

create or replace function public.due_date_in_month(p_month date, p_due_day int)
returns date
language sql
immutable
as $$
  select least(
    date_trunc('month', p_month)::date + (p_due_day - 1),
    (date_trunc('month', p_month) + interval '1 month - 1 day')::date
  )
$$;

-- ---------------------------------------------------------------------------------------------
-- 2. Cuotas de tarjeta/compras sueltas, con vencimiento materializado y filtrado por rango. A
--    diferencia de `v_credit_installments(p_period)` (un solo mes), ésta recorre todos los meses
--    que toca `[p_from, p_to]` — con ciclo mensual o quincenal eso es siempre UN mes (ninguno de los
--    dos cruza el borde del mes calendario), así que en la práctica hoy nunca itera más de una vez;
--    la generalidad queda lista para cuando el ciclo semanal (bloque 5) sí pueda cruzar.
-- ---------------------------------------------------------------------------------------------

create or replace function public.v_credit_installments_range(p_from date, p_to date)
returns table (
  card_id uuid,
  purchase_id uuid,
  description text,
  installment_no int,
  installments int,
  amount numeric,
  category_id uuid,
  period date,
  due_on date
)
language sql
stable
set search_path = public
as $$
  with months as (
    select generate_series(date_trunc('month', p_from), date_trunc('month', p_to), interval '1 month')::date as m
  )
  select
    cp.card_id,
    cp.id as purchase_id,
    cp.description,
    (
      (date_part('year', months.m) - date_part('year', cp.first_period)) * 12
      + (date_part('month', months.m) - date_part('month', cp.first_period))
    )::int + 1 as installment_no,
    cp.installments,
    cp.installment_amount,
    cp.category_id,
    months.m as period,
    public.due_date_in_month(months.m, coalesce(cc.due_day, cp.due_day)) as due_on
  from months
  cross join public.credit_purchases cp
  left join public.credit_cards cc on cc.id = cp.card_id
  where cp.user_id = auth.uid()
    and months.m >= cp.first_period
    and months.m < (cp.first_period + make_interval(months => cp.installments))::date
    and public.due_date_in_month(months.m, coalesce(cc.due_day, cp.due_day)) between p_from and p_to
$$;

grant execute on function public.v_credit_installments_range(date, date) to authenticated;

-- ---------------------------------------------------------------------------------------------
-- 3. Ingresos/gastos/balance de un rango arbitrario — mismo criterio que `v_monthly_summary`
--    respecto de los ajustes (`is_adjustment`): los totales de ingreso/gasto los excluyen, el
--    balance los incluye. Sin `date_trunc`: el rango es el que pida el llamador, no se redondea a
--    mes.
-- ---------------------------------------------------------------------------------------------

create or replace function public.v_range_summary(p_from date, p_to date)
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
    and occurred_on >= p_from
    and occurred_on <= p_to
$$;

grant execute on function public.v_range_summary(date, date) to authenticated;

-- ---------------------------------------------------------------------------------------------
-- 4. Saldo proyectado por rango — la variante que resuelve el agujero #1 del plan (el proyectado
--    tiene que ser un horizonte, no una ventana simétrica: si sólo mirara lo que vence DENTRO de
--    `[p_from, p_to]`, un impago del ciclo actual se "evaporaría" al navegar a un ciclo futuro). El
--    llamador (client, `projectionWindow` en `cycle.ts`) es quien ya extiende `p_from` hacia atrás
--    hasta el inicio del ciclo EN CURSO cuando se mira un ciclo futuro — esta función no decide eso,
--    sólo confía en el rango que recibe y suma todo lo impago que cae ahí.
--
--    Convive con `rpc_projected_balance(p_period)` sin reemplazarla — es la séptima potencial
--    redefinición de la función más frágil del repo (ver historial: se redefinió 6 veces, y
--    `20260902040003` partió una vez del cuerpo equivocado y dejó de descontar el remanente de
--    bolsas en silencio durante semanas). Los números de las dos se comparan en producción antes de
--    colapsarlas — eso es un paso aparte, deliberadamente NO esta migración.
--
--    Las bolsas (`is_recurring`) siguen 100% mensuales acá (opción "(b)" del plan, bloque 4
--    pendiente): un período cerrado (mes anterior al actual) no descuenta nada; si no, se descuenta
--    el remanente del PRESUPUESTO DEL MES completo, sin prorratear por ciclo — es el comportamiento
--    de siempre, sólo que ahora evaluado en cada mes que el rango toca (con ciclo mensual/quincenal
--    eso es siempre un único mes, así que no hay riesgo de contarlo dos veces todavía).
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
