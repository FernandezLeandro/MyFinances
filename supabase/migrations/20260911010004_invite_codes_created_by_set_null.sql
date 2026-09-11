-- `rpc_admin_delete_user`/`rpc_admin_delete_users` (20260911010003) fallan con FK violation al
-- intentar borrar cualquier cuenta que haya generado invitaciones: a diferencia de todas las demás
-- tablas, `invite_codes.created_by` referencia `auth.users (id)` sin `on delete cascade` (quedó así
-- desde 20260805190001, de cuando cada cuenta podía crear sus propios códigos). Borrar la cuenta no
-- debería llevarse puestos los códigos que ya se usaron o siguen activos — sólo perder el rastro de
-- quién los creó — así que `set null`, no `cascade`.
alter table public.invite_codes
  drop constraint invite_codes_created_by_fkey,
  add constraint invite_codes_created_by_fkey
    foreign key (created_by) references auth.users (id) on delete set null;
