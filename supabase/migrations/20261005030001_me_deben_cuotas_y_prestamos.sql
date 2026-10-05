-- Rediseño de Me Deben: deudas en cuotas y movimientos siempre bajo la categoría «Préstamos».
--
-- 1. Cuotas. `receivables.amount` sigue siendo el TOTAL prestado; `installments` dice en cuántas
--    cuotas mensuales vuelve, a partir de `expected_period` (que con cuotas pasa a ser el mes de la
--    primera). La cuota se deriva en el cliente (`receivables/aggregate.ts`): `floor(total/n)` y la
--    última absorbe el resto. Los abonos no se atan a una cuota: se imputan en orden, igual que
--    "cobrada" ya se deriva de la suma de abonos. Las filas existentes quedan en 1 cuota, que es
--    exactamente su comportamiento de hoy.
--
-- 2. «Préstamos». El admin la cargó en el catálogo (una de gasto y otra de ingreso), pero el catálogo
--    sólo siembra cuentas NUEVAS: casi ninguna cuenta existente la tiene. `loan_category_id` la busca
--    por nombre en las categorías del usuario y, si no está, la crea en ese momento copiando color e
--    ícono del catálogo — sólo cuando de verdad se genera un movimiento, para no llenar de categorías
--    a quien nunca presta.
--
-- Orden de deploy: esta migración primero. Un front viejo contra esta base anda (columna con
-- default, parámetro nuevo opcional); un front nuevo contra la base vieja no.

alter table public.receivables
  add column installments smallint not null default 1 check (installments between 1 and 120),
  -- Sin mes de la primera cuota no hay forma de saber cuándo vence cada una.
  add constraint receivables_installments_need_period check (installments = 1 or expected_period is not null);

-- `security definer` sólo porque `default_categories` es de lectura exclusiva del admin. Todo lo que
-- toca de `categories` está atado a `auth.uid()`: no puede leer ni crear categorías ajenas.
create function public.loan_category_id(p_kind text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_id uuid;
  v_name text;
  v_color text;
  v_icon text;
begin
  if v_uid is null then
    raise exception 'not_authenticated';
  end if;

  if p_kind not in ('expense', 'income') then
    raise exception 'category_kind_invalid';
  end if;

  -- Por nombre normalizado: «Prestamos», «Préstamos» o «préstamos » son la misma. Una archivada
  -- vale antes que crear un duplicado.
  select c.id into v_id
  from public.categories c
  where c.user_id = v_uid
    and c.kind = p_kind
    and translate(lower(btrim(c.name)), 'áéíóú', 'aeiou') = 'prestamos'
  order by c.is_archived, c.created_at
  limit 1;

  if v_id is not null then
    return v_id;
  end if;

  select dc.name, dc.color, dc.icon into v_name, v_color, v_icon
  from public.default_categories dc
  where dc.kind = p_kind
    and not dc.is_archived
    and translate(lower(btrim(dc.name)), 'áéíóú', 'aeiou') = 'prestamos'
  order by dc.sort_order
  limit 1;

  insert into public.categories (user_id, name, kind, color, icon)
  values (v_uid, coalesce(v_name, 'Préstamos'), p_kind, coalesce(v_color, '#6B6B72'), coalesce(v_icon, 'banknote'))
  returning id into v_id;

  return v_id;
end;
$$;

revoke execute on function public.loan_category_id(text) from public, anon;
grant execute on function public.loan_category_id(text) to authenticated;

-- ---------------------------------------------------------------------------------------------
-- Alta: + `p_installments`, y el gasto (si lo hay) cae en «Préstamos». Última versión en
-- `20260904030001_cuentas_en_pagos.sql`; drop + create por el mismo motivo que ahí (PGRST203).
-- ---------------------------------------------------------------------------------------------

drop function public.rpc_create_receivable(text, numeric, date, text, boolean, numeric, uuid, date, text, uuid);

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
  p_account_id uuid default null,
  p_installments smallint default 1
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

  if p_installments is null or p_installments < 1 or p_installments > 120 then
    raise exception 'receivable_invalid_installments';
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
      coalesce(p_expense_category_id, public.loan_category_id('expense')),
      coalesce(p_expense_description, left('Préstamo a ' || p_name, 300)), p_account_id
    )
    returning id into v_tx_id;
  end if;

  insert into public.receivables (user_id, name, amount, expected_period, already_expensed, note, expense_transaction_id, installments)
  values (v_uid, p_name, p_amount, p_expected_period, p_already_expensed, p_note, v_tx_id, p_installments)
  returning id into v_receivable_id;

  return v_receivable_id;
end;
$$;

grant execute on function public.rpc_create_receivable(text, numeric, date, text, boolean, numeric, uuid, date, text, uuid, smallint) to authenticated;

-- ---------------------------------------------------------------------------------------------
-- «Registrar el gasto ahora»: misma firma, el gasto cae en «Préstamos».
-- ---------------------------------------------------------------------------------------------

create or replace function public.rpc_expense_receivable(
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
  values (v_uid, 'expense', v_pending, coalesce(p_occurred_on, current_date),
          coalesce(p_category_id, public.loan_category_id('expense')),
          left('Préstamo a ' || v_receivable.name, 300), p_account_id)
  returning id into v_tx_id;

  update public.receivables
  set already_expensed = true, expense_transaction_id = v_tx_id, updated_at = now()
  where id = p_receivable_id;
end;
$$;

-- ---------------------------------------------------------------------------------------------
-- Abono: misma firma, el ingreso (si lo hay) cae en «Préstamos». La categoría se resuelve sólo
-- dentro del `if`: un abono sin movimiento no crea ninguna categoría.
-- ---------------------------------------------------------------------------------------------

create or replace function public.rpc_register_receivable_payment(
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
    values (v_uid, 'income', p_amount, v_occurred_on,
            coalesce(p_category_id, public.loan_category_id('income')),
            left('Me devolvió ' || v_receivable.name, 300), p_account_id)
    returning id into v_tx_id;
  end if;

  insert into public.receivable_payments (user_id, receivable_id, amount, occurred_on, transaction_id)
  values (v_uid, p_receivable_id, p_amount, v_occurred_on, v_tx_id);
end;
$$;
