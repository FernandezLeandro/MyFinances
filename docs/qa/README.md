# QA de MyFinances

Registro de las pasadas de QA manual, una por área de la app. La idea es tener en un solo lugar qué se
probó, qué se encontró y qué quedó pendiente, para armar después la foto de toda la app y priorizar.

## Estado por área

| Área | Informe | Última pasada | Código probado | Abiertos (C / A / M / B) |
|---|---|---|---|---|
| Cuentas | [cuentas.md](cuentas.md) | 2026-09-22 (3.ª) | rama `accounts`, `0a7662c` | 0 / 0 / 0 / 0 |
| Gastos fijos | [fijos.md](fijos.md) | 2026-09-22/23 (1.ª) | rama `accounts`, `4bacfa9` | 0 / 7 / 8 / 10 |
| Mis Deudas | — | pendiente | | |
| Ahorros | — | pendiente | | |
| Me Deben | — | pendiente | | |
| Movimientos | — | pendiente (ver transversales) | | |
| Hoy | — | pendiente (ver transversales) | | |
| Análisis | — | pendiente | | |
| Admin | — | pendiente | | |

C / A / M / B = Crítico / Alto / Medio / Bajo.

## Cómo se hace una pasada

- **Cuenta de QA** dedicada (no la cuenta de prueba habitual ni cuentas reales). Sus credenciales viven
  fuera del repo.
- **Dev server local contra la base de producción** (no hay staging), manejado con Playwright desde una
  carpeta temporal, nunca instalado en el repo.
- **Cada caso se verifica en pantalla y en la base:** lo que muestran Fijos, Hoy y Movimientos contra
  las filas y el saldo real, leídos con la sesión de la cuenta de QA o con SQL de sólo lectura.
- **Layout de 320 a 1920 px,** en claro y en oscuro, con montos de 7 cifras o más. En cada ancho se mide el
  scroll horizontal y que ningún texto se salga de su tarjeta.
- **Planes:** se prueba en Premium y se baja la cuenta de QA a Básico o Test sólo para lo que cambia
  por plan. Al terminar vuelve a Premium.
- **Una pasada sólo informa: no arregla.** Los arreglos van en un plan aparte, después de priorizar.
  Una pasada siguiente re-verifica y actualiza el estado en el mismo archivo.

## Severidades

| Severidad | Criterio |
|---|---|
| **Crítico** | Se pierde o se duplica plata sin aviso, o se rompen datos de forma difícil de recuperar. |
| **Alto** | Un número o un estado queda mal (pagado sin estarlo, un saldo que no cierra), o una acción común hace algo distinto de lo que el usuario cree. |
| **Medio** | Confunde, se puede evitar con cuidado, o sólo pasa en un caso poco común o por API. |
| **Bajo** | Copy, layout, validaciones de borde. |

## Formato de cada informe

- **IDs por área:** `CU-` Cuentas, `FI-` Fijos, `DE-` Mis Deudas, `AH-` Ahorros, `MD-` Me Deben,
  `MO-` Movimientos, `HO-` Hoy, `AN-` Análisis, `AD-` Admin. Un ID no se reusa.
- **Encabezado:** fecha, rama y commit, y los planes y ciclos que se probaron.
- **Resumen**, más la tabla de hallazgos (ID, severidad, estado, título).
- **Cada hallazgo:** pasos, esperado, obtenido, evidencia y, si se sabe, por qué pasa (`archivo:línea`).
- **Estados:** Abierto, Resuelto (con cómo se verificó), No reproducido, o Por lectura de código (se
  vio en el código y no se pudo reproducir en vivo).
- **Lo verificado correcto**, para no repetirlo, y **lo que quedó afuera.**

## Reglas: el repo es público

- **Nada que identifique una cuenta:** ni emails, ni `uuid`, ni códigos de invitación, ni contraseñas. Se
  dice «la cuenta de QA».
- **Un hallazgo de seguridad explotable** contra otras cuentas se anota acá de forma genérica («una RPC
  acepta X, ver informe privado») hasta que esté arreglado. El detalle va en un informe privado.
- Los montos y los nombres de prueba («Expensas», $180.000) sí van: son inventados.
- Las capturas no se suben. Si una hace falta, se describe con palabras.

## Pendientes transversales

Cosas vistas de reojo desde otra área, sin probar a fondo. Se mueven al informe de su área cuando se haga
esa pasada.

- **Movimientos:** «Eliminar» en el formulario de un movimiento borra en el acto, sin confirmar ni
  deshacer (`TransactionFormDialog.tsx:289`). Visto en FI-03.
- **Movimientos (Básico):** tocar un movimiento que no es de un fijo abre el formulario completo de
  edición. Revisar si Básico debería poder editarlo.
- **Hoy:** con ciclo semanal, la tarjeta sigue diciendo «En qué se fue el mes».
- **Hoy (Básico):** «Sueldo asignado» suma todos los ingresos del ciclo, no sólo el sueldo. Sólo se nota
  en una cuenta que tuvo otro plan.
- **Mis Deudas:** el desglose de fijos no descuenta los guardados con movimiento, y puede no cerrar con el
  número grande (`MisDeudas.tsx:258`). No se pudo ver porque la cuenta de QA no tiene deudas.
- **Cuentas:** un gasto (pago de fijo o guardado) puede dejar una cuenta en negativo sin aviso; las
  transferencias sí lo frenan. Confirmar si es a propósito.
- **Base:** las RPC de pago aceptan una fecha futura (la UI la bloquea con `max`).
