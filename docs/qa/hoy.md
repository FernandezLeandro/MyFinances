# QA de Hoy

- **Fecha:** 2026-09-23, hora Argentina.
- **Código:** rama `accounts`, commit `37b5384`. Sin migraciones pendientes (`supabase migration list
  --linked`, 87/87 aplicadas).
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

| Bloque | Qué hace | IDs |
|---|---|---|
| 1 | Color del saldo negativo, el ojo oculta también la lista de movimientos, ojo nuevo en la tarjeta de Básico | HO-01, HO-02, HO-14 |
| 2 | Una tarjeta sin cuotas deja de contar como deuda; "guardado" unificado entre escritorio y mobile | HO-03, HO-07 |
| 3 | Hoy ignora `?ciclo=`; error visible si se corta el saldo; movimiento futuro marcado; copy por ciclo | HO-05, HO-06, HO-08, HO-09 |
| 4 | «Ingresos del ciclo» = mismo número en la tarjeta y en el diálogo; filas ajenas sin X; doble click no duplica | HO-10, HO-11, HO-13 |
| 5 | Un plan sin Mis Deudas no resta deudas del proyectado | HO-12 |
| 6 | Verificación en vivo (Playwright + API directa) y esta documentación | — |

**Decisiones de Lean (2026-09-24):**
- **D1 · «Sueldo asignado»** pasa a ser **todo ingreso no-ajuste del ciclo** (la misma regla que ya
  usa `v_range_summary`), sin migración — la tarjeta y el diálogo de Sueldo muestran siempre el
  mismo número. Copy nuevo: «Ingresos del ciclo». Una fila que no nació en el diálogo (con
  categoría o de pagar un fijo) se lista sin X, con «cargado desde Movimientos».
- **D2 · Un plan sin Mis Deudas no resta deudas del proyectado** (mismo criterio de «datos en
  pausa» que ya usa Cuentas en Básico) — con migración.

Migración: `20260924060001_proyectado_deudas_por_plan.sql` — `rpc_projected_balance_range` suma
`p_include_debts boolean default true`; con `false` (lo que mandan Hoy y Fijos sin `mis-deudas`) el
término de cuotas de tarjeta queda en 0. Aplicada con `supabase db push --linked`, confirmada con
`migration list --linked` (local=remote) y con la firma real leída de `pg_proc` en producción.

**Verificación en vivo (cuenta de QA, Premium salvo lo de Básico/Test):** Playwright con sesión real
(login por UI, resto por API directa con el token de `localStorage` — mismo método que ya usa el
resto de los informes) contra un dev server propio en el puerto 5174. Cada bug se reprodujo con
datos nuevos marcados `QA-HO2`, devueltos exactos al terminar (ver «Estado de la cuenta de QA al
cerrar»). Detalle de cada verificación en la sección de su propio hallazgo, abajo.

**Aprendido en esta verificación (nuevo en `docs/qa/README.md`):**
- `useCountUp` anima el "Saldo actual" del hero — leer su valor apenas carga la página puede
  capturarlo a mitad de la animación (cifras con centavos fraccionarios sin sentido). Para un valor
  exacto, leer la fila "Saldo actual" del desglose (`SummaryPanel`/`SaldoProyectadoPanel`), que no
  anima.
- El signo negativo que usa `splitMoney` es el carácter Unicode `−` (U+2212, MINUS SIGN), no el
  guion ASCII `-` — un regex que sólo busca `-` no matchea `aria-label="−$50.000,00"`.
- React Query reintenta 3 veces con backoff (~1s+2s+4s ≈ 7s) antes de dar `isError` — para probar
  un error de red con `page.route(...).abort()`, esperar ese tiempo antes de mirar la UI; a los 1-2s
  todavía se ve el esqueleto de carga, no el error.
- `createPersistedFlag` (tema, ojo de saldo) guarda `'1'`/`'0'` en `localStorage`, no `'true'`/`'false'`
  — poner el string equivocado deja el flag en su default sin tirar ningún error.
- Para simular un día puntual con `page.clock.install({ time: ... })`, instalarlo ANTES de navegar:
  `bag_cycle_from`/`bag_cycle_to` y `useCycle` leen `new Date()`, y sólo lo ven si el reloj ya está
  instalado cuando arranca el primer render.
