-- Deudas a favor: registrar el movimiento en el mismo paso.
--
-- Hasta acá `already_expensed` era una pregunta en pasado ("¿ya lo cargaste como gasto?") — asumía
-- que el gasto se había creado en otra pantalla, en otro momento. Eso deja dos flujos reales sin
-- resolver:
--
-- 1. "Le presto plata a alguien y quiero que ese efectivo deje de contar como mío ahora mismo" — hoy
--    exige ir a Movimientos, cargar el gasto a mano, volver a Me Deben y tildar el flag. Tres pasos
--    para una sola decisión.
-- 2. "Compro $1000 de verduras al 50% con mi pareja" — el caso más frecuente del usuario. Hoy son
--    dos escrituras desconectadas: un gasto de $500 en Movimientos y una deuda de $500 en Me Deben,
--    cargadas a mano una después de la otra, con el monto repetido.
--
-- Esta migración no toca la identidad del cuadre (`receivables` sigue afuera de `rpc_current_balance`
-- y `rpc_projected_balance`, ver `20260902020001_receivables_deudas_a_favor.sql`). Lo que agrega es
-- la posibilidad de que la propia app genere el gasto que separa "plata prestada" de "plata que ya
-- salió", en el mismo paso en que se carga la deuda, en vez de pedirle al usuario que lo haga en dos
-- pantallas y confíe en que el monto va a coincidir.

-- La transacción que sacó esta plata del saldo: o bien la de "descontala ahora" sobre una deuda ya
-- prestada, o bien el gasto compartido del que nació la deuda. `on delete set null` (no cascade),
-- mismo criterio que `receivable_payments.transaction_id`: borrar el movimiento desde Movimientos
-- no puede hacer desaparecer la deuda en silencio, sólo desengancharla.
alter table public.receivables
  add column expense_transaction_id uuid references public.transactions (id) on delete set null;

-- ---------------------------------------------------------------------------------------------
-- Alta de deuda con gasto opcional en el mismo paso
-- ---------------------------------------------------------------------------------------------

