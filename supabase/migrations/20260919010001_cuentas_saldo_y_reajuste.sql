-- "Cuadrar saldo" se elimina y el saldo de la app pasa a ser LA SUMA DE LAS CUENTAS.
--
-- Hasta acá `rpc_current_balance` sumaba todos los movimientos de la historia sin mirar cuentas ni
-- aperturas, y `rpc_account_balances` sumaba apertura + movimientos imputados ± transferencias por
-- cuenta. Las dos cifras sólo coincidían si las aperturas compensaban justo el historial sin cuenta,
-- así que "el saldo de Hoy" y "lo que dicen las cuentas" divergían en cuanto se tocaba una apertura.
--
-- Doctrina desde esta migración:
--   * Con al menos una cuenta (activa O archivada): saldo = Σ del saldo derivado de cada cuenta.
--     Archivar no la saca del saldo, y las transferencias se netean porque las dos puntas suman.
--   * Sin ninguna cuenta: saldo = Σ de movimientos, exactamente como hasta ahora. Es lo que mantiene
--     idénticos a Básico y a los Test que todavía no crearon su primera cuenta.
--   * Los movimientos viejos sin cuenta quedan como historial (se ven en Movimientos y Análisis) pero
--     no suman al saldo: esa plata ya está en la apertura de las cuentas.
--
-- La columna `balance_locations.amount` (el "real declarado" de Cuadrar saldo) queda sin uso. NO se
-- borra: una PWA con el front viejo en caché todavía la escribe.

comment on column public.balance_locations.amount is
  'Obsoleta desde 20260919 (Cuadrar saldo eliminado): no se lee ni se escribe desde el cliente. Se conserva por PWAs con el front viejo en caché.';

-- ---------------------------------------------------------------------------------------------
-- 1. Saldo actual = suma de las cuentas
-- ---------------------------------------------------------------------------------------------

create or replace function public.rpc_current_balance()
returns numeric
language sql
stable
set search_path = public
as $$
  select case
    when exists (select 1 from public.balance_locations where user_id = auth.uid())
      then coalesce((select sum(b.derived) from public.rpc_account_balances() b), 0)
    else coalesce((
      select sum(case when type = 'income' then amount else -amount end)
      from public.transactions
      where user_id = auth.uid()
    ), 0)
  end
$$;

grant execute on function public.rpc_current_balance() to authenticated;

-- ---------------------------------------------------------------------------------------------
-- 2. Saldo proyectado: mismo cuerpo que la última versión
--    (`20260913010001_fixed_expense_savings_movimiento.sql`), cambiando sólo el primer término —
--    la suma inline de todos los movimientos — por `rpc_current_balance()`, para que el proyectado
--    de Hoy/Fijos/Mis Deudas parta del mismo número que el saldo actual.
-- ---------------------------------------------------------------------------------------------

create or replace function public.rpc_projected_balance_range(p_from date, p_to date)
returns numeric
language sql
stable
set search_path = public
as $$
  select
    public.rpc_current_balance()
    -
    (
      with months as (
        select generate_series(date_trunc('month', p_from), date_trunc('month', p_to), interval '1 month')::date as m
      ),
      week_starts_on as (
        select coalesce((select p.cycle_week_starts_on from public.profiles p where p.id = auth.uid()), 1) as v
      )
      select coalesce(sum(
        case
          when not fe.is_recurring then greatest(
            fe.amount - coalesce((
              select sum(fes.amount)
              from public.fixed_expense_savings fes
              where fes.fixed_expense_id = fe.id
                and fes.period = months.m
                and fes.transaction_id is not null
            ), 0),
            0
          )
          when months.m < date_trunc('month', current_date) then 0
          else greatest(
            fe.amount - coalesce((
              select sum(fep.amount_paid)
              from public.fixed_expense_payments fep
              where fep.fixed_expense_id = fe.id
                and fep.period = months.m
                and (
                  fe.bag_frequency = 'monthly'
                  or months.m <> date_trunc('month', current_date)
                  or fep.paid_at::date between public.bag_cycle_from(fe.bag_frequency, current_date, (select v from week_starts_on))
                                           and public.bag_cycle_to(fe.bag_frequency, current_date, (select v from week_starts_on))
                )
            ), 0),
            0
          )
        end
      ), 0)
      from months
      cross join public.fixed_expenses fe
      where fe.user_id = auth.uid()
        and fe.is_active
        and fe.starts_on <= (months.m + interval '1 month - 1 day')::date
        and (
          fe.is_recurring
          or (
            public.due_date_in_month(months.m, fe.due_day) between p_from and p_to
            and not exists (
              select 1 from public.fixed_expense_payments fep
              where fep.fixed_expense_id = fe.id and fep.period = months.m
            )
          )
        )
    )
    -
    (
      select coalesce(sum(vci.amount), 0)
      from public.v_credit_installments_range(p_from, p_to) vci
      where case
        when vci.card_id is not null then not exists (
          select 1 from public.credit_card_payments ccp
          where ccp.card_id = vci.card_id and ccp.period = vci.period
        )
        else not exists (
          select 1 from public.credit_purchase_payments cpp
          where cpp.purchase_id = vci.purchase_id and cpp.period = vci.period
        )
      end
    )
