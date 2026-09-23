-- "Hoy" lo manda el cliente (pendiente del punto 6 del QA de Cuentas).
--
-- `current_date` de Supabase es UTC. En Argentina (UTC-3), pasadas las 21:00 ya es el día siguiente,
-- y las funciones que decidían "hoy" por su cuenta se corrían un día respecto del front — que siempre
-- usa la hora local del navegador (`useCycle`, `src/lib/dates.ts`):
--
--   - `rpc_projected_balance_range`: el último día del mes daba por cerrado el mes actual (las bolsas
--     contaban 0), y en el borde de un sub-ciclo quincenal/semanal ya tomaba el siguiente. El
--     proyectado del servidor dejaba de coincidir con su espejo en `fixed-expenses/aggregate.ts`.
--   - `rpc_mark_credit_card_paid` / `rpc_mark_credit_purchase_paid`: el movimiento del pago quedaba
--     con fecha de mañana — no tenían parámetro de fecha.
--   - `rpc_mark_fixed_expense_paid`: el último día del mes, pagar el mes actual no actualizaba el
--     monto del fijo, y el `paid_at` de un pago "de hoy" se armaba como si fuera de otro día.
--
-- Mismo patrón que `p_occurred_on` en el resto de las RPC: un parámetro con default `null`, que cae a
-- `current_date` si no viene. Así el front que hoy está en producción, que no lo manda, sigue
-- funcionando igual contra esta base (PostgREST llama por nombre). `p_today` se acota a ±1 día de
-- `current_date`: ningún huso horario real se aleja más que eso de UTC, y así no sirve para mover la
-- lógica de "mes actual" a una fecha cualquiera.
--
-- El `default current_date` de `fixed_expenses.starts_on` no se toca: el cliente pasa a mandar la
-- columna al crear un fijo (`useCreateFixedExpense`).

-- ---------------------------------------------------------------------------------------------
-- 1. Saldo proyectado — mismo cuerpo que `20260923040001_proyectado_atrasados_del_mes.sql`, con
--    `current_date` reemplazado por el CTE `today`.
-- ---------------------------------------------------------------------------------------------

drop function public.rpc_projected_balance_range(date, date);

create function public.rpc_projected_balance_range(p_from date, p_to date, p_today date default null)
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
                  or fep.paid_at::date between public.bag_cycle_from(fe.bag_frequency, (select d from today), (select v from week_starts_on))
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

grant execute on function public.rpc_projected_balance_range(date, date, date) to authenticated;

-- ---------------------------------------------------------------------------------------------
-- 2. Pagar un fijo — mismo cuerpo que `20260916010001_fixed_expense_payment_fecha.sql`, con
--    `p_today` para decidir si el pago es "de hoy" (`paid_at`) y si el período es el actual o uno
--    futuro (actualizar el monto del fijo).
-- ---------------------------------------------------------------------------------------------

drop function public.rpc_mark_fixed_expense_paid(uuid, date, numeric, text, uuid, date);