- Cambiar `cycle_kind`/`cycle_week_starts_on` de la cuenta de QA se puede hacer por REST directo
  (`PATCH /profiles`, con el token de sesión) — esas dos columnas sí están en el grant de
  `authenticated`, a diferencia de `plan`/`role` (que siguen necesitando `db query` por SQL).
- Al limpiar un guardado con movimiento (`rpc_add_fixed_expense_saving` con
  `generateMovement: true`), no alcanza con `fixed_expense_savings.transaction_id` leído ANTES de
  borrar el fijo para encontrar el movimiento a borrar — verificar con una consulta APARTE, después
  de borrar, buscando por descripción (`ilike 'Guardado · <nombre>%'`) o por fecha, no confiar en el
  mapeo armado de antemano.

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

- **El ojo no oculta todo:** con "ocultar saldo" activado, la lista de movimientos del mes queda
  totalmente visible (importes, signo y color), mientras el resto de la pantalla sí se enmascara (HO-02).
- **El saldo negativo no se distingue:** la cifra grande de "Saldo actual" queda en el mismo azul de
  marca esté en positivo o en negativo (HO-01).
- **Una tarjeta sin compras en el ciclo cuenta como deuda impaga de $0**, e infla el contador de "Deudas
  por pagar" (HO-03) — se reprodujo en tres ventanas de tiempo distintas.
- **En una semana que cruza dos meses, el desglose del proyectado no suma el total que muestra arriba**
  (diferencia de $332.345,67 en el caso probado): el servidor resta algo de más que el desglose no
  informa (HO-04).
- **`?ciclo=` en la URL cambia el período que muestra Hoy** a pesar de que el código dice que "nunca
  navega" — probado con agosto completo, todos los números cambiaron (HO-05).
- **Sin aviso de error:** con la consulta del saldo cortada, el hero queda con el esqueleto de carga para
  siempre, mientras el desglose del proyectado muestra "Saldo actual $0,00" con total confianza y el
  título del panel se queda con el valor viejo — tres cifras que ya no cierran entre sí, sin ningún
  mensaje de error (HO-06).
- **"Guardado" de un mismo fijo da un número distinto en escritorio que en mobile**, cuando lo guardado
  supera lo que falta pagar (HO-07).
- **Un movimiento con fecha futura encabeza la lista sin ninguna marca**, tanto con datos ya cargados en
  la cuenta como con uno propio de esta pasada (HO-08).
- **En Básico, "Sueldo asignado" y el propio diálogo de "Asignar sueldo" no coinciden entre sí**: la
  tarjeta suma todos los ingresos no-ajuste del ciclo (no sólo lo que se cargó como sueldo), y el
  diálogo suma además los ajustes — dos cifras distintas para "lo que asignaste este ciclo", visibles
  una al lado de la otra (HO-10).
- **El diálogo de "Asignar sueldo" borra cualquier fila con una X sin confirmar**, mezclando sueldos
  reales con cualquier otro ingreso del ciclo — se vio un ajuste histórico de $1.500.000 (de haber
  dejado de usar Cuentas) listado ahí como si fuera una asignación más, un toque de distancia de
  borrarse sin aviso (HO-11).
- **Test resta una deuda de una tarjeta que el plan no puede ver en ningún lado** (HO-12): con una
  tarjeta con cuotas pendientes, el proyectado la descuenta igual que en Premium, pero Test no tiene
  Mis Deudas ni ningún otro lugar donde encontrarla o pagarla.
- **Doble click en "Agregar" del diálogo de Sueldo duplica la asignación** — reproducido dos veces, con
  dos formas distintas de doble click (HO-13).
- **Lo verificado sin problemas:** en el ciclo mensual actual, Saldo − Fijos por pagar − Deudas por pagar
  = Proyectado, al centavo, contra las dos RPC por separado; "Guardado para fijos" (fila informativa)
  también cierra con la fórmula del código; el día 31 de un fijo se clampea bien a "Vence el 30" en
  septiembre; no hay scroll horizontal de 320 a 1920px con montos de 7 a 10 cifras ni en modo oscuro; el
  modo oscuro se ve consistente con el claro.

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

### HO-01 · El saldo negativo no cambia de color en el hero — Alto

- **Pasos:** con la sesión de QA, insertar un ajuste temporal grande (marcado `QA-HO`, borrado
  enseguida) para que `rpc_current_balance()` dé negativo → abrir Hoy.
- **Esperado:** el saldo en rojo (o al menos un tono que no sea el mismo que en positivo), como pasa en
  el resto de la app con un importe negativo.
