-- Deudas a favor: la gente que te debe plata pasa de ser una lista plana adentro de "Cuadrar
-- saldo" a tener mes esperado de cobro, abonos parciales y pantalla propia (/deudas).
--
-- Se EXTIENDE `receivables` en vez de crear una tabla al lado: las filas que ya existen SON deudas
-- a favor, sólo que sin mes ni abonos. Una tabla paralela obligaría a Cuadrar Saldo a sumar dos
-- fuentes y a migrar a mano lo que el usuario ya tiene cargado.
--
-- La doctrina de 20260808050001_receivables.sql sigue vigente y se AFINA acá. Ese comentario dice:
-- prestar no genera movimiento, la plata sigue siendo tuya, `rpc_current_balance` ya la cuenta, por
-- eso la deuda suma del lado de "Tenés" en el cuadre. Cierto — pero sólo para el caso que esa
-- migración tenía en la cabeza: prestar EFECTIVO. Hay un segundo caso: pagaste algo ajeno con
-- tarjeta o débito y cargaste el gasto. Ahí la plata YA salió del saldo, y sumarla en el cuadre da
-- un excedente falso que empuja a registrar un ingreso que no existe — exactamente el error que la
-- tabla venía a evitar, con el signo al revés. `already_expensed` separa los dos casos.
--
-- Lo que NO cambia: `receivables` sigue afuera de `rpc_current_balance` y de
-- `rpc_projected_balance`. Con `already_expensed = false` esa plata ya está adentro del saldo
-- actual (nunca hubo gasto); con `already_expensed = true` también está adentro, con el signo del
-- gasto que se cargó. Sumarla al proyectado sería contar como propia plata que todavía no volvió:
-- decisión explícita del usuario para esta versión, no un olvido. Ninguno de los dos RPC se toca en
-- esta migración.
alter table public.receivables
  -- Mes en el que esperás cobrarla, día 1 — mismo formato de período que el resto de la app
  -- (`credit_purchases.first_period`, `*_payments.period`), con el mismo check para que no entre
  -- un día 17 y después `date_trunc` en el cliente y en el server no coincidan.
  -- Nullable a propósito: las filas que ya existen son "me deben, no sé cuándo", y ese caso tiene
  -- que seguir siendo válido — es el backfill, y también un estado legítimo de acá en adelante.
  add column expected_period date check (expected_period = date_trunc('month', expected_period)::date),
  -- "Ya lo cargué como gasto". `false` para todo lo existente: es el default de la columna, así que
  -- el backfill de las filas viejas es el propio `alter` y su comportamiento no cambia en nada.
  add column already_expensed boolean not null default false,
  -- Contexto libre ("me lo devuelve cuando cobre el aguinaldo"). Sin límite de largo: es una nota
  -- para uno mismo, no entra en ninguna descripción de movimiento.
  add column note text;

-- Abonos parciales: "me devuelve $20.000 ahora y el resto el mes que viene". Un pago único es
-- simplemente un solo abono por el total — no hay dos caminos de código.
--
-- No hay columna `is_settled`/`settled_at` en `receivables`, a propósito: "cobrada" es
-- `sum(abonos) >= amount`, derivado. Es el mismo criterio que ya usan `credit_card_payments` y
-- `fixed_expense_payments`, donde la existencia de la fila de pago ES el estado. Una columna sería
-- una segunda verdad que se desincroniza sola cuando editás el monto total de la deuda o borrás un
-- abono, y obligaría a que TODO camino de escritura la recalcule (incluido un `update` suelto de
-- `amount` desde el cliente, que no pasa por ningún RPC). El costo de derivarlo es que el cliente
-- trae las dos tablas para saber qué está pendiente — el mismo costo que ya paga Créditos (cuotas +
-- guardado + pagos) y Fijos (plantillas + pagos), y que se resuelve en `aggregate.ts`.
create table public.receivable_payments (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  receivable_id uuid not null references public.receivables (id) on delete cascade,
  -- Acá sí `check (amount > 0)`, a diferencia de `receivables.amount`: un abono de $0 o negativo no
  -- es "declarar la realidad", es un error de tipeo que rompería el cálculo de lo pendiente.
  amount numeric(12, 2) not null check (amount > 0),
  occurred_on date not null default current_date,
  -- La transacción de ingreso que generó este abono, y sólo cuando la deuda tenía
  -- `already_expensed`. Null en el caso normal: cobrar plata que prestaste en efectivo no es un
  -- ingreso, la plata sólo vuelve a un lugar físico. `on delete set null` (no cascade), igual que
  -- en `fixed_expense_payments` y `credit_card_payments`: borrar el movimiento desde Movimientos no
  -- puede hacer desaparecer el abono en silencio.
  transaction_id uuid references public.transactions (id) on delete set null,
  created_at timestamptz not null default now()
);

