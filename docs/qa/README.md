# QA de MyFinances

Registro de las pasadas de QA manual, una por área de la app. La idea es tener en un solo lugar qué se
probó, qué se encontró y qué quedó pendiente, para armar después la foto de toda la app y priorizar.

## Estado por área

| Área | Informe | Última pasada | Código probado | Abiertos (C / A / M / B) |
|---|---|---|---|---|
| Cuentas | [cuentas.md](cuentas.md) | 2026-09-22 (3.ª) | rama `accounts`, `0a7662c` | 0 / 0 / 0 / 0 |
| Gastos fijos | [fijos.md](fijos.md) | 2026-09-22/23 (1.ª); los 26 issues (FI-01 a FI-26) resueltos y verificados en vivo al 2026-09-24; migraciones aplicadas | rama `fix-issues` | 0 / 0 / 0 / 0 |
| Movimientos | [movimientos.md](movimientos.md) | 2026-09-23 (1.ª); los 18 issues (MO-01 a MO-18) resueltos y verificados en vivo al 2026-09-24; migraciones aplicadas (una de las 4, `...050001`, aplicada por fuera de `db push` — ver el informe) | rama `fix-issues` | 0 / 0 / 0 / 0 |
| Mis Deudas | — | pendiente (ver transversales) | | |
| Ahorros | — | pendiente | | |
| Me Deben | — | pendiente (ver transversales) | | |
| Hoy | [hoy.md](hoy.md) | 2026-09-23 (1.ª); 13 de 14 issues (HO-01 a HO-14) resueltos y verificados en vivo al 2026-09-24; HO-04 queda Parcial (gap de $3.000 sin cerrar del todo); migración aplicada | rama `fix-issues` | 0 / 1 / 0 / 0 |
| Análisis | [analisis.md](analisis.md) | 2026-09-23 (1.ª) | rama `accounts`, `eeeab9b` | 0 / 5 / 4 / 0 |
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
- **Verificar un arreglo sí toca la cuenta de QA** (crear un fijo/movimiento de prueba, pagarlo,
  editarlo, borrarlo): a diferencia de una pasada de sólo informe, acá el objetivo es reproducir el
  bug arreglado en vivo. Usar datos de prueba nuevos y descartables, no los que ya dejó una pasada
  anterior (ver «Automatizar con Playwright» abajo) — y dejar la cuenta exactamente como estaba antes
  de irse (mismo saldo, mismos movimientos, mismo plan).
- **Antes de planear los arreglos de un informe, re-chequear cada hallazgo contra la rama actual.**
  Los arreglos de otras áreas tocan código compartido y pueden cerrar hallazgos de ésta sin que
  nadie lo haya anotado ahí — en el QA de Hoy, el arreglo de Fijos (FI-06) ya había cerrado la mayor
  parte de HO-04, FI-20 ya había arreglado la etiqueta de HO-09, y MO-01 (Movimientos) ya cubría la
  mitad de HO-11. Da por resuelto sólo lo que la lectura de código respalda, y de última palabra la
  verificación en vivo — FI-06 parecía cerrar HO-04 del todo y en los hechos quedó un gap de $3.000
  sin cerrar (ver `hoy.md`).

## Automatizar con Playwright: lo aprendido

Notas técnicas para la próxima vez que se verifique algo en vivo contra la app — evita repetir la
misma vuelta.

- **Cambiar el plan de la cuenta de QA por SQL, con el OK de Lean:**
  `npx supabase db query "update public.profiles set plan = '<basic|test|premium>' where id = '<uid>'" --linked`
  (columna sola, reversible, sin migración). Devolverla a Premium con la misma llamada al terminar.
- **La pantalla Fijos es idéntica en los tres planes** (alta, pago, edición, pausa y borrado de un
  fijo) — lo que cambia por plan es la nav (Mis Deudas/Análisis/Ahorros/Me Deben), Movimientos (carga
  manual, y qué pasa al tocar el movimiento de un fijo) y la tarjeta de Hoy. No hace falta cambiar de
  plan para probar el CRUD básico de Fijos, sólo para lo que estas tres pantallas documentan que
  cambia.
