-- Bloque 4 del plan de arreglo de Fijos (docs/qa/fijos.md), FI-15: una bolsa quincenal/semanal ubica
-- su carga en el sub-período (la quincena o la semana vigente) por la fecha del pago — hasta acá, con
-- `paid_at::date`, esa fecha queda en UTC. Una carga hecha un domingo después de las 21:00 (o el día
-- 15 en quincenal), hora Argentina (UTC−3), ya cruzó al día siguiente en UTC — la base la ubicaría en
-- el sub-período SIGUIENTE, mientras que el cliente (que arma la ventana con la fecha local) la sigue
-- viendo en el actual. El número grande del proyectado y el desglose de Fijos dejarían de coincidir.
--
-- La solución: una columna `paid_on date`, la fecha LOCAL que ya arma cada RPC que inserta un pago
-- (`v_date`/`v_today`, con el mismo clamp `least/greatest` contra `current_date` que ya usan desde
-- `20260923050001_hoy_del_cliente.sql`) — nunca se deriva de un timestamp con huso. `rpc_mark_fixed_
-- expense_paid` la llena al insertar, el trigger del Bloque 1 la sincroniza si se edita la fecha del
-- movimiento, y `rpc_projected_balance_range` la usa en vez de `paid_at::date` para ubicar la carga en
-- su sub-período. Espejo cliente: `statusFor` en `src/features/fixed-expenses/aggregate.ts`, que ya
-- lee `p.paid_on` en vez de derivarla de `paid_at`.
--
-- De paso, `rpc_add_fixed_expense_saving` recibe el mismo `p_today` que ya tienen las otras dos RPC de
-- esta pantalla (mismo motivo: sin esto, un guardado cargado sin `p_occurred_on` explícito usa
-- `current_date`, en UTC, para el movimiento que genera).

-- ---------------------------------------------------------------------------------------------
-- 1. La columna, con backfill — `paid_on` no puede ser NULL desde acá en adelante.
-- ---------------------------------------------------------------------------------------------

alter table public.fixed_expense_payments add column paid_on date;

-- Backfill: la fecha del movimiento si lo hay (es la fuente de verdad de "cuándo pasó" — coincide con
-- `occurred_on`, que ya viaja como date sin huso), si no la de `paid_at` convertida a hora Argentina.
update public.fixed_expense_payments fep
set paid_on = coalesce(
  (select t.occurred_on from public.transactions t where t.id = fep.transaction_id),
  (fep.paid_at at time zone 'America/Argentina/Buenos_Aires')::date
)
where paid_on is null;

alter table public.fixed_expense_payments
  alter column paid_on set not null,
  alter column paid_on set default (now() at time zone 'America/Argentina/Buenos_Aires')::date;

-- ---------------------------------------------------------------------------------------------
-- 2. `rpc_mark_fixed_expense_paid`: llena `paid_on` con `v_date` — ya es la fecha local correcta
--    (elegida a mano o "hoy" clampeado), sin tocar el resto del cuerpo (mismo que
--    `20260923090001_fijos_blindaje.sql`).
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
  v_updates_template boolean;
begin
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

  insert into public.fixed_expense_payments (
    user_id, fixed_expense_id, period, amount_paid, transaction_id, is_recurring, note, paid_at, paid_on, previous_template_amount
  )
  values (
    v_uid, p_fixed_expense_id, date_trunc('month', p_period)::date, v_amount, v_tx_id, v_fe.is_recurring, v_note,
    case when p_occurred_on is null or p_occurred_on = v_today then now() else p_occurred_on + time '12:00' end,
    v_date,
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

-- ---------------------------------------------------------------------------------------------
-- 3. `rpc_projected_balance_range`: `fep.paid_on` en vez de `fep.paid_at::date` para ubicar la carga
--    de una bolsa quincenal/semanal en su sub-período — mismo cuerpo que
--    `20260923080001_fijos_alta_y_deshacer_importe.sql`, sin más cambios.
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
-- 4. `trg_transactions_sync_linked_fixed_expense` (Bloque 1): al mover la fecha del movimiento de un
--    pago, sincroniza `paid_on` además de `paid_at` — si no, editar la fecha de una carga de bolsa
--    la ubicaría bien en el desglose del cliente (que ya usaba la fecha del movimiento) pero mal en
--    el proyectado de la base (que seguía leyendo el `paid_at` viejo).
-- ---------------------------------------------------------------------------------------------

create or replace function public.trg_transactions_sync_linked_fixed_expense()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_saving record;
  v_delta numeric;
begin
  if old.fixed_expense_payment_id is not null then
    if new.type is distinct from old.type then
      raise exception 'linked_movement_type_locked';
    end if;

    v_delta := new.amount - old.amount;
    if v_delta <> 0 then
      update public.fixed_expense_payments
      set amount_paid = amount_paid + v_delta
      where id = old.fixed_expense_payment_id
        and amount_paid + v_delta > 0;

      if not found then
        raise exception 'linked_movement_amount_invalid';
      end if;
    end if;

    -- Una bolsa quincenal/semanal ubica su carga en el sub-período por `paid_on` (`aggregate.ts`,
    -- `bag_cycle_from`/`bag_cycle_to`); un fijo "una vez al mes" no tiene sub-período, sólo `period`
    -- (el mes que se pagó), que no se toca al mover la fecha — sigue siendo el pago de ese mes.
    if new.occurred_on is distinct from old.occurred_on then
      update public.fixed_expense_payments
      set paid_at = new.occurred_on + time '12:00', paid_on = new.occurred_on
      where id = old.fixed_expense_payment_id and is_recurring;
    end if;

    return new;
  end if;

  select * into v_saving from public.fixed_expense_savings where transaction_id = old.id;
  if found then
    if new.type is distinct from old.type then
      raise exception 'linked_movement_type_locked';
    end if;

    if exists (
      select 1 from public.fixed_expense_payments
      where fixed_expense_id = v_saving.fixed_expense_id and period = v_saving.period
    ) then
      raise exception 'fixed_expense_saving_period_paid';
    end if;

    v_delta := new.amount - old.amount;
    if v_delta <> 0 then
      update public.fixed_expense_savings
      set amount = amount + v_delta
      where id = v_saving.id and amount + v_delta > 0;

      if not found then
        raise exception 'linked_movement_amount_invalid';
      end if;
    end if;
  end if;

  return new;
end;
$$;

-- ---------------------------------------------------------------------------------------------
-- 5. `rpc_add_fixed_expense_saving`: gana `p_today`, mismo criterio que las otras dos RPC de esta
--    pantalla — cambia la firma, así que va `drop` + `create` (mismo patrón que
--    `20260916010001_fixed_expense_payment_fecha.sql` para esta misma función).
-- ---------------------------------------------------------------------------------------------

drop function public.rpc_add_fixed_expense_saving(uuid, date, numeric, boolean, text, uuid, date);

create function public.rpc_add_fixed_expense_saving(
  p_fixed_expense_id uuid,
  p_period date,
  p_amount numeric,
  p_generate_movement boolean default false,
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
  v_note text;
  v_today date := least(greatest(coalesce(p_today, current_date), current_date - 1), current_date + 1);
  v_date date := coalesce(p_occurred_on, v_today);
  v_tx_id uuid;
begin
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

  insert into public.fixed_expense_savings (user_id, fixed_expense_id, period, amount, note, transaction_id)
  values (v_uid, p_fixed_expense_id, date_trunc('month', p_period)::date, p_amount, v_note, v_tx_id);
end;
$$;

grant execute on function public.rpc_add_fixed_expense_saving(uuid, date, numeric, boolean, text, uuid, date, date) to authenticated;
