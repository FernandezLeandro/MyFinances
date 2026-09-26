# MyFinances

Finanzas personales día a día: ingresos y gastos con categoría, saldo actual, gastos fijos con
estado pago y —diferencia con planilla— **saldo real fin de ciclo** (mes, quincena o semana) después
descontar fijos que faltan pagar.

Multiusuario, datos aislados: cada cuenta tiene su propio saldo, movimientos, categorías y fijos. No
hay vistas compartidas.

## Objetivo

- **Fácil usar**, para gente que quiere sólo básico y también para quien quiere más detalle — por eso
  planes escalonados (ver [Planes](#planes) abajo).
- **Segura**: web pública, toda seguridad vive en políticas RLS de Postgres.
- **Con tests**: lógica de negocio (cálculos, agregaciones, ciclos) probada con Vitest.
- **Desarrollo activo**: se pule por bloques. Lo de abajo anda de punta a punta, pero ninguna pantalla
  es versión final.

## Qué se puede hacer hoy

Cada punto dice entre paréntesis desde qué plan está disponible — ver [Planes](#planes).

- **Hoy** (todos planes): saldo del ciclo (Básico ve resumen de fijos en su lugar), saldo proyectado
  fin de ciclo, próximos vencimientos y detalle de gastos por categoría.
- **Fijos** (todos planes): gastos fijos una vez al mes, o "bolsas" con frecuencia propia
  (mensual/quincenal/semanal). Pagar, guardar de a poco para uno, pausar, editar.
- **Movimientos** (todos planes, carga manual desde Test): filtros por tipo/categoría/cuenta/
  búsqueda, resumen del período, exportar a CSV, gasto compartido con otra persona (Premium).
- **Análisis** (Test y Premium): gasto del período con variación vs. anterior, distribución por
  categoría, fijo vs. variable, promedios mensuales.
- **Mis Deudas** (Premium): tarjetas de crédito en cuotas y compras sueltas, con guardado previo.
- **Me Deben** (Premium): plata prestada a otras personas, con abonos parciales.
- **Ahorros** (Premium): ítems multi-activo (pesos, dólares, cripto, acciones), con metas opcionales.
- **Cuentas** (Test y Premium): efectivo, billeteras virtuales y bancos. Saldo de app es suma de
  cuentas activas: archivar una la saca del saldo hasta reactivarse. Transferencias entre cuentas (se
  ven en Movimientos, sin sumar como gasto ni ingreso), eliminar (con sus movimientos) y reajustar
  saldo de cuenta a pedido — como movimiento de ajuste o corrigiendo saldo inicial. Crear cuenta no
  mueve saldo salvo que se pida: primera viene con saldo actual y lo no declarado queda en cuenta
  «Sin repartir»; siguientes pueden salir de otra cuenta.
- **Categorías** (todos planes): propias por cuenta, con catálogo por defecto al darse de alta.
- **Ajustes**: ciclo (mensual/quincenal/semanal); apariencia; seguridad. Dólar en uso y catálogo de
  activos son Premium.
- **Administración** (rol admin): categorías por defecto, catálogo de activos, códigos de invitación,
  gestión de usuarios (plan, rol, borrado de cuentas).
- **General**: alta sólo por invitación, PWA instalable, claro/oscuro, ocultar importes.

**Qué no hace, por ahora:** sincronización con bancos ni importación de resúmenes, notificaciones,
cuentas compartidas entre usuarios. Movimientos son en pesos — dólar y otras monedas sólo aparecen en
Ahorros.

## Planes

Dos conceptos separados: **plan** (qué ve y qué puede hacer la cuenta) y **rol** (si es cuenta usuario
o administración). Fuente de verdad de qué habilita cada plan es `src/features/access/plan.ts`.

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


## Stack

- **Vite 8 + React 19 + TypeScript 6** (`strict`) — SPA, build estático.
- **Tailwind CSS v4** con tokens propios en `src/styles/theme.css` (sistema "Bento").
- **React Router v8** (declarativo), **TanStack Query**, **React Hook Form + Zod**.
- **Recharts** para gráficos, **Motion** para microinteracciones, **date-fns** para períodos.
- **Supabase** (Postgres + Auth + RLS) único backend — sin funciones serverless propias.
- **dolarapi.com** y **CoinGecko** para cotizaciones, consumidas directo desde cliente.
- **vite-plugin-pwa** para manifest y service worker.
- **Cloudflare Pages** para deploy, **GitHub Actions** para CI, Node 22 (`.nvmrc`).

Sin backend propio: SPA habla directo con Supabase y **toda seguridad vive en políticas RLS de
Postgres**. Ninguna tabla queda sin RLS.

## Seguridad

Web pública y repositorio también público — nada de esto es sólo interno:

- **RLS en todas las tablas**, mismo patrón: `user_id = auth.uid()` en select/insert/update/
  delete.
- **Funciones `security definer` acotadas**: sólo para lo que RLS no resuelve (catálogos globales,
  validar código de invitación antes de loguearse), siempre con `search_path` fijo y validando
  `auth.uid()`/rol de admin.
- **Alta sólo por invitación**: perfil sólo se crea a través de `rpc_redeem_invite_code` — no hay alta
  libre.
- **`plan` y `role` no se pueden autoasignar**: columnas sin permiso de escritura para cliente.
- **Manejo de claves**: `anon key` viaja en bundle a propósito (es pública, la protege RLS);
  `service_role key` nunca toca frontend.
- Configuración de Auth que no vive en repo (Site URL, allow-list de redirects, SMTP) documentada en
  [`docs/supabase-auth.md`](docs/supabase-auth.md).

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

En `.env.local` (y en variables de entorno de Cloudflare Pages):

```
VITE_SUPABASE_URL=
VITE_SUPABASE_ANON_KEY=
VITE_SITE_URL=          # opcional
```

`anon key` viaja en bundle y eso está bien: clave pública, lo que protege datos es RLS.
`service_role key` **nunca** toca el front.

`VITE_SITE_URL` es dominio con que se arman links que Supabase manda por mail (recuperar contraseña).
Si no está definida se usa `window.location.origin`, así en dev local no hace falta tocarla; en
Cloudflare Pages se setea **sólo en Production**, para que un preview no genere links que vuelvan al
preview. Ojo: esto decide qué dominio pide la app, no cuál acepta Supabase — allow-list del proyecto y
resto de config de Auth están en **[`docs/supabase-auth.md`](docs/supabase-auth.md)**, primero a
revisar si link de mail termina en `localhost`.

## Base de datos

Esquema se versiona en `supabase/migrations/` y se aplica al único proyecto Supabase que existe (no
hay staging) con `npx supabase db push --linked` — se corre sólo con pedido explícito, nunca por
iniciativa propia de sesión Claude.

`src/lib/database.types.ts` se mantiene **a mano**, en sync con cada migración (no hay `supabase gen
types` corriendo todavía). Cada tabla nueva necesita `Relationships: []` en su definición — sin eso,
postgrest-js colapsa todo `Database` a `never` en silencio.

## Tests

Vitest, configurado inline en `vite.config.ts` (no hay `vitest.config.ts` aparte — así alias `@/` y
plugins de Vite se comparten sin duplicar nada), en entorno `node`. Alcance a propósito: **sólo
funciones y módulos puros**, sin React ni DOM. Tests viven al lado del módulo que prueban (`foo.ts` +
`foo.test.ts`), cubriendo hoy sobre todo `src/lib/` (dinero, ciclos, toasts, errores) y agregaciones
de cada feature (`src/features/*/aggregate.ts`, `period.ts`). Fixtures tipadas compartidas en
`src/test/factories.ts`.

Nada de jsdom ni Testing Library todavía: hooks de React y componentes se verifican a mano en
navegador antes de cada cambio (con cuenta de prueba), no tienen test de regresión automático — si
tocás alguno, volvé a probarlo en navegador, no lo agarra el CI.

Toda lógica nueva o modificada se testea, y todo bug real corregido deja test de regresión con
comentario que explica qué rompía.

## CI

`.github/workflows/ci.yml` corre en cada push a `main` y en cada PR: `lint` → `test` → `build`, en ese
orden. Job se llama `verify` — para que bloquee merges de verdad (hoy sólo informa, no impide
mergear) hace falta marcarlo *required status check* en protección de rama de `main`, en
Settings → Branches.

## Convenciones que no se rompen

- **Plata se opera en centavos enteros.** Todo pasa por `src/lib/money.ts`; ningún componente formatea
  importes a mano. En DB importes son `numeric(12,2)` — supabase-js los devuelve como *string*, se
  convierten a centavos en capa de queries.
- **Sistema de diseño ("Bento") vive en `src/styles/theme.css`.** Papel cálido claro con azul tinta
  como único acento (con contraparte oscura); acento se reserva para dato principal, CTAs y serie
  primaria de gráfico; tarjetas sin sombra ni borde, separación por color de superficie; ingreso =
  acento, gasto = coral, nunca verde/rojo de semáforo.
- **Esquema de DB se versiona en `supabase/migrations/`.** Si no está en `.sql` del repo, no existe:
  nada de tocar esquema desde el dashboard.
- **Migraciones son sólo esquema (DDL) y datos de catálogo que toda instancia necesita para
  funcionar** (categorías por defecto, activos base, código de invitación semilla). Cualquier cosa
  atada a un `uuid`, email o sesión concreta — promover cuenta a admin, limpiar datos de prueba —
  **no es migración**: va a `supabase/seed.sql` (CLI lo corre sólo en `db reset`, no se aplica en
  remoto) o se corre a mano desde dashboard, anotándolo en el PR.
- **Cada función nueva declara explícitamente a qué plan pertenece** en `src/features/access/plan.ts`
  (ver [Planes](#planes)) — no queda implícito en qué ruta la muestra.