$$;

grant execute on function public.rpc_projected_balance_range(date, date) to authenticated;

-- ---------------------------------------------------------------------------------------------
-- 3. Todo movimiento nuevo cae en una cuenta
-- ---------------------------------------------------------------------------------------------

-- El front pide la cuenta en cada movimiento nuevo, pero hay caminos que insertan sin una: el
-- "Sueldo" de Básico, los diálogos de pago de Básico (sin selector) y pestañas de la PWA con el
-- front viejo. Con el saldo hecho de cuentas, un movimiento sin cuenta quedaría afuera en silencio.
-- Rechazarlo rompería esos mismos caminos, así que la base lo completa: la predeterminada, si no la
-- activa más vieja, si no una archivada. Sin ninguna cuenta queda `null` (el caso de siempre).
--
-- Con cuenta informada, se verifica que sea del mismo usuario: los FK no pasan por RLS, y sin esto
-- se podría imputar un movimiento propio a la cuenta de otra persona.
--
-- Poner `null` en un UPDATE se deja pasar a propósito: lo necesita el `on delete set null` cuando se
-- borra una cuenta o un usuario.
create function public.trg_transactions_account()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if tg_op = 'INSERT' and new.account_id is null then
    select a.id into new.account_id
    from public.balance_locations a
    where a.user_id = new.user_id
    order by a.is_archived, a.is_default desc, a.created_at, a.id
    limit 1;
  elsif new.account_id is not null and not exists (
    select 1 from public.balance_locations a
    where a.id = new.account_id and a.user_id = new.user_id
  ) then
    raise exception 'account_not_found';
  end if;
  return new;
end;
$$;

create trigger transactions_account
before insert or update of account_id on public.transactions
for each row execute function public.trg_transactions_account();

-- ---------------------------------------------------------------------------------------------
-- 4. Reajustar el saldo de una cuenta
-- ---------------------------------------------------------------------------------------------

-- El usuario dice cuánto tiene de verdad en la cuenta y elige qué hacer con la diferencia:
--   'movement' → un movimiento de ajuste (`is_adjustment`, sin categoría, afuera de Análisis).
--   'opening'  → corregir el saldo inicial: `opening_amount += diferencia`, sin movimiento.
-- La diferencia se calcula ACÁ contra el derivado de la base, no en el cliente, para no ajustar
-- contra un saldo viejo en caché. `p_occurred_on` viene del cliente (fecha local): `current_date`
-- de Supabase es UTC y en Argentina, desde las 21 h, ya es mañana.
create function public.rpc_adjust_account_balance(
  p_account_id uuid,
  p_real_amount numeric,
  p_mode text,
  p_occurred_on date default null
)
returns numeric
language plpgsql
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_opening numeric;
  v_derived numeric;
  v_diff numeric;