- **Obtenido:** la cifra "Saldo actual" se ve exactamente igual (mismo azul de marca) en $1.442.655,00
  que en −$557.345,00. Sólo el signo "−" delante avisa que es negativo.
- **Por qué:** `<Money tone="accent">` está fijo en `Hoy.tsx:329`, sin condicionar el tono al signo.
- **Nota:** el resto de la pantalla sí usa colores por signo (Gastos en rojo, filas de movimientos con
  `tone={income ? 'accent' : 'negative'}`) — sólo este hero queda afuera.
- **Arreglo:** `tone={currentBalanceCents < 0 ? 'negative' : 'accent'}` en el hero (`Hoy.tsx`).
- **Verificado en vivo:** ajuste temporal que dejó el saldo en −$3.573.111,00 → el `<span>` del hero
  pasó a `class="...text-negative..."`; al borrar el ajuste, volvió a `text-accent`. Por API directa
  (sesión de la cuenta de QA), no por captura.

### HO-02 · El ojo no oculta la lista de movimientos del mes — Alto

- **Pasos:** en Hoy, tocar el ojo de "Saldo actual" (ocultar saldo).
- **Esperado:** ningún importe visible mientras está activado.
- **Obtenido:** el hero, el flujo, el proyectado y su desglose, los vencimientos y Mis deudas se
  enmascaran bien (`••••`). Pero **"Movimientos de septiembre" queda intacto**: cada fila sigue
  mostrando su importe real, con signo y color (`−$50.000,00` en rojo, etc.) — de las seis cifras que se
  ven en pantalla con el ojo activado, sólo esta sección delata el detalle real.
- **Por qué:** `TransactionRow` (`TransactionRow.tsx:42-48`) no recibe la prop `hidden` — Hoy no se la
  pasa.
- **Arreglo:** `TransactionRow` suma `hidden?: boolean`, pasado a su `<Money>`; Hoy le pasa
  `balanceHidden`.
- **Verificado en vivo:** con el ojo activo, las 15 filas de plata visibles en la lista (hero,
  flujo, proyectado, vencimientos y "Movimientos de septiembre") mostraron `aria-label="Saldo
  oculto"` — cero importes con formato `$N.NNN,NN` visibles en toda la pantalla.

### HO-03 · Una tarjeta sin compras cuenta como deuda impaga de $0 — Alto

- **Pasos:** crear una tarjeta sin ninguna compra (marcada `QA-HO`) → mirar "Deudas por pagar" en el
  proyectado y el riel "Mis deudas".
- **Obtenido:** la tarjeta vacía suma al contador — "Deudas por pagar (3)" en vez de (2) reales — y
  aparece en el riel como una fila más: "QA-HO Tarjeta vacía · 0 cuotas · $0,00". El importe total
  ($17.500,00) no cambia, pero el contador y la lista sí.
- **Reproducido en tres ventanas distintas:** ciclo mensual de septiembre (3 deudas, 1 en $0), mensual de
  agosto vía `?ciclo=` (2 deudas, **las dos** en $0 — ninguna tarjeta tenía cuotas ese mes), y la semana
  28/9–4/10 (2 deudas, las dos en $0 otra vez).
- **Por qué:** `summarizeMisDeudas` (`credits/aggregate.ts:54`) calcula `paid` de una tarjeta sin ítems
  como "hay algún pago" — sin ítems y sin pago, da `paid = false`, así que cuenta como deuda impaga
  aunque no tenga nada que pagar ese período.
- **Arreglo:** `CardSummary` suma `hasDue` (`items.length > 0`); `MisDeudasSummary` suma
  `unpaidCount` (tarjetas `!paid && hasDue`, más las compras sueltas impagas) — no se tocó `paid`
  (Mis Deudas todavía lo usa para separar "pagadas" de la lista principal). Hoy, Fijos y Mis Deudas
  pasaron a usar `unpaidCount` en vez de contar `!paid` a mano.
- **Verificado en vivo:** con una tarjeta nueva sin ninguna compra, "Deudas por pagar" no apareció
  en el proyectado (antes de la tarjeta: 0 filas con ese texto; después: 0 filas también) — la
  cuenta de QA no tiene otras deudas activas, así que el caso "0 antes, 0 después" es exactamente lo
  que se esperaba del arreglo.

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

### HO-05 · `?ciclo=` en la URL hace que Hoy muestre otro período — Alto

