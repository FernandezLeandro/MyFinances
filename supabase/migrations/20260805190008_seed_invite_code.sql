-- Código de prueba para cerrar el Bloque 1: dar de alta dos cuentas y verificar el aislamiento
-- entre ellas. La pantalla para generar códigos nuevos llega en el Bloque 5.
insert into public.invite_codes (code, max_uses, is_active)
values ('SALDO-FAMILIA', 5, true)
on conflict (code) do nothing;
