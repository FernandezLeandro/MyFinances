-- La categoría se muda de la tarjeta (una sola, fija) a la compra (una por ítem): permite anotar
-- "esta compra es Hogar, esta otra es Tecno" en vez de forzar todo el gasto de una tarjeta bajo una
-- sola categoría. Como un pago mensual puede juntar compras de categorías distintas y una
-- transacción sólo tiene UNA categoría, el pago deja de ser un único movimiento: ahora se genera UN
-- MOVIMIENTO POR CATEGORÍA presente ese mes (agrupando las cuotas que la comparten). Así Análisis
-- sigue reflejando bien el gasto por categoría — a costa de dejar de ser "un solo movimiento con el
-- total", que era la decisión original del feature.
alter table public.credit_cards drop column category_id;

-- Nullable, igual que fixed_expenses.category_id: la app la pide siempre en el formulario, pero a
-- nivel base no hace falta un NOT NULL que complique un backfill futuro.
alter table public.credit_purchases
  add column category_id uuid references public.categories (id) on delete set null;

-- v_credit_installments ahora también informa la categoría de cada cuota — hace falta para agrupar
-- por categoría al pagar. `create or replace` no alcanza acá: cambia el shape de `returns table`,
-- así que hay que dropear la función antes de recrearla.
drop function public.v_credit_installments(date);

create function public.v_credit_installments(p_period date)
returns table (
  card_id uuid,
  purchase_id uuid,
  description text,
  installment_no int,
  installments int,
  amount numeric,
  category_id uuid
)
language sql
stable
set search_path = public
as $$
  select
    cp.card_id,
    cp.id,
    cp.description,
    (
      (date_part('year', date_trunc('month', p_period)) - date_part('year', cp.first_period)) * 12
      + (date_part('month', date_trunc('month', p_period)) - date_part('month', cp.first_period))
    )::int + 1 as installment_no,
    cp.installments,
    cp.installment_amount,
    cp.category_id
  from public.credit_purchases cp
  where cp.user_id = auth.uid()
    and date_trunc('month', p_period)::date >= cp.first_period
    and date_trunc('month', p_period)::date < (cp.first_period + make_interval(months => cp.installments))::date
$$;

grant execute on function public.v_credit_installments(date) to authenticated;

-- credit_card_payments sigue siendo "esta tarjeta está paga este período" con UNA fila (existencia
-- = pagado) y guarda el total de TODOS los movimientos generados — pero ya no hay un único
-- transaction_id, porque ahora puede haber varios. El vínculo a cada transacción se mueve a
-- credit_card_payment_items (1 fila = 1 cuota, y ahora también sabe a qué transacción fue a parar
-- y con qué categoría se pagó — denormalizada, mismo criterio que description/installment_no: editar
-- la compra después no puede reescribir lo que ya se pagó).
alter table public.credit_card_payments drop column transaction_id;

alter table public.credit_card_payment_items
  add column category_id uuid references public.categories (id) on delete set null,
  add column transaction_id uuid references public.transactions (id) on delete set null;

-- Etiqueta interna en el movimiento: "esto vino de pagar una tarjeta". No cambia en nada cómo
-- Análisis lo agrupa — sigue entrando por su propia categoría, como cualquier gasto. Es aparte, para
-- poder distinguirlo en Movimientos. El total de "cuánto pagué en tarjetas este mes" se lee de
-- credit_card_payments.amount_paid, no de este flag.
alter table public.transactions add column is_credit_card_payment boolean not null default false;

drop function public.rpc_mark_credit_card_paid(uuid, date, numeric, uuid);

create function public.rpc_mark_credit_card_paid(p_card_id uuid, p_period date)
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

  -- Sin esto, con 0 cuotas en el período se intentaría crear un pago de $0 y explotaría contra el
  -- `check (amount_paid > 0)` con un error de constraint feo, no explicable.
  if v_period_total = 0 then
    raise exception 'credit_card_period_empty';
  end if;

  insert into public.credit_card_payments (user_id, card_id, period, amount_paid)
  values (v_uid, p_card_id, date_trunc('month', p_period)::date, v_period_total)
  returning id into v_payment_id;

  -- Snapshot de todas las cuotas del período primero, todavía sin transacción asignada.
  insert into public.credit_card_payment_items
    (user_id, payment_id, purchase_id, description, installment_no, installments, amount, category_id)
  select v_uid, v_payment_id, i.purchase_id, i.description, i.installment_no, i.installments, i.amount, i.category_id
  from public.v_credit_installments(p_period) i
  where i.card_id = p_card_id;

  -- Un movimiento por cada categoría presente ese mes, agrupando las cuotas que la comparten.
  -- `category_id is not distinct from` en vez de `=` porque una compra puede no tener categoría
  -- (nullable, ver arriba) y `null = null` nunca es verdadero en SQL.
  for v_group in
    select category_id, sum(amount) as total
    from public.credit_card_payment_items
    where payment_id = v_payment_id
    group by category_id
  loop
    -- Descripción: "{tarjeta} · {hasta 3 ítems de ESTA categoría, monto desc} y N más". El "(n/N)"
    -- sólo si la compra tiene más de una cuota — que falte ya dice "esto no vuelve el mes que viene".
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

    insert into public.transactions (user_id, type, amount, occurred_on, category_id, description, is_credit_card_payment)
    values (v_uid, 'expense', v_group.total, current_date, v_group.category_id, left(v_description, 300), true)
    returning id into v_tx_id;

    update public.credit_card_payment_items
    set transaction_id = v_tx_id
    where payment_id = v_payment_id
      and category_id is not distinct from v_group.category_id;
  end loop;
end;
$$;

-- Desmarcar: ahora borra TODAS las transacciones que este pago generó (una o varias, una por
-- categoría), no una sola. Idempotente si ya no está pagada. Deliberadamente NO toca
-- credit_card_savings — desmarcaste porque te equivocaste, no porque gastaste los ahorros.
create or replace function public.rpc_unmark_credit_card_paid(p_card_id uuid, p_period date)
returns void
language plpgsql
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_payment_id uuid;
begin
  select id into v_payment_id from public.credit_card_payments
  where card_id = p_card_id
    and period = date_trunc('month', p_period)::date
    and user_id = v_uid;

  if not found then
    return;
  end if;

  delete from public.transactions
  where user_id = v_uid
    and id in (
      select transaction_id from public.credit_card_payment_items
      where payment_id = v_payment_id and transaction_id is not null
    );

  delete from public.credit_card_payments where id = v_payment_id;
  -- credit_card_payment_items se va solo por el on delete cascade de payment_id.
end;
$$;

grant execute on function public.rpc_mark_credit_card_paid(uuid, date) to authenticated;
grant execute on function public.rpc_unmark_credit_card_paid(uuid, date) to authenticated;
