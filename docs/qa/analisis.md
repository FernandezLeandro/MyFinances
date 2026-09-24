# QA de Análisis

- **Fecha:** 2026-09-23, hora Argentina (1.ª y 2.ª pasada el mismo día).
- **Código:** rama `accounts`, commit `eeeab9b` (1.ª pasada) y `790b7a5` (2.ª pasada, sin cambios de
  código de Análisis entre medio). Sin migraciones pendientes (`supabase migration list --linked`,
  88/88 aplicadas).
- **Planes:** Premium, Básico y Test.
- **Ciclos:** mensual, quincenal (16–30 sep, y 1–15/16–31 oct para la 2.ª pasada) y semanal (21–27
  sep, y 28 sep–4 oct para la 2.ª pasada).
- **Pasada:** 2.ª (retoma exactamente los ítems que quedaron afuera de la 1.ª — ver el detalle de cada
  uno más abajo). La 1.ª pasada fue en dos bloques el mismo día; la 2.ª agrega un tercer bloque
  enfocado en los ocho pendientes que había dejado esa 1.ª: el tope de 1000 filas, el marcador del Top
  vs. período anterior, el mapeo de preset del drill-down, el ojo de "ocultar saldo", los errores de
  red de las fuentes secundarias, la seguridad por API, las flechas de "Mes" sin tope y el reset del
  período, y dos variantes de ciclo corto (largo distinto al de comparación, semana que cruza dos
  meses).

## Resumen

Análisis no escribe datos: arma seis bloques (hero, Ingresos/Neto/Por día, donut, promedio mensual,
Fijo vs. variable, Top categorías) a partir de `v_spend_by_category`, `rpc_monthly_series` y
`transactions`. El foco de esta pasada fue qué entra y qué queda afuera de esos seis bloques, y si
hablan todos del mismo período. Se armó un juego de datos marcado `QA-AN` (ajustes, categoría
archivada/convertida/borrada, tarjeta y compra suelta en cuotas, gasto compartido con Descontado y Me
devolvió, transferencia, fecha futura, un monto de 7+ cifras) y se verificó cada caso contra
`v_spend_by_category` por SQL y contra la pantalla.

Se confirmaron en vivo, con importes exactos, varias formas en que **un mismo período puede contar
distinto según el panel que se mire dentro de la misma pantalla**, un **error de red que se ve como
plata real** (Ingresos en $0 y Neto negativo falso, sin ningún aviso), un **crash que deja la pantalla en
blanco**, y un problema de **layout a 320px** que hace ilegible una tabla entera:

- **Un ajuste de saldo con categoría asignada entra al hero, al donut y al Top, pero no a "Fijo vs.
  variable"** — y además la fila de Movimientos que lo generó sigue diciendo "afuera de Análisis",
  cuando en realidad sí cuenta (AN-01).
- **Pasar una categoría de Gasto a Ingreso hace que sus gastos viejos desaparezcan del hero, el donut, el
  Top y el promedio — pero sigan contando en "Fijo vs. variable"** (AN-02): dos paneles de la misma
  pantalla, mismo período, que ya no suman lo mismo.
- **Borrar una de las dos fechas de "Personalizado" rompe la pantalla entera**: queda en blanco (0
  caracteres de contenido), sin ningún mensaje de error, por una excepción no capturada (AN-03).
  Recargar la página lo arregla (vuelve al ciclo actual).
- **A 320px, la tabla "Promedio mensual por categoría" se vuelve ilegible**: el encabezado "Categoría" se
  superpone con "Promedio", y los nombres de categoría quedan cortados a un símbolo o dos (AN-04).
- **Con un ciclo quincenal o semanal, "Ingresos" y "Neto" muestran el mes calendario completo**, no el
  período elegido — comprobado exacto: en la quincena 16–30 de septiembre, "Ingresos" mostró
  $2.079.000,50, el mismo número centavo a centavo que el mes entero (AN-05).
- **La tabla "Promedio mensual por categoría" también ignora el período elegido**: con la misma quincena
  16–30, la columna "SEPTIEMBRE" de Supermercado mostró $252.390,10 (el mes completo), mientras el donut
  de esa misma pantalla, para esa misma quincena, mostraba Supermercado en apenas $6.500,00 (AN-06).
- **Con Análisis abierto, cargar un movimiento nuevo actualiza el donut, el hero y "Fijo vs. variable" al
  instante, pero deja "Top categorías" y "Promedio mensual" con el número viejo** — reproducido con un
  gasto de $5.000 en Supermercado: el donut pasó a $257.390,10, y el Top y el promedio se quedaron en
  $252.390,10 (AN-07).
- **El drill-down a "Sin categoría" no cierra con el total de Análisis**: trae también ingresos sin
  categoría y ajustes de saldo, que Análisis excluye de ese mismo total (AN-08).
- **Un error de red en la fuente de Ingresos se ve como plata real, sin ningún aviso**: con esa consulta
  cortada, "Ingresos" mostró $0,00 y "Neto" pasó a **−$569.501,10** (negativo), como si el mes hubiera
  sido una pérdida real — nada en pantalla avisa que fue un error, a diferencia del gasto total, que sí
  muestra "No se pudo cargar" cuando su propia fuente falla (AN-09).

