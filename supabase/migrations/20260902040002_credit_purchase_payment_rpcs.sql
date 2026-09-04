-- Marcar una compra suelta como pagada: espejo de rpc_mark_fixed_expense_paid, no de
-- rpc_mark_credit_card_paid — acá no hay nada que agrupar por categoría, una compra suelta ya tiene
-- una sola categoría y un solo monto por período. El monto sale de v_credit_installments (la misma
-- fuente que usa rpc_projected_balance), nunca de un parámetro, para no poder pagar de más o de
-- menos por error de tipeo.
create or replace function public.rpc_mark_credit_purchase_paid(p_purchase_id uuid, p_period date)
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

  -- Sin esto, una compra sin cuota en este período (ya se apagó, o el mes no llegó) intentaría
  -- crear un pago de $0 y explotaría contra el `check (amount_paid > 0)` con un error de constraint
  -- feo, no explicable. Mismo guard que rpc_mark_credit_card_paid.
  if not found then
    raise exception 'credit_purchase_period_empty';
  end if;

  -- Mismo "(n/N)" que arma rpc_mark_credit_card_paid, sólo que acá nunca hay que agrupar: una
  -- compra suelta es siempre un único ítem.
  v_description := v_item.description || case
    when v_item.installments > 1 then ' (' || v_item.installment_no::text || '/' || v_item.installments::text || ')'
    else ''
  end;

  -- is_credit_card_payment queda en su default (false) a propósito: esta compra no tiene tarjeta,
  -- así que etiquetarla iría a mostrar "· Tarjeta" en Movimientos (TransactionRow) sobre un gasto
  -- que no salió de ninguna.
  insert into public.transactions (user_id, type, amount, occurred_on, category_id, description)
  values (v_uid, 'expense', v_item.amount, current_date, v_item.category_id, left(v_description, 300))
  returning id into v_tx_id;

  insert into public.credit_purchase_payments (user_id, purchase_id, period, amount_paid, transaction_id)
  values (v_uid, p_purchase_id, date_trunc('month', p_period)::date, v_item.amount, v_tx_id);
end;
$$;

-- Desmarcar: revierte transacción + pago (idempotente si ya no está pagada).
create or replace function public.rpc_unmark_credit_purchase_paid(p_purchase_id uuid, p_period date)
returns void
language plpgsql
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_payment record;
begin
  select * into v_payment from public.credit_purchase_payments
  where purchase_id = p_purchase_id
    and period = date_trunc('month', p_period)::date
    and user_id = v_uid;

  if not found then
    return;
  end if;

  delete from public.transactions where id = v_payment.transaction_id and user_id = v_uid;
  delete from public.credit_purchase_payments where id = v_payment.id;
end;
$$;

grant execute on function public.rpc_mark_credit_purchase_paid(uuid, date) to authenticated;
grant execute on function public.rpc_unmark_credit_purchase_paid(uuid, date) to authenticated;
