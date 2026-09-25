# QA de Hoy

- **Fecha:** 2026-09-23, hora Argentina.
- **Planes:** Premium, Básico y Test.
- **Ciclos:** mensual, y semanal (semana actual sin cruzar mes, y la semana 28/9–4/10 vista con
  `?ciclo=`, ver HO-05).
- **Pasada:** 1.ª.

## Estado del arreglo (2026-09-24)

Los 14 hallazgos de abajo se atacaron en un plan de 6 bloques sobre la rama `fix-issues`
(`C:\Users\leanf\.claude\plans\ahi-cambie-a-modo-zany-pnueli.md`), con D1 y D2 decididos por Lean.
**Estado: 13 de 14 resueltos y verificados en vivo con la cuenta de QA; HO-04 queda Parcial** (el
arreglo de FI-06 no alcanza para un caso nuevo que apareció al verificar — ver su detalle).
Migración aplicada a producción, `lint`/`test` (633)/`build` en verde, sin commitear.

**Antes de planear, se re-chequeó cada hallazgo contra `fix-issues`** (los arreglos de Fijos y
Movimientos ya habían tocado el mismo código que usa Hoy): HO-04 parecía resuelto por FI-06 (no lo
está del todo, ver abajo), la etiqueta de HO-09 ya la arregló FI-20, y la confirmación de HO-11 ya
la traía MO-01. Los tres se re-verificaron igual, no se dieron por hechos.


### HO-04 sigue Parcial — el gap que encontró esta verificación

Con la semana 28/9–4/10 real (reloj fijado a 2026-09-30 con `page.clock`, ciclo semanal), el
desglose sigue sin sumar el título: **Proyectado $1.231.889,00**, pero **Saldo actual $1.426.889,00
− Fijos por pagar (6) $198.000,00 = $1.228.889,00** — una diferencia de **$3.000,00** que ni el
desglose ni ninguna otra fila muestran. El gap es mucho más chico que el original ($332.345,67:
FI-06 sí cerró la mayor parte), pero no llegó a cero.

Por lectura de código, el sospechoso es `statusFor` (`aggregate.ts:90-108`): una bolsa (`is_recurring`)
genera una instancia por cada mes que toca el ciclo (`summarizeFixedExpenses`, bloque FI-04), y cada
instancia calcula su propio `scopedPayments` — para la instancia del mes que SÍ es `today`'s month,
filtra los pagos a la semana vigente (`isCurrentMonth` → `true`); para la instancia del OTRO mes
(acá, octubre) cae a `isCurrentMonth === false` y usa `fePayments` SIN filtrar por semana. Con una
bolsa **semanal** (no mensual) cuya semana vigente cruza a ese otro mes, esa rama sin filtrar puede
contar un pago de una semana anterior como si fuera de la semana actual — sin confirmar si el
servidor hace exactamente lo mismo o distinto ahí. No se terminó de rastrear el mecanismo exacto
esta pasada (ver la nota de abajo, en el propio HO-04).

## Resumen

Hoy no carga casi ningún dato propio: junta números de Fijos, Cuentas, Mis Deudas y Movimientos. La
mayoría de esos números cierran bien — el desglose del proyectado sumó exacto contra `rpc_current_balance`
y `rpc_projected_balance_range` en el ciclo mensual normal — pero aparecieron varios casos concretos donde
no cierran o se ven mal:

- **En una semana que cruza dos meses, el desglose del proyectado no suma el total que muestra arriba**
  (diferencia de $332.345,67 en el caso probado): el servidor resta algo de más que el desglose no
  informa (HO-04).

## Hallazgos