-- Único camino de alta a partir de acá (reemplaza el insert directo que hacía el cliente). La razón
-- es la misma que ya vale para rpc_mark_fixed_expense_paid: cuando hay que insertar una transacción
-- Y la fila que la referencia, dos escrituras sueltas desde el cliente pueden cortarse en el medio
-- (esto es una PWA) y dejar un gasto huérfano inflando el saldo sin nada en pantalla que lo explique.
--
-- p_expense_amount sirve a dos flujos con montos distintos a propósito:
--   "Descontala ahora" (prestaste y ya no la contás como tuya): p_expense_amount = p_amount entero,
--     p_already_expensed = true.
--   "Gasto compartido" (compraste $1000, tu parte fue $500, la deuda es por los otros $500):
--     p_expense_amount = tu parte (NO p_amount), p_already_expensed = false — esa mitad que quedó
--     en deuda todavía no salió del saldo, así que sigue contando como plata tuya en el cuadre.
create or replace function public.rpc_create_receivable(
  p_name text,
  p_amount numeric,
  p_expected_period date default null,
  p_note text default null,
  p_already_expensed boolean default false,
  p_expense_amount numeric default null,
  p_expense_category_id uuid default null,
  p_expense_occurred_on date default null,
  p_expense_description text default null
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
    -- "Descontala ahora" descuenta exactamente lo prestado: si no coincidiera, quedaría una
    -- diferencia sin dueño entre lo que salió del saldo y lo que la deuda dice que te deben.
    if p_already_expensed and p_expense_amount <> p_amount then
      raise exception 'receivable_expense_mismatch';
    end if;

    insert into public.transactions (user_id, type, amount, occurred_on, category_id, description)
    values (
      v_uid, 'expense', p_expense_amount, coalesce(p_expense_occurred_on, current_date),
      p_expense_category_id, p_expense_description
    )
    returning id into v_tx_id;
  end if;

  insert into public.receivables (user_id, name, amount, expected_period, already_expensed, note, expense_transaction_id)
  values (v_uid, p_name, p_amount, p_expected_period, p_already_expensed, p_note, v_tx_id)
  returning id into v_receivable_id;

  return v_receivable_id;
end;
$$;

-- ---------------------------------------------------------------------------------------------
-- Descontar / deshacer el descuento de una deuda ya cargada
-- ---------------------------------------------------------------------------------------------

-- "Ya no la cuento como mía": genera el gasto que le faltaba a una deuda que se cargó como "sigue
-- en mi saldo". Descuenta lo pendiente (total menos abonos ya cobrados), no el total: si ya te
-- devolvieron una parte, esa parte está en un lugar físico y ya sumaba bien en el cuadre — sólo lo
-- que sigue prestado tiene que salir del saldo ahora.
create or replace function public.rpc_expense_receivable(
  p_receivable_id uuid,
  p_category_id uuid default null,
  p_occurred_on date default null
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

  insert into public.transactions (user_id, type, amount, occurred_on, category_id, description)
  values (v_uid, 'expense', v_pending, coalesce(p_occurred_on, current_date), p_category_id,
          left('Descontado: ' || v_receivable.name, 300))
  returning id into v_tx_id;

  update public.receivables
  set already_expensed = true, expense_transaction_id = v_tx_id, updated_at = now()
  where id = p_receivable_id;
end;
$$;

-- Revert simétrico de rpc_expense_receivable (mismo criterio que rpc_delete_receivable_payment):
-- borra el gasto asociado y vuelve a "sigue en mi saldo". Se niega si algún abono ya generó un
-- ingreso: desarmar el gasto dejando ese ingreso vivo dejaría el saldo permanentemente inflado (esa
-- plata contaría dos veces, como ingreso cobrado y como deuda pendiente que vuelve a sumar).
create or replace function public.rpc_unexpense_receivable(p_receivable_id uuid)
returns void
language plpgsql
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_receivable record;
  v_has_income_payments boolean;
begin
  select * into v_receivable from public.receivables where id = p_receivable_id and user_id = v_uid;
  if not found then
    raise exception 'receivable_not_found';
  end if;

  if not v_receivable.already_expensed then
    return; -- idempotente
  end if;

  select exists(
    select 1 from public.receivable_payments
    where receivable_id = p_receivable_id and user_id = v_uid and transaction_id is not null
  ) into v_has_income_payments;

  if v_has_income_payments then
    raise exception 'receivable_has_income_payments';
  end if;

  if v_receivable.expense_transaction_id is not null then
    delete from public.transactions where id = v_receivable.expense_transaction_id and user_id = v_uid;
  end if;

  update public.receivables
  set already_expensed = false, expense_transaction_id = null, updated_at = now()
  where id = p_receivable_id;
end;
$$;

-- ---------------------------------------------------------------------------------------------
-- Abono: el usuario puede forzar si genera un ingreso o no
-- ---------------------------------------------------------------------------------------------

-- El drop es necesario y no prolijidad: Postgres identifica una función por (nombre, tipos de
-- argumento), así que un create or replace con un parámetro nuevo crea una sobrecarga al lado de la
-- vieja en vez de reemplazarla, y una llamada de PostgREST con argumentos nombrados que matchee
-- ambas falla con PGRST203 (Could not choose the best candidate function).
drop function if exists public.rpc_register_receivable_payment(uuid, numeric, date, uuid);

-- p_create_income es tri-estado: null (default) deriva de already_expensed, igual que hoy — una
-- pestaña vieja que no manda este argumento se comporta exactamente igual que antes. true/false
-- explícito es el usuario pisando la derivación a mano (p.ej. ya cargó el ingreso aparte, o quiere
-- registrar uno que el flag no hubiera generado solo).
create or replace function public.rpc_register_receivable_payment(
  p_receivable_id uuid,
  p_amount numeric,
  p_occurred_on date default null,
  p_category_id uuid default null,
  p_create_income boolean default null
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
    insert into public.transactions (user_id, type, amount, occurred_on, category_id, description)
    values (v_uid, 'income', p_amount, v_occurred_on, p_category_id,
            left('Me devolvió ' || v_receivable.name, 300))
    returning id into v_tx_id;
  end if;

  insert into public.receivable_payments (user_id, receivable_id, amount, occurred_on, transaction_id)
  values (v_uid, p_receivable_id, p_amount, v_occurred_on, v_tx_id);
end;
$$;

grant execute on function public.rpc_create_receivable(text, numeric, date, text, boolean, numeric, uuid, date, text) to authenticated;
grant execute on function public.rpc_expense_receivable(uuid, uuid, date) to authenticated;
grant execute on function public.rpc_unexpense_receivable(uuid) to authenticated;
grant execute on function public.rpc_register_receivable_payment(uuid, numeric, date, uuid, boolean) to authenticated;
