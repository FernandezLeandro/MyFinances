-- Saldo actual: todo lo que entró menos todo lo que salió, histórico completo. Separado a
-- propósito de rpc_projected_balance (que además descuenta los fijos pendientes): el hero de
-- "Hoy" muestra este; el de "Fijos" (Bloque 3) muestra el otro.
create or replace function public.rpc_current_balance()
returns numeric
language sql
stable
as $$
  select coalesce(sum(case when type = 'income' then amount else -amount end), 0)
  from public.transactions
  where user_id = auth.uid()
$$;

grant execute on function public.rpc_current_balance() to authenticated;
