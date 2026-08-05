-- Fixtures de test para los casos límite del alta por invitación: código agotado y código
-- vencido. Quedan versionados junto con TEST-DEV para poder re-testear esto en cualquier momento.
insert into public.invite_codes (code, max_uses, is_active, expires_at)
values
  ('TEST-EXHAUST', 1, true, null),
  ('TEST-EXPIRED', 100, true, '2020-01-01T00:00:00Z')
on conflict (code) do nothing;
