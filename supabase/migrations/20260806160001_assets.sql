-- Catálogo de activos para Patrimonio. A diferencia de savings_buckets (categorías personales que
-- se siembran por cuenta), acá el catálogo global es un hecho objetivo compartido: BTC es BTC para
-- todo el mundo, no hace falta duplicarlo por usuario. `user_id` null = fila global (seedeada acá,
-- sólo tocable por migraciones); `user_id` propio = activo que el usuario agregó desde Ajustes.
create table public.assets (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users (id) on delete cascade,
  symbol text not null,
  name text not null,
  asset_class text not null check (asset_class in ('fiat', 'crypto', 'equity', 'bond', 'other')),
  -- Sólo informativo para la UI ("se cotiza en USD") — el cálculo siempre trabaja en ARS por unidad
  -- vía `rate_to_main` en savings_entries, así que esto no participa de ninguna cuenta.
  quote_currency text not null check (quote_currency in ('ARS', 'USD')),
  -- Cuántos decimales tiene una unidad: 2 para dinero/acciones, 8 para cripto (estilo satoshi).
  decimals int not null default 2 check (decimals between 0 and 8),
  price_source text not null default 'manual' check (price_source in ('coingecko', 'manual')),
  coingecko_id text,
  manual_price_ars numeric(20, 8),
  manual_price_updated_at timestamptz,
  is_archived boolean not null default false,
  created_at timestamptz not null default now()
);

-- Dos índices únicos parciales en vez de un unique(user_id, symbol) con sentinel: separan limpio
-- "el símbolo no se repite en el catálogo global" de "el símbolo no se repite entre los propios de
-- un usuario" — un usuario podría en teoría tener un symbol que coincide con uno global sin chocar
-- (edge case raro, no se resuelve acá; se prioriza no tener que inventar un uuid sentinel).
create unique index assets_global_symbol_idx on public.assets (symbol) where user_id is null;
create unique index assets_user_symbol_idx on public.assets (user_id, symbol) where user_id is not null;

alter table public.assets enable row level security;

create policy "assets_select_own_or_global" on public.assets
  for select using (user_id = auth.uid() or user_id is null);

create policy "assets_insert_own" on public.assets
  for insert with check (user_id = auth.uid());

create policy "assets_update_own" on public.assets
  for update using (user_id = auth.uid());

create policy "assets_delete_own" on public.assets
  for delete using (user_id = auth.uid());

insert into public.assets (symbol, name, asset_class, quote_currency, decimals, price_source, coingecko_id) values
  ('ARS', 'Peso argentino', 'fiat', 'ARS', 2, 'manual', null),
  ('USD', 'Dólar estadounidense', 'fiat', 'USD', 2, 'manual', null),
  ('BTC', 'Bitcoin', 'crypto', 'USD', 8, 'coingecko', 'bitcoin'),
  ('USDT', 'Tether', 'crypto', 'USD', 8, 'coingecko', 'tether'),
  ('MELI', 'MercadoLibre', 'equity', 'USD', 2, 'manual', null),
  ('SPY', 'S&P 500 (SPY)', 'equity', 'USD', 2, 'manual', null);
