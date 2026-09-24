# QA de Cuentas

- **Fecha:** 2026-09-22, tres pasadas el mismo día.
- **Código:** rama `accounts`, commit `0a7662c`, más las migraciones `20260923010001` a `040001`.
- **Planes:** Premium y Básico (Básico sólo para lo que cambia por plan).
- **Ciclos:** mensual y quincenal.

El informe original, con más detalle y el historial de las tres pasadas, era un informe privado. Acá
queda el resumen.

## Resumen

La 1.ª pasada encontró tres formas de perder plata del saldo sin aviso. Las tres tenían la misma causa: la
primera cuenta arranca con una foto del saldo, y cualquier acción que borre o repita algo que ya estaba
dentro de esa foto lo desincroniza.

La 2.ª pasada re-verificó los arreglos y encontró siete hallazgos nuevos (N1 a N7).

La 3.ª pasada los dejó todos resueltos y verificados en vivo, con dos cambios de fondo:

- **Eliminar una cuenta se lleva sólo lo suyo:** su saldo y sus movimientos. Las transferencias con otras
  cuentas se pliegan en la apertura de esas cuentas, así que su saldo no se mueve.
- **Usar Cuentas es un interruptor en Ajustes** (Test y Premium):
  - la última cuenta activa no se archiva ni se elimina;
  - la única salida es desactivar Cuentas, que conserva el saldo exacto;
  - en Básico, las cuentas quedan en pausa: no se ven, y los pagos van a la predeterminada.

## Hallazgos

Entre paréntesis, el ID que tenían en el informe original.

| ID | Sev. | Estado | Título |
|---|---|---|---|
| CU-01 (C1) | Crítico | Resuelto | Eliminar la cuenta que financió a otra le borraba la plata a la financiada |
| CU-02 (C2 · H1) | Crítico | Resuelto | Eliminar la última cuenta activa dejaba el saldo congelado |
| CU-03 (C3) | Crítico | Resuelto | Repagar un fijo pagado antes de tener cuentas descontaba dos veces |
| CU-04 (N1) | Crítico | Resuelto | El aviso de eliminar invertía el efecto de las transferencias |
| CU-05 (H2) | Alto | Resuelto | La confirmación de eliminar no decía cuánta plata se pierde |
| CU-06 (N2) | Alto | Resuelto | En quincenal o semanal, un fijo vencido del período anterior desaparecía |
| CU-07 (N3) | Medio | Resuelto | El aviso «es de antes de tus cuentas» saltaba sobre pagos sin movimiento |
| CU-08 (N4) | Medio | Resuelto | Borrar el movimiento desde Movimientos esquivaba ese freno |
| CU-09 (N5) | Medio | Resuelto | Archivar las dos últimas activas a la vez dejaba cero activas |
| CU-10 (N6) | Medio | Resuelto | Se podían tener dos cuentas con el mismo nombre |
| CU-11 (N7) | Medio | Resuelto | El ajuste de «Dejar de usar Cuentas» se veía como un gasto |
| CU-12 (M1) | Medio | Resuelto | Reajustar con 11 cifras mostraba el error y el efecto a la vez |
| CU-13 (M2) | Medio | Resuelto | Primera cuenta con apertura negativa: «Sin repartir» inflado sin explicación |
| CU-14 (L1) | Bajo | No reproducido | Desvío aislado del saldo apenas creada la primera cuenta |
| CU-15 (L2) | Bajo | Resuelto | «Vence el 31» en un mes de 30 días |
| CU-16 (F1) | Bajo | Resuelto | Fijos a 320 px: el badge nunca se ocultaba y cortaba el nombre |
| CU-17 (F2) | Bajo | Resuelto | En Básico, el aviso seguía hablando de «tus cuentas» |
| CU-18 (F3) | Bajo | Resuelto | «¿Quitar este pago?» con el pie del diálogo encajonado |
| CU-19 | Alto | Resuelto | Editar el nombre de una cuenta a vacío no lo bloqueaba la base |

