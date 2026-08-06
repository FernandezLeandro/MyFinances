-- El precio manual de un activo se guardaba ya convertido a ARS, congelado con el dólar del momento
-- en que se cargó — cambiar la fuente del dólar después no lo recalculaba, daba la sensación de que
-- Patrimonio "no se movía". Pasa a guardarse en la moneda NATIVA del activo (`assets.quote_currency`)
-- y la conversión a ARS se hace en vivo, en `useAssetPrices`, igual que ya se hace con USD.
alter table public.asset_manual_prices rename column price_ars to price;

-- Los valores ya cargados para activos en USD quedaban mal interpretados con el nuevo significado
-- (eran ARS, no USD) — se limpian para que el usuario los vuelva a cargar una vez. Los que cotizan
-- en ARS no cambian de significado, quedan como estaban.
delete from public.asset_manual_prices amp
using public.assets a
where amp.asset_id = a.id and a.quote_currency = 'USD';
