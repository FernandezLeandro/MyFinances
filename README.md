# MyFinances

Finanzas personales del día a día: ingresos y gastos con categoría, saldo actual, gastos fijos con
estado de pago y —lo que la diferencia de una planilla— **el saldo con el que realmente terminás el
ciclo** (mes, quincena o semana, según lo que elijas) una vez descontados los fijos que todavía
quedan por pagar.

Multiusuario con datos totalmente aislados: cada cuenta lleva su propio saldo, sus movimientos, sus
categorías y sus fijos. No hay vistas compartidas.

## Objetivo

- **Sencilla de usar**, para gente que sólo quiere controlar lo básico y también para quien quiere
  más detalle — de ahí los planes escalonados (ver [Planes](#planes) abajo).
- **Segura**: es una web pública, y toda la seguridad vive en las políticas RLS de Postgres.
- **Con tests**: la lógica de negocio (cálculos, agregaciones, ciclos) se prueba con Vitest.
- **En desarrollo activo**: se pule por bloques. Lo que hay abajo anda de punta a punta, pero no es
  la versión final de ninguna pantalla.

## Qué se puede hacer hoy

Cada punto indica entre paréntesis desde qué plan está disponible — ver [Planes](#planes).

- **Hoy** (todos los planes): saldo del ciclo (Básico ve un resumen de fijos en su lugar), saldo
  proyectado a fin de ciclo, próximos vencimientos y el detalle de gastos por categoría.
- **Fijos** (todos los planes): gastos fijos de una vez al mes, o "bolsas" con su propia frecuencia
  (mensual/quincenal/semanal). Pagar, guardar de a poco para uno, pausar, editar.
- **Movimientos** (todos los planes, carga manual desde Test): filtros por tipo/categoría/cuenta/
  búsqueda, resumen del período, exportar a CSV, gasto compartido con otra persona (Premium).
- **Análisis** (Test y Premium): gasto del período con variación vs. el anterior, distribución por
  categoría, fijo vs. variable, promedios mensuales.
- **Mis Deudas** (Premium): tarjetas de crédito en cuotas y compras sueltas, con guardado previo.
- **Me Deben** (Premium): plata prestada a otras personas, con abonos parciales.
- **Ahorros** (Premium): ítems multi-activo (pesos, dólares, cripto, acciones), con metas opcionales.
- **Cuentas** (Test y Premium): efectivo, billeteras virtuales y bancos. El saldo de la app es la suma
  de las cuentas activas: archivar una la saca del saldo hasta que se reactiva. Transferencias entre
  cuentas, eliminar (con sus movimientos) y reajustar
  el saldo de una cuenta a pedido — como movimiento de ajuste o corrigiendo el saldo inicial.
- **Categorías** (todos los planes): propias por cuenta, con un catálogo por defecto al darse de alta.
- **Ajustes**: ciclo (mensual/quincenal/semanal); apariencia; seguridad. Dólar en uso y catálogo de
  activos son Premium.
- **Administración** (rol admin): categorías por defecto, catálogo de activos, códigos de invitación,
  gestión de usuarios (plan, rol, borrado de cuentas).
- **General**: alta sólo por invitación, PWA instalable, claro/oscuro, ocultar importes.

**Lo que no hace, por ahora:** sincronización con bancos ni importación de resúmenes, notificaciones,
cuentas compartidas entre usuarios. Los movimientos son en pesos — el dólar y otras monedas sólo
aparecen en Ahorros.

## Planes

Hay dos conceptos separados: **plan** (qué ve y qué puede hacer la cuenta) y **rol** (si es cuenta de
usuario o de administración). La fuente de verdad de qué habilita cada plan es
`src/features/access/plan.ts`.

| | Básico | Test | Premium |
|---|:---:|:---:|:---:|
| Hoy, Fijos | ✓ | ✓ | ✓ |
| Movimientos (sólo lectura de lo que generan fijos/sueldo) | ✓ | | |
| Movimientos (carga manual) | | ✓ | ✓ |
| Análisis | | ✓ | ✓ |
| Mis Deudas, Me Deben, Ahorros | | | ✓ |
| Cuentas y transferencias | | ✓ | ✓ |
| Gasto compartido | | | ✓ |
| Ajustes completos (dólar, activos) | | | ✓ |

El plan lo fija el código de invitación con el que se registra una cuenta, y sólo un admin puede
cambiarlo después (`/admin/usuarios`). Ninguna cuenta puede cambiarse su propio plan ni su rol.

**El plan es una decisión de interfaz, no de seguridad**: hoy ninguna política RLS mira `plan`, así
que habilitar una función nueva para un plan es mover un string en `plan.ts`, sin tocar la base.

## Stack

- **Vite 8 + React 19 + TypeScript 6** (`strict`) — SPA, build estático.
- **Tailwind CSS v4** con tokens propios en `src/styles/theme.css` (sistema "Bento").
- **React Router v8** (declarativo), **TanStack Query**, **React Hook Form + Zod**.
- **Recharts** para gráficos, **Motion** para microinteracciones, **date-fns** para períodos.
- **Supabase** (Postgres + Auth + RLS) como único backend — sin funciones serverless propias.
- **dolarapi.com** y **CoinGecko** para cotizaciones, consumidas directo desde el cliente.
- **vite-plugin-pwa** para el manifest y el service worker.
- **Cloudflare Pages** para el deploy, **GitHub Actions** para CI, Node 22 (`.nvmrc`).

Sin backend propio: la SPA habla directo con Supabase y **toda la seguridad vive en las políticas RLS
de Postgres**. Ninguna tabla queda sin RLS.

## Seguridad

Es una web pública y el repositorio también lo es — nada de esto es sólo interno:

- **RLS en todas las tablas**, con el mismo patrón: `user_id = auth.uid()` en select/insert/update/
  delete.
- **Funciones `security definer` acotadas**: sólo para lo que RLS no puede resolver (catálogos
  globales, validar un código de invitación antes de loguearse), siempre con `search_path` fijo y
  validando `auth.uid()`/rol de admin.
- **Alta sólo por invitación**: un perfil sólo se crea a través de `rpc_redeem_invite_code` — no hay
  alta libre.
- **`plan` y `role` no se pueden autoasignar**: son columnas sin permiso de escritura para el cliente.
- **Manejo de claves**: la `anon key` viaja en el bundle a propósito (es pública, la protege RLS); la
  `service_role key` nunca toca el frontend.
- La configuración de Auth que no vive en el repo (Site URL, allow-list de redirects, SMTP) está
  documentada en [`docs/supabase-auth.md`](docs/supabase-auth.md).

## Correrlo

```bash
npm install
npm run dev
```

| Script | Qué hace |
|---|---|
| `npm run dev` | Servidor de desarrollo |
| `npm run build` | `tsc -b` + build de producción en `dist/` |
| `npm run preview` | Sirve el build |
| `npm run lint` | oxlint |
| `npm run test` | Vitest, una corrida |
| `npm run test:watch` | Vitest en modo watch |
| `npm run test:coverage` | Vitest con reporte de cobertura |

## Variables de entorno

En `.env.local` (y en las variables de entorno de Cloudflare Pages):

```
VITE_SUPABASE_URL=
VITE_SUPABASE_ANON_KEY=
VITE_SITE_URL=          # opcional
```

La `anon key` viaja en el bundle y eso es correcto: es una clave pública, y lo que protege los datos es
RLS. La `service_role key` **nunca** toca el front.

`VITE_SITE_URL` es el dominio con el que se arman los links que Supabase manda por mail (recuperar
contraseña). Si no está definida se usa `window.location.origin`, así que en dev local no hace falta
tocarla; en Cloudflare Pages se setea **sólo en Production**, para que un preview no genere links que
devuelvan al preview. Ojo: esto decide qué dominio pide la app, no cuál acepta Supabase — la allow-list
del proyecto y el resto de la config de Auth están en **[`docs/supabase-auth.md`](docs/supabase-auth.md)**,
que es lo primero a revisar si un link de mail termina en `localhost`.

## Base de datos

El esquema se versiona en `supabase/migrations/` y se aplica al único proyecto de Supabase que existe
(no hay staging) con `npx supabase db push --linked` — se corre sólo con pedido explícito, nunca por
iniciativa propia de una sesión de Claude.

`src/lib/database.types.ts` se mantiene **a mano**, en sync con cada migración (no hay `supabase gen
types` corriendo todavía). Cada tabla nueva necesita `Relationships: []` en su definición — sin eso,
postgrest-js colapsa todo el `Database` a `never` en silencio.

## Tests

Vitest, configurado inline en `vite.config.ts` (no hay `vitest.config.ts` aparte — así el alias `@/`
y los plugins de Vite se comparten sin duplicar nada), en entorno `node`. Alcance deliberado: **sólo
funciones y módulos puros**, sin React ni DOM. Los tests viven al lado del módulo que prueban
(`foo.ts` + `foo.test.ts`), cubriendo hoy sobre todo `src/lib/` (dinero, ciclos, toasts, errores) y
las agregaciones de cada feature (`src/features/*/aggregate.ts`, `period.ts`). Las fixtures tipadas
compartidas están en `src/test/factories.ts`.

Nada de jsdom ni Testing Library todavía: los hooks de React y los componentes se verifican a mano en
el navegador antes de cada cambio (con una cuenta de prueba), no tienen test de
regresión automático — si tocás alguno, volvé a probarlo en el navegador, no lo va a agarrar el CI.

Toda lógica nueva o modificada se testea, y todo bug real que se corrige deja un test de regresión
con un comentario que explique qué rompía.

## CI

`.github/workflows/ci.yml` corre en cada push a `main` y en cada PR: `lint` → `test` → `build`, en ese
orden. El job se llama `verify` — para que bloquee merges de verdad (hoy sólo informa, no impide
mergear) hace falta marcarlo como *required status check* en la protección de rama de `main`, en
Settings → Branches.

## Convenciones que no se rompen

- **La plata se opera en centavos enteros.** Todo pasa por `src/lib/money.ts`; ningún componente
  formatea importes a mano. En la DB los importes son `numeric(12,2)` — supabase-js los devuelve como
  *string*, y se convierten a centavos en la capa de queries.
- **El sistema de diseño ("Bento") vive en `src/styles/theme.css`.** Papel cálido claro con azul tinta
  como único acento (con su contraparte oscura); el acento se reserva para el dato principal, CTAs y
  la serie primaria de un gráfico; las tarjetas no llevan sombra ni borde, la separación es por color
  de superficie; ingreso = acento, gasto = coral, nunca verde/rojo de semáforo.
- **El esquema de la DB se versiona en `supabase/migrations/`.** Si no está en un `.sql` del repo, no
  existe: nada de tocar el esquema desde el dashboard.
- **Las migraciones son sólo esquema (DDL) y datos de catálogo que toda instancia necesita para
  funcionar** (categorías por defecto, activos base, el código de invitación semilla). Cualquier cosa
  atada a un `uuid`, un email o una sesión concreta — promover una cuenta a admin, limpiar datos de
  prueba — **no es una migración**: va a `supabase/seed.sql` (el CLI lo corre sólo en `db reset`, no se
  aplica en remoto) o se corre a mano desde el dashboard, anotándolo en el PR.
- **Cada función nueva declara explícitamente a qué plan pertenece** en `src/features/access/plan.ts`
  (ver [Planes](#planes)) — no queda implícito en qué ruta la muestra.
