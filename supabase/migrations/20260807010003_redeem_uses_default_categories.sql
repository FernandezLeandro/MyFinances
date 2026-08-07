-- Redefinición completa (ver 20260806150002_profile_fx_and_seed_buckets.sql): las categorías ya no
-- se insertan hardcodeadas, se leen de `default_categories` — el resto de la función (buckets de
-- Patrimonio, validación del código) queda idéntico.
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

  insert into public.categories (user_id, name, kind, color)
  select v_uid, dc.name, dc.kind, dc.color
  from public.default_categories dc
  where not dc.is_archived
  order by dc.sort_order;

  insert into public.savings_buckets (user_id, name, slug, single_currency, sort_order) values
    (v_uid, 'Fondo de emergencia', 'emergency', true, 0),
    (v_uid, 'Ahorros', 'savings', false, 1),
    (v_uid, 'Jubilación', 'retirement', false, 2);
end;
$$;
