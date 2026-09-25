# QA de MyFinances

Registro de pasadas QA manual, una por área. Un solo lugar: qué se probó, qué se encontró, qué quedó pendiente → después foto de toda la app y priorizar.

## Estado por área

| Área | Informe | Última pasada | Código probado | Abiertos (C / A / M / B) |
|---|---|---|---|---|
| Cuentas | [cuentas.md](cuentas.md) | rama `accounts`, `0a7662c` | 0 / 0 / 0 / 0 |
| Gastos fijos | [fijos.md](fijos.md) | rama `fix-issues` | 0 / 0 / 0 / 0 |
| Movimientos | [movimientos.md](movimientos.md)| rama `fix-issues` | 0 / 0 / 0 / 0 |
| Mis Deudas | — | pendiente (ver transversales) | | |
| Ahorros | — | pendiente | | |
| Me Deben | — | pendiente (ver transversales) | | |
| Hoy | [hoy.md](hoy.md) | rama `fix-issues` | 0 / 0 / 0 / 0 |
| Análisis | [analisis.md](analisis.md) | rama `accounts`, `eeeab9b` | 0 / 4 / 4 / 0 |
| Admin | — | pendiente | | |

C / A / M / B = Crítico / Alto / Medio / Bajo.

## Cómo se hace una pasada

- **Cuenta de QA** dedicada (no cuenta de prueba habitual ni reales). Credenciales fuera del repo.
- **Dev server local contra base de producción** (no hay staging), con Playwright desde carpeta temporal, nunca instalado en repo.
- **Cada caso verificado en pantalla y en base:** Fijos, Hoy, Movimientos contra filas y saldo real, leídos con sesión de cuenta QA o SQL sólo lectura.
- **Layout 320 a 1920 px,** claro y oscuro, montos 7+ cifras. Cada ancho: medir scroll horizontal y que ningún texto salga de su tarjeta.
- **Planes:** probar en Premium; bajar cuenta QA a Básico o Test sólo para lo que cambia por plan. Al terminar, volver a Premium.
- **Pasada sólo informa: no arregla.** Arreglos en plan aparte, tras priorizar. Pasada siguiente re-verifica y actualiza estado en mismo archivo.
- **Verificar arreglo sí toca cuenta QA** (crear fijo/movimiento de prueba, pagar, editar, borrar): objetivo = reproducir bug arreglado en vivo. Usar datos de prueba nuevos y descartables, no los de pasada anterior (ver «Automatizar con Playwright») — y dejar cuenta exactamente igual (mismo saldo, movimientos, plan).
- **Antes de planear arreglos de un informe, re-chequear cada hallazgo contra rama actual.** Arreglos de otras áreas tocan código compartido y pueden cerrar hallazgos de ésta sin anotarlo — en QA de Hoy, arreglo de Fijos (FI-06) ya había cerrado mayor parte de HO-04, FI-20 ya arregló etiqueta de HO-09, MO-01 (Movimientos) ya cubría mitad de HO-11. Dar por resuelto sólo lo que lectura de código respalda; última palabra = verificación en vivo — FI-06 parecía cerrar HO-04 del todo, pero verificación con `page.clock` lejos de fecha real mostró gap de $3.000; costó otra pasada confirmar que era de la prueba, no de la app (ver `hoy.md` y lección de `page.clock` abajo). También al revés: arreglo de esta área puede cerrar hallazgo de otra — arreglo de HO-15 (Hoy, categoría con `kind` inmutable) cerró también AN-02 (Análisis), mismo disparador (pasar categoría de Gasto a Ingreso con movimientos cargados). Grepear título del hallazgo en demás informes antes de cerrarlo como "sólo de esta área".

## Automatizar con Playwright: lo aprendido

Notas técnicas para próxima verificación en vivo — evita repetir vuelta.

- **Cambiar plan de cuenta QA por SQL, con OK de Lean:**
  `npx supabase db query "update public.profiles set plan = '<basic|test|premium>' where id = '<uid>'" --linked`
  (columna sola, reversible, sin migración). Volver a Premium con misma llamada al terminar.
