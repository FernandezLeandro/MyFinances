-- Precio automático de las acciones desde Yahoo. Yahoo no manda CORS (el navegador no puede leer la
-- respuesta), así que lo trae la base: un job de pg_cron llama a Yahoo con la extensión `http` y escribe
-- `assets.price_usd` / `price_updated_at`, las mismas columnas que antes cargaba el admin a mano. El front
-- de Inversiones no cambia. Si Yahoo falla, queda el último precio con su fecha.

-- 1. Fuente nueva. El check es el inline de `20260806160001_assets.sql`; Postgres lo nombró así.
alter table public.assets drop constraint assets_price_source_check;
alter table public.assets add constraint assets_price_source_check
  check (price_source in ('coingecko', 'manual', 'yahoo'));

-- 2. Las acciones del catálogo pasan a Yahoo. Por símbolo: en una base sin esas filas no hace nada.
update public.assets
set price_source = 'yahoo'
where user_id is null
  and symbol in ('AAPL', 'AMD', 'BABA', 'MELI', 'SPY');

-- 3. Extensiones, como las habilita Supabase.
create extension if not exists http with schema extensions;
create extension if not exists pg_cron with schema pg_catalog;
grant usage on schema cron to postgres;
grant all privileges on all tables in schema cron to postgres;

-- 4. Una sola llamada a `v7/finance/spark` trae todos los símbolos. Sin `User-Agent` Yahoo responde 429.
-- Un ticker que Yahoo no conoce no aparece en la respuesta: su precio queda como estaba. Sólo se guarda
-- un precio en USD (un ticker `.BA` viene en pesos y no es `price_usd`).
-- No es `security definer`: la corre el cron como `postgres`, dueño de la tabla, que no pasa por RLS.
-- ponytail: spark acepta ~20 símbolos por llamada; partir en tandas si el catálogo crece.
create or replace function public.refresh_yahoo_prices()
returns void
language plpgsql
set search_path = public, extensions
as $$
declare
  v_symbols text;
  v_res http_response;
  v_item jsonb;
  v_meta jsonb;
begin
  -- El símbolo va a la URL: sólo tickers limpios.
  select string_agg(a.symbol, ',' order by a.symbol) into v_symbols
  from public.assets a
  where a.price_source = 'yahoo'
    and a.user_id is null
    and a.symbol ~ '^[A-Z0-9.-]+$';
  if v_symbols is null then
    return;
  end if;

  v_res := http((
    'GET',
    'https://query1.finance.yahoo.com/v7/finance/spark?range=1d&interval=1d&symbols=' || v_symbols,
    array[('User-Agent', 'Mozilla/5.0')::http_header],
    null,
    null
  )::http_request);

  if v_res.status <> 200 then
    raise warning 'refresh_yahoo_prices: Yahoo respondió %', v_res.status;
    return;
  end if;

  for v_item in select jsonb_array_elements(v_res.content::jsonb -> 'spark' -> 'result') loop
    v_meta := v_item -> 'response' -> 0 -> 'meta';
    update public.assets
    set price_usd = (v_meta ->> 'regularMarketPrice')::numeric,
        price_updated_at = to_timestamp((v_meta ->> 'regularMarketTime')::bigint)
    where user_id is null
      and price_source = 'yahoo'
      and symbol = v_item ->> 'symbol'
      and v_meta ->> 'currency' = 'USD'
      and (v_meta ->> 'regularMarketPrice')::numeric > 0;
  end loop;
end;
$$;

-- 5. Nadie la llama desde el cliente: sólo el cron.
revoke execute on function public.refresh_yahoo_prices() from public, anon, authenticated;

-- 6. Cada 30 min, lunes a viernes, 13 a 21 UTC: el horario de NYSE con y sin horario de verano, más
-- una corrida después del cierre. Con nombre, volver a programarla la reemplaza.
select cron.schedule('refresh-yahoo-prices', '*/30 13-21 * * 1-5', 'select public.refresh_yahoo_prices()');
