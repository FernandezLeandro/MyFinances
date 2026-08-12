-- "Por cobrar": plata que prestaste y todavía no volvió. A propósito NO genera ningún movimiento —
-- cuando prestás $10.000, esos $10.000 salen de un lugar físico (balance_locations) pero la plata
-- sigue siendo tuya: rpc_current_balance ya la cuenta, porque nunca hubo un gasto real. Sin esta
-- tabla, "Cuadrar saldo" marca una diferencia falsa y empuja a registrar un gasto que no existe.
--
-- Por eso receivables NO entra en rpc_current_balance ni en rpc_projected_balance — esa plata ya
-- está adentro de esos cálculos. Se suma únicamente del lado de "Cuadrar saldo" (ver aggregate.ts,
-- reconciliar()), junto a balance_locations, contra el mismo rpc_current_balance de siempre. Tocar
-- cualquiera de los dos RPC para "incluir lo prestado" duplicaría el monto.
--
-- Misma forma que balance_locations: pocas filas, sin período, se agregan en el cliente.
create table public.receivables (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  name text not null,
  -- Sin `check (amount >= 0)`, mismo criterio que balance_locations: esta pantalla declara la
  -- realidad, no la discute.
  amount numeric(12, 2) not null default 0,
  updated_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

-- Orden por created_at (insertion order), sin sort_order — mismo criterio que balance_locations.
create index receivables_user_idx on public.receivables (user_id);

alter table public.receivables enable row level security;

create policy "receivables_select_own" on public.receivables
  for select using (user_id = auth.uid());

create policy "receivables_insert_own" on public.receivables
  for insert with check (user_id = auth.uid());

create policy "receivables_update_own" on public.receivables
  for update using (user_id = auth.uid());

create policy "receivables_delete_own" on public.receivables
  for delete using (user_id = auth.uid());
