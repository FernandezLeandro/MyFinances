-- Tercer término del saldo proyectado: la cuota de este mes de las tarjetas que TODAVÍA no están
-- pagadas. Se resta el TOTAL de la cuota, no el neto de lo guardado (decisión 3 del plan) — esa
-- plata ya está adentro del saldo actual (primer término), restar sólo el neto la contaría dos
-- veces. `not exists` es POR TARJETA: marcar una tarjeta como pagada apaga TODAS sus cuotas del mes
-- de un saque, sin importar cuántas compras la componen.
--
-- Migración separada y revertible a propósito: es el único cambio de este feature que toca
-- comportamiento ya existente (el resto son tablas y funciones nuevas). Hereda tal cual la
-- semántica ya rara que la función tenía para meses futuros —el minuendo (primer término) es el
-- saldo histórico completo, sin ningún tope de fecha— porque arreglar eso es un cambio de
-- semántica de la métrica estrella que merece su propio PR, no colarse acá.
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
$$;
