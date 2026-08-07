-- `role` es un campo sensible: si la policy de update de perfil no distingue columnas, cualquier
-- cuenta podría auto-promoverse llamando `.update({ role: 'admin' })` directo contra la API — la UI
-- nunca ofrecería ese botón, pero RLS por filas no protege de eso. Se resuelve a nivel de columna,
-- que Postgres soporta nativo y PostgREST respeta: se saca el UPDATE de toda la tabla y se devuelve
-- sólo en las columnas que el cliente necesita tocar. `role` queda afuera a propósito.
alter table public.profiles add column role text not null default 'user' check (role in ('user', 'admin'));

revoke update on public.profiles from authenticated;
grant update (display_name, fx_source, usd_rate_manual, usd_rate_updated_at) on public.profiles to authenticated;

create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce((select role from public.profiles where id = auth.uid()) = 'admin', false)
$$;

grant execute on function public.is_admin() to authenticated;
