-- Perfil de usuario (1:1 con auth.users) y códigos de invitación para el alta cerrada.

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  display_name text,
  currency text not null default 'ARS',
  created_at timestamptz not null default now()
);

alter table public.profiles enable row level security;

create policy "profiles_select_own" on public.profiles
  for select using (id = auth.uid());

create policy "profiles_update_own" on public.profiles
  for update using (id = auth.uid());

-- Sin policy de insert: el perfil sólo se crea vía rpc_redeem_invite_code (security definer),
-- nunca directo desde el cliente.

create table public.invite_codes (
  code text primary key,
  created_by uuid references auth.users (id),
  max_uses int not null default 1 check (max_uses > 0),
  used_count int not null default 0 check (used_count >= 0),
  expires_at timestamptz,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

alter table public.invite_codes enable row level security;
-- Sin ninguna policy a propósito: la tabla queda invisible para anon/authenticated.
-- Sólo la leen y escriben las funciones security definer de la migración de invitaciones.
