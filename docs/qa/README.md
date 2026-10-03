# QA de MyFinances

Cómo se hace una pasada de QA manual, y lo que aprendimos automatizándola con Playwright: sirve para
cualquier verificación en vivo, no sólo para una pasada completa. Los informes por área (Cuentas,
Fijos, Hoy, Movimientos, Análisis) se cerraron con todo resuelto y se borraron del repo.

## Cómo se hace una pasada

- **Cuenta de QA dedicada** (ni la cuenta de prueba habitual ni cuentas reales). Credenciales fuera del repo.
- **Dev server local contra la base de producción** (no hay staging), con Playwright instalado en una
  carpeta temporal, nunca en el repo.
- **Cada caso se verifica en pantalla y en base:** lo que muestran Fijos, Hoy o Movimientos contra las
  filas y el saldo real, leídos con la sesión de la cuenta de QA o con SQL de sólo lectura.
- **Layout de 320 a 1920 px** (320/360/375/390/414/430/500/…/1920), claro y oscuro, montos de 7+ cifras.
  En cada ancho, medir `document.documentElement.scrollWidth - innerWidth` **y** comparar el rect de
  cada hoja del DOM contra el padding-box de su tarjeta: eso detecta lo que se escapa de su caja sin
  generar scroll. Si la cuenta tiene montos chicos, inyectar los largos por DOM antes de medir (los
  `<span>` de `<Money>` son `[símbolo, entero, fracción]`). El `-ml-1` del `$` del saldo hero da un
  falso positivo constante de 4px: ignorarlo.
- **Planes:** probar en Premium; bajar a Básico o Test sólo lo que cambia por plan, y al terminar volver
  a Premium. Fijos es idéntico en los tres planes; por plan cambian la navegación, Movimientos (carga
  manual y qué pasa al tocar el movimiento de un fijo) y la tarjeta de Hoy.
- **La pasada sólo informa, no arregla.** Los arreglos van en un plan aparte, tras priorizar.
- **Verificar un arreglo sí toca la cuenta de QA:** el objetivo es reproducir en vivo el bug arreglado,
  con datos nuevos y descartables, y dejar la cuenta exactamente igual (saldo, movimientos, plan).
  Cerrar con un diff contra la línea base (conteo de filas + sumas), no con «borré lo que armé».
- **Antes de planear arreglos, re-chequear cada hallazgo contra la rama actual.** Arreglos de otras
  áreas tocan código compartido y cierran hallazgos sin anotarlo; también al revés — antes de cerrar un
  hallazgo como «sólo de esta área», buscar el mismo disparador en las demás. La lectura de código
  orienta; la última palabra es la verificación en vivo.

## Playwright: lo aprendido

### Entorno y sesión

- **Dev server en background:** con `npm run dev -- --port <N> --strictPort` y `run_in_background`, la
  tarea puede decir «exited with code 0» enseguida (termina el wrapper, no Vite). Confirmar con
  `netstat -ano | grep :<N>` o `curl`, y matar al final con `taskkill //PID <pid> //F` (el PID de
  `netstat`, no el de la tarea).
- **Login real por la UI**, no fabricar `localStorage` a mano: llenar `#email`/`#password`, click
  «Entrar», y sacar el token de `localStorage` (`sb-<project-ref>-auth-token`, `.access_token`).
- **Pasar email, contraseña y `anon key` por variables de entorno**, no escritos en un archivo.
- **Cambiar el plan de la cuenta de QA** (sólo con OK de Leandro):
  `npx supabase db query "update public.profiles set plan = '<basic|test|premium>' where id = '<uid>'" --linked`.
- **Cambiar el ciclo sin SQL:** `PATCH` a `/rest/v1/profiles?id=eq.<uid>` con el token (`cycle_kind` y
  `cycle_week_starts_on` sí están en el grant de `authenticated`), o por Ajustes → Ciclo. El día va en
  ISO (1 = lunes … 7 = domingo); el selector de día sólo aparece con «Semanal».
- **`createPersistedFlag` (tema, ojo del saldo) guarda `'1'`/`'0'`**, no `'true'`/`'false'`: con el
  string equivocado no hay error, el flag queda en su default.

### Selectores y DOM duplicado

- **Las listas renderizan dos DOM:** una `<ul>` mobile (`lg:hidden`) y otra de escritorio
  (`hidden lg:block`). En desktop la visible es `.last()`; en mobile, `.first()`. O escopear al
  contenedor visible.
- **`getByLabel('Mes siguiente')` da 4 matches** (dos `CycleNav` × mobile/desktop): filtrar con
  `.all()` + `isVisible()`. En ciclo semanal o quincenal los botones igual se llaman «Mes
  anterior»/«Mes siguiente».
- **En mobile, `ul li` sin escopear engancha el menú del shell:** usar `main ul li`.
- **Varios `AmountInput` no tienen el `<label>` conectado:** `getByLabel('Importe')` no los encuentra.
  Con react-hook-form, `input[name="amount"]`; si es controlado a mano (ej. `MarkPaidDialog`),
  `input[placeholder="0,00"]` dentro del diálogo abierto.
