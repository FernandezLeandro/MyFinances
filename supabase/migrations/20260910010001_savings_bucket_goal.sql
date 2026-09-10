-- Meta de ahorro opcional por ítem (rediseño v2, Ahorros tanda 15a): habilita la barra + % + "faltan
-- $X" que sólo se muestra en los ítems que la tengan. NULL = sin meta, mismo criterio que el resto
-- de la app para lo opcional.
alter table public.savings_buckets
  add column goal_cents bigint null check (goal_cents is null or goal_cents > 0);
