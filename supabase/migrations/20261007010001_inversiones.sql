-- Inversiones (reemplaza a Ahorros): categorías de tipo 'investment', dólar CCL, precio global de los
-- activos y la tabla `investments`. Sólo AGREGA: el código anterior (Ahorros) sigue andando hasta que
-- se despliegue el nuevo; la limpieza (borrar savings_*) va en una migración aparte, después.

-- 1. Categorías de inversión ------------------------------------------------------------------------
-- El check de `kind` se creó inline, así que su nombre lo puso Postgres: se busca por definición en
-- vez de asumirlo.
do $$
declare
  v_table text;
  v_name text;
begin
  foreach v_table in array array['categories', 'default_categories'] loop
    for v_name in
      select c.conname
      from pg_constraint c
      where c.conrelid = ('public.' || v_table)::regclass
        and c.contype = 'c'
        and pg_get_constraintdef(c.oid) like '%kind%'
    loop
      execute format('alter table public.%I drop constraint %I', v_table, v_name);
    end loop;
  end loop;
end $$;

alter table public.categories
  add constraint categories_kind_check check (kind in ('income', 'expense', 'investment'));
alter table public.default_categories
  add constraint default_categories_kind_check check (kind in ('income', 'expense', 'investment'));

-- Las 3 de base. Colores e íconos ya están en la paleta y el set cerrados (`categories_color_palette`,
-- `categories_icon_set`).
insert into public.default_categories (name, kind, color, icon, sort_order)
select v.name, 'investment', v.color, v.icon, v.sort_order
from (
  values
    ('Ahorros', '#1D8F7E', 'piggy-bank', 100),
    ('Fondo de emergencia', '#2F6FB8', 'shield', 101),
    ('Jubilación', '#6A5BB8', 'trending-up', 102)
) as v(name, color, icon, sort_order)
where not exists (
  select 1 from public.default_categories dc where dc.kind = 'investment' and dc.name = v.name
);

-- Backfill: las cuentas que ya existen no pasan por `rpc_redeem_invite_code` de nuevo. Sólo a quien no
-- tiene ninguna de inversión, y no al admin (no usa finanzas).
insert into public.categories (user_id, name, kind, color, icon)
select p.id, dc.name, dc.kind, dc.color, dc.icon
from public.profiles p
cross join public.default_categories dc
where p.role = 'user'
  and dc.kind = 'investment'
  and not dc.is_archived
  and not exists (
    select 1 from public.categories c where c.user_id = p.id and c.kind = 'investment'
  )
order by dc.sort_order;

-- 2. Dólar CCL ------------------------------------------------------------------------------------
do $$
declare
  v_name text;
begin
  for v_name in
    select c.conname
    from pg_constraint c
    where c.conrelid = 'public.profiles'::regclass
      and c.contype = 'c'
      and pg_get_constraintdef(c.oid) like '%fx_source%'
  loop
    execute format('alter table public.profiles drop constraint %I', v_name);
  end loop;
end $$;

alter table public.profiles
  add constraint profiles_fx_source_check
  check (fx_source in ('oficial', 'blue', 'bolsa', 'contadoconliqui', 'cripto', 'manual'));

-- 3. Precio global de los activos -----------------------------------------------------------------
-- Lo carga el admin (`assets_update_global` ya exige `is_admin()`); las cripto lo traen en vivo de
-- CoinGecko. `fx_source` es el dólar con el que se convierte ese activo a pesos.
alter table public.assets
  add column price_usd numeric(20, 8) check (price_usd > 0),
  add column price_updated_at timestamptz,
  add column fx_source text not null default 'contadoconliqui'
    check (fx_source in ('oficial', 'blue', 'bolsa', 'contadoconliqui', 'cripto'));

update public.assets set fx_source = 'cripto' where asset_class = 'crypto';

-- `quote_currency` deja de existir (migración de limpieza, después del deploy): el código nuevo ya no
-- lo manda, así que mientras la columna siga hay que darle un valor por defecto.
alter table public.assets alter column quote_currency set default 'USD';

-- 4. Inversiones ----------------------------------------------------------------------------------
create table public.investments (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  -- `set null`, igual que transactions: borrar la categoría deja la inversión "Sin categoría".
  category_id uuid references public.categories (id) on delete set null,
  -- Sin `on delete`: un activo en uso no se puede borrar (se archiva).
  asset_id uuid not null references public.assets (id),
  -- ARS pagados: es el costo, exacto.
  amount numeric(14, 2) not null check (amount > 0),
  -- Cantidad REAL recibida (la del exchange o broker): fuente de verdad de la tenencia. En ARS = amount.
  quantity numeric(20, 8) not null check (quantity > 0),
  -- Dólar usado y ARS por USD al comprar. Ambos o ninguno; ninguno sólo para ARS.
  fx_source text check (fx_source in ('oficial', 'blue', 'bolsa', 'contadoconliqui', 'cripto')),
  fx_rate numeric(14, 4) check (fx_rate > 0),
  occurred_on date not null check (occurred_on >= '2000-01-01'),
  description text check (char_length(description) <= 140),
  created_at timestamptz not null default now(),
  check ((fx_source is null) = (fx_rate is null))
);

create index investments_user_date_idx on public.investments (user_id, occurred_on desc);

alter table public.investments enable row level security;

create policy "investments_select_own" on public.investments
  for select using (user_id = auth.uid());
create policy "investments_insert_own" on public.investments
  for insert with check (user_id = auth.uid());
create policy "investments_update_own" on public.investments
  for update using (user_id = auth.uid());
create policy "investments_delete_own" on public.investments
  for delete using (user_id = auth.uid());

-- No es `security definer`: corre con el permiso de quien escribe, y alcanza (categories y assets se
-- leen con sus propias policies). La UI nunca ofrece una categoría ajena o de otro tipo, así que esto
-- sólo se ve por API directa.
create or replace function public.trg_investments_refs()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_symbol text;
begin
  if new.category_id is not null then
    if not exists (
      select 1 from public.categories c where c.id = new.category_id and c.user_id = new.user_id
    ) then
      raise exception 'category_not_found';
    end if;

    if not exists (
      select 1 from public.categories c
      where c.id = new.category_id and c.user_id = new.user_id and c.kind = 'investment'
    ) then
      raise exception 'category_kind_mismatch';
    end if;
  end if;

  select a.symbol into v_symbol from public.assets a where a.id = new.asset_id;
  if not found then
    raise exception 'asset_not_found';
  end if;

  -- ARS no se convierte: sin dólar y cantidad = importe. Cualquier otro activo necesita el dólar.
  if v_symbol = 'ARS' then
    if new.fx_source is not null or new.quantity <> new.amount then
      raise exception 'investment_fx_invalid';
    end if;
  elsif new.fx_source is null then
    raise exception 'investment_fx_invalid';
  end if;

  return new;
end;
$$;

create trigger investments_refs
before insert or update of category_id, asset_id, amount, quantity, fx_source, fx_rate on public.investments
for each row execute function public.trg_investments_refs();
