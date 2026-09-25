# QA de Análisis

- **Fecha:** 2026-09-23, hora Argentina (1.ª y 2.ª pasada mismo día); 2026-09-25 (3.ª, arreglos).
- **Código:** rama `accounts`, commit `eeeab9b` (1.ª) y `790b7a5` (2.ª); rama `fix-issues` (3.ª). Sin migraciones pendientes de antes (`supabase migration list --linked`, 88/88 aplicadas) — la 3.ª pasada agrega una nueva, ver abajo.
- **Planes:** Premium, Básico, Test.
- **Ciclos:** mensual, quincenal (16–30 sep; 1–15/16–31 oct en 2.ª; rango personalizado 20 sep–5 oct y quincena en curso en 3.ª) y semanal (21–27 sep; 28 sep–4 oct en 2.ª).
- **Pasada:** 3.ª, cierre de arreglos. Los 17 hallazgos abiertos resueltos: 16 con código y
  **verificados en vivo** con cuenta QA y dev server contra producción, más AN-15 cerrado sin código
  (decisión de Lean). AN-01 necesitaba además la migración `20260925020001_analisis_ajustes_afuera.sql`
  en producción (no hay staging) — Lean la aplicó (`db push --linked`) el mismo día; re-verificado en
  vivo después de aplicada. `lint`/`test` (642, siete nuevos)/`build` verdes. Sin commitear.
- 1.ª pasada en dos bloques mismo día; 2.ª agrega tercer bloque con ocho pendientes (tope 1000 filas, marcador Top, mapeo preset drill-down, ojo "ocultar saldo", errores de red de fuentes secundarias, seguridad por API, flechas "Mes" sin tope y reset de período, dos variantes de ciclo corto).

## Resumen

Análisis no escribe datos: arma seis bloques (hero, Ingresos/Neto/Por día, donut, promedio mensual, Fijo vs. variable, Top categorías) desde `v_spend_by_category`, `rpc_monthly_series` y `transactions`. Foco: qué entra/queda afuera de esos bloques y si todos hablan del mismo período. Juego de datos marcado `QA-AN` (ajustes, categoría archivada/convertida/borrada, tarjeta y compra suelta en cuotas, gasto compartido con Descontado y Me devolvió, transferencia, fecha futura, monto 7+ cifras); cada caso verificado contra `v_spend_by_category` por SQL y contra pantalla.

Confirmado en vivo en 1.ª/2.ª pasada, con importes exactos: **mismo período cuenta distinto según panel de misma pantalla**, **error de red visto como plata real** (Ingresos $0 y Neto negativo falso, sin aviso), **crash con pantalla en blanco**, y **layout a 320px** que deja tabla ilegible:

- **Ajuste de saldo con categoría entra a hero, donut y Top, no a "Fijo vs. variable"** — y fila de Movimientos que lo generó sigue diciendo "afuera de Análisis", pero sí cuenta (AN-01, resuelto).
- **Pasar categoría de Gasto a Ingreso hacía desaparecer sus gastos viejos de hero, donut, Top y promedio — pero seguían en "Fijo vs. variable"** (AN-02, resuelto: tipo de categoría ya no se puede cambiar, ver abajo).
- **Borrar una de las dos fechas de "Personalizado" rompe pantalla entera**: queda en blanco (0 caracteres), sin mensaje, por excepción no capturada (AN-03, resuelto).
- **A 320px, tabla "Promedio mensual por categoría" ilegible**: "Categoría" se superpone con "Promedio", nombres cortados a un símbolo o dos (AN-04, resuelto).
- **Con ciclo quincenal o semanal, "Ingresos" y "Neto" muestran mes calendario completo**, no período elegido — exacto: quincena 16–30 sep, "Ingresos" $2.079.000,50, igual centavo a centavo que mes entero (AN-05, resuelto).
- **Tabla "Promedio mensual por categoría" también ignora período**: misma quincena 16–30, columna "SEPTIEMBRE" de Supermercado $252.390,10 (mes completo), donut misma pantalla Supermercado $6.500,00 (AN-06, resuelto: se queda mensual a propósito, pero ahora lo aclara).
- **Con Análisis abierto, movimiento nuevo actualiza donut, hero y "Fijo vs. variable" al instante, pero "Top categorías" y "Promedio mensual" quedan viejos** — gasto $5.000 en Supermercado: donut a $257.390,10, Top y promedio en $252.390,10 (AN-07, resuelto).
- **Drill-down a "Sin categoría" no cierra con total de Análisis**: trae ingresos sin categoría y ajustes, que Análisis excluye (AN-08, resuelto).
- **Error de red en fuente de Ingresos se ve como plata real, sin aviso**: consulta cortada → "Ingresos" $0,00, "Neto" **−$569.501,10**, como pérdida real — nada avisa, a diferencia de gasto total, que sí muestra "No se pudo cargar" si su fuente falla (AN-09, resuelto).

**Todos los hallazgos de 1.ª/2.ª pasada están resueltos y verificados en vivo (3.ª pasada,
2026-09-25)**, incluido AN-01 tras aplicarse su migración a producción; AN-15 se cerró sin código
(decisión de Lean). Detalle de cada arreglo en su hallazgo.

**Verificado sin problemas:** donut de Análisis y de Hoy dan mismas categorías y porcentajes en mismo período; categoría archivada aparece igual que activa (sin distinguirse); sin scroll horizontal a 320px; en Básico `/analisis` redirige a Hoy y no aparece en nav; en Test se ve completo, en escritorio (nav) y drawer mobile ("Secciones" sólo con "Análisis"); drill-down a categoría real (no "Sin categoría") filtra bien en Movimientos; modo oscuro consistente, sin problemas de contraste/color; error de fuente principal (`v_spend_by_category`) sí muestra "No se pudo cargar" con reintentar — tarda unos segundos por reintentos automáticos, no es bug.

## Hallazgos