- **`getByRole(role, { name })` matchea por substring:** `'Ingreso'` también agarra «Ingresos». Usar
  `exact: true` y escopear a `dialog[open]`.
- **Botones cuyo nombre incluye el importe** («Transferir $ 1.000,00»): usar regex (`/^Transferir\s+\$/`).
- **El FAB «Nuevo movimiento» es sólo mobile y sin texto:** `button[aria-label="Nuevo movimiento"]`
  con un viewport angosto.
- **Para probar un breakpoint no alcanza `isVisible()`** si dos elementos comparten nombre accesible
  (botón del header vs. FAB): Playwright consulta el que está en el árbol de accesibilidad en ese
  ancho. Mirar el DOM con `page.evaluate` (`getBoundingClientRect()` + `getComputedStyle().display`).
- **Contar con SQL o API, no con texto en pantalla:** `Money` parte el importe en varios `<span>` y cada
  ancestro también matchea `getByText('$30.000,00')`. `count() > 0` sí sirve para «¿aparece?».
- **El signo negativo de `splitMoney` es `−` (U+2212)**, no `-`: un regex que sólo acepta `-` falla en silencio.
- **`useCountUp` (saldo hero) puede leerse a mitad de la animación** (en dev con `StrictMode`): para el
  valor exacto, leer la fila del desglose (`SummaryPanel`).

### Diálogos

- **Escopear toda lectura a `dialog[open]`** cuando hay datos parecidos atrás: un `li` del fondo parece
  un bug real. Un `<dialog>` cerrado sigue montado, pero Playwright ya lo excluye de `getByRole`.
- **Confirmación encima de otro diálogo:** usar el nombre completo de la acción («Eliminar
  movimiento»); `/^Eliminar/` puede agarrar el botón de atrás. Con dos botones del mismo texto en un
  diálogo (chip «Guardar» y confirmar «Guardar» en `MarkPaidDialog`), `.first()` es el chip y `.last()`
  el de confirmar.
- **Cerrar con el botón «Cerrar», no con `Escape`:** `Escape` no cerró y el `<dialog open>` siguió
  tapando clicks. Guardar desde «Editar» dentro de `FixedExpenseDetailDialog` cierra el form pero no
  el detalle: cerrarlo aparte.
- **Esperar ~700ms antes de una captura:** `Dialog` entra con `animate-sheet-in`, y los colores llevan
  `transition-colors`.
- **`innerText()` no lee valores de `<input>`:** usar `.inputValue()`.
- **Esperar una señal real, no un timeout fijo**, si el diálogo depende de una query
  (`page.waitForFunction` hasta que «Guardar» deje de estar deshabilitado).

### Reloj

- **`page.clock.install({ time })` antes de navegar** a una pantalla cuyo primer render depende de «hoy».
  Sirve para cualquier bug «a tal hora pasa esto» (medianoche, 21h en Argentina = 0h UTC).
- **Sólo a ±1 día de la fecha real** si la pantalla se compara con una RPC que recibe `p_today`
  (`rpc_projected_balance_range`, `rpc_mark_fixed_expense_paid`, `rpc_add_fixed_expense_saving`
  limitan `p_today` a ±1 día del servidor). Más lejos, cliente y servidor calculan «hoy» distinto y
  aparece una diferencia que no es de la app. Si hay que simular varios días, comparar contra la RPC
  llamada con el mismo `p_today`.

### Red y React Query

- **React Query reintenta 3 veces (~7s) antes de `isError`:** esperar eso antes de mirar la UI.
- **Para forzar `isError`, `route.fulfill({ status: 500 })`** y no `route.abort()`: con `abort` una query
  vía GET quedó reintentando sin fin.
- **El refetch por foco entre dos pestañas no siempre se ve en headless** (`visibilityState` puede
  seguir `'visible'`). `refetchOnWindowFocus` es el default: respaldarlo con lectura de código.
- **Un `page.goto()` a la misma URL puede reusar `history.state`:** pasar por otra pantalla en el medio
  para empezar sin estado.

### Base: leer, escribir y limpiar

- **API directa con la sesión de la cuenta, sin instalar supabase-js:** desde `page.evaluate`, `fetch`
  a `${SUPABASE_URL}/rest/v1/rpc/<nombre>` o `/rest/v1/<tabla>` con `apikey` y
  `Authorization: Bearer <token>`. Respeta RLS, y anda aunque el modo auto bloquee `supabase db query`.
- **`PATCH`/`DELETE` sin filtro da 400** (`UPDATE requires a WHERE clause`): PostgREST exige `?id=eq.<uid>`.
- **Deshacer un pago de fijo con `rpc_unmark_fixed_expense_payment`**, no con un `DELETE` directo: es lo
  que llama la UI.
- **Borrar el padre no borra el movimiento vinculado** (FKs `on delete set null`, como en Fijos o Me
  Deben): el movimiento queda huérfano y sigue restando saldo. Quitar el pago antes, o borrar el
  movimiento después, y confirmar por SQL o API buscando por descripción.
