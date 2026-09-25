# QA de Cuentas

- **Fecha:** 2026-09-22, tres pasadas mismo día.
- **Código:** rama `accounts`, commit `0a7662c`, + migraciones `20260923010001` a `040001`.
- **Planes:** Premium y Básico (Básico sólo lo que cambia por plan).
- **Ciclos:** mensual y quincenal.

Informe original (más detalle, historial de tres pasadas) era privado. Acá resumen.

## Resumen

1.ª pasada: tres formas de perder plata del saldo sin aviso. Misma causa: primera cuenta arranca con foto del saldo; toda acción que borre o repita algo dentro de esa foto la desincroniza.

2.ª pasada: re-verificó arreglos, encontró siete hallazgos nuevos (N1 a N7).

3.ª pasada: todos resueltos y verificados en vivo. Dos cambios de fondo:

- **Eliminar cuenta se lleva sólo lo suyo:** su saldo y movimientos. Transferencias con otras cuentas se pliegan en apertura de esas cuentas → su saldo no se mueve.
- **Usar Cuentas = interruptor en Ajustes** (Test y Premium):
  - última cuenta activa no se archiva ni elimina;
  - única salida: desactivar Cuentas, conserva saldo exacto;
  - en Básico, cuentas en pausa: no se ven, pagos van a predeterminada.

## Hallazgos

Entre paréntesis, ID del informe original.

| ID | Sev. | Estado | Título |
|---|---|---|---|
| CU-01 (C1) | Crítico | Resuelto | Eliminar cuenta que financió a otra borraba plata de la financiada |
| CU-02 (C2 · H1) | Crítico | Resuelto | Eliminar última cuenta activa dejaba saldo congelado |
| CU-03 (C3) | Crítico | Resuelto | Repagar fijo pagado antes de tener cuentas descontaba dos veces |
| CU-04 (N1) | Crítico | Resuelto | Aviso de eliminar invertía efecto de transferencias |
| CU-05 (H2) | Alto | Resuelto | Confirmación de eliminar no decía cuánta plata se pierde |
| CU-06 (N2) | Alto | Resuelto | En quincenal/semanal, fijo vencido del período anterior desaparecía |
| CU-07 (N3) | Medio | Resuelto | Aviso «es de antes de tus cuentas» saltaba sobre pagos sin movimiento |
| CU-08 (N4) | Medio | Resuelto | Borrar movimiento desde Movimientos esquivaba ese freno |
| CU-09 (N5) | Medio | Resuelto | Archivar dos últimas activas a la vez dejaba cero activas |
| CU-10 (N6) | Medio | Resuelto | Se podían tener dos cuentas con mismo nombre |
| CU-11 (N7) | Medio | Resuelto | Ajuste de «Dejar de usar Cuentas» se veía como gasto |
| CU-12 (M1) | Medio | Resuelto | Reajustar con 11 cifras mostraba error y efecto a la vez |
| CU-13 (M2) | Medio | Resuelto | Primera cuenta con apertura negativa: «Sin repartir» inflado sin explicación |
| CU-14 (L1) | Bajo | No reproducido | Desvío aislado del saldo apenas creada primera cuenta |
| CU-15 (L2) | Bajo | Resuelto | «Vence el 31» en mes de 30 días |
| CU-16 (F1) | Bajo | Resuelto | Fijos a 320 px: badge nunca se ocultaba, cortaba nombre |
| CU-17 (F2) | Bajo | Resuelto | En Básico, aviso seguía hablando de «tus cuentas» |
| CU-18 (F3) | Bajo | Resuelto | «¿Quitar este pago?» con pie del diálogo encajonado |
| CU-19 | Alto | Resuelto | Editar nombre de cuenta a vacío no lo bloqueaba la base |

## Cómo se verificó cada uno

- **CU-01 / CU-04:** eliminada cuenta que financió a otra. Financiada quedó igual; total bajó sólo saldo de la eliminada. Aviso muestra un solo número («Tu saldo baja $1.500.000,00»), recomienda archivar; si hay algo en juego, botón dice «Eliminar igual». Función del aviso anterior eliminada de la base.
- **CU-02:** última activa no se puede archivar ni eliminar, ni por UI ni por base. Interruptor (desactivar → activar → crear) dejó saldo igual de punta a punta.
- **CU-03 / CU-07 / CU-08:** freno del pago anterior a cuentas cubre las cuatro puertas (Fijos, detalle, Movimientos, formulario del movimiento); sólo salta si pago tiene movimiento sin cuenta. Quitar pago sin movimiento, o con cuenta, no muestra diálogo.
- **CU-06:** en quincenal (16–30/9), Expensas (vence el 15, impaga) aparece «Atrasado» en Fijos y Hoy; proyectado la resta. Mensual sin cambios. Misma regla en cliente y en `rpc_projected_balance_range`.
- **CU-09:** 20 corridas de archivados en paralelo: 0/20 con cero activas (antes 5/20). Base toma lock por usuario.
- **CU-10:** «brubank qa2 » (otras mayúsculas + espacio) da error. Índice único sobre `lower(btrim(name))`.
- **CU-11:** ajuste dice «Ajuste de saldo · afuera de Análisis»; no suma a gastos ni Análisis.
- **CU-12 / CU-13:** con 11 cifras sólo se ve error, «Reajustar» deshabilitado. Con apertura negativa, diálogo explica por qué «Sin repartir» da más que saldo.
- **CU-15:** fijo del día 31 dice «Vence el 30» en septiembre. Detalle explica regla.
- **CU-16 / CU-17 / CU-18:** revisados a 320 px, claro y oscuro. Copy de Básico ya no menciona cuentas.
- **Base:**
  - antes de aplicar migraciones, chequeo sólo lectura: sin nombres duplicados ni
    usuarios sin cuenta activa;
  - foto del saldo de cada cuenta y usuario antes y después: ninguno cambió.

## Verificado correcto (no repetir)

- Alta con invitación: código mal escrito se rechaza sin gastar uso.
- Tres variantes de alta de primera cuenta.
- Sobregiro en transferencias y en «Sale de otra cuenta» (con MÁX.).
- Reajustar saldo: mismo valor se bloquea, negativo se acepta.
- Archivar y reactivar.
- Guardado parcial de fijo reduce pago real.
- Sin overflow de 320 a 1920 px.