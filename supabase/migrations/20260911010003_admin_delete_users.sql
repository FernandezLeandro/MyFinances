-- Borrado de cuentas, individual y masivo — hacía falta para limpiar las cuentas TEST de prueba una
-- vez usadas. Mismo patrón que el resto de `rpc_admin_*`: security definer + `is_admin()` adentro.
--
-- Borra directo de `auth.users`, no de `profiles`: todas las tablas por usuario referencian
-- `auth.users (id)` con `on delete cascade` (`profiles`, `transactions`, `categories`,
-- `fixed_expenses`, `savings_buckets`, `credit_cards`, `balance_locations`, `receivables`, etc. —
-- ver el grep de "on delete cascade" contra `auth.users` en cualquier migración con `user_id`), así
-- que un solo delete ahí abajo se lleva puesto todo lo que esa cuenta cargó. Borrar sólo `profiles`
-- dejaría la cuenta de auth huérfana, capaz de loguearse de nuevo con un perfil vacío.

create function public.rpc_admin_delete_user(p_user_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_admin() then
    raise exception 'not_admin';
  end if;
  -- Mismo motivo que la guarda de `rpc_admin_set_user_role`: sin esto el admin podría borrarse a sí
  -- mismo y quedar sin ninguna cuenta admin para revertirlo.
  if p_user_id = auth.uid() then
    raise exception 'cannot_delete_self';
  end if;

  delete from auth.users where id = p_user_id;
end;
$$;

-- Versión masiva: misma función, un array. `= any(...)`, no un loop — un solo delete cascada mejor
-- que N.
create function public.rpc_admin_delete_users(p_user_ids uuid[])
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_admin() then
    raise exception 'not_admin';
  end if;
  if auth.uid() = any(p_user_ids) then
    raise exception 'cannot_delete_self';
  end if;

  delete from auth.users where id = any(p_user_ids);
end;
$$;

grant execute on function public.rpc_admin_delete_user(uuid) to authenticated;
grant execute on function public.rpc_admin_delete_users(uuid[]) to authenticated;
