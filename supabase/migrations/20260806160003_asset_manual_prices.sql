-- El precio manual de un activo (MELI, un bono agregado a mano) es una referencia PROPIA de cada
-- cuenta, igual que `profiles.usd_rate_manual` ya lo es — no un dato compartido. Guardarlo en la
-- propia fila de `assets` rompía justo eso para el catálogo global: ninguna cuenta puede actualizar
-- una fila con `user_id` null bajo su propia policy de RLS (no hay forma de que sea "own row" a la
-- vez para todos). Pasa a una tabla de overrides por usuario.
alter table public.assets drop column manual_price_ars;
alter table public.assets drop column manual_price_updated_at;

create table public.asset_manual_prices (
  user_id uuid not null references auth.users (id) on delete cascade,
  asset_id uuid not null references public.assets (id) on delete cascade,
  price_ars numeric(20, 8) not null check (price_ars > 0),
  updated_at timestamptz not null default now(),
  primary key (user_id, asset_id)
);

alter table public.asset_manual_prices enable row level security;

create policy "asset_manual_prices_select_own" on public.asset_manual_prices
  for select using (user_id = auth.uid());

create policy "asset_manual_prices_insert_own" on public.asset_manual_prices
  for insert with check (user_id = auth.uid());

create policy "asset_manual_prices_update_own" on public.asset_manual_prices
  for update using (user_id = auth.uid());

create policy "asset_manual_prices_delete_own" on public.asset_manual_prices
  for delete using (user_id = auth.uid());
