-- Mis Deudas: el guardado pasa a ser por compra, con movimiento opcional — mismo modelo que los
-- guardados de Fijos (`fixed_expense_savings`, `rpc_add_fixed_expense_saving`, `rpc_mark_fixed_expense_paid`).
--
-- Hasta acá, el guardado era UN monto por tarjeta y mes (`credit_card_savings`, un upsert): nunca
-- generaba movimiento, ninguna RPC lo leía, y marcar pagada la tarjeta generaba siempre el total. Ahora:
--
--   * se guarda sobre una compra puntual (con o sin tarjeta), y cada aporte puede generar un gasto —
--     con la categoría de la compra, así Análisis sigue exacto;
--   * pagar genera, por categoría, sólo lo que falta: cuota − lo guardado CON movimiento en cada
--     compra (un guardado "aparte" no salió de ningún lado todavía, no descuenta). Una categoría ya
--     cubierta no genera movimiento;
--   * el proyectado descuenta lo mismo, para no restar dos veces la plata que ya salió;
--   * el día de vencimiento es opcional en tarjetas y compras sueltas.
--
-- Compatible con el front anterior: las firmas no cambian y `credit_card_savings` sigue existiendo
-- hasta `20261005020001_drop_credit_card_savings.sql` (que se aplica DESPUÉS del deploy).

-- ---------------------------------------------------------------------------------------------
-- 1. Tabla. Aportes por compra y mes, no un único monto. Sólo `select` directo: la escritura va por
--    RPC (mismo criterio que `fixed_expense_savings` desde `20260924010001_fijos_pagos_solo_por_rpc.sql`
--    y `fixed_expense_period_amounts`): un insert directo podría apuntar a la compra o al movimiento de
--    otra cuenta (la FK no mira el dueño).
-- ---------------------------------------------------------------------------------------------

create table public.credit_savings (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  purchase_id uuid not null references public.credit_purchases (id) on delete cascade,
  period date not null check (period = date_trunc('month', period)::date),
  amount numeric(12, 2) not null check (amount > 0),
  -- `null` = guardado "aparte" (no salió del saldo). Borrar el movimiento desde Movimientos se lleva
  -- el guardado con él, igual que en Fijos.
  transaction_id uuid references public.transactions (id) on delete cascade,
  saved_at timestamptz not null default now()
);

create index credit_savings_purchase_period_idx on public.credit_savings (purchase_id, period);
create index credit_savings_transaction_idx on public.credit_savings (transaction_id) where transaction_id is not null;

alter table public.credit_savings enable row level security;

create policy "credit_savings_select_own" on public.credit_savings
  for select using (user_id = auth.uid());

grant select on public.credit_savings to authenticated;

-- ---------------------------------------------------------------------------------------------
-- 2. ¿El período de esta compra ya está pagado? Una compra con tarjeta se paga con la tarjeta entera
--    (`credit_card_payments`); una suelta, por su cuenta (`credit_purchase_payments`). Lo usan las
--    RPC y los triggers de abajo — un guardado de un período pagado no se agrega, ni se quita, ni se
--    edita (mismo criterio que `fixed_expense_saving_period_paid`).
-- ---------------------------------------------------------------------------------------------

create function public.credit_purchase_period_paid(p_purchase_id uuid, p_period date)
returns boolean
language sql
stable
set search_path = public
as $$
  select exists (
    select 1 from public.credit_purchases cp
    where cp.id = p_purchase_id
      and (
        (cp.card_id is not null and exists (
          select 1 from public.credit_card_payments p
          where p.card_id = cp.card_id and p.period = date_trunc('month', p_period)::date
        ))
        or (cp.card_id is null and exists (
          select 1 from public.credit_purchase_payments p
          where p.purchase_id = cp.id and p.period = date_trunc('month', p_period)::date
        ))
      )
  )
$$;

