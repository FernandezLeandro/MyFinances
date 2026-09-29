-- Rediseño de /categorias (Bloque 1 del rediseño de modales): cada categoría pasa a tener un ícono
-- de un set curado de 35 (lucide) y un color de una paleta cerrada de 40. La ficha de categoría
-- pasa a ser sólida (fondo del color, ícono en blanco o tinta según contraste), así que el color
-- tiene que ser uno de los que el front sabe dibujar bien.
--
-- `categories.icon` ya existía desde `20260805190002_categories.sql` pero nunca se usó (todo null en
-- producción, verificado 2026-09-26). Acá se backfillea por nombre, se vuelve `not null default
-- 'tag'` (tag = "General") y se limita a las 35 keys. `default_categories` no lo tenía: se agrega
-- igual, y `rpc_redeem_invite_code` lo copia al sembrar una cuenta nueva.
--
-- Colores: las 8 categorías por defecto originales (y todas las cuentas sembradas con ellas) usaban
-- tonos de la identidad anterior que no están en la paleta de 40 — 13 hex distintos, 140 filas en
-- producción al 2026-09-26. Decisión de Lean: llevarlos al más parecido de la paleta (distancia en
-- CIELAB) y cerrar la columna con un `check`. Los 14 hex de la paleta anterior
-- (`src/lib/categoryColors.ts`) están todos en la nueva, así que un front viejo sigue pudiendo
-- guardar sin chocar con el check.
--
-- Orden de deploy: esta migración primero, el front después. Un front viejo contra esta base anda
-- (colores de su paleta válidos, insert sin `icon` toma 'tag'); un front nuevo contra la base vieja
-- no (no existe `default_categories.icon`).

-- 1. Colores: mayúsculas y remapeo de los que quedaron de la identidad anterior.
create function pg_temp.remap_color(p_color text)
returns text
language sql
immutable
as $$
  select coalesce(r.new, upper(p_color))
  from (select upper(p_color) as c) s
  left join (values
  ('#060956', '#1F3A93'),
  ('#5FD382', '#7CB342'),
  ('#5FD3C4', '#9FE3EA'),
  ('#6FB4F0', '#9EC9F5'),
  ('#9BBF46', '#7CB342'),
  ('#A892F0', '#D1A8F0'),
  ('#C8F751', '#7CB342'),
  ('#D7E421', '#FDD835'),
  ('#D9C9A3', '#C5E1A5'),
  ('#F2789F', '#F7A8C8'),
  ('#FF7A66', '#C4402A'),
  ('#FF9900', '#FB8C00'),
  ('#FFC46B', '#FFC48A')
  ) as r (old, new) on r.old = s.c
$$;

update public.categories set color = pg_temp.remap_color(color);
update public.default_categories set color = pg_temp.remap_color(color);

alter table public.categories add constraint categories_color_palette check (color in (
  '#E53935', '#FB8C00', '#FDD835', '#7CB342', '#00ACC1', '#1E88E5', '#8E24AA', '#D81B60',
  '#FF9A9A', '#FFC48A', '#FFE58A', '#C5E1A5', '#9FE3EA', '#9EC9F5', '#D1A8F0', '#F7A8C8',
  '#C4402A', '#C2622E', '#B8862A', '#3B8A38', '#1D8F7E', '#2F6FB8', '#6A5BB8', '#9B3B78',
  '#B23449', '#A6874A', '#6B8F2A', '#307E59', '#2C8396', '#1F3A93', '#8949A2', '#7A1F3D',
  '#000000', '#3A3A3F', '#6B6B72', '#A0A0A8', '#D0D0D5', '#8A9BAE', '#8D6E63', '#5D4037'
));

alter table public.default_categories add constraint default_categories_color_palette check (color in (
  '#E53935', '#FB8C00', '#FDD835', '#7CB342', '#00ACC1', '#1E88E5', '#8E24AA', '#D81B60',
  '#FF9A9A', '#FFC48A', '#FFE58A', '#C5E1A5', '#9FE3EA', '#9EC9F5', '#D1A8F0', '#F7A8C8',
  '#C4402A', '#C2622E', '#B8862A', '#3B8A38', '#1D8F7E', '#2F6FB8', '#6A5BB8', '#9B3B78',
  '#B23449', '#A6874A', '#6B8F2A', '#307E59', '#2C8396', '#1F3A93', '#8949A2', '#7A1F3D',
  '#000000', '#3A3A3F', '#6B6B72', '#A0A0A8', '#D0D0D5', '#8A9BAE', '#8D6E63', '#5D4037'
));

