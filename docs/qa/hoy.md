# QA de Hoy

- **Fecha:** 2026-09-23 (1.ª pasada), 2026-09-24 (2.ª) y 2026-09-24→25 (3.ª), hora Argentina.
- **Planes:** Premium, Básico y Test.
- **Ciclos:** mensual, y semanal (semana actual sin cruzar mes, y la semana 28/9–4/10 vista con
  `?ciclo=`, ver HO-05).
- **Pasada:** 3.ª, cierre — los 14 hallazgos originales resueltos y verificados, más lo que quedaba
  «afuera» (HO-15 a HO-19), salvo lo relacionado a Me Deben/gastos compartidos (se van a rediseñar).

## Estado del arreglo (2026-09-24 → 2026-09-25)

Los 14 hallazgos de abajo se atacaron en un plan de 6 bloques sobre la rama `fix-issues`
(`C:\Users\leanf\.claude\plans\ahi-cambie-a-modo-zany-pnueli.md`), con D1 y D2 decididos por Lean.
**Estado: 14 de 14 resueltos y verificados en vivo con la cuenta de QA.** Migración aplicada a
producción, `lint`/`test` (634)/`build` en verde, sin commitear.

**Antes de planear, se re-chequeó cada hallazgo contra `fix-issues`** (los arreglos de Fijos y
Movimientos ya habían tocado el mismo código que usa Hoy): HO-04 parecía resuelto por FI-06 (no lo
estaba del todo, ver abajo), la etiqueta de HO-09 ya la arregló FI-20, y la confirmación de HO-11 ya
la traía MO-01. Los tres se re-verificaron igual, no se dieron por hechos.

### HO-04 cerrado — el gap de $3.000 era de la verificación, no de la app

La 2.ª pasada (2026-09-24) había dejado un gap de $3.000 entre el título "Proyectado" y el
desglose, con la semana 28/9–4/10 vista mediante `page.clock` fijado en el 30/9 — 6 días después
del día real (24/9). Esta 3.ª pasada reprodujo el número exacto peso a peso con los datos reales de
la cuenta de QA (una bolsa semanal "Súper", $80.000, con un pago de $3.000 el 22/9) y encontró la
causa: **no es un bug de `summarizeFixedExpenses` ni de la RPC — es que `page.clock` corrió "hoy"
más allá del margen que la base tolera.**

`rpc_projected_balance_range` acota el "hoy" que recibe a **±1 día de `current_date`**
(`hoy_del_cliente.sql`, pensado para que un reloj de dispositivo mal configurado no pueda mover el
proyectado más de un día). Con "hoy" = 30/9 en el cliente pero "hoy" real ≈ 24/9 en el servidor, los
dos lados calcularon la semana vigente de la bolsa **distinto**: el cliente escopeó los pagos de la
semana 28/9–4/10 (la que se estaba mirando), el servidor los de la semana 21–27/9 (la que
efectivamente contiene su "hoy" clampeado) — el pago del 22/9 cayó del lado del servidor y no del
cliente. Recalculando fijo por fijo:

| | Cliente (hoy=30/9, `summarizeFixedExpenses`) | Servidor (hoy real, RPC) |
|---|---|---|
| Súper (bolsa semanal) | $160.000 | $157.000 |
| QA BolsaMes (bolsa mensual) | $28.000 | $28.000 |
| QA Dia2 (una vez, due 2 — ambos meses) | $10.000 | $10.000 |
| **Total Fijos** | **$198.000** | **$195.000** |

$198.000 − $195.000 = **$3.000**, exacto. Con la RPC llamada directo (`p_today=2026-09-30` y
`p_today` nulo dan el MISMO resultado, $1.231.889 — confirma el clamp) y con `rpc_current_balance() =
$1.426.889`, el servidor descuenta $195.000 en Fijos, ninguna Deuda: cierra perfecto.

**Por qué no es reproducible por un usuario real:** el `today` que escopea la semana de una bolsa en
`statusFor` (`aggregate.ts`) es SIEMPRE el "hoy" real del dispositivo (`useToday()`/`new Date()`),
nunca la ventana que se está mirando — navegar Fijos a una semana futura no lo cambia. Sólo diverge
del servidor cuando el reloj del dispositivo está corrido más de 1 día del real, exactamente el caso
que el clamp existe para acotar. **No se toca código de producción.**