**Lo verificado sin problemas:** el donut de Análisis y el de Hoy dan exactamente las mismas categorías
y los mismos porcentajes en el mismo período; una categoría archivada sigue apareciendo en Análisis
igual que una activa (sin distinguirse); no hay scroll horizontal a 320px en ninguna sección; en Básico
`/analisis` redirige a Hoy y no aparece en la nav; en Test se ve completo, igual en escritorio (nav) y
en el drawer mobile ("Secciones" con sólo "Análisis"); el drill-down a una categoría real (no "Sin
categoría") filtra bien en Movimientos; modo oscuro se ve consistente, sin problemas de contraste ni de
color encontrados; el error de la fuente principal (`v_spend_by_category`) sí muestra "No se pudo
cargar" con un botón de reintentar — tarda unos segundos por los reintentos automáticos, pero no es un
bug.

## Hallazgos

| ID | Sev. | Estado | Título | Afecta |
|---|---|---|---|---|
| AN-01 | Alto | Abierto | Un ajuste con categoría cuenta en Análisis pero su fila sigue diciendo "afuera de Análisis" | Movimientos, Hoy |
| AN-02 | Alto | Abierto | Categoría pasada a Ingreso: el hero, el donut, el Top y el promedio dejan de sumar sus gastos viejos, pero "Fijo vs. variable" sigue contándolos | Ajustes |
| AN-03 | Alto | Abierto | "Personalizado" con una fecha borrada deja la pantalla en blanco, sin aviso | — |
| AN-05 | Alto | Abierto | Con ciclo quincenal o semanal, "Ingresos" y "Neto" muestran el mes calendario completo, no el período elegido | — |
| AN-09 | Alto | Abierto | Un error de red en Ingresos se ve como $0 real y deja "Neto" en negativo falso, sin ningún aviso | — |
| AN-10 | Alto | Abierto | El tope de 1000 filas de `useTransactions` hace que "Fijo vs. variable" cuente menos gasto real que el hero, sin ningún aviso | — |
| AN-12 | Alto | Abierto | Un error de red en el total del período anterior se ve como "$0,00 en agosto" real, sin ningún aviso | — |
| AN-16 | Alto | Abierto | Una semana que cruza dos meses agrava AN-05/AN-06: "Ingresos"/"Neto" suman los DOS meses calendario completos, no sólo uno | — |
| AN-06 | Medio | Abierto | "Promedio mensual por categoría" ignora el período elegido: en una quincena/semana no cierra con el donut de la misma pantalla | — |
| AN-07 | Medio | Abierto | Con Análisis abierto, un movimiento nuevo actualiza el donut pero deja "Top categorías" y "Promedio mensual" viejos | — |
| AN-08 | Medio | Abierto | El drill-down a "Sin categoría" trae ingresos y ajustes que Análisis excluye de ese total | Movimientos |
| AN-04 | Medio | Abierto | A 320px, la tabla de promedio mensual queda ilegible (encabezados superpuestos, nombres cortados) | — |
| AN-13 | Medio | Abierto | Un error de red en los ids de cuotas comprometidas no avisa nada en "Fijo vs. variable" — puede reclasificar plata en silencio | — |
| AN-14 | Medio | Abierto | El período elegido en Análisis se resetea al volver del drill-down o al recargar la página, sin aviso | Movimientos |
| AN-17 | Medio | Abierto | El badge de % (promedio diario) y el texto de comparación (total crudo) parecen contradecirse cuando el período y su comparación tienen distinta cantidad de días | — |
| AN-11 | Bajo | Abierto | El marcador del período anterior en el Top queda invisible cuando el período anterior es el máximo (recorte por `overflow-hidden`) | — |
| AN-15 | Bajo | Abierto | Las flechas de "Mes" navegan sin tope a ciclos futuros vacíos | — |

Sev. = severidad (Crítico / Alto / Medio / Bajo). AN-10 a AN-17 son de la 2.ª pasada (2026-09-23).

---

### AN-01 · Un ajuste con categoría cuenta en Análisis pero su fila sigue diciendo "afuera de Análisis" — Alto

**Afecta:** Movimientos, Hoy (la etiqueta de la fila se arma en ambas).

- **Pasos:** con la sesión de QA, crear un ajuste de saldo con una categoría asignada (por PATCH directo
  a `transactions`, mismo efecto que editar un ajuste existente desde Cuentas — ver MO-08 en
  `movimientos.md`) → abrir Análisis en el mismo período.
- **Esperado:** un ajuste no debería entrar a ningún total de Análisis — es la regla explícita del
  código ("los ajustes NO cambian a propósito", comentario de `20260806230001_balance_adjustments.sql`)
  — y su fila en Movimientos/Hoy, que dice "Ajuste de saldo · afuera de Análisis", tendría que ser
  cierta.
- **Obtenido:** se creó un ajuste de $88.888,00 con la categoría "Servicios". Antes de crearlo, "Gastaste
  en septiembre" daba $10.699.538,10 (Fijo $90.611,00 + Variable $10.608.927,10, que sí cerraban entre
  sí). Después del ajuste, el hero pasó a **$10.788.426,10** — exactamente $88.888,00 más —, "Servicios"
  en el donut y el Top subieron por el mismo importe, y la fila del promedio mensual de Servicios
  también. "Fijo vs. variable" **no se movió** (siguió en $90.611,00 + $10.608.927,10), así que ahora el
  hero y la suma de ese panel difieren en $88.888,00 — el mismo importe del ajuste. La fila del ajuste,
  mientras tanto, se sigue viendo en Movimientos y en la lista de Hoy como "Ajuste de saldo · afuera de
  Análisis", que ya no es cierto.
- **Por qué:** la rama "categorizada" de `v_spend_by_category` (`20260912020001_spend_by_category_
  uncategorized.sql:20-29`) suma cualquier gasto de esa categoría sin filtrar `is_adjustment` — sólo la
  rama de "Sin categoría" (líneas 33-39) lo filtra. `summarizeFijoVsVariable`, en cambio, sí excluye
  `is_adjustment` del lado del cliente, así que los dos paneles quedan en desacuerdo.
- **Nota:** esto es un efecto nuevo de MO-08 (ajustes totalmente editables sin aviso, `movimientos.md`):
  cualquiera puede convertir sin querer un ajuste en gasto categorizado con sólo asignarle una categoría
  desde el diálogo de edición — no hace falta tocar la base a mano.

### AN-02 · Categoría pasada a Ingreso: el hero, el donut, el Top y el promedio dejan de sumar sus gastos viejos, pero "Fijo vs. variable" sigue contándolos — Alto

**Afecta:** Ajustes (la acción que dispara esto es "Categorías", no Análisis).

- **Pasos:** crear una categoría de Gasto, cargarle un gasto de $12.345,67 en el mes actual → en
  Ajustes, cambiarla de Gasto a Ingreso → volver a Análisis, mismo período.
- **Esperado:** un cambio de tipo de categoría es una decisión de clasificación futura — lo razonable es
  que, como mínimo, todos los paneles de Análisis se pongan de acuerdo sobre qué hacer con el gasto viejo
  (contarlo o no), aunque sea de cualquiera de las dos formas.
