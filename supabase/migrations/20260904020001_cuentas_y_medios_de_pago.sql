-- "Dónde tengo la plata" pasa de ser una lista de nombres sueltos (que sólo existía adentro de
-- Cuadrar Saldo para sumarla una vez al mes) a ser CUENTAS de verdad: efectivo, billetera virtual,
-- banco. Lo que habilita el cambio es poder decir "este movimiento lo pagué con ICBC" y que el saldo
-- de esa cuenta se descuente solo, en vez de tener que recordarlo al cuadrar.
--
-- La tabla NO se renombra a `accounts`: renombrar arrastra las 4 policies, el índice, la FK que se
-- agrega más abajo y toda la capa de queries, a cambio de nada funcional. `balance_locations` sigue
-- siendo el nombre físico; "Cuenta" es el nombre en la UI.
--
-- Doctrina del saldo por cuenta, igual que la del saldo global (rpc_current_balance): NO se guarda,
-- se deriva. Cada cuenta guarda sólo su APERTURA (la plata que ya tenías antes de empezar a imputar
-- movimientos) y el saldo actual sale de sumarle los movimientos imputados y las transferencias.
-- Editar o borrar un movimiento recalcula solo; no hay ningún campo mutable que pueda quedar
-- desincronizado sin que se note.
--
-- `amount` se queda tal cual y NO cambia de significado: sigue siendo "el último real declarado",
-- el input de Cuadrar Saldo. El cuadre global (suma de reales + deudas vs. rpc_current_balance) no
-- cambia de fórmula en esta migración ni en el cliente. El derivado por cuenta es DIAGNÓSTICO: te
-- dice en qué cuenta está el descuadre. No puede ser la base del ajuste porque prestar efectivo no
-- genera movimiento (ver `receivables_deudas_a_favor`): el derivado de la cuenta no baja aunque la
-- plata no esté, y cuadrar por cuenta fabricaría un ajuste falso en cada préstamo.

-- ---------------------------------------------------------------------------------------------
-- 1. balance_locations: tipo, apertura, predeterminada, archivado
-- ---------------------------------------------------------------------------------------------

alter table public.balance_locations
  -- Sólo para ícono y agrupación en el selector; ningún cálculo mira esta columna. 'cash' de default
  -- porque es el caso que no requiere explicar nada, y las filas que ya existen no tienen tipo.
  add column kind text not null default 'cash' check (kind in ('cash', 'wallet', 'bank')),
  -- Sin `check (opening_amount >= 0)`, mismo criterio que `amount`: un banco en descubierto es plata
  -- real y negativa, y esta tabla existe para declarar la realidad, no para discutirla.
  add column opening_amount numeric(12, 2) not null default 0,
  -- Sólo informativo ("desde el 04/09"). El derivado suma TODOS los movimientos imputados a la
  -- cuenta sin mirar la fecha: acotar por `opening_on` haría que imputarle a mano un movimiento
  -- viejo lo descarte en silencio, que es peor que contarlo.
  add column opening_on date not null default current_date,
  add column is_default boolean not null default false,
  add column is_archived boolean not null default false;

-- Backfill: la apertura de cada cuenta es lo que hoy declarás como real. Todo el historial de
-- movimientos queda sin cuenta imputada, así que el derivado arranca exactamente en el número que ya
-- venías declarando — sin doble conteo y sin que nada se mueva el día del deploy.
update public.balance_locations set opening_amount = amount;

-- Una sola predeterminada por usuario. Índice parcial en vez de un trigger: la UI apaga la anterior
-- antes de prender la nueva, y si alguna vez se le escapa, la DB lo rechaza en vez de dejar dos.
create unique index balance_locations_one_default_idx
  on public.balance_locations (user_id) where is_default;

-- ---------------------------------------------------------------------------------------------
-- 2. transactions.account_id — "con qué lo pagué"
-- ---------------------------------------------------------------------------------------------

