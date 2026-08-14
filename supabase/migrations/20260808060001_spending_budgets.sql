-- Gasto variable estimado (hoy sólo "Comida"): a diferencia de un gasto fijo, no tiene vencimiento
-- ni se marca como pagado — es un monto mensual estimado que el saldo proyectado descuenta al
-- RITMO DIARIO, multiplicado por los días que faltan del mes (hoy incluido). No es un techo: a
-- propósito NO lee `transactions`, así que si el mes viene gastado de más el proyectado lo refleja
-- en vez de fingir que el gasto se frena al llegar al presupuesto. Consecuencia directa: no hace
-- falta elegir qué categoría cuenta como "comida", ni mantener esa elección sincronizada.
--
-- `unique (user_id)`: una sola fila por cuenta (ya de paso hace de índice). Si algún día se quieren
-- varios presupuestos a la vez, se cae el `unique` y el término de más abajo pasa a `sum(amount)`.
create table public.spending_budgets (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique references auth.users (id) on delete cascade,
  name text not null default 'Comida',
  amount numeric(12, 2) not null default 0 check (amount >= 0),
  updated_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

alter table public.spending_budgets enable row level security;

create policy "spending_budgets_select_own" on public.spending_budgets
  for select using (user_id = auth.uid());

create policy "spending_budgets_insert_own" on public.spending_budgets
  for insert with check (user_id = auth.uid());

create policy "spending_budgets_update_own" on public.spending_budgets
  for update using (user_id = auth.uid());

create policy "spending_budgets_delete_own" on public.spending_budgets
  for delete using (user_id = auth.uid());

-- Cuarto término del saldo proyectado: el gasto variable estimado que todavía falta "gastar" este
-- mes, al ritmo diario. Los tres términos anteriores quedan intactos (ver
-- 20260808020003_projected_balance_con_creditos.sql para su historia).
--
-- El `coalesce` envuelve TODO el subquery, no sólo el `sum` de adentro (a diferencia de los otros
-- tres términos): sin fila de presupuesto el escalar da NULL, y `X - NULL` en SQL es NULL — dejaría
-- el saldo proyectado entero en null en vez de simplemente no descontar nada.
create or replace function public.rpc_projected_balance(p_period date)
returns numeric
language sql
stable
set search_path = public
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
    -
    (
      select coalesce(sum(vci.amount), 0)
      from public.v_credit_installments(p_period) vci
      where not exists (
        select 1 from public.credit_card_payments ccp
        where ccp.card_id = vci.card_id
          and ccp.period = date_trunc('month', p_period)::date
      )
    )
    -
    coalesce((
      select round(
        sb.amount * (
          case
            -- Mes ya cerrado: no queda nada por gastar.
            when date_trunc('month', p_period) < date_trunc('month', current_date) then 0
            -- Mes futuro: el mes entero por delante.
            when date_trunc('month', p_period) > date_trunc('month', current_date) then 1
            -- Mes en curso: la fracción de días que falta, hoy incluido.
            else (
              extract(day from (date_trunc('month', current_date) + interval '1 month - 1 day'))
              - extract(day from current_date) + 1
            ) / extract(day from (date_trunc('month', current_date) + interval '1 month - 1 day'))
          end
        ),
        2
      )
      from public.spending_budgets sb
      where sb.user_id = auth.uid()
    ), 0)
$$;

grant execute on function public.rpc_projected_balance(date) to authenticated;
