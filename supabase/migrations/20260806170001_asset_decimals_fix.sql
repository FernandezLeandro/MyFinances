-- MELI y S&P 500 quedaron sembrados con `decimals = 2`, pensado para "acciones enteras". En la
-- práctica se compran fracciones finas (brokers que convierten un monto en ARS a una cantidad
-- fraccionaria de la acción), y con 2 decimales esa cantidad se redondeaba antes de guardarse —
-- perdiendo la precisión real de la compra. Ningún activo que no sea dinero (ARS/USD) debería tener
-- menos de 8 decimales: cuesta cero (los ceros de más no se muestran, ver `formatQuantity`) y evita
-- perder datos reales.
update public.assets set decimals = 8 where asset_class <> 'fiat';