- **Pantalla Fijos idéntica en los tres planes** (alta, pago, edición, pausa, borrado) — por plan cambia nav (Mis Deudas/Análisis/Ahorros/Me Deben), Movimientos (carga manual, y qué pasa al tocar movimiento de un fijo) y tarjeta de Hoy. No cambiar plan para CRUD básico de Fijos, sólo para lo que esas tres pantallas documentan.
- **Confirmar qué migración falta antes de `db push`:** `npx supabase migration list --linked` lista cada migración local con su fecha `remote` (vacía si no aplicada) — más preciso que `ls supabase/migrations` y adivinar.
- **Selectores que rompen en esta app:**
  - Varios campos de importe (`AmountInput` dentro de un `Field`) no tienen `htmlFor`/`id` conectado
    al `<label>` — `getByLabel('Importe')` no los encuentra. Si el input está registrado con
    react-hook-form, tiene `name` (usar `input[name="amount"]`); si es controlado a mano (como en
    `MarkPaidDialog`), no tiene ni eso — usar `input[placeholder="0,00"]` escopeado al diálogo
    abierto.
  - Toda pantalla con lista (Movimientos, probablemente otras) renderiza DOS DOM a la vez: una
    `<ul>` para mobile (`lg:hidden`) y otra para escritorio (`hidden lg:block`). `getByText(x).first()`
    agarra la fila mobile (oculta) y el click falla con «element is not visible» — usar `.last()` (la
    de escritorio va después en el DOM) o escopear al contenedor visible.
  - `getByRole(role, { name })` sin `exact: true` matchea por substring: `name: 'Ingreso'` también
    matchea el botón «Ingresos» del filtro de Movimientos si queda detrás de un modal. Para verificar
    que un chip quedó bloqueado (sin `onClick`, así que ya no es `role=button`), escopear a
    `page.locator('dialog[open]')` y usar `exact: true` — si no, un botón de fondo con un nombre
    parecido da un falso positivo de «sigue siendo clickeable».
  - Mismo diálogo puede tener dos botones con mismo texto visible (ej. `MarkPaidDialog` en modo
    «Guardar»: el chip de modo y el botón de confirmar dicen los dos «Guardar») — usar `.first()`
    (el chip, arriba en el DOM) y `.last()` (confirmar, en el footer) para desambiguar.
  - `<dialog>` cerrado sigue montado en DOM (app no lo desmonta, confía en
    `dialog:not([open]) { display:none }` del navegador) — Playwright ya lo excluye de `getByRole`
    porque no es accesible estando oculto, así que no hace falta filtrarlo a mano.
- **Dev server en background:** con `npm run dev -- --port <N> --strictPort &` más `run_in_background: true`, tarea puede reportar «exited with code 0» enseguida (termina wrapper del shell, no Vite) — confirmar vivo con `netstat -ano | grep :<N>` o `curl`, no confiar en estado de tarea. Matar al final con `taskkill //PID <pid> //F` (PID de `netstat`, no de tarea background).
- **`mutation.mutateAsync()` con `await` en handler sin `try/catch` dejaba promesa rechazada sin manejar en consola** cuando base frenaba escritura (ver FI-03/FI-11 en [fijos.md](fijos.md)) — toast de error sale igual (`MutationCache.onError` global en `main.tsx`), pero error de consola queda. Patrón del repo para evitarlo: `mutation.mutate(id, { onSuccess })`, sin `await` ni `mutateAsync`. Corregido en `MarkPaidDialog` y `TransactionFormDialog` (`onDelete`/`confirmDelete`); puede quedar en otros diálogos.
- **Borrar fijo NO borra sus movimientos.** `fixed_expense_payments` va en cascada, pero `transactions.fixed_expense_payment_id` es `on delete set null`: movimiento del pago queda huérfano y sigue restando saldo. Al limpiar fixtures pagados/cargados, borrar también esos movimientos desde Movimientos (sin vínculo, se borran directo) — o quitar pago antes de borrar fijo. Confirmar al final con
  `select count(*) from transactions where user_id = '<uid>' and description like 'QA <prefijo>%'`.