-- 2. Ícono: ícono inicial según el nombre. Gana el primer patrón que coincide; sin coincidencia,
-- 'tag' (General). Sólo se usa acá, una vez — de ahora en más lo elige quien crea la categoría.
create function pg_temp.icon_for_name(p_name text)
returns text
language sql
immutable
as $$
  select case
    when n ~ '(super|mercado|almac)' then 'shopping-cart'
    when n ~ '(delivery|comida|resto|antojo|hormiga)' then 'utensils'
    when n ~ 'pizza' then 'pizza'
    when n ~ '(uber|transporte|nafta|combustible|\mauto)' then 'car'
    when n ~ '(colectivo|bondi|subte|\mtren\M)' then 'bus'
    when n ~ '\mmoto' then 'motorbike'
    when n ~ '(viaje|vacaci)' then 'plane'
    when n ~ '(hogar|alquiler|expensa|casa)' then 'house'
    when n ~ '(servicio|\mluz\M|\mgas\M)' then 'zap'
    when n ~ '(internet|wifi)' then 'wifi'
    when n ~ '(celular|telefon|teléfon)' then 'smartphone'
    when n ~ '(salud|medic|médic|farmac)' then 'heart-pulse'
    when n ~ '(educa|curso|facu|colegio)' then 'graduation-cap'
    when n ~ '(\mhijo|\mbeb)' then 'baby'
    when n ~ '(mascota|perro|gato)' then 'paw-print'
    when n ~ '(salida|\mcine\M|\mocio\M)' then 'film'
    when n ~ 'juego' then 'gamepad-2'
    when n ~ '(\mgim|\mgym)' then 'dumbbell'
    when n ~ '(f[uú]t?bol|fulbo|deporte)' then 'volleyball'
    when n ~ 'regalo' then 'gift'
    when n ~ 'ropa' then 'shirt'
    when n ~ '(compra|personal)' then 'handbag'
    when n ~ '(tarjeta|cr[eé]dito)' then 'credit-card'
    when n ~ '(impuesto|suscrip|factura)' then 'receipt'
    when n ~ 'seguro' then 'shield'
    when n ~ '(sueldo|salario)' then 'briefcase'
    when n ~ 'freelance' then 'laptop'
    when n ~ 'efectivo' then 'banknote'
    when n ~ '(reintegro|cobro)' then 'banknote-arrow-up'
    when n ~ '(pr[eé]stamo|\mpago|deuda)' then 'banknote-arrow-down'
    when n ~ '(d[oó]lar|\musd\M)' then 'dollar-sign'
    when n ~ 'inversi' then 'trending-up'
    when n ~ 'ahorro' then 'piggy-bank'
    else 'tag'
  end
  from (select lower(p_name) as n) s
$$;

update public.categories set icon = pg_temp.icon_for_name(name) where icon is null;

alter table public.categories
  alter column icon set default 'tag',
  alter column icon set not null;

alter table public.default_categories add column icon text not null default 'tag';
update public.default_categories set icon = pg_temp.icon_for_name(name);

-- Mismas 35 keys que `CATEGORY_ICONS` en `src/lib/categoryIcons.ts` (su test compara contra esta
-- lista literal).
alter table public.categories add constraint categories_icon_set check (icon in (
  'shopping-cart', 'utensils', 'pizza', 'hamburger', 'car', 'bus', 'motorbike', 'plane',
  'house', 'zap', 'wifi', 'smartphone', 'heart-pulse', 'graduation-cap', 'baby', 'paw-print',
  'film', 'gamepad-2', 'dumbbell', 'volleyball', 'gift', 'shirt', 'handbag', 'credit-card',
  'receipt', 'shield', 'briefcase', 'laptop', 'banknote', 'banknote-arrow-up',
  'banknote-arrow-down', 'dollar-sign', 'piggy-bank', 'trending-up', 'tag'
));

alter table public.default_categories add constraint default_categories_icon_set check (icon in (
  'shopping-cart', 'utensils', 'pizza', 'hamburger', 'car', 'bus', 'motorbike', 'plane',
  'house', 'zap', 'wifi', 'smartphone', 'heart-pulse', 'graduation-cap', 'baby', 'paw-print',
  'film', 'gamepad-2', 'dumbbell', 'volleyball', 'gift', 'shirt', 'handbag', 'credit-card',
  'receipt', 'shield', 'briefcase', 'laptop', 'banknote', 'banknote-arrow-up',
  'banknote-arrow-down', 'dollar-sign', 'piggy-bank', 'trending-up', 'tag'
));

-- 3. Redefinición completa de `rpc_redeem_invite_code` (última versión en
-- `20260911010001_user_plans.sql`): lo único que cambia es que la siembra copia también `icon`.
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

  insert into public.savings_buckets (user_id, name, slug, single_currency, sort_order) values
    (v_uid, 'Fondo de emergencia', 'emergency', true, 0),
    (v_uid, 'Ahorros', 'savings', false, 1),
    (v_uid, 'Jubilación', 'retirement', false, 2);
end;
$$;