- **Pasos:** con la sesión ya en Hoy (ciclo mensual, hoy 23 de septiembre), navegar a
  `/hoy?ciclo=2026-08-01`.
- **Esperado:** Hoy siempre muestra el ciclo que contiene a "hoy" — es lo que dice el comentario del
  código ("Hoy nunca navega").
- **Obtenido:** la pantalla entera pasa a mostrar agosto: Ingresos $1.850.000,00 (vs. $2.079.000,50 de
  septiembre), Gastos $410.750,75 (vs. $604.501,10), Fijos por pagar (2) (vs. (12)), Deudas por pagar (2)
  $0,00 (vs. (3) $17.500,00) — sin ningún aviso de que no es el período actual.
- **Por qué no se ve fácil en el uso normal:** Hoy no arma ese link por sí sola, pero cualquier otra
  pantalla que comparta el mismo `?ciclo=` en la URL (o un link guardado/compartido) puede dejar a
  alguien viendo Hoy con datos de otro mes sin darse cuenta.
- **Por qué:** `useCycle()` (`useCycle.ts:73-75`) lee el ciclo también del parámetro `?ciclo=` de la URL,
  sin distinguir Hoy de las pantallas que sí navegan a propósito (Fijos, Movimientos, Análisis).
- **Arreglo:** Hoy pasa a usar `const { current: cycle, config } = useCycle()` — `current` es el
  ciclo que CONTIENE a hoy, siempre, sin mirar la URL (ya lo exponía el hook, sólo faltaba usarlo).
- **Verificado en vivo:** la fila "Saldo actual" del desglose dio exactamente `$1.426.889,00` tanto
  en `/hoy` como en `/hoy?ciclo=2026-08-01` — mismo valor, mismo string, sin diferencia.

### HO-06 · Sin aviso de error: saldo cortado deja tres cifras que no cierran entre sí — Alto

- **Pasos:** cortar por red la consulta a `rpc_current_balance` (`route.abort()`) → recargar Hoy.
- **Obtenido:**
  - el hero "Saldo actual" se queda con el esqueleto gris de carga **para siempre** (sin reintentar con
    éxito ni mostrar un error);
  - la fila "Saldo actual" del desglose del proyectado muestra **"$0,00"**, con la misma confianza que
    si fuera el valor real;
  - el título "Proyectado a fin de mes" de arriba del mismo panel se queda con el valor **viejo**
    (−$9.024.190,66, el de antes del corte), porque esa consulta no se cortó.
  - El resultado: un panel que ya no cierra ni con sus propios números (−$9.024.190,66 ≠ $0,00 −
    $10.449.345,66 − $17.500,00), sin ningún mensaje que avise que algo falló.
- **Por qué:** ni el hero ni `SummaryPanel` miran `balance.isError` — sólo `isPending`
  (`Hoy.tsx:326-330`, `SummaryPanel.tsx:73-77`).
- **Arreglo:** `SummaryPanel` suma `isError`/`onRetry` (muestra `ErrorState` en vez de la cifra y el
  desglose); `SaldoProyectadoPanel` los recibe y los pasa; el hero mira `balance.isError` y muestra
  `ErrorState` en vez del esqueleto. En Hoy, `isSummaryPanelError = balance.isError ||
  isProjectedError` (cualquiera de las dos fuentes que suma el panel) y reintenta las que hayan
  fallado.
- **Verificado en vivo:** `route.abort()` sobre `rpc_current_balance` → a los ~9s (agotados los 3
  reintentos por defecto de React Query) aparecieron 2 alertas visibles (`role="alert"`: el hero y
  el panel de escritorio) más una tercera oculta (la copia mobile, `lg:hidden` a 1440px) con
  "¡No se pudo cargar / Reintentar", y **cero** apariciones de "$0,00" en toda la pantalla. Al
  destrabar la ruta y recargar, la fila "Saldo actual" volvió a `$1.426.889,00` exacto.

### HO-07 · "Guardado" de un fijo da un número distinto en escritorio y en mobile — Medio

- **Pasos:** un fijo con guardados que en total superan lo que falta pagar (ej. $70.000 guardados sobre
  un fijo de $80.000 con $30.000 ya cubiertos por un pago con movimiento, así que faltan $50.000) → mirar
  su línea en "Vencimientos" (escritorio) y en "Próximos vencimientos" (mobile), en la misma carga de
  página.
- **Obtenido:** el mismo fijo, al mismo momento, muestra **"$70.000,00 guardado"** en escritorio y
  **"$50.000,00 guardado"** en mobile.
