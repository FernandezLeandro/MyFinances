-- Falta la policy de delete para el catálogo global (assets_insert_global/assets_update_global ya
-- existían) — mismo criterio: sólo el admin, sólo filas globales (user_id is null). Si algún activo
-- está en uso en savings_entries, el FK sin "on delete" (default RESTRICT) frena el borrado con un
-- error claro en vez de arrastrar movimientos de cualquier cuenta.
create policy "assets_delete_global" on public.assets
  for delete using (user_id is null and public.is_admin());
