-- Activos e invitaciones pasan de "cualquier cuenta con perfil" a "sólo el admin". El precio manual
-- por cuenta (asset_manual_prices) no se toca acá — eso sigue siendo de cada cuenta.
drop policy "assets_insert_global" on public.assets;
create policy "assets_insert_global" on public.assets
  for insert with check (user_id is null and public.is_admin());

drop policy "assets_update_global" on public.assets;
create policy "assets_update_global" on public.assets
  for update using (user_id is null and public.is_admin());

create or replace function public.rpc_create_invite_code(p_max_uses int default 1, p_expires_at timestamptz default null)
returns table (code text, max_uses int, expires_at timestamptz)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_code text;
begin
  if auth.uid() is null then
    raise exception 'not_authenticated';
  end if;
  if not public.is_admin() then
    raise exception 'not_admin';
  end if;
  if p_max_uses < 1 then
    raise exception 'invalid_max_uses';
  end if;

  loop
    v_code := 'SALDO-' || upper(substr(md5(random()::text || clock_timestamp()::text), 1, 6));
    exit when not exists (select 1 from public.invite_codes ic where ic.code = v_code);
  end loop;

  insert into public.invite_codes (code, created_by, max_uses, expires_at, is_active)
  values (v_code, auth.uid(), p_max_uses, p_expires_at, true);

  return query select v_code, p_max_uses, p_expires_at;
end;
$$;

-- El admin ve TODAS las invitaciones del sistema, no sólo las que él creó — a diferencia de
-- rpc_list_my_invite_codes, que sigue existiendo tal cual para el caso "cuentas viejas que ya
-- habían generado códigos antes de este cambio" (por si hace falta consultarlo).
create or replace function public.rpc_admin_list_invite_codes()
returns table (code text, max_uses int, used_count int, expires_at timestamptz, is_active boolean, created_at timestamptz)
language sql
security definer
set search_path = public
stable
as $$
  select ic.code, ic.max_uses, ic.used_count, ic.expires_at, ic.is_active, ic.created_at
  from public.invite_codes ic
  where public.is_admin()
  order by ic.created_at desc
$$;

-- Elimina de verdad, no desactiva. `invite_codes` no tiene FK entrante desde `profiles` (el redeem
-- sólo incrementa used_count e inserta el perfil aparte), así que borrar un código no afecta a las
-- cuentas que ya lo usaron.
create or replace function public.rpc_admin_delete_invite_code(p_code text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_admin() then
    raise exception 'not_admin';
  end if;
  delete from public.invite_codes where code = p_code;
end;
$$;

grant execute on function public.rpc_admin_list_invite_codes() to authenticated;
grant execute on function public.rpc_admin_delete_invite_code(text) to authenticated;
