-- Cotización del dólar para valuar Patrimonio en la moneda principal (ARS). `fx_source` elige qué
-- casa de dolarapi.com se usa; `usd_rate_manual` es el respaldo si la API falla o el usuario
-- prefiere pisarla a mano — en ese caso `fx_source` pasa a 'manual'.
alter table public.profiles
  add column fx_source text not null default 'blue'
    check (fx_source in ('oficial', 'blue', 'bolsa', 'cripto', 'manual')),
  add column usd_rate_manual numeric(14, 4),
  add column usd_rate_updated_at timestamptz;

-- rpc_redeem_invite_code pasa a sembrar también los 3 ítems de Patrimonio, igual que ya siembra las
-- categorías. Redefinición completa de la función (ver 20260805190007_invite_code_functions.sql).
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

  insert into public.savings_buckets (user_id, name, slug, single_currency, sort_order) values
    (v_uid, 'Fondo de emergencia', 'emergency', true, 0),
    (v_uid, 'Ahorros', 'savings', false, 1),
    (v_uid, 'Jubilación', 'retirement', false, 2);
end;
$$;

-- Backfill: las cuentas que ya existían antes de esta migración (la mía y las de test) se quedan
-- sin ítems si no se hace explícito, porque su alta ya corrió con la versión vieja de la función.
insert into public.savings_buckets (user_id, name, slug, single_currency, sort_order)
select p.id, v.name, v.slug, v.single_currency, v.sort_order
from public.profiles p
cross join (
  values
    ('Fondo de emergencia', 'emergency', true, 0),
    ('Ahorros', 'savings', false, 1),
    ('Jubilación', 'retirement', false, 2)
) as v(name, slug, single_currency, sort_order)
on conflict (user_id, slug) do nothing;