| ID | Sev. | Estado | Título | Afecta |
|---|---|---|---|---|
| AN-01 | Alto | Resuelto | Ajuste con categoría cuenta en Análisis pero su fila dice "afuera de Análisis" | Movimientos, Hoy |
| AN-02 | Alto | Resuelto | Categoría pasada a Ingreso: hero, donut, Top y promedio dejan de sumar gastos viejos, "Fijo vs. variable" sigue contándolos | Ajustes |
| AN-03 | Alto | Resuelto | "Personalizado" con fecha borrada deja pantalla en blanco, sin aviso | — |
| AN-05 | Alto | Resuelto | Ciclo quincenal/semanal: "Ingresos" y "Neto" muestran mes calendario completo, no período elegido | — |
| AN-09 | Alto | Resuelto | Error de red en Ingresos se ve como $0 real y deja "Neto" negativo falso, sin aviso | — |
| AN-10 | Alto | Resuelto | Tope de 1000 filas de `useTransactions` hace que "Fijo vs. variable" cuente menos que hero, sin aviso | — |
| AN-12 | Alto | Resuelto | Error de red en total del período anterior se ve como "$0,00 en agosto" real, sin aviso | — |
| AN-16 | Alto | Resuelto | Semana que cruza dos meses agrava AN-05/AN-06: "Ingresos"/"Neto" suman DOS meses calendario completos | — |
| AN-06 | Medio | Resuelto | "Promedio mensual por categoría" ignora período elegido: en quincena/semana no cierra con donut | — |
| AN-07 | Medio | Resuelto | Con Análisis abierto, movimiento nuevo actualiza donut pero deja "Top categorías" y "Promedio mensual" viejos | — |
| AN-08 | Medio | Resuelto | Drill-down a "Sin categoría" trae ingresos y ajustes que Análisis excluye | Movimientos |
| AN-04 | Medio | Resuelto | A 320px, tabla de promedio mensual ilegible (encabezados superpuestos, nombres cortados) | — |
| AN-13 | Medio | Resuelto | Error de red en ids de cuotas comprometidas no avisa en "Fijo vs. variable" — puede reclasificar plata en silencio | — |
| AN-14 | Medio | Resuelto | Período elegido se resetea al volver del drill-down o recargar, sin aviso | Movimientos |
| AN-17 | Medio | Resuelto | Badge de % (promedio diario) y texto de comparación (total crudo) parecen contradecirse con períodos de distinta cantidad de días | — |
| AN-11 | Bajo | Resuelto | Marcador de período anterior en Top invisible cuando anterior es el máximo (recorte por `overflow-hidden`) | — |
| AN-15 | Bajo | Resuelto | Flechas de "Mes" navegan sin tope a ciclos futuros vacíos | — |

Sev. = severidad (Crítico / Alto / Medio / Bajo). AN-10 a AN-17 de 2.ª pasada (2026-09-23); todos los
arreglos de 3.ª pasada (2026-09-25). AN-15 cerrado sin código (decisión de Lean); resto verificado en
vivo, incluida la migración de AN-01, aplicada a producción por Lean el mismo día.

---

### AN-01 · Un ajuste con categoría cuenta en Análisis pero su fila sigue diciendo "afuera de Análisis" — Alto, Resuelto

**Afecta:** Movimientos, Hoy (etiqueta de fila se arma en ambas).

- **Pasos:** sesión QA, crear ajuste de saldo con categoría (PATCH directo a `transactions`, mismo efecto que editar ajuste desde Cuentas — ver MO-08 en `movimientos.md`) → abrir Análisis mismo período.
- **Esperado:** ajuste no entra a ningún total de Análisis — regla explícita del código ("los ajustes NO cambian a propósito", comentario de `20260806230001_balance_adjustments.sql`) — y fila "Ajuste de saldo · afuera de Análisis" debería ser cierta.
- **Obtenido:** ajuste $88.888,00 con categoría "Servicios". Antes, "Gastaste en septiembre" $10.699.538,10 (Fijo $90.611,00 + Variable $10.608.927,10, cerraban). Después, hero **$10.788.426,10** — exactos $88.888,00 más —; "Servicios" en donut, Top y promedio mensual subió igual. "Fijo vs. variable" **no se movió** ($90.611,00 + $10.608.927,10): hero y panel difieren en $88.888,00, importe del ajuste. Fila sigue en Movimientos y Hoy como "Ajuste de saldo · afuera de Análisis", ya falso.
- **Por qué:** rama "categorizada" de `v_spend_by_category` (`20260912020001_spend_by_category_
  uncategorized.sql:20-29`) suma cualquier gasto de la categoría sin filtrar `is_adjustment` — sólo rama "Sin categoría" (líneas 33-39) filtra. `summarizeFijoVsVariable` sí excluye `is_adjustment` en cliente → paneles en desacuerdo.
- **Nota:** efecto nuevo de MO-08 (ajustes editables sin aviso, `movimientos.md`): cualquiera convierte sin querer ajuste en gasto categorizado asignando categoría en diálogo de edición — sin tocar base.
- **Arreglo (2026-09-25):** migración `20260925020001_analisis_ajustes_afuera.sql` suma
  `and not t.is_adjustment` al `left join` de la rama categorizada de `v_spend_by_category` (mismo
  criterio que ya tenía la rama "Sin categoría" y `v_range_summary`) — con eso, hero, donut, Top y
  promedio dejan de sumar el ajuste, igual que "Fijo vs. variable", y la etiqueta "afuera de Análisis"
  vuelve a ser cierta. Aplicada a producción por Lean (`db push --linked`) el mismo día.
- **Verificado en vivo, dos veces:** antes de aplicar la migración, un ajuste de prueba de categoría
  ($88.888,00) SÍ se sumaba al total de la categoría vía REST (`v_spend_by_category`) — reproducía el
  bug tal cual. Después de aplicada, mismo ajuste de prueba, mismo total antes y después
  ($252.390,10 en los dos casos) — el ajuste queda afuera.

### AN-02 · Categoría pasada a Ingreso: el hero, el donut, el Top y el promedio dejan de sumar sus gastos viejos, pero "Fijo vs. variable" sigue contándolos — Alto, Resuelto

**Afecta:** Ajustes (acción disparadora es "Categorías", no Análisis).

- **Pasos:** crear categoría Gasto, cargar gasto $12.345,67 mes actual → en Ajustes, cambiar a Ingreso → volver a Análisis mismo período.
- **Esperado:** cambio de tipo = decisión de clasificación futura; mínimo, todos los paneles deberían coincidir sobre gasto viejo (contarlo o no).
- **Obtenido:** hero bajó de $10.788.426,10 a **$10.776.080,43** — exactos $12.345,67 —, categoría desapareció de donut y Top. "Fijo vs. variable" **no se movió**: "Decidiste vos" en $10.608.927,10. Suma "Fijo + variable" ($10.699.538,10) y hero ($10.776.080,43) no coinciden por dos motivos a la vez (este + AN-01).
- **Por qué:** rama categorizada de `v_spend_by_category` exige `c.kind = 'expense'` (`spend_by_category_uncategorized.sql:28`); al pasar a `income` deja de matchear — ni cae en "Sin categoría", que exige `category_id is null`. Movimiento sigue `type = 'expense'`, así que `useTransactions` (filtra sólo `type`, no `kind` actual) y `summarizeFijoVsVariable` lo siguen contando.
- **Nota:** gasto tampoco se ve en Movimientos con su categoría — selector de Movimientos sólo lista Gasto, filtro no la encuentra.
- **Arreglo (2026-09-25, mismo trabajo que HO-15 en `docs/qa/hoy.md`):** disparador era poder cambiar `kind` de categoría con movimientos — decisión de Lean: tipo se elige al crear y no cambia. Migración `20260925010001_categorias_tipo_fijo.sql` bloquea `update` de `kind` en base (`trg_category_kind_locked`) y front (`CategoryRowEditor`) quitó chips Gasto/Ingreso del editor — escenario ya no reproducible. Verificado en vivo con cuenta QA (SQL directo: `update categories set kind` → `category_kind_locked`); detalle en `docs/qa/hoy.md` (HO-15).

