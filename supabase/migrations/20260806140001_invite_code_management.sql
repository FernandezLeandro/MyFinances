-- Hasta acá los códigos de invitación sólo existían si los sembraba a mano por SQL. Estas tres
-- funciones le dan a cualquier usuario autenticado su propia pantalla de invitaciones: crear,
-- listar y revocar los códigos que generó. Todas security definer porque invite_codes sigue sin
-- ninguna policy — es ilegible directo, a propósito.

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

create or replace function public.rpc_list_my_invite_codes()
returns table (code text, max_uses int, used_count int, expires_at timestamptz, is_active boolean, created_at timestamptz)
language sql
security definer
set search_path = public
stable
as $$
  select ic.code, ic.max_uses, ic.used_count, ic.expires_at, ic.is_active, ic.created_at
  from public.invite_codes ic
  where ic.created_by = auth.uid()
  order by ic.created_at desc
$$;

create or replace function public.rpc_deactivate_invite_code(p_code text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.invite_codes set is_active = false where code = p_code and created_by = auth.uid();
end;
$$;

grant execute on function public.rpc_create_invite_code(int, timestamptz) to authenticated;
grant execute on function public.rpc_list_my_invite_codes() to authenticated;
grant execute on function public.rpc_deactivate_invite_code(text) to authenticated;