Test de regresión agregado en `aggregate.test.ts` ("HO-04: la semana que escopea una bolsa semanal
es la de 'hoy', no la del ciclo mirado") que fija este comportamiento con los mismos números.

**Lección para la próxima verificación en vivo:** `page.clock` sólo dentro de ±1 día de la fecha
real cuando la pantalla compara contra una RPC que recibe `p_today` — más allá de eso, cliente y
servidor dejan de mirar la misma ventana y cualquier gap que aparezca es de la prueba, no de la app
(sumado a `docs/qa/README.md`).

## Resumen

Hoy no carga casi ningún dato propio: junta números de Fijos, Cuentas, Mis Deudas y Movimientos. La
mayoría de esos números cierran bien — el desglose del proyectado sumó exacto contra `rpc_current_balance`
y `rpc_projected_balance_range` en el ciclo mensual normal — pero aparecieron varios casos concretos donde
no cierran o se ven mal:

- **En una semana que cruza dos meses, el desglose del proyectado no suma el total que muestra arriba**
  (diferencia de $332.345,67 en el caso probado): el servidor resta algo de más que el desglose no
  informa (HO-04, cerrado — el gap final resultó ser de la verificación, no de la app, ver arriba).
- **Una categoría con gastos ya cargados que se pasa a "ingreso" los hace desaparecer del desglose por
  categoría**, aunque sigan sumando en "Gastos" (HO-15, también afecta a Análisis).

## Hallazgos

| ID | Sev. | Estado | Título | Afecta |
|---|---|---|---|---|
| HO-01 | Alto | Resuelto | El saldo negativo no cambia de color en el hero | — |
| HO-02 | Alto | Resuelto | El ojo no oculta la lista de movimientos del mes | Movimientos |
| HO-03 | Alto | Resuelto | Una tarjeta sin compras cuenta como deuda impaga de $0 | Mis Deudas |
| HO-04 | Alto | Resuelto | Semana entre dos meses: el desglose del proyectado no suma el total | Fijos |
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
| HO-15 | Medio | Abierto | Categoría pasada a "ingreso" hace desaparecer sus gastos ya cargados del desglose | Análisis |

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
- **Estado: Resuelto.** FI-06 (QA de Fijos, `withMonthCarry` + instancias por (fijo, mes)) cerró la
  mayor parte de esta diferencia. Quedó un gap de $3.000,00 en la 2.ª pasada que parecía la misma
  clase de bug — la 3.ª pasada lo rastreó término a término y confirmó que era un artefacto de esa
  verificación (`page.clock` con "hoy" a más de 1 día del real, fuera del margen que tolera
  `rpc_projected_balance_range`), no un bug de la app — ver el detalle completo en «HO-04 cerrado» al
  principio del informe (sección «Estado del arreglo»), con el test de regresión que agregó. El copy
  de HO-09 (etiqueta y "de la semana") quedó resuelto del todo desde la 2.ª pasada.
- **Verificado en vivo (2.ª pasada):** semana 28/9–4/10 real (reloj fijado con `page.clock` a
  2026-09-30, ciclo semanal desde el lunes) → "Proyectado a fin de semana" = **$1.231.889,00**, pero
  el desglose decía "Saldo actual $1.426.889,00 − Fijos por pagar (6) $198.000,00" = **$1.228.889,00**
  — diferencia de **$3.000,00**. Sin fila "Deudas por pagar" (0 tarjetas en la cuenta).
- **Verificado en vivo (3.ª pasada, cierre):** RPC llamada directo con `p_from=2026-09-28`,
  `p_to=2026-10-04` — `p_today=2026-09-30` y `p_today` nulo dan el MISMO resultado, $1.231.889,00
  (confirma el clamp de ±1 día). Recalculando cada fijo de la cuenta a mano contra los datos reales
  (bolsa semanal "Súper" $80.000 con un pago de $3.000 el 22/9, bolsa mensual "QA BolsaMes", fijo
  "QA Dia2" con vencimiento en los dos meses) el total del cliente da $198.000 y el del servidor
  $195.000 — $3.000 de diferencia, exacto, íntegro en "Súper" (semana 28/9–4/10 escopeada por el
  cliente vs. semana 21–27/9 por el servidor). Sin escribir nada en la cuenta (sólo lecturas por
  REST) — detalle completo en «Estado del arreglo».

### HO-15 · Una categoría pasada a "ingreso" hace desaparecer del desglose los gastos ya cargados — Medio

- **Pasos:** crear una categoría de gasto, cargar un movimiento de gasto en ella, después editar la
  categoría y cambiarla a "Ingreso" (`CategoryRowEditor`, sin ningún freno) — mirar el desglose por
  categoría de Hoy/Análisis y "Gastos" del período.
- **Esperado:** el movimiento sigue siendo un gasto real (`transactions.type = 'expense'`) — tiene
  que seguir sumando en algún lado del desglose por categoría, aunque sea en "Sin categoría".
- **Obtenido:** el movimiento desaparece del desglose por categoría por completo (ni en su categoría
  vieja, ni en "Sin categoría"), mientras "Gastos" no se mueve — las dos cifras dejan de cerrar entre
  sí. Reproducido con una transacción de $10.000: antes del cambio, `v_range_summary().total_expense`
  y la suma de `v_spend_by_category()` daban los dos $579.501,10 (exacto); después de pasar la
  categoría a `income`, `total_expense` seguía en $579.501,10 pero la suma de
  `v_spend_by_category()` bajó a $569.501,10 — los $10.000 de diferencia son exactos.
- **Por qué:** `v_spend_by_category` (`20260912020001_spend_by_category_uncategorized.sql`) arma la
  lista con `left join transactions ... where c.kind = 'expense'` — una categoría que ya cambió a
  `income` queda afuera del `left join` por completo, así que cualquier gasto viejo que sigue
  apuntando a ella no aparece en ninguna fila (ni la propia categoría, que ya no calza el filtro; ni
  "Sin categoría", porque `category_id` no es `null`). `v_range_summary` (Gastos, Ingresos) no mira
  `kind` en absoluto — sólo `transactions.type` — así que no nota el cambio. No hay ningún freno del
  lado del cliente ni de la base que impida cambiar `kind` con movimientos ya cargados
  (`useUpdateCategory` hace un `update` directo, sin RPC).
- **Afecta:** Hoy y Análisis por igual (mismo RPC). No se encontró en el QA de Análisis anterior
  (`docs/qa/analisis.md`) — se suma acá porque apareció en esta pasada.
- **Decisión pendiente de Lean** (no se arregla solo — necesita elegir entre estas, y probablemente
  una migración):
  1. bloquear el cambio de `kind` en `rpc_update_category` (o una policy) si la categoría ya tiene
     transacciones del tipo contrario;
  2. en `v_spend_by_category`, sumar esos gastos "huérfanos" a la fila "Sin categoría" en vez de
     perderlos;
  3. dejarlo como está y avisarlo en el editor de categorías ("cambiar el tipo puede esconder gastos
     ya cargados").
- **No verificado con una categoría de INGRESO pasada a gasto** (el espejo) — por lectura de la
  misma función, `v_spend_by_category` sólo mira categorías `kind = 'expense'`, así que ese caso no
  aplica del mismo modo (una categoría de ingreso nunca aparecía ahí antes tampoco).

## Verificado en esta pasada, sin hallazgos

- **HO-16 · Medianoche con la app abierta:** con `page.clock` a las 23:58 del día real y avanzando 5
  minutos sin navegar, la RPC `rpc_projected_balance_range` se volvió a pedir SOLA con el `p_today`
  actualizado (`2026-09-24` → `2026-09-25`) apenas cruzó la medianoche — la cadena `useToday()` →
  `useCycle().current` (nueva referencia) → el `useMemo` de `summarizeFixedExpenses` en Hoy.tsx
  (que depende de `cycle`) se dispara sola. No hace falta que `today` (la variable local de
  Hoy.tsx) esté en las deps del `useMemo`: en la práctica siempre se recalcula en el mismo render
  que cambia `cycle`. No se probó específicamente el cruce de una SEMANA (domingo→lunes) por no caer
  la fecha real en ese borde esta pasada — la cadena de recálculo es la misma, así que se infiere
  igual de sólida, pero queda para una próxima pasada que si caiga en ese borde.
- **HO-17 · Dos pestañas:** pagar un fijo o cargar un movimiento en una pestaña B actualiza sola la
  pestaña A al volver a enfocarla (React Query, `refetchOnWindowFocus`, default de la app) — probado
  con QA Dia2 (marcar/desmarcar pagado) y un movimiento nuevo. El **tema** (`theme:dark`,
  localStorage) NO se sincroniza entre pestañas — es esperado: `createPersistedFlag` usa un pub-sub
  en memoria del módulo, sin `window.addEventListener('storage', …)`, así que cada pestaña sólo se
  entera de un cambio propio. Cada viewer conserva su propio tema, no es un bug.
  - **Nota de método:** el refetch-por-foco no se pudo confirmar con Playwright headless
    (`document.visibilityState` de la pestaña de atrás quedó en `'visible'` incluso con la otra al
    frente — Chromium headless con dos `Page`s del mismo contexto no siempre reproduce la
    oclusión real de pestañas), así que este punto se apoya en la lectura de código
    (`refetchOnWindowFocus` es el default de `QueryClient`, sin override en `main.tsx`) más que en
    la corrida en vivo.
- **HO-18 · Seguridad por API:** sin sesión (sólo la `anon key`), `rpc_current_balance`,
  `rpc_projected_balance_range`, `v_range_summary`, `v_spend_by_category`, `transactions` y
  `fixed_expense_payments` devuelven `0`/vacío — nunca error con datos, nunca datos de otra cuenta
  (todo depende de `auth.uid()`, que es `null` sin sesión). Con la sesión de QA, cada fila que
  vuelve es de su propio `user_id`. Mismo patrón ya confirmado en el QA de Movimientos.
- **HO-19 · Layout 768–1023px:** 768, 820, 900 y 1023px, claro y oscuro, con montos de 8 cifras
  (interceptando la respuesta de `rpc_current_balance`/`rpc_projected_balance_range`/
  `v_range_summary` con `page.route`, sin escribir nada en la cuenta) — sin scroll horizontal en
  ningún ancho, el borde izquierdo y el ancho del contenido siguen al shell en los dos temas.
- **Categoría archivada en el desglose:** por lectura de código, `v_spend_by_category` no filtra
  `is_archived` — una categoría archivada con gasto histórico lo sigue mostrando igual que una
  activa. No es un bug (una categoría archivada no deja de haber existido). No se armó un caso en
  vivo porque el resultado ya se desprende de la SQL sin ambigüedad.
- **Coherencia con Hoy abierto (HO-G) y el donut lado a lado con Análisis:** quedan fuera de esta
  pasada — Me Deben y los gastos compartidos se van a eliminar o rediseñar (decisión de Lean), y el
  donut comparte el mismo RPC (`v_spend_by_category`) que Hoy con el mismo `from`/`to`, así que por
  construcción da el mismo total en las dos pantallas para el mismo período; no se armó una
  comparación visual lado a lado aparte.

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

**3.ª pasada (cierre de HO-04 + lo que quedaba afuera, 2026-09-24→25):**

- **Perfil:** Premium, ciclo mensual, semana desde el lunes — sin cambios de plan ni de ciclo esta
  vez (HO-04 se cerró con lecturas por API sobre los datos ya cargados, sin navegar a otro ciclo).
- **Datos:** foto por API antes y después, exacta — 22 movimientos, `rpc_current_balance() =
  $1.426.889,00`. Lo cargado en esta pasada se probó y se deshizo en el momento, sin dejar marca
  `QA-HO3` en la cuenta: un pago de "QA Dia2" (marcado y desmarcado dos veces, por el bloque de
  «dos pestañas»), una categoría temporal "QA-HO3 Temp" con una transacción de $10.000 (HO-15, creada
  y borrada por API), y un movimiento "QA-HO3 dos pestañas" ($1.234, creado por UI y borrado por UI).
  El único resto que costó encontrar fue un pago de QA Dia2 que quedó pagado tras un timing de
  Playwright con `bringToFront()` entre dos pestañas — se encontró por API (`fixed_expense_payments`
  filtrado por ese fijo) y se deshizo con la RPC oficial `rpc_unmark_fixed_expense_payment`, no con
  un `DELETE` directo a la tabla.
- **Sin migración.** Playwright se instaló y se usó sólo en el scratchpad de la sesión (nunca en el
  repo); el dev server propio (puerto 5174, siguiente libre al 5173) se cerró al terminar.