begin
  if p_mode is null or p_mode not in ('movement', 'opening') then
    raise exception 'account_adjust_invalid_mode';
  end if;

  -- Mismo tope que `numeric(12, 2)`: mejor un error claro que un overflow del tipo.
  if p_real_amount is null or p_real_amount <> round(p_real_amount, 2) or abs(p_real_amount) >= 10000000000 then
    raise exception 'account_adjust_invalid_amount';
  end if;

  select opening_amount into v_opening
  from public.balance_locations
  where id = p_account_id and user_id = v_uid
  for update;
  if not found then
    raise exception 'account_not_found';
  end if;

  select b.derived into v_derived
  from public.rpc_account_balances() b
  where b.account_id = p_account_id;

  v_diff := p_real_amount - coalesce(v_derived, v_opening);
  if v_diff = 0 then
    raise exception 'account_adjust_nothing_to_adjust';
  end if;

  if p_mode = 'movement' then
    insert into public.transactions
      (user_id, type, amount, occurred_on, category_id, description, is_adjustment, account_id)
    values
      (v_uid, case when v_diff > 0 then 'income' else 'expense' end, abs(v_diff),
       coalesce(p_occurred_on, current_date), null, 'Ajuste de saldo', true, p_account_id);
  else
    update public.balance_locations
    set opening_amount = opening_amount + v_diff, updated_at = now()
    where id = p_account_id and user_id = v_uid;
  end if;

  return v_diff;
end;
$$;

grant execute on function public.rpc_adjust_account_balance(uuid, numeric, text, date) to authenticated;

-- ---------------------------------------------------------------------------------------------
-- 5. Eliminar una cuenta con todo lo que se le imputó
-- ---------------------------------------------------------------------------------------------

-- Borra la cuenta, sus movimientos y sus transferencias (`account_transfers` se va en cascada). Lo
-- que se hizo con esa plata NO se deshace: los fijos, tarjetas y deudas que se pagaron desde acá
-- siguen como pagados, sólo pierden el movimiento. Tiene que ser atómica y por eso es un RPC:
--
--   * `transactions_unmark_fixed_payment` (`20260916010001_fixed_expense_payment_fecha.sql`) borra el
--     pago de un fijo cuando se borra su movimiento. Se desengancha ANTES (`fixed_expense_payment_id
--     = null`); si no, cada fijo pagado con esta cuenta volvería a figurar como pendiente.
--   * `fixed_expense_savings.transaction_id` es `on delete cascade`, y la tabla es un registro sin
--     `update` a propósito (ni policy ni grant): un UPDATE afectaría 0 filas sin avisar. Se
--     REINSERTAN copias con `transaction_id = null` antes de que el cascade se lleve las originales,
--     así el guardado sobrevive como "guardado sin movimiento".
--   * Pagos de tarjeta/compra, abonos y `receivables.expense_transaction_id` son `on delete set
--     null`: quedan solos como pagados.
create function public.rpc_delete_account(p_account_id uuid)
returns void
language plpgsql
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_was_default boolean;
begin
  select is_default into v_was_default
  from public.balance_locations
  where id = p_account_id and user_id = v_uid
  for update;
  if not found then
    raise exception 'account_not_found';
  end if;

  update public.transactions
  set fixed_expense_payment_id = null
  where account_id = p_account_id and user_id = v_uid and fixed_expense_payment_id is not null;

  insert into public.fixed_expense_savings (user_id, fixed_expense_id, period, amount, saved_at, note, transaction_id)
  select s.user_id, s.fixed_expense_id, s.period, s.amount, s.saved_at, s.note, null
  from public.fixed_expense_savings s
  where s.user_id = v_uid
    and s.transaction_id in (
      select t.id from public.transactions t where t.account_id = p_account_id and t.user_id = v_uid
    );

  delete from public.transactions where account_id = p_account_id and user_id = v_uid;
  delete from public.balance_locations where id = p_account_id and user_id = v_uid;

  -- Sin predeterminada los diálogos de pago no traen ninguna cuenta elegida: si se fue la que lo
  -- era, la activa más vieja pasa a serlo.
  if v_was_default then
    update public.balance_locations
    set is_default = true, updated_at = now()
    where id = (
      select id from public.balance_locations
      where user_id = v_uid and not is_archived
      order by created_at, id
      limit 1
    );
  end if;
end;
$$;

grant execute on function public.rpc_delete_account(uuid) to authenticated;
