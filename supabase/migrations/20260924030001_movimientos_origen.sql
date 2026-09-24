-- Bloque 2 del arreglo de Movimientos (docs/qa/movimientos.md): antes de poder frenar o avisar nada,
-- el form necesita saber DE DÓNDE viene un movimiento. `rpc_transaction_origin` es la única consulta
-- que hace esa pregunta — reemplaza a `useFixedExpenseSavingByTransaction` (que sólo cubría fijos) y
-- deja lista la información para los Bloques 3-5 (confirmar con el copy correcto, bloquear importe/
-- tipo, y decidir qué ve Básico).
--
-- `security invoker` (el default: no se declara `security definer`) — corre con los permisos de quien
-- llama, así que las policies de cada tabla (`select ... using (user_id = auth.uid())`) ya alcanzan;
-- el filtro explícito sobre `transactions` es sólo para devolver `plain` en vez de un error si el id
-- no es propio (o no existe), en vez de dejar que la fila simplemente no aparezca.

create function public.rpc_transaction_origin(p_transaction_id uuid)
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

grant execute on function public.rpc_transaction_origin(uuid) to authenticated;