-- `on delete set null`, no `restrict`: borrar una cuenta no puede borrar plata real ni quedar
-- bloqueado por su propio historial. El movimiento sobrevive sin cuenta y cae en "Sin asignar", que
-- es visible en Cuadrar Saldo y se puede corregir. Nullable a propósito: el campo es opcional, y
-- todos los movimientos anteriores a esta migración quedan sin cuenta.
alter table public.transactions
  add column account_id uuid references public.balance_locations (id) on delete set null;

-- Parcial: hoy la enorme mayoría de las filas tiene account_id null (todo el historial), indexarlas
-- sería peso muerto. El único acceso por esta columna es el sum por cuenta de rpc_account_balances.
create index transactions_account_idx on public.transactions (account_id)
  where account_id is not null;

-- ---------------------------------------------------------------------------------------------
-- 3. account_transfers — mover plata entre cuentas
-- ---------------------------------------------------------------------------------------------

-- Sacar $50.000 del banco al bolsillo no es un gasto ni un ingreso: el total no cambia, cambia dónde
-- está. Sin esto, la única forma de representarlo sería un ajuste falso en cada cuenta.
--
-- Tabla propia y NO dos `transactions` vinculadas, a propósito: una transferencia no debe aparecer
-- en rpc_current_balance, v_monthly_summary, v_spend_by_category ni rpc_monthly_series. Como tabla
-- aparte queda invisible para las cuatro sin tocar ninguna. Con transacciones haría falta un flag
-- nuevo y excluirlo en cada una — que es exactamente el tipo de cambio que ya hizo que
-- rpc_projected_balance se redefiniera cinco veces.
create table public.account_transfers (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  -- `cascade`, a diferencia de transactions.account_id: una transferencia sin origen o sin destino
  -- no significa nada — no es plata que existió y perdió su etiqueta, es una flecha sin punta.
  from_account_id uuid not null references public.balance_locations (id) on delete cascade,
  to_account_id uuid not null references public.balance_locations (id) on delete cascade,
  amount numeric(12, 2) not null check (amount > 0),
  occurred_on date not null,
  description text,
  created_at timestamptz not null default now(),
  constraint account_transfers_distinct_accounts check (from_account_id <> to_account_id)
);

create index account_transfers_user_date_idx on public.account_transfers (user_id, occurred_on desc);
create index account_transfers_from_idx on public.account_transfers (from_account_id);
create index account_transfers_to_idx on public.account_transfers (to_account_id);

alter table public.account_transfers enable row level security;

create policy "account_transfers_select_own" on public.account_transfers
  for select using (user_id = auth.uid());

create policy "account_transfers_insert_own" on public.account_transfers
  for insert with check (user_id = auth.uid());

create policy "account_transfers_update_own" on public.account_transfers
  for update using (user_id = auth.uid());

create policy "account_transfers_delete_own" on public.account_transfers
  for delete using (user_id = auth.uid());

-- ---------------------------------------------------------------------------------------------
-- 4. rpc_account_balances — el saldo derivado de cada cuenta
-- ---------------------------------------------------------------------------------------------

-- En la DB y no en el cliente (a diferencia de la suma de `amount`, que son un puñado de filas):
-- esto suma TODO el historial de transactions, y el cliente sólo trae una ventana filtrada de 1000
-- filas como mucho (TRANSACTIONS_ROW_LIMIT).
--
-- SECURITY INVOKER con filtro explícito por user_id, igual que rpc_current_balance: RLS ya alcanza,
-- el `where` es cinturón y tirantes. Las transferencias se netean solas entre cuentas, así que la
-- suma de todos los derivados no las cuenta de más.
create or replace function public.rpc_account_balances()
returns table (account_id uuid, derived numeric)
language sql
stable
set search_path = public
as $$
  select
    a.id,
    a.opening_amount
    + coalesce((
        select sum(case when t.type = 'income' then t.amount else -t.amount end)
        from public.transactions t
        where t.account_id = a.id
      ), 0)
    + coalesce((
        select sum(tr.amount) from public.account_transfers tr where tr.to_account_id = a.id
      ), 0)
    - coalesce((
        select sum(tr.amount) from public.account_transfers tr where tr.from_account_id = a.id
      ), 0)
  from public.balance_locations a
  where a.user_id = auth.uid()
$$;
