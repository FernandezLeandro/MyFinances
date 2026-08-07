-- La policy anterior (20260807040001) sólo exigía user_id null + is_admin() — eso deja borrar ARS/USD
-- por API directa aunque la UI oculte el botón para 'fiat' (ver AssetCatalogList). ARS/USD son la
-- base de toda la conversión de moneda de la app; su borrado no puede depender de una restricción
-- sólo de UI. Se agrega la exclusión acá, en la base, que es lo único que de verdad protege.
drop policy "assets_delete_global" on public.assets;
create policy "assets_delete_global" on public.assets
  for delete using (user_id is null and asset_class <> 'fiat' and public.is_admin());