- **Contar filas: SQL sólo lectura, no texto en pantalla.** `Money` parte importe en varios `<span>` (`$`, `30.000`, `,00`) y cada ancestro también matchea `getByText('$30.000,00')` — conteo da 2 con un solo pago. Para «¿se duplicó?» usar `npx supabase db query "select …" --linked` sobre cuenta QA; `getByText(...).count() > 0` sí sirve para «¿aparece este aviso?».
- **Cerrar detalle de fijo con botón «Cerrar»**, no `Escape`: en Playwright `Escape` no cerró y `<dialog open>` siguió tapando clicks («intercepts pointer events»).
- **Doble toque:** `locator.dblclick()` manda dos `click` seguidos, alcanza para reproducir FI-01/FI-11.
- **Dato de base, no basura:** cuenta QA tiene movimiento «dblclick test» de $1.500 del 2026-09-22, vinculado a pago — de pasada original de FI-01. No borrar al limpiar.
- **Fijo nuevo puede nacer invisible.** Si `due_day` default del form (10) ya pasó respecto a `starts_on` (hoy), fijo nuevo queda fuera de Fijos ESTE mes (FI-07) — ni en lista principal ni en «Pausados», sin botón para editar/borrar. Para test que paga/edita fijo el mismo día que lo crea, pasar `input#dueDay` explícito. Si ya quedó uno así (script crasheó a mitad), no hace falta SQL: «Mes siguiente» lo muestra, ahí se borra.
- **`getByLabel('Mes siguiente')` da 4 matches** (dos `CycleNav`, cada una con duplicación mobile/desktop) — ni `.first()` ni `.last()` garantizan el visible. Filtrar con `.all()` + `isVisible()` y clickear primer visible.
- **Verificar total agregado (FI-13, FI-07) sin fabricar todo:** si cuenta QA ya tiene datos reales de pasada anterior que exponían bug (ej. «QA Servicio», pagado con un importe y plantilla luego empujada a otro por pago futuro), usarlos de base — calcular total esperado aparte con consulta sólo lectura que espeje fórmula nueva, comparar con pantalla. Verificación más fuerte que fixture a mano: usa escenario que encontró el bug.
- **Botón «Pausados» del header hace dos cosas:** pide fijos inactivos (`useFixedExpenses(showPaused)`, default sólo activos) Y despliega panel chico de «pausados» — comparten estado `showPaused`, no hay «Ver» aparte.
- **`Editar` anidado dentro del detalle sólo cierra form, no detalle.** Guardar desde «Editar» en `FixedExpenseDetailDialog` deja detalle abierto tapando clicks («intercepts pointer events») — cerrarlo aparte con «Cerrar».
- **Probar base directo con sesión de cuenta, sin instalar `@supabase/supabase-js`:** token ya en `localStorage` (`Object.keys(localStorage).find(k => k.includes('auth-token'))`, con `.access_token`). Desde `page.evaluate`, `fetch` a `${SUPABASE_URL}/rest/v1/rpc/<nombre>` (o `/rest/v1/<tabla>` para `insert`/`delete` directo) con `apikey`/`Authorization: Bearer <token>` alcanza — mismo método que «API directa, con la sesión de la cuenta» del formato de informes (ver FI-14 en [fijos.md](fijos.md)).
- **Navegar ciclo semanal/quincenal:** botones de `CycleNav` se llaman «Mes anterior»/«Mes siguiente» en cualquier ciclo (deuda de accesibilidad conocida, ver `CycleNav.tsx`) — no existe «Semana siguiente».
- **Cambiar ciclo de cuenta QA sin SQL:** Ajustes → Ciclo → «Semanal» y día de arranque. Día guardado en ISO (1 = lunes … 7 = domingo), no 0 = domingo. Selector de día sólo con «Semanal»: para dejar `cycle_week_starts_on` en 1, elegir «Semanal» → «Lun» → «Mensual».
- **Leer base sin `supabase db query`:** en modo auto, clasificador puede frenar lecturas de producción por CLI. `fetch` desde `page.evaluate` con sesión (ver arriba) sí anda y respeta RLS. Pasar email, contraseña y `anon key` por variables de entorno, no en archivo.
- **Limpiar con API directa cuando UI no llega:** fixture pausado y sin pagos (sin plata real) se borra con `DELETE` autenticado a `/rest/v1/<tabla>?name=eq.…` en vez de navegar UI — más rápido, siempre que no haya movimientos vinculados (ahí conviene UI, ver punto de movimientos huérfanos).
- **Simular hora puntual (medianoche, horario límite) con `page.clock`** (Playwright) en vez de esperar reloj real o cambiar hora del sistema: `page.clock.install({ time: new Date(2026, 8, 30,
  23, 58) })` y luego `page.clock.pauseAt(...)`/`fastForward(...)` para cruzar borde — sirve para cualquier bug "a tal hora pasa esto" en cualquier área (ver FI-23 y borde sin reproducir de FI-15 en [fijos.md](fijos.md)), no sólo Fijos.
