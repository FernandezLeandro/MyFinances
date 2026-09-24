-- Bug encontrado en la verificación en vivo del arreglo de Movimientos (MO-07), 2026-09-24: el
-- trigger `transactions_block_delete_linked` (`20260924040001_movimientos_vinculados.sql`) frenaba
-- CUALQUIER movimiento referenciado desde `receivables.expense_transaction_id`, sin distinguir
-- `already_expensed`. Eso incluye "tu parte" de un gasto compartido (`receivable_share` en
-- `origin.ts`, `already_expensed = false`) — un caso que, a propósito, el front borra DIRECTO con
-- `deleteTx.mutate()` (no hay ninguna RPC de "deshacer" para ese caso; ver `originDeleteAction`,
-- que devuelve `'delete'` para `receivable_share`). El resultado: Eliminar sobre "tu parte" de un
-- compartido quedaba roto (`linked_movement_use_origin`), verificado en vivo con la cuenta de QA.
--
-- El único caso que sí necesita pasar por una RPC (`rpc_unexpense_receivable`, que valida
-- `receivable_has_income_payments` antes de dejar deshacer) es «Descontado: X», con
-- `already_expensed = true`. La condición se ajusta para frenar sólo ese caso.

create or replace function public.trg_transactions_block_delete_linked()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if auth.uid() is distinct from old.user_id then
    return old;
  end if;
  if current_setting('app.linked_delete_ok', true) = 'on' then
    return old;
  end if;

  if exists (select 1 from public.credit_card_payment_items where transaction_id = old.id)
    or exists (select 1 from public.credit_purchase_payments where transaction_id = old.id)
    or exists (select 1 from public.receivables where expense_transaction_id = old.id and already_expensed)
    or exists (select 1 from public.receivable_payments where transaction_id = old.id)
  then
    raise exception 'linked_movement_use_origin';
  end if;

  return old;
end;
$$;
