-- Marcar una tarjeta como pagada: junta las cuotas del período (única fuente de verdad:
-- v_credit_installments, la misma que usa rpc_projected_balance), crea UNA transacción con el
-- total y una descripción legible, y guarda el snapshot completo en credit_card_payment_items —
-- editar o borrar una compra después no puede reescribir lo que ya se pagó.
create or replace function public.rpc_mark_credit_card_paid(
  p_card_id uuid,
  p_period date,
  p_amount numeric default null,
  p_category_id uuid default null
)
returns void
language plpgsql
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_card record;
  v_period_total numeric;
  v_amount numeric;
  v_category_id uuid;
  v_description text;
  v_tx_id uuid;
  v_payment_id uuid;
begin
  select * into v_card from public.credit_cards where id = p_card_id and user_id = v_uid;
  if not found then
    raise exception 'credit_card_not_found';
  end if;

  select coalesce(sum(i.amount), 0) into v_period_total
  from public.v_credit_installments(p_period) i
  where i.card_id = p_card_id;

  -- Sin esto, con 0 cuotas en el período se intentaría crear una transacción de $0 y explotaría
  -- contra el `check (amount > 0)` de transactions con un error de constraint feo, no explicable.
  if v_period_total = 0 then
    raise exception 'credit_card_period_empty';
  end if;

  v_amount := coalesce(p_amount, v_period_total);
  v_category_id := coalesce(p_category_id, v_card.category_id);

  -- Descripción: "{tarjeta} · {hasta 3 ítems, monto desc} y N más". El "(n/N)" sólo si la compra
  -- tiene más de una cuota — que falte ya dice "esto no vuelve el mes que viene". No se duplica
  -- este formato en el cliente: el diálogo de pago muestra las cuotas como filas reales.
  with ranked as (
    select
      i.description,
      i.installment_no,
      i.installments,
      i.amount,
      row_number() over (order by i.amount desc, i.description) as rn,
      count(*) over () as total_count
    from public.v_credit_installments(p_period) i
    where i.card_id = p_card_id
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

  insert into public.transactions (user_id, type, amount, occurred_on, category_id, description)
  values (v_uid, 'expense', v_amount, current_date, v_category_id, left(v_description, 300))
  returning id into v_tx_id;

  insert into public.credit_card_payments (user_id, card_id, period, amount_paid, transaction_id)
  values (v_uid, p_card_id, date_trunc('month', p_period)::date, v_amount, v_tx_id)
  returning id into v_payment_id;

  insert into public.credit_card_payment_items
    (user_id, payment_id, purchase_id, description, installment_no, installments, amount)
  select v_uid, v_payment_id, i.purchase_id, i.description, i.installment_no, i.installments, i.amount
  from public.v_credit_installments(p_period) i
  where i.card_id = p_card_id;
end;
$$;

-- Desmarcar: revierte transacción + pago (idempotente si ya no está pagada). Deliberadamente NO
-- toca credit_card_savings — desmarcaste porque te equivocaste, no porque gastaste los ahorros. Es
-- justamente lo que separar guardado y pago en dos tablas permite hacer sin ramas especiales.
create or replace function public.rpc_unmark_credit_card_paid(p_card_id uuid, p_period date)
returns void
language plpgsql
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_payment record;
begin
  select * into v_payment from public.credit_card_payments
  where card_id = p_card_id
    and period = date_trunc('month', p_period)::date
    and user_id = v_uid;

  if not found then
    return;
  end if;

  delete from public.transactions where id = v_payment.transaction_id and user_id = v_uid;
  delete from public.credit_card_payments where id = v_payment.id;
  -- credit_card_payment_items se va solo por el on delete cascade de payment_id.
end;
$$;

grant execute on function public.rpc_mark_credit_card_paid(uuid, date, numeric, uuid) to authenticated;
grant execute on function public.rpc_unmark_credit_card_paid(uuid, date) to authenticated;
