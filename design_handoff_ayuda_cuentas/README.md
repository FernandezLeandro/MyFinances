# Handoff: Pantalla de Ayuda de Cuentas (MyFinances)

## Overview

Nueva pantalla de ayuda para la sección **Cuentas** de MyFinances. Explica al usuario final qué es una cuenta, cómo se compone su saldo, qué hace cada acción del menú de una cuenta y cómo resolver las dudas más frecuentes.

Se accede desde un botón **Ayuda** que se agrega en el encabezado de la pantalla Cuentas. La ayuda es una **pantalla propia con su propia ruta**, no un modal: se puede compartir por link, buscar con Ctrl+F y se vuelve con la miga de pan / back del navegador sin perder contexto.

Repo de destino: `FernandezLeandro/MyFinances`, rama `accounts` (la lógica de Cuentas vive ahí, no en `main`).

## About the Design Files

Los archivos de este bundle son **referencias de diseño hechas en HTML** — prototipos que muestran el aspecto y el contenido previstos, **no código de producción para copiar tal cual**.

La tarea es **recrear este diseño dentro del entorno existente del repo** (React + TypeScript, con los patrones, componentes y estilos ya establecidos en `src/`), usando sus convenciones de routing, tipografía y tokens de color. Nada del HTML de referencia debe copiarse literalmente; sólo su estructura, jerarquía, copy y valores visuales.

El archivo `Ayuda Cuentas.dc.html` usa un runtime propio del entorno de diseño (`support.js`, etiquetas `<x-dc>`, `<sc-if>`). Ignorá ese andamiaje: lo relevante es el markup y los estilos inline de cada sección. `<sc-if>` marca bloques condicionales que en la app pueden existir siempre (ver más abajo).

## Fidelity

**High-fidelity.** Colores, tipografía, espaciados, radios y copy están definitivos. Recrear la UI con precisión usando los componentes y tokens del codebase; donde el codebase ya tenga un token equivalente al hex listado acá, usar el token.

El copy en español rioplatense es **definitivo y debe usarse verbatim**. No reescribir, no neutralizar el voseo.

---

## Screens / Views

### 1. Pantalla: Ayuda de Cuentas

**Ruta sugerida:** `/cuentas/ayuda` (hija de la ruta de Cuentas, para que el back natural vuelva a Cuentas).

**Purpose:** El usuario lee para entender qué es Cuentas, qué significa cada número de la pantalla y qué hace cada acción antes de ejecutarla.

**Layout general:**
- Fondo de página: `#efeee8`, `min-height: 100vh`.
- Padding de página: `32px 20px 72px`.
- Contenedor central: `max-width: 900px`, `margin: 0 auto`, `display: flex; flex-direction: column; gap: 14px`.
- Las secciones se separan con `margin-top` propio (18px la primera, 22px las siguientes, 30px la última con `border-top`).
- Todo fluido: sin anchos fijos, todas las grillas son `repeat(auto-fit, minmax(Xpx, 1fr))` y colapsan a una columna en mobile.

**Componentes, en orden vertical:**

#### 1.1 Miga de pan
- Fila flex, `gap: 7px`, `font-size: 12.5px`, color `#82848c`.
- Contenido: flecha `←` (13px) + texto `Cuentas`.
- Es el único camino de vuelta; debe navegar a la pantalla Cuentas.

#### 1.2 Encabezado
- Columna flex, `gap: 12px`.
- Eyebrow: texto `Ayuda`, `11.5px`, `letter-spacing: 0.12em`, `text-transform: uppercase`, `font-weight: 600`, color `#82848c`.
- H1: `Cómo usar Cuentas` — Sora 600, `33px`, `letter-spacing: -0.035em`, `line-height: 1`.
- Bajada, `max-width: 620px`, `14px`, `line-height: 1.6`, color `#63656d`, `text-wrap: pretty`:
  > Cuentas es donde declarás dónde está tu plata: efectivo, billeteras virtuales y bancos. Tu saldo en la app es la suma de esas cuentas.

