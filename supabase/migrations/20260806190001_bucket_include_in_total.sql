-- Permite sacar un ítem (ej. "Ahorros") del Total de Patrimonio, la Composición y la Ganancia
-- estimada agregados, sin dejar de verlo como tarjeta individual con su propio valor y ganancia.
alter table public.savings_buckets add column include_in_total boolean not null default true;
