# MyFinances

Finanzas personales del día a día: ingresos y gastos con categoría, saldo actual, gastos fijos del mes
con estado de pago y —lo que la diferencia de una planilla— **el saldo con el que realmente terminás el
mes** una vez descontados los fijos que todavía quedan por pagar.

Multiusuario con datos totalmente aislados: cada cuenta lleva su propio saldo, sus movimientos, sus
categorías y sus fijos. No hay vistas compartidas.

## Stack

- **Vite 8 + React 19 + TypeScript 6** — SPA, build estático.
- **Tailwind CSS v4** con tokens propios en `src/styles/theme.css`.
- **React Router v8** (declarativo), **TanStack Query**, **React Hook Form + Zod**.
- **Recharts** para gráficos, **Motion** para microinteracciones, **date-fns** para períodos.
- **Supabase** (Postgres + Auth + RLS) como único backend.
- **Cloudflare Pages** para el deploy.

Sin backend propio: la SPA habla directo con Supabase y **toda la seguridad vive en las políticas RLS
de Postgres**. Ninguna tabla queda sin RLS.

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
```

La `anon key` viaja en el bundle y eso es correcto: es una clave pública, y lo que protege los datos es
RLS. La `service_role key` **nunca** toca el front.

## Tests

Vitest, configurado inline en `vite.config.ts` (no hay `vitest.config.ts` aparte — así el alias `@/`
y los plugins de Vite se comparten sin duplicar nada). Alcance deliberado: **sólo funciones y módulos
puros**, sin React ni DOM —`src/lib/money.ts`, `src/features/savings/aggregate.ts`, `src/lib/errors.ts`,
`src/lib/toast.ts`. Nada de jsdom ni Testing Library todavía: los hooks de React (`useAssetPrices`, el
`queryClient.clear()` de `AuthProvider`) y los componentes (`ToastHost`, el chunking de
`vite.config.ts`) se verifican a mano en el navegador antes de cada cambio, no tienen test de
regresión automático. Si tocás alguno de esos, volvé a probarlo en el navegador — no lo va a agarrar
el CI.

## CI

`.github/workflows/ci.yml` corre en cada push a `main` y en cada PR: `lint` → `test` → `build`, en ese
orden. El job se llama `verify` — para que bloquee merges de verdad (hoy sólo informa, no impide
mergear) hace falta marcarlo como *required status check* en la protección de rama de `main`, en
Settings → Branches.

## Convenciones que no se rompen

- **La plata se opera en centavos enteros.** Todo pasa por `src/lib/money.ts`; ningún componente
  formatea importes a mano. En la DB los importes son `numeric(12,2)` — supabase-js los devuelve como
  *string*, y se convierten a centavos en la capa de queries.
- **El sistema de diseño vive en `src/styles/theme.css`.** El acento ácido se reserva para el dato
  principal y la serie primaria de un gráfico; las superficies se elevan por luminosidad, no por borde
  de 1px; ingreso = ácido, gasto = coral, nunca verde/rojo de semáforo.
- **El esquema de la DB se versiona en `supabase/migrations/`.** Si no está en un `.sql` del repo, no
  existe: nada de tocar el esquema desde el dashboard.
- **Las migraciones son sólo esquema (DDL) y datos de catálogo que toda instancia necesita para
  funcionar** (categorías por defecto, activos base, el código de invitación semilla). Cualquier cosa
  atada a un `uuid`, un email o una sesión concreta — promover una cuenta a admin, limpiar datos de
  prueba — **no es una migración**: va a `supabase/seed.sql` (el CLI lo corre sólo en `db reset`, no se
  aplica en remoto) o se corre a mano desde el dashboard, anotándolo en el PR.

## Estado

Funcionalmente completo para su alcance: movimientos, fijos, análisis, patrimonio multi-activo y
administración (categorías por defecto, catálogo de activos, invitaciones) — las cinco secciones de
usuario y el panel de admin andan de punta a punta. La deuda técnica que quedaba (tests, CI, errores
de guardado silenciosos, peso del bundle) se fue cerrando en bloques; el estado de cada uno vive en el
historial de commits, no hace falta duplicarlo acá.
