-- Editar el nombre de una cuenta no pasa por `rpc_create_account` (que sí valida nombre vacío al
-- alta): `useUpdateBalanceLocation` hace un `.update()` directo a `balance_locations`, sin RPC, y la
-- columna sólo tenía `not null` (20260808040001_balance_locations.sql). El índice único de nombres
-- (`balance_locations_user_name_idx`) además excluye a propósito los nombres vacíos, así que no
-- ayuda acá. Resultado: un request directo a la API (fuera del form, que sí valida con Zod) podía
-- dejar una cuenta con nombre vacío o sólo espacios. QA de Cuentas, caso que había quedado afuera
-- (docs/qa/cuentas.md).
alter table public.balance_locations
  add constraint balance_locations_name_not_blank check (btrim(name) <> '' and length(name) <= 60);
