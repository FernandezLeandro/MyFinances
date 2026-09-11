-- Gestión de usuarios para el admin: hoy no existe ninguna forma de ver quién se registró más allá
-- de mirar el `used_count` de cada código de invitación. Mismo patrón que las RPC de invitaciones
-- de 20260807010004: `security definer` + chequeo de `is_admin()` adentro, nunca RLS por filas
-- (estas funciones necesitan ver TODAS las cuentas, no sólo la propia).

-- El email y `last_sign_in_at` viven en `auth.users`, invisible para el cliente — sólo una función
-- security definer puede unir eso con `profiles`. `transaction_count` es la señal más simple de
-- "está probando la app de verdad" vs. "se registró y no volvió".
create function public.rpc_admin_list_users()
returns table (
  id uuid,
  email text,
  display_name text,
  role text,
  plan text,
  created_at timestamptz,
  last_sign_in_at timestamptz,
  transaction_count bigint
)
language sql
security definer
set search_path = public
stable
as $$
  select
    p.id,
    u.email,
    p.display_name,
    p.role,
    p.plan,
    p.created_at,
    u.last_sign_in_at,
    (select count(*) from public.transactions t where t.user_id = p.id)
  from public.profiles p
  join auth.users u on u.id = p.id
  where public.is_admin()
  order by p.created_at desc
$$;

create function public.rpc_admin_set_user_plan(p_user_id uuid, p_plan text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_admin() then
    raise exception 'not_admin';
  end if;
  if p_plan not in ('test', 'basic', 'premium') then
    raise exception 'invalid_plan';
  end if;

  update public.profiles set plan = p_plan where id = p_user_id;
end;
$$;

-- La guarda de `p_user_id = auth.uid()` no es paranoia: sin esto el admin puede sacarse el rol a sí
-- mismo desde su propia UI y quedar sin forma de volver a /admin (RequireAdmin lo rebota a /hoy, y
-- ahí no hay ningún botón para volver a promoverse). Revertirlo requeriría otra migración a mano.
create function public.rpc_admin_set_user_role(p_user_id uuid, p_role text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_admin() then
    raise exception 'not_admin';
  end if;
  if p_role not in ('user', 'admin') then
    raise exception 'invalid_role';
  end if;
  if p_user_id = auth.uid() and p_role <> 'admin' then
    raise exception 'cannot_demote_self';
  end if;

  update public.profiles set role = p_role where id = p_user_id;
end;
$$;

grant execute on function public.rpc_admin_list_users() to authenticated;
grant execute on function public.rpc_admin_set_user_plan(uuid, text) to authenticated;
grant execute on function public.rpc_admin_set_user_role(uuid, text) to authenticated;
