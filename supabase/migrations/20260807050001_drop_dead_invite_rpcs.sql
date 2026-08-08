-- Las invitaciones pasaron a ser exclusivas del admin en 20260807010004_admin_only_assets_and_invites,
-- que reemplazó la gestión "cada cuenta la suya" por rpc_admin_list_invite_codes /
-- rpc_admin_delete_invite_code. Estas dos quedaron sin ningún consumidor en el cliente desde
-- entonces, pero seguían siendo `security definer` invocables por cualquier cuenta autenticada sobre
-- `invite_codes` — una tabla deliberadamente sin ninguna policy propia (ver 20260806140001), así que
-- eran las dos únicas puertas de una cuenta común a esa tabla. Sin consumidor, no hay motivo para
-- mantener la superficie.
drop function if exists public.rpc_list_my_invite_codes();
drop function if exists public.rpc_deactivate_invite_code(text);