| ID | Sev. | Estado | Título | Afecta |
|---|---|---|---|---|
| HO-01 | Alto | Resuelto | El saldo negativo no cambia de color en el hero | — |
| HO-02 | Alto | Resuelto | El ojo no oculta la lista de movimientos del mes | Movimientos |
| HO-03 | Alto | Resuelto | Una tarjeta sin compras cuenta como deuda impaga de $0 | Mis Deudas |
| HO-04 | Alto | Parcial | Semana entre dos meses: el desglose del proyectado no suma el total | Fijos |
| HO-05 | Alto | Resuelto | `?ciclo=` en la URL hace que Hoy muestre otro período | — |
| HO-06 | Alto | Resuelto | Sin aviso de error: saldo cortado deja tres cifras que no cierran entre sí | — |
| HO-07 | Medio | Resuelto | "Guardado" de un fijo da un número distinto en escritorio y en mobile | — |
| HO-08 | Medio | Resuelto | Un movimiento con fecha futura encabeza la lista sin marca | Cuentas |
| HO-09 | Bajo | Resuelto | Copy fijo en "mes" con otros ciclos; semana entre meses dice "28–4 sep" | Fijos |
| HO-10 | Alto | Resuelto | "Sueldo asignado" y el diálogo de Sueldo muestran cifras distintas | Movimientos |
| HO-11 | Alto | Resuelto | El diálogo de Sueldo mezcla cualquier ingreso y su X borra sin confirmar | Cuentas |
| HO-12 | Alto | Resuelto | Test resta una deuda que el plan no puede ver ni pagar en ningún lado | — |
| HO-13 | Medio | Resuelto | Doble click en "Agregar" del diálogo de Sueldo duplica la asignación | Movimientos |
| HO-14 | Bajo | Resuelto | La tarjeta de fijos de Básico no tiene ojo para ocultar el saldo | — |

Sev. = severidad (Crítico / Alto / Medio / Bajo).

---





### HO-04 · Semana entre dos meses: el desglose del proyectado no suma el total — Alto

- **Pasos:** ciclo semanal (lunes) → `/hoy?ciclo=2026-09-28` (semana 28 sep–4 oct, cruza septiembre y
  octubre) → comparar el desglose contra el título del panel.
- **Esperado:** Saldo actual − Fijos por pagar − Deudas por pagar = Proyectado, como cierra siempre en un
  período que no cruza meses (verificado: en la semana 21–27 sep, $1.442.655,00 − $324.345,67 − $0,00 =
  $1.118.309,33, exacto contra el título).
- **Obtenido**, en la semana 28/9–4/10: título "Proyectado a fin de semana" = **−$9.124.190,66**, pero el
  desglose de abajo dice Saldo $1.442.655,00 − Fijos $10.234.999,99 − Deudas $0,00 = **−$8.792.344,99**.
  Diferencia: **$332.345,67** que el servidor restó de más y el desglose no muestra en ningún lado.
- **Por qué (por lectura de código, con la sospecha ya anotada antes de probar):**
  `rpc_projected_balance_range` (`hoy_del_cliente.sql:52-93`) arrastra el cálculo de un fijo o de una
  bolsa hasta el 1.º del mes de `p_from` cuando corresponde, pero `summarizeFixedExpenses` en el cliente
  (`cycle.ts:255-260`) no hace ese mismo arrastre para una semana — de ahí que el cliente muestre menos
  de lo que el servidor efectivamente descontó.
- **Mismo bloque, ya sabido:** el header de la sección pasa a decir "Movimientos de **28–4 sep**" (sin el
  mes de octubre) — ver HO-09.
- **Estado: Parcial.** FI-06 (QA de Fijos, `withMonthCarry` + instancias por (fijo, mes)) cerró la
  mayor parte de esta diferencia, pero **queda un gap de $3.000,00** en la misma clase de escenario
  — ver el detalle completo, con el sospechoso identificado por lectura de código, en «HO-04 sigue
  Parcial» al principio del informe (sección «Estado del arreglo»). El copy de HO-09 (etiqueta y
  "de la semana") sí quedó resuelto del todo.
- **Verificado en vivo:** semana 28/9–4/10 real (reloj fijado con `page.clock` a 2026-09-30, ciclo
  semanal desde el lunes) → "Proyectado a fin de semana" = **$1.231.889,00**, pero el desglose dice
  "Saldo actual $1.426.889,00 − Fijos por pagar (6) $198.000,00" = **$1.228.889,00** — diferencia de
  **$3.000,00**, reproducida de forma estable (mismo resultado en dos corridas seguidas contra la
  misma cuenta, sin tocar datos entre medio). Sin fila "Deudas por pagar" (0 tarjetas en la cuenta).


## Quedó afuera

