-- rpc_check_invite_code: valida sin consumir. La llama el formulario de registro, antes de crear
-- la cuenta, para dar feedback inmediato. Corre security definer porque invite_codes no tiene
-- ninguna policy (es ilegible directo) y todavía no hay usuario autenticado en ese momento.
create or replace function public.rpc_check_invite_code(p_code text)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1 from public.invite_codes
    where code = p_code
      and is_active
      and used_count < max_uses
      and (expires_at is null or expires_at > now())
  );
$$;

grant execute on function public.rpc_check_invite_code(text) to anon, authenticated;

-- rpc_redeem_invite_code: la llama el cliente inmediatamente después de que supabase.auth.signUp()
-- crea la cuenta. Consume el código, crea el perfil y siembra las categorías iniciales en una sola
-- transacción (las funciones de Postgres son atómicas: si el código ya no es válido, todo se revierte
-- y el `insert` de perfil y categorías nunca llega a pasar).
create or replace function public.rpc_redeem_invite_code(p_code text, p_display_name text default null)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
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
    and (expires_at is null or expires_at > now());

  if not found then
    raise exception 'invalid_invite_code';
  end if;

  insert into public.profiles (id, display_name) values (v_uid, p_display_name);

  insert into public.categories (user_id, name, kind, color) values
    (v_uid, 'Sueldo', 'income', '#C8F751'),
    (v_uid, 'Freelance', 'income', '#9BBF46'),
    (v_uid, 'Supermercado', 'expense', '#5FD3C4'),
    (v_uid, 'Transporte', 'expense', '#6FB4F0'),
    (v_uid, 'Salidas', 'expense', '#F2789F'),
    (v_uid, 'Servicios', 'expense', '#FFC46B'),
    (v_uid, 'Salud', 'expense', '#A892F0'),
    (v_uid, 'Hogar', 'expense', '#D9C9A3');
end;
$$;

grant execute on function public.rpc_redeem_invite_code(text, text) to authenticated;
