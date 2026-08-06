-- Limpieza de activos creados durante el testing de esta sesión (AL30, ZZZTEST, GLOBALTEST...), que
-- quedaron visibles en el catálogo global para todas las cuentas tras el cambio de la migración
-- anterior. Se borran por id explícito, no por patrón, para no arriesgar ningún activo real.
delete from public.asset_manual_prices
where asset_id in (
  '5ce8904d-1855-499c-b472-89dd247c080f', -- AL30
  '51038633-8c1b-4758-a210-8e07d6e3b2ce', -- ZZZTEST
  'd00ebf83-04d8-4f7f-8f54-b678acf06c82'  -- GLOBALTEST1786040331331
);

delete from public.savings_entries
where asset_id in (
  '5ce8904d-1855-499c-b472-89dd247c080f',
  '51038633-8c1b-4758-a210-8e07d6e3b2ce',
  'd00ebf83-04d8-4f7f-8f54-b678acf06c82'
);

delete from public.assets
where id in (
  '5ce8904d-1855-499c-b472-89dd247c080f',
  '51038633-8c1b-4758-a210-8e07d6e3b2ce',
  'd00ebf83-04d8-4f7f-8f54-b678acf06c82'
);
