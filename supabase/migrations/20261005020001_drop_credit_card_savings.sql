-- El guardado general por tarjeta (`credit_card_savings`, un monto por tarjeta y mes) se reemplazó por
-- el guardado por compra (`credit_savings`, `20261004010001_deudas_guardado_por_compra.sql`).
--
-- APLICAR DESPUÉS DEL DEPLOY del front que ya lee `credit_savings`: el front anterior consulta esta
-- tabla en Hoy, Fijos y Mis Deudas, y fallaría sin ella.
--
-- Los montos que había acá se descartan a propósito: eran guardados "aparte" (nunca generaron
-- movimiento ni afectaron el saldo) y no tienen una compra a la que asignarse.

drop table public.credit_card_savings;