## Cómo se verificó cada uno

- **CU-01 / CU-04:** se eliminó la cuenta que financió a otra. La financiada quedó igual, y el total bajó
  sólo el saldo de la eliminada. El aviso muestra un solo número («Tu saldo baja $1.500.000,00»), recomienda
  archivar y, si hay algo en juego, el botón dice «Eliminar igual». La función del aviso anterior se
  eliminó de la base.
- **CU-02:** la última activa no se puede archivar ni eliminar, ni por la UI ni por la base. El interruptor
  (desactivar → activar → crear) dejó el saldo igual de punta a punta.
- **CU-03 / CU-07 / CU-08:** el freno del pago anterior a las cuentas cubre las cuatro puertas (Fijos, el
  detalle, Movimientos y el formulario del movimiento) y sólo salta cuando el pago tiene un movimiento sin
  cuenta. Quitar un pago sin movimiento, o uno con cuenta, no muestra diálogo.
- **CU-06:** en quincenal (16–30/9), Expensas, que vence el 15 y está impaga, aparece como «Atrasado» en
  Fijos y en Hoy, y el proyectado la resta. En mensual no cambió nada. La regla es la misma en el cliente y
  en `rpc_projected_balance_range`.
- **CU-09:** se repitieron 20 corridas de archivados en paralelo: 0/20 terminaron con cero activas (antes,
  5/20). La base toma un lock por usuario.
- **CU-10:** «brubank qa2 » (otras mayúsculas y un espacio) da error. Hay un índice único sobre
  `lower(btrim(name))`.
- **CU-11:** el ajuste dice «Ajuste de saldo · afuera de Análisis» y no suma a gastos ni a Análisis.
- **CU-12 / CU-13:** con 11 cifras sólo se ve el error, y «Reajustar» queda deshabilitado. Con una apertura
  negativa, el diálogo explica por qué «Sin repartir» da más que el saldo.
- **CU-15:** un fijo del día 31 dice «Vence el 30» en septiembre. El detalle explica la regla.
- **CU-16 / CU-17 / CU-18:** revisados a 320 px en claro y en oscuro. El copy de Básico ya no menciona cuentas.
- **Base:**
  - antes de aplicar las migraciones se chequeó en sólo lectura que no hubiera nombres duplicados ni
    usuarios sin cuenta activa;
  - se sacó una foto del saldo de cada cuenta y de cada usuario antes y después, y no cambió ninguno.

## Verificado correcto (no repetir)

- Alta con invitación: un código mal escrito se rechaza sin gastar el uso.
- Las tres variantes de alta de la primera cuenta.
- Sobregiro en transferencias y en «Sale de otra cuenta» (con MÁX.).
- Reajustar saldo: el mismo valor se bloquea y un negativo se acepta.
- Archivar y reactivar.
- El guardado parcial de un fijo reduce el pago real.
- Sin overflow de 320 a 1920 px.

## Pendiente

- **Mergeado a `main` y desplegado.**
- **Aplicado después del informe (commit `4bacfa9`):**
  - «hoy» lo manda el cliente (`20260923050001_hoy_del_cliente`). Verificado en vivo en el
    [QA de Fijos](fijos.md);
  - `useCan` cae a Básico si falla el perfil, y `RequireAuth` muestra un error con «Reintentar».
- **CU-19 (antes «quedó afuera»):** editar el nombre de una cuenta a vacío no pasaba por
  `rpc_create_account` (que sí valida al alta) — `useUpdateBalanceLocation` hace un `.update()`
  directo, y la columna sólo tenía `not null`. Migración
  `20260923060001_cuenta_nombre_no_vacio.sql` agrega `check (btrim(name) <> '')`, aplicada en prod.
- **Quedó afuera:** carreras con dos pestañas (se decidió no perseguirlo, caso raro y de bajo
  impacto), y ciclo semanal en vivo (este último se cubrió en el QA de Fijos).
