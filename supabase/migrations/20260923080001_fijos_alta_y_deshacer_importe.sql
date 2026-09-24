-- Bloque 3 del plan de arreglo de Fijos (docs/qa/fijos.md): alta a mitad de mes y deshacer un cambio
-- de importe. Ninguna de las dos cambia la firma de la función que toca, así que las tres van con
-- `create or replace` — sin dropear ni volver a otorgar permisos.

-- ---------------------------------------------------------------------------------------------
-- 1. FI-07: un fijo "una vez al mes" nuevo, cargado a mitad de mes con un vencimiento que ya pasó,
--    no debe restar del proyectado ni aparecer atrasado ESE mes — su `starts_on` es de después de esa
--    fecha, así que todavía no existía cuando "venció". Si ya tiene un pago en ese período (alguien lo
--    cargó como puesto al día) no se esconde: el `not exists` de siempre ya lo saca de esta resta.
--    Mismo cuerpo que `20260923050001_hoy_del_cliente.sql`, sección 1, con una condición más en la
--    rama "una vez al mes" del `where`. Espejo de `summarizeFixedExpenses` en
--    `src/features/fixed-expenses/aggregate.ts`.
-- ---------------------------------------------------------------------------------------------

create or replace function public.rpc_projected_balance_range(p_from date, p_to date, p_today date default null)
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
            -- FI-07: el vencimiento materializado de ESTE mes tiene que ser de cuando el fijo ya
            -- existía — si no, un alta a mitad de mes con día pasado no debe restar como atrasado.
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

-- ---------------------------------------------------------------------------------------------
-- 2. FI-10: quitar un pago que había actualizado el importe del fijo (aumento, corrección) no
--    deshacía ese cambio — quedaba en el valor nuevo aunque el pago que lo puso ya no existiera. Cada
--    pago guarda ahora el importe ANTERIOR de la plantilla, sólo cuando de verdad la actualizó (mismo
--    cuerpo que `20260923050001_hoy_del_cliente.sql`, sección 2, con esa columna de más).
-- ---------------------------------------------------------------------------------------------

alter table public.fixed_expense_payments
  add column previous_template_amount numeric(12, 2);

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
  -- FI-10: sólo un fijo "una vez al mes", pagando el mes en curso o uno futuro (un pago atrasado no
  -- puede "corregir" hacia atrás el importe vigente) — mismo criterio que ya decide si esta llamada
  -- actualiza la plantilla, ahora nombrado para reusarlo también al armar el pago.
  v_updates_template boolean;
begin
  select * into v_fe from public.fixed_expenses where id = p_fixed_expense_id and user_id = v_uid;
  if not found then
    raise exception 'fixed_expense_not_found';
  end if;

  v_amount := coalesce(p_amount, v_fe.amount);
  v_note := nullif(btrim(p_note), '');
  v_updates_template := not v_fe.is_recurring and date_trunc('month', p_period)::date >= date_trunc('month', v_today)::date;

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
  -- `previous_template_amount`: el importe de la plantilla ANTES de este pago, sólo si este pago la va
  -- a actualizar más abajo — así `rpc_unmark_fixed_expense_payment` sabe a qué volver.
  insert into public.fixed_expense_payments (
    user_id, fixed_expense_id, period, amount_paid, transaction_id, is_recurring, note, paid_at, previous_template_amount
  )
  values (
    v_uid, p_fixed_expense_id, date_trunc('month', p_period)::date, v_amount, v_tx_id, v_fe.is_recurring, v_note,
    case when p_occurred_on is null or p_occurred_on = v_today then now() else p_occurred_on + time '12:00' end,
    case when v_updates_template then v_fe.amount else null end
  )
  returning id into v_payment_id;

  if v_tx_id is not null then
    update public.transactions set fixed_expense_payment_id = v_payment_id where id = v_tx_id;
  end if;

  if v_updates_template then
    update public.fixed_expenses set amount = v_amount where id = p_fixed_expense_id and user_id = v_uid;
  end if;
end;
$$;

-- Restaura `previous_template_amount` al desmarcar — sólo si la plantilla sigue exactamente en lo que
-- este pago puso (`amount = amount_paid`): si alguien la editó después, esa edición manda y no se
-- toca nada. Mismo cuerpo que `20260923030001_desmarcar_pago_sin_movimiento.sql`, con ese restore
-- antes de borrar.
create or replace function public.rpc_unmark_fixed_expense_payment(p_payment_id uuid, p_force boolean default false)
returns void
language plpgsql
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_payment record;
  v_account_id uuid;
  v_has_tx boolean;
begin
  select * into v_payment from public.fixed_expense_payments
  where id = p_payment_id and user_id = v_uid;

  if not found then
    return;
  end if;

  if not p_force and v_payment.transaction_id is not null then
    select account_id, true into v_account_id, v_has_tx
    from public.transactions
    where id = v_payment.transaction_id and user_id = v_uid;

    if v_has_tx and v_account_id is null and exists (select 1 from public.balance_locations where user_id = v_uid) then
      raise exception 'payment_before_accounts';
    end if;
  end if;

  if v_payment.previous_template_amount is not null then
    update public.fixed_expenses
    set amount = v_payment.previous_template_amount
    where id = v_payment.fixed_expense_id and user_id = v_uid and amount = v_payment.amount_paid;
  end if;

  delete from public.transactions where id = v_payment.transaction_id and user_id = v_uid;
  delete from public.fixed_expense_payments where id = v_payment.id;
end;
$$;