create function public.rpc_mark_fixed_expense_paid(
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
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_fe record;
  v_amount numeric;
  v_note text;
  v_today date := least(greatest(coalesce(p_today, current_date), current_date - 1), current_date + 1);
  v_date date := coalesce(p_occurred_on, v_today);
  v_tx_id uuid;
  v_payment_id uuid;
  v_covered numeric := 0;
  v_tx_amount numeric;
begin
  select * into v_fe from public.fixed_expenses where id = p_fixed_expense_id and user_id = v_uid;
  if not found then
    raise exception 'fixed_expense_not_found';
  end if;

  v_amount := coalesce(p_amount, v_fe.amount);
  v_note := nullif(btrim(p_note), '');

  if not v_fe.is_recurring then
    select coalesce(sum(amount), 0) into v_covered
    from public.fixed_expense_savings
    where fixed_expense_id = p_fixed_expense_id
      and period = date_trunc('month', p_period)::date
      and transaction_id is not null;
  end if;

  v_tx_amount := greatest(v_amount - v_covered, 0);

  if v_tx_amount > 0 then
    insert into public.transactions (user_id, type, amount, occurred_on, category_id, description, account_id)
    values (v_uid, 'expense', v_tx_amount, v_date, v_fe.category_id, coalesce(v_note, v_fe.name), p_account_id)
    returning id into v_tx_id;
  end if;

  -- `paid_at` ubica una bolsa quincenal/semanal en su sub-período (`aggregate.ts`,
  -- `bag_cycle_from`/`bag_cycle_to`) — con fecha de hoy, `now()` (igual que antes); con una fecha
  -- pasada elegida a mano, esa fecha al mediodía, para no cruzar de día al convertir a hora local.
  insert into public.fixed_expense_payments (user_id, fixed_expense_id, period, amount_paid, transaction_id, is_recurring, note, paid_at)
  values (
    v_uid, p_fixed_expense_id, date_trunc('month', p_period)::date, v_amount, v_tx_id, v_fe.is_recurring, v_note,
    case when p_occurred_on is null or p_occurred_on = v_today then now() else p_occurred_on + time '12:00' end
  )
  returning id into v_payment_id;

  if v_tx_id is not null then
    update public.transactions set fixed_expense_payment_id = v_payment_id where id = v_tx_id;
  end if;

  if not v_fe.is_recurring and date_trunc('month', p_period)::date >= date_trunc('month', v_today)::date then
    update public.fixed_expenses set amount = v_amount where id = p_fixed_expense_id and user_id = v_uid;
  end if;
end;
$$;

grant execute on function public.rpc_mark_fixed_expense_paid(uuid, date, numeric, text, uuid, date, date) to authenticated;

-- ---------------------------------------------------------------------------------------------
-- 3. Pagar el resumen de una tarjeta — mismo cuerpo que `20260904030001_cuentas_en_pagos.sql`, con
--    `p_occurred_on` para la fecha de los movimientos.
-- ---------------------------------------------------------------------------------------------

drop function public.rpc_mark_credit_card_paid(uuid, date, uuid);

create function public.rpc_mark_credit_card_paid(
  p_card_id uuid,
  p_period date,
  p_account_id uuid default null,
  p_occurred_on date default null
)
returns void
language plpgsql
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_card record;
  v_period_total numeric;
  v_payment_id uuid;
  v_group record;
  v_tx_id uuid;
  v_description text;
begin
  select * into v_card from public.credit_cards where id = p_card_id and user_id = v_uid;
  if not found then
    raise exception 'credit_card_not_found';
  end if;

  select coalesce(sum(i.amount), 0) into v_period_total
  from public.v_credit_installments(p_period) i
  where i.card_id = p_card_id;

  if v_period_total = 0 then
    raise exception 'credit_card_period_empty';
  end if;

  insert into public.credit_card_payments (user_id, card_id, period, amount_paid)
  values (v_uid, p_card_id, date_trunc('month', p_period)::date, v_period_total)
  returning id into v_payment_id;

  insert into public.credit_card_payment_items
    (user_id, payment_id, purchase_id, description, installment_no, installments, amount, category_id)
  select v_uid, v_payment_id, i.purchase_id, i.description, i.installment_no, i.installments, i.amount, i.category_id
  from public.v_credit_installments(p_period) i
  where i.card_id = p_card_id;

  for v_group in
    select category_id, sum(amount) as total
    from public.credit_card_payment_items
    where payment_id = v_payment_id
    group by category_id
  loop
    with ranked as (
      select
        description,
        installment_no,
        installments,
        amount,
        row_number() over (order by amount desc, description) as rn,
        count(*) over () as total_count
      from public.credit_card_payment_items
      where payment_id = v_payment_id
        and category_id is not distinct from v_group.category_id
    )
    select
      v_card.name || ' · ' ||
      string_agg(
        case when installments > 1
          then description || ' (' || installment_no::text || '/' || installments::text || ')'
          else description
        end,
        ', ' order by rn
      ) filter (where rn <= 3) ||
      case when max(total_count) > 3 then ' y ' || (max(total_count) - 3)::text || ' más' else '' end
    into v_description
    from ranked;

    insert into public.transactions (user_id, type, amount, occurred_on, category_id, description, is_credit_card_payment, account_id)
    values (v_uid, 'expense', v_group.total, coalesce(p_occurred_on, current_date), v_group.category_id, left(v_description, 300), true, p_account_id)
    returning id into v_tx_id;

    update public.credit_card_payment_items
    set transaction_id = v_tx_id
    where payment_id = v_payment_id
      and category_id is not distinct from v_group.category_id;
  end loop;
end;
$$;

grant execute on function public.rpc_mark_credit_card_paid(uuid, date, uuid, date) to authenticated;

-- ---------------------------------------------------------------------------------------------
-- 4. Pagar la cuota de una compra a crédito suelta — mismo cuerpo que
--    `20260904030001_cuentas_en_pagos.sql`, con `p_occurred_on` para la fecha del movimiento.
-- ---------------------------------------------------------------------------------------------

drop function public.rpc_mark_credit_purchase_paid(uuid, date, uuid);

create function public.rpc_mark_credit_purchase_paid(
  p_purchase_id uuid,
  p_period date,
  p_account_id uuid default null,
  p_occurred_on date default null
)
returns void
language plpgsql
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_purchase record;
  v_item record;
  v_description text;
  v_tx_id uuid;
begin
  select * into v_purchase from public.credit_purchases where id = p_purchase_id and user_id = v_uid;
  if not found then
    raise exception 'credit_purchase_not_found';
  end if;

  if v_purchase.card_id is not null then
    raise exception 'credit_purchase_has_card';
  end if;

  select * into v_item from public.v_credit_installments(p_period) where purchase_id = p_purchase_id;

  if not found then
    raise exception 'credit_purchase_period_empty';
  end if;

  v_description := v_item.description || case
    when v_item.installments > 1 then ' (' || v_item.installment_no::text || '/' || v_item.installments::text || ')'
    else ''
  end;

  insert into public.transactions (user_id, type, amount, occurred_on, category_id, description, account_id)
  values (v_uid, 'expense', v_item.amount, coalesce(p_occurred_on, current_date), v_item.category_id, left(v_description, 300), p_account_id)
  returning id into v_tx_id;

  insert into public.credit_purchase_payments (user_id, purchase_id, period, amount_paid, transaction_id)
  values (v_uid, p_purchase_id, date_trunc('month', p_period)::date, v_item.amount, v_tx_id);
end;
$$;

grant execute on function public.rpc_mark_credit_purchase_paid(uuid, date, uuid, date) to authenticated;