- **Coherencia con Hoy abierto (HO-G):** cargar un movimiento compartido u otra acción sin salir de Hoy,
  para ver si el proyectado queda desactualizado (`receivables/api.ts` no invalida
  `projected-balance-range`). Sólo se verificó por lectura de código.
- **Medianoche con la app abierta** (`useCycle` congela "hoy" al montar) y **dos pestañas**: no se
  probaron con reloj emulado esta pasada.
- **El donut contra Análisis** lado a lado, y una categoría archivada o pasada de gasto a ingreso.
- **Seguridad por API (HO-I):** las RPC de lectura de Hoy no se probaron a mano contra la cuenta de
  prueba habitual esta vez (se apoyó en lo ya verificado en el QA de Movimientos, mismas tablas).
- **Layout entre 768 y 1023px** específicamente (se cubrió 320, 390 y 1440).
- **HO-04, el mecanismo exacto del gap de $3.000 que quedó Parcial:** se identificó un sospechoso
  por lectura de código (`statusFor` en `aggregate.ts`, la rama `scopedPayments` de una bolsa cuya
  instancia NO es la del mes de "hoy") pero no se terminó de confirmar contra el SQL real del
  servidor — retomar comparando `rpc_projected_balance_range` término a término (por ejemplo,
  aislando cada fijo con ventanas de un solo día) contra el cliente, en vez de una sola corrida
  completa.

## Estado de la cuenta de QA al cerrar

**1.ª pasada (informe, 2026-09-23):**

- **Perfil:** Premium, ciclo mensual, semana desde el lunes — igual que al empezar (se probó Básico y
  Test por SQL directo en medio de la pasada, y se devolvió a Premium al terminar cada bloque).
- **Datos:** la foto final por SQL coincide exacta con la inicial — 22 movimientos, mismos totales de
  ingresos y gastos, 2 ajustes, `rpc_current_balance() = $1.426.889,00`, 2 cuentas sin archivar con la
  misma apertura, 9 fijos, 0 tarjetas, 0 compras sueltas, 1 deuda (la preexistente). Todo lo cargado en
  esta pasada (marcado `QA-HO`: 9 fijos, 3 tarjetas, 3 compras, 5 movimientos propios y 1 cuenta) se
  borró y se verificó por SQL que no queda ningún resto — incluidas las 4 asignaciones de sueldo de
  prueba sin la marca `QA-HO` (descripción "Sueldo", cargadas para probar HO-13), identificadas por
  importe y fecha antes de borrarlas.

**2.ª pasada (verificación de los arreglos, 2026-09-24):**

- **Perfil:** Premium, ciclo mensual, semana desde el lunes — igual que al empezar. Se probaron
  Básico (HO-10, HO-11, HO-13, HO-14) y Test (HO-12) cambiando `plan` por SQL directo (con el OK ya
  dado por Lean para toda la pasada) y se devolvió a Premium al terminar cada bloque; `cycle_kind`
  pasó por `weekly` (HO-04/HO-09, con `page.clock` fijando "hoy" en la semana 28/9–4/10) y volvió a
  `monthly` por REST directo (esas dos columnas sí están en el grant de `authenticated`).
- **Datos:** foto por API antes y después, exacta — 22 movimientos, `rpc_current_balance() =
  $1.426.889,00`, 2 cuentas, 9 fijos (8 activos), 0 tarjetas, 0 compras sueltas. Todo lo cargado en
  esta pasada (marcado `QA-HO2`: 1 ajuste temporal, 1 movimiento futuro, 1 tarjeta vacía, 1 fijo con
  dos guardados y su movimiento vinculado, 1 ingreso con categoría, 1 fila de sueldo del doble
  click, 1 tarjeta+compra para Test) se borró; el único resto que costó encontrar fue el movimiento
  "Guardado · QA-HO2 Fijo" ($30.000) que había generado el guardado-con-movimiento del caso de
  HO-07 — el `transaction_id` leído de `fixed_expense_savings` ANTES de borrar el fijo no alcanzó
  (ver la lección nueva en «Estado del arreglo»); se encontró y se borró con una consulta aparte
  por descripción, después de borrar el fijo, y se confirmó con una foto final limpia.
- **Migración aplicada a producción:** `20260924060001_proyectado_deudas_por_plan.sql` (HO-12/D2).
  El resto de los arreglos son sólo de cliente, sin migración.