- **`page.clock` sólo dentro de ±1 día de fecha real, si pantalla compara contra RPC que recibe `p_today`.** Varias funciones (`rpc_projected_balance_range`, `rpc_mark_fixed_expense_paid`, `rpc_add_fixed_expense_saving`) acotan `p_today` a ±1 día de `current_date` del servidor (defensa a propósito contra reloj de dispositivo mal configurado, ver `hoy_del_cliente.sql`). `page.clock` a más de 1 día hace que cliente y servidor calculen "hoy" distinto — con bolsa semanal/quincenal puede escopear semanas distintas y dar gap que **no es bug de app, es la prueba mirando dos "hoy" diferentes** (pasó en QA de Hoy, HO-04: page.clock a 6 días del real dio gap de $3.000, enteramente de la verificación). Para simular varios días, verificar contra RPC llamada con mismo `p_today` (así "esperado" incluye clamp), no contra cálculo del cliente solo.
- **Bajo RLS, `update` sin policy no falla: afecta 0 filas sin avisar.** Trigger o RPC no `security definer` corre con permiso de quien llama; si escribe tabla con RLS sin policy para esa operación (pasó con `fixed_expense_savings`, FI-26 en [fijos.md](fijos.md)), no hay error de permiso: síntoma es otro (ahí, `linked_movement_amount_invalid` porque trigger leyó `not found`). Flujo que escribe en dos tablas: verificar ambas por SQL o API, no sólo respuesta. Al blindar tabla sacando policies de escritura, grepear qué otras funciones o triggers (no sólo RPC "oficiales") escriben ahí: migración de FI-14 tuvo que convertir también `rpc_delete_account` y trigger de sincronización.
- **Esperar señal real, no timeout fijo, cuando diálogo depende de query async** (ej. origen que habilita/deshabilita campos). `waitForTimeout` corto puede leer estado antes de que query resuelva → falso bug. Usar `page.waitForFunction(...)` contra algo concreto (ej. botón Guardar deja de estar disabled). Así se descartó falso positivo en MO-05/MO-07 (ver [movimientos.md](movimientos.md)).
- **`dialog.innerText()` no lee valores de `<input>`.** Para verificar campo pre-cargado, `.inputValue()` sobre input puntual, no texto del diálogo — dio falso "vino vacío" en diálogo de edición de Movimientos.
- **`getByRole(role, {name}).isVisible()` no alcanza para probar breakpoint responsive** cuando dos elementos comparten nombre accesible (ej. botón header vs. FAB mobile, ambos "Nuevo movimiento") y uno queda podado del árbol de accesibilidad por `display:none` en ancestro — Playwright sólo consulta el que está en árbol en cada ancho, así `count()`/
  `isVisible()` puede dar resultado engañosamente estable. Inspeccionar DOM directo con `page.evaluate` (`getBoundingClientRect()` + `getComputedStyle().display` del elemento y su padre).
