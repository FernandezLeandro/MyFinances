-- Editar el importe de un fijo (bolsa o "una vez al mes") reescribía TODOS los meses: en un mes ya
-- cerrado, una bolsa dejaba de mostrar el exceso («te pasaste») y un atrasado impago pasaba a valer el
-- importe nuevo. `fixed_expenses.amount` es un único valor sin historial.
--
-- Ahora cada mes puede tener su propio importe (`fixed_expense_period_amounts`); el mes sin fila usa
-- `fixed_expenses.amount`, que sigue siendo el importe vigente "de acá en adelante". Un fijo sin
-- overrides se comporta igual que hasta hoy, así que no hace falta backfill.
--
-- Editar el importe «desde el mes X» (`rpc_set_fixed_expense_amount`) congela los meses anteriores a X
-- con el importe que tenían, descarta los overrides de X en adelante y deja el importe nuevo en la
-- plantilla. Todo en una sola función, atómica.

-- ---------------------------------------------------------------------------------------------
-- 1. Tabla. Mismo criterio que `fixed_expense_payments` (`20260924010001_fijos_pagos_solo_por_rpc.sql`):
--    sólo `select` directo, la escritura va por `rpc_set_fixed_expense_amount`. Un insert directo
--    podría apuntar a un `fixed_expense_id` de otra cuenta (la FK no mira el dueño), y la función ya
--    valida que el fijo sea propio.
-- ---------------------------------------------------------------------------------------------

