-- HO-15 (docs/qa/hoy.md): una categoría de gasto con movimientos ya cargados se podía pasar a
-- "Ingreso" desde `/categorias` sin ningún freno (`useUpdateCategory` hacía un `update` directo con
-- `kind`). Sus gastos viejos desaparecían del desglose por categoría (`v_spend_by_category` filtra
-- `c.kind = 'expense'`) mientras seguían sumando en "Gastos" (`v_range_summary`, que sólo mira
-- `transactions.type`) — las dos cifras dejaban de cerrar entre sí.
--
-- Decisión de Lean: Gasto e Ingreso son mundos independientes — el tipo de una categoría se elige al
-- crearla y no se cambia más (ni desde `/categorias` ni desde el catálogo de admin
-- `/admin/categorias`, que es la plantilla que siembra cada cuenta nueva). Si alguien se equivoca de
-- tipo, archiva esa categoría y crea una nueva del tipo correcto.
--
-- Diagnóstico previo (sólo lectura, `db query --linked`, 2026-09-24): 0 movimientos, fijos o compras
-- en producción con una categoría del tipo contrario — no hace falta arreglar datos, las barreras de
-- abajo nacen sobre una base ya limpia.

-- 1. `kind` inmutable en las dos tablas de categorías (cuenta y catálogo de admin).
create function public.trg_category_kind_locked()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.kind is distinct from old.kind then
    raise exception 'category_kind_locked';
  end if;
  return new;
end;
$$;

create trigger categories_kind_locked
before update of kind on public.categories
for each row execute function public.trg_category_kind_locked();

create trigger default_categories_kind_locked
before update of kind on public.default_categories
for each row execute function public.trg_category_kind_locked();

-- 2. Un movimiento no puede usar una categoría del tipo contrario — `create or replace` de
-- `trg_transactions_owned_refs` (`20260924020001_movimientos_referencias_propias.sql`), mismo cuerpo
-- más el chequeo de `kind`. Se distingue `category_not_found` (ajena o borrada) de
-- `category_kind_mismatch` (propia, pero del tipo que no corresponde) sólo para el mensaje al
-- usuario — la UI nunca ofrece una categoría del tipo contrario, así que esto sólo se ve por API
-- directa (mismo criterio que ya documenta esa migración).
create or replace function public.trg_transactions_owned_refs()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.category_id is not null then
    if not exists (
      select 1 from public.categories c where c.id = new.category_id and c.user_id = new.user_id
    ) then
      raise exception 'category_not_found';
    end if;

    if not exists (
      select 1 from public.categories c
      where c.id = new.category_id and c.user_id = new.user_id and c.kind = new.type
    ) then
      raise exception 'category_kind_mismatch';
    end if;
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

drop trigger transactions_owned_refs on public.transactions;
create trigger transactions_owned_refs
before insert or update of category_id, fixed_expense_payment_id, type on public.transactions
for each row execute function public.trg_transactions_owned_refs();

-- 3. Un fijo o una compra en cuotas sólo puede llevar una categoría de gasto — sin esto, uno cargado
-- por API directa con una categoría de ingreso quedaría impagable con un error opaco al generar su
-- movimiento (que siempre es `type = 'expense'`).
create function public.trg_expense_category_kind()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.category_id is not null and exists (
    select 1 from public.categories c where c.id = new.category_id and c.kind <> 'expense'
  ) then
    raise exception 'category_kind_mismatch';
  end if;
  return new;
end;
$$;

create trigger fixed_expenses_category_kind
before insert or update of category_id on public.fixed_expenses
for each row execute function public.trg_expense_category_kind();

create trigger credit_purchases_category_kind
before insert or update of category_id on public.credit_purchases
for each row execute function public.trg_expense_category_kind();