- **Confirmar qué migración falta antes de un `db push`:** `npx supabase migration list --linked` lista
  cada migración local con su fecha `remote` (vacía si todavía no se aplicó) — más preciso que mirar
  `ls supabase/migrations` y adivinar.
- **Selectores que rompen en esta app:**
  - Varios campos de importe (`AmountInput` dentro de un `Field`) no tienen `htmlFor`/`id` conectado
    al `<label>` — `getByLabel('Importe')` no los encuentra. Si el input está registrado con
    react-hook-form, tiene `name` (usar `input[name="amount"]`); si es controlado a mano (como en
    `MarkPaidDialog`), no tiene ni eso — usar `input[placeholder="0,00"]` escopeado al diálogo
    abierto.
  - Toda pantalla con lista (Movimientos, y probablemente otras) renderiza DOS DOM a la vez: una
    `<ul>` para mobile (`lg:hidden`) y otra para escritorio (`hidden lg:block`). `getByText(x).first()`
    agarra la fila mobile (oculta) y el click falla con «element is not visible» — usar `.last()` (la
    de escritorio va después en el DOM) o escopear al contenedor visible.
  - `getByRole(role, { name })` sin `exact: true` matchea por substring: `name: 'Ingreso'` también
    matchea el botón «Ingresos» del filtro de Movimientos si queda detrás de un modal. Para verificar
    que un chip quedó bloqueado (sin `onClick`, así que ya no es `role=button`), escopear a
    `page.locator('dialog[open]')` y usar `exact: true` — si no, un botón de fondo con un nombre
    parecido da un falso positivo de «sigue siendo clickeable».
  - Un mismo diálogo puede tener dos botones con el mismo texto visible (ej. `MarkPaidDialog` en modo
    «Guardar»: el chip de modo y el botón de confirmar dicen los dos «Guardar») — usar `.first()`
    (el chip, arriba en el DOM) y `.last()` (confirmar, en el footer) para desambiguar.
  - Un `<dialog>` cerrado sigue montado en el DOM (la app no lo desmonta, confía en
    `dialog:not([open]) { display:none }` del navegador) — Playwright ya lo excluye de `getByRole`
    porque no es accesible estando oculto, así que no hace falta filtrarlo a mano.
- **Servidor de dev en background:** con `npm run dev -- --port <N> --strictPort &` más
  `run_in_background: true`, la tarea puede reportar «exited with code 0» al toque (el wrapper del
  shell termina, no el proceso de Vite) — confirmar que sigue vivo con `netstat -ano | grep :<N>` o un
  `curl`, no confiar en el estado de la tarea. Matarlo al final con `taskkill //PID <pid> //F` (el PID
  de `netstat`, no el de la tarea en background).
- **Un `mutation.mutateAsync()` esperado (`await`) dentro de un handler sin `try/catch` dejaba una
  promesa rechazada sin manejar en la consola** cuando la base frenaba la escritura (ver FI-03/FI-11 en
  [fijos.md](fijos.md)) — el toast de error igual sale (hay un `MutationCache.onError` global en
  `main.tsx`), pero el error de consola queda. El patrón que ya usa el repo para evitarlo es
  `mutation.mutate(id, { onSuccess })`, sin `await` ni `mutateAsync`. Ya corregido en `MarkPaidDialog` y
  en `TransactionFormDialog` (`onDelete`/`confirmDelete`); puede quedar en otros diálogos.
- **Borrar un fijo NO borra sus movimientos.** `fixed_expense_payments` se va en cascada, pero
  `transactions.fixed_expense_payment_id` es `on delete set null`: el movimiento del pago queda huérfano
  y sigue restando del saldo. Al limpiar fixtures de prueba que se pagaron o cargaron, borrar también
  esos movimientos desde Movimientos (ya sin vínculo, se borran directo) — o quitar el pago antes de
  borrar el fijo. Confirmar al final con
  `select count(*) from transactions where user_id = '<uid>' and description like 'QA <prefijo>%'`.