-- Lo guardado CON movimiento para la cuota de una compra en un período: esa plata ya salió del saldo,
-- así que el pago y el proyectado la descuentan. Un guardado "aparte" no cuenta acá.
create function public.credit_saving_moved(p_purchase_id uuid, p_period date)
returns numeric
language sql
stable
set search_path = public
as $$
  select coalesce(sum(amount), 0)
  from public.credit_savings
  where purchase_id = p_purchase_id
    and period = date_trunc('month', p_period)::date
    and transaction_id is not null
$$;

-- ---------------------------------------------------------------------------------------------
-- 3. Guardar / quitar un guardado. Espejo de `rpc_add_fixed_expense_saving` /
--    `rpc_remove_fixed_expense_saving` (`20260924010001_fijos_pagos_solo_por_rpc.sql`).
-- ---------------------------------------------------------------------------------------------

create function public.rpc_add_credit_saving(
  p_purchase_id uuid,
  p_period date,
  p_amount numeric,
  p_generate_movement boolean default false,
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
  v_purchase record;
  v_item record;
  v_period date := date_trunc('month', p_period)::date;
  v_today date := least(greatest(coalesce(p_today, current_date), current_date - 1), current_date + 1);
  v_tx_id uuid;
begin
  if v_uid is null then
    raise exception 'not_authenticated';
  end if;

  select * into v_purchase from public.credit_purchases where id = p_purchase_id and user_id = v_uid;
  if not found then
    raise exception 'credit_purchase_not_found';
  end if;

  if p_amount is null or p_amount <= 0 then
    raise exception 'credit_saving_invalid_amount';
  end if;

  select * into v_item from public.v_credit_installments(v_period) where purchase_id = p_purchase_id;
  if not found then
    raise exception 'credit_purchase_period_empty';
  end if;

  if public.credit_purchase_period_paid(p_purchase_id, v_period) then
    raise exception 'credit_saving_period_paid';
  end if;

  if p_generate_movement then
    -- `is_credit_card_payment` en una compra con tarjeta: Movimientos la etiqueta «· Tarjeta» y
    -- Análisis la cuenta como comprometida, igual que el pago de la tarjeta que la completa.
    insert into public.transactions (user_id, type, amount, occurred_on, category_id, description, is_credit_card_payment, account_id)
    values (
      v_uid,
      'expense',
      p_amount,
      coalesce(p_occurred_on, v_today),
      v_item.category_id,
      left('Guardado · ' || v_item.description || case
        when v_item.installments > 1 then ' (' || v_item.installment_no::text || '/' || v_item.installments::text || ')'
        else ''
      end, 300),
      v_purchase.card_id is not null,
      p_account_id
    )
    returning id into v_tx_id;
  end if;

  insert into public.credit_savings (user_id, purchase_id, period, amount, transaction_id)
  values (v_uid, p_purchase_id, v_period, p_amount, v_tx_id);
end;
$$;

grant execute on function public.rpc_add_credit_saving(uuid, date, numeric, boolean, uuid, date, date) to authenticated;

create function public.rpc_remove_credit_saving(p_saving_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_saving record;
begin
  if v_uid is null then
    raise exception 'not_authenticated';
  end if;

  select * into v_saving from public.credit_savings where id = p_saving_id and user_id = v_uid;
  if not found then
    return;
  end if;

  if public.credit_purchase_period_paid(v_saving.purchase_id, v_saving.period) then
    raise exception 'credit_saving_period_paid';
  end if;

  if v_saving.transaction_id is not null then
    -- El guardado se va solo por el `on delete cascade` de `transaction_id`.
    delete from public.transactions where id = v_saving.transaction_id and user_id = v_uid;
  else
    delete from public.credit_savings where id = v_saving.id;
  end if;
end;
$$;

grant execute on function public.rpc_remove_credit_saving(uuid) to authenticated;

-- ---------------------------------------------------------------------------------------------
-- 4. Pagar una tarjeta: mismo cuerpo que `20260923050001_hoy_del_cliente.sql` (misma firma y misma
--    descripción, un movimiento por categoría), mirando cada compra por lo que le falta: cuota −
--    guardado con movimiento. Una compra ya cubierta no suma ni aparece en la descripción; una
--    categoría sin nada que pagar no genera movimiento. `amount_paid` y los ítems siguen guardando el
--    total completo, igual que `fixed_expense_payments`.
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
      select greatest(item.amount - public.credit_saving_moved(item.purchase_id, v_period), 0) as amount
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
        select greatest(item.amount - public.credit_saving_moved(item.purchase_id, v_period), 0) as amount
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

-- ---------------------------------------------------------------------------------------------
-- 5. Pagar la cuota de una compra suelta: mismo cuerpo que `20260923050001_hoy_del_cliente.sql`,
--    por lo restante (cuota − guardado con movimiento). Si ya está todo cubierto no hay movimiento:
--    `credit_purchase_payments.transaction_id` queda en `null` (`rpc_unmark_credit_purchase_paid` ya
--    lo tolera), y `amount_paid` sigue siendo la cuota completa.
-- ---------------------------------------------------------------------------------------------

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

  v_amount := greatest(v_item.amount - public.credit_saving_moved(p_purchase_id, v_period), 0);

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
-- 6. `rpc_projected_balance_range`: mismo cuerpo que `20260930010001_fijos_importe_por_mes.sql`
--    (misma firma). Sólo cambia el término de deudas: cada cuota impaga resta lo que falta salir
--    (cuota − guardado con movimiento), igual que el término de fijos — esa plata ya salió del saldo
--    actual, restarla de nuevo la contaba dos veces. Una cuota sin día de vencimiento cae a fin de
--    mes (`due_date_in_month(m, null)` devuelve el último día, ver `20260911030001`).
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
        select sum(greatest(vci.amount - public.credit_saving_moved(vci.purchase_id, vci.period), 0))
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
-- 7. Vencimiento opcional. Sin día, la cuota cuenta a fin de mes (ver el punto 6).
-- ---------------------------------------------------------------------------------------------

alter table public.credit_cards alter column due_day drop not null;
alter table public.credit_purchases drop constraint credit_purchases_card_or_due_day;

-- ---------------------------------------------------------------------------------------------
-- 8. El movimiento de un guardado editado/borrado desde Movimientos — mismo blindaje que el de un
--    guardado de Fijos (Bloque 1 del QA de Fijos): el tipo no cambia, el importe se sincroniza con el
--    guardado, y nada se toca si el período ya está pagado.
-- ---------------------------------------------------------------------------------------------

-- Mismo cuerpo que `20260924020001_movimientos_referencias_propias.sql`, con el bloque de
-- `credit_savings` al final.
create or replace function public.trg_transactions_sync_linked_fixed_expense()
returns trigger
language plpgsql
security definer
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
        and user_id = old.user_id
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
      where id = old.fixed_expense_payment_id and user_id = old.user_id and is_recurring;
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
      where id = v_saving.id and user_id = old.user_id and amount + v_delta > 0;

      if not found then
        raise exception 'linked_movement_amount_invalid';
      end if;
    end if;

    return new;
  end if;

  select * into v_saving from public.credit_savings where transaction_id = old.id;
  if found then
    if new.type is distinct from old.type then
      raise exception 'linked_movement_type_locked';
    end if;

    if public.credit_purchase_period_paid(v_saving.purchase_id, v_saving.period) then
      raise exception 'credit_saving_period_paid';
    end if;

    v_delta := new.amount - old.amount;
    if v_delta <> 0 then
      update public.credit_savings
      set amount = amount + v_delta
      where id = v_saving.id and user_id = old.user_id and amount + v_delta > 0;

      if not found then
        raise exception 'linked_movement_amount_invalid';
      end if;
    end if;
  end if;

  return new;
end;
$$;

-- Mismo cuerpo que `20260923070001_fijos_movimiento_vinculado.sql`, con el chequeo de `credit_savings`.
-- `auth.uid()` distinto del dueño = baja del usuario desde el admin (cascada): ahí no se frena nada,
-- mismo criterio que `trg_transactions_block_delete_linked`.
create or replace function public.trg_transactions_block_delete_paid_saving()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_saving record;
begin
  select * into v_saving from public.fixed_expense_savings where transaction_id = old.id;
  if found and exists (
    select 1 from public.fixed_expense_payments
    where fixed_expense_id = v_saving.fixed_expense_id and period = v_saving.period
  ) then
    raise exception 'fixed_expense_saving_period_paid';
  end if;

  if auth.uid() is not distinct from old.user_id and exists (
    select 1 from public.credit_savings cs
    where cs.transaction_id = old.id and public.credit_purchase_period_paid(cs.purchase_id, cs.period)
  ) then
    raise exception 'credit_saving_period_paid';
  end if;

  return old;
end;
$$;

-- ---------------------------------------------------------------------------------------------
-- 9. `rpc_delete_account`: mismo cuerpo que `20260924040001_movimientos_vinculados.sql`, con el
--    guardado de una deuda tratado igual que el de un fijo — sobrevive como guardado "aparte" en vez
--    de irse en cascada con el movimiento de la cuenta que se borra (y sin que el freno del punto 8
--    trabe la baja de la cuenta si el período ya está pagado).
-- ---------------------------------------------------------------------------------------------

create or replace function public.rpc_delete_account(p_account_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_was_default boolean;
  v_is_archived boolean;
begin
  if v_uid is null then
    raise exception 'not_authenticated';
  end if;

  select is_default, is_archived into v_was_default, v_is_archived
  from public.balance_locations
  where id = p_account_id and user_id = v_uid
  for update;
  if not found then
    raise exception 'account_not_found';
  end if;

  perform pg_advisory_xact_lock(hashtextextended('balance_locations:' || v_uid::text, 0));

  if not v_is_archived and not exists (
    select 1 from public.balance_locations
    where user_id = v_uid and not is_archived and id <> p_account_id
  ) then
    raise exception 'account_last_active';
  end if;

  with gone as (
    delete from public.account_transfers
    where user_id = v_uid and (from_account_id = p_account_id or to_account_id = p_account_id)
    returning from_account_id, to_account_id, amount
  ), net as (
    select
      case when from_account_id = p_account_id then to_account_id else from_account_id end as other_id,
      sum(case when from_account_id = p_account_id then amount else -amount end) as delta
    from gone
    group by 1
  )
  update public.balance_locations a
  set opening_amount = a.opening_amount + net.delta, updated_at = now()
  from net
  where a.id = net.other_id and a.user_id = v_uid and net.delta <> 0;

  update public.transactions
  set fixed_expense_payment_id = null
  where account_id = p_account_id and user_id = v_uid and fixed_expense_payment_id is not null;

  insert into public.fixed_expense_savings (user_id, fixed_expense_id, period, amount, saved_at, note, transaction_id)
  select s.user_id, s.fixed_expense_id, s.period, s.amount, s.saved_at, s.note, null
  from public.fixed_expense_savings s
  where s.user_id = v_uid
    and s.transaction_id in (
      select t.id from public.transactions t where t.account_id = p_account_id and t.user_id = v_uid
    );

  delete from public.fixed_expense_savings
  where user_id = v_uid
    and transaction_id in (
      select t.id from public.transactions t where t.account_id = p_account_id and t.user_id = v_uid
    );

  update public.credit_savings
  set transaction_id = null
  where user_id = v_uid
    and transaction_id in (
      select t.id from public.transactions t where t.account_id = p_account_id and t.user_id = v_uid
    );

  perform set_config('app.linked_delete_ok', 'on', true);
  delete from public.transactions where account_id = p_account_id and user_id = v_uid;
  delete from public.balance_locations where id = p_account_id and user_id = v_uid;

  if v_was_default and not exists (select 1 from public.balance_locations where user_id = v_uid and is_default) then
    update public.balance_locations
    set is_default = true, updated_at = now()
    where id = (
      select id from public.balance_locations
      where user_id = v_uid and not is_archived
      order by created_at, id
      limit 1
    );
  end if;
end;
$$;

-- ---------------------------------------------------------------------------------------------
-- 10. `rpc_transaction_origin`: mismo cuerpo que `20260924030001_movimientos_origen.sql`, con
--     `credit_saving` después de `fixed_saving` — Movimientos le bloquea el tipo y explica el vínculo.
-- ---------------------------------------------------------------------------------------------

create or replace function public.rpc_transaction_origin(p_transaction_id uuid)
returns jsonb
language plpgsql
stable
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_tx record;
  v_result jsonb;
begin
  if v_uid is null then
    raise exception 'not_authenticated';
  end if;

  select * into v_tx from public.transactions where id = p_transaction_id and user_id = v_uid;
  if not found then
    return jsonb_build_object('kind', 'plain');
  end if;

  if v_tx.fixed_expense_payment_id is not null then
    return jsonb_build_object('kind', 'fixed_payment');
  end if;

  if exists (select 1 from public.fixed_expense_savings where transaction_id = v_tx.id) then
    return jsonb_build_object('kind', 'fixed_saving');
  end if;

  select jsonb_build_object('kind', 'credit_saving', 'purchaseDescription', cp.description)
  into v_result
  from public.credit_savings cs
  join public.credit_purchases cp on cp.id = cs.purchase_id
  where cs.transaction_id = v_tx.id
  limit 1;

  if v_result is not null then
    return v_result;
  end if;

  -- Pago de tarjeta: un período puede generar VARIOS movimientos (uno por categoría presente ese
  -- mes, ver `rpc_mark_credit_card_paid`) — `movementCount`/`totalCents` describen el período
  -- ENTERO, no sólo este ítem, porque `rpc_unmark_credit_card_paid` deshace todos a la vez.
  select jsonb_build_object(
    'kind', 'card_payment',
    'cardId', cc.id,
    'cardName', cc.name,
    'period', to_char(ccp.period, 'YYYY-MM-DD'),
    'movementCount', cnt.movement_count,
    'totalCents', round(ccp.amount_paid * 100)
  )
  into v_result
  from public.credit_card_payment_items item
  join public.credit_card_payments ccp on ccp.id = item.payment_id
  join public.credit_cards cc on cc.id = ccp.card_id
  cross join lateral (
    select count(distinct i2.transaction_id) as movement_count
    from public.credit_card_payment_items i2
    where i2.payment_id = item.payment_id and i2.transaction_id is not null
  ) cnt
  where item.transaction_id = v_tx.id
  limit 1;

  if v_result is not null then
    return v_result;
  end if;

  select jsonb_build_object(
    'kind', 'installment',
    'purchaseId', cpu.id,
    'purchaseDescription', cpu.description,
    'period', to_char(cpp.period, 'YYYY-MM-DD')
  )
  into v_result
  from public.credit_purchase_payments cpp
  join public.credit_purchases cpu on cpu.id = cpp.purchase_id
  where cpp.transaction_id = v_tx.id
  limit 1;

  if v_result is not null then
    return v_result;
  end if;

  -- `receivable_expensed` ("Descontado: X", `already_expensed`) vs. `receivable_share` (tu parte de
  -- un gasto compartido, `rpc_create_receivable` sin `already_expensed`): mismo vínculo
  -- (`expense_transaction_id`), el flag decide cuál de los dos textos/reglas aplica.
  select jsonb_build_object(
    'kind', case when r.already_expensed then 'receivable_expensed' else 'receivable_share' end,
    'receivableId', r.id,
    'personName', r.name
  )
  into v_result
  from public.receivables r
  where r.expense_transaction_id = v_tx.id
  limit 1;

  if v_result is not null then
    return v_result;
  end if;

  select jsonb_build_object('kind', 'receivable_payment', 'paymentId', rp.id, 'personName', r.name)
  into v_result
  from public.receivable_payments rp
  join public.receivables r on r.id = rp.receivable_id
  where rp.transaction_id = v_tx.id
  limit 1;

  if v_result is not null then
    return v_result;
  end if;

  if v_tx.is_adjustment then
    return jsonb_build_object('kind', 'adjustment');
  end if;

  return jsonb_build_object('kind', 'plain');
end;
$$;