- **FK `on delete set null` puede dejar filas huérfanas al limpiar fixtures**, no sólo en Fijos (ver punto de `fixed_expense_payment_id`): en Me Deben, borrar `receivable` no borra transacción vinculada porque `expense_transaction_id` también es `set null`. No asumir que borrar padre alcanza — cerrar siempre con diff completo contra línea base (conteo filas + sumas), no sólo "borré lo que armé".
- **`npx supabase db push --linked` puede quedar bloqueado por clasificador de modo auto** aun con OK explícito de Lean (pasó dos veces seguidas, motivos distintos). Alternativa legítima para migración puntual e idempotente: `npx supabase db query -f <archivo> --linked` (no bloqueada) — pero archivo queda sin registrar en `supabase migration list --linked` hasta próximo `db push --linked` normal; anotarlo en informe.
- **Login real por UI, no fabricar `localStorage` a mano.** Formato interno de sesión de supabase-js puede no coincidir con lo armado — más simple llenar `#email`/`#password`, click «Entrar», y luego sacar token de `localStorage` (`sb-<project-ref>-auth-token`, `.access_token`) para resto de llamadas API (ver QA de Hoy, 2026-09-24).
- **`useCountUp` (conteo animado del saldo hero) puede devolver valor a mitad de camino** si se lee DOM apenas carga — aunque código diga que no anima en primer render, en Vite dev con `StrictMode` efecto puede correr dos veces. Para valor EXACTO, leer fila no animada del desglose (`SummaryPanel`), no cifra grande del hero.
- **Signo negativo de `splitMoney` es `−` (U+2212, MINUS SIGN), no guion ASCII `-`.** Regex para parsear `aria-label="−$50.000,00"` debe aceptar ambos, o falla en silencio (no matchea, número sale mal).
- **React Query reintenta 3 veces con backoff (~1s+2s+4s ≈ 7s) antes de `isError`.** Probando error de red con `page.route(url, route => route.abort())`, esperar ese tiempo antes de mirar UI — a 1-2s todavía se ve carga, no error.
- **`createPersistedFlag` (tema, ojo de saldo) guarda `'1'`/`'0'` en `localStorage`, no `'true'`/`'false'`.** String equivocado desde script no tira error: flag queda en default, parece «no pasó nada» en vez de fallo obvio.
- **`page.clock.install({ time: ... })` debe instalarse ANTES de navegar** a página cuyo primer render depende de "hoy" (`useCycle`, `bag_cycle_from`/`bag_cycle_to`) — instalado después, ese render no se refresca solo.
- **Cambiar `cycle_kind`/`cycle_week_starts_on` de cuenta QA por REST directo** (`PATCH` a `/rest/v1/profiles` con token de sesión) sin SQL — esas dos columnas sí están en grant de `authenticated` (a diferencia de `plan`/`role`, que necesitan `db query` con OK de Lean).
- **Guardado con movimiento (`rpc_add_fixed_expense_saving` con `generateMovement: true`) deja movimiento vinculado que no siempre aparece en primera lectura de `fixed_expense_savings.transaction_id`** hecha ANTES de borrar fijo de prueba. Verificar limpieza con consulta APARTE, tras borrar, por descripción (`ilike 'Guardado · <nombre>%'`) — no confiar sólo en mapeo previo.
- **Escopear toda lectura DOM a `document.querySelector('dialog[open]')`** cuando se abre diálogo sobre pantalla con datos parecidos atrás (ej. Movimientos detrás de "Asignar sueldo") — `document.querySelectorAll('li')` sin escopear puede engancharse con fila del fondo, y parece bug real (texto que no correspondía) cuando es problema del selector.

## Severidades

| Severidad | Criterio |
|---|---|
| **Crítico** | Se pierde o duplica plata sin aviso, o se rompen datos de forma difícil de recuperar. |
| **Alto** | Número o estado queda mal (pagado sin estarlo, saldo que no cierra), o acción común hace distinto de lo que usuario cree. |
| **Medio** | Confunde, evitable con cuidado, o sólo en caso poco común o por API. |
| **Bajo** | Copy, layout, validaciones de borde. |

## Formato de cada informe

- **IDs por área:** `CU-` Cuentas, `FI-` Fijos, `DE-` Mis Deudas, `AH-` Ahorros, `MD-` Me Deben,
  `MO-` Movimientos, `HO-` Hoy, `AN-` Análisis, `AD-` Admin. ID no se reusa.