- **Contar filas: SQL de sólo lectura, no texto en pantalla.** `Money` parte el importe en varios
  `<span>` (`$`, `30.000`, `,00`) y cada ancestro que los contiene también matchea
  `getByText('$30.000,00')` — un conteo da 2 con un solo pago. Para «¿se duplicó?» usar
  `npx supabase db query "select …" --linked` sobre la cuenta de QA; `getByText(...).count() > 0` sí
  sirve para «¿aparece este aviso?».
- **Cerrar el detalle de un fijo con el botón «Cerrar»**, no con `Escape`: en Playwright el `Escape` no
  lo cerró y el `<dialog open>` siguió tapando los clicks de atrás («intercepts pointer events»).
- **Doble toque:** `locator.dblclick()` manda dos `click` seguidos y alcanza para reproducir FI-01/FI-11.
- **Dato de base, no basura:** la cuenta de QA tiene un movimiento «dblclick test» de $1.500 del
  2026-09-22, vinculado a un pago — viene de la pasada original de FI-01. No borrarlo al limpiar.
- **Un fijo nuevo puede nacer invisible.** Si el `due_day` por default del form (10) ya pasó respecto a
  `starts_on` (hoy), el fijo recién creado queda afuera de Fijos ESTE mes (FI-07) — no aparece ni en la
  lista principal ni en «Pausados», así que no hay botón para editarlo ni borrarlo. Para un test que
  pague/edite un fijo de una sola vez el mismo día que lo crea, pasar `input#dueDay` explícito por
  encima del default. Si ya quedó uno así (por un script que crasheó a mitad de camino), no hace falta
  SQL: navegar a «Mes siguiente» lo saca a la luz, ahí sí aparece para borrarlo.
- **`getByLabel('Mes siguiente')` da 4 matches** (dos instancias de `CycleNav`, cada una con su propia
  duplicación mobile/desktop) — ni `.first()` ni `.last()` garantizan pegarle al visible. Filtrar con
  `.all()` + `isVisible()` y clickear el primero que sea visible.
- **Verificar un total agregado (FI-13, FI-07) sin fabricar todo desde cero:** si la cuenta de QA ya
  tiene datos reales de una pasada anterior que exponían el bug (ej. «QA Servicio», pagado con un
  importe y con la plantilla después empujada a otro por un pago futuro), usarlos de base — calcular el
  total esperado aparte con una consulta de sólo lectura que espeje la fórmula nueva, y compararlo contra
  lo que muestra la pantalla. Es una verificación más fuerte que un fixture armado a mano, porque usa el
  escenario que originalmente encontró el bug.
- **El botón «Pausados» del header hace dos cosas a la vez:** pide los fijos inactivos
  (`useFixedExpenses(showPaused)`, que por default sólo trae los activos) Y despliega el panel chico de
  «pausados» — comparten el mismo estado `showPaused`, no hay un «Ver» aparte que clickear después.
- **Un `Editar` anidado dentro del detalle sólo cierra el form, no el detalle de abajo.** Guardar un
  cambio desde «Editar» dentro de `FixedExpenseDetailDialog` deja el detalle todavía abierto,
  tapando los clicks siguientes («intercepts pointer events») — hay que cerrarlo aparte con «Cerrar»
  antes de seguir.
- **Probar la base directo con la sesión de la cuenta, sin instalar `@supabase/supabase-js`:** el token
  ya está en `localStorage` (`Object.keys(localStorage).find(k => k.includes('auth-token'))`, con
  `.access_token` adentro). Desde `page.evaluate`, un `fetch` a
  `${SUPABASE_URL}/rest/v1/rpc/<nombre>` (o `/rest/v1/<tabla>` para un `insert`/`delete` directo) con
  `apikey`/`Authorization: Bearer <token>` alcanza — mismo método que «API directa, con la sesión de la
  cuenta» que ya usa el formato de los informes (ver FI-14 en [fijos.md](fijos.md)).
- **Navegar un ciclo semanal o quincenal:** los botones de `CycleNav` se llaman «Mes anterior»/«Mes
  siguiente» en cualquier ciclo (deuda de accesibilidad conocida, ver `CycleNav.tsx`) — no existe
  «Semana siguiente».
