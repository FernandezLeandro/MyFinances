-- Planes de acceso: `plan` es el nivel de la cuenta (qué pantallas ve), y va SEPARADO de `role`,
-- que sigue siendo el permiso (user/admin). Mezclarlos obligaría a tocar el gate de admin —
-- `is_admin()`, las RLS de `default_categories` y `assets` — cada vez que se agregue un plan nuevo
-- por suscripción. Así, `role` no se toca acá en absoluto.
--
-- No hace falta tocar los grants: el `grant update (display_name, fx_source, …)` de
-- 20260807010001_admin_role.sql es por columna, así que una columna nueva nace SIN permiso de
-- escritura para `authenticated`. Es la misma defensa que ya protege a `role`: la UI nunca ofrece
-- el botón, pero sin esto una cuenta podría auto-promoverse con un `.update({ plan: 'premium' })`
-- directo contra la API, y RLS por filas no lo impediría.
alter table public.profiles
  add column plan text not null default 'test' check (plan in ('test', 'basic', 'premium'));

-- Backfill: las cuentas que existen hoy son propias y de prueba, no pueden perder acceso al
-- deployar. El default de la columna queda en 'test' para las que vengan después: si el admin se
-- olvida de asignar el plan, el error es a favor de mostrar de menos, no de más.
update public.profiles set plan = 'premium';

-- El código de invitación decide con qué plan nace la cuenta que lo usa, así un amigo invitado con
-- un código 'test' ya entra restringido sin pasar por /admin/usuarios a corregirlo después.
alter table public.invite_codes
  add column plan text not null default 'test' check (plan in ('test', 'basic', 'premium'));

-- `drop` + `create`, no `create or replace`: un parámetro nuevo con default no reemplaza la
-- función, crea una sobrecarga, y las dos quedan candidatas para la misma llamada de dos
-- argumentos (error 42725, ambiguous function call). Mismo criterio que 20260807050001.
drop function public.rpc_create_invite_code(int, timestamptz);

create function public.rpc_create_invite_code(
  p_max_uses int default 1,
  p_expires_at timestamptz default null,
  p_plan text default 'test'
)
returns table (code text, max_uses int, expires_at timestamptz, plan text)
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
  -- El check de la tabla ya lo atajaría, pero como error 23514 sin nombre de plan; acá sale como
  -- P0001 'invalid_plan', que `mensajeDeError` traduce a algo legible.
  if p_plan not in ('test', 'basic', 'premium') then
    raise exception 'invalid_plan';
  end if;

  loop
    v_code := 'SALDO-' || upper(substr(md5(random()::text || clock_timestamp()::text), 1, 6));
    exit when not exists (select 1 from public.invite_codes ic where ic.code = v_code);
  end loop;

  insert into public.invite_codes (code, created_by, max_uses, expires_at, is_active, plan)
  values (v_code, auth.uid(), p_max_uses, p_expires_at, true, p_plan);

  return query select v_code, p_max_uses, p_expires_at, p_plan;
end;
$$;

-- Postgres no deja cambiar el tipo de retorno con `create or replace` (42P13), y acá se suma una
-- columna a la tabla devuelta: hay que dropear primero.
drop function public.rpc_admin_list_invite_codes();

create function public.rpc_admin_list_invite_codes()
returns table (
  code text,
  max_uses int,
  used_count int,
  expires_at timestamptz,
  is_active boolean,
  created_at timestamptz,
  plan text
)
language sql
security definer
set search_path = public
stable
as $$
  select ic.code, ic.max_uses, ic.used_count, ic.expires_at, ic.is_active, ic.created_at, ic.plan
  from public.invite_codes ic
  where public.is_admin()
  order by ic.created_at desc
$$;

-- Redefinición completa (ver 20260807010003_redeem_uses_default_categories.sql): lo único que
-- cambia es que el `update` devuelve el plan del código y el perfil nace con ese plan en vez del
-- default de la columna. El resto — validación, categorías, buckets — queda idéntico.
create or replace function public.rpc_redeem_invite_code(p_code text, p_display_name text default null)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_plan text;
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
    and (expires_at is null or expires_at > now())
  returning plan into v_plan;

  if not found then
    raise exception 'invalid_invite_code';
  end if;

  insert into public.profiles (id, display_name, plan) values (v_uid, p_display_name, v_plan);

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

grant execute on function public.rpc_create_invite_code(int, timestamptz, text) to authenticated;
grant execute on function public.rpc_admin_list_invite_codes() to authenticated;