- **Obtenido:** el hero bajó de $10.788.426,10 a **$10.776.080,43** — exactamente los $12.345,67 del
  gasto de esa categoría —, y la categoría desapareció del donut y del Top. "Fijo vs. variable" **no se
  movió**: "Decidiste vos" siguió en $10.608.927,10, el mismo número de antes. Con esto, la suma de "Fijo
  + variable" ($10.699.538,10) y el hero ($10.776.080,43) ya no coinciden por dos motivos distintos a la
  vez (este más AN-01).
- **Por qué:** la rama categorizada de `v_spend_by_category` exige `c.kind = 'expense'`
  (`spend_by_category_uncategorized.sql:28`), así que en cuanto la categoría pasa a `income` deja de
  matchear — ni siquiera cae en "Sin categoría", porque esa rama exige `category_id is null`. El
  movimiento en sí sigue siendo `type = 'expense'` en la tabla, así que `useTransactions` (que sólo
  filtra por `type`, no por el `kind` actual de la categoría) y por lo tanto
  `summarizeFijoVsVariable` lo siguen contando.
- **Nota:** el gasto tampoco se ve en Movimientos con su categoría real — el selector de categorías de
  Movimientos sólo lista las de Gasto, así que un filtro por esa categoría ya no la encuentra.

### AN-03 · "Personalizado" con una fecha borrada deja la pantalla en blanco, sin aviso — Alto

- **Pasos:** en Análisis, elegir el preset "Personalizado" → borrar el contenido del primer campo de
  fecha (dejarlo vacío, sin escribir otra fecha).
- **Esperado:** o no pasa nada hasta que se complete una fecha válida, o se muestra algún estado de
  "elegí un rango" — cualquier cosa menos una pantalla rota.
- **Obtenido:** la pantalla completa queda en blanco al instante (el `<body>` pasa a tener 0 caracteres
  de contenido), sin ningún mensaje. En la consola del navegador queda un error no capturado:
  `Invalid time value`. **Recargar la página la recupera** (Análisis no persiste el período en la URL,
  así que vuelve al ciclo actual) — no hace falta cerrar sesión ni nada más drástico, pero en el momento
  no hay forma de saber eso.
- **Por qué:** `comparisonRange` (`period.ts:108-113`) llama a `format()` sobre una fecha inválida dentro
  de un `useMemo` que corre en cada render mientras `period.from === ''`; la excepción no tiene ningún
  `try/catch` ni error boundary que la contenga (no se encontró ningún error boundary en `src`), así que
  React descarta el árbol entero.

### AN-04 · A 320px, la tabla de promedio mensual queda ilegible — Medio

- **Pasos:** abrir Análisis a 320px de ancho (sin scroll horizontal — eso funciona bien) → bajar hasta
  "Promedio mensual por categoría".
- **Esperado:** que se lea, aunque sea abreviado — Análisis tiene nombres de categoría potencialmente
  largos (se probó con uno de 60 caracteres, que en el resto de la pantalla sí se corta con ellipsis
  correctamente).
- **Obtenido:** el encabezado de la tabla se superpone ("CATEGORÍA" y "PROMEDIO" quedan pegados,
  ilegibles como "CATEGORÍAOMEDIO" en la captura), y cada fila deja apenas un punto de color y una letra
  suelta donde debería ir el nombre de la categoría — las tres columnas de importe (`$ promedio`, `$
  septiembre`, `%` desvío) no ceden espacio. El resto de la pantalla a este ancho (hero, donut, leyenda,
  Fijo vs. variable, Top categorías) se ve bien, sin superposición.
- **Por qué (por lectura de código):** las columnas de importe tienen anchos mínimos fijos que en
  conjunto dejan sólo ~20px libres para el nombre en una fila de ~264px útiles (`Analisis.tsx` alrededor
  de las líneas 425-502, ver el mapa de columnas de la sección "Promedio mensual").

### AN-05 · Con ciclo quincenal o semanal, "Ingresos" y "Neto" muestran el mes calendario completo — Alto

- **Pasos:** cambiar el ciclo de la cuenta de QA a quincenal → abrir Análisis en la quincena 16–30 de
  septiembre (preset "Mes") → comparar "Ingresos" contra el ingreso real de esos 15 días.