- **Cambiar el ciclo de la cuenta de QA sin SQL:** Ajustes → Ciclo → «Semanal» y el día de arranque.
  El día se guarda en ISO (1 = lunes … 7 = domingo), no 0 = domingo. El selector de día sólo aparece con
  «Semanal»: para dejar `cycle_week_starts_on` en 1 hay que elegir «Semanal» → «Lun» → «Mensual».
- **Leer la base sin `supabase db query`:** en modo auto el clasificador puede frenar las lecturas de
  producción por CLI. El `fetch` desde `page.evaluate` con la sesión de la cuenta (ver arriba) sí anda
  y respeta RLS. Pasar email, contraseña y `anon key` al script por variables de entorno, no escritas en
  el archivo.
- **Limpiar con la API directa cuando la UI no llega:** un fixture que quedó pausado y sin pagos (sin
  plata real de por medio) se puede borrar con un `DELETE` autenticado a `/rest/v1/<tabla>?name=eq.…`
  en vez de navegar la UI para encontrarlo — más rápido que reproducir varios clicks sólo para limpiar,
  siempre que no haya movimientos vinculados de por medio (ahí sí conviene la UI, ver el punto de
  arriba sobre movimientos huérfanos).
- **Simular una hora puntual (medianoche, un horario límite) con `page.clock`** (Playwright) en vez de
  esperar el reloj real o cambiar la hora del sistema: `page.clock.install({ time: new Date(2026, 8, 30,
  23, 58) })` y después `page.clock.pauseAt(...)`/`fastForward(...)` para cruzar el borde — sirve para
  cualquier bug de "a tal hora pasa esto" en cualquier área (ver FI-23 y el borde sin reproducir de FI-15
  en [fijos.md](fijos.md)), no sólo Fijos.
- **Bajo RLS, un `update` sin policy no falla: afecta 0 filas sin avisar.** Un trigger o RPC que no es
  `security definer` corre con el permiso de quien llama; si escribe una tabla con RLS que no tiene
  policy para esa operación (pasó con `fixed_expense_savings`, FI-26 en [fijos.md](fijos.md)), no hay
  error de permiso: el síntoma es otro (ahí, `linked_movement_amount_invalid` porque el trigger leyó
  `not found`). Al probar un flujo que escribe en dos tablas, verificar las dos por SQL o API, no sólo
  la respuesta. Y al blindar una tabla sacándole policies de escritura, grepear qué otras funciones o
  triggers (no sólo las RPC "oficiales") también escriben ahí: la migración de FI-14 tuvo que convertir
  también `rpc_delete_account` y el trigger de sincronización.
- **Esperar la señal real, no un timeout fijo, cuando un diálogo depende de una query async** (ej. un
  origen que habilita/deshabilita campos). Un `waitForTimeout` corto puede leer el estado antes de
  que la query resuelva y dar un falso bug — usar `page.waitForFunction(...)` contra algo concreto
  (ej. que el botón Guardar deje de estar disabled). Así se descartó un falso positivo en MO-05/MO-07
  (ver [movimientos.md](movimientos.md)).
- **`dialog.innerText()` no lee valores de `<input>`.** Para verificar que un campo vino pre-cargado,
  usar `.inputValue()` sobre el input puntual, no el texto del diálogo entero — dio un falso "vino
  vacío" en un diálogo de edición de Movimientos.
