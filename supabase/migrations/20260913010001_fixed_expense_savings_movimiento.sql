-- Follow-up del Bloque 3 (`fixed_expense_savings`): "guardar para un fijo" pasó a poder generar un
-- movimiento real (opcional, decisión del usuario al guardar) en vez de ser siempre un aparte que no
-- afecta el saldo. Motivo: el diálogo de guardado es compartido por todos los planes, y en Premium
-- (que sí controla movimientos manuales) no tenía sentido que guardar plata para un fijo no la
-- descontara de ningún lado — sólo BASIC (sin `movimientos-manuales`) necesita que sea un aparte
-- puramente informativo.
--
-- `transaction_id` (nullable): `null` es un guardado "aparte" (como hasta ahora, siempre el caso en
-- BASIC); con valor, es un guardado que además generó un gasto real. `on delete cascade`: si el
-- movimiento se borra desde Movimientos, el guardado que lo originó ya no tiene sentido — se va con
-- él (a diferencia de `fixed_expense_payments.transaction_id`, que es `set null`, porque ahí el pago
-- en sí sigue siendo información válida sin su movimiento).
alter table public.fixed_expense_savings
  add column transaction_id uuid references public.transactions (id) on delete cascade;

-- ---------------------------------------------------------------------------------------------
-- 1. Guardar (con o sin movimiento) — pasa de insert directo a RPC porque ahora son dos escrituras
--    (transacción + guardado) que tienen que ser atómicas.
-- ---------------------------------------------------------------------------------------------

create function public.rpc_add_fixed_expense_saving(
  p_fixed_expense_id uuid,
  p_period date,
  p_amount numeric,
  p_generate_movement boolean default false,
  p_note text default null,
  p_account_id uuid default null
)
returns void
language plpgsql
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_fe record;
  v_note text;
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
    values (v_uid, 'expense', p_amount, current_date, v_fe.category_id, coalesce(v_note, 'Guardado · ' || v_fe.name), p_account_id)
    returning id into v_tx_id;
  end if;

  insert into public.fixed_expense_savings (user_id, fixed_expense_id, period, amount, note, transaction_id)
  values (v_uid, p_fixed_expense_id, date_trunc('month', p_period)::date, p_amount, v_note, v_tx_id);
end;
$$;

grant execute on function public.rpc_add_fixed_expense_saving(uuid, date, numeric, boolean, text, uuid) to authenticated;

-- ---------------------------------------------------------------------------------------------
-- 2. Quitar un guardado — si tiene movimiento, hay que borrarlo también (el cascade se lleva la fila
--    de guardado sola, no alcanza con eso: hay que pedir el delete de la transacción explícitamente).
--    Si el fijo ya está pagado en ese período, no se puede tocar: el pago pudo haberse calculado
--    restando este guardado, y sacarlo dejaría el saldo desincronizado — hay que desmarcar el pago
--    primero (`rpc_unmark_fixed_expense_payment`).
-- ---------------------------------------------------------------------------------------------

create function public.rpc_remove_fixed_expense_saving(p_saving_id uuid)
returns void
language plpgsql
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_saving record;
begin
  select * into v_saving from public.fixed_expense_savings where id = p_saving_id and user_id = v_uid;
  if not found then
    return;
  end if;

  if exists (
    select 1 from public.fixed_expense_payments
    where fixed_expense_id = v_saving.fixed_expense_id and period = v_saving.period
  ) then
    raise exception 'fixed_expense_saving_period_paid';
  end if;

  if v_saving.transaction_id is not null then
    delete from public.transactions where id = v_saving.transaction_id and user_id = v_uid;
  else
    delete from public.fixed_expense_savings where id = v_saving.id;
  end if;
end;
$$;

grant execute on function public.rpc_remove_fixed_expense_saving(uuid) to authenticated;

-- ---------------------------------------------------------------------------------------------
-- 3. Pagar un fijo de una sola vez: si ya se guardó CON movimiento, esa plata ya salió del saldo —
--    el movimiento del pago tiene que ser sólo por lo que falta (o ninguno, si ya se cubrió todo). Un
--    guardado SIN movimiento (el único caso en BASIC) no descuenta nada acá: nunca afectó el saldo.
--    Una bolsa no tiene guardados (`is_recurring` los ignora, ver `aggregate.ts`), así que ese caso
--    queda intacto.
-- ---------------------------------------------------------------------------------------------

drop function public.rpc_mark_fixed_expense_paid(uuid, date, numeric, text, uuid);

create function public.rpc_mark_fixed_expense_paid(
  p_fixed_expense_id uuid,
  p_period date,
  p_amount numeric default null,
  p_note text default null,
  p_account_id uuid default null
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
    values (v_uid, 'expense', v_tx_amount, current_date, v_fe.category_id, coalesce(v_note, v_fe.name), p_account_id)
    returning id into v_tx_id;
  end if;

  -- `amount_paid` guarda el importe completo del fijo (no sólo lo que generó movimiento acá): es lo
  -- que muestra el historial y lo que decide si la plantilla se actualiza, sin importar cuánto de eso
  -- ya se había descontado guardando antes.
  insert into public.fixed_expense_payments (user_id, fixed_expense_id, period, amount_paid, transaction_id, is_recurring, note)
  values (v_uid, p_fixed_expense_id, date_trunc('month', p_period)::date, v_amount, v_tx_id, v_fe.is_recurring, v_note)
  returning id into v_payment_id;

  if v_tx_id is not null then
    update public.transactions set fixed_expense_payment_id = v_payment_id where id = v_tx_id;
  end if;

  if not v_fe.is_recurring and date_trunc('month', p_period)::date >= date_trunc('month', current_date)::date then
    update public.fixed_expenses set amount = v_amount where id = p_fixed_expense_id and user_id = v_uid;
  end if;
end;
$$;

grant execute on function public.rpc_mark_fixed_expense_paid(uuid, date, numeric, text, uuid) to authenticated;

-- ---------------------------------------------------------------------------------------------
-- 4. `rpc_projected_balance_range` (última versión: `20260912010001_drop_fixed_expense_ends_on.sql`)
--    — un fijo de una sola vez impago ahora resta `amount - guardado_con_movimiento`, no `amount`
--    entero: esa plata ya salió del saldo real al guardarla, restar el total de nuevo la contaría dos
--    veces. Guardado SIN movimiento no cambia nada acá (nunca tocó el saldo real).
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