#### 1.3 Sección "Lo básico, en tres pasos"
- H2: Sora 600, `19px`, `letter-spacing: -0.02em`.
- Grid `repeat(auto-fit, minmax(220px, 1fr))`, `gap: 14px`, tres tarjetas.
- Tarjeta: fondo `#fbfaf6`, `border-radius: 18px`, `padding: 22px`, sin borde ni sombra.
  - Badge numérico: círculo `24px`, fondo `#2b3fd6`, texto blanco `12px/600`, centrado con grid.
  - Título: `15px`, `font-weight: 600`, `margin-top: 14px`.
  - Cuerpo: `13px`, `line-height: 1.55`, color `#63656d`, `margin-top: 7px`.

Copy de las tres tarjetas:

| # | Título | Cuerpo |
| --- | --- | --- |
| 1 | Cargá tus cuentas | Una por cada lugar donde tenés plata. Al crearla te preguntamos cuánto tenés hoy ahí. |
| 2 | Elegí la predeterminada | Es la que viene elegida cuando cargás un movimiento nuevo. Es la tarjeta oscura. |
| 3 | Reajustá si no coincide | Si el banco dice otra cosa que la app, abrí **Reajustar saldo** y decí cuánto tenés de verdad. |

En la tarjeta 3, `Reajustar saldo` va en `<strong>` con `font-weight: 600` y color `#16171b`.

#### 1.4 Sección "La pantalla, por partes"

Dos piezas: una **maqueta anotada** de la pantalla Cuentas y, debajo, la **leyenda** de los seis marcadores.

**Maqueta anotada** — contenedor `#fbfaf6`, `border-radius: 18px`, `padding: 20px`, con grid interno `repeat(auto-fit, minmax(210px, 1fr))`, `gap: 12px`:

- **Columna izquierda — tarjeta de total:** fondo `#f0eee6`, `border-radius: 16px`, `padding: 18px`, columna flex `gap: 10px`.
  - Marcador ① + label `TOTAL EN TUS CUENTAS` (`10.5px`, uppercase, `letter-spacing: 0.12em`, `600`, `#82848c`).
  - Monto de ejemplo `$482.350` — Sora 600, `30px`, `letter-spacing: -0.035em`, `font-variant-numeric: tabular-nums`.
  - Marcador ② + barra de composición: fila flex `height: 6px`, `border-radius: 999px`, `overflow: hidden`, `gap: 2px`; segmentos con `flex: 52 / 31 / 17` y colores `#1d8f7e`, `#2f6fb8`, `#b8862a`.
  - Leyenda de la barra: `11px`, `#63656d`, wrap con `gap: 4px 12px` — `Efectivo 52%`, `Galicia 31%`, `Mercado Pago 17%`.
- **Columna derecha — tarjeta de cuenta predeterminada:** fondo `#16171b`, texto `#f4f3ef`, `border-radius: 16px`, `padding: 16px`.
  - Fila superior: marcador ③ + tipo de cuenta (`Efectivo`, `10.5px` uppercase `#9b9da5`) a la izquierda; chip `PREDETERMINADA` a la derecha (fondo `#2a2b31`, `border-radius: 4px`, `padding: 3px 7px`, `9.5px/600`, `letter-spacing: 0.06em`).
  - Nombre `Efectivo` (`14px/600`), monto `$250.000` (Sora 600, `20px`, `letter-spacing: -0.03em`, tabular-nums).
  - Fila de acciones (`margin-top: 14px`, `gap: 8px`): marcador ④ + botón `Reajustar saldo` (`flex: 1`, `height: 32px`, borde `1px solid #2a2b31`, `border-radius: 10px`, `12px/600`); marcador ⑤ + botón `⋯` (`32×32`, mismo borde, `border-radius: 8px`, glifo `#b6b8c0` a `15px`).
  - Debajo, fila `Archivadas (1)`: fondo `#f0eee6`, `border-radius: 16px`, `padding: 14px 16px`, marcador ⑥ + texto `12.5px #63656d` + nota `no suman al total` (`11.5px #a3a5ab`) + chevron `⌄` a la derecha.
- **Marcadores dentro de la maqueta:** círculos `18px`. Sobre fondo claro: fondo `#2b3fd6`, texto `#ffffff`. Sobre la tarjeta oscura: fondo `#f4f3ef`, texto `#16171b`. Tipografía `10.5px/600`.

**Leyenda** — grid `repeat(auto-fit, minmax(270px, 1fr))`, `gap: 12px 26px`. Cada ítem: fila flex `gap: 10px` con círculo `20px` (fondo `#e7e9fb`, texto `#2b3fd6`, `11px/600`, `margin-top: 2px`, `flex-shrink: 0`) + párrafo `13px`, `line-height: 1.55`, `#63656d`, con el arranque en `<strong>` 600 `#16171b`.

