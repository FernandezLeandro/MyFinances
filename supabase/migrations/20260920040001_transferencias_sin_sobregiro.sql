-- Una transferencia no puede mover más plata de la que tiene la cuenta de origen.
--
-- `20260920030001_crear_cuenta_sin_sobregiro.sql` puso ese tope en el alta de una cuenta con origen;
-- "Transferir entre cuentas" inserta directo en `account_transfers` (sin RPC), así que la regla va en
-- un trigger: cubre ese diálogo, el alta con origen y cualquier pestaña con el front viejo en caché.
-- El front ya lo impide en el diálogo; esto lo comprueba la base porque el cliente puede tener el
-- saldo viejo o mandar el pedido a mano.
--
-- Qué comprueba, antes de insertar:
--   * las dos cuentas son del usuario. Los FK no pasan por RLS: sin esto se podía transferir desde o
--     hacia la cuenta de otra persona (la policy de insert sólo mira `user_id`).
--   * el importe no supera el saldo del origen (`rpc_account_balances`, la misma fuente que ve la
--     pantalla). Vaciar la cuenta justo está permitido: queda en cero.
--
-- Con la fila del origen bloqueada, así dos transferencias simultáneas no sacan la misma plata dos
-- veces. Sólo corre en INSERT: borrar una transferencia devuelve la plata y no tiene tope.
--
-- Sin sesión (`auth.uid()` nulo: el service role o un SQL a mano) no se comprueba nada — no hay
-- usuario contra quien medir el saldo, y esos caminos ya saltean RLS.

create function public.trg_account_transfers_check()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_balance numeric;
begin
  if v_uid is null then
    return new;
  end if;

  if not exists (
    select 1 from public.balance_locations where id = new.to_account_id and user_id = v_uid
  ) then
    raise exception 'account_not_found';
  end if;

  perform 1
  from public.balance_locations
  where id = new.from_account_id and user_id = v_uid
  for update;
  if not found then
    raise exception 'account_not_found';
  end if;

  select b.derived into v_balance
  from public.rpc_account_balances() b
  where b.account_id = new.from_account_id;

  if new.amount > coalesce(v_balance, 0) then
    raise exception 'account_insufficient_funds';
  end if;

  return new;
end;
$$;

create trigger account_transfers_check
before insert on public.account_transfers
for each row execute function public.trg_account_transfers_check();
