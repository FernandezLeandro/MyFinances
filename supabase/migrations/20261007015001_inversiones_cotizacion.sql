-- Inversiones: la cotización pasa a ser lo que se pagó por cada unidad del activo, EN PESOS ($ por
-- dólar, $ por USDT, $ por BTC). El tipo de dólar queda sólo para USD: es con el que se valúa esa
-- inversión. Un activo de mercado se valúa con el dólar que fija el admin (`assets.fx_source`), así que
-- no lo guarda. Sólo toca `investments`, que el código anterior no usa.

-- 1. Fuera el check de par «ambos o ninguno»: en mercado hay cotización sin dólar. Lo nombró Postgres;
-- se busca por definición (el único check que nombra las dos columnas).
do $$
declare
  v_name text;
begin
  for v_name in
    select c.conname
    from pg_constraint c
    where c.conrelid = 'public.investments'::regclass
      and c.contype = 'c'
      and pg_get_constraintdef(c.oid) like '%fx_source%'
      and pg_get_constraintdef(c.oid) like '%fx_rate%'
  loop
    execute format('alter table public.investments drop constraint %I', v_name);
  end loop;
end $$;

-- 2. Pesos por unidad al comprar. Más ancha: un BTC en pesos ya ronda las 10 cifras. Postgres no deja
-- cambiar el tipo de una columna que usa un trigger: se suelta y se recrea más abajo.
drop trigger investments_refs on public.investments;

alter table public.investments rename column fx_rate to buy_price;
alter table public.investments alter column buy_price type numeric(20, 4);

-- 3. Coherencia con el activo:
--  - ARS: sin dólar ni cotización, cantidad = importe.
--  - USD: dólar y cotización.
--  - Resto: cotización, sin dólar.
create or replace function public.trg_investments_refs()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_symbol text;
begin
  if new.category_id is not null then
    if not exists (
      select 1 from public.categories c where c.id = new.category_id and c.user_id = new.user_id
    ) then
      raise exception 'category_not_found';
    end if;

    if not exists (
      select 1 from public.categories c
      where c.id = new.category_id and c.user_id = new.user_id and c.kind = 'investment'
    ) then
      raise exception 'category_kind_mismatch';
    end if;
  end if;

  select a.symbol into v_symbol from public.assets a where a.id = new.asset_id;
  if not found then
    raise exception 'asset_not_found';
  end if;

  if v_symbol = 'ARS' then
    if new.fx_source is not null or new.buy_price is not null or new.quantity <> new.amount then
      raise exception 'investment_fx_invalid';
    end if;
  elsif v_symbol = 'USD' then
    if new.fx_source is null or new.buy_price is null then
      raise exception 'investment_fx_invalid';
    end if;
  elsif new.fx_source is not null or new.buy_price is null then
    raise exception 'investment_fx_invalid';
  end if;

  return new;
end;
$$;

create trigger investments_refs
before insert or update of category_id, asset_id, amount, quantity, fx_source, buy_price on public.investments
for each row execute function public.trg_investments_refs();

-- 4. Filas de mercado que ya existan: la cotización guardada era pesos por dólar; pasa a ser pesos por
-- unidad (lo pagado ÷ lo recibido) y se suelta el dólar. Idempotente.
update public.investments i
set fx_source = null,
    buy_price = round(i.amount / i.quantity, 4)
from public.assets a
where a.id = i.asset_id
  and a.symbol not in ('ARS', 'USD')
  and i.fx_source is not null;
