# QA de Análisis

- **Fecha:** 2026-09-23, hora Argentina.
- **Código:** rama `accounts`, commit `eeeab9b`. Sin migraciones pendientes (`supabase migration list
  --linked`, 88/88 aplicadas).
- **Planes:** Premium, Básico y Test.
- **Ciclos:** mensual, quincenal (16–30 sep) y semanal (21–27 sep).
- **Pasada:** 1.ª, en dos bloques el mismo día.

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
| AN-06 | Medio | Abierto | "Promedio mensual por categoría" ignora el período elegido: en una quincena/semana no cierra con el donut de la misma pantalla | — |
| AN-07 | Medio | Abierto | Con Análisis abierto, un movimiento nuevo actualiza el donut pero deja "Top categorías" y "Promedio mensual" viejos | — |
| AN-08 | Medio | Abierto | El drill-down a "Sin categoría" trae ingresos y ajustes que Análisis excluye de ese total | Movimientos |
| AN-04 | Medio | Abierto | A 320px, la tabla de promedio mensual queda ilegible (encabezados superpuestos, nombres cortados) | — |

Sev. = severidad (Crítico / Alto / Medio / Bajo).

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

## Quedó afuera

- **El tope de 1000 filas** de `useTransactions` (`transactions/api.ts:30`) sobre "Fijo vs. variable" no
  se llegó a probar con el volumen preparado para eso.
- **El marcador del período anterior** en el Top, cuando el período anterior es el máximo (sospecha de
  recorte por `overflow-hidden`, `TopCategoriesComparison.tsx:35-37`).
- **El mapeo de preset del drill-down** (mes calendario → "Mes" con flechas activas en Movimientos,
  cualquier otro rango → "Personalizado") no se verificó en detalle — sólo que el filtro por categoría
  en sí funciona.
- **El ojo ("ocultar saldo")** no se probó en vivo sobre Análisis — por lectura de código, la pantalla no
  usa `useHiddenBalance` en ningún lado.
- **Errores de red** de `previous-period-total`, `top-categories-comparison` y los ids de cuotas
  comprometidas (para Fijo vs. variable) no se probaron individualmente — sólo Ingresos (AN-09). Por la
  misma causa raíz (nada mira `isError` salvo `spendQuery`), es esperable que se comporten igual.
- **Seguridad por API** contra la cuenta de prueba habitual: no se probó esta vez.
- **Las flechas de "Mes"** sin tope hacia ciclos futuros vacíos, y que el período elegido se resetea al
  volver del drill-down o al recargar (ambos por lectura de código, no reproducidos en vivo).
- **Una quincena o semana de distinto largo que su período de comparación** (para el posible
  contradecirse badge/texto) y **una semana que cruza dos meses** (para ver si AN-05/AN-06 se agravan o
  cambian de forma) no se probaron.

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
