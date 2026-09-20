-- Archivar una cuenta la saca del saldo.
--
-- Hasta acá (`20260919010001_cuentas_saldo_y_reajuste.sql`) el saldo de la app era la suma de TODAS
-- las cuentas, archivadas incluidas: archivar sólo la sacaba de los selectores. Desde esta migración
-- el saldo es la suma de las cuentas ACTIVAS; una archivada deja de contar hasta que se reactiva.
--
-- Qué NO cambia:
--   * `rpc_account_balances` sigue devolviendo el saldo derivado de todas, archivadas incluidas: la
--     pantalla de Cuentas lo muestra en la lista de Archivadas y es lo que vuelve a sumar al reactivar.
--   * `rpc_projected_balance_range` parte de `rpc_current_balance()`, así que hereda el cambio sin
--     tocarse.
--   * Sin ninguna cuenta el saldo sigue siendo la suma de movimientos (Básico y los Test sin cuentas
--     no cambian).
--
-- Consecuencias a tener presentes:
--   * Una transferencia entre una cuenta activa y una archivada ya no se netea: la punta activa
--     suma o resta y la archivada no cuenta, así que el total se mueve. Es lo esperable — esa plata
--     salió del conjunto que se cuenta.
--   * Con cuentas pero TODAS archivadas (se puede llegar eliminando la última activa) el saldo es 0:
--     no hay nada que contar. No cae en la suma de movimientos, que ignora aperturas.
--   * Quien tenga hoy una cuenta archivada con plata verá bajar su saldo por esa cifra al aplicar
--     esto. No se toca ningún dato: reactivar la cuenta lo devuelve.

create or replace function public.rpc_current_balance()
returns numeric
language sql
stable
set search_path = public
as $$
  select case
    when exists (select 1 from public.balance_locations where user_id = auth.uid())
      then coalesce((
        select sum(b.derived)
        from public.rpc_account_balances() b
        join public.balance_locations a on a.id = b.account_id
        where not a.is_archived
      ), 0)
    else coalesce((
      select sum(case when type = 'income' then amount else -amount end)
      from public.transactions
      where user_id = auth.uid()
    ), 0)
  end
$$;

grant execute on function public.rpc_current_balance() to authenticated;
