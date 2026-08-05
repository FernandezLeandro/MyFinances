-- Código separado del real (SALDO-FAMILIA): así los tests de registro no le gastan usos al
-- código que de verdad va a usar la familia. Alto max_uses a propósito, para no tener que
-- tocarlo mientras se prueba el flujo de alta una y otra vez.
insert into public.invite_codes (code, max_uses, is_active)
values ('TEST-DEV', 1000, true)
on conflict (code) do nothing;
