-- Bloque 2 del plan "BASIC centrado en fijos": la categoría pasa a ser opcional en toda la app.
-- `v_spend_by_category` armaba sus filas desde `categories` con un LEFT JOIN hacia `transactions`
-- (`20260805190006_summary_views_and_projected_balance.sql`) — un gasto con `category_id null`
-- (incluidos los ajustes de saldo, que siempre tienen `category_id null`) nunca calzaba con ningún
-- `c.id` y quedaba afuera en silencio. Eso era justo lo que se quería para los ajustes ("NO cambian
-- a propósito", ver `20260806230001_balance_adjustments.sql:68`) pero ahora esconde también el gasto
-- sin categoría de un usuario real.
--
-- Se agrega una fila más, unida con UNION ALL, que suma aparte los gastos sin categoría —
-- filtrando explícitamente `not is_adjustment` para mantener a los ajustes afuera como hasta ahora
-- (si no, colarían de nuevo por la misma puerta que se les cerró en su momento). `category_id` y
-- `color` van `null` en esa fila: el cliente decide cómo mostrarlo (texto "Sin categoría", un color
-- neutro por tema) — ver `UNCATEGORIZED_ID` en `src/features/categories/api.ts`.
create or replace function public.v_spend_by_category(p_from date, p_to date)
returns table (category_id uuid, category_name text, color text, total numeric)
language sql
stable
as $$
  select * from (
    select c.id as category_id, c.name as category_name, c.color, coalesce(sum(t.amount), 0) as total
    from public.categories c
    left join public.transactions t
      on t.category_id = c.id
     and t.user_id = auth.uid()
     and t.type = 'expense'
     and t.occurred_on between p_from and p_to
    where c.user_id = auth.uid()
      and c.kind = 'expense'
    group by c.id, c.name, c.color

    union all

    select null::uuid, 'Sin categoría', null::text, coalesce(sum(t.amount), 0)
    from public.transactions t
    where t.user_id = auth.uid()
      and t.type = 'expense'
      and t.category_id is null
      and not t.is_adjustment
      and t.occurred_on between p_from and p_to
  ) s
  order by total desc
$$;

grant execute on function public.v_spend_by_category(date, date) to authenticated;