| # | Copy |
| --- | --- |
| 1 | **El total.** La suma de tus cuentas activas. |
| 2 | **De qué está hecho.** La barra reparte el total por cuenta. |
| 3 | **Una tarjeta por cuenta.** Su nombre y su saldo de hoy. La oscura es la predeterminada. |
| 4 | **Reajustar saldo.** La acción principal: la usás cuando el número no coincide. |
| 5 | **El menú ⋯.** El resto de las acciones de esa cuenta. |
| 6 | **Archivadas y Últimas transferencias.** Se despliegan al tocarlas. |

#### 1.5 Sección "Cada acción, y qué le hace a tu saldo"

- H2 (igual al resto) + subtítulo `13px #82848c`: `Las dos primeras están al pie del total; el resto salen del menú ⋯ de una cuenta.`
- Contenedor `#fbfaf6`, `border-radius: 18px`, `padding: 8px 22px 22px`.
- Cada fila: grid `minmax(170px, 210px) minmax(0, 1fr)`, `gap: 6px 22px`, `padding: 16px 0`, separador inferior `1px solid #eeece4` (la última fila sin separador, `padding: 16px 0 4px`).
  - Columna izquierda: nombre de la acción (`14px/600`) + chip de efecto sobre el saldo (`inline-block`, `margin-top: 8px`, `border-radius: 4px`, `padding: 4px 8px`, `10.5px/600`).
  - Columna derecha: descripción `13.5px`, `line-height: 1.6`, `#63656d`, `text-wrap: pretty`.

Chips por tipo de efecto:
- Neutro / condicional: fondo `#e5e3da`, texto `#63656d`.
- Sin impacto o impacto informado: fondo `#e7e9fb`, texto `#2b3fd6`.
- Baja el total: fondo `#f5ead3`, texto `#7a5711`.
- Destructivo: fondo `#f7e2dd`, texto `#96301e` (y el nombre de la acción en `#c4402a`).

| Acción | Chip | Descripción |
| --- | --- | --- |
| Nueva cuenta | Depende de lo que elijas | Elegís el tipo, le ponés un nombre y declarás cuánto tenés hoy ahí. Si es tu primera cuenta y declarás menos que tu saldo, lo que sobra queda guardado en «Sin repartir» y el total no se mueve. Si ya tenés cuentas, decidís si esa plata sale de otra cuenta (el total no cambia) o es plata que la app no conocía (el total sube). La frase debajo del importe te dice, en vivo, en cuánto queda tu saldo. |
| Transferir entre cuentas | El total no cambia | Mover plata de una cuenta tuya a otra. No es gasto ni ingreso, así que no aparece en Movimientos. |
| Reajustar saldo | El total pasa a lo que declaraste | Decís cuánto tenés de verdad en esa cuenta. La diferencia queda en Movimientos como «Ajuste de saldo», o podés corregir el saldo con el que arrancó la cuenta. |
| Editar cuenta | El total no cambia | Cambiar el nombre o el tipo. El saldo se toca desde Reajustar saldo. |
| Hacer predeterminada | El total no cambia | La cuenta que viene elegida cada vez que cargás algo nuevo. |
| Ver movimientos | El total no cambia | Abre Movimientos filtrado por esa cuenta, con todo su historial. |
| Archivar | El total baja por su saldo | Para una cuenta que dejaste de usar. Deja de sumar al total, pero queda guardada con su historial y podés reactivarla. |
| Eliminar | Se borra el historial | Borra la cuenta con sus movimientos y transferencias. Si sólo querés dejar de usarla, archivala. |

El detalle largo de **Nueva cuenta** es intencional: cubre al usuario que cargó movimientos antes de crear su primera cuenta y necesita entender «Sin repartir». No acortarlo.

#### 1.6 Sección "Preguntas que aparecen seguido"

- H2 igual al resto. Grid `repeat(auto-fit, minmax(280px, 1fr))`, `gap: 12px`.
- Tarjeta: `#fbfaf6`, `border-radius: 18px`, `padding: 20px 22px`. Pregunta `14px/600` `text-wrap: pretty`; respuesta `13px`, `line-height: 1.6`, `#63656d`, `margin-top: 8px`.