- **Por qué:** son dos JSX casi idénticos con un tope distinto — escritorio topa contra el importe total
  del fijo (`Math.min(status.savedCents, status.fe.cents)`, `Hoy.tsx:497`), mobile contra lo que falta
  pagar (`Math.min(status.savedCents, status.remainingCents)`, `Hoy.tsx:558`).
- **Arreglo:** función pura `upcomingSavedCents(status)` (`fixed-expenses/aggregate.ts`, con test)
  con el tope correcto (contra `fe.cents`, el de escritorio). Las dos filas casi idénticas se
  unificaron en un solo componente, `UpcomingFixedRow` (`src/components/UpcomingFixedRow.tsx`), con
  una variante `dense` para la versión mobile — la duplicación era la causa de fondo del bug, así
  que dejó de ser posible que las dos copias se desincronicen.
- **Verificado en vivo:** el caso exacto del informe (fijo $80.000, $30.000 cubiertos por un pago
  con movimiento, $70.000 guardados en total) mostró **"$70.000,00 guardado"** en las dos vistas, a
  1440px y a 390px, en la misma carga de página.

### HO-08 · Un movimiento con fecha futura encabeza la lista sin marca — Medio

**Afecta:** Cuentas (el saldo actual también lo suma, sin filtrar por fecha).

- **Pasos:** cargar un movimiento con fecha dentro del ciclo pero posterior a hoy (ej. 28/9 con hoy
  23/9) → mirar "Movimientos de septiembre".
- **Obtenido:** se reprodujo con datos **ya cargados en la cuenta** (un movimiento "Cumpleaños" con
  fecha 30/9) y también con uno propio marcado `QA-HO` (28/9): los dos encabezan la lista, por encima
  de "Hoy", sin ningún ícono ni etiqueta de "futuro".
- **Por qué:** `dayLabel` (`Hoy.tsx:66-71`) sólo distingue "Hoy"/"Ayer"/el nombre del día — no hay rama
  para una fecha posterior a hoy. Además `rpc_current_balance` no filtra por fecha, así que ese
  movimiento ya está restado del "Saldo actual" aunque todavía no pasó.
- **Arreglo:** `dayLabel` se movió a un módulo puro (`transactions/aggregate.ts`, con test) y suma
  "Mañana" y "Programado · {fecha}" para una fecha posterior a hoy; `isFutureOccurredOn` (mismo
  módulo) marca la fila con `future`, que `TransactionRow` atenúa (`opacity-60`). El "Saldo actual"
  sigue sin filtrar por fecha a propósito: desde MO-16 (Movimientos) y FI-14 (Fijos) ya no entran
  fechas futuras por el formulario ni por las RPC de pago — filtrar cambiaría el saldo de toda la
  app por un caso que ya no se puede generar desde la UI.
- **Verificado en vivo, con datos reales de la cuenta** (sin fabricar nada): el movimiento
  "Cumpleaños" con fecha 30/9 que ya tenía la cuenta apareció bajo el grupo **"Programado ·
  miércoles 30 de septiembre"**, con la fila visiblemente atenuada (`opacity: 0.6` en su
  `getComputedStyle`) — en claro y en oscuro, a 1440 y a 390px. También probado con un movimiento
  propio `QA-HO2` de fecha "mañana" (25/9), cargado por API ya que el formulario bloquea la fecha
  futura: grupo "Mañana", misma atenuación.

### HO-09 · Copy fijo en "mes" con otros ciclos; semana entre meses dice "28–4 sep" — Bajo

- Con ciclo semanal o quincenal, el copy se queda en singular de mes: "Flujo del mes", "En qué se fue el
  mes", "Todavía no cargaste nada este mes" (estado vacío). Es el pendiente que ya estaba anotado en el
  README.
- Para la semana 28 sep–4 oct, el título de la lista dice **"Movimientos de 28–4 sep"** — sin el mes de
  octubre. Mismo patrón que FI-20 en Fijos.
- **Por qué:** `cycleShortLabel` (`cycle.ts:204-209`) arma la etiqueta semanal con un solo `MMM`, tomado
  siempre del `from`.
- **Estado de la etiqueta ("Movimientos de 28–4 sep"):** ya resuelto por FI-20 del QA de Fijos
  (`cycleShortLabel` arma "28 sep – 4 oct" cuando las dos puntas caen en meses distintos).
