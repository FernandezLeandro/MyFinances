-- Nueva función pedida por Lean para el plan BASIC (no estaba en el plan original de 4 bloques):
-- BASIC no registra movimientos manuales, así que no tiene con qué saber "cuánto dinero me queda"
-- este ciclo — acá el usuario asigna directamente el sueldo que cobró, y Hoy lo compara contra el
-- total de fijos del ciclo. Es un flujo aparte de "Nuevo movimiento" (no genera transacción).
--
-- Ledger, mismo criterio que `fixed_expense_savings`: cada asignación es su propia fila (sueldo en
-- partes — adelanto + resto — o un ajuste posterior), se puede quitar de a una sin perder las demás.
-- `cycle_id` es el `Cycle.id` de `src/lib/cycle.ts` (la fecha de inicio del ciclo, `'yyyy-MM-dd'`) —
-- se guarda junto con `cycle_kind` porque, a diferencia del `period` mensual de los fijos, un mismo
-- `cycle_id` no identifica un período único por sí solo (un ciclo semanal y uno mensual pueden
-- arrancar el mismo día).
create table public.cycle_incomes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  cycle_kind text not null check (cycle_kind in ('monthly', 'biweekly', 'weekly')),
  cycle_id date not null,
  amount numeric(12, 2) not null check (amount > 0),
  received_at timestamptz not null default now(),
  note text
);

create index cycle_incomes_user_cycle_idx on public.cycle_incomes (user_id, cycle_kind, cycle_id);

alter table public.cycle_incomes enable row level security;

create policy "cycle_incomes_select_own" on public.cycle_incomes
  for select using (user_id = auth.uid());

create policy "cycle_incomes_insert_own" on public.cycle_incomes
  for insert with check (user_id = auth.uid());

create policy "cycle_incomes_delete_own" on public.cycle_incomes
  for delete using (user_id = auth.uid());

grant select, insert, delete on public.cycle_incomes to authenticated;
