-- Mismo problema que ya se resolvió para el insert: la policy de update seguía exigiendo
-- `user_id = auth.uid()`, algo que ninguna fila puede cumplir ahora que todos los activos son
-- globales (`user_id` null). Sin esto, nadie puede editar ni un activo agregado por otra cuenta ni
-- uno propio ya "globalizado".
drop policy "assets_update_own" on public.assets;

create policy "assets_update_global" on public.assets
  for update using (auth.uid() is not null and user_id is null);