- **Arreglo del copy "mes" fijo:** helper puro nuevo `cycleArticleLabel(kind)` en `src/lib/cycle.ts`
  ("el mes"/"la quincena"/"la semana", con test), al lado de `cycleThisLabel`/`cycleOfLabel` que ya
  existían. Aplicado a "Flujo {del mes|de la quincena|de la semana}" (`cycleOfLabel`), "En qué se
  fue {el mes|la quincena|la semana}" (`cycleArticleLabel`) y los dos estados vacíos ("Todavía no
  cargaste nada/gastos {este mes|esta quincena|esta semana}", `cycleThisLabel`).
- **Verificado en vivo:** con ciclo semanal, "Flujo de la semana" y "En qué se fue la semana"; con
  ciclo quincenal, "Flujo de la quincena". El título "Movimientos de 28–4 sep" ya venía bien.

### HO-10 · "Sueldo asignado" y el diálogo de Sueldo muestran cifras distintas — Alto

**Afecta:** Movimientos (el diálogo lista transacciones que en realidad se editan/borran ahí).

- **Pasos:** en Básico, con el ciclo teniendo un sueldo real cargado, un ajuste de ingreso y otro
  ingreso suelto (todos con `type = 'income'`) → comparar "Sueldo asignado" (tarjeta de fijos) contra
  "Asignado este ciclo" (encabezado del diálogo que abre el botón "Sueldo", justo al lado).
- **Obtenido:** en el mismo momento, la tarjeta dice **"Sueldo asignado: $2.082.000,50"** y el diálogo
  dice **"Asignado este ciclo: $3.590.000,50"** — una diferencia de **$1.508.000,00** para lo que en la
  UI se presenta como el mismo concepto.
- **Por qué:**
  - "Sueldo asignado" (`Hoy.tsx:402`) es `totalIncome` de `v_range_summary`, que suma **todo ingreso
    no-ajuste** del ciclo — no sólo lo cargado desde "Asignar sueldo". Ya sumaba de más antes de esta
    pasada (una venta suelta y un movimiento sin relación con el sueldo, ambos preexistentes en la
    cuenta, entran en el total).
  - El diálogo (`AssignIncomeDialog.tsx:36,40`) trae con `useTransactions({..., type: 'income'})` y
    suma **todos** los ingresos, ajustes incluidos — un paso más permisivo todavía.
  - Ninguna de las dos cifras es "lo que asignaste como sueldo", y encima no coinciden entre sí.
- **Arreglo (D1):** una sola definición, `isCycleIncome` (`src/features/cycle-income/aggregate.ts`,
  con test que fija que suma lo mismo que `v_range_summary.total_income`) — ingreso no-ajuste del
  ciclo, sin importar de dónde salió. La tarjeta ya usaba esa misma regla (`totalIncome` de
  `v_range_summary`); el diálogo pasó a filtrar con `isCycleIncome` en vez de traer todo
  `type: 'income'` sin filtrar ajustes. Copy nuevo en los dos lados: "Ingresos del ciclo".
- **Verificado en vivo:** con un ingreso nuevo con categoría sumado a los que ya tenía la cuenta, la
  tarjeta mostró **"$2.091.345,50"** y el diálogo, en el mismo momento, **el mismo
  "$2.091.345,50"** — mismo `aria-label`, no sólo mismo texto redondeado.

### HO-11 · El diálogo de Sueldo mezcla cualquier ingreso y su X borra sin confirmar — Alto

**Afecta:** Cuentas.

- **Pasos:** abrir "Asignar sueldo" en una cuenta con historial (ajustes, ventas sueltas, un sueldo real)
  → mirar la lista "Asignaciones de este ciclo" → tocar la X de una fila cualquiera.
- **Obtenido:**
  - la lista trae de todo: se vio ahí, mezclado con "Sueldo septiembre $1.950.000,00", un ajuste
    histórico **"Saldo al dejar de usar Cuentas $1.500.000,00"** (de una migración/QA anterior) y una
    "Venta bici $120.000,50" — nada en la fila avisa que no es un sueldo;
  - la X borra la fila **al toque**, sin ningún diálogo de confirmación (verificado: 6 filas → 5 filas,
    sin overlay extra) — igual que MO-01 en Movimientos, pero acá con filas que ni siquiera se
    reconocen como "un movimiento" a simple vista.
