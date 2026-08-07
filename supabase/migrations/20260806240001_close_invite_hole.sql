-- El alta por invitación no se aplicaba de verdad: `supabase.auth.signUp()` es un endpoint público
-- de Supabase, y nada obligaba a llamar `rpc_redeem_invite_code` después. Una cuenta sin perfil
-- podía insertar en el catálogo global de activos y emitir sus propios códigos de invitación. Esto
-- lo cierra del lado del servidor — la única defensa que no se puede sortear manipulando el cliente
-- (el guard de `/bienvenida` en el front es UX, no seguridad; esto es lo que de verdad protege).
create or replace function public.has_profile()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (select 1 from public.profiles where id = auth.uid())
$$;

grant execute on function public.has_profile() to authenticated;

drop policy "assets_insert_global" on public.assets;
create policy "assets_insert_global" on public.assets
  for insert with check (auth.uid() is not null and user_id is null and public.has_profile());

drop policy "assets_update_global" on public.assets;
create policy "assets_update_global" on public.assets
  for update using (auth.uid() is not null and user_id is null and public.has_profile());

-- Redefinición completa (ver 20260806140001_invite_code_management.sql): suma la validación de
-- perfil antes de emitir un código nuevo.
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
  if not public.has_profile() then
    raise exception 'no_profile';
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