| Pregunta | Respuesta |
| --- | --- |
| El saldo de la app no coincide con el de mi banco. | Reajustá esa cuenta y decí cuánto tenés de verdad. |
| ¿Una cuenta puede quedar en negativo? | Sí. Un banco en descubierto es plata real: el saldo se muestra en rojo y resta del total. |
| ¿Archivar o eliminar? | Archivar si dejaste de usar la cuenta pero querés conservar su historial. Eliminar sólo si la cargaste por error. |

#### 1.7 Sección "Cómo se llega" — **especificación, no contenido de la app**

Esta última sección del prototipo documenta el punto de entrada. **No se implementa dentro de la pantalla de ayuda**: describe el botón que hay que agregar en Cuentas. En el prototipo está separada por `border-top: 1px solid #e2e0d7` y `margin-top: 30px` justamente por ser meta-contenido.

Lo que sí hay que implementar es el botón que muestra:

- Va en el encabezado de la pantalla Cuentas, alineado con el título, al extremo derecho de la fila (`justify-content: space-between`, `align-items: flex-start`, `flex-wrap: wrap`, `gap: 18px`). El bloque de título usa `flex: 1 1 260px; min-width: 0` para que el botón nunca comprima la descripción.
- **Desktop — botón con texto:** `inline-flex`, `align-items: center`, `gap: 7px`, `height: 38px`, `padding: 0 15px`, borde `1px solid #d6d3c8`, `border-radius: 10px`, `12.5px/600`, color `#16171b`, `flex-shrink: 0`. Ícono: círculo `15px` con borde `1.5px solid #2b3fd6`, glifo `?` en `#2b3fd6` `10px/700`. Label: `Ayuda`.
- **Mobile — sólo ícono:** cuadrado `38×38`, mismo borde y radio, con el círculo `?` a `17px` (glifo `11px/700`). Se usa esta variante cuando el ancho no alcanza para el label.
- Hover/focus: no definido en el prototipo — aplicar el estado del sistema de botones secundarios del codebase.
- El botón navega a la ruta de la ayuda (push, no replace: el back debe volver a Cuentas).

---

## Interactions & Behavior

- **Navegación:** Cuentas → botón Ayuda → pantalla de ayuda (push). Miga de pan `← Cuentas` y el back del navegador vuelven a Cuentas.
- **Contenido estático:** la pantalla no tiene estado propio, ni fetch, ni formularios. Los montos de la maqueta (`$482.350`, `$250.000`, `52/31/17%`) son **ilustrativos y hardcodeados** — no leer datos reales del usuario: la maqueta explica la anatomía de la pantalla y debe verse igual para todos.
- **Scroll:** flujo vertical normal. Los anchors de cada `<h2>` son útiles para linkear a una sección, pero no hay índice ni nav sticky en este diseño.
- **Responsive:** todas las grillas colapsan por `auto-fit`/`minmax`. La única variante explícita es el botón de entrada (texto vs. sólo ícono).
- **Animaciones:** ninguna.

## State Management

Ninguno. Si el codebase usa un layout con título por pantalla, la ayuda es una vista más; no requiere store, contexto ni caché.

Los dos toggles del prototipo (`mostrarFaq`, `mostrarComoSeLlega`) y el selector `estiloBotonAyuda` son **controles del entorno de diseño**, no features de la app. En producción: FAQ siempre visible, "Cómo se llega" no se porta, y el estilo del botón lo decide el breakpoint.

## Design Tokens

**Colores**

| Uso | Hex |
| --- | --- |
| Fondo de página | `#efeee8` |
| Superficie de tarjeta | `#fbfaf6` |
| Superficie hundida / tarjeta interna | `#f0eee6` |
| Superficie oscura (cuenta predeterminada) | `#16171b` |
| Texto sobre superficie oscura | `#f4f3ef` |
| Texto principal | `#16171b` |
| Texto secundario | `#63656d` |
| Texto terciario / labels | `#82848c` |
| Texto cuaternario / notas | `#a3a5ab` |
| Acento (badges, links, ícono ?) | `#2b3fd6` |
| Acento hover / link visitado | `#1d2ea8` |
| Acento suave (fondo de badge) | `#e7e9fb` |
| Chip neutro | `#e5e3da` sobre texto `#63656d` |
| Chip advertencia | `#f5ead3` sobre texto `#7a5711` |
| Chip destructivo | `#f7e2dd` sobre texto `#96301e` |
| Texto destructivo | `#c4402a` |
| Borde de separador de fila | `#eeece4` |
| Borde de contenedor / botón | `#e2e0d7`, `#d6d3c8` |
| Borde sobre superficie oscura | `#2a2b31` |
| Texto atenuado sobre oscuro | `#9b9da5`, `#b6b8c0` |
| Barra de composición | `#1d8f7e`, `#2f6fb8`, `#b8862a` |

