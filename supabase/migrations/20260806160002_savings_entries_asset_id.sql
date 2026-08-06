-- savings_entries pasa de "moneda fija (ARS/USD)" a "cualquier activo del catálogo". Backfill, no
-- drop-and-recreate: las cuentas de test ya tienen aportes cargados y no hay motivo para perderlos.
alter table public.savings_entries add column asset_id uuid references public.assets (id);

update public.savings_entries se
set asset_id = (select a.id from public.assets a where a.symbol = se.currency and a.user_id is null);

alter table public.savings_entries alter column asset_id set not null;
alter table public.savings_entries drop column currency;

-- 0,015 BTC no entra en numeric(14,2) sin perder los decimales que importan.
alter table public.savings_entries alter column amount type numeric(20, 8);
alter table public.savings_entries alter column rate_to_main type numeric(20, 8);

create index savings_entries_asset_idx on public.savings_entries (asset_id);
