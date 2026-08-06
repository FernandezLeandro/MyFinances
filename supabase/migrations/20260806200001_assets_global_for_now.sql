-- Decisión temporal: por ahora cualquier activo que se agregue queda GLOBAL (visible para todas las
-- cuentas), no privado del que lo creó. Se puede revisar más adelante si hace falta volver a activos
-- por cuenta — el modelo (user_id nullable + catálogo global) ya lo soporta sin cambiar el esquema,
-- sólo cambia quién puede insertar con user_id null.
drop policy "assets_insert_own" on public.assets;

create policy "assets_insert_global" on public.assets
  for insert with check (auth.uid() is not null and user_id is null);

-- Los activos que ya se habían agregado como propios (de pruebas de esta sesión) pasan a globales
-- también. Distintas cuentas de test crearon el mismo símbolo por separado (ej. "AL30" dos veces),
-- así que no alcanza un UPDATE plano — hay que fusionar por símbolo: quedarse con una sola fila,
-- repuntar lo que la referenciaba (aportes y precios manuales) y borrar las sobrantes.
do $$
declare
  r record;
  keep_id uuid;
begin
  for r in select distinct symbol from public.assets where user_id is not null loop
    select id into keep_id from public.assets where symbol = r.symbol and user_id is null limit 1;

    if keep_id is null then
      select id into keep_id from public.assets where symbol = r.symbol and user_id is not null order by created_at asc limit 1;
      update public.assets set user_id = null where id = keep_id;
    end if;

    update public.savings_entries
    set asset_id = keep_id
    where asset_id in (select id from public.assets where symbol = r.symbol and user_id is not null and id <> keep_id);

    update public.asset_manual_prices
    set asset_id = keep_id
    where asset_id in (select id from public.assets where symbol = r.symbol and user_id is not null and id <> keep_id);

    delete from public.assets where symbol = r.symbol and user_id is not null and id <> keep_id;
  end loop;
end $$;