create table public.fixed_expense_period_amounts (
  fixed_expense_id uuid not null references public.fixed_expenses (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  period date not null check (period = date_trunc('month', period)::date),
  amount numeric(12, 2) not null check (amount > 0),
  primary key (fixed_expense_id, period)
);

alter table public.fixed_expense_period_amounts enable row level security;

create policy "fixed_expense_period_amounts_select_own" on public.fixed_expense_period_amounts
  for select using (user_id = auth.uid());

grant select on public.fixed_expense_period_amounts to authenticated;

-- ---------------------------------------------------------------------------------------------
-- 2. `rpc_set_fixed_expense_amount`: aplica `p_amount` desde el mes de `p_from` en adelante.
-- ---------------------------------------------------------------------------------------------

create function public.rpc_set_fixed_expense_amount(p_fixed_expense_id uuid, p_amount numeric, p_from date)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_fe record;
  v_from date := date_trunc('month', p_from)::date;
begin
  if v_uid is null then
    raise exception 'not_authenticated';
  end if;

  if p_amount is null or p_amount <= 0 or p_amount >= 1e10 then
    raise exception 'fixed_expense_amount_invalid';
  end if;

  select * into v_fe from public.fixed_expenses where id = p_fixed_expense_id and user_id = v_uid;
  if not found then
    raise exception 'fixed_expense_not_found';
  end if;

  -- Los meses anteriores a `v_from` conservan el importe que tenían. Si ya tienen override se respeta.
  insert into public.fixed_expense_period_amounts (fixed_expense_id, user_id, period, amount)
  select v_fe.id, v_uid, m::date, v_fe.amount
  from generate_series(date_trunc('month', v_fe.starts_on), date_trunc('month', v_from - 1), interval '1 month') m
  on conflict (fixed_expense_id, period) do nothing;

  -- De `v_from` en adelante manda el importe nuevo: se descartan los overrides que lo taparían.
  delete from public.fixed_expense_period_amounts
  where fixed_expense_id = v_fe.id and period >= v_from;

  update public.fixed_expenses set amount = p_amount where id = v_fe.id and user_id = v_uid;
end;
$$;

grant execute on function public.rpc_set_fixed_expense_amount(uuid, numeric, date) to authenticated;

-- ---------------------------------------------------------------------------------------------
-- 3. `rpc_projected_balance_range`: mismo cuerpo que `20260924060001_proyectado_deudas_por_plan.sql`,
--    con el importe de cada mes (`coalesce(fpa.amount, fe.amount)`) en vez de `fe.amount`. Misma firma:
--    alcanza con `create or replace`.
-- ---------------------------------------------------------------------------------------------

create or replace function public.rpc_projected_balance_range(
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
            coalesce(fpa.amount, fe.amount) - coalesce((
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
            coalesce(fpa.amount, fe.amount) - coalesce((
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
      left join public.fixed_expense_period_amounts fpa
        on fpa.fixed_expense_id = fe.id and fpa.period = months.m
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

-- ---------------------------------------------------------------------------------------------
-- 4. `rpc_mark_fixed_expense_paid`: mismo cuerpo que `20260924010001_fijos_pagos_solo_por_rpc.sql`
--    (firma sin cambios), con dos diferencias:
--    - el importe por defecto es el del período que se paga (su override si lo tiene);
--    - al actualizar la plantilla pasa por `rpc_set_fixed_expense_amount`, que congela los meses
--      anteriores — pagar este mes con aumento no cambia lo que valía un atrasado del mes pasado — y
--      sólo si el período no tiene un cambio ya programado para él o para un mes posterior.
-- ---------------------------------------------------------------------------------------------

create or replace function public.rpc_mark_fixed_expense_paid(
  p_fixed_expense_id uuid,
  p_period date,
  p_amount numeric default null,
  p_note text default null,
  p_account_id uuid default null,
  p_occurred_on date default null,
  p_today date default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_fe record;
  v_amount numeric;
  v_note text;
  v_today date := least(greatest(coalesce(p_today, current_date), current_date - 1), current_date + 1);
  v_date date := coalesce(p_occurred_on, v_today);
  v_period date := date_trunc('month', p_period)::date;
  v_tx_id uuid;
  v_payment_id uuid;
  v_covered numeric := 0;
  v_tx_amount numeric;
  v_updates_template boolean;
begin
  if v_uid is null then
    raise exception 'not_authenticated';
  end if;

  select * into v_fe from public.fixed_expenses where id = p_fixed_expense_id and user_id = v_uid;
  if not found then
    raise exception 'fixed_expense_not_found';
  end if;

  if not v_fe.is_active then
    raise exception 'fixed_expense_inactive';
  end if;

  if p_occurred_on is not null and p_occurred_on > v_today then
    raise exception 'fixed_expense_payment_future_date';
  end if;

  v_amount := coalesce(
    p_amount,
    (select fpa.amount from public.fixed_expense_period_amounts fpa where fpa.fixed_expense_id = v_fe.id and fpa.period = v_period),
    v_fe.amount
  );
  v_note := nullif(btrim(p_note), '');
  v_updates_template := not v_fe.is_recurring
    and v_period >= date_trunc('month', v_today)::date
    and not exists (
      select 1 from public.fixed_expense_period_amounts fpa
      where fpa.fixed_expense_id = v_fe.id and fpa.period >= v_period
    );

  if not v_fe.is_recurring then
    select coalesce(sum(amount), 0) into v_covered
    from public.fixed_expense_savings
    where fixed_expense_id = p_fixed_expense_id
      and period = v_period
      and transaction_id is not null;
  end if;

  v_tx_amount := greatest(v_amount - v_covered, 0);

  if v_tx_amount > 0 then
    insert into public.transactions (user_id, type, amount, occurred_on, category_id, description, account_id)
    values (v_uid, 'expense', v_tx_amount, v_date, v_fe.category_id, coalesce(v_note, v_fe.name), p_account_id)
    returning id into v_tx_id;
  end if;

  insert into public.fixed_expense_payments (
    user_id, fixed_expense_id, period, amount_paid, transaction_id, is_recurring, note, paid_at, paid_on, previous_template_amount
  )
  values (
    v_uid, p_fixed_expense_id, v_period, v_amount, v_tx_id, v_fe.is_recurring, v_note,
    case when p_occurred_on is null or p_occurred_on = v_today then now() else p_occurred_on + time '12:00' end,
    v_date,
    case when v_updates_template then v_fe.amount else null end
  )
  returning id into v_payment_id;

  if v_tx_id is not null then
    update public.transactions set fixed_expense_payment_id = v_payment_id where id = v_tx_id;
  end if;

  -- Sólo si el importe pagado difiere: sin esto, cada pago sin cambio congelaría todos los meses
  -- anteriores para nada.
  if v_updates_template and v_amount <> v_fe.amount then
    perform public.rpc_set_fixed_expense_amount(p_fixed_expense_id, v_amount, v_period);
  end if;
end;
$$;