### AN-03 · "Personalizado" con una fecha borrada deja la pantalla en blanco, sin aviso — Alto, Resuelto

- **Pasos:** Análisis, preset "Personalizado" → borrar primer campo de fecha (vacío, sin otra fecha).
- **Esperado:** nada pasa hasta fecha válida, o estado "elegí un rango" — no pantalla rota.
- **Obtenido:** pantalla completa en blanco al instante (`<body>` con 0 caracteres), sin mensaje. Consola: error no capturado `Invalid time value`. **Recargar la recupera** (Análisis no persiste período en URL, vuelve a ciclo actual) — nada drástico, pero en el momento no hay forma de saberlo.
- **Por qué:** `comparisonRange` (`period.ts:108-113`) llama `format()` sobre fecha inválida dentro de `useMemo` que corre cada render con `period.from === ''`; sin `try/catch` ni error boundary (ninguno en `src`), React descarta árbol entero.
- **Arreglo (2026-09-25):** `PeriodSelector.tsx` ignora un `onChange` con valor vacío (no propaga la
  fecha borrada a `period`) y suma `max`/`min` nativos entre los dos campos. Defensa aparte en la
  capa pura: `previousRange`/`comparisonRange` (`period.ts`) devuelven el rango de entrada tal cual
  si alguna fecha es inválida, en vez de romper — con test de regresión (`period.test.ts`, fecha
  vacía, `not.toThrow()`). Verificado en vivo: borrar una fecha en "Personalizado" ya no deja la
  pantalla en blanco (`body` con contenido, sin excepción en consola).

### AN-04 · A 320px, la tabla de promedio mensual queda ilegible — Medio, Resuelto

- **Pasos:** Análisis a 320px (sin scroll horizontal — eso bien) → bajar a "Promedio mensual por categoría".
- **Esperado:** legible aunque abreviado — nombres potencialmente largos (probado con 60 caracteres, que en resto de pantalla se corta bien con ellipsis).
- **Obtenido:** encabezado superpuesto ("CATEGORÍA" y "PROMEDIO" pegados, "CATEGORÍAOMEDIO" en captura); cada fila deja punto de color y letra suelta en lugar del nombre — tres columnas de importe (`$ promedio`, `$
  septiembre`, `%` desvío) no ceden espacio. Resto de pantalla a este ancho (hero, donut, leyenda, Fijo vs. variable, Top) bien.
- **Por qué (lectura de código):** columnas de importe con anchos mínimos fijos dejan ~20px para nombre en fila de ~264px útiles (`Analisis.tsx` ~líneas 425-502, mapa de columnas de "Promedio mensual").
- **Arreglo (2026-09-25):** decisión de Lean — debajo de `sm`, el nombre pasa a su propia línea
  (`flex-wrap` + `basis-full`) y las tres columnas de importe bajan a una segunda línea, alineadas a
  la derecha (`ml-auto` en la primera); la etiqueta "Categoría" del encabezado se oculta en mobile
  (las otras tres entran solas). Mismo tratamiento en la fila "Otros". Verificado en vivo a 320px con
  la cuenta QA: sin scroll horizontal, sin superposición.

### AN-05 · Con ciclo quincenal o semanal, "Ingresos" y "Neto" muestran el mes calendario completo — Alto, Resuelto

- **Pasos:** ciclo de cuenta QA a quincenal → Análisis quincena 16–30 sep (preset "Mes") → comparar "Ingresos" con ingreso real de esos 15 días.
- **Esperado:** "Ingresos" del período elegido — lo que dice encabezado ("Gastaste en 16–30 sep 2026").
- **Obtenido:** "Ingresos" **$2.079.000,50**. SQL: `rpc_monthly_series` da mismo `total_income` ($2.079.000,50) con mes completo (`2026-09-01`–`2026-09-30`) o sólo segunda quincena (`2026-09-16`–`2026-09-30`) — ignora rango y agrupa por mes calendario. "Neto" inflado igual: gasto real de quincena ($285.111,00) contra ingreso de **todo el mes** → +$1.793.889,50, no representa ningún período real. Reproducido en semanal (21–27 sep): mismo $2.079.000,50.
- **Por qué:** `rpc_monthly_series` (`20260806230001_balance_adjustments.sql:29-66`) agrupa por `date_trunc('month', occurred_on)`; toda fila del mes cae en mismo bucket aunque esté fuera de `p_from`/`p_to` — filtro de fecha sólo decide qué meses tocar.
- **Nota:** comentario del código (`Analisis.tsx:165-169`) avisa que es intencional ("el gráfico se queda mensual a propósito") para serie de tendencia — pero acá mismo número alimenta cifra "Ingresos" del hero, leída como ingreso del período.
- **Arreglo (2026-09-25):** "Ingresos" pasó de `rpc_monthly_series` a `v_range_summary` (la misma RPC
  que ya usa Hoy), que filtra por `[p_from, p_to]` exacto y excluye ajustes — sin migración nueva, ya
  existía. Verificado en vivo con un rango "Personalizado" que cruza un mes (20 sep–5 oct): "Ingresos"
  en pantalla ($9.000,00) coincide centavo a centavo con `v_range_summary` llamada directo por REST
  para ese mismo rango — cubre a la vez AN-05 (rango parcial de un mes) y AN-16 (cruza a otro mes),
  mismo mecanismo.

### AN-06 · "Promedio mensual por categoría" ignora el período elegido — Medio, Resuelto

**Afecta:** resto de paneles de misma pantalla (no cierran entre sí).