- **Por qué:** `useTransactions({from, to, type: 'income'})` sin filtrar por origen
  (`AssignIncomeDialog.tsx:36`), y `onClick={() => removeIncome.mutate(income.id)}` directo, sin
  confirmar (`AssignIncomeDialog.tsx:115`).
- **Estado de la X sin confirmar:** ya resuelto por MO-01 del QA de Movimientos — el diálogo usa el
  mismo `ConfirmDeleteMovementDialog` que ya se generalizó ahí.
- **Arreglo de la mezcla (D1):** `isRemovableFromDialog` (mismo módulo nuevo que HO-10) — sin
  categoría y sin `fixed_expense_payment_id`, que es exactamente cómo nace lo que arma este
  diálogo. Una fila que no cumple eso se lista sin X, con "· cargado desde Movimientos" al lado de
  su descripción.
- **Verificado en vivo:** una fila con categoría (simulando algo cargado desde Movimientos) apareció
  sin botón (`li.querySelector('button')` da `null`) y con el texto "· cargado desde Movimientos" —
  las filas preexistentes de la cuenta que ya tenían categoría ("QA Servicio", entre otras) también
  aparecieron así, sin haber tocado nada.

### HO-12 · Test resta una deuda que el plan no puede ver ni pagar en ningún lado — Alto

- **Pasos:** en Test, con una tarjeta con una cuota pendiente en el ciclo (sin ninguna otra deuda) →
  mirar el proyectado de Hoy y la navegación completa del plan.
- **Obtenido:** el proyectado muestra **"Deudas por pagar (1) −$22.000,00"** y lo resta del total, pero
  Test no tiene "Mis deudas" en la nav (`Hoy`, `Movimientos`, `Fijos`, `Análisis`) ni ningún otro lugar
  de la app donde ver esa tarjeta o pagarla — la plata queda descontada sin que el plan ofrezca cómo
  resolverlo.
- **Por qué:** `Hoy.tsx:426-427` pasa `unpaidDebtsCents`/`unpaidDebtsCount` al proyectado sin mirar
  `canMisDeudas`, y `rpc_projected_balance_range` tampoco filtra por plan (el plan es sólo interfaz,
  como dice `CLAUDE.md`) — pero acá el efecto es que Test ve un número que no puede auditar.
- **Arreglo (D2, con migración):** `rpc_projected_balance_range` suma `p_include_debts boolean
  default true` (`20260924060001_proyectado_deudas_por_plan.sql`) — con `false`, el término de
  cuotas de tarjeta queda en 0. `useProjectedBalanceRange(from, to, includeDebts)` lo expone; Hoy y
  Fijos pasan `canMisDeudas`; Mis Deudas usa el default (`true`). Sin `canMisDeudas`, la fila
  "Deudas por pagar" tampoco aparece (se gatea a 0 antes de llegar al panel).
- **Verificado en vivo, en dos capas:** (1) por API directa, con una tarjeta de $22.000 en una
  cuota: `rpc_projected_balance_range(..., p_include_debts: true)` dio exactamente $22.000 menos
  que con `p_include_debts: false` — la migración distingue el término exacto, ni un peso de más o
  de menos; (2) en pantalla, con el plan de la cuenta de QA cambiado a Test por SQL (con el OK ya
  dado por Lean para esta pasada) y la misma tarjeta cargada: cero filas "Deudas por pagar" y el
  proyectado mostrado sin restarla.

### HO-13 · Doble click en "Agregar" del diálogo de Sueldo duplica la asignación — Medio

- **Pasos:** en el diálogo de Sueldo, cargar un importe y hacer doble click en "Agregar".
- **Obtenido:** reproducido dos veces, con dos técnicas distintas:
  - un click seguido de un segundo click forzado poco después: **2 filas** con el mismo importe;
  - dos clicks disparados en simultáneo (`Promise.all`): de 7 filas pasó a **9**, con exactamente 2
    filas nuevas del mismo importe.
- **Por qué:** el botón tiene `disabled={addIncome.isPending}` (`AssignIncomeDialog.tsx:90`), pero ese
  `isPending` se activa recién cuando React procesa el primer click — un segundo click que llega antes
  de ese re-render pasa igual. Mismo patrón que FI-01 (bolsas) en Fijos.
- **Arreglo:** mismo candado que FI-01/FI-11 (`MarkPaidDialog`) — un `useRef` síncrono que se marca
  antes de disparar la mutación y se libera en `onSettled`, más `.mutate()` en vez de `await
  mutateAsync()` (evita además la promesa sin manejar en consola que documenta el README de QA). Se
  aplicó el mismo patrón en `IncomeEditDialog.handleSave`, que tenía el mismo `await mutateAsync()`.
