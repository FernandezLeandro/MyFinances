# QA de Hoy

- **Fecha:** 2026-09-23 (1.ª pasada), 2026-09-24 (2.ª), 2026-09-24→25 (3.ª), hora Argentina.
- **Planes:** Premium, Básico, Test.
- **Ciclos:** mensual; semanal (semana actual sin cruzar mes, y semana 28/9–4/10 vista con
  `?ciclo=`, ver HO-05).
- **Pasada:** 3.ª, cierre. 14 hallazgos originales resueltos y verificados, más lo que quedaba
  «afuera» (HO-15 a HO-19). Excepto Me Deben/gastos compartidos (se rediseñan).
- **HO-15, resuelto 2026-09-25** (4.ª pasada, sólo este hallazgo): ver bloque abajo.

## Estado del arreglo (2026-09-24 → 2026-09-25)

14 hallazgos atacados en plan de 6 bloques sobre rama `fix-issues`
(`C:\Users\leanf\.claude\plans\ahi-cambie-a-modo-zany-pnueli.md`). D1 y D2 decididos por Lean.
**Estado: 14/14 resueltos, verificados en vivo con cuenta QA.** Migración aplicada a
producción. `lint`/`test` (634)/`build` verdes. Sin commitear.

**Antes de planear, cada hallazgo re-chequeado contra `fix-issues`** (arreglos de Fijos y
Movimientos ya tocaron código que usa Hoy): HO-04 parecía resuelto por FI-06 (no del todo, ver
abajo); etiqueta de HO-09 ya arreglada por FI-20; confirmación de HO-11 ya venía con MO-01. Los tres
re-verificados igual, no dados por hechos.

### HO-04 cerrado — el gap de $3.000 era de la verificación, no de la app

2.ª pasada (2026-09-24) dejó gap de $3.000 entre título "Proyectado" y desglose, con semana
28/9–4/10 vista vía `page.clock` fijado en 30/9 — 6 días después del día real (24/9). 3.ª pasada
reprodujo número exacto con datos reales de cuenta QA (bolsa semanal "Súper", $80.000, pago de
$3.000 el 22/9) y encontró causa: **no es bug de `summarizeFixedExpenses` ni de la RPC — `page.clock`
corrió "hoy" más allá del margen que la base tolera.**

`rpc_projected_balance_range` acota el "hoy" recibido a **±1 día de `current_date`**
(`hoy_del_cliente.sql`, para que reloj de dispositivo mal configurado no mueva el proyectado más de
un día). Con "hoy" = 30/9 en cliente y ≈ 24/9 real en servidor, ambos lados calcularon semana vigente
de la bolsa **distinto**: cliente escopeó pagos de semana 28/9–4/10 (la mirada), servidor los de
21–27/9 (la que contiene su "hoy" clampeado). Pago del 22/9 cayó del lado servidor, no cliente.
Recalculando fijo por fijo:

| | Cliente (hoy=30/9, `summarizeFixedExpenses`) | Servidor (hoy real, RPC) |
|---|---|---|
| Súper (bolsa semanal) | $160.000 | $157.000 |
| QA BolsaMes (bolsa mensual) | $28.000 | $28.000 |
| QA Dia2 (una vez, due 2 — ambos meses) | $10.000 | $10.000 |
| **Total Fijos** | **$198.000** | **$195.000** |

$198.000 − $195.000 = **$3.000**, exacto. RPC llamada directo (`p_today=2026-09-30` y `p_today` nulo
dan MISMO resultado, $1.231.889 — confirma clamp) con `rpc_current_balance() =
$1.426.889`: servidor descuenta $195.000 en Fijos, ninguna Deuda. Cierra perfecto.

**Por qué usuario real no lo reproduce:** `today` que escopea semana de bolsa en `statusFor`
(`aggregate.ts`) es SIEMPRE "hoy" real del dispositivo (`useToday()`/`new Date()`), nunca ventana
mirada — navegar Fijos a semana futura no lo cambia. Sólo diverge del servidor si reloj del
dispositivo corrido >1 día, justo el caso que el clamp acota. **No se toca código de producción.**

