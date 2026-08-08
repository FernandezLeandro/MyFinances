-- El cliente hoy manda un UPDATE por fila en paralelo (Promise.all) para reordenar el catálogo —
-- no es atómico de verdad: si uno de los 8 falla a mitad de camino, el orden queda inconsistente y
-- sólo se reporta el primer error. Una sola sentencia con unnest() ... with ordinality lo aplica
-- todo en una transacción, atómico por construcción.
--
-- security invoker (el default) + chequeo de is_admin() explícito acá adentro: sin esto, una cuenta
-- común simplemente no actualizaría ninguna fila por la policy de UPDATE existente (0 filas, sin
-- error) — el chequeo explícito da un mensaje claro en vez de un fallo silencioso.
create or replace function public.rpc_reorder_default_categories(p_ids uuid[])
returns void
language plpgsql
set search_path = public
as $$
begin
  if not public.is_admin() then
    raise exception 'not_admin';
  end if;

  update public.default_categories dc
  set sort_order = pos.ord - 1
  from unnest(p_ids) with ordinality as pos(id, ord)
  where dc.id = pos.id;
end;
$$;

grant execute on function public.rpc_reorder_default_categories(uuid[]) to authenticated;
