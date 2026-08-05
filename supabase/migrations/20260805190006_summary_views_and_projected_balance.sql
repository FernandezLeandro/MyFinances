-- Funciones de lectura agregada. SECURITY INVOKER (el default): corren con los permisos y las
-- políticas RLS de quien llama, así que el filtro explícito por auth.uid() es cinturón y tirantes,
-- no la única defensa.

create or replace function public.v_monthly_summary(p_period date)
returns table (total_income numeric, total_expense numeric, balance numeric)
language sql
stable
as $$
  select
    coalesce(sum(amount) filter (where type = 'income'), 0) as total_income,
    coalesce(sum(amount) filter (where type = 'expense'), 0) as total_expense,
    coalesce(sum(case when type = 'income' then amount else -amount end), 0) as balance
  from public.transactions
  where user_id = auth.uid()
    and occurred_on >= date_trunc('month', p_period)::date
    and occurred_on < (date_trunc('month', p_period) + interval '1 month')::date
$$;

create or replace function public.v_spend_by_category(p_from date, p_to date)
returns table (category_id uuid, category_name text, color text, total numeric)
language sql
stable
as $$
  select c.id, c.name, c.color, coalesce(sum(t.amount), 0) as total
  from public.categories c
  left join public.transactions t
    on t.category_id = c.id
   and t.user_id = auth.uid()
   and t.type = 'expense'
   and t.occurred_on between p_from and p_to
  where c.user_id = auth.uid()
    and c.kind = 'expense'
  group by c.id, c.name, c.color
  order by total desc
$$;

-- La métrica estrella de la app: saldo actual menos los fijos activos del período que todavía
-- no tienen un pago registrado.
create or replace function public.rpc_projected_balance(p_period date)
returns numeric
language sql
stable
as $$
  select
    (
      select coalesce(sum(case when type = 'income' then amount else -amount end), 0)
      from public.transactions
      where user_id = auth.uid()
    )
    -
    (
      select coalesce(sum(fe.amount), 0)
      from public.fixed_expenses fe
      where fe.user_id = auth.uid()
        and fe.is_active
        and fe.starts_on <= (date_trunc('month', p_period) + interval '1 month - 1 day')::date
        and (fe.ends_on is null or fe.ends_on >= date_trunc('month', p_period)::date)
        and not exists (
          select 1 from public.fixed_expense_payments fep
          where fep.fixed_expense_id = fe.id
            and fep.period = date_trunc('month', p_period)::date
        )
    )
$$;

grant execute on function public.v_monthly_summary(date) to authenticated;
grant execute on function public.v_spend_by_category(date, date) to authenticated;
grant execute on function public.rpc_projected_balance(date) to authenticated;