- **Un guardado con movimiento puede no aparecer en una primera lectura** de
  `fixed_expense_savings.transaction_id`: verificar la limpieza con una consulta aparte después de
  borrar (`ilike 'Guardado · <nombre>%'`).
- **Un fijo nuevo puede nacer invisible** si el `due_day` por defecto (10) ya pasó: no aparece este mes
  ni en «Pausados». Pasar `input#dueDay` explícito; si ya quedó uno así, «Mes siguiente» lo muestra.
- **«Pausados» hace dos cosas:** pide los fijos inactivos y despliega el panel (mismo estado `showPaused`).
- **Doble toque:** `locator.dblclick()` alcanza para reproducir un doble envío.

## Formato de un informe (si se vuelve a escribir uno)

- **IDs por área:** `CU-` Cuentas, `FI-` Fijos, `DE-` Mis Deudas, `AH-` Ahorros, `MD-` Me Deben,
  `MO-` Movimientos, `HO-` Hoy, `AN-` Análisis, `AD-` Admin. Un ID no se reusa.
- **Encabezado:** fecha, rama y commit, planes y ciclos probados. Después, resumen y tabla de hallazgos
  (ID, severidad, estado, título).
- **Cada hallazgo:** pasos, esperado, obtenido, evidencia y, si se sabe, por qué pasa (`archivo:línea`).
- **Estados:** Abierto, Resuelto (con cómo se verificó), No reproducido, Verificado seguro (vector
  probado, no explotable), Por lectura de código, o Parcial (qué puntos siguen abiertos y por qué).
- **Columna «Afecta»** (opcional): si el disparador es de esta área pero el daño se ve en otra, el
  hallazgo lleva el ID de esta área y «Afecta» lista dónde se nota. Si pasa entero en otra pantalla y
  sólo se vio de reojo, va a «Pendientes transversales».
- **Lo verificado correcto**, para no repetirlo, y **lo que quedó afuera.**

## Reglas: el repo es público

- **Nada que identifique una cuenta:** ni emails, ni `uuid`, ni códigos de invitación, ni contraseñas.
  Decir «la cuenta de QA» o «la cuenta de prueba».
- **Antes de cerrar un informe, `sh scripts/check-leaks.sh`** (Git Bash, desde el repo) tiene que salir
  vacío. Revisa el repo entero, no sólo `docs/qa`: un script o un comentario también pueden filtrar un
  dato. Motivo: un email real se coló en un informe aunque la regla ya existía.
- **Un hallazgo de seguridad explotable** contra otras cuentas va a un informe privado, nunca al repo;
  acá, como mucho, una línea genérica hasta que se arregle.
- Montos y nombres de prueba («Expensas», $180.000) sí van: son inventados. Las capturas no se suben.

## Sin probar todavía

Huecos de cobertura que quedaron al cerrar las pasadas por área — no son hallazgos, son cosas que
nadie verificó en vivo

- **Movimientos:** tope de 1.000 filas del período y CSV en vivo (separador, columnas, nombre);
  categorías archivadas o eliminadas y su efecto en filtros y filas viejas; doble click o dos pestañas
  sobre Guardar y Eliminar; `is_adjustment`/`is_credit_card_payment` seteados a mano por API.
  `rpc_admin_delete_user` en cascada nunca se ejecuta en una pasada, por decisión.
- **Fijos:** navegador en otro huso (ej. UTC+9); el borde real de una bolsa quincenal/semanal (domingo,
  o día 15, después de las 21h); cambiar la categoría de un fijo con pagos, y pasar de bolsa a «una
  vez al mes» con cargas del mes (queda «pagado» con cualquier carga y las filas viejas no frenan un
  segundo pago).
- **Análisis:** el efecto numérico de un error de red en cuotas comprometidas (hace falta tarjeta +
  compra en cuotas + pago); una quincena de 16 días real viendo el sufijo «por día»; una semana que
  cruza el límite de año.
- **Ciclos quincenal y semanal** en vivo en Movimientos, con otro inicio de semana.
- **Quitar un pago anterior a las cuentas:** el diálogo de aviso necesita un pago hecho antes de crear
  cuentas; probarlo en la cuenta de prueba desharía uno real.

## Pendientes transversales

Cosas vistas de reojo desde otra área, sin probar a fondo. Se mueven a una pasada de su área cuando
se haga.

- **Mis Deudas:** el desglose de fijos no descuenta los guardados con movimiento; puede no cerrar con
  un número grande (`MisDeudas.tsx:258`). No visto porque la cuenta de QA no tiene deudas.
- **Base:** las RPC de pago aceptan fecha futura (la UI la bloquea con `max`).
- **Base:** las RPC que crean movimientos sin fecha explícita (`rpc_add_fixed_expense_saving`,
  `rpc_mark_credit_card_paid` y varias más) usan `current_date` (UTC) en vez de la fecha local — sólo
  se nota pasadas las 21h de Argentina. Visto por lectura de código en el QA de Movimientos.