Test de regresión en `aggregate.test.ts` ("HO-04: la semana que escopea una bolsa semanal
es la de 'hoy', no la del ciclo mirado") fija comportamiento con mismos números.

**Lección para próxima verificación en vivo:** `page.clock` sólo dentro de ±1 día de fecha real
cuando pantalla compara contra RPC que recibe `p_today` — más allá, cliente y servidor miran
ventanas distintas y cualquier gap es de la prueba, no de la app (sumado a `docs/qa/README.md`).

## Resumen

Hoy casi no carga datos propios: junta números de Fijos, Cuentas, Mis Deudas y Movimientos. Mayoría
cierra bien — desglose del proyectado sumó exacto contra `rpc_current_balance` y
`rpc_projected_balance_range` en ciclo mensual normal — pero hubo casos concretos que no cierran o se
ven mal:

- **Semana que cruza dos meses: desglose del proyectado no suma el total de arriba** (diferencia de
  $332.345,67 en caso probado): servidor resta algo de más que desglose no informa (HO-04, cerrado —
  gap final era de la verificación, no de la app, ver arriba).
- **Categoría con gastos cargados podía pasarse a "ingreso" y los hacía desaparecer del desglose por
  categoría**, aunque siguieran sumando en "Gastos" (HO-15, afectaba también Análisis; cerrado — tipo
  de categoría ahora inmutable, ver abajo).

## Hallazgos

| ID | Sev. | Estado | Título | Afecta |
|---|---|---|---|---|
| HO-01 | Alto | Resuelto | Saldo negativo no cambia de color en hero | — |
| HO-02 | Alto | Resuelto | Ojo no oculta lista de movimientos del mes | Movimientos |
| HO-03 | Alto | Resuelto | Tarjeta sin compras cuenta como deuda impaga de $0 | Mis Deudas |
| HO-04 | Alto | Resuelto | Semana entre dos meses: desglose del proyectado no suma total | Fijos |
| HO-05 | Alto | Resuelto | `?ciclo=` en URL hace que Hoy muestre otro período | — |
| HO-06 | Alto | Resuelto | Sin aviso de error: saldo cortado deja tres cifras que no cierran | — |
| HO-07 | Medio | Resuelto | "Guardado" de fijo da número distinto en escritorio y mobile | — |
| HO-08 | Medio | Resuelto | Movimiento con fecha futura encabeza lista sin marca | Cuentas |
| HO-09 | Bajo | Resuelto | Copy fijo en "mes" con otros ciclos; semana entre meses dice "28–4 sep" | Fijos |
| HO-10 | Alto | Resuelto | "Sueldo asignado" y diálogo de Sueldo muestran cifras distintas | Movimientos |
| HO-11 | Alto | Resuelto | Diálogo de Sueldo mezcla cualquier ingreso y su X borra sin confirmar | Cuentas |
| HO-12 | Alto | Resuelto | Test resta deuda que el plan no puede ver ni pagar | — |
| HO-13 | Medio | Resuelto | Doble click en "Agregar" del diálogo de Sueldo duplica asignación | Movimientos |
| HO-14 | Bajo | Resuelto | Tarjeta de fijos de Básico sin ojo para ocultar saldo | — |
| HO-15 | Medio | Resuelto | Categoría pasada a "ingreso" hacía desaparecer sus gastos cargados del desglose | Análisis |

Sev. = severidad (Crítico / Alto / Medio / Bajo).

---


### HO-15 · Una categoría pasada a "ingreso" hacía desaparecer del desglose los gastos ya cargados — Medio, Resuelto

- **Pasos:** crear categoría de gasto, cargar movimiento de gasto en ella, editar categoría y
  cambiarla a "Ingreso" (`CategoryRowEditor`, sin freno) — mirar desglose por categoría de
  Hoy/Análisis y "Gastos" del período.
- **Esperado:** movimiento sigue siendo gasto real (`transactions.type = 'expense'`) — debe seguir
  sumando en algún lado del desglose por categoría, aunque sea "Sin categoría".
- **Obtenido:** movimiento desaparece del desglose por completo (ni categoría vieja, ni "Sin
  categoría"), mientras "Gastos" no se mueve — cifras dejan de cerrar. Reproducido con transacción de
  $10.000: antes del cambio, `v_range_summary().total_expense` y suma de `v_spend_by_category()`
  daban ambos $579.501,10 (exacto); tras pasar categoría a `income`, `total_expense` seguía
  $579.501,10 pero suma de `v_spend_by_category()` bajó a $569.501,10 — diferencia de $10.000 exacta.
- **Por qué:** `v_spend_by_category` (`20260912020001_spend_by_category_uncategorized.sql`) arma lista
  con `left join transactions ... where c.kind = 'expense'` — categoría ya cambiada a `income` queda
  fuera del `left join`, así que gasto viejo que apunta a ella no aparece en ninguna fila (ni propia
  categoría, que no calza filtro; ni "Sin categoría", porque `category_id` no es `null`).
  `v_range_summary` (Gastos, Ingresos) no mira `kind` — sólo `transactions.type` — no nota el cambio.
  Ningún freno en cliente ni base impide cambiar `kind` con movimientos cargados (`useUpdateCategory`
  hace `update` directo, sin RPC).
- **Afecta:** Hoy y Análisis igual (mismo RPC). No encontrado en QA de Análisis anterior
  (`docs/qa/analisis.md`) — sumado acá porque apareció en esta pasada.
- **Decisión pendiente de Lean** (no se arregla solo — elegir entre estas, probablemente con
  migración):
  1. bloquear cambio de `kind` en `rpc_update_category` (o policy) si la categoría ya tiene
     transacciones del tipo contrario;
  2. en `v_spend_by_category`, sumar esos gastos "huérfanos" a fila "Sin categoría" en vez de
     perderlos;
  3. dejarlo así y avisar en editor de categorías ("cambiar el tipo puede esconder gastos
     ya cargados").
- **No verificado con categoría de INGRESO pasada a gasto** (espejo) — por lectura de misma función,
  `v_spend_by_category` sólo mira categorías `kind = 'expense'`, así que ese caso no aplica igual
  (categoría de ingreso nunca aparecía ahí antes tampoco).

**Arreglo (2026-09-25):** decisión de Lean — Gasto e Ingreso son mundos independientes; tipo de
categoría se elige al crearla y no cambia más (ni desde `/categorias` ni desde catálogo admin
`/admin/categorias`, que es sólo plantilla que siembra cada cuenta nueva). Migración
`20260925010001_categorias_tipo_fijo.sql`:

- `kind` inmutable en `categories` y `default_categories` (`trg_category_kind_locked`, `before update
  of kind`, compara valores — `update` que reenvía mismo `kind` no falla).
- `trg_transactions_owned_refs` (`20260924020001_movimientos_referencias_propias.sql`) suma chequeo:
  si movimiento tiene `category_id`, su `kind` debe igualar `transactions.type`, si no
  `category_kind_mismatch` (distinto de `category_not_found`, que sigue siendo "ajena o borrada").
- `trg_expense_category_kind` en `fixed_expenses` y `credit_purchases`: sólo aceptan categoría
  `kind = 'expense'` — sin esto, fijo o compra con categoría de ingreso (sólo posible por API
  directa) quedaría impagable con error opaco al generar su movimiento.

Diagnóstico previo (sólo lectura, `db query --linked`, 2026-09-24): **0** movimientos, fijos o compras
en producción con categoría de tipo contrario — no hizo falta arreglar datos.

Front: `CategoryRowEditor` (`src/features/categories/`) perdió chips Gasto/Ingreso — tipo lo decide
panel donde se aprieta "+ Nueva" en `/categorias`; `useUpdateCategory` y `useUpdateDefaultCategory` ya
no aceptan `kind` en input. En `/admin/categorias` chips quedan sólo en alta (`AddCategoryForm`); al
editar se ve etiqueta fija, igual que fila normal. Mensajes nuevos en `src/lib/errors.ts` para
`category_kind_locked` y `category_kind_mismatch`, con test de regresión en `errors.test.ts`.

**Verificado en vivo (2026-09-25):**

- Migración aplicada a producción (`db push --linked`); `migration list --linked` confirmó local=remote
  en todas.
- SQL directo con cuenta QA (bloque transaccional, con cleanup): `update categories set
  kind` → `category_kind_locked`; mismo `update` reenviando `kind` actual no falla; insertar gasto con
  categoría de ingreso → `category_kind_mismatch`; mismo gasto con categoría correcta → éxito; fijo con
  categoría de ingreso → `category_kind_mismatch`; `update
  default_categories set kind` → `category_kind_locked`. Siete casos dieron resultado esperado.
- Playwright contra cuenta QA (dev server propio en 5173, cerrado al terminar): en `/categorias`
  editor no muestra chips ni al crear ni al editar; "+ Nueva" en "De gasto" creó categoría de gasto;
  editar nombre (sin tocar tipo) funcionó. Sin click-through en `/admin/categorias` (cuenta QA sin rol
  admin) — cubierto por chequeo SQL de `default_categories` arriba.
- `lint`/`test` (635, +1 por caso nuevo de `errors.test.ts`)/`build` verdes. Chequeo de secretos de
  `CLAUDE.md` vacío.
- Foto por API antes y después: sin resto de `QA-HO15*` en `categories`, `transactions`,
  `fixed_expenses` ni `default_categories` — todo lo cargado se borró (por API en bloque SQL, por UI la
  categoría creada con Playwright).
- **Sin commitear**, en `fix-issues` (igual que resto de Hoy).

## Verificado en esta pasada, sin hallazgos

- **HO-16 · Medianoche con la app abierta:** `page.clock` a 23:58 del día real, avanzando 5 min sin
  navegar: RPC `rpc_projected_balance_range` se re-pidió SOLA con `p_today` actualizado
  (`2026-09-24` → `2026-09-25`) al cruzar medianoche — cadena `useToday()` → `useCycle().current`
  (nueva referencia) → `useMemo` de `summarizeFixedExpenses` en Hoy.tsx (depende de `cycle`) se
  dispara sola. No hace falta `today` (variable local de Hoy.tsx) en deps del `useMemo`: en práctica
  siempre se recalcula en mismo render que cambia `cycle`. No probado cruce de SEMANA (domingo→lunes)
  porque fecha real no cayó en ese borde — misma cadena, se infiere igual de sólida, pero queda para
  pasada que sí caiga en ese borde.
- **HO-17 · Dos pestañas:** pagar fijo o cargar movimiento en pestaña B actualiza sola pestaña A al
  re-enfocarla (React Query, `refetchOnWindowFocus`, default de la app) — probado con QA Dia2
  (marcar/desmarcar pagado) y movimiento nuevo. **Tema** (`theme:dark`, localStorage) NO se sincroniza
  entre pestañas — esperado: `createPersistedFlag` usa pub-sub en memoria del módulo, sin
  `window.addEventListener('storage', …)`, así que cada pestaña sólo ve cambio propio. Cada viewer
  conserva su tema, no es bug.
  - **Nota de método:** refetch-por-foco no confirmable con Playwright headless
    (`document.visibilityState` de la pestaña de atrás quedó en `'visible'` incluso con la otra al
    frente — Chromium headless con dos `Page`s del mismo contexto no siempre reproduce la
    oclusión real de pestañas), así que este punto se apoya en la lectura de código
    (`refetchOnWindowFocus` es el default de `QueryClient`, sin override en `main.tsx`) más que en
    la corrida en vivo.
- **HO-18 · Seguridad por API:** sin sesión (sólo `anon key`), `rpc_current_balance`,
  `rpc_projected_balance_range`, `v_range_summary`, `v_spend_by_category`, `transactions` y
  `fixed_expense_payments` devuelven `0`/vacío — nunca error con datos, nunca datos de otra cuenta
  (todo depende de `auth.uid()`, `null` sin sesión). Con sesión QA, cada fila es de su propio
  `user_id`. Mismo patrón ya confirmado en QA de Movimientos.
- **HO-19 · Layout 768–1023px:** 768, 820, 900 y 1023px, claro y oscuro, montos de 8 cifras
  (interceptando respuesta de `rpc_current_balance`/`rpc_projected_balance_range`/
  `v_range_summary` con `page.route`, sin escribir en cuenta) — sin scroll horizontal en ningún ancho;
  borde izquierdo y ancho de contenido siguen al shell en ambos temas.
- **Categoría archivada en el desglose:** por lectura de código, `v_spend_by_category` no filtra
  `is_archived` — categoría archivada con gasto histórico lo sigue mostrando como activa. No es bug
  (archivada no deja de haber existido). Sin caso en vivo: resultado se desprende de la SQL sin
  ambigüedad.
- **Coherencia con Hoy abierto (HO-G) y donut lado a lado con Análisis:** fuera de esta pasada — Me
  Deben y gastos compartidos se eliminan o rediseñan (decisión de Lean); donut comparte mismo RPC
  (`v_spend_by_category`) que Hoy con mismo `from`/`to`, así que por construcción da mismo total en
  ambas pantallas para mismo período; sin comparación visual lado a lado aparte.

## Estado de la cuenta de QA al cerrar

**1.ª pasada (informe, 2026-09-23):**

- **Perfil:** Premium, ciclo mensual, semana desde lunes — igual que al empezar (Básico y Test
  probados por SQL directo en medio, vuelta a Premium al terminar cada bloque).
- **Datos:** foto final por SQL coincide exacta con inicial — 22 movimientos, mismos totales de
  ingresos y gastos, 2 ajustes, `rpc_current_balance() = $1.426.889,00`, 2 cuentas sin archivar con
  misma apertura, 9 fijos, 0 tarjetas, 0 compras sueltas, 1 deuda (preexistente). Todo lo cargado
  (marcado `QA-HO`: 9 fijos, 3 tarjetas, 3 compras, 5 movimientos propios, 1 cuenta) borrado y
  verificado por SQL sin restos — incluidas 4 asignaciones de sueldo de prueba sin marca `QA-HO`
  (descripción "Sueldo", cargadas para HO-13), identificadas por importe y fecha antes de borrar.

**2.ª pasada (verificación de los arreglos, 2026-09-24):**

- **Perfil:** Premium, ciclo mensual, semana desde lunes — igual que al empezar. Probados Básico
  (HO-10, HO-11, HO-13, HO-14) y Test (HO-12) cambiando `plan` por SQL directo (OK de Lean para toda
  la pasada), vuelta a Premium al terminar cada bloque; `cycle_kind` pasó por `weekly` (HO-04/HO-09,
  con `page.clock` fijando "hoy" en semana 28/9–4/10) y volvió a `monthly` por REST directo (ambas
  columnas están en grant de `authenticated`).
- **Datos:** foto por API antes y después, exacta — 22 movimientos, `rpc_current_balance() =
  $1.426.889,00`, 2 cuentas, 9 fijos (8 activos), 0 tarjetas, 0 compras sueltas. Todo lo cargado
  (marcado `QA-HO2`: 1 ajuste temporal, 1 movimiento futuro, 1 tarjeta vacía, 1 fijo con dos guardados
  y su movimiento vinculado, 1 ingreso con categoría, 1 fila de sueldo del doble click, 1
  tarjeta+compra para Test) borrado. Único resto difícil: movimiento "Guardado · QA-HO2 Fijo"
  ($30.000) generado por guardado-con-movimiento de HO-07 — `transaction_id` leído de
  `fixed_expense_savings` ANTES de borrar el fijo no alcanzó (ver lección nueva en «Estado del
  arreglo»); encontrado y borrado con consulta aparte por descripción tras borrar el fijo, confirmado
  con foto final limpia.
- **Migración aplicada a producción:** `20260924060001_proyectado_deudas_por_plan.sql` (HO-12/D2).
  Resto de arreglos sólo cliente, sin migración.

**3.ª pasada (cierre de HO-04 + lo que quedaba afuera, 2026-09-24→25):**

- **Perfil:** Premium, ciclo mensual, semana desde lunes — sin cambios de plan ni ciclo (HO-04
  cerrado con lecturas por API sobre datos cargados, sin navegar a otro ciclo).
- **Datos:** foto por API antes y después, exacta — 22 movimientos, `rpc_current_balance() =
  $1.426.889,00`. Lo cargado se probó y deshizo en el momento, sin marca `QA-HO3` en cuenta: pago de
  "QA Dia2" (marcado/desmarcado dos veces, bloque «dos pestañas»), categoría temporal "QA-HO3 Temp"
  con transacción de $10.000 (HO-15, creada y borrada por API), movimiento "QA-HO3 dos pestañas"
  ($1.234, creado y borrado por UI). Único resto difícil: pago de QA Dia2 que quedó pagado tras timing
  de Playwright con `bringToFront()` entre pestañas — encontrado por API (`fixed_expense_payments`
  filtrado por ese fijo) y deshecho con RPC oficial `rpc_unmark_fixed_expense_payment`, no con
  `DELETE` directo a tabla.
- **Sin migración.** Playwright instalado y usado sólo en scratchpad de sesión (nunca en repo); dev
  server propio (puerto 5174, siguiente libre al 5173) cerrado al terminar.