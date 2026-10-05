-- Pagar descuenta TODO lo guardado, tenga movimiento o no. Hasta acá sólo descontaba lo guardado con
-- movimiento: si debía 400 y guardé 200 "aparte", el pago generaba 400. Ahora genera 200. Generar o no
-- el movimiento al guardar pasa a decidir sólo CUÁNDO baja el saldo (o si la plata salió de otro lado
-- y no interesa registrarla), no cuánto genera el pago.
--
--   * Mis Deudas (Premium): todo guardado descuenta — quien guarda ahí siempre pudo elegir.
--   * Fijos: igual, SALVO en Básico. Básico no tiene la opción de generar movimiento, todo lo guarda
--     aparte; si descontara, un alquiler guardado entero se pagaría sin movimiento y el gasto
--     desaparecería. Se marca por guardado (`fixed_expense_savings.covers_payment`, lo manda el front
--     cuando quien guarda puede elegir), así un guardado conserva la regla con la que se hizo aunque
--     después cambie el plan. Sin backfill: los guardados de antes siguen con su regla de siempre.
--
-- Compatible con el front anterior: no manda `p_covers_payment` (queda en `false`, igual que hoy) y
-- nunca escribió en `credit_savings`.

-- ---------------------------------------------------------------------------------------------
-- 1. Deudas: lo guardado para la cuota de una compra en un período, con o sin movimiento. Reemplaza a
--    `credit_saving_moved` (sólo con movimiento), que se borra al final.
-- ---------------------------------------------------------------------------------------------

create function public.credit_saving_covered(p_purchase_id uuid, p_period date)
returns numeric
language sql
stable
set search_path = public
as $$
  select coalesce(sum(amount), 0)
  from public.credit_savings
  where purchase_id = p_purchase_id
    and period = date_trunc('month', p_period)::date
$$;

-- ---------------------------------------------------------------------------------------------
-- 2. Pagar una tarjeta / una compra suelta: mismo cuerpo que `20261004010001_deudas_guardado_por_compra.sql`
--    (misma firma), con `credit_saving_covered` en vez de `credit_saving_moved`.
-- ---------------------------------------------------------------------------------------------

