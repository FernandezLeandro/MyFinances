-- Los movimientos manuales ya pueden llevar cuenta (`transactions.account_id`, migración
-- `cuentas_y_medios_de_pago`). Esta migración le suma la misma posibilidad a los seis RPCs que
-- generan movimientos desde otras pantallas: marcar un fijo como pagado, pagar el resumen de una
-- tarjeta o una compra suelta, y las tres puntas de Me Deben (alta con gasto, "descontar", abono).
--
-- En los seis, `p_account_id uuid default null` va AL FINAL de la firma y default null: las
-- llamadas existentes (una pestaña vieja, o cualquier código que no lo mande) siguen funcionando
-- exactamente igual que hoy — el movimiento nace "Sin asignar", como todo el historial anterior.
--
-- Postgres identifica una función por (nombre, tipos de argumento): `create or replace` con un
-- parámetro nuevo crea una sobrecarga al lado de la vieja en vez de reemplazarla, y una llamada de
-- PostgREST con argumentos nombrados que matchee ambas falla con PGRST203. Por eso cada una de estas
-- seis va con `drop function` explícito antes de `create` — mismo patrón que ya establecieron
-- `fixed_expense_paid_amount`, `credit_purchase_categories` y `deudas_flujo_movimientos`.

-- ---------------------------------------------------------------------------------------------
-- 1. Fijos
-- ---------------------------------------------------------------------------------------------

drop function public.rpc_mark_fixed_expense_paid(uuid, date, numeric, text);

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
begin
  select * into v_fe from public.fixed_expenses where id = p_fixed_expense_id and user_id = v_uid;
  if not found then
    raise exception 'fixed_expense_not_found';
  end if;

  v_amount := coalesce(p_amount, v_fe.amount);
  v_note := nullif(btrim(p_note), '');

  insert into public.transactions (user_id, type, amount, occurred_on, category_id, description, account_id)
  values (v_uid, 'expense', v_amount, current_date, v_fe.category_id, coalesce(v_note, v_fe.name), p_account_id)
  returning id into v_tx_id;

  insert into public.fixed_expense_payments (user_id, fixed_expense_id, period, amount_paid, transaction_id, is_recurring, note)
  values (v_uid, p_fixed_expense_id, date_trunc('month', p_period)::date, v_amount, v_tx_id, v_fe.is_recurring, v_note)
  returning id into v_payment_id;

  update public.transactions set fixed_expense_payment_id = v_payment_id where id = v_tx_id;

  if not v_fe.is_recurring and date_trunc('month', p_period)::date >= date_trunc('month', current_date)::date then
    update public.fixed_expenses set amount = v_amount where id = p_fixed_expense_id and user_id = v_uid;
  end if;
end;
$$;

grant execute on function public.rpc_mark_fixed_expense_paid(uuid, date, numeric, text, uuid) to authenticated;

-- ---------------------------------------------------------------------------------------------
-- 2. Tarjetas de crédito — un movimiento por categoría, TODOS a la misma cuenta: pagás el resumen
--    entero de una sola vez, no tiene sentido pedir una cuenta distinta por categoría.
-- ---------------------------------------------------------------------------------------------

drop function public.rpc_mark_credit_card_paid(uuid, date);

create function public.rpc_mark_credit_card_paid(p_card_id uuid, p_period date, p_account_id uuid default null)
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
    values (v_uid, 'expense', v_group.total, current_date, v_group.category_id, left(v_description, 300), true, p_account_id)
    returning id into v_tx_id;

    update public.credit_card_payment_items
    set transaction_id = v_tx_id
    where payment_id = v_payment_id
      and category_id is not distinct from v_group.category_id;
  end loop;
end;
$$;

grant execute on function public.rpc_mark_credit_card_paid(uuid, date, uuid) to authenticated;

-- ---------------------------------------------------------------------------------------------
-- 3. Compras a crédito sueltas
-- ---------------------------------------------------------------------------------------------

drop function public.rpc_mark_credit_purchase_paid(uuid, date);

create function public.rpc_mark_credit_purchase_paid(p_purchase_id uuid, p_period date, p_account_id uuid default null)
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
  values (v_uid, 'expense', v_item.amount, current_date, v_item.category_id, left(v_description, 300), p_account_id)
  returning id into v_tx_id;

  insert into public.credit_purchase_payments (user_id, purchase_id, period, amount_paid, transaction_id)
  values (v_uid, p_purchase_id, date_trunc('month', p_period)::date, v_item.amount, v_tx_id);
end;
$$;

grant execute on function public.rpc_mark_credit_purchase_paid(uuid, date, uuid) to authenticated;

-- ---------------------------------------------------------------------------------------------
-- 4. Me Deben — alta con gasto opcional
-- ---------------------------------------------------------------------------------------------

drop function public.rpc_create_receivable(text, numeric, date, text, boolean, numeric, uuid, date, text);