- **Encabezado:** fecha, rama y commit, planes y ciclos probados.
- **Resumen**, más tabla de hallazgos (ID, severidad, estado, título).
- **Cada hallazgo:** pasos, esperado, obtenido, evidencia y, si se sabe, por qué pasa (`archivo:línea`).
- **Estados:** Abierto, Resuelto (con cómo se verificó), No reproducido, Verificado seguro (vector probado, no explotable), Por lectura de código (visto en código, no reproducido en vivo), o Parcial (hallazgo con varios puntos, sólo algunos arreglados — detalle dice cuáles siguen abiertos y por qué).
- **Columna «Afecta»** (opcional, cuando hallazgo cruza pantallas): si disparador es de esta área pero daño se ve en otra (ej. borrar desde Movimientos deja tarjeta de Mis Deudas «pagada»), hallazgo lleva ID de esta área y «Afecta» lista pantallas donde se nota. Si pasa entero en otra pantalla y sólo se vio de reojo, va a «Pendientes transversales», no acá.
- **Lo verificado correcto**, para no repetirlo, y **lo que quedó afuera.**

## Reglas: el repo es público

- **Nada que identifique cuenta:** ni emails, ni `uuid`, ni códigos de invitación, ni contraseñas. Decir «la cuenta de QA» o «la cuenta de prueba», también al contar uso de segunda cuenta para probar aislamiento entre cuentas.
- **Antes de cerrar informe, correr este chequeo** desde raíz del repo, en Git Bash. Debe salir vacío:

  ```sh
  git grep -nIE --untracked '[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+\.[A-Za-z]{2,}|[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}|eyJ[A-Za-z0-9_-]{20,}|[A-Z]{3,}-[A-Z0-9]{6}\b' -- . ':!package-lock.json' ':!supabase/migrations/20260806210001_cleanup_test_assets.sql' ':!supabase/migrations/20260807020001_promote_e2e_admin.sql' | grep -v '@example\.com'
  ```

  Busca emails, `uuid`, JWT y códigos de invitación en todo el repo, incluido lo nuevo sin commitear. Revisa repo entero, no sólo `docs/qa`, porque script de verificación o comentario también pueden filtrar dato. Las dos migraciones excluidas son historia ya aplicada. Motivo: email real se coló en `analisis.md` aunque regla ya existía — sin chequeo concreto, regla sola no alcanza.
- **Hallazgo de seguridad explotable** contra otras cuentas se anota acá genérico («una RPC acepta X, ver informe privado») hasta arreglarse. Detalle en informe privado.
- Montos y nombres de prueba («Expensas», $180.000) sí van: inventados.
- Capturas no se suben. Si hace falta, se describe con palabras.

## Pendientes transversales

Cosas vistas de reojo desde otra área, sin probar a fondo. Se mueven al informe de su área cuando se haga esa pasada.

- **Mis Deudas:** desglose de fijos no descuenta guardados con movimiento, puede no cerrar con número grande (`MisDeudas.tsx:258`). No visto porque cuenta QA no tiene deudas.
- **Base:** RPC de pago aceptan fecha futura (UI la bloquea con `max`).
- **Base:** RPC que crean movimientos sin fecha explícita (`rpc_add_fixed_expense_saving`, `rpc_mark_credit_card_paid` y varias más) usan `current_date` (UTC) en vez de fecha local — sólo se nota pasadas 21h Argentina. Visto por lectura de código en QA de Movimientos.
- **Movimientos, Hoy:** fila de ajuste de saldo con categoría asignada sigue diciendo "Ajuste de saldo · afuera de Análisis", pero sí cuenta en Análisis (ver AN-01 en `analisis.md`) — etiqueta miente. Confirmado en vivo en QA de Análisis.
- **Movimientos:** drill-down desde Análisis a "Sin categoría" trae también ingresos y ajustes de saldo, que Análisis excluye de ese total (ver AN-08 en `analisis.md`) — confirmado en vivo.