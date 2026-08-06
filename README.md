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

## Variables de entorno

A partir del Bloque 1, en `.env.local` (y en las variables de entorno de Cloudflare Pages):

```
VITE_SUPABASE_URL=
VITE_SUPABASE_ANON_KEY=
```

La `anon key` viaja en el bundle y eso es correcto: es una clave pública, y lo que protege los datos es
RLS. La `service_role key` **nunca** toca el front.

## Convenciones que no se rompen

- **La plata se opera en centavos enteros.** Todo pasa por `src/lib/money.ts`; ningún componente
  formatea importes a mano. En la DB los importes son `numeric(12,2)` — supabase-js los devuelve como
  *string*, y se convierten a centavos en la capa de queries.
- **El sistema de diseño vive en `src/styles/theme.css`.** El acento ácido se reserva para el dato
  principal y la serie primaria de un gráfico; las superficies se elevan por luminosidad, no por borde
  de 1px; ingreso = ácido, gasto = coral, nunca verde/rojo de semáforo.
- **El esquema de la DB se versiona en `supabase/migrations/`.** Si no está en un `.sql` del repo, no
  existe: nada de tocar el esquema desde el dashboard.

## Estado

Bloque 0 (esqueleto, sistema de diseño, shell y deploy) en curso, con datos de ejemplo en
`src/lib/mock.ts` que se eliminan en el Bloque 2.