- **`getByRole(role, {name}).isVisible()` no alcanza para probar un breakpoint responsive** cuando dos
  elementos comparten el mismo nombre accesible (ej. botón de header vs. FAB mobile, los dos "Nuevo
  movimiento") y uno queda podado del árbol de accesibilidad por `display:none` en un ancestro —
  Playwright sólo puede consultar el que sí está en el árbol en cada ancho, así que `count()`/
  `isVisible()` puede dar un resultado engañosamente estable. Inspeccionar el DOM directo con
  `page.evaluate` (`getBoundingClientRect()` + `getComputedStyle().display` del elemento y su padre).
- **Un FK `on delete set null` puede dejar filas huérfanas al limpiar fixtures**, no sólo en Fijos
  (ver el punto de arriba sobre `fixed_expense_payment_id`): en Me Deben, borrar una `receivable` no
  borra la transacción vinculada porque `expense_transaction_id` también es `set null`. No asumir que
  borrar el padre alcanza — cerrar siempre con un diff completo contra la línea base (conteo de filas
  + sumas), no sólo "borré lo que armé".
- **`npx supabase db push --linked` puede quedar bloqueado por el clasificador de modo auto** incluso
  con OK explícito de Lean para pushear (pasó dos veces seguidas con motivos distintos). La
  alternativa legítima para aplicar un archivo de migración puntual e idempotente es
  `npx supabase db query -f <archivo> --linked` (no bloqueada) — pero el archivo queda sin registrar
  en `supabase migration list --linked` hasta el próximo `db push --linked` normal, así que hay que
  anotarlo en el informe.
- **Login real por la UI, no fabricar el `localStorage` a mano.** El formato interno que usa
  supabase-js para la sesión puede no coincidir con lo que uno arma — más simple y más confiable
  llenar `#email`/`#password` y click en «Entrar», y de ahí en más sacar el token de
  `localStorage` (`sb-<project-ref>-auth-token`, `.access_token`) para el resto de las llamadas por
  API (ver QA de Hoy, 2026-09-24).
- **`useCountUp` (el conteo animado del saldo hero) puede devolver un valor a mitad de camino** si
  se lee el DOM apenas carga la página — aunque el código diga que no anima en el primer render, en
  Vite dev con `StrictMode` el efecto puede correr dos veces. Para un valor EXACTO, leer una fila no
  animada del desglose (`SummaryPanel`), no la cifra grande del hero.
- **El signo negativo de `splitMoney` es `−` (U+2212, MINUS SIGN), no el guion ASCII `-`.** Un regex
  que arma un test para parsear `aria-label="−$50.000,00"` tiene que aceptar los dos caracteres, o
  falla en silencio (no tira error, simplemente no matchea y el número sale mal).
- **React Query reintenta 3 veces con backoff (~1s+2s+4s ≈ 7s) antes de dar `isError`.** Para
  probar un error de red con `page.route(url, route => route.abort())`, esperar ese tiempo antes de
  mirar la UI — a los 1-2s todavía se ve el estado de carga, no el de error.
- **`createPersistedFlag` (tema, ojo de saldo) guarda `'1'`/`'0'` en `localStorage`, no
  `'true'`/`'false'`.** Setear el string equivocado desde un script no tira ningún error: el flag
  simplemente se queda en su default, y el resultado parece «no pasó nada» en vez de un fallo obvio.
- **`page.clock.install({ time: ... })` tiene que instalarse ANTES de navegar** a la página cuyo
  primer render depende de "hoy" (`useCycle`, `bag_cycle_from`/`bag_cycle_to`) — instalado después
  de que el primer render ya corrió con la hora real, ese render no se refresca solo.
- **Cambiar `cycle_kind`/`cycle_week_starts_on` de la cuenta de QA se puede hacer por REST directo**
  (`PATCH` a `/rest/v1/profiles` con el token de la sesión) sin pasar por SQL — esas dos columnas sí
  están en el grant de `authenticated` (a diferencia de `plan`/`role`, que siguen necesitando
  `db query` con el OK de Lean).
- **Un guardado con movimiento (`rpc_add_fixed_expense_saving` con `generateMovement: true`) deja un
  movimiento vinculado que no siempre aparece en la primera lectura de
  `fixed_expense_savings.transaction_id`** hecha ANTES de borrar el fijo de prueba. Verificar la
  limpieza con una consulta APARTE, después de borrar, buscando por descripción
  (`ilike 'Guardado · <nombre>%'`) — no confiar sólo en el mapeo armado de antemano.
- **Escopear cualquier lectura del DOM a `document.querySelector('dialog[open]')`** cuando se abre
  un diálogo sobre una pantalla con datos parecidos atrás (ej. Movimientos detrás de "Asignar
  sueldo") — un `document.querySelectorAll('li')` sin escopear puede engancharse con una fila de la
  pantalla de fondo, y el resultado se ve como un bug real (texto que no correspondía) cuando es un
  problema del selector.

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
- **Estados:** Abierto, Resuelto (con cómo se verificó), No reproducido, Verificado seguro (se probó
  un vector y no se pudo explotar), Por lectura de código (se vio en el código y no se pudo
  reproducir en vivo), o Parcial (un hallazgo con varios puntos, cuando sólo algunos se arreglaron —
  el detalle dice cuáles siguen abiertos y por qué).
- **Columna «Afecta»** (opcional, cuando el hallazgo cruza pantallas): si el disparador es de esta
  área pero el daño se ve en otra (ej. borrar desde Movimientos deja una tarjeta de Mis Deudas
  «pagada»), el hallazgo va con el ID de esta área y una columna «Afecta» lista las pantallas donde
  se nota. Si algo pasa entero en otra pantalla y sólo se vio de reojo, va a «Pendientes
  transversales» de abajo, no acá.
- **Lo verificado correcto**, para no repetirlo, y **lo que quedó afuera.**

## Reglas: el repo es público

- **Nada que identifique una cuenta:** ni emails, ni `uuid`, ni códigos de invitación, ni contraseñas. Se
  dice «la cuenta de QA» o «la cuenta de prueba», también al contar que se usó una segunda cuenta
  para probar el aislamiento entre cuentas.
- **Antes de cerrar un informe, correr este chequeo** desde la raíz del repo, en Git Bash. Tiene que salir
  vacío:

  ```sh
  git grep -nIE --untracked '[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+\.[A-Za-z]{2,}|[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}|eyJ[A-Za-z0-9_-]{20,}|[A-Z]{3,}-[A-Z0-9]{6}\b' -- . ':!package-lock.json' ':!supabase/migrations/20260806210001_cleanup_test_assets.sql' ':!supabase/migrations/20260807020001_promote_e2e_admin.sql' | grep -v '@example\.com'
  ```

  Busca emails, `uuid`, JWT y códigos de invitación en todo el repo, incluido lo nuevo sin commitear.
  Revisa el repo entero y no sólo `docs/qa`, porque un script de verificación o un comentario también
  pueden filtrar un dato. Las dos migraciones excluidas son historia ya aplicada. Lo motivó un email
  real que se coló en `analisis.md` aunque esta regla ya existía: sin un chequeo concreto, la regla
  sola no alcanza.
- **Un hallazgo de seguridad explotable** contra otras cuentas se anota acá de forma genérica («una RPC
  acepta X, ver informe privado») hasta que esté arreglado. El detalle va en un informe privado.
- Los montos y los nombres de prueba («Expensas», $180.000) sí van: son inventados.
- Las capturas no se suben. Si una hace falta, se describe con palabras.

## Pendientes transversales

Cosas vistas de reojo desde otra área, sin probar a fondo. Se mueven al informe de su área cuando se haga
esa pasada.

- **Mis Deudas:** el desglose de fijos no descuenta los guardados con movimiento, y puede no cerrar con el
  número grande (`MisDeudas.tsx:258`). No se pudo ver porque la cuenta de QA no tiene deudas.
- **Base:** las RPC de pago aceptan una fecha futura (la UI la bloquea con `max`).
- **Base:** las RPC que crean movimientos sin fecha explícita (`rpc_add_fixed_expense_saving`,
  `rpc_mark_credit_card_paid` y varias más) usan `current_date` (UTC) en vez de la fecha local — sólo
  se nota pasadas las 21h Argentina. Visto de reojo por lectura de código en el QA de Movimientos.
- **Movimientos, Hoy:** la fila de un ajuste de saldo con categoría asignada sigue diciendo "Ajuste de
  saldo · afuera de Análisis", pero en los hechos sí cuenta en Análisis (ver AN-01 en `analisis.md`) —
  la etiqueta miente en ese caso. Confirmado en vivo en el QA de Análisis.
- **Ajustes (Categorías):** pasar una categoría de Gasto a Ingreso deja sus gastos viejos contando en
  "Fijo vs. variable" de Análisis pero no en el resto de sus paneles (ver AN-02). El disparador es
  Categorías, el daño se ve en Análisis. Confirmado en vivo en el QA de Análisis.
- **Movimientos:** el drill-down desde Análisis a "Sin categoría" trae también ingresos y ajustes de
  saldo, que Análisis excluye de ese mismo total (ver AN-08 en `analisis.md`) — confirmado en vivo.
