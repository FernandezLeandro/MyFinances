-- Revertido: el sueldo asignado no necesitaba una tabla propia. Un "ingreso asignado" es
-- exactamente un movimiento de tipo 'income' — ya existe `transactions` con RLS, `useCreateTransaction`
-- y todo lo que ya suma `useRangeSummary` (Ingresos del ciclo). Guardar esto aparte en
-- `cycle_incomes` duplicaba esa lógica sin necesidad y, a diferencia de un guardado para un fijo
-- (que deliberadamente NO es plata real todavía), un sueldo cobrado sí es un movimiento real: debe
-- verse en Movimientos y sumar al saldo, no vivir en una tabla que ningún otro lado de la app conoce.
drop table if exists public.cycle_incomes;