-- Sumar los abonos de una deuda es la consulta caliente de /deudas y de "Cuadrar saldo".
create index receivable_payments_receivable_idx on public.receivable_payments (receivable_id);
create index receivable_payments_user_idx on public.receivable_payments (user_id);

-- Parcial: las deudas sin mes esperado no se ordenan por esta columna, no tiene sentido indexarlas.
create index receivables_expected_period_idx on public.receivables (user_id, expected_period)
  where expected_period is not null;

alter table public.receivable_payments enable row level security;

create policy "receivable_payments_select_own" on public.receivable_payments
  for select using (user_id = auth.uid());

create policy "receivable_payments_insert_own" on public.receivable_payments
  for insert with check (user_id = auth.uid());

create policy "receivable_payments_update_own" on public.receivable_payments
  for update using (user_id = auth.uid());

create policy "receivable_payments_delete_own" on public.receivable_payments
  for delete using (user_id = auth.uid());

-- ---------------------------------------------------------------------------------------------
-- RPCs
-- ---------------------------------------------------------------------------------------------

-- Registrar un abono. Es un RPC y no dos escrituras del cliente por tres razones concretas:
--
-- 1. Atomicidad. Con `already_expensed` hay que insertar la transacción de ingreso Y el abono que
--    la referencia. Si la segunda falla (o se corta la conexión en el medio: esto es una PWA), queda
--    un ingreso huérfano inflando el saldo, sin nada en pantalla que lo explique ni forma de
--    encontrarlo. Es el mismo motivo por el que existen `rpc_mark_fixed_expense_paid` y
--    `rpc_mark_credit_card_paid`, no una preferencia de estilo.
-- 2. La decisión "¿esto genera un movimiento?" depende de `receivables.already_expensed`, que es
--    dato del server. Si la toma el cliente, una pestaña vieja con el flag cacheado crea un ingreso
--    que no correspondía.
-- 3. El revert necesita el `transaction_id` guardado en la fila de abono para borrar las dos cosas
--    juntas (ver `rpc_delete_receivable_payment`). Que lo escriba el mismo statement que crea la
--    transacción es la única forma de que nunca queden desapareados.
create or replace function public.rpc_register_receivable_payment(
  p_receivable_id uuid,
  p_amount numeric,
  p_occurred_on date default null,
  p_category_id uuid default null
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
begin
  select * into v_receivable from public.receivables where id = p_receivable_id and user_id = v_uid;
  if not found then
    raise exception 'receivable_not_found';
  end if;

  -- El `check (amount > 0)` de la tabla también lo agarraría, pero como error de constraint sin
  -- nombre propio. Un error tipado se lee en el log y deja la puerta abierta a mapearlo en
  -- `mensajeDeError` si algún día hace falta.
  if p_amount is null or p_amount <= 0 then
    raise exception 'receivable_payment_invalid_amount';
  end if;

  -- Sólo el caso "ya lo cargué como gasto" genera movimiento: esa plata salió del saldo cuando se
  -- registró el gasto, así que cobrarla es un ingreso real. En el caso normal (prestaste efectivo)
  -- el saldo nunca bajó — crear un ingreso acá lo duplicaría, que es la misma trampa que evita la
  -- migración original al no generar un gasto al prestar.
  if v_receivable.already_expensed then
    insert into public.transactions (user_id, type, amount, occurred_on, category_id, description)
    values (v_uid, 'income', p_amount, v_occurred_on, p_category_id,
            left('Me devolvió ' || v_receivable.name, 300))
    returning id into v_tx_id;
  end if;

  -- Se permite cobrar de más (redondeos, intereses): lo pendiente se recorta en 0 del lado del
  -- cliente. Mismo criterio que las bolsas de Fijos, que dejan pasarse del presupuesto.
  insert into public.receivable_payments (user_id, receivable_id, amount, occurred_on, transaction_id)
  values (v_uid, p_receivable_id, p_amount, v_occurred_on, v_tx_id);
end;
$$;

-- Borrar un abono revierte también su transacción, si la hubo — el saldo tiene que volver
-- exactamente a como estaba antes de registrarlo. Por id de abono y no por (deuda, período): con
-- varios abonos por deuda una firma (uuid, date) no puede saber cuál sacar, mismo razonamiento que
-- `rpc_unmark_fixed_expense_payment`. Idempotente: si el abono ya no está, no hace nada.
create or replace function public.rpc_delete_receivable_payment(p_payment_id uuid)
returns void
language plpgsql
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_payment record;
begin
  select * into v_payment from public.receivable_payments where id = p_payment_id and user_id = v_uid;

  if not found then
    return;
  end if;

  if v_payment.transaction_id is not null then
    delete from public.transactions where id = v_payment.transaction_id and user_id = v_uid;
  end if;

  delete from public.receivable_payments where id = v_payment.id;
end;
$$;

grant execute on function public.rpc_register_receivable_payment(uuid, numeric, date, uuid) to authenticated;
grant execute on function public.rpc_delete_receivable_payment(uuid) to authenticated;
