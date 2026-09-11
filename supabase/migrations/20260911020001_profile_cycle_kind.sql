-- Ciclo de caja del usuario: la ventana con la que mira su plata (mensual, quincenal, semanal).
-- Deliberadamente separado de la periodicidad real de cada obligación (un alquiler sigue venciendo
-- una vez al mes sea cual sea el ciclo elegido acá) — ver `src/lib/cycle.ts` para el porqué de esa
-- separación. Nadie consume estas columnas todavía: existen y no hacen nada (bloque 0/1 del plan de
-- ciclos configurables).
--
-- `cycle_kind` default 'monthly' preserva el comportamiento actual para toda cuenta existente y
-- nueva que no configure nada. `cycle_week_starts_on` sólo aplica cuando `cycle_kind = 'weekly'`
-- (1 = lunes … 7 = domingo, ISO) — se guarda igual con cualquier kind para no tener una columna
-- nullable que sólo a veces importa.
alter table public.profiles
  add column cycle_kind text not null default 'monthly' check (cycle_kind in ('monthly', 'biweekly', 'weekly')),
  add column cycle_week_starts_on int not null default 1 check (cycle_week_starts_on between 1 and 7);

-- Mismo motivo que `role`/`plan` en 20260807010001 y 20260911010001: el `grant update` es por
-- columna, así que una columna nueva nace SIN permiso de escritura para `authenticated`. Acá sí
-- queremos que el usuario la pueda tocar (a diferencia de `role`/`plan`), así que se agrega
-- explícitamente — no hace falta repetir las columnas ya otorgadas, `grant` es aditivo.
grant update (cycle_kind, cycle_week_starts_on) on public.profiles to authenticated;
