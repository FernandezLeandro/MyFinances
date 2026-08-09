-- "Cuadrar saldo": el saldo de la app es 100% derivado (rpc_current_balance), así que no hay forma
-- de saber si es correcto salvo comparándolo contra la plata real. Esta tabla es el desglose de
-- "dónde está la plata" (efectivo, Mercado Pago, banco...) que reemplaza al viejo campo único de
-- "Ajustar saldo" — la suma de estas filas contra rpc_current_balance da la diferencia, y de ahí
-- sale el mismo movimiento de ajuste que ya existía (transactions.is_adjustment). No hace falta
-- ninguna función ni vista nueva: la suma son un puñado de filas, se agrega en el cliente, mismo
-- criterio que savings_entries.
create table public.balance_locations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  name text not null,
  -- Sin `check (amount >= 0)`, a diferencia del resto de las tablas de plata: un banco en
  -- descubierto es plata real y negativa, y esta pantalla existe para declarar la realidad, no
  -- para discutirla. Un monto negativo mal tipeado se delata solo en la diferencia del panel.
  amount numeric(12, 2) not null default 0,
  updated_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

-- Orden por created_at (insertion order), no hay sort_order: reordenar al vuelo mientras se edita
-- un monto haría saltar las filas debajo del dedo, y sin UI de drag-and-drop la columna sería
-- peso muerto.
create index balance_locations_user_idx on public.balance_locations (user_id);

alter table public.balance_locations enable row level security;

create policy "balance_locations_select_own" on public.balance_locations
  for select using (user_id = auth.uid());

create policy "balance_locations_insert_own" on public.balance_locations
  for insert with check (user_id = auth.uid());

create policy "balance_locations_update_own" on public.balance_locations
  for update using (user_id = auth.uid());

create policy "balance_locations_delete_own" on public.balance_locations
  for delete using (user_id = auth.uid());