**Tipografía**
- Display / títulos: **Sora** 600 (Google Fonts, pesos 500/600/700).
- Texto: **Plus Jakarta Sans** 400–700 (Google Fonts).
- Escala: H1 `33px/1` `-0.035em` · H2 `19px` `-0.02em` · monto grande `30px` `-0.035em` · monto de cuenta `20px` `-0.03em` · título de tarjeta `15px/600` · nombre de acción y pregunta `14px/600` · descripción de acción `13.5px/1.6` · cuerpo `13px/1.55–1.6` · label eyebrow `11.5–12.5px` uppercase `0.12em` · marcador y chip `9.5–10.5px`.
- Montos siempre con `font-variant-numeric: tabular-nums`.
- Párrafos de cuerpo con `text-wrap: pretty`.

**Espaciado** — escala usada: 2, 4, 6, 7, 8, 10, 12, 14, 18, 20, 22, 26, 30, 32, 72 px. Gaps de grilla: `12px` y `14px`. Separación entre secciones: `18px` / `22px` / `30px`.

**Radios** — `4px` (chips) · `8px` (botón ⋯) · `10px` (botón) · `12px` (tarjeta anidada) · `16px` (tarjeta interna) · `18px` (tarjeta de sección) · `999px` (círculos y barra).

**Sombras** — ninguna. La jerarquía se construye sólo con superficies y bordes de `1px`.

## Assets

Ninguna imagen ni ícono de librería. Los tres glifos usados son caracteres de texto: `←` (volver), `⋯` (menú), `⌄` (desplegar), y el `?` del botón de ayuda es texto dentro de un círculo con borde. Si el codebase ya tiene un set de íconos, reemplazarlos por los equivalentes manteniendo los tamaños.

Fuentes vía Google Fonts:
`https://fonts.googleapis.com/css2?family=Sora:wght@500;600;700&family=Plus+Jakarta+Sans:wght@400;500;600;700&display=swap`

## Files

- `Ayuda Cuentas.dc.html` — el prototipo completo de la pantalla de ayuda (referencia principal). Abre en cualquier navegador junto a `support.js`.
- `support.js` — runtime del entorno de diseño; necesario sólo para abrir el prototipo, no se porta.
- `github.md` — repo, rama y mapa de los archivos del codebase que sirvieron de base para el contenido.

Archivos del repo `FernandezLeandro/MyFinances` (rama `accounts`) que describen la lógica documentada acá: `src/pages/Cuentas.tsx`, `src/features/accounts/aggregate.ts`, `AccountCard.tsx`, `AccountTotalCard.tsx`, `AccountActionsMenu.tsx`, `AdjustBalanceDialog.tsx`, `TransferDialog.tsx`, `AccountSecondaryLists.tsx`, `useAccountActions.ts`, `accountKind.ts`, `src/styles/theme.css`.

## Notas de implementación

1. El copy es definitivo y está en español rioplatense (voseo). No traducir ni reescribir.
2. Si el texto de la ayuda va a mantenerse en el tiempo, conviene extraerlo a un módulo de contenido (array de secciones / acciones / FAQ) y renderizar las grillas desde ahí, en vez de dejar 300 líneas de markup.
3. La tabla de acciones es la pieza que más se va a desactualizar: su fuente de verdad es `AccountActionsMenu.tsx` + `useAccountActions.ts`. Si se agrega o quita una acción del menú, hay que tocar también esta ayuda.
4. La ayuda de Cuentas es el primer caso de un patrón: cada pantalla con lógica propia puede tener su `/<pantalla>/ayuda` con esta misma estructura (encabezado, tres pasos, anatomía anotada, tabla de acciones, FAQ). Vale dejar el layout reutilizable.
