-- Limpieza de Ahorros, que Inversiones reemplaza (`20261007010001_inversiones.sql`).
--
-- ¡NO aplicar junto con la anterior! Va DESPUÉS de desplegar el código nuevo: el código viejo todavía
-- lee `savings_*`, `asset_manual_prices` y `assets.quote_currency`, y se rompería. Orden:
--   1. aplicar `20261007010001_inversiones.sql` (sólo agrega)
--   2. desplegar el código
--   3. aplicar esta

-- 1. El alta por invitación deja de sembrar los 3 ítems de Ahorros (las 3 categorías de inversión ya
-- salen de `default_categories`). Si no se redefine ANTES de borrar `savings_buckets`, el alta falla.
-- Última versión: `20260926010001_categorias_icono_y_paleta.sql`; lo único que cambia es el insert.
create or replace function public.rpc_redeem_invite_code(p_code text, p_display_name text default null)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_plan text;
begin
  if v_uid is null then
    raise exception 'not_authenticated';
  end if;

  if exists (select 1 from public.profiles where id = v_uid) then
    return; -- idempotente: si ya tiene perfil, no repite el alta.
  end if;

  update public.invite_codes
  set used_count = used_count + 1
  where code = p_code
    and is_active
    and used_count < max_uses
    and (expires_at is null or expires_at > now())
  returning plan into v_plan;

  if not found then
    raise exception 'invalid_invite_code';
  end if;

  insert into public.profiles (id, display_name, plan) values (v_uid, p_display_name, v_plan);

  insert into public.categories (user_id, name, kind, color, icon)
  select v_uid, dc.name, dc.kind, dc.color, dc.icon
  from public.default_categories dc
  where not dc.is_archived
  order by dc.sort_order;
end;
$$;

-- 2. Fuera lo de Ahorros. Los precios por cuenta (`asset_manual_prices`) también: ahora el precio de
-- cada activo lo fija el admin (`assets.price_usd`) y es el mismo para todas las cuentas.
drop table public.savings_entries;
drop table public.savings_buckets;
drop table public.asset_manual_prices;

-- 3. «Se cotiza en» deja de existir: el precio de un activo de mercado es siempre en USD.
alter table public.assets drop column quote_currency;
