-- AN-01 del QA de Análisis: la rama "categorizada" de `v_spend_by_category` sumaba cualquier gasto
-- de la categoría sin mirar `is_adjustment` — sólo la rama "Sin categoría" filtraba. Un ajuste de
-- saldo con categoría (por API, o uno viejo de antes de que MO-08 bloqueara editarlos) entraba al
-- hero, al donut, al Top y al promedio, pero no a "Fijo vs. variable" (que sí lo excluye en el
-- cliente), y su fila seguía diciendo "afuera de Análisis". Se suma `not t.is_adjustment` al
-- `left join`, así los ajustes quedan afuera por las dos puertas — mismo criterio que
-- `v_range_summary` y `rpc_monthly_series`. Resto idéntico a `20260912020001`.
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
     and not t.is_adjustment
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