create function public.rpc_create_receivable(
  p_name text,
  p_amount numeric,
  p_expected_period date default null,
  p_note text default null,
  p_already_expensed boolean default false,
  p_expense_amount numeric default null,
  p_expense_category_id uuid default null,
  p_expense_occurred_on date default null,
  p_expense_description text default null,
  p_account_id uuid default null
)
returns uuid
language plpgsql
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_tx_id uuid;
  v_receivable_id uuid;
begin
  if p_amount is null or p_amount <= 0 then
    raise exception 'receivable_invalid_amount';
  end if;

  if p_expense_amount is not null then
    if p_expense_amount <= 0 then
      raise exception 'receivable_invalid_amount';
    end if;
    if p_already_expensed and p_expense_amount <> p_amount then
      raise exception 'receivable_expense_mismatch';
    end if;

    insert into public.transactions (user_id, type, amount, occurred_on, category_id, description, account_id)
    values (
      v_uid, 'expense', p_expense_amount, coalesce(p_expense_occurred_on, current_date),
      p_expense_category_id, p_expense_description, p_account_id
    )
    returning id into v_tx_id;
  end if;

  insert into public.receivables (user_id, name, amount, expected_period, already_expensed, note, expense_transaction_id)
  values (v_uid, p_name, p_amount, p_expected_period, p_already_expensed, p_note, v_tx_id)
  returning id into v_receivable_id;

  return v_receivable_id;
end;
$$;

grant execute on function public.rpc_create_receivable(text, numeric, date, text, boolean, numeric, uuid, date, text, uuid) to authenticated;

-- ---------------------------------------------------------------------------------------------
-- 5. Me Deben — "descontala ahora"
-- ---------------------------------------------------------------------------------------------

drop function public.rpc_expense_receivable(uuid, uuid, date);

create function public.rpc_expense_receivable(
  p_receivable_id uuid,
  p_category_id uuid default null,
  p_occurred_on date default null,
  p_account_id uuid default null
)
returns void
language plpgsql
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_receivable record;
  v_paid numeric;
  v_pending numeric;
  v_tx_id uuid;
begin
  select * into v_receivable from public.receivables where id = p_receivable_id and user_id = v_uid;
  if not found then
    raise exception 'receivable_not_found';
  end if;

  if v_receivable.already_expensed then
    raise exception 'receivable_already_expensed';
  end if;

  select coalesce(sum(amount), 0) into v_paid
  from public.receivable_payments where receivable_id = p_receivable_id and user_id = v_uid;

  v_pending := greatest(v_receivable.amount - v_paid, 0);
  if v_pending <= 0 then
    raise exception 'receivable_nothing_pending';
  end if;

  insert into public.transactions (user_id, type, amount, occurred_on, category_id, description, account_id)
  values (v_uid, 'expense', v_pending, coalesce(p_occurred_on, current_date), p_category_id,
          left('Descontado: ' || v_receivable.name, 300), p_account_id)
  returning id into v_tx_id;

  update public.receivables
  set already_expensed = true, expense_transaction_id = v_tx_id, updated_at = now()
  where id = p_receivable_id;
end;
$$;

grant execute on function public.rpc_expense_receivable(uuid, uuid, date, uuid) to authenticated;

-- ---------------------------------------------------------------------------------------------
-- 6. Me Deben — abono (acá `p_account_id` es dónde ENTRÓ la plata cobrada, no de dónde salió)
-- ---------------------------------------------------------------------------------------------

drop function public.rpc_register_receivable_payment(uuid, numeric, date, uuid, boolean);

create function public.rpc_register_receivable_payment(
  p_receivable_id uuid,
  p_amount numeric,
  p_occurred_on date default null,
  p_category_id uuid default null,
  p_create_income boolean default null,
  p_account_id uuid default null
)
returns void
language plpgsql
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_receivable record;
  v_occurred_on date := coalesce(p_occurred_on, current_date);
  v_tx_id uuid;
  v_create_income boolean;
begin
  select * into v_receivable from public.receivables where id = p_receivable_id and user_id = v_uid;
  if not found then
    raise exception 'receivable_not_found';
  end if;

  if p_amount is null or p_amount <= 0 then
    raise exception 'receivable_payment_invalid_amount';
  end if;

  v_create_income := coalesce(p_create_income, v_receivable.already_expensed);

  if v_create_income then
    insert into public.transactions (user_id, type, amount, occurred_on, category_id, description, account_id)
    values (v_uid, 'income', p_amount, v_occurred_on, p_category_id,
            left('Me devolvió ' || v_receivable.name, 300), p_account_id)
    returning id into v_tx_id;
  end if;

  insert into public.receivable_payments (user_id, receivable_id, amount, occurred_on, transaction_id)
  values (v_uid, p_receivable_id, p_amount, v_occurred_on, v_tx_id);
end;
$$;

grant execute on function public.rpc_register_receivable_payment(uuid, numeric, date, uuid, boolean, uuid) to authenticated;
