-- Catálogo de categorías que se siembran a cada cuenta nueva. Hasta ahora estaban hardcodeadas
-- dentro de `rpc_redeem_invite_code`; pasan a vivir acá, gestionables por el admin. A diferencia de
-- `assets`, no hace falta la dualidad global/por-cuenta (`user_id` nullable): las categorías
-- *personales* ya viven en `categories`, esto es sólo la plantilla — 100% admin, ni lectura para
-- cuentas comunes (sólo la consume `rpc_redeem_invite_code`, que es SECURITY DEFINER).
create table public.default_categories (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  kind text not null check (kind in ('income', 'expense')),
  color text not null,
  sort_order int not null default 0,
  is_archived boolean not null default false,
  created_at timestamptz not null default now()
);

alter table public.default_categories enable row level security;

create policy "default_categories_select_admin" on public.default_categories
  for select using (public.is_admin());

create policy "default_categories_insert_admin" on public.default_categories
  for insert with check (public.is_admin());

create policy "default_categories_update_admin" on public.default_categories
  for update using (public.is_admin());

create policy "default_categories_delete_admin" on public.default_categories
  for delete using (public.is_admin());

-- Mismas 8 categorías que ya sembraba rpc_redeem_invite_code — nada cambia para un alta nueva hasta
-- que el admin las toque.
insert into public.default_categories (name, kind, color, sort_order) values
  ('Sueldo', 'income', '#C8F751', 0),
  ('Freelance', 'income', '#9BBF46', 1),
  ('Supermercado', 'expense', '#5FD3C4', 2),
  ('Transporte', 'expense', '#6FB4F0', 3),
  ('Salidas', 'expense', '#F2789F', 4),
  ('Servicios', 'expense', '#FFC46B', 5),
  ('Salud', 'expense', '#A892F0', 6),
  ('Hogar', 'expense', '#D9C9A3', 7);
