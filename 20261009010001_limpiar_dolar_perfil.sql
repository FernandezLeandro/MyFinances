-- Limpieza del «Dólar en uso» del perfil: Inversiones pasa a USD con el dólar de cada inversión y la
-- cotización manual de respaldo se saca (si dolarapi.com falla, se muestra «Cotización no disponible»).
--
-- ¡NO aplicar antes de desplegar el código nuevo! El código viejo lee `profiles.fx_source` y
-- `usd_rate_manual` y `useDollarQuotes` los usa para valuar. Orden:
--   1. desplegar el código
--   2. aplicar esta (las columnas se van con sus checks y grants; el perfil se lee con `select('*')`)

alter table public.profiles
  drop column fx_source,
  drop column usd_rate_manual,
  drop column usd_rate_updated_at;
