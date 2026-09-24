-- QA de Movimientos (docs/qa/movimientos.md), Bloque 0 del plan de arreglo — MO-17/MO-18. Detectado
-- por lectura de código al planear el arreglo, sin reproducirlo en vivo (nunca contra datos de otra
-- cuenta): un `insert`/`update` de `transactions` acepta una `category_id` o un
-- `fixed_expense_payment_id` de OTRO usuario — la policy de `transactions` sólo mira
-- `user_id = auth.uid()`, y nada más valida el dueño de esas dos referencias.
--
-- Con `category_id` el daño queda contenido en la propia cuenta (MO-17: una categoría "fuera de
-- lugar" descuadra el donut de Análisis, pero no se puede leer ni usar la categoría ajena para nada
-- más). Con `fixed_expense_payment_id` el riesgo subió: `trg_transactions_sync_linked_fixed_expense`
-- (`20260924010001_fijos_pagos_solo_por_rpc.sql`) pasó a `security definer` y da por hecho que el
-- pago vinculado es del mismo usuario que edita el movimiento — no lo comprobaba. Vinculando un
-- movimiento propio al pago de un fijo ajeno (conociendo su `id`, no adivinable ni legible por API) y
-- editándole importe o fecha, se podía escribir `amount_paid`/`paid_on` de otra cuenta.
--
-- La solución es un trigger explícito por `user_id` (no por RLS: éste corre también dentro de RPC
-- `security definer`, que no están sujetas a policies) — mismo molde que `trg_transactions_account`
-- (`20260919010001_cuentas_saldo_y_reajuste.sql`). Se suma además `and user_id = old.user_id` a los
-- `update` de `trg_transactions_sync_linked_fixed_expense` como segunda barrera, por si algún camino
-- futuro volviera a saltear la de acá.

create function public.trg_transactions_owned_refs()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.category_id is not null and not exists (
    select 1 from public.categories c where c.id = new.category_id and c.user_id = new.user_id
  ) then
    raise exception 'category_not_found';
  end if;

  if new.fixed_expense_payment_id is not null and not exists (
    select 1 from public.fixed_expense_payments p
    where p.id = new.fixed_expense_payment_id and p.user_id = new.user_id
  ) then
    raise exception 'fixed_payment_not_found';
  end if;

  return new;
end;
$$;

create trigger transactions_owned_refs
before insert or update of category_id, fixed_expense_payment_id on public.transactions
for each row execute function public.trg_transactions_owned_refs();

-- Segunda barrera: mismo cuerpo que la última versión (`20260924010001_fijos_pagos_solo_por_rpc.sql`),
-- con `and user_id = old.user_id` sumado a los dos `update`. Con el trigger de arriba ya en pie, esto
-- nunca debería importar en la práctica — pero si algún día `transactions_owned_refs` se desactivara
-- o se saltease, esto evita que el `update` "afecte 0 filas en silencio" contra la fila ajena y en
-- cambio siga tirando `linked_movement_amount_invalid` como cualquier otro caso de "no encontrado".
create or replace function public.trg_transactions_sync_linked_fixed_expense()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_saving record;
  v_delta numeric;
begin
  if old.fixed_expense_payment_id is not null then
    if new.type is distinct from old.type then
      raise exception 'linked_movement_type_locked';
    end if;

    v_delta := new.amount - old.amount;
    if v_delta <> 0 then
      update public.fixed_expense_payments
      set amount_paid = amount_paid + v_delta
      where id = old.fixed_expense_payment_id
        and user_id = old.user_id
        and amount_paid + v_delta > 0;

      if not found then
        raise exception 'linked_movement_amount_invalid';
      end if;
    end if;

    -- Una bolsa quincenal/semanal ubica su carga en el sub-período por `paid_on` (`aggregate.ts`,
    -- `bag_cycle_from`/`bag_cycle_to`); un fijo "una vez al mes" no tiene sub-período, sólo `period`
    -- (el mes que se pagó), que no se toca al mover la fecha — sigue siendo el pago de ese mes.
    if new.occurred_on is distinct from old.occurred_on then
      update public.fixed_expense_payments
      set paid_at = new.occurred_on + time '12:00', paid_on = new.occurred_on
      where id = old.fixed_expense_payment_id and user_id = old.user_id and is_recurring;
    end if;

    return new;
  end if;

  select * into v_saving from public.fixed_expense_savings where transaction_id = old.id;
  if found then
    if new.type is distinct from old.type then
      raise exception 'linked_movement_type_locked';
    end if;

    if exists (
      select 1 from public.fixed_expense_payments
      where fixed_expense_id = v_saving.fixed_expense_id and period = v_saving.period
    ) then
      raise exception 'fixed_expense_saving_period_paid';
    end if;

    v_delta := new.amount - old.amount;
    if v_delta <> 0 then
      update public.fixed_expense_savings
      set amount = amount + v_delta
      where id = v_saving.id and user_id = old.user_id and amount + v_delta > 0;

      if not found then
        raise exception 'linked_movement_amount_invalid';
      end if;
    end if;
  end if;

  return new;
end;
$$;