- **Esperado:** "Ingresos" del período elegido — es lo que dice el propio encabezado ("Gastaste en
  16–30 sep 2026").
- **Obtenido:** "Ingresos" mostró **$2.079.000,50**. Se confirmó por SQL que `rpc_monthly_series` da
  exactamente el mismo `total_income` ($2.079.000,50) tanto si se le pasa el mes completo
  (`2026-09-01`–`2026-09-30`) como si se le pasa sólo la segunda quincena (`2026-09-16`–`2026-09-30`) —
  la función ignora el rango recibido y agrupa por mes calendario. "Neto" (Ingresos − Gastos) queda
  inflado en la misma proporción: con el gasto real de la quincena ($285.111,00) y el ingreso de **todo
  el mes**, dio +$1.793.889,50 — un número que no representa ningún período real. Se reprodujo también
  en semanal (semana 21–27 sep): mismo $2.079.000,50 de "Ingresos", el del mes entero.
- **Por qué:** `rpc_monthly_series` (`20260806230001_balance_adjustments.sql:29-66`) agrupa por
  `date_trunc('month', occurred_on)`, así que cualquier fila del mes cae en el mismo bucket sin importar
  si su fecha está dentro del rango `p_from`/`p_to` pedido — el filtro de fecha no acota el ingreso a
  los días elegidos, sólo decide qué meses calendario tocar.
- **Nota:** el comentario del propio código (`Analisis.tsx:165-169`) ya avisa que esto es intencional
  ("el gráfico se queda mensual a propósito") para la serie de ingresos como gráfico de tendencia — pero
  acá no se usa como gráfico: el mismo número alimenta directamente la cifra "Ingresos" del hero, que sí
  se lee como el ingreso del período elegido.

### AN-06 · "Promedio mensual por categoría" ignora el período elegido — Medio

**Afecta:** el resto de los paneles de la misma pantalla (no cierran entre sí).

- **Pasos:** con el ciclo quincenal del caso anterior, comparar la columna "SEPTIEMBRE" de la tabla de
  promedio contra el donut, para la misma categoría.
- **Esperado:** que la columna del mes actual hable del mismo período que el resto de la pantalla — el
  encabezado de la sección no dice "mes calendario", dice el nombre del mes elegido.
- **Obtenido:** para "Supermercado", el promedio mostró "SEPTIEMBRE $252.390,10" (el mes completo, once
  días fuera del rango incluidos), mientras el donut de esa misma carga de página, para la quincena
  16–30, mostraba Supermercado en **$6.500,00** — una diferencia de 39 veces para la "misma" categoría
  en la "misma" pantalla.
- **Por qué:** `useCategoryMonthlySeries(period.anchor)` (`analytics/api.ts:139`) arma sus 12 puntos
  siempre con `v_spend_by_category` del mes calendario completo del ancla, sin mirar `range.from`/`.to`
  — es el mismo mecanismo de AN-05, aplicado a una tabla en vez de a una cifra suelta.

### AN-07 · Con Análisis abierto, un movimiento nuevo deja "Top categorías" y "Promedio mensual" viejos — Medio

- **Pasos:** en mobile, con Análisis abierto (sin navegar a otra pantalla), tocar el `+` → cargar un
  gasto de $5.000 en "Supermercado" (una categoría que ya aparece en el donut, el Top y el promedio) →
  Guardar, sin recargar la página.
- **Esperado:** los seis paneles de Análisis, que muestran el mismo período, deberían actualizarse juntos
  o quedar todos desactualizados juntos — no una mezcla.
- **Obtenido:** el hero, el donut y "Fijo vs. variable" se actualizaron al instante: Supermercado pasó de
  $252.390,10 (44 %) a **$257.390,10 (45 %)**, "Decidiste vos" subió en los mismos $5.000. **"Top
  categorías vs. período anterior" y "Promedio mensual por categoría" se quedaron exactos en
  $252.390,10**, sin el gasto recién cargado — verificado con el texto completo de la pantalla antes y
  después, sin ningún otro cambio en esas dos secciones.
- **Por qué:** `TRANSACTION_QUERY_KEYS` (`transactions/queryKeys.ts:9-22`), lo que se invalida al crear
  un movimiento, incluye `transactions` y `spend-by-category` pero no `top-categories-comparison` ni
  `category-monthly-series` — las dos queries detrás de esos paneles.

### AN-08 · El drill-down a "Sin categoría" trae ingresos y ajustes que Análisis excluye de ese total — Medio

**Afecta:** Movimientos (la lista que se abre).

- **Pasos:** en el donut, click en la leyenda "Sin categoría" (mes de septiembre, $55.000,00 en
  Análisis) → mirar el filtro que se aplica en Movimientos.
- **Esperado:** que el total de "Sin categoría" en Movimientos, con el filtro recién aplicado, sea
  $55.000,00 — el mismo número del que se vino.
- **Obtenido:** Movimientos abrió con el chip "Sin categoría ✕" y **7 movimientos**, mezclando gastos sin
  categoría ($55.000,00, lo que sí correspondía), **ingresos sin categoría** (ej. "Sueldo septiembre"
  +$1.950.000,00, "Venta bici" +$120.000,50) y **ajustes de saldo sin categoría** ("Saldo al dejar de
  usar Cuentas") — ninguno de los cuales cuenta en el $55.000,00 de Análisis. El total de "Sin categoría"
  en Movimientos, para quien mira esa lista, no tiene forma de coincidir con el número del que vino.
- **Por qué:** el filtro de Movimientos por "Sin categoría" es `category_id is null`
  (`transactions/api.ts:61-62`), sin filtrar por `type = 'expense'` ni por `not is_adjustment` — los dos
  filtros que sí tiene la rama "Sin categoría" de `v_spend_by_category`
  (`spend_by_category_uncategorized.sql:33-39`).
- **Nota:** el drill-down a una categoría real (se probó con "Supermercado") no tiene este problema: filtra
  limpio y sólo trae los 3 movimientos de esa categoría.

### AN-09 · Un error de red en Ingresos se ve como $0 real y deja "Neto" en negativo falso — Alto

- **Pasos:** cortar por red la llamada a `rpc_monthly_series` (`route.abort()`) → abrir Análisis.
- **Esperado:** algún aviso de que esa cifra no pudo cargar — es dinero, y "Neto" se calcula con ella.
- **Obtenido:** "Ingresos" mostró **$0,00**, con la misma tipografía y confianza que un valor real, y
  "Neto" pasó de +$1.509.499,40 a **−$569.501,10** (negativo) — como si el mes hubiera sido una pérdida
  real de más de medio millón, cuando en realidad el ingreso simplemente no cargó. Nada en la pantalla
  avisa del error: sin esqueleto, sin ícono, sin mensaje. Para comparar: cortar la fuente principal
  (`v_spend_by_category`, la del gasto) sí muestra correctamente "No se pudo cargar" con un botón
  "Reintentar" — tarda unos segundos por los reintentos automáticos de React Query, pero funciona.
- **Por qué:** `incomeCents` se calcula como `(incomeSeriesQuery.data ?? []).reduce(...)`
  (`Analisis.tsx:178`) — con la query en error, `data` es `undefined` y el `??[]` lo convierte en $0
  silencioso; nada en el componente mira `incomeSeriesQuery.isError`. La pantalla completa de error sólo
  depende de `spendQuery.isError` (`Analisis.tsx:252`).

---

### AN-10 · El tope de 1000 filas hace que "Fijo vs. variable" cuente menos gasto real que el hero, sin aviso — Alto

- **Pasos:** cargar, por API con la sesión de QA (sesión autenticada, mismo efecto que cargar 1050
  movimientos uno por uno desde la UI), 1.050 gastos de $1,00 marcados `QA-AN2-CAP`, fechados entre el
  1 y el 21 de septiembre (50 por día) → abrir Análisis en septiembre (preset "Este mes").
- **Esperado:** que "Fijo vs. variable" sume exactamente lo mismo que el hero para el mismo período —
  los dos hablan del mismo "total gastado en septiembre".
- **Obtenido:** con 1.064 gastos reales+de prueba en el mes (confirmado por SQL: `count(*) = 1064`,
  `sum(amount) = $3.585.410,75` sin excluir el ajuste de saldo del período), el hero mostró
  **$570.551,10** — el total correcto, sin recorte, porque `v_spend_by_category` es un RPC agregado en
  la base, no una lista de filas con `LIMIT`. "Fijo vs. variable" (comprometido + variable) sumó
  **$570.487,10** — exactamente **$64,00 menos**. Se confirmó por SQL que el corte es preciso: pedir
  las mismas filas ordenadas `occurred_on desc, created_at desc` con `LIMIT 1000` (la query real de
  `useTransactions`) trae sólo 1.000 de las 1.064, y las 64 que faltan son justo los 64 gastos de
  prueba fechados el 1 de septiembre (el día más viejo del rango de prueba, el primero en quedar
  afuera con ese orden) — $64,00 exactos, uno por fila. El hero, el donut y el Top no tienen este
  problema porque ninguno pasa por `useTransactions`.
- **Por qué:** `TRANSACTIONS_ROW_LIMIT = 1000` (`transactions/api.ts:30`) es un tope explícito de
  PostgREST, documentado en el propio código como intencional para evitar el corte silencioso por
  defecto de PostgREST — pero nada en Análisis avisa cuando ese tope SÍ se alcanza. Con un uso real
  (varios movimientos por día, tarjetas con muchas compras chicas, etc.) 1000 filas en un mes es
  alcanzable, y a partir de ahí "Fijo vs. variable" queda mal contado sin ningún indicio visual.
- **Nota de limpieza:** las 1.050 filas de prueba se borraron por completo al terminar (verificado por
  SQL, `count = 0` con la marca `QA-AN2-CAP`) — ver "Estado de la cuenta de QA al cerrar".

### AN-11 · El marcador del período anterior en el Top queda invisible cuando el período anterior es el máximo — Bajo

- **Pasos:** crear un gasto de $900.000,00 en "Transporte" en agosto (período de comparación), sin
  gasto comparable en septiembre en esa categoría (Transporte en septiembre ya tenía $38.500,00) → abrir
  "Top categorías vs. período anterior" y mirar la fila de Transporte.
- **Esperado:** una marca vertical de 2px visible dentro de la barra, en la posición proporcional del
  período anterior (`TopCategoriesComparison.tsx:37`) — aunque sea en el borde derecho.
- **Obtenido:** confirmado por medición de layout (Playwright, `boundingClientRect`): el contenedor de
  la barra midió 330,39px de ancho; con el gasto de agosto siendo el máximo absoluto de las 6 categorías
  (current y previous de todas), `prevPct` da exactamente 100%, así que el marcador se posiciona con
  `left: 100%` — su caja completa (330,39px a 332,39px) queda 100% por fuera del contenedor. Con
  `overflow-hidden` en el contenedor (línea 35), el marcador se recorta por completo: 0 píxeles
  visibles, no hay ninguna marca que ver en esa fila.
- **Por qué:** `prevPct = Math.min((c.previousCents / maxCents) * 100, 100)` nunca supera 100 porque
  `maxCents` ya incluye `previousCents` en su cálculo (`TopCategoriesComparison.tsx:12,18`) — pero el
  marcador es un elemento de 2px posicionado con `left`, no con `right` ni `transform: translateX(-50%)`,
  así que en el 100% exacto su ancho entero cae fuera del contenedor en vez de quedar centrado o
  contenido en el borde.
- **Nota de limpieza:** el gasto de prueba se borró al terminar (marca `QA-AN2-MARKER`, verificado por
  SQL).

### AN-12 · Un error de red en el total del período anterior se ve como "$0,00 en agosto" real, sin aviso — Alto

- **Pasos:** cortar por red específicamente las llamadas a `v_spend_by_category` con `p_from:
  "2026-08-01"` (el período anterior de agosto — usado por `usePreviousPeriodTotal`,
  `useTopCategoriesComparison` y `useCategoryMonthlySeries` a la vez) → abrir Análisis en septiembre.
- **Esperado:** algún aviso de que esa cifra no cargó — es la que arma el "$X más/menos que en agosto"
  del hero.
- **Obtenido:** el hero mostró el total actual correcto ($569.501,10, sin badge de % porque
  `changePct` da `null` cuando `prevTotalCents <= 0`) y el texto de abajo dijo **"$569.501,10 más que
  en agosto ($0,00)"** — como si en agosto real, verificable, no se hubiera gastado un centavo. Nada en
  el hero avisa del error. En contraste, en la misma carga de página, "Promedio mensual por categoría" y
  "Top categorías vs. período anterior" (que dependen de la MISMA llamada bloqueada) sí mostraron
  correctamente "No se pudo cargar" con botón "Reintentar" — la diferencia es sólo el hero.
- **Por qué:** `prevTotalCents = prevTotalQuery.data ?? 0` (`Analisis.tsx:180`) — igual que `incomeCents`
  en AN-09, nada en el componente mira `usePreviousPeriodTotal(...).isError`. A diferencia de AN-09,
  acá no se rompe "Neto" (esa cifra no usa `prevTotalCents`), pero sí el badge (desaparece, en vez de
  mostrar un estado de error) y el texto de comparación, que queda leyéndose como un dato real.
- **Corrección a lo que se sospechaba en la 1.ª pasada:** el mismo experimento mostró que
  `top-categories-comparison` y `category-monthly-series` (la tabla de promedio) SÍ manejan bien su
  error — cada uno tiene su propio `isError` con `ErrorState`/"Reintentar" (`Analisis.tsx:430-431` y
  `:542-543`). El patrón silencioso de AN-09 es específico de `incomeSeriesQuery` (AN-09) y
  `prevTotalQuery` (este), no generalizado a "todo lo que no es `spendQuery`" como se sospechaba.

### AN-13 · Un error de red en los ids de cuotas comprometidas no avisa nada en "Fijo vs. variable" — Medio

- **Pasos:** cortar por red todas las llamadas a `credit_purchase_payments` → abrir Análisis.
- **Esperado:** algún aviso — esa lista decide si una cuota de una compra en cuotas cuenta como
  "Ya estaba comprometido" o como "Decidiste vos".
- **Obtenido:** con la llamada completamente rota (tres intentos, los tres fallados), "Fijo vs.
  variable" se vio idéntico a una carga exitosa: $65.111,00 comprometido + $504.390,10 variable, sin
  ningún esqueleto, ícono ni mensaje de error. En la cuenta de QA en este momento no hay compras en
  cuotas (`credit_purchases` = 0 filas, confirmado por SQL), así que acá el error no cambió ningún
  número — pero el código no tiene ninguna protección para cuando sí las haya.
- **Por qué:** `const { data: committedPurchaseIds } = useCommittedPurchaseTransactionIds()`
  (`Analisis.tsx:163`) no mira `.isError` en ningún lado del componente. Con la query en error,
  `committedPurchaseIds` es `undefined`, y `summarizeFijoVsVariable(transactions ?? [],
  committedPurchaseIds ?? new Set())` (`Analisis.tsx:190`) usa un `Set` vacío — en una cuenta CON
  compras en cuotas, cualquier cuota que no tenga `fixed_expense_payment_id` ni sea
  `is_credit_card_payment` (`aggregate.ts:38-39`) pasaría de "Ya estaba comprometido" a "Decidiste
  vos" sin ningún aviso, el mismo patrón silencioso que AN-09/AN-12 pero reclasificando plata en vez
  de mostrar $0.
- **Nota:** no se pudo demostrar el efecto numérico en vivo por falta de datos de cuotas en la cuenta de
  QA en este momento (cargar una tarjeta + una compra en cuotas + un pago para este caso puntual se
  consideró desproporcionado para esta pasada) — la severidad "Medio" en vez de "Alto" refleja eso: el
  bug está confirmado por código y por la ausencia de cualquier aviso en vivo, pero no se vio mover
  ningún número real todavía.

### AN-14 · El período elegido en Análisis se resetea al volver del drill-down o al recargar la página — Medio

**Afecta:** Movimientos (el flujo de ida y vuelta entre las dos pantallas).

- **Pasos (recargar):** cambiar el período a un mes distinto al actual (ej. avanzar 2 ciclos con las
  flechas) → recargar la página (F5).
- **Obtenido:** tras avanzar de septiembre a noviembre 2026, F5 volvió a mostrar **septiembre 2026** (el
  ciclo actual), no noviembre.
- **Pasos (volver del drill-down):** con el período en octubre 2026 (distinto al actual), hacer click en
  una categoría del donut para ir a Movimientos → volver con el botón atrás del navegador.
- **Obtenido:** Movimientos abrió correctamente filtrado por octubre. Al volver, Análisis mostró
  **septiembre 2026** otra vez — el período elegido (octubre) se perdió, quedó como si nunca se hubiera
  navegado.
- **Esperado:** cualquiera de las dos formas es razonable (persistir el período, o no) pero lo que no
  se espera es que "volver" deshaga silenciosamente una elección explícita del usuario, sin ningún
  aviso de que el período cambió.
- **Por qué:** `const [period, setPeriod] = useState(() => defaultPeriod(cycleConfig))`
  (`Analisis.tsx:142`) vive sólo en el estado local del componente, sin persistir en la URL ni en
  ningún storage — cualquier remount de `Analisis` (recarga completa, o volver por History API a la
  misma ruta) reinicia `period` a `defaultPeriod`, el ciclo que contiene "hoy".

### AN-15 · Las flechas de "Mes" navegan sin tope a ciclos futuros vacíos — Bajo

- **Pasos:** con el preset "Este mes", hacer click 15 veces seguidas en "Mes siguiente".
- **Obtenido:** la pantalla llegó a **diciembre de 2027** (15 meses en el futuro) sin ningún tope,
  mostrando correctamente el estado vacío ("No hay gastos en este período · Probá con un rango más
  amplio") — no se rompe nada, pero tampoco hay ningún límite que impida seguir navegando indefinidamente
  a ciclos sin sentido. Volver con "Mes anterior" 5 veces llevó de forma consistente a julio de 2027.
- **Esperado:** no es un bug funcional (el estado vacío se ve bien), pero vale la pena que Leandro decida
  si quiere un tope — es fácil terminar varios años en el futuro por error, sin ninguna señal de "esto ya
  no tiene más datos posibles, volvé".
- **Por qué:** `shiftPeriodMonth` (`period.ts:77-88`) no tiene ningún límite superior ni inferior — a
  diferencia de, por ejemplo, un rango acotado al primer/último movimiento cargado.

### AN-16 · Una semana que cruza dos meses agrava AN-05/AN-06: "Ingresos"/"Neto" suman los DOS meses calendario completos — Alto

- **Pasos:** cambiar el ciclo de la cuenta de QA a semanal → cargar un ingreso de prueba de
  $500.000,00 el 2 de octubre (marca `QA-AN2-CROSSMONTH`) → abrir Análisis en la semana del 28 de
  septiembre al 4 de octubre de 2026 (7 días, 3 en septiembre + 4 en octubre).
- **Esperado:** "Ingresos" de esos 7 días reales — el ingreso de prueba ($500.000,00) más cualquier
  ingreso real de esos días concretos (ninguno, confirmado por SQL antes de la prueba).
- **Obtenido:** "Ingresos" mostró **$2.579.000,50** — exactamente $2.079.000,50 (el ingreso de TODO
  septiembre, el mismo número de AN-05) **más** $500.000,00 (el ingreso de TODO octubre, que sólo tenía
  el movimiento de prueba) sumados entre sí. "Neto" quedó en **+$2.522.000,50**, más de 5 veces el
  ingreso real de la semana. El caso de AN-05 (una quincena o semana dentro de un solo mes) ya mostraba
  el mes equivocado; una semana que cruza el límite de mes es peor: en vez de un mes incorrecto, suma
  DOS meses completos.
- **Por qué:** `rpc_monthly_series` (`20260806230001_balance_adjustments.sql:34-36`) genera un bucket
  por cada mes calendario entre `date_trunc('month', p_from)` y `date_trunc('month', p_to)` — con
  `p_from` en septiembre y `p_to` en octubre, genera DOS filas (septiembre y octubre), cada una con el
  total de SU mes completo. `Analisis.tsx:178` sencillamente suma `.reduce()` sobre todas las filas
  devueltas, así que termina sumando los dos meses enteros en vez de acotar a los 7 días reales.
- **Nota de limpieza:** el ingreso de prueba se borró al terminar (marca `QA-AN2-CROSSMONTH`, verificado
  por SQL) y el ciclo volvió a mensual.

### AN-17 · El badge de % y el texto de comparación parecen contradecirse cuando el período y su comparación tienen distinta cantidad de días — Medio

- **Pasos:** con el ciclo de la cuenta de QA en quincenal, cargar un gasto de $14.000,00 sin categoría
  el 20 de octubre (marca `QA-AN2-MISMATCH`, la quincena 16–31 de octubre tiene 16 días) → abrir
  Análisis en esa quincena, cuya comparación es la quincena 1–15 de octubre (15 días, con $7.000,00 de
  gasto real de esos días).
- **Esperado:** que el badge de % y el texto de abajo, leídos juntos, no parezcan decir cosas distintas
  para la misma comparación.
- **Obtenido:** el hero mostró "$14.000,00" con el badge **"+87,5%"**, y el texto debajo dijo
  **"$7.000,00 más que en el período anterior ($7.000,00)"**. Alguien que mire sólo el texto —
  $14.000 contra $7.000 — va a calcular mentalmente "el doble, +100%", pero el badge dice +87,5%. Los
  dos números son matemáticamente correctos por separado ($14.000/16 días = $875/día vs. $7.000/15 días
  = $466,67/día → +87,5% es el cambio real por día), pero nada en la pantalla explica que el badge usa
  promedio diario mientras el texto muestra montos totales — la 1.ª pasada no vio este caso porque los
  dos períodos probados entonces tenían la misma cantidad de días exactos, donde promedio diario y total
  crudo dan el mismo %.
- **Por qué:** es la consecuencia visible, ya prevista por el comentario del propio código
  (`Analisis.tsx:183-186`), de comparar por promedio diario cuando los períodos tienen distinto largo —
  correcto en el cálculo, pero sin ningún indicio textual ("por día") que explique la diferencia al
  lado del badge.
- **Nota de limpieza:** el gasto de prueba se borró al terminar (marca `QA-AN2-MISMATCH`, verificado por
  SQL) y el ciclo volvió a mensual.

---

## Lo verificado correcto

- **El donut de Análisis coincide con el de Hoy**, mismo período: mismas categorías, mismos montos y
  mismos porcentajes (93 % / 3 % / 2 % / 1 % en el caso probado, con la categoría de nombre largo
  dominando por el monto de prueba de $9.999.999,99).
- **Una categoría archivada sigue contando en Análisis** exactamente igual que una activa — no
  desaparece ni se marca de otra forma (no es lo mismo que AN-02: acá el total no se rompe, sólo no hay
  ninguna señal de que la categoría está archivada).
- **Sin scroll horizontal a 320px** en ninguna sección de Análisis (se midió `scrollWidth − innerWidth`
  = 0), y sin superposición fuera de la tabla de promedio (AN-04).
- **Los totales de "qué entra"** cerraron al centavo contra la base en los casos probados: un gasto
  compartido (sólo "mi parte" cuenta), un "Descontado" (cuenta como gasto), una compra suelta en cuotas
  pagada (cuenta por el importe de la cuota, no el total de la compra), una tarjeta con una compra
  pagada (cuenta, con la categoría precargada de la tarjeta) y un gasto con fecha futura dentro del
  ciclo (cuenta ya, sin ninguna marca de "futuro" — mismo comportamiento que Hoy).
- **La transferencia entre cuentas no aparece en ningún lado de Análisis** (ni en el hero, ni en el
  donut, ni en Fijo vs. variable) — el diseño de tabla separada (`account_transfers`) cumple lo que
  dice su propio comentario.
- **Planes:** en Básico, `/analisis` redirige a `/hoy` y la sección no aparece ni en la nav de escritorio
  ni en el drawer mobile. En Test, Análisis se ve completo (mismos seis paneles que en Premium, sin
  ningún `useCan` que lo recorte) tanto en la nav de escritorio como en el drawer mobile ("Secciones"
  con sólo "Análisis", sin Mis Deudas/Ahorros/Me Deben — coherente con lo que Test no tiene).
- **El badge de % y el texto de comparación no se contradijeron** en los dos ciclos cortos probados
  (quincenal 16–30 y semanal 21–27): en ambos casos el período actual y el anterior tenían la misma
  cantidad de días, así que el cálculo por promedio diario (badge) y por total crudo (texto) dieron el
  mismo resultado. La sospecha de que se contradicen queda para una quincena o semana de distinto largo
  que su comparación (no probada esta pasada).
- **El drill-down a una categoría real** (se probó con "Supermercado") filtra limpio en Movimientos, con
  el total exacto de esa categoría — el problema es específico de "Sin categoría" (AN-08).
- **El error de red de la fuente principal** (`v_spend_by_category`) sí muestra "No se pudo cargar" con
  un botón "Reintentar" — tarda varios segundos por los reintentos automáticos de React Query, pero
  llega a mostrarse. El problema es sólo en las fuentes secundarias (AN-09).
- **Modo oscuro**, recorrido en la pantalla completa: sin problemas de contraste, colores distintos y
  legibles entre categorías, sin nada que sólo se rompa con ese tema.

**De la 2.ª pasada:**

- **Seguridad por API confirmada por RLS**, no sólo por el cliente: con el JWT de la cuenta de QA
  contra PostgREST directo (sin pasar por la app), pedir `transactions` filtrando por el `user_id` de la
  cuenta de prueba habitual devolvió `[]`; pedir sin filtro devolvió sólo filas propias; e intentar un
  `INSERT` de una transacción con el `user_id` de la otra cuenta devolvió `403` ("new row violates row
  level security policy"). Los RPC de Análisis (`v_spend_by_category`, `rpc_monthly_series`) filtran
  internamente por `auth.uid()` sin recibir ningún id de usuario como parámetro, así que no hay forma de
  pedirle a uno los datos de otra cuenta ni siquiera intentándolo.
- **El mapeo de preset del drill-down funciona como se esperaba**: desde el preset "Este mes" (mes
  calendario completo), el click en una categoría abre Movimientos con preset "Mes" y las flechas de
  navegación habilitadas (confirmado: el botón "Mes siguiente" está presente, no disabled, y navega).
  Desde "Últimos 3 meses" (rango que no es un mes calendario), abre con preset "Personalizado" y el chip
  de fecha "1 jul – 30 sep ✕" en vez de flechas — exactamente la regla que describe el comentario de
  `movementPeriodFromRange` (`transactions/movementPeriod.ts`).
- **El ojo de "ocultar saldo" no afecta a Análisis, confirmado en vivo**: se activó desde Hoy
  (`localStorage["hidden-balance:saldo-actual"] = "1"`) y, en la misma sesión, Análisis siguió mostrando
  todas las cifras (hero, donut, Fijo vs. variable) sin ocultar nada — coincide con que el componente no
  importa `useHiddenBalance` en ningún lado. No es un bug (nada se rompe), pero es una inconsistencia de
  producto: es la pantalla con más detalle de gasto por categoría y es la única de las que muestran plata
  que no respeta esa preferencia.
- **Las flechas de "Mes" no rompen nada al navegar muy lejos** en el futuro (ver AN-15 para el matiz de
  que no tienen tope) — a los 15 meses de "Mes siguiente" seguido, la pantalla mostró correctamente el
  estado vacío, sin crash ni layout roto.
- **`top-categories-comparison` y `category-monthly-series`** (la tabla de promedio mensual) SÍ manejan
  bien sus propios errores de red, con `isError`/`ErrorState`/"Reintentar" cada una — a diferencia de lo
  que se sospechaba en la 1.ª pasada, el patrón silencioso de AN-09 no es general a "todo lo que no es
  `spendQuery`": es específico de `incomeSeriesQuery` (AN-09) y `usePreviousPeriodTotal` (AN-12), que son
  las dos fuentes que de verdad no tienen ningún `isError` mirado en `Analisis.tsx`. Ver AN-12 y AN-13
  para el detalle completo.

## Quedó afuera

- **El efecto numérico de AN-13** (error de red en las cuotas comprometidas reclasificando plata real de
  "comprometido" a "variable") no se pudo demostrar en vivo: la cuenta de QA no tiene compras en cuotas
  cargadas en este momento (`credit_purchases` = 0), y armar ese escenario (tarjeta + compra en cuotas +
  pago) se consideró desproporcionado para esta pasada. El bug en sí (ausencia total de `isError`) está
  confirmado por código y por la falta de cualquier aviso en vivo con la llamada rota — sólo falta ver el
  número moverse.
- **Variantes adicionales** de los casos ya cubiertos (por ejemplo, una semana que cruza el límite de un
  año, o una quincena de distinto largo con el ciclo semanal en vez de quincenal) no se probaron — se
  consideraron cubiertas en esencia por AN-16 y AN-17, que ya muestran el mecanismo con números exactos.

## Estado de la cuenta de QA al cerrar

La foto final por SQL de sólo lectura coincide exacta con la inicial: Premium, ciclo mensual, semana
desde el lunes; 22 movimientos (mismos totales por tipo); 2 ajustes; 9 categorías (7 gasto + 2 ingreso),
ninguna archivada; `rpc_current_balance()` = $1.426.889,00; 2 cuentas activas; 9 fijos (8 activos); 0
tarjetas de crédito; 0 compras a crédito; 1 deuda ("Préstamo test QA", la preexistente). Todo lo cargado
en esta pasada (marcado `QA-AN`: 4 categorías, ~29 movimientos, 1 tarjeta con su compra, 2 compras
sueltas, 1 transferencia, 1 deuda con su pago, más el guardado y el pago de fijo usados para el caso de
"guardado con movimiento", más dos movimientos de prueba sueltos de la verificación de caché) se borró y
se verificó por SQL que no queda ningún resto — incluida una transacción de "Descontado" generada por la
propia RPC de deudas, que no tenía la marca `QA-AN` en su descripción y se encontró y borró aparte. Las
dos categorías tocadas en vivo (una archivada, otra pasada a Ingreso) volvieron a su estado original
antes de borrarlas. El plan se cambió por SQL directo a Básico y a Test para verificar la nav y el
drawer, y el ciclo a quincenal y semanal para los casos de AN-05/AN-06 — ambos se devolvieron a Premium
y mensual (semana desde el lunes) al terminar cada bloque, verificado por SQL.

### 2.ª pasada (mismo día)

Foto de referencia tomada por SQL antes de arrancar: plan Premium, ciclo mensual (semana desde el
lunes), 22 movimientos, 9 categorías, 2 cuentas, 9 fijos, 0 tarjetas, 0 compras en cuotas, 1 fila en
`receivables` — idéntica a la foto de cierre de la 1.ª pasada, confirmando que no quedó nada pendiente
entre medio.

Lo cargado en esta pasada, todo marcado `QA-AN2` (con sufijo por caso: `-CAP`, `-MARKER`,
`-MISMATCH`, `-CROSSMONTH`) para poder encontrarlo y borrarlo sin ambigüedad:

- **AN-10 (tope de 1000 filas):** 1.050 gastos de $1,00 (`QA-AN2-CAP`), cargados y borrados por API REST
  directa con el JWT de la cuenta de QA (no por la UI, por volumen) — verificado por SQL que las 1.050
  filas quedaron insertadas antes de la prueba y en 0 después de borrarlas.
- **AN-11 (marcador invisible):** 1 gasto de $900.000,00 en Transporte, fechado en agosto (`QA-AN2-MARKER`)
  — borrado al terminar.
- **AN-16 (semana cruza dos meses):** 1 ingreso de $500.000,00 el 2 de octubre (`QA-AN2-CROSSMONTH`) —
  borrado al terminar, ciclo devuelto de semanal a mensual.
- **AN-17 (quincena de distinto largo):** 1 gasto de $14.000,00 el 20 de octubre (`QA-AN2-MISMATCH`) —
  borrado al terminar, ciclo devuelto de quincenal a mensual.

Para la seguridad por API (ver "Lo verificado correcto") se usó también la cuenta de prueba habitual,
sólo en modo lectura (un `GET` filtrado por su `user_id` con
el token de QA, que devolvió vacío) y un único intento de escritura cruzada (un `INSERT` con su
`user_id` usando el token de QA, rechazado con 403 y sin llegar a crear ninguna fila) — no se leyó ni se
modificó ningún dato real de esa cuenta.

Foto final por SQL, tras borrar todo lo de arriba y devolver `cycle_kind` a `monthly`: plan Premium,
ciclo mensual, 22 movimientos, 9 categorías, 2 cuentas, 9 fijos, 0 tarjetas, 0 compras en cuotas, 1 fila
en `receivables` — coincide exacto con la foto de referencia del arranque de esta pasada. `0` filas con
descripción `like 'QA-AN2%'` verificado por SQL como paso final.