- **Verificado en vivo:** `locator.dblclick()` sobre "Agregar" con un importe nuevo → por API,
  **0 filas** con ese importe antes del click y **exactamente 1** después (no 2).

### HO-14 · La tarjeta de fijos de Básico no tiene ojo para ocultar el saldo — Bajo

- **Obtenido:** a diferencia del hero de Premium/Test, `FijosCicloCard` no tiene ningún control para
  ocultar sus cifras — en Básico, "Disponible"/"Total del ciclo"/"Falta pagar" quedan siempre visibles.
- **Por qué:** `FijosCicloCard.tsx` no usa `EyeToggle` en ningún lado del header.
- **Encontrado al re-chequear (sube la severidad, ver el motivo en «Estado del arreglo»):**
  `FijosCicloCard` ya recibía `hidden` del mismo `useHiddenBalance('saldo-actual')` que el hero de
  Premium/Test, pero sin `EyeToggle` no había forma de sacarlo de `true` una vez que quedaba así —
  una cuenta que ocultó el saldo en un plan superior y bajó a Básico quedaba con la tarjeta
  enmascarada para siempre.
- **Arreglo:** `EyeToggle` en el header de `FijosCicloCard`, con el mismo `onToggleHidden` que ya
  usa el resto de la pantalla (`toggleBalanceHidden` de `useHiddenBalance('saldo-actual')`) — un
  solo control, no uno nuevo por pantalla.
- **Verificado en vivo:** con el plan de la cuenta en Básico, el botón "Ocultar saldo" apareció
  junto al título de la tarjeta; al tocarlo, las cifras pasaron a `aria-label="Saldo oculto"`.

---

## Verificado correcto (no repetir)

- **El desglose del proyectado cierra al centavo** en el ciclo mensual (actual) y en una semana que no
  cruza meses, contra `rpc_current_balance()` y `rpc_projected_balance_range()` por separado.
- **"Guardado para fijos"** (fila informativa del desglose) coincide exacto con la fórmula de
  `summarizeFixedExpenses` (mínimo entre lo guardado sin movimiento y lo que falta pagar, sumado por
  fijo).
- **Un fijo con `due_day = 31`** en septiembre (30 días) muestra bien "Vence el 30" en Vencimientos —
  el clamp ya arreglado antes (ver el comentario "L2 del QA" en el código) sigue andando.
- **Sin scroll horizontal de 320 a 1920px**, con montos de 7 a 10 cifras (incluido un fijo de
  $9.999.999,99) y nombres largos (fijo, tarjeta, compra). Verificado también en modo oscuro a 390px.
- **Modo oscuro:** mismos hallazgos, misma legibilidad que en claro — no se vio nada que sólo pase con
  un tema.
- **El "solapamiento" del tab bar mobile con la última fila de Vencimientos** que se vio en una captura
  de página completa **no es un bug**: es la superposición normal y transitoria de un elemento
  `fixed` durante el scroll — con la pantalla quieta, las cuatro filas se leen completas por arriba del
  tab bar.
- **Categorías del donut y "Guardado ·"/"Ajuste de saldo"** se etiquetan bien en la lista de
  movimientos (el ajuste dice "afuera de Análisis").
- **Un movimiento con fecha futura fuera del ciclo actual** no aparece en "Movimientos de septiembre" —
  el filtro por rango de Hoy sí funciona bien (sólo el saldo, que es acumulado histórico, lo suma).
- **Nav e islas por plan:** Básico ve Hoy/Fijos/Movimientos; Test ve Hoy/Movimientos/Fijos/Análisis
  (sin Mis Deudas). El `+`/"Nuevo movimiento" de Test trae selector de Cuenta y **sin** el chip
  Compartido — igual que ya se había visto en el QA de Movimientos.
- **La tarjeta de fijos de Básico** muestra "Falta pagar" cuando no hay nada guardado ni asignado, y
  cambia bien a "Disponible" al asignar sueldo — el desglose Pagado/Falta pagar cierra contra Fijos.
- **En Básico, "Registrar" abre el diálogo de fijos** y Hoy se actualiza sin recargar.
- **En Test, con `showDesktopExtras`,** el proyectado y el donut ocupan sus dos columnas normalmente
  (Test tiene `movimientos-manuales` y `analisis`).

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