create or replace function public.rpc_mark_credit_card_paid(
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
  v_period date := date_trunc('month', p_period)::date;
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
  from public.v_credit_installments(v_period) i
  where i.card_id = p_card_id;

  if v_period_total = 0 then
    raise exception 'credit_card_period_empty';
  end if;

  insert into public.credit_card_payments (user_id, card_id, period, amount_paid)
  values (v_uid, p_card_id, v_period, v_period_total)
  returning id into v_payment_id;

  insert into public.credit_card_payment_items
    (user_id, payment_id, purchase_id, description, installment_no, installments, amount, category_id)
  select v_uid, v_payment_id, i.purchase_id, i.description, i.installment_no, i.installments, i.amount, i.category_id
  from public.v_credit_installments(v_period) i
  where i.card_id = p_card_id;

  for v_group in
    select item.category_id, sum(rem.amount) as total
    from public.credit_card_payment_items item
    cross join lateral (
      select greatest(item.amount - public.credit_saving_covered(item.purchase_id, v_period), 0) as amount
    ) rem
    where item.payment_id = v_payment_id and rem.amount > 0
    group by item.category_id
  loop
    with ranked as (
      select
        item.description,
        item.installment_no,
        item.installments,
        row_number() over (order by rem.amount desc, item.description) as rn,
        count(*) over () as total_count
      from public.credit_card_payment_items item
      cross join lateral (
        select greatest(item.amount - public.credit_saving_covered(item.purchase_id, v_period), 0) as amount
      ) rem
      where item.payment_id = v_payment_id
        and item.category_id is not distinct from v_group.category_id
        and rem.amount > 0
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

create or replace function public.rpc_mark_credit_purchase_paid(
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
  v_period date := date_trunc('month', p_period)::date;
  v_amount numeric;
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

  select * into v_item from public.v_credit_installments(v_period) where purchase_id = p_purchase_id;

  if not found then
    raise exception 'credit_purchase_period_empty';
  end if;

  v_amount := greatest(v_item.amount - public.credit_saving_covered(p_purchase_id, v_period), 0);

  if v_amount > 0 then
    v_description := v_item.description || case
      when v_item.installments > 1 then ' (' || v_item.installment_no::text || '/' || v_item.installments::text || ')'
      else ''
    end;

    insert into public.transactions (user_id, type, amount, occurred_on, category_id, description, account_id)
    values (v_uid, 'expense', v_amount, coalesce(p_occurred_on, current_date), v_item.category_id, left(v_description, 300), p_account_id)
    returning id into v_tx_id;
  end if;

  insert into public.credit_purchase_payments (user_id, purchase_id, period, amount_paid, transaction_id)
  values (v_uid, p_purchase_id, v_period, v_item.amount, v_tx_id);
end;
$$;

-- ---------------------------------------------------------------------------------------------
-- 3. Fijos: guardado aparte que igual descuenta del pago. `false` en Básico (no puede generar el
--    movimiento) y en todo lo guardado antes de esta migración. Un guardado con movimiento descuenta
--    siempre, tenga la marca o no.
-- ---------------------------------------------------------------------------------------------

alter table public.fixed_expense_savings add column covers_payment boolean not null default false;

-- `rpc_add_fixed_expense_saving`: mismo cuerpo que `20260924010001_fijos_pagos_solo_por_rpc.sql`, con
-- `p_covers_payment`. Cambia la firma: `drop` + `create`.

drop function public.rpc_add_fixed_expense_saving(uuid, date, numeric, boolean, text, uuid, date, date);

create function public.rpc_add_fixed_expense_saving(
  p_fixed_expense_id uuid,
  p_period date,
  p_amount numeric,
  p_generate_movement boolean default false,
  p_note text default null,
  p_account_id uuid default null,
  p_occurred_on date default null,
  p_today date default null,
  p_covers_payment boolean default false
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_fe record;
  v_note text;
  v_today date := least(greatest(coalesce(p_today, current_date), current_date - 1), current_date + 1);
  v_date date := coalesce(p_occurred_on, v_today);
  v_tx_id uuid;
begin
  if v_uid is null then
    raise exception 'not_authenticated';
  end if;

  select * into v_fe from public.fixed_expenses where id = p_fixed_expense_id and user_id = v_uid;
  if not found then
    raise exception 'fixed_expense_not_found';
  end if;

  if v_fe.is_recurring then
    raise exception 'fixed_expense_saving_not_applicable';
  end if;

  if p_amount is null or p_amount <= 0 then
    raise exception 'fixed_expense_saving_invalid_amount';
  end if;

  v_note := nullif(btrim(p_note), '');

  if p_generate_movement then
    insert into public.transactions (user_id, type, amount, occurred_on, category_id, description, account_id)
    values (v_uid, 'expense', p_amount, v_date, v_fe.category_id, coalesce(v_note, 'Guardado · ' || v_fe.name), p_account_id)
    returning id into v_tx_id;
  end if;

  insert into public.fixed_expense_savings (user_id, fixed_expense_id, period, amount, note, transaction_id, covers_payment)
  values (v_uid, p_fixed_expense_id, date_trunc('month', p_period)::date, p_amount, v_note, v_tx_id, coalesce(p_covers_payment, false));
end;
$$;

grant execute on function public.rpc_add_fixed_expense_saving(uuid, date, numeric, boolean, text, uuid, date, date, boolean) to authenticated;

-- `rpc_mark_fixed_expense_paid`: mismo cuerpo que `20260930010001_fijos_importe_por_mes.sql` (misma
-- firma); lo cubierto suma también lo guardado aparte con `covers_payment`.

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
      and (transaction_id is not null or covers_payment);
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

-- ---------------------------------------------------------------------------------------------
-- 4. `rpc_projected_balance_range`: mismo cuerpo que `20261004010001_deudas_guardado_por_compra.sql`
--    (misma firma). Descuenta lo mismo que el pago: en fijos, también lo guardado con
--    `covers_payment`; en deudas, todo lo guardado.
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
                and (fes.transaction_id is not null or fes.covers_payment)
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
        select sum(greatest(vci.amount - public.credit_saving_covered(vci.purchase_id, vci.period), 0))
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

drop function public.credit_saving_moved(uuid, date);