- **Pasos:** con ciclo quincenal del caso anterior, comparar columna "SEPTIEMBRE" de tabla de promedio contra donut, misma categoría.
- **Esperado:** columna del mes actual habla del mismo período que resto — encabezado no dice "mes calendario", dice nombre del mes elegido.
- **Obtenido:** "Supermercado": promedio "SEPTIEMBRE $252.390,10" (mes completo, once días fuera de rango), donut misma carga, quincena 16–30: **$6.500,00** — 39 veces diferencia, "misma" categoría, "misma" pantalla.
- **Por qué:** `useCategoryMonthlySeries(period.anchor)` (`analytics/api.ts:139`) arma 12 puntos siempre con `v_spend_by_category` del mes calendario completo del ancla, sin mirar `range.from`/`.to` — mismo mecanismo de AN-05 en tabla.
- **Arreglo, decisión de Lean (2026-09-25):** la tabla se queda en mes calendario a propósito (es una
  tendencia de 12 meses, no el período elegido — mismo motivo que ya tenía el código), pero ahora lo
  dice: con ciclo quincenal o semanal aparece una nota bajo el título ("Por mes calendario completo,
  no por tu quincena/semana"). Verificado en vivo cambiando la cuenta QA a ciclo quincenal por REST
  (`cycle_kind`): la nota aparece; ciclo devuelto a mensual al terminar.

### AN-07 · Con Análisis abierto, un movimiento nuevo deja "Top categorías" y "Promedio mensual" viejos — Medio, Resuelto

- **Pasos:** mobile, Análisis abierto (sin navegar), `+` → gasto $5.000 en "Supermercado" (ya en donut, Top y promedio) → Guardar, sin recargar.
- **Esperado:** seis paneles del mismo período se actualizan juntos o quedan todos viejos — no mezcla.
- **Obtenido:** hero, donut y "Fijo vs. variable" al instante: Supermercado de $252.390,10 (44 %) a **$257.390,10 (45 %)**, "Decidiste vos" +$5.000. **"Top categorías vs. período anterior" y "Promedio mensual por categoría" quedaron en $252.390,10**, sin gasto nuevo — verificado con texto completo antes y después, sin otro cambio en esas secciones.
- **Por qué:** `TRANSACTION_QUERY_KEYS` (`transactions/queryKeys.ts:9-22`), lo invalidado al crear movimiento, incluye `transactions` y `spend-by-category` pero no `top-categories-comparison` ni `category-monthly-series` — queries de esos paneles.
- **Arreglo (2026-09-25):** se suman `top-categories-comparison`, `category-monthly-series` y
  `previous-period-total` a `TRANSACTION_QUERY_KEYS`, con test de regresión en `queryKeys.test.ts`.
  Verificado en vivo, mismo escenario del hallazgo (mobile, FAB "Nuevo movimiento", gasto $5.000 en
  Supermercado sin recargar): "Top categorías" pasó de $252.390,10 a $257.390,10 y "Promedio mensual"
  también, ambos al instante — los seis paneles quedan de acuerdo.

### AN-08 · El drill-down a "Sin categoría" trae ingresos y ajustes que Análisis excluye de ese total — Medio, Resuelto

**Afecta:** Movimientos (lista que se abre).

- **Pasos:** donut, click leyenda "Sin categoría" (septiembre, $55.000,00 en Análisis) → mirar filtro en Movimientos.
- **Esperado:** total "Sin categoría" en Movimientos con filtro aplicado = $55.000,00.
- **Obtenido:** chip "Sin categoría ✕" y **7 movimientos**: gastos sin categoría ($55.000,00, correcto), **ingresos sin categoría** (ej. "Sueldo septiembre" +$1.950.000,00, "Venta bici" +$120.000,50) y **ajustes sin categoría** ("Saldo al dejar de usar Cuentas") — ninguno cuenta en $55.000,00. Total en Movimientos no puede coincidir con el de origen.
- **Por qué:** filtro "Sin categoría" de Movimientos es `category_id is null` (`transactions/api.ts:61-62`), sin `type = 'expense'` ni `not is_adjustment` — filtros que sí tiene rama "Sin categoría" de `v_spend_by_category` (`spend_by_category_uncategorized.sql:33-39`).
- **Nota:** drill-down a categoría real ("Supermercado") filtra limpio: sólo sus 3 movimientos.
- **Arreglo (2026-09-25):** el drill-down de Análisis ahora manda `type: 'expense'` junto con la
  categoría (`goToCategory` en `Analisis.tsx`), y el filtro "Sin categoría" de Movimientos
  (`useTransactions`) excluye ajustes (`is_adjustment.is.false`) — mismo criterio que ya usa
  `v_spend_by_category`. Verificado en vivo: el drill-down navega a Movimientos con el chip "Sin
  categoría" y el filtro de tipo aplicado.

### AN-09 · Un error de red en Ingresos se ve como $0 real y deja "Neto" en negativo falso — Alto, Resuelto

- **Pasos:** cortar por red `rpc_monthly_series` (`route.abort()`) → abrir Análisis.
- **Esperado:** aviso de que cifra no cargó — es dinero, "Neto" depende de ella.
- **Obtenido:** "Ingresos" **$0,00**, misma tipografía/confianza que valor real; "Neto" de +$1.509.499,40 a **−$569.501,10** — como pérdida real de más de medio millón, cuando ingreso no cargó. Sin esqueleto, ícono ni mensaje. Comparación: cortar fuente principal (`v_spend_by_category`) sí muestra "No se pudo cargar" con "Reintentar" — tarda por reintentos de React Query, pero funciona.
- **Por qué:** `incomeCents` = `(incomeSeriesQuery.data ?? []).reduce(...)` (`Analisis.tsx:178`) — query en error → `data` `undefined` → `??[]` da $0 silencioso; nadie mira `incomeSeriesQuery.isError`. Pantalla de error sólo depende de `spendQuery.isError` (`Analisis.tsx:252`).
- **Arreglo (2026-09-25):** el `isError` de pantalla completa ahora también mira
  `rangeSummaryQuery.isError` (la fuente de "Ingresos" tras AN-05) y `prevTotalQuery.isError`
  (AN-12) — cualquiera de las tres rotas muestra el mismo `ErrorState` con "Reintentar" que ya tenía
  `spendQuery`. Verificado en vivo cortando `v_range_summary` por red (`route.fulfill({status:500})`,
  más confiable que `abort()` para forzar el agotamiento de reintentos): a los ~8s aparece "No se
  pudo cargar" en vez de "Ingresos $0,00"/"Neto" negativo falso.

---

### AN-10 · El tope de 1000 filas hace que "Fijo vs. variable" cuente menos gasto real que el hero, sin aviso — Alto, Resuelto

- **Pasos:** cargar por API con sesión QA (autenticada, mismo efecto que 1050 desde UI) 1.050 gastos de $1,00 marcados `QA-AN2-CAP`, 1–21 sep (50 por día) → Análisis septiembre (preset "Este mes").
- **Esperado:** "Fijo vs. variable" suma igual que hero — mismo "total gastado en septiembre".
- **Obtenido:** 1.064 gastos reales+prueba en mes (SQL: `count(*) = 1064`, `sum(amount) = $3.585.410,75` sin excluir ajuste del período); hero **$570.551,10** — correcto, sin recorte, porque `v_spend_by_category` es RPC agregado, no lista con `LIMIT`. "Fijo vs. variable" (comprometido + variable) **$570.487,10** — exactos **$64,00 menos**. SQL: mismas filas ordenadas `occurred_on desc, created_at desc` con `LIMIT 1000` (query real de `useTransactions`) trae 1.000 de 1.064; las 64 faltantes son los gastos de prueba del 1 sep (día más viejo, primero afuera con ese orden) — $64,00, uno por fila. Hero, donut y Top no afectados: no pasan por `useTransactions`.
- **Por qué:** `TRANSACTIONS_ROW_LIMIT = 1000` (`transactions/api.ts:30`) es tope explícito de PostgREST, documentado como intencional para evitar corte silencioso por defecto — pero Análisis no avisa cuando se alcanza. Uso real (varios movimientos por día, tarjetas con muchas compras chicas) llega a 1000 filas/mes; desde ahí "Fijo vs. variable" mal contado sin indicio.
- **Nota de limpieza:** 1.050 filas borradas al terminar (SQL, `count = 0` con `QA-AN2-CAP`) — ver "Estado de la cuenta de QA al cerrar".
- **Arreglo (2026-09-25):** "Fijo vs. variable" deja de usar `useTransactions` (con su tope de 1000)
  y pasa a `useExpenseRowsForClassification` (`analytics/api.ts`), que pagina con un helper puro
  nuevo (`fetchAllPages`, `src/lib/fetchAllPages.ts`, con tests de 0/una página exacta/varias
  páginas) hasta traer TODAS las filas del rango, sin tope. Movimientos no se toca: su lista sigue
  con `useTransactions` y su propio tope, que ahí sí tiene sentido (paginación visible). Verificado
  en vivo repitiendo el escenario (1.050 gastos de $1,00 por API): "Fijo vs. variable" coincide al
  centavo con la suma calculada aparte, paginando a mano por REST (1.063 filas, $570.551,10) — antes
  daba $64,00 menos.

### AN-11 · El marcador del período anterior en el Top queda invisible cuando el período anterior es el máximo — Bajo, Resuelto

- **Pasos:** gasto $900.000,00 en "Transporte" en agosto (período de comparación), sin comparable en septiembre (Transporte sep ya tenía $38.500,00) → "Top categorías vs. período anterior", fila Transporte.
- **Esperado:** marca vertical 2px visible dentro de barra, en posición proporcional del anterior (`TopCategoriesComparison.tsx:37`) — aunque sea en borde derecho.
- **Obtenido:** medición de layout (Playwright, `boundingClientRect`): contenedor 330,39px; gasto de agosto es máximo absoluto de las 6 categorías (current y previous), `prevPct` = 100% → marcador con `left: 100%`, caja completa (330,39px a 332,39px) fuera del contenedor. Con `overflow-hidden` (línea 35), recortado por completo: 0 píxeles visibles.
- **Por qué:** `prevPct = Math.min((c.previousCents / maxCents) * 100, 100)` nunca supera 100 porque `maxCents` incluye `previousCents` (`TopCategoriesComparison.tsx:12,18`) — pero marcador de 2px posicionado con `left`, no `right` ni `transform: translateX(-50%)`, así que en 100% exacto cae entero fuera en vez de centrado/contenido.
- **Nota de limpieza:** gasto borrado al terminar (`QA-AN2-MARKER`, verificado por SQL).
- **Arreglo (2026-09-25):** `left: min(${prevPct}%, calc(100% - 2px))` — al 100% exacto, el marcador
  queda pegado al borde derecho en vez de caer entero afuera. Verificado en vivo repitiendo el
  escenario (gasto de $900.000,00 en agosto, sin comparable en septiembre): el estilo calculado en
  pantalla es `left: min(100%, 100% - 2px)`, visible dentro del contenedor.

### AN-12 · Un error de red en el total del período anterior se ve como "$0,00 en agosto" real, sin aviso — Alto, Resuelto

- **Pasos:** cortar por red llamadas a `v_spend_by_category` con `p_from:
  "2026-08-01"` (período anterior agosto — usado por `usePreviousPeriodTotal`, `useTopCategoriesComparison` y `useCategoryMonthlySeries` a la vez) → Análisis septiembre.
- **Esperado:** aviso de que cifra no cargó — arma "$X más/menos que en agosto" del hero.
- **Obtenido:** hero con total actual correcto ($569.501,10, sin badge de % porque `changePct` da `null` con `prevTotalCents <= 0`) y texto **"$569.501,10 más que en agosto ($0,00)"** — como si en agosto no se gastó nada. Hero sin aviso. Misma carga: "Promedio mensual por categoría" y "Top categorías vs. período anterior" (MISMA llamada bloqueada) sí muestran "No se pudo cargar" con "Reintentar" — diferencia sólo en hero.
- **Por qué:** `prevTotalCents = prevTotalQuery.data ?? 0` (`Analisis.tsx:180`) — como `incomeCents` en AN-09, nadie mira `usePreviousPeriodTotal(...).isError`. A diferencia de AN-09, "Neto" no se rompe (no usa `prevTotalCents`), pero badge desaparece (en vez de estado de error) y texto de comparación se lee como dato real.
- **Corrección a sospecha de 1.ª pasada:** `top-categories-comparison` y `category-monthly-series` (tabla promedio) SÍ manejan error — cada uno con `isError` y `ErrorState`/"Reintentar" (`Analisis.tsx:430-431` y `:542-543`). Patrón silencioso de AN-09 es específico de `incomeSeriesQuery` (AN-09) y `prevTotalQuery` (este), no general a "todo lo que no es `spendQuery`".
- **Arreglo (2026-09-25):** mismo cambio que AN-09 — `isError` de pantalla completa suma
  `prevTotalQuery.isError`. Verificado en vivo cortando `v_spend_by_category` para el período
  anterior (`route.fulfill({status:500})` sólo cuando `p_from` es de un mes previo): aparece "No se
  pudo cargar" en vez de "$569.501,10 más que en agosto ($0,00)".

### AN-13 · Un error de red en los ids de cuotas comprometidas no avisa nada en "Fijo vs. variable" — Medio, Resuelto

- **Pasos:** cortar por red todas las llamadas a `credit_purchase_payments` → abrir Análisis.
- **Esperado:** aviso — esa lista decide si cuota de compra en cuotas es "Ya estaba comprometido" o "Decidiste vos".
- **Obtenido:** llamada rota (tres intentos, tres fallados), "Fijo vs. variable" idéntico a carga exitosa: $65.111,00 comprometido + $504.390,10 variable, sin esqueleto, ícono ni mensaje. Cuenta QA sin compras en cuotas ahora (`credit_purchases` = 0 filas, SQL), así que no cambió número — pero código sin protección para cuando haya.
- **Por qué:** `const { data: committedPurchaseIds } = useCommittedPurchaseTransactionIds()` (`Analisis.tsx:163`) nunca mira `.isError`. En error, `committedPurchaseIds` es `undefined`, y `summarizeFijoVsVariable(transactions ?? [],
  committedPurchaseIds ?? new Set())` (`Analisis.tsx:190`) usa `Set` vacío — en cuenta CON cuotas, cuota sin `fixed_expense_payment_id` ni `is_credit_card_payment` (`aggregate.ts:38-39`) pasaría de "Ya estaba comprometido" a "Decidiste vos" sin aviso; mismo patrón silencioso que AN-09/AN-12, reclasificando plata en vez de mostrar $0.
- **Nota:** efecto numérico no demostrado en vivo por falta de datos de cuotas en cuenta QA (armar tarjeta + compra en cuotas + pago se consideró desproporcionado) — por eso "Medio" y no "Alto": bug confirmado por código y ausencia de aviso en vivo, sin ver número moverse.
- **Arreglo (2026-09-25):** el panel "Fijo vs. variable" ahora mira su propio error
  (`classificationQuery.isError || committedIdsError`) y muestra `ErrorState` con "Reintentar" en vez
  de seguir mostrando números con un `Set` vacío. Verificado en vivo cortando `credit_purchase_payments`
  (`route.fulfill({status:500})` — `route.abort()` no sirvió para esta llamada puntual: algo en la
  capa de red del cliente la reintentaba indefinidamente sin que React Query llegara nunca a
  `isError`, artefacto de la simulación, no de la app): a los ~8s aparece "No se pudo cargar" en el
  panel. Efecto numérico (reclasificar cuota de "comprometido" a "variable") sigue sin demostrarse en
  vivo por falta de datos de cuotas en la cuenta QA — igual que antes, pero ahora al menos avisa.

### AN-14 · El período elegido en Análisis se resetea al volver del drill-down o al recargar la página — Medio, Resuelto

**Afecta:** Movimientos (ida y vuelta entre pantallas).

- **Pasos (recargar):** cambiar período a mes distinto al actual (ej. avanzar 2 ciclos con flechas) → F5.
- **Obtenido:** tras avanzar de septiembre a noviembre 2026, F5 volvió a **septiembre 2026** (ciclo actual).
- **Pasos (volver del drill-down):** período octubre 2026, click en categoría del donut → Movimientos → atrás del navegador.
- **Obtenido:** Movimientos filtrado bien por octubre. Al volver, Análisis en **septiembre 2026** — octubre perdido.
- **Esperado:** persistir o no es razonable, pero "volver" no debería deshacer en silencio una elección explícita, sin aviso.
- **Por qué:** `const [period, setPeriod] = useState(() => defaultPeriod(cycleConfig))` (`Analisis.tsx:142`) vive sólo en estado local, sin URL ni storage — cualquier remount de `Analisis` (recarga o volver por History API) reinicia `period` a `defaultPeriod`, ciclo que contiene "hoy".
- **Arreglo (2026-09-25):** el período se guarda en `history.state` (`navigate(location.pathname,
  {replace:true, state:{analisisPeriod:period}})` en un `useEffect`), y el estado inicial lo lee de
  ahí antes de caer a `defaultPeriod`. Sobrevive a F5 y a "atrás" porque ambos reusan la misma entrada
  de historial. Verificado en vivo: avanzar 2 ciclos y F5 mantiene el mes elegido (antes volvía al
  actual); volver de un drill-down también lo mantiene.

### AN-15 · Las flechas de "Mes" navegan sin tope a ciclos futuros vacíos — Bajo, Resuelto

- **Pasos:** preset "Este mes", 15 clicks seguidos en "Mes siguiente".
- **Obtenido:** llegó a **diciembre de 2027** (15 meses adelante) sin tope, con estado vacío correcto ("No hay gastos en este período · Probá con un rango más amplio") — nada se rompe, pero sin límite. "Mes anterior" 5 veces llevó consistente a julio 2027.
- **Esperado:** no es bug funcional, pero Leandro debería decidir si quiere tope — fácil terminar años adelante por error sin señal de "no hay más datos, volvé".
- **Por qué:** `shiftPeriodMonth` (`period.ts:77-88`) sin límite superior ni inferior — a diferencia de rango acotado a primer/último movimiento.
- **Arreglo, decisión de Lean (2026-09-25):** sin tope — Movimientos, Fijos y Hoy navegan igual de
  lejos (mismo `MonthNav`) y el estado vacío ya avisa bien; no vale la pena una regla sólo para
  Análisis. Se cierra sin código.

### AN-16 · Una semana que cruza dos meses agrava AN-05/AN-06: "Ingresos"/"Neto" suman los DOS meses calendario completos — Alto, Resuelto

- **Pasos:** ciclo QA a semanal → ingreso de prueba $500.000,00 el 2 oct (`QA-AN2-CROSSMONTH`) → Análisis semana 28 sep–4 oct 2026 (7 días: 3 sep + 4 oct).
- **Esperado:** "Ingresos" de esos 7 días — prueba ($500.000,00) más ingresos reales de esos días (ninguno, SQL previo).
- **Obtenido:** "Ingresos" **$2.579.000,50** — $2.079.000,50 (TODO septiembre, mismo de AN-05) **más** $500.000,00 (TODO octubre, sólo la prueba). "Neto" **+$2.522.000,50**, más de 5 veces ingreso real de la semana. AN-05 (período dentro de un mes) mostraba mes equivocado; cruzar límite de mes es peor: suma DOS meses completos.
- **Por qué:** `rpc_monthly_series` (`20260806230001_balance_adjustments.sql:34-36`) genera bucket por mes calendario entre `date_trunc('month', p_from)` y `date_trunc('month', p_to)` — `p_from` sep y `p_to` oct → DOS filas, cada una con total de SU mes completo. `Analisis.tsx:178` suma `.reduce()` sobre todas → dos meses enteros en vez de 7 días.
- **Nota de limpieza:** ingreso borrado al terminar (`QA-AN2-CROSSMONTH`, SQL) y ciclo vuelto a mensual.
- **Arreglo (2026-09-25):** mismo cambio que AN-05 (`v_range_summary` en vez de `rpc_monthly_series`)
  — filtra por rango exacto sin importar si cruza un mes. Verificado en vivo con el mismo mecanismo
  que AN-05 (rango "Personalizado" 20 sep–5 oct, cruza el límite de mes): "Ingresos" en pantalla
  coincide con `v_range_summary` para ese rango exacto.

### AN-17 · El badge de % y el texto de comparación parecen contradecirse cuando el período y su comparación tienen distinta cantidad de días — Medio, Resuelto

- **Pasos:** ciclo QA quincenal, gasto $14.000,00 sin categoría el 20 oct (`QA-AN2-MISMATCH`; quincena 16–31 oct = 16 días) → Análisis en esa quincena; comparación 1–15 oct (15 días, $7.000,00 de gasto real).
- **Esperado:** badge y texto leídos juntos no parecen decir cosas distintas.
- **Obtenido:** hero "$14.000,00" con badge **"+87,5%"**; texto **"$7.000,00 más que en el período anterior ($7.000,00)"**. Quien mire texto — $14.000 vs $7.000 — calcula "doble, +100%", badge dice +87,5%. Ambos correctos por separado ($14.000/16 días = $875/día vs. $7.000/15 días = $466,67/día → +87,5% cambio por día), pero nada explica que badge usa promedio diario y texto totales — 1.ª pasada no lo vio porque períodos probados tenían mismos días, donde ambos dan mismo %.
- **Por qué:** consecuencia visible, prevista por comentario del código (`Analisis.tsx:183-186`), de comparar por promedio diario con períodos de distinto largo — cálculo correcto, sin indicio textual ("por día") junto al badge.
- **Nota de limpieza:** gasto borrado al terminar (`QA-AN2-MISMATCH`, SQL) y ciclo vuelto a mensual.
- **Arreglo (2026-09-25):** el badge suma "por día" cuando `days !== prevDays`. **Primera versión
  tenía una regresión** (reportada por Lean en vivo, cuenta real): con ciclo mensual — el caso común,
  no sólo quincena/semana — casi cualquier mes contra el anterior ya difiere en días (30 vs. 31, etc.),
  así que el sufijo aparecía casi siempre, incluido el uso normal ("−25,5% por día" con ciclo
  mensual). Corregido a `cycleConfig.kind !== 'monthly' && days !== prevDays`: con mes calendario
  (donde nadie se sorprende de que agosto tenga más días que septiembre) el badge queda igual que
  siempre; el sufijo sólo aparece con quincena/semana, que es donde de verdad puede confundir.
  Verificado en vivo con la cuenta QA: ciclo mensual → badge sin "por día" ("+43,3%"); ciclo
  quincenal → mecanismo probado, sin sufijo en la quincena actual porque ese mes tiene el mismo largo
  que su comparación (no es un caso que lo dispare, no una falla).

---

## Lo verificado correcto

- **Donut de Análisis coincide con el de Hoy**, mismo período: mismas categorías, montos y porcentajes (93 % / 3 % / 2 % / 1 % en caso probado, categoría de nombre largo dominando por monto de prueba $9.999.999,99).
- **Categoría archivada sigue contando** igual que activa — no desaparece ni se marca (no es AN-02: total no se rompe, sólo no hay señal de archivada).
- **Sin scroll horizontal a 320px** en ninguna sección (`scrollWidth − innerWidth` = 0), sin superposición fuera de tabla de promedio (AN-04).
- **Totales de "qué entra"** cerraron al centavo contra base: gasto compartido (sólo "mi parte"), "Descontado" (cuenta como gasto), compra suelta en cuotas pagada (cuenta por cuota, no total), tarjeta con compra pagada (cuenta, con categoría precargada de tarjeta) y gasto con fecha futura dentro del ciclo (cuenta ya, sin marca de "futuro" — igual que Hoy).
- **Transferencia entre cuentas no aparece en Análisis** (ni hero, donut, Fijo vs. variable) — tabla separada (`account_transfers`) cumple su comentario.
- **Planes:** en Básico, `/analisis` redirige a `/hoy`, sección ausente en nav escritorio y drawer mobile. En Test, Análisis completo (seis paneles como Premium, sin `useCan` que recorte) en nav escritorio y drawer mobile ("Secciones" sólo con "Análisis", sin Mis Deudas/Ahorros/Me Deben — coherente con Test).
- **Badge de % y texto de comparación no se contradijeron** en ciclos cortos de 1.ª pasada (quincenal 16–30 y semanal 21–27): período actual y anterior con mismos días, promedio diario (badge) y total crudo (texto) dieron igual. Sospecha queda para quincena/semana de distinto largo que su comparación (no probada esta pasada).
- **Drill-down a categoría real** ("Supermercado") filtra limpio en Movimientos, total exacto — problema específico de "Sin categoría" (AN-08).
- **Error de red de fuente principal** (`v_spend_by_category`) sí muestra "No se pudo cargar" con "Reintentar" — tarda por reintentos de React Query, pero llega. Problema sólo en fuentes secundarias (AN-09).
- **Modo oscuro**, pantalla completa: sin problemas de contraste, colores distintos y legibles entre categorías, nada roto sólo en ese tema.

**De la 2.ª pasada:**

- **Seguridad por API confirmada por RLS**, no sólo cliente: JWT de cuenta QA contra PostgREST directo (sin app), pedir `transactions` filtrando por `user_id` de cuenta de prueba habitual → `[]`; sin filtro → sólo filas propias; `INSERT` con `user_id` de otra cuenta → `403` ("new row violates row level security policy"). RPC de Análisis (`v_spend_by_category`, `rpc_monthly_series`) filtran internamente por `auth.uid()` sin recibir id de usuario, imposible pedir datos de otra cuenta.
- **Mapeo de preset del drill-down funciona**: desde "Este mes" (mes calendario completo), click en categoría abre Movimientos con preset "Mes" y flechas habilitadas (confirmado: "Mes siguiente" presente, no disabled, navega). Desde "Últimos 3 meses" (no mes calendario), abre con "Personalizado" y chip "1 jul – 30 sep ✕" en vez de flechas — regla exacta del comentario de `movementPeriodFromRange` (`transactions/movementPeriod.ts`).
- **Ojo de "ocultar saldo" no afecta Análisis, confirmado en vivo**: activado desde Hoy (`localStorage["hidden-balance:saldo-actual"] = "1"`), misma sesión, Análisis mostró todas las cifras (hero, donut, Fijo vs. variable) — coincide con que componente no importa `useHiddenBalance`. No es bug, pero inconsistencia de producto: pantalla con más detalle de gasto por categoría y única de las que muestran plata que no respeta preferencia.
- **Flechas de "Mes" no rompen nada navegando lejos** (ver AN-15 para falta de tope) — a 15 meses, estado vacío correcto, sin crash ni layout roto.
- **`top-categories-comparison` y `category-monthly-series`** (tabla promedio) SÍ manejan sus errores, con `isError`/`ErrorState`/"Reintentar" — contra sospecha de 1.ª pasada, patrón silencioso de AN-09 no es general a "todo lo que no es `spendQuery`": específico de `incomeSeriesQuery` (AN-09) y `usePreviousPeriodTotal` (AN-12), únicas fuentes sin `isError` mirado en `Analisis.tsx`. Ver AN-12 y AN-13.

## Quedó afuera

- **Efecto numérico de AN-13** (error de red en cuotas comprometidas reclasificando plata de "comprometido" a "variable") sigue sin demostrarse en vivo: cuenta QA sin compras en cuotas (`credit_purchases` = 0), armar escenario (tarjeta + compra en cuotas + pago) se consideró desproporcionado igual que en 2.ª pasada. El arreglo (aviso con `ErrorState`) sí se verificó.
- **AN-17 con una quincena de 16 días real** viendo el sufijo "por día" en pantalla — el mecanismo (`days !== prevDays`) está cubierto por los tests en vivo de ciclo quincenal/semanal de esta pasada, pero no se forzó ese calendario exacto.
- **Variantes adicionales** (ej. semana que cruza límite de año) no probadas — cubiertas en esencia por AN-16, que muestra el mecanismo con números exactos.

## Estado de la cuenta de QA al cerrar

Foto final SQL sólo lectura coincide exacta con inicial: Premium, ciclo mensual, semana desde lunes; 22 movimientos (mismos totales por tipo); 2 ajustes; 9 categorías (7 gasto + 2 ingreso), ninguna archivada; `rpc_current_balance()` = $1.426.889,00; 2 cuentas activas; 9 fijos (8 activos); 0 tarjetas; 0 compras a crédito; 1 deuda ("Préstamo test QA", preexistente). Todo lo cargado (marcado `QA-AN`: 4 categorías, ~29 movimientos, 1 tarjeta con compra, 2 compras sueltas, 1 transferencia, 1 deuda con pago, más guardado y pago de fijo del caso "guardado con movimiento", más dos movimientos sueltos de verificación de caché) borrado y verificado por SQL sin restos — incluida transacción "Descontado" generada por RPC de deudas, sin marca `QA-AN`, encontrada y borrada aparte. Dos categorías tocadas en vivo (archivada, pasada a Ingreso) volvieron a estado original antes de borrarse. Plan cambiado por SQL a Básico y Test para nav y drawer, ciclo a quincenal y semanal para AN-05/AN-06 — ambos devueltos a Premium y mensual (semana desde lunes) al terminar cada bloque, verificado por SQL.

### 2.ª pasada (mismo día)

Foto de referencia SQL antes de arrancar: Premium, ciclo mensual (semana desde lunes), 22 movimientos, 9 categorías, 2 cuentas, 9 fijos, 0 tarjetas, 0 compras en cuotas, 1 fila en `receivables` — idéntica a cierre de 1.ª pasada, nada pendiente entre medio.

Lo cargado, todo marcado `QA-AN2` (sufijo por caso: `-CAP`, `-MARKER`, `-MISMATCH`, `-CROSSMONTH`) para encontrar y borrar sin ambigüedad:

- **AN-10 (tope de 1000 filas):** 1.050 gastos de $1,00 (`QA-AN2-CAP`), cargados y borrados por API REST directa con JWT de QA (no UI, por volumen) — SQL: 1.050 filas insertadas antes, 0 después.
- **AN-11 (marcador invisible):** 1 gasto $900.000,00 en Transporte, agosto (`QA-AN2-MARKER`) — borrado.
- **AN-16 (semana cruza dos meses):** 1 ingreso $500.000,00 el 2 oct (`QA-AN2-CROSSMONTH`) — borrado, ciclo de semanal a mensual.
- **AN-17 (quincena de distinto largo):** 1 gasto $14.000,00 el 20 oct (`QA-AN2-MISMATCH`) — borrado, ciclo de quincenal a mensual.

Para seguridad por API (ver "Lo verificado correcto") se usó también cuenta de prueba habitual, sólo lectura (un `GET` filtrado por su `user_id` con token de QA, devolvió vacío) y un único intento de escritura cruzada (`INSERT` con su `user_id` usando token de QA, rechazado 403, sin crear fila) — ningún dato real de esa cuenta leído ni modificado.

Foto final SQL, tras borrar todo y devolver `cycle_kind` a `monthly`: Premium, ciclo mensual, 22 movimientos, 9 categorías, 2 cuentas, 9 fijos, 0 tarjetas, 0 compras en cuotas, 1 fila en `receivables` — coincide exacto con referencia de arranque. `0` filas con descripción `like 'QA-AN2%'` verificado por SQL como paso final.

### 3.ª pasada — verificación de los arreglos (2026-09-25)

Foto de referencia antes de arrancar (REST, sesión QA): Premium, ciclo mensual (semana desde lunes),
22 movimientos, 9 categorías, 2 cuentas, mismo `cycle_kind`/`cycle_week_starts_on` que el cierre de
2.ª pasada — nada pendiente entre medio.

Dev server local (`npm run dev`, puerto 5173 libre) contra producción; Playwright instalado en el
scratchpad de la sesión (no toca `package.json`). Todo lo cargado, marcado `QA-AN3` (sufijo por caso:
`-ADJUST`, `-CAP`, `-MARKER`, `-CACHE`) para encontrar y borrar sin ambigüedad:

- **AN-01:** 1 ajuste $88.888,00 con categoría, por API (`QA-AN3-ADJUST`) — borrado.
- **AN-10:** 1.050 gastos de $1,00, por API en tandas de 200 (`QA-AN3-CAP`) — borrados; verificado
  `0` filas `QA-AN3-CAP` por SQL/REST después.
- **AN-11:** 1 gasto $900.000,00 en Transporte, mes anterior (`QA-AN3-MARKER`) — borrado.
- **AN-07:** 1 gasto $5.000,00 en Supermercado, cargado por la UI real (FAB "Nuevo movimiento", no
  API — el punto del hallazgo es la invalidación de queries del propio flujo de la app) con
  descripción `QA-AN3-CACHE` — borrado por API al terminar.
- **AN-05/AN-06/AN-16/AN-17:** sin fixtures nuevos — se reusó un rango "Personalizado" (20 sep–5 oct)
  para AN-05/AN-16 y un cambio de `cycle_kind` a `biweekly` por REST (columna con permiso directo
  para `authenticated`, sin necesidad de `db query`) para AN-06/AN-17, devuelto a `monthly` al
  terminar cada bloque.
- **AN-03, AN-04, AN-08, AN-09, AN-12, AN-13, AN-14:** sin fixtures — interacción directa con la UI
  (fechas, drill-down, cortes de red simulados con `route.fulfill({status:500})`, navegación).

Foto final (REST): Premium, ciclo mensual (semana desde lunes), 22 movimientos, 9 categorías, 2
cuentas — coincide exacto con la referencia de arranque. `0` filas con descripción `like 'QA-AN3%'`
verificado como paso final. Dev server (puerto 5173) matado al terminar.

**Re-verificación de AN-01 tras la migración:** Lean aplicó `20260925020001_analisis_ajustes_afuera.sql`
a producción (`db push --linked`) el mismo día. Se repitió el caso en vivo con datos nuevos
(`QA-AN3-ADJUST-FINAL`, borrados al terminar): total de la categoría antes y después del ajuste,
idéntico — el ajuste ya no se suma. `supabase migration list --linked` confirma
`20260925020001` con `remote` igual a `local`.

**Nota de la simulación de errores de red:** `route.abort()` de Playwright sirvió para `v_range_summary`
y `v_spend_by_category` (RPC vía POST), pero para `credit_purchase_payments` (`.select()` vía GET,
AN-13) el cliente reintentaba la llamada indefinidamente sin que React Query llegara nunca a
`isError` — artefacto de esa combinación puntual (confirmado inspeccionando el estado interno de
React Query en la página: `failureCount` no avanzaba más allá de 1 pese a los reintentos de red
visibles). `route.fulfill({status:500, ...})` es más confiable en general para forzar el agotamiento
de reintentos y se usó para las tres verificaciones de error de red de esta pasada.